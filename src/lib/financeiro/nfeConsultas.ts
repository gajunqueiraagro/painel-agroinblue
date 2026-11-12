/**
 * AS CONSULTAS DO "NOVO A PARTIR DE XML" — FIN-NFE-XML-01d. O que a tela precisa do BANCO para propor o lancamento de uma
 * nota. Um lugar so': nenhuma tela faz estas consultas por conta propria. (O leitor e a proposta sao puros e moram em
 * `src/lib/financeiro/nfe/`; isto aqui fala com o supabase e por isso fica fora daquela pasta.)
 */
import { supabase } from '@/integrations/supabase/client';
import { lerResolucoesDoBanco } from '@/v2/lib/importLanc/importLancamentosView';
import { soDigitos } from '@/lib/financeiro/nfe/formatos';
import type { UltimaClassificacao } from '@/lib/financeiro/nfe/proporLancamento';
import { notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import { validarDocumento } from '@/lib/fornecedores/documentoFiscal';
import { completarPeloEmitente, type CampoDoEmitente } from '@/lib/fornecedores/cadastroDoFornecedor';
import type { EmitenteNFe } from '@/lib/financeiro/nfe/tipos';
import { lerJaLancados, type LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';
import type { LiberacaoDireta } from '@/lib/financeiro/nfe/notaXLancamento';
import type { CadastroParaComparar } from '@/lib/fornecedores/compararCadastro';
import { lerResultadoCompletar, type ResultadoCompletar } from '@/lib/financeiro/nfe/notaCompletar';

/** Onde uma nota ja' esta' registrada — uma linha de `fn_documento_chave_ja_registrada`. */
export interface OcorrenciaDaNota {
  origem: 'lancamento' | 'oc';
  documentoId: string;
  lancamentoId: string | null;
  operacaoId: string | null;
  operacaoTipo: string | null;
  numero: string | null;
  descricao: string | null;
  data: string | null;
  valor: number | null;
}

const texto = (o: object, chave: string): string | null => {
  const v: unknown = Reflect.get(o, chave);
  return typeof v === 'string' && v ? v : null;
};

/**
 * P146 (Gabriel 27/10/2026) — A RESPOSTA DE UMA CONSULTA QUE DECIDE (criar ou nao; cadastro novo ou existente): "FALHOU" NUNCA VIRA "VAZIO".
 * Antes a falha devolvia lista vazia / nulo, e a previa tratava "nao consegui verificar" igual a "nao achei" e oferecia "Criar" (Neosolar,
 * NF 65.089, 27/10 11:01: 10 parcelas criadas por cima de 6 lancamentos da nota ja' lancados). Quem chama mostra o motivo e trava o gesto.
 */
export type Consulta<T> = { ok: true; valor: T } | { ok: false; motivo: string };
const deu = <T>(valor: T): Consulta<T> => ({ ok: true, valor });
/** O motivo da falha em FRASE PRONTA (OC-ABRIR-LENTO-01: o erro do banco nunca vai cru a' tela; o texto cru vai ao console). */
export function motivoDoErro(erro: unknown): string {
  const m: unknown = erro && typeof erro === 'object' ? Reflect.get(erro, 'message') : null;
  const c: unknown = erro && typeof erro === 'object' ? Reflect.get(erro, 'code') : null;
  const t = typeof m === 'string' ? m.toLowerCase() : '';
  if (t.includes('timeout') || t.includes('canceling statement') || c === '57014') return 'o banco demorou demais para responder';
  if (t.includes('failed to fetch') || t.includes('network') || t.includes('load failed')) return 'sem conexão com o servidor';
  if (c === '42501' || t.includes('permission') || t.includes('sem acesso')) return 'sem permissão para consultar';
  return 'a consulta ao banco não respondeu';
}
const falhou = (erro: unknown): { ok: false; motivo: string } => {
  if (erro) console.error('[P146] consulta da nota falhou', erro);
  return { ok: false, motivo: motivoDoErro(erro) };
};

/** "Esta chave ja' esta' registrada neste cliente?" — o dono e' o banco (FIN-NFE-XML-01b1). P146: falha = `{ ok: false }`, nunca lista vazia. */
export async function notaJaRegistrada(clienteId: string, chave: string): Promise<Consulta<OcorrenciaDaNota[]>> {
  try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_documento_chave_ja_registrada', { p_cliente: clienteId, p_chave: chave });
  if (error) return falhou(error);
  if (data == null) return deu([]);   // sem erro e sem linhas: nenhuma ocorrencia (nao e' falha)
  if (!Array.isArray(data)) return falhou(null);
  const saida: OcorrenciaDaNota[] = [];
  for (const linha of data) {
    if (!linha || typeof linha !== 'object') continue;
    const origem = texto(linha, 'origem');
    const documentoId = texto(linha, 'documento_id');
    if ((origem !== 'lancamento' && origem !== 'oc') || !documentoId) continue;
    const valor: unknown = Reflect.get(linha, 'valor');
    saida.push({
      origem, documentoId, lancamentoId: texto(linha, 'lancamento_id'), operacaoId: texto(linha, 'operacao_id'),
      operacaoTipo: texto(linha, 'operacao_tipo'), numero: texto(linha, 'numero'), descricao: texto(linha, 'descricao'),
      data: texto(linha, 'data'), valor: typeof valor === 'number' ? valor : null,
    });
  }
  return deu(saida);
  } catch (e) { return falhou(e); }
}

/** O fornecedor que o RESOLVEDOR DO BANCO acha para este nome (nome normalizado e apelidos) — o mesmo do de-para. P146: falha = `{ ok: false }`
 *  (antes, nulo = "nao achei" e a previa oferecia cadastrar de novo). */
export async function fornecedorPeloNome(clienteId: string, nome: string): Promise<Consulta<string | null>> {
  if (!nome.trim()) return deu(null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_classificacao_depara_resolver', {
      p_cliente_id: clienteId, p_textos: { fornecedor: [nome], fazenda: [], safra: [], subcentro: [] },
    });
    if (error) return falhou(error);
    return deu(lerResolucoesDoBanco(data).fornecedor?.[nome]?.valor ?? null);
  } catch (e) { return falhou(e); }
}

/** A classificacao do ULTIMO lancamento vivo e classificado deste fornecedor (pela competencia). */
export async function ultimaClassificacaoDoFornecedor(clienteId: string, fornecedorId: string): Promise<UltimaClassificacao | null> {
  const { data, error } = await supabase
    .from('financeiro_lancamentos_v2')
    .select('plano_conta_id, subcentro, macro_custo, grupo_custo, centro_custo, escopo_negocio, data_competencia, safra_id, cultura')
    .eq('cliente_id', clienteId).eq('favorecido_id', fornecedorId).eq('cancelado', false)
    .not('plano_conta_id', 'is', null)
    .order('data_competencia', { ascending: false }).order('created_at', { ascending: false })
    .limit(1);
  const l = error ? null : data?.[0];
  if (!l || !l.plano_conta_id || !l.subcentro || !l.data_competencia) return null;
  return {
    plano_conta_id: l.plano_conta_id, subcentro: l.subcentro, macro_custo: l.macro_custo ?? null, grupo_custo: l.grupo_custo ?? null,
    centro_custo: l.centro_custo ?? null, escopo_negocio: l.escopo_negocio ?? null, data: l.data_competencia,
    safra_id: l.safra_id ?? null, cultura: l.cultura ?? null,
  };
}

/**
 * NOTA-NFSE-LEITURA-02 (Gabriel 08/11, D2 a) — a fazenda do HISTORICO do fornecedor: os lancamentos vivos dos cadastros com a MESMA RAIZ
 * do CNPJ (as filiais: a NF 402 e' da matriz, o historico e' da filial) ou o mesmo CPF. So' a fazenda mais usada, quando e' uma so'
 * (`fazendaMaisUsada`); falha de leitura = nenhuma (a tela segue com "Fazenda não identificada"). So' le^.
 */
export async function fazendaPeloHistoricoDoFornecedor(clienteId: string, documento: string): Promise<string | null> {
  const d = soDigitos(documento);
  if (d.length !== 14 && d.length !== 11) return null;
  const filtro = d.length === 14
    ? `cpf_cnpj.like.${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}%,cpf_cnpj.like.${d.slice(0, 8)}%`
    : `cpf_cnpj.eq.${d},cpf_cnpj.eq.${validarDocumento(d).formatado ?? d}`;
  try {
    const { data: fs, error } = await supabase.from('financeiro_fornecedores').select('id').eq('cliente_id', clienteId).or(filtro).limit(20);
    const ids = !error && Array.isArray(fs) ? fs.map((f) => f.id) : [];
    if (!ids.length) return null;
    const { data: ls, error: e2 } = await supabase.from('financeiro_lancamentos_v2').select('fazenda_id')
      .eq('cliente_id', clienteId).in('favorecido_id', ids).eq('cancelado', false).limit(1000);
    if (e2 || !Array.isArray(ls)) return null;
    return fazendaMaisUsada(ls.map((l) => l.fazenda_id));
  } catch { return null; }
}
/**
 * NOTA-NFSE-LEITURA-02 (Gabriel 08/11 12:36: "o tomador passa na frente do histórico") — as fazendas do TOMADOR da nota: o titular fiscal
 * ativo com este CPF/CNPJ (`fiscal_titulares`) e as participações dele vigentes na data (`fiscal_fazenda_titulares`, a versão não
 * substituída). Falha de leitura = nenhuma (segue o histórico). So' le^.
 */
export async function fazendasDoTomador(clienteId: string, documento: string | null, data: string): Promise<string[]> {
  const d = soDigitos(documento);
  if (d.length !== 11 && d.length !== 14) return [];
  const formatos = [...new Set([d, validarDocumento(d).formatado].filter((x): x is string => !!x))];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas fiscais ainda nao estao nos tipos gerados
    const db = supabase as any;
    const { data: ts, error } = await db.from('fiscal_titulares').select('id').eq('cliente_id', clienteId).eq('ativo', true).in('documento', formatos).limit(5);
    const ids: string[] = !error && Array.isArray(ts) ? ts.map((t: { id: string }) => t.id) : [];
    if (!ids.length) return [];
    const { data: ps, error: e2 } = await db.from('fiscal_fazenda_titulares').select('fazenda_id, vigencia_inicio, vigencia_fim')
      .eq('cliente_id', clienteId).in('titular_id', ids).is('substituida_em', null).limit(100);
    if (e2 || !Array.isArray(ps)) return [];
    return fazendasVigentes(ps, data);
  } catch { return []; }
}
/** As fazendas cuja participação vale na data ('AAAA-MM-DD'): início <= data e (sem fim ou fim >= data). Sem repetir. */
export function fazendasVigentes(ps: readonly { fazenda_id: string; vigencia_inicio: string | null; vigencia_fim: string | null }[], data: string): string[] {
  return [...new Set(ps.filter((p) => (!p.vigencia_inicio || p.vigencia_inicio <= data) && (!p.vigencia_fim || p.vigencia_fim >= data)).map((p) => p.fazenda_id))];
}

/** A fazenda que mais aparece; empate no topo (ou nenhuma) = `null` (nunca se escolhe por sorteio). */
export function fazendaMaisUsada(fazendas: readonly (string | null | undefined)[]): string | null {
  const n = new Map<string, number>();
  for (const f of fazendas) if (f) n.set(f, (n.get(f) ?? 0) + 1);
  const [a, b] = [...n.entries()].sort((x, y) => y[1] - x[1]);
  return a && (!b || b[1] < a[1]) ? a[0] : null;
}

/** A inscricao estadual de cada fazenda do cliente (`fazenda_cadastros.ie`): fazenda_id -> ie. */
export async function iePorFazenda(clienteId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('fazenda_cadastros').select('fazenda_id, ie').eq('cliente_id', clienteId);
  const mapa: Record<string, string> = {};
  if (error || !data) return mapa;
  for (const l of data) if (l.fazenda_id && l.ie && soDigitos(l.ie)) mapa[l.fazenda_id] = l.ie;
  return mapa;
}

/** NOTA-FAZENDA-PELA-IE-01 — os apelidos das fazendas (`fazendas.aliases`): sem a IE gravada, a fazenda e' achada pelo nome no endereco
 *  do destinatario. Falha = sem apelidos (so' o nome). */
export async function aliasesDasFazendas(clienteId: string): Promise<Record<string, string[]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `aliases` ainda nao esta' nos tipos gerados
  const { data, error } = await (supabase as any).from('fazendas').select('id, aliases').eq('cliente_id', clienteId);
  const m: Record<string, string[]> = {};
  if (error || !Array.isArray(data)) return m;
  for (const f of data) if (f?.id && Array.isArray(f.aliases)) m[f.id] = f.aliases.filter((a: unknown): a is string => typeof a === 'string');
  return m;
}

/** NOTA-FAZENDA-PELA-IE-01 — gravar a IE da fazenda pela nota (`fn_fazenda_gravar_ie`: simula; so' IE vazia; trilha). */
export async function gravarIeDaFazenda(fazendaId: string, ie: string, referencia: string | null, simular: boolean, clienteId: string)
  : Promise<{ ok: true; frase: string | null; trilhaId: string | null } | { ok: false; frase: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_fazenda_gravar_ie', { p_fazenda_id: fazendaId, p_ie: ie, p_referencia: referencia, p_simular: simular });
  if (error) return { ok: false, frase: typeof error.message === 'string' && error.message ? error.message : 'A IE não foi gravada.' };
  if (!simular) notificarFazendasMudaram(clienteId);
  const o: Record<string, unknown> = data && typeof data === 'object' ? Object.fromEntries(Object.entries(data)) : {};
  return { ok: true, frase: typeof o.frase === 'string' ? o.frase : null, trilhaId: typeof o.trilha_id === 'string' ? o.trilha_id : null };
}
export async function desfazerIeDaFazenda(trilhaId: string, clienteId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fn_fazenda_gravar_ie_desfazer', { p_trilha_id: trilhaId, p_motivo: 'desfeito logo depois de gravar pela nota' });
  if (error) return typeof error.message === 'string' && error.message ? error.message : 'Não foi desfeito.';
  notificarFazendasMudaram(clienteId);
  return null;
}
/* quem le^ a IE das fazendas (a previa) rele^ quando ela muda */
const ouvintesDasFazendas = new Set<(clienteId: string) => void>();
export function notificarFazendasMudaram(clienteId: string) { for (const cb of [...ouvintesDasFazendas]) cb(clienteId); }
export function inscreverEmFazendas(cb: (clienteId: string) => void): () => void { ouvintesDasFazendas.add(cb); return () => { ouvintesDasFazendas.delete(cb); }; }

/**
 * Grava o CNPJ/CPF do XML no cadastro do fornecedor — o MESMO update da edicao de fornecedor (`FornecedorFormDialog`), no
 * formato dos demais cadastros (com mascara). ⚠ SO' EM CADASTRO SEM DOCUMENTO: o filtro vai no proprio update, para nunca
 * sobrescrever um documento que alguem digitou entre a leitura e o salvar. Devolve a mensagem de erro, ou `null`.
 */
export async function gravarDocumentoNoCadastro(clienteId: string, fornecedorId: string, documento: string): Promise<string | null> {
  /* FORN-EDITAR-01 — pelo validador único: documento inválido NÃO é gravado, e o motivo volta como erro */
  const validado = validarDocumento(documento);
  if (!validado.valido) return validado.motivo;
  if (!validado.formatado) return null;
  const { error } = await supabase.from('financeiro_fornecedores').update({ cpf_cnpj: validado.formatado })
    .eq('id', fornecedorId).eq('cliente_id', clienteId).or('cpf_cnpj.is.null,cpf_cnpj.eq.');
  if (error) return error.message;
  /* NOTA-FORNECEDOR-CNPJ-ACHADO-01 — COM O ID: a tela de Lancamentos rele^ so' os avisados (sem id, so' os da pagina — e a previa da
     proxima nota ficava com este cadastro velho, "sem CNPJ") */
  notificarFornecedoresMudaram(clienteId, [fornecedorId]);   /* FORN-SELETOR-PADRAO-01: o documento do cadastro mudou */
  return null;
}

/**
 * FORN-CADASTRO-02 — o XML completa o cadastro do fornecedor com o que a NF-e traz do emitente (fantasia, IE, endereço, telefone):
 * SÓ CAMPO VAZIO, nunca sobrescreve (a regra é `completarPeloEmitente`, pura). Lê a linha, monta o patch e grava num UPDATE com o
 * cliente no filtro. Nada a completar = nada gravado. Devolve a mensagem de erro, ou `null`.
 */
export async function completarCadastroPeloXml(clienteId: string, fornecedorId: string, emitente: EmitenteNFe): Promise<string | null> {
  const { data, error } = await supabase.from('financeiro_fornecedores')
    .select('nome_fantasia, inscricao_estadual, inscricao_municipal, tipo_pessoa, logradouro, numero, complemento, bairro, municipio, uf, cep, telefone')
    .eq('id', fornecedorId).eq('cliente_id', clienteId).maybeSingle();
  if (error) return error.message;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const patch = completarPeloEmitente(Object.fromEntries(Object.entries(data)), emitente);
  if (Object.keys(patch).length === 0) return null;
  const { error: e2 } = await supabase.from('financeiro_fornecedores').update(patch).eq('id', fornecedorId).eq('cliente_id', clienteId);
  if (e2) return e2.message;
  notificarFornecedoresMudaram(clienteId, [fornecedorId]);
  return null;
}

/**
 * FIN-NOTA-PDF-01 — o que a nota COMPLETARIA no cadastro do fornecedor achado (so' campo vazio; a regra e' `completarPeloEmitente`).
 * A tela oferece "Completar …" so' quando a lista nao e' vazia. Falha de leitura = lista vazia (nada a oferecer).
 */
export async function camposQueOEmitenteCompleta(clienteId: string, fornecedorId: string, emitente: EmitenteNFe): Promise<CampoDoEmitente[]> {
  const { data, error } = await supabase.from('financeiro_fornecedores')
    .select('nome_fantasia, inscricao_estadual, inscricao_municipal, tipo_pessoa, logradouro, numero, complemento, bairro, municipio, uf, cep, telefone')
    .eq('id', fornecedorId).eq('cliente_id', clienteId).maybeSingle();
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.keys(completarPeloEmitente(Object.fromEntries(Object.entries(data)), emitente)).filter(ehCampoDoEmitente);
}
const CAMPOS_DO_EMITENTE: readonly string[] = ['nome_fantasia', 'inscricao_estadual', 'inscricao_municipal', 'tipo_pessoa', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'cep', 'telefone'];
function ehCampoDoEmitente(c: string): c is CampoDoEmitente { return CAMPOS_DO_EMITENTE.includes(c); }

/** Um lancamento ABERTO do fornecedor que pode ser o desta nota (criado antes, do extrato ou da planilha). */
export interface LancamentoAbertoDaNota {
  id: string; vencimento: string | null; competencia: string | null; descricao: string | null; valorCent: number;
  financiamentoId: string | null; numeroDocumento: string | null;
  /** FIN-NOTA-PDF-01b — pago (realizado, conciliado ou com data de pagamento): o valor dele nao muda ao parcelar. */
  pago: boolean;
}

/**
 * FIN-NOTA-PDF-01 — o pedido do Gabriel: ATUALIZAR o lancamento que ja' existe em vez de criar outro. Os lancamentos vivos (nao
 * cancelados, do cenario realizado — Meta nunca) do MESMO fornecedor e cliente com o valor da nota OU o de uma parcela. So' leitura;
 * quem atualiza e' o gesto, com confirmacao. FIN-NOTA-PDF-01b: o PAGO entra (marcado `pago`) — o a' vista pago pode virar a parcela
 * 1/N sem mudar de valor ("Atualizar e parcelar"); a parcela de um parcelamento so' entra aberta (anexar a nota).
 */
export async function lancamentosAbertosComValor(clienteId: string, fornecedorId: string, valoresCent: readonly number[]): Promise<Consulta<LancamentoAbertoDaNota[]>> {
  const valores = [...new Set(valoresCent.filter((v) => v > 0))].map((v) => v / 100);
  if (!valores.length) return deu([]);
  try {
  const { data, error } = await supabase.from('financeiro_lancamentos_v2')
    .select('id, data_vencimento, data_competencia, descricao, valor, financiamento_id, numero_documento, status_transacao, data_pagamento')
    .eq('cliente_id', clienteId).eq('favorecido_id', fornecedorId).eq('cancelado', false).eq('cenario', 'realizado')
    .in('valor', valores)
    .order('data_vencimento', { ascending: true })
    .limit(20);
  if (error) return falhou(error);
  if (!Array.isArray(data)) return falhou(null);
  return deu(data.map((l) => ({
    id: l.id, vencimento: l.data_vencimento ?? null, competencia: l.data_competencia ?? null, descricao: l.descricao ?? null,
    valorCent: Math.round(Math.abs(Number(l.valor)) * 100), financiamentoId: l.financiamento_id ?? null, numeroDocumento: l.numero_documento ?? null,
    pago: l.status_transacao === 'realizado' || l.status_transacao === 'conciliado' || !!l.data_pagamento,
  })).filter((l) => !(l.pago && l.financiamentoId)));
  } catch (e) { return falhou(e); }
}

/** NOTA-FORNECEDOR-DUPLICA-01 — o cadastro do cliente que JA' tem este CNPJ/CPF (o mascarado ou so' digitos), lido no banco ANTES de criar. */
export interface CadastroComODocumento { id: string; nome: string; ativo: boolean }
export async function fornecedorPeloDocumento(clienteId: string, documento: string): Promise<Consulta<CadastroComODocumento | null>> {
  const digitos = soDigitos(documento);
  if (!digitos) return deu(null);
  const formatos = [...new Set([digitos, validarDocumento(digitos).formatado].filter((x): x is string => !!x))];
  try {
    const { data, error } = await supabase.from('financeiro_fornecedores').select('id, nome, ativo, fundido_em_id')
      .eq('cliente_id', clienteId).in('cpf_cnpj', formatos).order('ativo', { ascending: false }).limit(5);
    if (error) return falhou(error);
    if (!Array.isArray(data)) return falhou(null);
    const vivo = data.find((f) => f.ativo !== false && !f.fundido_em_id) ?? data.find((f) => !f.fundido_em_id) ?? null;
    return deu(vivo ? { id: vivo.id, nome: vivo.nome, ativo: vivo.ativo !== false } : null);
  } catch (e) { return falhou(e); }
}

/** NOTA-FORNECEDOR-DUPLICA-01 — o uso do cadastro achado pelo nome (a tela mostra: lancamentos e ultimo uso). Falha = nulo. */
export async function usoDoFornecedor(fornecedorId: string): Promise<{ lancamentos: number; ultimo: string | null } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_fornecedor_uso', { p_fornecedor: fornecedorId });
  if (error || !data || typeof data !== 'object') return null;
  const n: unknown = Reflect.get(data, 'lancamentos');
  const u: unknown = Reflect.get(data, 'ultimo_lancamento');
  return { lancamentos: typeof n === 'number' ? n : Number(n) || 0, ultimo: typeof u === 'string' && u ? u : null };
}

/** NOTA-JA-LANCADA-01 — os lancamentos do cliente que ja' parecem ser esta nota (`fn_nota_ja_lancada`). P146: falha = `{ ok: false, motivo }`
 *  — NUNCA lista vazia (era assim, e a previa oferecia "Criar" por cima do que ja' estava lancado). */
export async function notaJaLancada(clienteId: string, entrada: {
  parcelas: readonly { n: number; vencimento: string; valorCent: number }[]; numero: string | null; chave: string | null;
  emitenteDocumento: string | null; nomes: readonly (string | null | undefined)[];
  /** P128c — a prévia aberta pelo lançamento (porta 2): ele é a ÂNCORA (+ os irmãos do parcelamento dele). Só vai ao banco quando há. */
  lancamento?: string | null;
}): Promise<Consulta<LancamentoJaLancado[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_nota_ja_lancada', {
      p_cliente: clienteId,
      p_parcelas: entrada.parcelas.map((p) => ({ n: p.n, vencimento: p.vencimento, valor_cent: p.valorCent })),
      p_numero: entrada.numero, p_chave: entrada.chave, p_emitente_documento: entrada.emitenteDocumento,
      p_nomes: [...new Set(entrada.nomes.filter((x): x is string => !!x && !!x.trim()))],
      ...(entrada.lancamento ? { p_lancamento: entrada.lancamento } : {}),
    });
    if (error) { console.error('fn_nota_ja_lancada', error); return falhou(error); }
    return deu(lerJaLancados(data));
  } catch (e) { console.error('fn_nota_ja_lancada', e); return falhou(e); }
}

/** Nota já lançada (Gabriel 29/10 10:38) — a aba "No sistema hoje": a FAZENDA, o SUBCENTRO e o FORNECEDOR de cada achado como estão no banco (a
 *  `fn_nota_ja_lancada` não os traz). Só leitura, com o cliente; falha = `{ ok: false }` (a aba diz "não consegui ler", nunca "—" calado). */
export interface ComoEstaHoje { id: string; fazendaId: string | null; subcentro: string | null; favorecidoId: string | null; planoContaId: string | null; safraId: string | null }
export async function comoEstaoHoje(clienteId: string, ids: readonly string[]): Promise<Consulta<ComoEstaHoje[]>> {
  if (!ids.length) return deu([]);
  try {
    const { data, error } = await supabase.from('financeiro_lancamentos_v2').select('id, fazenda_id, subcentro, favorecido_id, plano_conta_id, safra_id')
      .eq('cliente_id', clienteId).in('id', [...ids]);
    if (error) { console.error('comoEstaoHoje', error); return falhou(error); }
    const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
    return deu((data ?? []).flatMap((r) => (r && typeof r.id === 'string'
      ? [{ id: r.id, fazendaId: texto(r.fazenda_id), subcentro: texto(r.subcentro), favorecidoId: texto(r.favorecido_id), planoContaId: texto(r.plano_conta_id), safraId: texto(r.safra_id) }] : [])));
  } catch (e) { console.error('comoEstaoHoje', e); return falhou(e); }
}

/** NOTA-FORNECEDOR-COMPARAR-01 — o cadastro como esta' HOJE (as colunas que a nota ou a Receita podem mudar). Falha = `null`. */
export async function cadastroParaComparar(clienteId: string, fornecedorId: string): Promise<CadastroParaComparar | null> {
  const { data, error } = await supabase.from('financeiro_fornecedores')
    .select('nome, nome_fantasia, cpf_cnpj, inscricao_estadual, logradouro, numero, complemento, bairro, cep, municipio, uf')
    .eq('id', fornecedorId).eq('cliente_id', clienteId).maybeSingle();
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : null]));
}

/** NOTA-FORNECEDOR-COMPARAR-01 — grava SO' os campos marcados, com a trilha por campo (`fn_fornecedor_atualizar_campos`). */
export async function atualizarCamposDoCadastro(fornecedorId: string, campos: Record<string, string>, origem: 'nota' | 'receita', referencia: string | null,
  clienteId: string): Promise<{ ok: true; alteracaoId: string | null } | { ok: false; frase: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_fornecedor_atualizar_campos', {
    p_fornecedor: fornecedorId, p_campos: campos, p_origem: origem, p_referencia: referencia, p_simular: false,
  });
  if (error) {
    const m = typeof error.message === 'string' ? error.message : '';
    return { ok: false, frase: /documento_ativo|duplicate|23505|já é de/i.test(m) ? 'Este CNPJ já é de outro cadastro ativo. Nada foi gravado.' : (m || 'O cadastro não foi atualizado.') };
  }
  /* NOTA-FORNECEDOR-CNPJ-ACHADO-01 — com o id do cadastro: as telas abertas releem ESTE (a previa da proxima nota ja' o ve^ com o CNPJ) */
  notificarFornecedoresMudaram(clienteId, [fornecedorId]);
  const id: unknown = data && typeof data === 'object' ? Reflect.get(data, 'alteracao_id') : null;
  return { ok: true, alteracaoId: typeof id === 'string' ? id : null };
}
export async function desfazerCamposDoCadastro(alteracaoId: string, clienteId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fn_fornecedor_atualizar_campos_desfazer', { p_alteracao: alteracaoId, p_motivo: 'desfeito logo depois de atualizar pela nota', p_simular: false });
  if (error) return typeof error.message === 'string' && error.message ? error.message : 'Não foi desfeito.';
  /* o cadastro desfeito (a trilha diz qual): as telas releem esse */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a tabela da trilha ainda nao esta' nos tipos gerados
  const { data: alt } = await (supabase as any).from('fornecedor_campos_alteracoes').select('fornecedor_id').eq('id', alteracaoId).maybeSingle();
  const f: unknown = alt && typeof alt === 'object' ? Reflect.get(alt, 'fornecedor_id') : null;
  notificarFornecedoresMudaram(clienteId, typeof f === 'string' && f ? [f] : undefined);
  return null;
}

/* ── P128b — COMPLETAR COM A NOTA (`fn_nota_completar`, a prévia é ela com `p_simular`) ─────────────────────────────────────────── */
/** A recusa do banco (22023) já vem em FRASE PRONTA ("… Nada foi gravado."): vai como está; o resto vira o motivo de sempre. */
const recusaOuMotivo = (erro: unknown): { ok: false; motivo: string } => {
  const c: unknown = erro && typeof erro === 'object' ? Reflect.get(erro, 'code') : null;
  const m: unknown = erro && typeof erro === 'object' ? Reflect.get(erro, 'message') : null;
  if (c === '22023' && typeof m === 'string' && m) return { ok: false, motivo: m };
  return falhou(erro);
};
/** A prévia (`simular`) ou a gravação única: os campos + a junção + o antes, numa transação. */
export async function completarComANota(clienteId: string, pedido: readonly Record<string, unknown>[], opcoes: { juntar: boolean; chave: string | null; simular: boolean;
  /** P167-B2 — o valor da nota: o banco recusa quando o que FICA nos lançamentos do pedido passa dele (ausente = sem a conferência, o lote) */
  valorNotaCent?: number | null }):
  Promise<Consulta<ResultadoCompletar>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_nota_completar', {
      p_cliente: clienteId, p_lancamentos: pedido, p_juntar: opcoes.juntar, p_chave: opcoes.chave, p_simular: opcoes.simular,
      ...(opcoes.valorNotaCent != null ? { p_valor_nota: opcoes.valorNotaCent / 100 } : {}),
    });
    if (error) return recusaOuMotivo(error);
    return deu(lerResultadoCompletar(data));
  } catch (e) { return falhou(e); }
}
/** O que nasceu DEPOIS da transação (as parcelas que faltavam, os documentos da nota): fica na operação para o desfazer. */
export async function registrarNaOperacao(operacao: string, criados: readonly string[], documentos: readonly string[]): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc('fn_nota_completar_registrar', { p_operacao: operacao, p_criados: criados, p_documentos: documentos });
    if (error) { const r = recusaOuMotivo(error); return r.motivo; }
    return null;
  } catch (e) { return falhou(e).motivo; }
}
/**
 * NOTA-ATUALIZA-PREVISTO-01 (R3) — a PARTICIPAÇÃO % deste cliente na nota, guardada no documento anexado (a nota fica INTEIRA; a conferência
 * documento × lançamento passa a comparar participação × nota). Só abaixo de 100. O desfazer da operação cancela o documento junto.
 */
export async function definirParticipacao(clienteId: string, documentos: readonly string[], participacaoPct: number): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc('fin_documento_participacao', { p_cliente: clienteId, p_documentos: documentos, p_participacao: participacaoPct });
    if (error) { const r = recusaOuMotivo(error); return r.motivo; }
    return null;
  } catch (e) { return falhou(e).motivo; }
}
/** Desfazer a operação inteira (campos, junção, o que nasceu): o banco recusa se alguém mexeu depois, dizendo o quê. */
export async function desfazerCompletar(operacao: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc('fn_nota_completar_desfazer', { p_operacao: operacao, p_simular: false });
    if (error) return recusaOuMotivo(error).motivo;
    return null;
  } catch (e) { return falhou(e).motivo; }
}
/** Cancela os lançamentos que nasceram para a operação quando ela foi recusada (o padrão do P75: nada fica valendo pela metade). Devolve
 *  quantos NÃO puderam ser cancelados. */
/** NOTA-BOLETO-COMPOSTO-01 (PR 1, D1 do Gabriel) — "Excluir" na prévia da nota = CANCELAR com o motivo e a trilha (a mesma
 *  `fn_cancelar_lancamento_auditoria`; nunca DELETE). Devolve quantos NÃO puderam ser cancelados. */
export async function cancelarComMotivo(ids: readonly string[], motivo: string): Promise<number> {
  let falhas = 0;
  for (const id of ids) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error } = await (supabase as any).rpc('fn_cancelar_lancamento_auditoria', { p_lancamento_id: id, p_motivo: motivo });
      if (error) { console.error('cancelarComMotivo', error); falhas += 1; }
    } catch (e) { console.error('cancelarComMotivo', e); falhas += 1; }
  }
  return falhas;
}

export async function cancelarCriados(ids: readonly string[], porque: string): Promise<number> {
  let falhas = 0;
  for (const id of ids) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { error } = await (supabase as any).rpc('fn_cancelar_lancamento_auditoria', { p_lancamento_id: id, p_motivo: `completar com a nota não gravado: ${porque}` });
      if (error) { console.error('cancelarCriados', error); falhas += 1; }
    } catch (e) { console.error('cancelarCriados', e); falhas += 1; }
  }
  return falhas;
}

/**
 * NOTA-ATUALIZA-PREVISTO-01 (R3) — o HISTÓRICO da participação: os últimos lançamentos PAGOS deste fornecedor no cliente, cada um com o valor
 * da nota anexada a ele (a de maior valor, viva). A sugestão do % sai daqui (`participacaoDoHistorico`), nunca da descrição. Falha = lista vazia
 * (só não sugere: o padrão segue 100% e o operador escolhe).
 */
export async function historicoDaParticipacao(clienteId: string, fornecedorId: string): Promise<{ lancamentoCent: number; documentoCent: number }[]> {
  try {
    const { data: ls, error } = await supabase.from('financeiro_lancamentos_v2').select('id, valor')
      .eq('cliente_id', clienteId).eq('favorecido_id', fornecedorId).eq('status_transacao', 'realizado').eq('cancelado', false)
      .order('data_vencimento', { ascending: false }).limit(6);
    if (error || !ls?.length) return [];
    const ids = ls.flatMap((l) => (typeof l.id === 'string' ? [l.id] : []));
    const { data: ds, error: e2 } = await supabase.from('financeiro_lancamento_documentos').select('lancamento_id, valor_documento')
      .eq('cliente_id', clienteId).in('lancamento_id', ids).eq('cancelado', false).not('valor_documento', 'is', null);
    if (e2) return [];
    const doc = new Map<string, number>();
    for (const d of ds ?? []) {
      const v = Math.round(Number(d.valor_documento) * 100);
      if (typeof d.lancamento_id === 'string' && v > 0) doc.set(d.lancamento_id, Math.max(doc.get(d.lancamento_id) ?? 0, v));
    }
    return ls.flatMap((l) => {
      const dc = typeof l.id === 'string' ? doc.get(l.id) : undefined;
      return dc ? [{ lancamentoCent: Math.round(Math.abs(Number(l.valor)) * 100), documentoCent: dc }] : [];
    });
  } catch (e) { console.error('historicoDaParticipacao', e); return []; }
}

/**
 * NOTA-PAGTO-PARCELADO-01 P1 (Gabriel 11/11, o trator: 110.000 + 4 × 25.000 em PIX soltos que a busca da nota não juntava) — os lançamentos
 * de SAÍDA do MESMO FORNECEDOR (o CNPJ raiz: todas as filiais) num período, em qualquer status (não cancelados, nunca meta), para o operador
 * marcar os que pagam a nota. Só leitura, com o cliente; sai no MESMO formato dos achados (`lerJaLancados`). P146: falha = `{ ok: false }`.
 */
/** Os cadastros do MESMO CNPJ raiz (os 8 primeiros dígitos: todas as filiais) — gravado formatado ou só dígitos. */
async function fornecedoresDaRaiz(clienteId: string, documento: string): Promise<Consulta<{ id: string; nome: string; cpf_cnpj: string | null }[]>> {
  const raiz = soDigitos(documento).slice(0, 8);
  if (raiz.length < 8) return deu([]);
  const raizFormatada = `${raiz.slice(0, 2)}.${raiz.slice(2, 5)}.${raiz.slice(5, 8)}`;
  const f = await supabase.from('financeiro_fornecedores').select('id, nome, cpf_cnpj')
    .eq('cliente_id', clienteId).or(`cpf_cnpj.like.${raiz}%,cpf_cnpj.like.${raizFormatada}%`);
  if (f.error) return falhou(f.error);
  return deu((f.data ?? []).filter((x) => soDigitos(x.cpf_cnpj ?? '').startsWith(raiz)));
}

export const LIMITE_DE_OUTROS_LANCAMENTOS = 300;
export async function lancamentosDoFornecedorNoPeriodo(clienteId: string, documentoDoEmitente: string, de: string, ate: string): Promise<Consulta<LancamentoJaLancado[]>> {
  if (soDigitos(documentoDoEmitente).length < 8 || !de || !ate) return deu([]);
  try {
    const f = await fornecedoresDaRaiz(clienteId, documentoDoEmitente);
    if (f.ok === false) return f;
    const fornecedores = f.valor;
    if (!fornecedores.length) return deu([]);
    const l = await supabase.from('financeiro_lancamentos_v2')
      .select('id, data_vencimento, data_pagamento, data_competencia, descricao, valor, status_transacao, financiamento_id, numero_documento, conta_bancaria_id, favorecido_id, cancelado, cenario')
      .eq('cliente_id', clienteId).in('favorecido_id', fornecedores.map((x) => x.id)).eq('cancelado', false).eq('tipo_operacao', '2-Saídas')
      .gte('data_vencimento', de).lte('data_vencimento', ate).order('data_vencimento', { ascending: true }).limit(LIMITE_DE_OUTROS_LANCAMENTOS);
    if (l.error) return falhou(l.error);
    const nome = new Map(fornecedores.map((x) => [x.id, x.nome]));
    return deu(lerJaLancados((l.data ?? []).filter((x) => x.cenario !== 'meta').map((x) => ({
      id: x.id, vencimento: x.data_vencimento, pagamento: x.data_pagamento, competencia: x.data_competencia, descricao: x.descricao,
      valor_cent: Math.round(Math.abs(Number(x.valor)) * 100), status: x.status_transacao, conciliado: x.status_transacao === 'conciliado',
      financiamento_id: x.financiamento_id, numero_documento: x.numero_documento, conta_bancaria_id: x.conta_bancaria_id,
      fornecedor_id: x.favorecido_id, fornecedor_nome: x.favorecido_id ? nome.get(x.favorecido_id) ?? null : null, fornecedor_por: 'cnpj',
      parcelas: [], por: ['escolhido'], cancelado: false,
    }))));
  } catch (e) { return falhou(e); }
}

/**
 * NOTA-LIGAR-LANCAMENTO-01 P2 — as liberações "direto ao fornecedor" (não canceladas) de contratos do cliente pagas a QUALQUER filial do
 * CNPJ raiz da nota, com o nº do contrato: o quadro Nota × lançamento diz "paga pela liberação do contrato X". Só leitura.
 */
export async function liberacoesDiretasDoFornecedor(clienteId: string, documentoDoEmitente: string): Promise<Consulta<LiberacaoDireta[]>> {
  if (soDigitos(documentoDoEmitente).length < 8) return deu([]);
  try {
    const f = await fornecedoresDaRaiz(clienteId, documentoDoEmitente);
    if (f.ok === false) return f;
    if (!f.valor.length) return deu([]);
    const l = await supabase.from('financiamento_liberacoes').select('id, data, valor, financiamento_id')
      .eq('cliente_id', clienteId).eq('forma', 'fornecedor').is('cancelado_em', null).in('fornecedor_id', f.valor.map((x) => x.id));
    if (l.error) return falhou(l.error);
    const rows = l.data ?? [];
    const ids = [...new Set(rows.map((r) => r.financiamento_id))];
    const contratos = new Map<string, string | null>();
    if (ids.length) {
      const c = await supabase.from('financiamentos').select('id, numero_contrato').in('id', ids);
      if (c.error) return falhou(c.error);
      for (const x of c.data ?? []) contratos.set(x.id, x.numero_contrato);
    }
    return deu(rows.map((r) => ({ id: r.id, data: r.data, valorCent: Math.round(Math.abs(Number(r.valor)) * 100), contrato: contratos.get(r.financiamento_id) ?? null })));
  } catch (e) { return falhou(e); }
}
