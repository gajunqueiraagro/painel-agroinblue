/**
 * Função pura montarCaixaIndicador.
 *
 * Constrói IndicadorFinanceiroShape para o caixa do cliente.
 *
 * REGRA ESTOQUE (inviolável):
 *   serieAno IGUAL em viewMode='mes' e 'periodo'. Saldo é foto, não fluxo.
 *   Período = posição do mês selecionado, NÃO soma de Jan..mes.
 *
 * ESCOPO CLIENTE:
 *   Esta função NÃO recebe fazendaId. Caixa do cliente é sempre o
 *   mesmo independente da fazenda selecionada.
 *
 * GAPS RESERVADOS:
 *   - serieMeta: Array(13).fill(NaN) — Meta de caixa exige cadeia
 *     planejamento financeiro completo. Será preenchida em Step próprio.
 *   - deltaMeta: null pela mesma razão.
 */
import type { IndicadorFinanceiroShape } from '@/hooks/usePainelConsultorData';

interface MontarCaixaIndicadorArgs {
  serieAno:    number[];   // length 13, 0=Dez(ano-1), 1..12=Jan..Dez(ano)
  serieAnoAnt: number[];   // length 13, 0=Dez(ano-2), 1..12=Jan..Dez(ano-1)
  mes:         number;     // 1..12
  isPeriodo:   boolean;    // viewMode === 'periodo'
}

const safe = (v: number | undefined | null): number | null =>
  v == null || Number.isNaN(v) ? null : v;

/**
 * Delta percentual entre dois valores. null se prev é null/0/inválido.
 */
function calcDeltaPct(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null) return null;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function montarCaixaIndicador({
  serieAno,
  serieAnoAnt,
  mes,
  // isPeriodo recebido mas IRRELEVANTE para estoque — serieAno é a mesma
  // nos 2 modos. Mantemos o param para consistência de API com outros
  // builders e para sinalizar que a regra foi considerada.
  isPeriodo: _isPeriodo,
}: MontarCaixaIndicadorArgs): IndicadorFinanceiroShape | null {
  if (mes < 1 || mes > 12) return null;
  if (!Array.isArray(serieAno) || serieAno.length !== 13) return null;
  if (!Array.isArray(serieAnoAnt) || serieAnoAnt.length !== 13) return null;

  // valor = posição do mês selecionado (regra estoque)
  const valor = safe(serieAno[mes]);

  // deltaMes: comparação com mês anterior dentro da MESMA série.
  // mes=1 → prev = serieAno[0] = saldo Dez(ano-1). Encadeamento natural.
  const prevMes = safe(serieAno[mes - 1]);
  const deltaMes = calcDeltaPct(valor, prevMes);

  // deltaAno: comparação com o mesmo mês do ano anterior
  const valorAnoAnt = safe(serieAnoAnt[mes]);
  const deltaAno = calcDeltaPct(valor, valorAnoAnt);

  // Meta: gap reservado para Step próprio
  const serieMeta: number[] = new Array(13).fill(NaN);
  const deltaMeta: number | null = null;

  return {
    label:      'CAIXA',
    titulo:     'Caixa',
    subtitulo:  'Saldo bancário consolidado do cliente no fim do mês selecionado',
    valor,
    deltaMes,
    deltaAno,
    deltaMeta,
    serieAno,
    serieAnoAnt,
    serieMeta,
  };
}
