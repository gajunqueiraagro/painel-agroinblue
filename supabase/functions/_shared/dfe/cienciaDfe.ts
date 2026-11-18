/**
 * NOTAS-RECEITA · CIÊNCIA DA OPERAÇÃO (210210) — a ORDEM de um envio, pura (rede, cofre e banco entram por `PecasCiencia`, provados no vitest).
 * FASE 0 18/11 09:14; desenho da Lambda v2 aprovado pelo Gabriel. UM evento por chamada, uma chave, um titular.
 *  1. quem chama (token do usuário: admin ou gestor do cliente; ou a service_role) → 2. a chave → 3. o titular → 4. a credencial do cofre
 *  → 5. o envelope assinado (`envelopeCiencia`) → (ensaio para aqui: nada pedido, nada gravado) → 6. UM POST pela Lambda → 7. a leitura do
 *  retEnvEvento → 8. a TRILHA (`fiscal_dfe_eventos`, aceito OU recusado, com a resposta crua).
 * ⚠ Não loga corpo, senha, chave privada, .pfx nem XML de nota. A resposta do evento não traz o XML da nota.
 */
import type { Ambiente } from './distribuicaoDfe.ts';
import type { Credencial, TitularDaBusca } from './buscarDfe.ts';
import type { ResultadoDaCredencial } from './credencialA1.ts';
import { comCiencia, envelopeCiencia, lerRetornoEvento } from './eventoCiencia.ts';

export interface RegistroDoEvento {
  titularId: string; chave: string; ambiente: Ambiente; cStatLote: string | null; cStat: string | null; xMotivo: string | null;
  nProt: string | null; dhRegistro: string | null; falha: string | null; via: 'manual' | 'automatica'; autor: string | null;
  certificadoId: string | null; bruto: string | null;
}
export interface PecasCiencia {
  ehServico(token: string): boolean;
  autorDoToken(token: string): Promise<string | null>;
  lerTitular(id: string): Promise<TitularDaBusca | null>;
  podeBuscar(autor: string, clienteId: string): Promise<boolean>;
  lerCredencial(titularId: string): Promise<Credencial>;
  baixarEDecifrar(objeto: string): Promise<Uint8Array>;
  abrirCredencial(bytes: Uint8Array, senha: string, esperado: { documento: string; impressaoDigital: string }): ResultadoDaCredencial;
  /** o POST com mTLS pela Lambda (destino fixo da Recepção de Evento); lança em falha de rede/TLS/tempo */
  postarEvento(ambiente: Ambiente, par: { cert: string; key: string }, envelope: string): Promise<{ status: number; corpo: string }>;
  registrarEvento(r: RegistroDoEvento): Promise<{ id: number; com_ciencia: boolean }>;
  agora(): Date;
}
export interface PedidoCiencia { token: string | null; titularId: string | null; ambiente: unknown; chave: unknown; ensaio?: unknown; via?: unknown }
type Corpo = Record<string, unknown>;
export type RespostaCiencia = { status: 200 | 400 | 401 | 403 | 404 | 422 | 500 | 502; corpo: Corpo };
const nao = (status: RespostaCiencia['status'], recusa: string, frase: string, extra: Corpo = {}): RespostaCiencia =>
  ({ status, corpo: { ok: false, recusa, frase, ...extra } });
const erroCurto = (e: unknown) => `${e instanceof Error ? e.name : typeof e}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400);

export async function cienciaDfe(p: PedidoCiencia, pecas: PecasCiencia): Promise<RespostaCiencia> {
  /* 1. quem chama */
  if (!p.token) return nao(401, 'nao_logado', 'Entre de novo no sistema para dar ciência.');
  const servico = pecas.ehServico(p.token);
  const autor = servico ? null : await pecas.autorDoToken(p.token);
  if (!servico && !autor) return nao(401, 'nao_logado', 'Entre de novo no sistema para dar ciência.');
  if (!p.titularId) return nao(400, 'sem_titular', 'Escolha o produtor.');
  if (p.ambiente !== 'producao' && p.ambiente !== 'homologacao') return nao(400, 'ambiente', 'Diga o ambiente: "producao" ou "homologacao".');
  const ambiente: Ambiente = p.ambiente;
  /* 2. a chave */
  if (typeof p.chave !== 'string' || !/^\d{44}$/.test(p.chave)) return nao(400, 'chave', 'A chave da NF-e tem 44 dígitos.');
  const chave = p.chave;
  const ensaio = p.ensaio === true;
  /* a automática só pela service_role (a rotina); pelo usuário é sempre manual */
  const via: 'manual' | 'automatica' = servico && p.via === 'automatica' ? 'automatica' : 'manual';
  /* 3. o titular */
  const titular = await pecas.lerTitular(p.titularId);
  if (!titular) return nao(404, 'sem_titular', 'Produtor não encontrado.');
  if (autor && !(await pecas.podeBuscar(autor, titular.cliente_id))) return nao(403, 'sem_permissao', 'Só o administrador ou o gestor deste cliente dá ciência.');

  const base = { titularId: titular.id, chave, ambiente, via, autor, cStatLote: null, cStat: null, xMotivo: null, nProt: null, dhRegistro: null, bruto: null };
  /* 4. a credencial */
  let cred: Credencial;
  let resultado: ResultadoDaCredencial;
  try {
    cred = await pecas.lerCredencial(titular.id);
    resultado = pecas.abrirCredencial(await pecas.baixarEDecifrar(cred.objeto), cred.senha, { documento: cred.documento, impressaoDigital: cred.impressaoDigital });
  } catch (e) {
    if (!ensaio) await pecas.registrarEvento({ ...base, falha: 'certificado', certificadoId: null });
    return nao(422, 'certificado', 'Não consegui abrir o certificado do cofre. Nada foi enviado à Receita.', { erro: erroCurto(e) });
  }
  if (resultado.ok === false) {
    if (!ensaio) await pecas.registrarEvento({ ...base, falha: resultado.recusa, certificadoId: cred.certificadoId });
    return nao(422, resultado.recusa === 'cadeia' ? 'cadeia' : 'certificado', `${resultado.frase} Nada foi enviado à Receita.`);
  }
  /* 5. o envelope assinado */
  const agora = pecas.agora();
  const { envelope, id } = envelopeCiencia({ ambiente, documento: cred.documento, chave, agora, idLote: String(agora.getTime()).slice(-15), par: resultado.par });
  if (ensaio) {
    return { status: 200, corpo: { ok: true, ensaio: true, ambiente, id, envelope_bytes: envelope.length,
      frase: 'Ensaio: o certificado abriu e o evento foi montado e assinado. Nada foi enviado à Receita e nada foi gravado.' } };
  }
  /* 6. UMA chamada */
  let http: { status: number; corpo: string };
  try {
    http = await pecas.postarEvento(ambiente, resultado.par, envelope);
  } catch (e) {
    await pecas.registrarEvento({ ...base, falha: 'conexao', certificadoId: cred.certificadoId });
    return nao(502, 'conexao', 'A Receita não respondeu (conexão). A ciência não foi registrada; tente de novo.', { erro: erroCurto(e) });
  }
  const bruto = http.corpo.slice(0, 20_000);
  /* 7. a leitura */
  let ret: ReturnType<typeof lerRetornoEvento>;
  try {
    ret = lerRetornoEvento(http.corpo);
  } catch (e) {
    await pecas.registrarEvento({ ...base, falha: 'leitura', certificadoId: cred.certificadoId, bruto });
    return nao(502, 'leitura', 'A resposta da Receita não se leu. Veja a trilha do evento.', { http: http.status, erro: erroCurto(e) });
  }
  /* 8. a trilha (aceito ou recusado) */
  const gravado = await pecas.registrarEvento({ ...base, cStatLote: ret.cStatLote, cStat: ret.cStat, xMotivo: ret.xMotivo ?? ret.xMotivoLote,
    nProt: ret.nProt, dhRegistro: ret.dhRegEvento, falha: null, certificadoId: cred.certificadoId, bruto });
  return { status: 200, corpo: {
    ok: comCiencia(ret.cStat), http: http.status, cstat_lote: ret.cStatLote, xmotivo_lote: ret.xMotivoLote, cstat: ret.cStat, xmotivo: ret.xMotivo,
    n_prot: ret.nProt, dh_registro: ret.dhRegEvento, evento_id: gravado.id, com_ciencia: gravado.com_ciencia,
    frase: comCiencia(ret.cStat) ? 'Ciência registrada na Receita. A nota completa (XML) vem na próxima busca ou pela consulta da chave.'
      : `A Receita recusou a ciência: ${ret.cStat ?? ret.cStatLote ?? '?'} — ${ret.xMotivo ?? ret.xMotivoLote ?? 'sem motivo'}.` } };
}
