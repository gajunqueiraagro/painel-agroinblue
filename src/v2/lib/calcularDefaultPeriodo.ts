/**
 * calcularDefaultPeriodo.ts
 *
 * Retorna { periodoInicio, periodoFim } com último mês fechado P1 +
 * Jan do mesmo ano. Fallback: ano corrente Jan→mês anterior se nenhum
 * P1 fechado existir.
 *
 * Regra de "fechado": para o mês ser considerado fechado globalmente
 * (escopo cliente), TODAS as fazendas operacionais do cliente precisam
 * ter p1_oficial = true naquele mês.
 */

import type { StatusPilarMensal } from '@/v2/types/fechamentoPeriodo';

export function calcularDefaultPeriodo(
  statusPilares: StatusPilarMensal[],
  fazendasDoCliente: string[],
): { periodoInicio: string; periodoFim: string } {
  const porMes = new Map<string, Set<string>>();
  for (const s of statusPilares) {
    if (s.p1_oficial && fazendasDoCliente.includes(s.fazenda_id)) {
      if (!porMes.has(s.ano_mes)) porMes.set(s.ano_mes, new Set());
      porMes.get(s.ano_mes)!.add(s.fazenda_id);
    }
  }
  const totalFazendas = Math.max(1, fazendasDoCliente.length);
  const mesesFechados = Array.from(porMes.entries())
    .filter(([, set]) => set.size === totalFazendas)
    .map(([m]) => m)
    .sort();

  if (mesesFechados.length > 0) {
    const ultimo = mesesFechados[mesesFechados.length - 1];
    const ano = ultimo.split('-')[0];
    return { periodoInicio: `${ano}-01`, periodoFim: ultimo };
  }

  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return {
    periodoInicio: `${d.getFullYear()}-01`,
    periodoFim: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
  };
}
