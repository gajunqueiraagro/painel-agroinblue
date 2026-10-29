/**
 * JUNTAR AS PARCELAS SOLTAS — P96a (Gabriel 25/10/2026: a NF 46.994 no cartão, lançada à mão em "… 1/6" … "… 6/6"). As N achadas pela
 * nota (as irmãs da fração, P95) viram UMA compra parcelada pela `fn_parcelamento_juntar_lancamentos` (migration 112370): os N lançamentos
 * FICAM — o mesmo id, valor, vencimento, pagamento, status e descrição —, só ganham o elo com a compra. Depois, a nota fica ligada às N
 * pelo mesmo caminho do "Anexar" (`anexarAosJaLancados`).
 * ⚠ A OPÇÃO DA COMPETÊNCIA: marcada, as N passam para a emissão da nota (e a safra, pela regra da casa); a prévia vem do banco (a mesma
 *   função simulada) e a tela diz o efeito no DRE ("abril +R$ 1.862,48; maio, junho e outubro −1 parcela cada").
 * ⚠ A NF DIGITADA À MÃO numa das N, com valor/emissão diferentes da nota lida: NUNCA se troca sozinha. A tela mostra a divergência e
 *   oferece "Usar a nota lida" (com confirmação, pela `fin_documento_editar`; o digitado fica na Auditoria pela trilha do documento).
 */
import { supabase } from '@/integrations/supabase/client';
import { dataBR } from '@/lib/datas/dataBR';
import { fracaoDaDescricao, type NotaJaLancada } from '@/lib/financeiro/nfe/jaLancada';
import { reais, soDigitos } from '@/lib/financeiro/nfe/formatos';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';

/** As N soltas que a nota achou: todas as N frações, cada k uma vez, nenhuma já parcela. Nulo = não há o que juntar. PURO. */
export interface SoltasDaNota { n: number; ids: string[]; somaCent: number }
export function soltasParaJuntar(j: Pick<NotaJaLancada, 'pelaNota' | 'fracoes'> | null): SoltasDaNota | null {
  if (!j) return null;
  const porN = new Map<number, typeof j.pelaNota>();
  for (const l of j.pelaNota) {
    const n = j.fracoes.get(l.id);
    if (!n || l.cancelado || l.financiamentoId) continue;
    porN.set(n, [...(porN.get(n) ?? []), l]);
  }
  for (const [n, ls] of [...porN].sort((a, b) => b[0] - a[0])) {
    const ks = new Map<number, string>();
    for (const l of ls) { const f = fracaoDaDescricao(l.descricao); if (f && f.n === n && !ks.has(f.k)) ks.set(f.k, l.id); }
    if (ks.size !== n) continue;
    const ids = [...ks].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const somaCent = ls.filter((l) => ids.includes(l.id)).reduce((s, l) => s + l.valorCent, 0);
    return { n, ids, somaCent };
  }
  return null;
}

/**
 * URGENTE 29/10 (o Azulão: "Reforma Ponte" + "Parcela 2 - F2 - REFORMA PONTE" não se juntaram, calado) + Gabriel 08:26 (os parcelados do LR,
 * "Parcela 3 - None"…): JUNTAR É O PADRÃO. As soltas da nota são as do "k/N" (P96a) ou, sem ele, os achados vivos da nota (`alvos`) quando são
 * EXATAMENTE as N duplicatas (N ≥ 2), na ordem do vencimento. Quando não junta, a FRASE diz por quê (nunca calado). A recusa de quem grava
 * (fornecedores/fazendas/classificações diferentes, mês fechado…) vem da própria prévia do banco. PURO.
 */
export type JuncaoDaNota = { soltas: SoltasDaNota; frase: null } | { soltas: null; frase: string | null };
/** `escolha` (o mock da nota já lançada, 29/10): `aCriar` = as parcelas da nota que nascem agora (entram na junção, o banco as junta com as
 *  achadas); `deixadas` = as achadas que a pessoa deixou como estão (não recebem a nota: a compra não fecha, não junta). */
export function juncaoDaNota(j: Pick<NotaJaLancada, 'pelaNota' | 'fracoes' | 'alvos'> | null, duplicatas: number,
  escolha: { aCriar?: number; deixadas?: number } = {}): JuncaoDaNota {
  if (!j) return { soltas: null, frase: null };
  const aCriar = escolha.aCriar ?? 0;
  const deixadas = escolha.deixadas ?? 0;
  if (deixadas > 0) {
    return { soltas: null, frase: `Não junto: ${deixadas === 1 ? '1 parcela fica' : `${deixadas} parcelas ficam`} como está (não recebe a nota).` };
  }
  /* o "k/N" primeiro: a nota de UMA duplicata paga no cartão em N (P95) também se junta pelas frações */
  const pelaFracao = soltasParaJuntar(j);
  if (pelaFracao) return { soltas: pelaFracao, frase: null };
  if (duplicatas < 2) return { soltas: null, frase: null };
  const vivas = j.alvos.filter((l) => !l.cancelado);
  const jaParcela = vivas.filter((l) => l.financiamentoId);
  if (vivas.length && jaParcela.length === vivas.length && new Set(jaParcela.map((l) => l.financiamentoId)).size === 1) {
    return { soltas: null, frase: null };   // já são UMA compra parcelada: nada a juntar
  }
  if (jaParcela.length) {
    return { soltas: null, frase: `Não junto: ${jaParcela.length === 1 ? '1 delas já é parcela' : `${jaParcela.length} delas já são parcelas`} de uma compra (junte pelo cadastro dela).` };
  }
  if (vivas.length + aCriar !== duplicatas) {
    return { soltas: null, frase: `Não junto: a nota tem ${duplicatas} duplicatas e achei ${vivas.length} no sistema${aCriar ? ` (+${aCriar} a criar)` : ''} (confira as que ${vivas.length + aCriar < duplicatas ? 'faltam' : 'sobram'}).` };
  }
  const chave = (l: (typeof vivas)[number]) => l.vencimento ?? l.pagamento ?? l.competencia ?? '';
  const ordem = [...vivas].sort((a, b) => chave(a).localeCompare(chave(b)) || a.id.localeCompare(b.id));
  /* as que nascem agora entram pelo banco (a junção recebe as achadas + as criadas, na mesma gravação) */
  return { soltas: { n: duplicatas, ids: ordem.map((l) => l.id), somaCent: ordem.reduce((s, l) => s + l.valorCent, 0) }, frase: null };
}

export interface MesDoEfeito { mes: string; valorCent: number; parcelas: number }
export interface ParcelaDaJuncao {
  numero: number; lancamentoId: string; descricao: string | null; vencimento: string | null; valorCent: number; status: string | null;
  competenciaAntes: string | null; competenciaDepois: string | null; safraAntes: string | null; safraDepois: string | null;
}
export type Juncao =
  | { ok: true; parcelas: number; somaCent: number; descricao: string; safraNova: string | null; lista: ParcelaDaJuncao[]; efeito: MesDoEfeito[] }
  | { ok: false; motivo: string; frase: string };

const g = (o: unknown, k: string): unknown => (o && typeof o === 'object' ? Reflect.get(o, k) : undefined);
const texto = (v: unknown) => (typeof v === 'string' ? v : null);
const cent = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) : 0);

/** Lê a resposta da função (simulada ou gravada). Torta = nulo. PURO. */
export function lerJuncao(r: unknown): Juncao | null {
  if (!r || typeof r !== 'object') return null;
  if (g(r, 'ok') === false) {
    const frase = texto(g(g(r, 'recusa'), 'frase'));
    return frase ? { ok: false, motivo: texto(g(g(r, 'recusa'), 'motivo')) ?? '', frase } : null;
  }
  if (g(r, 'ok') !== true) return null;
  const lista = g(r, 'lista');
  const efeito = g(r, 'efeito_por_mes');
  return {
    ok: true, parcelas: Number(g(r, 'parcelas')) || 0, somaCent: cent(g(r, 'soma')), descricao: texto(g(r, 'descricao')) ?? '',
    safraNova: texto(g(r, 'safra_nova_codigo')),
    lista: Array.isArray(lista) ? lista.map((x) => ({
      numero: Number(g(x, 'numero')) || 0, lancamentoId: texto(g(x, 'lancamento_id')) ?? '', descricao: texto(g(x, 'descricao')),
      vencimento: texto(g(x, 'vencimento')), valorCent: cent(g(x, 'valor')), status: texto(g(x, 'status')),
      competenciaAntes: texto(g(x, 'competencia_antes')), competenciaDepois: texto(g(x, 'competencia_depois')),
      safraAntes: texto(g(x, 'safra_antes_codigo')), safraDepois: texto(g(x, 'safra_depois_codigo')),
    })) : [],
    efeito: Array.isArray(efeito) ? efeito.map((x) => ({ mes: texto(g(x, 'mes')) ?? '', valorCent: cent(g(x, 'valor')), parcelas: Number(g(x, 'parcelas')) || 0 })) : [],
  };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const lista = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** O efeito no DRE: "abril +R$ 1.862,48; maio, junho e outubro −1 parcela cada". O ano só quando o mês é de outro ano que o de destino. PURO. */
export function fraseDoEfeito(efeito: readonly MesDoEfeito[]): string {
  const entra = efeito.filter((e) => e.parcelas > 0);
  const ano = entra[0]?.mes.slice(0, 4) ?? '';
  const nome = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1] ?? mes}${mes.slice(0, 4) !== ano ? ` de ${mes.slice(0, 4)}` : ''}`;
  const partes = entra.map((e) => `${nome(e.mes)} ${e.valorCent < 0 ? '−' : '+'}R$ ${reais(Math.abs(e.valorCent))}`);
  const porQtd = new Map<number, string[]>();
  for (const e of efeito.filter((x) => x.parcelas < 0)) porQtd.set(-e.parcelas, [...(porQtd.get(-e.parcelas) ?? []), nome(e.mes)]);
  for (const [k, meses] of [...porQtd].sort((a, b) => a[0] - b[0])) {
    partes.push(`${lista(meses)} −${k} parcela${k === 1 ? '' : 's'}${meses.length > 1 ? ' cada' : ''}`);
  }
  return partes.join('; ');
}

/** A troca de safra das N: "a safra de 2 passa de 26/27-Pec para 25/26-Pec" (nulo = nenhuma muda). PURO. */
export function fraseDaSafra(l: readonly ParcelaDaJuncao[]): string | null {
  const mudam = l.filter((x) => x.safraAntes !== x.safraDepois);
  if (!mudam.length) return null;
  const de = [...new Set(mudam.map((x) => x.safraAntes ?? 'sem safra'))];
  return `a safra de ${mudam.length} passa de ${lista(de)} para ${mudam[0]?.safraDepois ?? 'sem safra'}`;
}

/** A NF já anexada à mão numa das N que DIVERGE da nota lida (mesma chave ou mesmo número; valor ou emissão diferentes). */
export interface DocumentoDaParcela {
  id: string; lancamentoId: string; versao: number; especie: string | null; numero: string | null; chave: string | null;
  valorCent: number | null; emissao: string | null;
}
export interface NfDigitada extends DocumentoDaParcela { rotulo: string }
export function nfDigitadaDivergente(
  docs: readonly DocumentoDaParcela[], rotuloDe: (lancamentoId: string) => string,
  nota: { chave: string | null; numero: string | null; totalCent: number; emissao: string | null },
): NfDigitada | null {
  const numero = (x: string | null) => soDigitos(x ?? '').replace(/^0+/, '');
  for (const d of docs) {
    if (d.especie !== 'nf') continue;
    const mesma = (!!d.chave && !!nota.chave && soDigitos(d.chave) === soDigitos(nota.chave)) || (!!numero(d.numero) && numero(d.numero) === numero(nota.numero));
    if (!mesma) continue;
    if (d.valorCent !== nota.totalCent || (d.emissao ?? '') !== (nota.emissao ?? '')) return { ...d, rotulo: rotuloDe(d.lancamentoId) };
  }
  return null;
}
export const fraseDaNfDigitada = (d: NfDigitada, nota: { totalCent: number; emissao: string | null }) =>
  `A ${d.rotulo} tem uma NF digitada à mão: R$ ${reais(d.valorCent ?? 0)}, emissão ${dataBR(d.emissao)} — a nota lida é R$ ${reais(nota.totalCent)}, emissão ${dataBR(nota.emissao)}`;

export interface GravadoresDaJuncao {
  juntar: (clienteId: string, ids: readonly string[], competencia: string | null, simular: boolean) => Promise<unknown>;
  documentos: (clienteId: string, ids: readonly string[]) => Promise<DocumentoDaParcela[]>;
  editarDocumento: (clienteId: string, documentoId: string, versao: number, campos: Record<string, string>) => Promise<void>;
}

async function juntarNoBanco(clienteId: string, ids: readonly string[], competencia: string | null, simular: boolean): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_parcelamento_juntar_lancamentos', {
    p_cliente: clienteId, p_lancamentos: [...ids], p_competencia: competencia, p_simular: simular,
  });
  if (error) throw error;
  return data;
}

async function documentosNoBanco(clienteId: string, ids: readonly string[]): Promise<DocumentoDaParcela[]> {
  const { data, error } = await supabase.from('financeiro_lancamento_documentos')
    .select('id, lancamento_id, versao, especie, numero, chave_acesso, valor_documento, data_emissao')
    .eq('cliente_id', clienteId).in('lancamento_id', [...ids]).eq('cancelado', false);
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id, lancamentoId: d.lancamento_id, versao: Number(d.versao) || 0, especie: d.especie, numero: d.numero, chave: d.chave_acesso,
    valorCent: d.valor_documento == null ? null : Math.round(Number(d.valor_documento) * 100), emissao: d.data_emissao,
  }));
}

async function editarNoBanco(clienteId: string, documentoId: string, versao: number, campos: Record<string, string>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fin_documento_editar', {
    p_documento_id: documentoId, p_cliente_id: clienteId, p_versao_esperada: versao, p_payload: campos,
  });
  if (error) throw error;
}

export const GRAVADORES_DA_JUNCAO: GravadoresDaJuncao = { juntar: juntarNoBanco, documentos: documentosNoBanco, editarDocumento: editarNoBanco };

const erroDe = (e: unknown, padrao: string) => (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message ? e.message : padrao);

/** A prévia (simulada, nada grava). Erro do banco = a frase dele. */
export async function simularJuncao(clienteId: string, ids: readonly string[], competencia: string | null, gj: GravadoresDaJuncao = GRAVADORES_DA_JUNCAO): Promise<Juncao> {
  try {
    return lerJuncao(await gj.juntar(clienteId, ids, competencia, true)) ?? { ok: false, motivo: 'torta', frase: 'A prévia da junção não veio.' };
  } catch (x) {
    return { ok: false, motivo: 'banco', frase: erroDe(x, 'A prévia da junção não veio.') };
  }
}

/** Junta (uma transação no banco). A nota se anexa depois, pelo chamador (o mesmo "Anexar"). */
export async function gravarJuncao(clienteId: string, ids: readonly string[], competencia: string | null, gj: GravadoresDaJuncao = GRAVADORES_DA_JUNCAO): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const r = lerJuncao(await gj.juntar(clienteId, ids, competencia, false));
    if (!r || r.ok === false) return { ok: false, erro: r && r.ok === false ? r.frase : 'As parcelas não foram juntadas.' };
    notificarLancamentosMudaram(clienteId);
    return { ok: true };
  } catch (x) {
    return { ok: false, erro: erroDe(x, 'As parcelas não foram juntadas.') };
  }
}

/** "Usar a nota lida": só valor e emissão do documento digitado (o antes fica na trilha do documento). */
export async function usarANotaLida(clienteId: string, d: NfDigitada, nota: { totalCent: number; emissao: string | null }, gj: GravadoresDaJuncao = GRAVADORES_DA_JUNCAO): Promise<string | null> {
  try {
    await gj.editarDocumento(clienteId, d.id, d.versao, {
      valor_documento: (nota.totalCent / 100).toFixed(2), ...(nota.emissao ? { data_emissao: nota.emissao } : {}),
    });
    return null;
  } catch (x) {
    return erroDe(x, 'A NF não foi trocada.');
  }
}
