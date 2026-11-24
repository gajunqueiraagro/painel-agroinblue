/**
 * NOTAS-RECEITA-A1-01 · F3.2 — A BUSCA NA RECEITA (Distribuição DF-e), a ordem dos passos da borda `fiscal-dfe-buscar`, PURA (banco, bucket,
 * cifra e rede entram por `Pecas`; o vitest prova a ordem e as recusas com peças falsas; o `index.ts` liga as reais). OK do Chat 16/11 14:43.
 *
 *  1. quem chama: o service_role (rotina futura) OU um usuário logado que pode (admin AgroinBlue ou gestor do cliente do titular);
 *  2. `ensaio: true` = faz tudo MENOS a chamada: abre e confere a credencial, monta o pedido, e NÃO grava nada (nem abre o pedido no banco);
 *  3. o pedido no banco (`fn_fiscal_dfe_pedido_abrir`): o relógio (1 h depois de 137/656) e um por vez;
 *  4. a credencial (`fn_fiscal_dfe_credencial` → o .pfx cifrado do bucket → decifra → `abrirCredencial`: titular, impressão, CADEIA ICP);
 *     recusou = fecha o pedido com a linha "não chamou" na trilha (com a cadeia) e NÃO fala com a Receita;
 *  5. UMA chamada (distNSU a partir do ult_nsu guardado). Nunca uma segunda página na mesma execução: quem continua é a próxima;
 *     sem resposta (rede, TLS, tempo) ou resposta que não se lê = fecha com "sem resposta"; o NSU NÃO anda;
 *  6. a resposta → documentos/eventos → o relógio (`depoisDaResposta`) → `fn_fiscal_dfe_registrar` (com a cadeia no detalhe).
 *  CONSULTA POR CHAVE (`chave`: 44 dígitos; Gabriel 17/11, caso-prova da Vera): o mesmo caminho, mas o pedido é consChNFe dessa chave;
 *     o NSU NÃO anda (registra com ult/max nulos), a espera de 1 h vale do mesmo jeito, os documentos do 138 gravam como na busca.
 *  ⚠ Nunca devolve nem loga a senha, a chave, o .pfx ou o XML; a resposta leva só contagens, cStat, NSUs e a cadeia (nomes e datas).
 */
import { type Ambiente, abrirDocZip, envelopeDistDFe, FRASE_DO_CSTAT, lerDocumento, lerRetornoDistDFe, respostaBruta, type EventoDaCaixa, type LinhaDaCaixa } from './distribuicaoDfe.ts';
import { depoisDaResposta } from './relogioDfe.ts';
import type { CadeiaConferida, ResultadoDaCredencial } from './credencialA1.ts';

/** código IBGE da UF (o cUFAutor do pedido) */
export const UF_IBGE: Record<string, number> = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53,
};

export interface TitularDaBusca { id: string; cliente_id: string }
export interface Credencial { certificadoId: string; documento: string; uf: string | null; objeto: string; senha: string; impressaoDigital: string }
export type PedidoAberto = { pode: true; ultNsu: bigint } | { pode: false; motivo: string; ate: string | null };
export interface RespostaHttp { status: number; corpo: string }
export interface Registro {
  titularId: string; cstat: string; ultNsu: bigint | null; maxNsu: bigint | null; naoAntesDe: string | null;
  documentos: LinhaDaCaixa[]; eventos: EventoDaCaixa[]; certificadoId: string; detalhe: Record<string, unknown>;
}
export interface Pecas {
  ehServico(token: string): boolean;
  autorDoToken(token: string): Promise<string | null>;
  lerTitular(id: string): Promise<TitularDaBusca | null>;
  podeBuscar(autor: string, clienteId: string): Promise<boolean>;
  abrirPedido(titularId: string): Promise<PedidoAberto>;
  fecharPedido(titularId: string, motivo: 'cadeia' | 'certificado' | 'conexao' | 'leitura', certificadoId: string | null, detalhe: Record<string, unknown>): Promise<void>;
  lerCredencial(titularId: string): Promise<Credencial>;
  baixarEDecifrar(objeto: string): Promise<Uint8Array>;
  abrirCredencial(bytes: Uint8Array, senha: string, esperado: { documento: string; impressaoDigital: string }): ResultadoDaCredencial;
  /** o POST com mTLS; lança em falha de rede/TLS/tempo */
  postarComCertificado(url: string, par: { cert: string; key: string }, envelope: string): Promise<RespostaHttp>;
  registrar(r: Registro): Promise<{ novos: number; atualizados: number; eventos: number }>;
  url(ambiente: Ambiente): string;
  agora(): Date;
}
export interface Pedido { token: string | null; titularId: string | null; ambiente: unknown; ensaio: unknown; chave?: unknown }

type Corpo = Record<string, unknown>;
export type Resposta = { status: 200 | 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502; corpo: Corpo };
const nao = (status: Resposta['status'], recusa: string, frase: string, extra: Corpo = {}): Resposta =>
  ({ status, corpo: { ok: false, recusa, frase, ...extra } });
const erroCurto = (e: unknown) => `${e instanceof Error ? e.name : typeof e}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400);
function resumoDaCadeia(c: CadeiaConferida | null) {
  if (!c) return null;
  if (c.ok === true) return { ok: true, caminho: c.caminho, raiz: c.raiz };
  return { ok: false, caminho: c.caminho, motivo: c.motivo };
}

export async function buscarDfe(p: Pedido, pecas: Pecas): Promise<Resposta> {
  /* 1. quem chama */
  if (!p.token) return nao(401, 'nao_logado', 'Entre de novo no sistema para buscar as notas.');
  const servico = pecas.ehServico(p.token);
  const autor = servico ? null : await pecas.autorDoToken(p.token);
  if (!servico && !autor) return nao(401, 'nao_logado', 'Entre de novo no sistema para buscar as notas.');
  if (!p.titularId) return nao(400, 'sem_titular', 'Escolha o produtor.');
  if (p.ambiente !== 'producao' && p.ambiente !== 'homologacao') return nao(400, 'ambiente', 'Diga o ambiente: "producao" ou "homologacao".');
  const ambiente: Ambiente = p.ambiente;
  const ensaio = p.ensaio === true;
  if (p.chave !== undefined && p.chave !== null && (typeof p.chave !== 'string' || !/^\d{44}$/.test(p.chave))) {
    return nao(400, 'chave', 'A chave da NF-e tem 44 dígitos.');
  }
  const chaveNFe = typeof p.chave === 'string' ? p.chave : null;
  const titular = await pecas.lerTitular(p.titularId);
  if (!titular) return nao(404, 'sem_titular', 'Produtor não encontrado.');
  if (autor && !(await pecas.podeBuscar(autor, titular.cliente_id))) return nao(403, 'sem_permissao', 'Só o administrador ou o gestor deste cliente busca as notas.');

  /* 3. o pedido (o ensaio não abre: não grava nada) */
  let ultNsu = 0n;
  if (!ensaio) {
    const aberto = await pecas.abrirPedido(titular.id);
    if (aberto.pode === false) {
      return nao(409, aberto.motivo, aberto.motivo === 'espera'
        ? 'A Receita só aceita a próxima busca deste produtor depois de 1 hora.' : 'Já há uma busca em andamento para este produtor.', { ate: aberto.ate });
    }
    ultNsu = aberto.ultNsu;
  }

  /* 4. a credencial */
  let cred: Credencial;
  let resultado: ResultadoDaCredencial;
  try {
    cred = await pecas.lerCredencial(titular.id);
    const bytes = await pecas.baixarEDecifrar(cred.objeto);
    resultado = pecas.abrirCredencial(bytes, cred.senha, { documento: cred.documento, impressaoDigital: cred.impressaoDigital });
  } catch (e) {
    if (!ensaio) await pecas.fecharPedido(titular.id, 'certificado', null, { ambiente, erro: erroCurto(e) });
    return nao(422, 'certificado', 'Não consegui abrir o certificado do cofre. Nada foi pedido à Receita.', { erro: erroCurto(e) });
  }
  const cadeia = resumoDaCadeia(resultado.cadeia);
  if (resultado.ok === false) {
    const motivo = resultado.recusa === 'cadeia' ? 'cadeia' : 'certificado';
    if (!ensaio) await pecas.fecharPedido(titular.id, motivo, cred.certificadoId, { ambiente, recusa: resultado.recusa, frase: resultado.frase, cadeia });
    return nao(422, motivo, `${resultado.frase} Nada foi pedido à Receita.`, { cadeia });
  }
  const uf = cred.uf ? UF_IBGE[cred.uf.toUpperCase()] : undefined;
  if (!uf) {
    if (!ensaio) await pecas.fecharPedido(titular.id, 'certificado', cred.certificadoId, { ambiente, erro: 'UF do produtor vazia', cadeia });
    return nao(422, 'uf', 'O cadastro do produtor não tem a UF. Nada foi pedido à Receita.', { cadeia });
  }
  const envelope = envelopeDistDFe({ ambiente, uf, documento: cred.documento,
    pedido: chaveNFe ? { tipo: 'consChNFe', chave: chaveNFe } : { tipo: 'distNSU', ultNsu } });
  const tipoDoPedido = chaveNFe ? 'consChNFe' : 'distNSU';
  if (ensaio) {
    return { status: 200, corpo: { ok: true, ensaio: true, ambiente, cadeia, uf, pedido: tipoDoPedido, ult_nsu: ultNsu.toString(), envelope_bytes: envelope.length,
      frase: 'Ensaio: o certificado abriu e a cadeia confere. Nada foi pedido à Receita e nada foi gravado.' } };
  }

  /* 5. UMA chamada */
  const detalheBase = { ambiente, cadeia, uf, pedido: tipoDoPedido };
  let http: RespostaHttp;
  try {
    http = await pecas.postarComCertificado(pecas.url(ambiente), resultado.par, envelope);
  } catch (e) {
    await pecas.fecharPedido(titular.id, 'conexao', cred.certificadoId, { ...detalheBase, erro: erroCurto(e) });
    return nao(502, 'conexao', 'A Receita não respondeu (conexão). Nada foi gravado além da trilha; o NSU não andou.', { erro: erroCurto(e) });
  }
  let lidos: { retorno: ReturnType<typeof lerRetornoDistDFe>; documentos: LinhaDaCaixa[]; eventos: EventoDaCaixa[]; outros: string[] };
  try {
    /* DFE-CONSCHNFE-SEM-NSU: na consulta pela chave o docZip vem sem NSU */
    const retorno = lerRetornoDistDFe(http.corpo, { semNsu: !!chaveNFe });
    const documentos: LinhaDaCaixa[] = []; const eventos: EventoDaCaixa[] = []; const outros: string[] = [];
    for (const d of retorno.docs) {
      const doc = lerDocumento(d, await abrirDocZip(d.base64));
      if (doc.tipo === 'nota') documentos.push(doc.linha);
      else if (doc.tipo === 'evento') eventos.push(doc.evento);
      else outros.push(doc.esquema);
    }
    lidos = { retorno, documentos, eventos, outros };
  } catch (e) {
    /* um documento que não se lê não pode ser pulado: o NSU não anda e nada da resposta é gravado */
    await pecas.fecharPedido(titular.id, 'leitura', cred.certificadoId, { ...detalheBase, http: http.status, erro: erroCurto(e), bruto: respostaBruta(http.corpo) });
    return nao(502, 'leitura', 'A resposta da Receita não se leu. Nada foi gravado além da trilha; o NSU não andou.', { http: http.status, erro: erroCurto(e) });
  }

  /* 6. o relógio e o registro */
  const { retorno } = lidos;
  const depois = depoisDaResposta({ ultNsu, maxNsu: ultNsu, naoAntesDe: null, ultimoCstat: null },
    { cStat: retorno.cStat, ultNsu: retorno.ultNsu, maxNsu: retorno.maxNsu }, pecas.agora());
  const so138 = retorno.cStat === '138';
  /* consulta por chave: o NSU não anda e a próxima busca espera 1 h, qualquer que seja a resposta */
  const umaHora = new Date(pecas.agora().getTime() + 3_600_000).toISOString();
  const andaNsu = !chaveNFe && (retorno.cStat === '138' || retorno.cStat === '137');
  const gravado = await pecas.registrar({
    titularId: titular.id, cstat: retorno.cStat,
    ultNsu: andaNsu ? depois.estado.ultNsu : null,
    maxNsu: andaNsu ? depois.estado.maxNsu : null,
    naoAntesDe: chaveNFe ? umaHora : depois.estado.naoAntesDe,
    documentos: so138 ? lidos.documentos : [], eventos: so138 ? lidos.eventos : [], certificadoId: cred.certificadoId,
    detalhe: { ...detalheBase, http: http.status, xMotivo: retorno.xMotivo, dhResp: retorno.dhResp, outros: lidos.outros, bruto: respostaBruta(http.corpo),
      continuar: depois.continuar },
  });
  if (chaveNFe) {
    return { status: 200, corpo: {
      ok: so138, pedido: 'consChNFe', cstat: retorno.cStat, frase: FRASE_DO_CSTAT[retorno.cStat] ?? `A Receita respondeu ${retorno.cStat}: ${retorno.xMotivo}`,
      xmotivo: retorno.xMotivo, ult_nsu: ultNsu.toString(), nao_antes_de: umaHora,
      documentos: lidos.documentos.length, eventos: lidos.eventos.length, outros: lidos.outros.length,
      esquemas: retorno.docs.map((d) => d.esquema), ...gravado, cadeia } };
  }
  return { status: 200, corpo: {
    ok: !depois.parouPorErro, cstat: retorno.cStat, frase: FRASE_DO_CSTAT[retorno.cStat] ?? `A Receita respondeu ${retorno.cStat}: ${retorno.xMotivo}`,
    ult_nsu_antes: ultNsu.toString(), ult_nsu: depois.estado.ultNsu.toString(), max_nsu: depois.estado.maxNsu.toString(),
    ha_mais: depois.continuar, nao_antes_de: depois.estado.naoAntesDe,
    documentos: lidos.documentos.length, eventos: lidos.eventos.length, outros: lidos.outros.length, ...gravado, cadeia } };
}
