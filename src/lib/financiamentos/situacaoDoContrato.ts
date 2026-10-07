/**
 * A SITUAÇÃO DO CONTRATO, LIDA DO BANCO — PARC-LIVRES-01 passo 4 (Gabriel, 06/10/2026).
 *
 * ⚠ O DONO DA SITUAÇÃO "PAGA" É O LANÇAMENTO. `fn_financiamento_situacao` devolve as parcelas vivas com a situação DERIVADA e os
 *   cartões PRONTOS; este arquivo só LÊ (sem cast) e escreve os rótulos. A tela não soma, não filtra e não decide quem está pago.
 * ⚠ Qualquer peça torta = `null` inteiro, nunca zeros: número ausente não vira "R$ 0,00".
 */
export type SituacaoDaParcela = 'paga' | 'vencida' | 'pendente' | 'parcial';

export interface ParcelaDoContrato {
  id: string;
  numero: number | null;
  dataVencimento: string | null;
  valorPrincipal: number;
  valorJuros: number;
  valorTotal: number;
  situacao: SituacaoDaParcela;
  pagoEm: string | null;
  valorPago: number;
  lancamentoId: string | null;
  lancamentoJurosId: string | null;
  /** 'lancamento' = a situação veio do lançamento (o dono); 'parcela' = não há lançamento vivo, vale a parcela (legado). */
  fonte: 'lancamento' | 'parcela';
  /** a coluna `status` da parcela diz outra coisa que a situação derivada */
  diverge: boolean;
}

export interface CartoesDoContrato {
  valorContrato: number; pago: number; aVencer: number; vencido: number;
  pagas: number; parcelas: number; jurosPrevistos: number; somaPrincipal: number; somaTotal: number; divergentes: number;
}

export interface SituacaoDoContrato { parcelas: ParcelaDoContrato[]; cartoes: CartoesDoContrato }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const SITUACOES: readonly SituacaoDaParcela[] = ['paga', 'vencida', 'pendente', 'parcial'];
const situacao = (v: unknown): SituacaoDaParcela | null => SITUACOES.find((s) => s === v) ?? null;

export function lerSituacaoDoContrato(dado: unknown): SituacaoDoContrato | null {
  const raiz = obj(dado);
  const c = obj(raiz?.cartoes);
  if (!raiz || !c || !Array.isArray(raiz.parcelas)) return null;
  const n = (k: string) => num(c[k]);
  const [valorContrato, pago, aVencer, vencido, pagas, parcelasN, jurosPrevistos, somaPrincipal, somaTotal, divergentes] =
    [n('valor_contrato'), n('pago'), n('a_vencer'), n('vencido'), n('pagas'), n('parcelas'), n('juros_previstos'), n('soma_principal'), n('soma_total'), n('divergentes')];
  if (valorContrato === null || pago === null || aVencer === null || vencido === null || pagas === null || parcelasN === null
      || jurosPrevistos === null || somaPrincipal === null || somaTotal === null || divergentes === null) return null;
  const parcelas: ParcelaDoContrato[] = [];
  for (const bruta of raiz.parcelas) {
    const p = obj(bruta);
    const id = txt(p?.id); const sit = situacao(p?.situacao);
    const vp = num(p?.valor_principal); const vj = num(p?.valor_juros); const vt = num(p?.valor_total); const vpg = num(p?.valor_pago);
    if (!p || !id || !sit || vp === null || vj === null || vt === null || vpg === null) return null;
    parcelas.push({
      id, numero: num(p.numero), dataVencimento: txt(p.data_vencimento), valorPrincipal: vp, valorJuros: vj, valorTotal: vt,
      situacao: sit, pagoEm: txt(p.pago_em), valorPago: vpg, lancamentoId: txt(p.lancamento_id), lancamentoJurosId: txt(p.lancamento_juros_id),
      fonte: p.fonte === 'parcela' ? 'parcela' : 'lancamento', diverge: p.diverge === true,
    });
  }
  return { parcelas, cartoes: { valorContrato, pago, aVencer, vencido, pagas, parcelas: parcelasN, jurosPrevistos, somaPrincipal, somaTotal, divergentes } };
}

export const ROTULO_SITUACAO: Record<SituacaoDaParcela, string> = { paga: 'Paga', vencida: 'Vencida', pendente: 'Pendente', parcial: 'Parcial' };
export const CLASSE_SITUACAO: Record<SituacaoDaParcela, string> = {
  paga: 'bg-emerald-100 text-emerald-800', vencida: 'bg-red-100 text-red-800', pendente: 'bg-amber-100 text-amber-800', parcial: 'bg-amber-100 text-amber-800',
};
/** O que o `title` da situação diz: de onde ela veio. */
export function origemDaSituacao(p: ParcelaDoContrato): string {
  if (p.fonte === 'parcela') return 'parcela sem lançamento: a situação é a registrada na parcela';
  if (p.situacao === 'parcial') return 'só parte dos lançamentos desta parcela está realizada';
  return 'situação lida do lançamento desta parcela';
}
export const MOTIVO_PARCELA_SEM_LANCAMENTO = 'Parcela sem lançamento no Financeiro.';
