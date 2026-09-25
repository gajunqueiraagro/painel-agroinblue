/**
 * O ESTADO DE LIQUIDAÇÃO PELO LADO DA OPERAÇÃO — OC-STATUS-LADO-01 (ADR-2026-20).
 *
 * O banco decide: `vw_oc_operacao_liquidacao` passou a devolver o estado, a base e o liquidado do LADO da
 * OC (venda/abate: entradas; compra: saídas; base pelo compromisso) e três colunas do outro lado —
 * `despesas_obrigacao`, `despesas_liquidado`, `despesas_pendentes`. Este arquivo só LÊ: a marca, o filtro e
 * a porcentagem. Nenhuma conta de estado mora aqui.
 */

/** O valor do filtro "Pagamento" que não é um estado: as OCs com despesa do outro lado em aberto. */
export const FILTRO_DESPESAS_PENDENTES = '__despesas_pendentes__';

export interface LiquidacaoPeloLado {
  estado_liquidacao: string | null;
  base?: number | null;
  total_liquidado_valido?: number | null;
  despesas_pendentes?: number | null;
}

/** Despesa pendente de verdade — acima do centavo, a mesma tolerância da régua `_oc_estado_liquidacao`. */
export function temDespesaPendente(l: LiquidacaoPeloLado | undefined | null): boolean {
  return Number(l?.despesas_pendentes ?? 0) > 0.01;
}

/** O filtro "Pagamento": todos, um estado, ou "Despesas pendentes" (que não é estado — é o outro lado). */
export function passaFiltroPagamento(filtro: string, l: LiquidacaoPeloLado | undefined | null): boolean {
  if (filtro === '__all__') return true;
  if (filtro === FILTRO_DESPESAS_PENDENTES) return temDespesaPendente(l);
  return (l?.estado_liquidacao ?? '') === filtro;
}

/**
 * "Paga X%" PELO LADO: liquidado do lado ÷ base do lado, os dois da view. Antes dividia o liquidado de
 * TUDO pela obrigação de TUDO, e a venda de boitel com só o adiantamento pago saía "Paga 14%".
 * Sem base (legado sem compromisso ou base zero), `null` — o título diz "paga em parte", sem inventar número.
 */
export function pctPagoPeloLado(l: LiquidacaoPeloLado | undefined | null): number | null {
  const base = Number(l?.base ?? 0);
  if (!(base > 0)) return null;
  return Math.round((Number(l?.total_liquidado_valido ?? 0) / base) * 100);
}
