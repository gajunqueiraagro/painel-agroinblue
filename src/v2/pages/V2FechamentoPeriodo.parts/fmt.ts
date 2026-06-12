/**
 * Formatadores compartilhados pelos sub-componentes do V2FechamentoPeriodo.
 */

import type { FechamentoPeriodoDTO } from '@/v2/types/fechamentoPeriodo';
import type { PainelConsultorDataResult } from '@/hooks/usePainelConsultorData';

export function fmt(v: number | null | undefined, dec = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function pct(v: number | null | undefined, dec = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(dec).replace('.', ',')}%`;
}

export function formatarPeriodo(ini: string, fim: string): string {
  // "YYYY-MM" → "Mmm/YY"
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const [yi, mi] = ini.split('-').map(Number);
  const [yf, mf] = fim.split('-').map(Number);
  if (yi === yf) {
    return `${meses[mi - 1]} a ${meses[mf - 1]}/${String(yf).slice(-2)}`;
  }
  return `${meses[mi - 1]}/${String(yi).slice(-2)} a ${meses[mf - 1]}/${String(yf).slice(-2)}`;
}

export function classeDiferenca(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  if (v > 0.05) return 'dif-positiva';
  if (v < -0.05) return 'dif-negativa';
  return '';
}

/**
 * Escopo do boletim ("Pecuária" / "Agricultura" / "Pecuária + Agricultura")
 * derivado das áreas reais do PC-100. Movido da Capa — fonte única.
 */
function derivarEscopo(painel: PainelConsultorDataResult | null): string {
  const pec = painel?.areaPecuariaRealMes ?? 0;
  const agri = painel?.areaAgriculturaRealMes ?? 0;
  return (
    [pec > 0 && 'Pecuária', agri > 0 && 'Agricultura'].filter(Boolean).join(' + ') ||
    'Pecuária'
  );
}

/**
 * Subtítulo de identificação ÚNICO do boletim: Cliente • Fazenda/Global •
 * Período • Escopo. Fonte única — o parent calcula 1x e distribui aos blocos.
 * Reproduz verbatim a expressão que a Capa usava.
 */
export function montarSubtituloBoletim(params: {
  dto: Pick<FechamentoPeriodoDTO, 'periodoInicio' | 'periodoFim'>;
  nomeCliente?: string | null;
  nomeFazenda?: string | null;
  painel: PainelConsultorDataResult | null;
}): string {
  const { dto, nomeCliente, nomeFazenda, painel } = params;
  const escopoTexto = derivarEscopo(painel);
  return [
    nomeCliente ?? '—',
    ...(nomeFazenda ? [nomeFazenda] : []),
    formatarPeriodo(dto.periodoInicio, dto.periodoFim),
    escopoTexto,
  ].join(' • ');
}
