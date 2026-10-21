/**
 * OC-CORRECOES-01 C2 · OC-CC-GESTOS-LEGADO-01 — os gestos do titulo da conta corrente da OC (cancelar, desvincular, parcelar), com o
 * legado (programado antes do modal, sem compromisso) incluido: todo gesto nasce com o contrario (Gabriel 21/10). O banco e' o dono
 * (`oc_recebimento_gesto`; com compromisso, o desvincular e' `oc_desvincular_lancamento` e o cancelar o de sempre); aqui so' a conta das
 * parcelas, pura, para a tela.
 */

export type GestoNoTitulo = 'cancelar' | 'desvincular' | 'parcelar';
export interface ParcelaDoGesto { valor: number | null; vencimento: string }

const centavos = (v: number) => Math.round(v * 100);

/** A divisao inicial: N parcelas iguais ao centavo (a diferenca do arredondamento vai na ULTIMA), todas no vencimento do titulo. */
export function divisaoInicial(valor: number, n: number, vencimento: string): ParcelaDoGesto[] {
  const total = centavos(Math.abs(valor));
  const q = Math.max(2, Math.trunc(n));
  const base = Math.floor(total / q);
  return Array.from({ length: q }, (_, i) => ({
    valor: (i === q - 1 ? total - base * (q - 1) : base) / 100,
    vencimento,
  }));
}

/** A soma das parcelas, em centavos inteiros (nulo conta zero). */
export const somaDasParcelas = (ps: readonly ParcelaDoGesto[]): number => ps.reduce((s, p) => s + centavos(p.valor ?? 0), 0) / 100;

/** O que impede gravar o parcelamento (nulo = pode): ao menos duas, todas com valor > 0 e vencimento, e a soma ao centavo. */
export function motivoParcelasInvalidas(ps: readonly ParcelaDoGesto[], valorDoTitulo: number): string | null {
  if (ps.length < 2) return 'Informe ao menos duas parcelas.';
  if (ps.some(p => p.valor == null || p.valor <= 0)) return 'Toda parcela precisa de valor maior que zero.';
  if (ps.some(p => !p.vencimento)) return 'Toda parcela precisa de vencimento.';
  const dif = centavos(Math.abs(valorDoTitulo)) - centavos(somaDasParcelas(ps));
  if (dif !== 0) return `A soma das parcelas difere do título em R$ ${(Math.abs(dif) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${dif > 0 ? 'falta' : 'sobra'}).`;
  return null;
}

/** O payload de `oc_recebimento_gesto` para o parcelar. */
export const parcelasDoPayload = (ps: readonly ParcelaDoGesto[]) => ps.map(p => ({ valor: p.valor, vencimento: p.vencimento }));
