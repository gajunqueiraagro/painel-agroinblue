/** VISAO-GERAL-02 — a safra que o bloco Agricultura da Visão Geral mostra. */
import type { SafraLavoura } from '@/hooks/useAreaPlantada';

/** A safra do mês: a que contém o 1º dia do mês pedido; sem nenhuma, a de início mais recente. */
export function safraDoMes(safras: readonly SafraLavoura[], anoMes: string): SafraLavoura | null {
  const dia = `${anoMes}-01`;
  const contem = safras.find((s) => s.data_inicio && s.data_fim && s.data_inicio <= dia && dia <= s.data_fim);
  if (contem) return contem;
  const comInicio = safras.filter((s) => s.data_inicio).sort((a, b) => (b.data_inicio ?? '').localeCompare(a.data_inicio ?? ''));
  return comInicio[0] ?? safras[safras.length - 1] ?? null;
}
