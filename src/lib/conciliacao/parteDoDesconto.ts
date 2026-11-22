/**
 * BAIXA-DESCONTO-BANCO-01 (115580) — a PARTE DA NF PAGA COM DESCONTO. No casar com desconto a NF fica com o que o banco pagou e a diferença
 * vira uma irmã SEM CAIXA (`saldo_de_id` = a NF, `origem_tipo` 'conc:desconto_parte'). Ela não é movimento de conta: a Conferência não a
 * recebe do banco (`sistema_completo` só tem caixa) e a mostra só como sub-linha cinza da NF casada, fora de qualquer soma.
 */
export const ORIGEM_PARTE_DO_DESCONTO = 'conc:desconto_parte';

export interface LinhaDaParte { saldo_de_id: string | null; valor: number | string | null }

/** O desconto de cada NF (a soma das partes vivas, em magnitude, 2 casas), pela NF. */
export function descontoPorNf(linhas: readonly LinhaDaParte[]): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const l of linhas) {
    if (!l.saldo_de_id) continue;
    const v = Math.abs(Number(l.valor ?? 0));
    if (!Number.isFinite(v) || v <= 0) continue;
    m.set(l.saldo_de_id, Math.round(((m.get(l.saldo_de_id) ?? 0) + v) * 100) / 100);
  }
  return m;
}
