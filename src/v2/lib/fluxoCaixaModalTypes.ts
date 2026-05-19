/**
 * fluxoCaixaModalTypes.ts
 *
 * Camada 3 / FASE 1 — Tipos do Modal Fluxo de Caixa Realizado.
 *
 * Princípios:
 *   - SALDO vs FLUXO separados: `meses[]` é saldo final, `fluxoMensal[]` é
 *     movimento líquido (entradas - saídas), `totalPeriodo` é soma de
 *     fluxoMensal conforme modo.
 *   - PC-100 soberano nos meses históricos (Jan..mesAlvo) — nunca recalcular.
 *   - Modal read-only analítico: não cria, edita ou deleta nada.
 *   - Caixa é consolidado por cliente (PC-100); flag isContextoIndividual
 *     dispara warning quando consumido em modo Fazenda Individual.
 */

import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';

// ─── Toggle de modo do modal ─────────────────────────────────────────

export type ModoToggle = 'realizado' | 'confirmado' | 'estimado';

// ─── Trilho mensal (12 posições, 0-based Jan..Dez) ───────────────────

export interface SerieAno12 {
  /** Saldo final de cada mês. 12 elementos, [0]=Jan ... [11]=Dez. NaN onde indefinido. */
  meses: number[];
  /** Fluxo líquido do mês (entradas − saídas). 12 elementos. NaN onde indefinido. */
  fluxoMensal: number[];
  /** Soma de fluxoMensal conforme modo:
   *   - modo='realizado': Jan→mesAlvo
   *   - modo='confirmado'/'estimado': Jan→Dez */
  totalPeriodo: number;
}

// ─── KPI Header ──────────────────────────────────────────────────────

export interface KPIHeader {
  /** Fluxo líquido REAL do período conforme modo. */
  realizadoPeriodo: number | null;
  /** Fluxo líquido META do período conforme modo. */
  metaPeriodo: number | null;
  /** realizadoPeriodo - metaPeriodo. */
  deltaAbs: number | null;
  /** (deltaAbs / |metaPeriodo|) × 100. null se metaPeriodo===0/null. */
  deltaPct: number | null;
  /** Card 4 — valor + label + sufixo já computados pelo builder conforme modo:
   *   - 'realizado': SALDO FINAL — saldo[mesAlvo-1] + "em {MES_ALVO}/{YY}"
   *   - 'confirmado': SALDO PREVISTO — saldo[mesHorizonteInclusivo] + "em {MES_HORIZONTE}/{YY}"
   *   - 'estimado': MENOR SALDO — min(saldo[mesAlvo..mesHorizonte]) + "em {MES_MENOR}/{YY}" */
  card4: {
    label: string;
    valor: number | null;
    sufixo: string;
  };
}

// ─── Top Impactos por subcentro ──────────────────────────────────────

export type NaturezaSubcentro = 'entrada' | 'saida';
export type ImpactoSemantico = 'favoravel' | 'desfavoravel' | 'neutro';

export interface ImpactoDesvio {
  subcentro: string;
  centro_custo: string | null;
  grupo_custo: string | null;
  macro_custo: string | null;
  natureza: NaturezaSubcentro;
  /** Real do subcentro Jan→mesAlvo (sinal aplicado). */
  realPeriodo: number;
  /** Meta do subcentro Jan→mesAlvo (sinal convencional pela natureza). */
  metaPeriodo: number;
  /** realPeriodo - metaPeriodo. */
  deltaAbs: number;
  /** (deltaAbs / |metaPeriodo|) × 100. */
  deltaPct: number;
  /** Determinado pela combinação natureza × signo do delta:
   *   - entrada + delta>0 → 'favoravel' (receita acima da meta)
   *   - entrada + delta<0 → 'desfavoravel'
   *   - saida   + delta>0 → 'desfavoravel' (custo acima da meta)
   *   - saida   + delta<0 → 'favoravel'
   *   - |deltaAbs| muito pequeno → 'neutro' */
  impacto: ImpactoSemantico;
}

// ─── DTO completo do modal ───────────────────────────────────────────

export interface FluxoCaixaModalData {
  trilhoReal2025: SerieAno12;
  trilhoMeta2026: SerieAno12;
  trilhoReal2026: SerieAno12;
  kpis: KPIHeader;
  topImpactos: ImpactoDesvio[];
  modo: ModoToggle;
  mesAlvo: number;
  ano: number;
  /** Limite superior INCLUSIVO (0-based) da projeção do trilho Real 2026
   *  e dos KPIs nos modos 'confirmado'/'estimado'. Calculado como
   *  min(mesAlvo - 1 + HORIZONTE_PROJECAO_MESES, 11). Em modo 'realizado'
   *  = mesAlvo - 1 (sem projeção). Eixo X do gráfico permanece Jan→Dez. */
  mesHorizonteInclusivo: number;
  /** Subtítulo do modal pré-formatado conforme modo. */
  subtituloPeriodo: string;
  /** Label do KPI Card 1 ("Fluxo Real ..."). Já com período aplicado. */
  labelCard1: string;
  /** Label do KPI Card 2 ("Fluxo Meta ..."). Já com período aplicado. */
  labelCard2: string;
  warnings: string[];
  /** Lista de fontes usadas na projeção, para rodapé de origem. */
  origemProjecao: string[];
}

// ─── Lançamento bruto (input do builder) ─────────────────────────────

/**
 * Shape mínimo do `financeiro_lancamentos_v2` necessário ao builder.
 * Apenas colunas que o builder consome — query do hook seleciona
 * exatamente estes campos (sem `SELECT *`).
 */
export interface LancamentoBruto {
  id: string;
  /** "YYYY-MM" — mês do lançamento. */
  ano_mes: string;
  /** Valor absoluto positivo. Sinal aplicado via `sinal`. */
  valor: number;
  /** +1 = entrada, -1 = saída. */
  sinal: 1 | -1;
  /** 'realizado' | 'agendado' | 'programado' | 'previsto' (case-insensitive). */
  status_transacao: string;
  /** 'realizado' | 'meta' — builder filtra apenas 'realizado'. */
  cenario: string;
  // Necessário para filtrar transferências entre contas
  // (tipo_operacao === '3-Transferências'). macro_custo é inconsistente no
  // banco (~74% NULL em lançamentos com tipo_operacao = '3-Transferências'),
  // portanto não pode ser fonte única do filtro.
  tipo_operacao: string | null;
  subcentro: string | null;
  centro_custo: string | null;
  grupo_custo: string | null;
  macro_custo: string | null;
}

// ─── Input do builder ────────────────────────────────────────────────

export interface BuildFluxoCaixaModalInput {
  modo: ModoToggle;
  ano: number;
  /** Mês alvo do filtro (1..12). Define corte histórico/projeção. */
  mesAlvo: number;
  /** Real ano-1 — saldo final por mês Jan..Dez (12 elementos).
   *  Fonte: painel.caixaIndicador.serieAnoAnt.slice(1) */
  serieReal2025Saldo: number[];
  /** Real ano corrente — saldo final por mês Jan..Dez (12 elementos).
   *  Fonte: painel.caixaIndicador.serieAno.slice(1).
   *  SOBERANO nos meses históricos — nunca recalcular. */
  serieReal2026SaldoOficial: number[];
  /** Saldo inicial Jan/N da Meta — fonte: planFin.saldoInicial. */
  saldoInicialMeta: number;
  /** Saldo inicial Jan/N do Real — fonte: painel.caixaIndicador.serieAnoAnt[0] (Dez/N-1). */
  saldoInicialReal: number;
  /** Lançamentos brutos do ano (já filtrados por escopo cliente/fazenda
   *  no hook). Builder aplica filtros adicionais de cenario e modo. */
  lancamentos: LancamentoBruto[];
  /** Grid Meta consolidada (base + 4 maps de extras) com granularidade
   *  subcentro × mês. composeGridMetaConsolidado já aplicado pelo caller. */
  gridMetaConsolidado: SubcentroGrid[];
  /** True quando consumido em modo Fazenda Individual. PC-100 caixaIndicador
   *  é por cliente — flag dispara warning informativo. */
  isContextoIndividual?: boolean;
}
