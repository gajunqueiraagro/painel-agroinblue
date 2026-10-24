/**
 * "PARCELAR ESTE LANÇAMENTO" — P74 B (NOTA-CARTAO-PARCELADO-01, Gabriel 23/10/2026: "todo lançamento pode virar parcelado depois de
 * criado"). O lançamento à vista (1/1) vira a 1/N — o MESMO id, com a trilha — e nascem as outras N−1, pela MESMA RPC do "Atualizar e
 * parcelar" da nota (`fn_parcelamento_a_partir_do_lancamento`, que desde a 112350 leva a classificação DIVIDIDA às N na mesma transação).
 * Depois, os documentos do lançamento (os dele e os ligados a ele) ficam ligados às N (`fin_documento_vincular`, idempotente).
 * ⚠ PAGO OU CONCILIADO NÃO PARCELA (a trava fica na tela, com a frase; a RPC só olha status/pagamento): parcelar mudaria o que saiu da
 *   conta. O botão aparece apagado, nunca some.
 * ⚠ A volta para à vista NÃO existe ainda (P74b).
 */
import { supabase } from '@/integrations/supabase/client';
import { montarPayloadParcelamento, type ParcelaDoPayload, type PayloadParcelamento } from '@/lib/financiamentos/montarPayloadParcelamento';
import { lancamentosDoParcelamento } from '@/lib/financeiro/documentosPendentes';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';

const dataBR = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

/** Por que este lançamento não pode ser parcelado agora (a frase do botão apagado), ou nulo. */
export function travaDoParcelar(l: { status: string | null | undefined; dataPagamento: string | null | undefined; conciliadoEm: string | null | undefined }): string | null {
  if (l.status === 'conciliado' || l.conciliadoEm) return `Conciliado com o extrato em ${dataBR(l.conciliadoEm ?? l.dataPagamento)}: desfaça a conciliação antes.`;
  if (l.status === 'realizado' || l.dataPagamento) return `Já pago em ${dataBR(l.dataPagamento)}: parcelar mudaria o que saiu da conta. Desfaça o pagamento antes.`;
  return null;
}

export interface LancamentoParaParcelar {
  id: string; valorCent: number; descricao: string; dataCompetencia: string; fazendaId: string; planoContaId: string | null;
  safraId: string | null; cultura: string | null; fase: string | null; favorecidoId: string | null; formaPagamento: string | null;
  contaId: string | null; escopo: string | null;
}

/** O payload da RPC — a lista explícita das N (a RPC pede a lista; a 1 é este lançamento). */
export function payloadDoParcelar(clienteId: string, l: LancamentoParaParcelar, parcelas: readonly { vencimento: string; valorCent: number }[]): PayloadParcelamento {
  const lista: ParcelaDoPayload[] = parcelas.map((x, i) => ({ numero: i + 1, data_vencimento: x.vencimento, valor: x.valorCent / 100 }));
  return montarPayloadParcelamento(clienteId, {
    fazendaId: l.fazendaId, descricao: l.descricao, valorTotal: l.valorCent / 100, totalParcelas: lista.length,
    dataPrimeiraParcela: lista[0]?.data_vencimento ?? '', parcelas: lista, dataCompetencia: l.dataCompetencia, intervaloMeses: 1,
    favorecidoId: l.favorecidoId, formaPagamento: l.formaPagamento, contaBancariaId: l.contaId, tipoFinanciamento: l.escopo,
    numeroContrato: null, observacao: null,
  }, { plano_conta_id: l.planoContaId, safra_id: l.safraId, cultura: l.cultura, fase: l.fase });
}

/** A frase da confirmação (vista 3 do mock). */
export const fraseDaConfirmacao = (n: number) =>
  `Os documentos e a classificação do lançamento vão para as ${n}. Saída do caixa: uma por vencimento, nas datas acima.`;

export interface GravadoresDoParcelar {
  parcelar: (lancamentoId: string, payload: PayloadParcelamento) => Promise<string | null>;
  parcelas: (financiamentoId: string) => Promise<{ numero: number; lancamentoId: string }[]>;
  documentos: (clienteId: string, lancamentoId: string) => Promise<string[]>;
  vincular: (clienteId: string, documentoId: string, lancamentos: readonly string[]) => Promise<void>;
}

async function parcelarNoBanco(lancamentoId: string, payload: PayloadParcelamento): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_parcelamento_a_partir_do_lancamento', { p_lancamento: lancamentoId, p_payload: payload, p_simular: false });
  if (error) throw error;
  const id: unknown = data && typeof data === 'object' ? Reflect.get(data, 'financiamento_id') : null;
  return typeof id === 'string' ? id : null;
}

/** Os documentos vivos do lançamento: os dele e os de outro lançamento ligados a ele. */
async function documentosNoBanco(clienteId: string, lancamentoId: string): Promise<string[]> {
  const [proprios, ligados] = await Promise.all([
    supabase.from('financeiro_lancamento_documentos').select('id').eq('cliente_id', clienteId).eq('lancamento_id', lancamentoId).eq('cancelado', false),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a tabela de vínculos ainda não está no tipo gerado
    (supabase as any).from('financeiro_documento_vinculos').select('documento_id').eq('cliente_id', clienteId).eq('lancamento_id', lancamentoId),
  ]);
  if (proprios.error) throw proprios.error;
  if (ligados.error) throw ligados.error;
  const ids = (proprios.data ?? []).map((d) => d.id);
  for (const r of ligados.data ?? []) { const id: unknown = Reflect.get(r, 'documento_id'); if (typeof id === 'string') ids.push(id); }
  return [...new Set(ids)];
}

async function vincularNoBanco(clienteId: string, documentoId: string, lancamentos: readonly string[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { error } = await (supabase as any).rpc('fin_documento_vincular', { p_documento: documentoId, p_cliente: clienteId, p_lancamentos: [...lancamentos] });
  if (error) throw error;
}

export const GRAVADORES_DO_PARCELAR: GravadoresDoParcelar = {
  parcelar: parcelarNoBanco, parcelas: lancamentosDoParcelamento, documentos: documentosNoBanco, vincular: vincularNoBanco,
};

const erroDe = (e: unknown, padrao: string) => (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message ? e.message : padrao);

export type ResultadoDoParcelar = { ok: true; parcelas: number; erroDosDocumentos: string | null } | { ok: false; erro: string };

/** Parcela (a RPC, uma transação) e liga os documentos às N. Documento que não liga não desfaz as parcelas: a frase diz o que faltou. */
export async function parcelarEsteLancamento(
  clienteId: string, l: LancamentoParaParcelar, parcelas: readonly { vencimento: string; valorCent: number }[], g: GravadoresDoParcelar = GRAVADORES_DO_PARCELAR,
): Promise<ResultadoDoParcelar> {
  const n = parcelas.length;
  let financiamentoId: string | null;
  try {
    financiamentoId = await g.parcelar(l.id, payloadDoParcelar(clienteId, l, parcelas));
  } catch (x) {
    return { ok: false, erro: erroDe(x, 'O lançamento não foi parcelado.') };
  }
  notificarLancamentosMudaram(clienteId);
  try {
    const gravadas = financiamentoId ? await g.parcelas(financiamentoId) : [];
    const docs = await g.documentos(clienteId, l.id);
    const ids = gravadas.map((x) => x.lancamentoId);
    for (const d of docs) await g.vincular(clienteId, d, ids);
    return { ok: true, parcelas: n, erroDosDocumentos: null };
  } catch (x) {
    return { ok: true, parcelas: n, erroDosDocumentos: `O lançamento foi parcelado em ${n}, mas os documentos não foram ligados às novas parcelas: ${erroDe(x, 'falha')}` };
  }
}
