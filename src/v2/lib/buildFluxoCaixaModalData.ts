/**
 * buildFluxoCaixaModalData.ts
 *
 * Camada 3 / FASE 1 — Builder puro do Modal Fluxo de Caixa Realizado.
 *
 * Zero IO, zero React, zero hook. Função pura: input → output.
 *
 * Princípios:
 *   1. PC-100 soberano nos meses históricos (Jan..mesAlvo) — sempre
 *      `serieReal2026SaldoOficial`, nunca recalcular a partir de lançamentos.
 *   2. Projeção (mesAlvo+1..Dez) apenas nos modos 'confirmado' e 'estimado'.
 *   3. Saldo vs Fluxo: `meses[]` = saldo final; `fluxoMensal[]` = movimento
 *      líquido; `totalPeriodo` = Σ fluxoMensal conforme modo.
 *   4. Natureza entrada/saída derivada de `macro_custo` (matriz MACROS_ENTRADA).
 *   5. Top Impactos: top 5 |deltaAbs|, semântica natureza × signo do delta.
 *
 * Espelha MACROS_ENTRADA de fechamentoPeriodo.ts (referência oficial).
 */

import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';
import type {
  BuildFluxoCaixaModalInput,
  FluxoCaixaModalData,
  ImpactoDesvio,
  ImpactoSemantico,
  KPIHeader,
  LancamentoBruto,
  ModoToggle,
  NaturezaSubcentro,
  SerieAno12,
} from './fluxoCaixaModalTypes';

// ─── Constantes oficiais (espelham fechamentoPeriodo.ts) ─────────────

// Keep in sync with fechamentoPeriodo.ts (MACROS_ENTRADA).
// Duplicado intencionalmente para manter este builder puro e desacoplado
// dos tipos/DTO do Fechamento.
const MACROS_ENTRADA: ReadonlyArray<string> = [
  'Receita Operacional',
  'Entrada Financeira',
];

/**
 * Horizonte tático da projeção a partir de mesAlvo (em meses).
 * Nos modos 'confirmado' e 'estimado', a projeção cobre Jan→min(mesAlvo+3, Dez).
 * Janela curta = decisões executivas acionáveis. Para visão anual completa,
 * usar o Planejamento.
 */
const HORIZONTE_PROJECAO_MESES = 3;

/** Threshold para impacto 'neutro'. */
const THRESHOLD_NEUTRO_PCT = 0.01;
/**
 * 1% sobre o maior valor entre real e meta.
 * Evita classificar diferenças cosméticas como favoráveis/desfavoráveis.
 */
const RATIONALE_THRESHOLD_NEUTRO =
  '1% sobre o maior valor entre real e meta; evita ruído visual em diferenças cosméticas.';
// Referência ao rationale para auditoria/changelog (não consumido em runtime).
void RATIONALE_THRESHOLD_NEUTRO;

const ZEROS_12 = (): number[] => new Array(12).fill(0);
const NAN_12 = (): number[] => new Array(12).fill(NaN);

// ─── Helpers puros ───────────────────────────────────────────────────

function safeNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Normaliza status_transacao (case-insensitive, trim). */
function normalizarStatus(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().trim();
}

/** "2026-04" → 3 (0-based mês de Abril). Inválido → -1. */
function mesIdxDe(ano_mes: string): number {
  const partes = ano_mes.split('-');
  if (partes.length < 2) return -1;
  const m = parseInt(partes[1], 10);
  if (!Number.isFinite(m) || m < 1 || m > 12) return -1;
  return m - 1;
}

/** Determina natureza (entrada/saida) a partir do macro_custo. */
function naturezaDeMacro(macro: string | null | undefined): NaturezaSubcentro {
  return macro != null && MACROS_ENTRADA.includes(macro) ? 'entrada' : 'saida';
}

const MESES_ABREV: ReadonlyArray<string> = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

/** "Abr/26" (mês 0-based + ano completo) */
function mesYY(idx0: number, ano: number): string {
  const mes = MESES_ABREV[idx0] ?? '—';
  return `${mes}/${String(ano).slice(-2)}`;
}

/** Sinal convencional para construir fluxo líquido a partir do grid Meta:
 *  entrada → +1 (adiciona ao caixa); saída → -1 (reduz o caixa). */
function sinalConvencionalDeMacro(macro: string | null | undefined): 1 | -1 {
  return naturezaDeMacro(macro) === 'entrada' ? 1 : -1;
}

/** Filtra status_transacao conforme modo. cenario sempre 'realizado'. */
function statusValidoParaModo(status: string, modo: ModoToggle): boolean {
  if (modo === 'realizado') return status === 'realizado';
  if (modo === 'confirmado') return status === 'realizado' || status === 'agendado';
  // estimado: realizado + agendado + programado + previsto
  return (
    status === 'realizado' ||
    status === 'agendado' ||
    status === 'programado' ||
    status === 'previsto'
  );
}

/** Soma fluxoMensal[start..end] (inclusivo, 0-based). NaN tratado como 0. */
function somaFluxoNoIntervalo(fluxo: number[], start: number, end: number): number {
  let total = 0;
  for (let i = start; i <= end && i < fluxo.length; i++) {
    total += safeNum(fluxo[i]);
  }
  return total;
}

/** Calcula impacto semântico a partir de natureza × signo do delta. */
function calcularImpacto(
  natureza: NaturezaSubcentro,
  realPeriodo: number,
  metaPeriodo: number,
): ImpactoSemantico {
  const deltaAbs = realPeriodo - metaPeriodo;
  const escala = Math.max(Math.abs(realPeriodo), Math.abs(metaPeriodo));
  if (escala > 0 && Math.abs(deltaAbs) / escala < THRESHOLD_NEUTRO_PCT) {
    return 'neutro';
  }
  if (deltaAbs === 0) return 'neutro';
  // entrada + delta>0 → favoravel; saida + delta>0 → desfavoravel
  if (natureza === 'entrada') return deltaAbs > 0 ? 'favoravel' : 'desfavoravel';
  return deltaAbs > 0 ? 'desfavoravel' : 'favoravel';
}

// ─── Construção dos trilhos ──────────────────────────────────────────

/**
 * Trilho REAL ano-1 (cinza, contextual no gráfico).
 * saldo[N] = serieReal2025Saldo[N], NaN onde indefinido.
 * fluxoMensal[N] = saldo[N] - saldo[N-1]; fluxoMensal[0] = NaN (sem ponto N-1
 *   absoluto disponível — apenas saldo Dez/N-2 que não recebemos no input).
 * totalPeriodo = NaN (trilho não participa de KPI período).
 */
function montarTrilhoReal2025(serieReal2025Saldo: number[]): SerieAno12 {
  const meses = NAN_12();
  const fluxoMensal = NAN_12();
  for (let i = 0; i < 12; i++) {
    const v = serieReal2025Saldo[i];
    if (isFiniteNumber(v)) meses[i] = v;
  }
  for (let i = 1; i < 12; i++) {
    if (isFiniteNumber(meses[i]) && isFiniteNumber(meses[i - 1])) {
      fluxoMensal[i] = meses[i] - meses[i - 1];
    }
  }
  return { meses, fluxoMensal, totalPeriodo: NaN };
}

/**
 * Trilho META ano corrente (laranja).
 * fluxoMensal[N] = Σ row.meses[N] × sinalConvencionalDeMacro(row.macro_custo)
 *   para cada row do gridMetaConsolidado.
 * saldo[0] = saldoInicialMeta + fluxoMensal[0];
 * saldo[N>0] = saldo[N-1] + fluxoMensal[N].
 * totalPeriodo conforme modo.
 */
function montarTrilhoMeta(
  grid: SubcentroGrid[],
  saldoInicialMeta: number,
  modo: ModoToggle,
  mesAlvo: number,
  mesHorizonteInclusivo: number,
): SerieAno12 {
  const fluxoMensal = ZEROS_12();
  for (const row of grid) {
    const sinal = sinalConvencionalDeMacro(row.macro_custo);
    for (let i = 0; i < 12; i++) {
      const v = row.meses[i];
      if (isFiniteNumber(v)) fluxoMensal[i] += v * sinal;
    }
  }
  const meses = ZEROS_12();
  let acc = saldoInicialMeta;
  for (let i = 0; i < 12; i++) {
    acc += fluxoMensal[i];
    meses[i] = acc;
  }
  // totalPeriodo cobre Jan..mesAlvo no modo realizado, Jan..mesHorizonteInclusivo
  // nos modos com projeção (horizonte tático de HORIZONTE_PROJECAO_MESES).
  const totalPeriodo =
    modo === 'realizado'
      ? somaFluxoNoIntervalo(fluxoMensal, 0, mesAlvo - 1)
      : somaFluxoNoIntervalo(fluxoMensal, 0, mesHorizonteInclusivo);
  return { meses, fluxoMensal, totalPeriodo };
}

/**
 * Trilho REAL ano corrente (azul).
 *
 * REGRA SOBERANA: meses [0..mesAlvo-1] sempre vêm de
 *   serieReal2026SaldoOficial. fluxoMensal derivado por diferença:
 *   - fluxoMensal[0] = saldo[0] - saldoInicialReal
 *   - fluxoMensal[N>0] = saldo[N] - saldo[N-1]
 *
 * Meses [mesAlvo..11]:
 *   - modo='realizado': NaN (sem projeção)
 *   - modo='confirmado'/'estimado': projeta a partir de lancamentos já
 *     filtrados (por cenario+modo) e acumula saldo a partir do último
 *     saldo histórico.
 */
function montarTrilhoReal2026(
  serieReal2026SaldoOficial: number[],
  saldoInicialReal: number,
  fluxoLancFiltradoPorMes: number[],
  modo: ModoToggle,
  mesAlvo: number,
  mesHorizonteInclusivo: number,
): SerieAno12 {
  const meses = NAN_12();
  const fluxoMensal = NAN_12();

  // Histórico Jan..mesAlvo via PC-100 oficial.
  const idxLimiteHist = Math.min(mesAlvo, 12); // 0-based exclusive
  let saldoPrev = isFiniteNumber(saldoInicialReal) ? saldoInicialReal : NaN;
  for (let i = 0; i < idxLimiteHist; i++) {
    const saldo = serieReal2026SaldoOficial[i];
    if (isFiniteNumber(saldo)) {
      meses[i] = saldo;
      if (isFiniteNumber(saldoPrev)) {
        fluxoMensal[i] = saldo - saldoPrev;
      }
      saldoPrev = saldo;
    } else {
      saldoPrev = NaN;
    }
  }

  // Projeção mesAlvo..mesHorizonteInclusivo (apenas confirmado/estimado).
  // Cobre apenas os HORIZONTE_PROJECAO_MESES meses à frente do mesAlvo —
  // janela tática para decisões executivas acionáveis.
  if (modo !== 'realizado') {
    let accSaldo = saldoPrev;
    if (!isFiniteNumber(accSaldo)) {
      accSaldo = isFiniteNumber(saldoInicialReal) ? saldoInicialReal : NaN;
    }
    for (let i = idxLimiteHist; i <= mesHorizonteInclusivo && i < 12; i++) {
      const fluxo = safeNum(fluxoLancFiltradoPorMes[i]);
      fluxoMensal[i] = fluxo;
      if (isFiniteNumber(accSaldo)) {
        accSaldo = accSaldo + fluxo;
        meses[i] = accSaldo;
      }
    }
  }

  const totalPeriodo =
    modo === 'realizado'
      ? somaFluxoNoIntervalo(fluxoMensal, 0, mesAlvo - 1)
      : somaFluxoNoIntervalo(fluxoMensal, 0, mesHorizonteInclusivo);
  return { meses, fluxoMensal, totalPeriodo };
}

// ─── KPIs derivados ──────────────────────────────────────────────────

function montarKPIs(
  trilhoReal: SerieAno12,
  trilhoMeta: SerieAno12,
  modo: ModoToggle,
  mesAlvo: number,
  mesHorizonteInclusivo: number,
  ano: number,
): KPIHeader {
  const realizadoPeriodo = isFiniteNumber(trilhoReal.totalPeriodo) ? trilhoReal.totalPeriodo : null;
  const metaPeriodo = isFiniteNumber(trilhoMeta.totalPeriodo) ? trilhoMeta.totalPeriodo : null;
  const deltaAbs =
    realizadoPeriodo != null && metaPeriodo != null ? realizadoPeriodo - metaPeriodo : null;
  const deltaPct =
    deltaAbs != null && metaPeriodo != null && metaPeriodo !== 0
      ? (deltaAbs / Math.abs(metaPeriodo)) * 100
      : null;

  // Card 4 — semântica varia conforme modo:
  //   - realizado: SALDO FINAL = saldo[mesAlvo-1]
  //   - confirmado: SALDO PREVISTO = saldo[mesHorizonteInclusivo]
  //   - estimado: MENOR SALDO em [mesAlvo..mesHorizonteInclusivo]
  let card4Label = '';
  let card4Valor: number | null = null;
  let card4Sufixo = '';
  if (modo === 'realizado') {
    card4Label = 'Saldo Final';
    const v = trilhoReal.meses[mesAlvo - 1];
    card4Valor = isFiniteNumber(v) ? v : null;
    card4Sufixo = `em ${mesYY(mesAlvo - 1, ano)}`;
  } else if (modo === 'confirmado') {
    card4Label = 'Saldo Previsto';
    const v = trilhoReal.meses[mesHorizonteInclusivo];
    card4Valor = isFiniteNumber(v) ? v : null;
    card4Sufixo = `em ${mesYY(mesHorizonteInclusivo, ano)}`;
  } else {
    // estimado
    card4Label = 'Menor Saldo';
    let menor: number | null = null;
    let idxMenor = -1;
    // Busca em [mesAlvo..mesHorizonteInclusivo] (inclui o ponto de transição).
    for (let i = mesAlvo - 1; i <= mesHorizonteInclusivo && i < 12; i++) {
      const v = trilhoReal.meses[i];
      if (isFiniteNumber(v)) {
        if (menor == null || v < menor) {
          menor = v;
          idxMenor = i;
        }
      }
    }
    card4Valor = menor;
    card4Sufixo = idxMenor >= 0 ? `em ${mesYY(idxMenor, ano)}` : '';
  }

  return {
    realizadoPeriodo,
    metaPeriodo,
    deltaAbs,
    deltaPct,
    card4: {
      label: card4Label,
      valor: card4Valor,
      sufixo: card4Sufixo,
    },
  };
}

// ─── Top Impactos ────────────────────────────────────────────────────

interface AgrupadoSubcentro {
  subcentro: string;
  centro_custo: string | null;
  grupo_custo: string | null;
  macro_custo: string | null;
  realPeriodo: number; // sinal aplicado conforme natureza
  metaPeriodo: number; // sinal convencional conforme natureza
}

function montarTopImpactos(
  lancamentosFiltrados: LancamentoBruto[],
  grid: SubcentroGrid[],
  mesAlvo: number,
  modo: ModoToggle,
  mesHorizonteInclusivo: number,
): ImpactoDesvio[] {
  const mapa = new Map<string, AgrupadoSubcentro>();

  // Agregar real por subcentro. Janela do período:
  //   - 'realizado': Jan→mesAlvo
  //   - 'confirmado'/'estimado': Jan→mesHorizonteInclusivo
  const limite =
    modo === 'realizado' ? mesAlvo - 1 : mesHorizonteInclusivo; // 0-based inclusive
  for (const l of lancamentosFiltrados) {
    if (l.subcentro == null) continue;
    // Transferências entre contas são movimento neutro. NÃO impactam fluxo
    // líquido. Filtro por tipo_operacao (canônico). macro_custo é
    // inconsistente no banco (~74% NULL nesses lançamentos).
    if (l.tipo_operacao === '3-Transferências') continue;
    const idx = mesIdxDe(l.ano_mes);
    if (idx < 0 || idx > limite) continue;
    const key = l.subcentro;
    if (!mapa.has(key)) {
      mapa.set(key, {
        subcentro: l.subcentro,
        centro_custo: l.centro_custo,
        grupo_custo: l.grupo_custo,
        macro_custo: l.macro_custo,
        realPeriodo: 0,
        metaPeriodo: 0,
      });
    }
    const agg = mapa.get(key)!;
    // Top Impactos compara valores ABSOLUTOS por subcentro — natureza
    // (entrada/saída) é resolvida em calcularImpacto via macro_custo.
    // Evita inconsistência quando `sinal` vier null no banco (legados).
    agg.realPeriodo += Math.abs(safeNum(l.valor));
  }

  // Agregar meta por subcentro (Jan→mesAlvo) em valor absoluto.
  for (const row of grid) {
    // Grid Meta não expõe tipo_operacao. Fallback por macro_custo
    // (cobertura parcial — proteção secundária). Refinar quando
    // SubcentroGrid evoluir para expor tipo_operacao.
    if (row.macro_custo === 'Transferências') continue;
    let soma = 0;
    for (let i = 0; i <= limite && i < 12; i++) {
      const v = row.meses[i];
      if (isFiniteNumber(v)) soma += Math.abs(v);
    }
    if (soma === 0) {
      // Sem meta no período, mas pode ter realizado → ainda assim entra.
      if (!mapa.has(row.subcentro)) continue;
    }
    if (!mapa.has(row.subcentro)) {
      // PONTO DE ATENCAO Commit 4: subcentros so na Meta entram com
      // realPeriodo=0 para revelar gap. Refinamento visual (tag "nao
      // lancado", filtro em mesAlvo<=3 ou agrupamento separado) sera
      // decidido no Commit 4.
      mapa.set(row.subcentro, {
        subcentro: row.subcentro,
        centro_custo: row.centro_custo,
        grupo_custo: row.grupo_custo,
        macro_custo: row.macro_custo,
        realPeriodo: 0,
        metaPeriodo: 0,
      });
    }
    const agg = mapa.get(row.subcentro)!;
    agg.metaPeriodo += soma;
    // Preserva metadados se ausentes no real (subcentro sem lançamento).
    if (agg.macro_custo == null) agg.macro_custo = row.macro_custo;
    if (agg.centro_custo == null) agg.centro_custo = row.centro_custo;
    if (agg.grupo_custo == null) agg.grupo_custo = row.grupo_custo;
  }

  // Montar ImpactoDesvio e ordenar por |deltaAbs| desc, top 5.
  const impactos: ImpactoDesvio[] = [];
  for (const agg of mapa.values()) {
    const natureza = naturezaDeMacro(agg.macro_custo);
    const deltaAbs = agg.realPeriodo - agg.metaPeriodo;
    const deltaPct =
      agg.metaPeriodo !== 0 ? (deltaAbs / Math.abs(agg.metaPeriodo)) * 100 : 0;
    impactos.push({
      subcentro: agg.subcentro,
      centro_custo: agg.centro_custo,
      grupo_custo: agg.grupo_custo,
      macro_custo: agg.macro_custo,
      natureza,
      realPeriodo: agg.realPeriodo,
      metaPeriodo: agg.metaPeriodo,
      deltaAbs,
      deltaPct,
      impacto: calcularImpacto(natureza, agg.realPeriodo, agg.metaPeriodo),
    });
  }

  impactos.sort((a, b) => Math.abs(b.deltaAbs) - Math.abs(a.deltaAbs));
  return impactos.slice(0, 5);
}

// ─── Warnings + origem da projeção ───────────────────────────────────

function montarWarnings(
  modo: ModoToggle,
  lancamentos: LancamentoBruto[],
  isContextoIndividual: boolean | undefined,
): string[] {
  const warnings: string[] = [];

  if (isContextoIndividual) {
    warnings.push('Caixa é consolidado por cliente. Esta visão inclui todas as fazendas.');
  }

  if (modo === 'confirmado') {
    const temAgendado = lancamentos.some(
      (l) => normalizarStatus(l.status_transacao) === 'agendado',
    );
    if (!temAgendado) {
      warnings.push(
        "Status 'agendado' sem dados em 2026 — modo Confirmado equivale ao Realizado.",
      );
    }
  }

  if (modo === 'estimado') {
    const temProjetadoVazio = lancamentos.some((l) => {
      const s = normalizarStatus(l.status_transacao);
      return (s === 'programado' || s === 'previsto') && safeNum(l.valor) === 0;
    });
    if (temProjetadoVazio) {
      warnings.push(
        'Parcelas/lançamentos sem valor populado — projeção pode estar subestimada.',
      );
    }
  }

  return warnings;
}

function montarOrigemProjecao(modo: ModoToggle): string[] {
  const origem: string[] = [
    'Lançamentos realizados (conciliados)',
    'Meta consolidada (gridMetaConsolidado)',
    'Saldo inicial oficial (PC-100 / planFin)',
  ];
  if (modo === 'confirmado' || modo === 'estimado') {
    origem.push('Lançamentos agendados');
  }
  if (modo === 'estimado') {
    origem.push('Lançamentos programados');
    origem.push('Lançamentos previstos');
  }
  return origem;
}

// ─── Builder principal ───────────────────────────────────────────────

export function buildFluxoCaixaModalData(
  input: BuildFluxoCaixaModalInput,
): FluxoCaixaModalData {
  const {
    modo,
    ano,
    mesAlvo,
    serieReal2025Saldo,
    serieReal2026SaldoOficial,
    saldoInicialMeta,
    saldoInicialReal,
    lancamentos,
    gridMetaConsolidado,
    isContextoIndividual,
  } = input;

  // 1. Filtrar lançamentos por cenario='realizado' + status_transacao conforme modo.
  //    Normalização defensiva (lower + trim) espelha pattern de useFinanceiro.ts:263.
  const lancamentosFiltrados = lancamentos.filter((l) => {
    const cen = normalizarStatus(l.cenario);
    if (cen !== 'realizado') return false;
    const st = normalizarStatus(l.status_transacao);
    return statusValidoParaModo(st, modo);
  });

  // 2. Pré-agregar fluxoMensal[12] a partir dos lançamentos filtrados.
  //    Usado pela projeção do trilho REAL 2026 nos modos confirmado/estimado.
  const fluxoLancFiltradoPorMes = ZEROS_12();
  for (const l of lancamentosFiltrados) {
    const idx = mesIdxDe(l.ano_mes);
    if (idx < 0) continue;
    const sinal = l.sinal === -1 ? -1 : 1;
    fluxoLancFiltradoPorMes[idx] += safeNum(l.valor) * sinal;
  }

  // 2b. Calcular mesHorizonteInclusivo (0-based). Janela tática.
  //   - 'realizado': horizonte = mesAlvo - 1 (sem projeção).
  //   - 'confirmado'/'estimado': mesAlvo + HORIZONTE_PROJECAO_MESES - 1
  //     (capped em 11 = Dez).
  const mesHorizonteInclusivo =
    modo === 'realizado'
      ? Math.max(0, mesAlvo - 1)
      : Math.min(mesAlvo - 1 + HORIZONTE_PROJECAO_MESES, 11);

  // 3. Construir os 3 trilhos.
  const trilhoReal2025 = montarTrilhoReal2025(serieReal2025Saldo);
  const trilhoMeta2026 = montarTrilhoMeta(
    gridMetaConsolidado,
    saldoInicialMeta,
    modo,
    mesAlvo,
    mesHorizonteInclusivo,
  );
  const trilhoReal2026 = montarTrilhoReal2026(
    serieReal2026SaldoOficial,
    saldoInicialReal,
    fluxoLancFiltradoPorMes,
    modo,
    mesAlvo,
    mesHorizonteInclusivo,
  );

  // 4. KPIs.
  const kpis = montarKPIs(trilhoReal2026, trilhoMeta2026, modo, mesAlvo, mesHorizonteInclusivo, ano);

  // 5. Top Impactos — usa lançamentos já filtrados pelo modo + janela do
  //    horizonte tático para os modos com projeção.
  const topImpactos = montarTopImpactos(
    lancamentosFiltrados,
    gridMetaConsolidado,
    mesAlvo,
    modo,
    mesHorizonteInclusivo,
  );

  // 6. Labels pré-formatados (subtítulo do modal + cards 1/2).
  const idxAlvo = mesAlvo - 1; // 0-based
  const periodoRealizadoTxt = `Jan→${mesYY(idxAlvo, ano)}`;
  const periodoProjetadoTxt =
    mesHorizonteInclusivo > idxAlvo
      ? `${mesYY(idxAlvo + 1, ano)}→${mesYY(mesHorizonteInclusivo, ano)}`
      : '';
  let subtituloPeriodo = '';
  let labelCard1 = '';
  let labelCard2 = '';
  if (modo === 'realizado') {
    subtituloPeriodo = `Real ${ano} vs Meta ${ano} — ${periodoRealizadoTxt} realizado`;
    labelCard1 = `Fluxo Real ${periodoRealizadoTxt}`;
    labelCard2 = `Fluxo Meta ${periodoRealizadoTxt}`;
  } else if (modo === 'confirmado') {
    subtituloPeriodo = `Real ${ano} vs Meta ${ano} — ${periodoRealizadoTxt} realizado${periodoProjetadoTxt ? ' + ' + periodoProjetadoTxt + ' agendado' : ''}`;
    const periodoTotal = periodoProjetadoTxt
      ? `Jan→${mesYY(mesHorizonteInclusivo, ano)}`
      : periodoRealizadoTxt;
    labelCard1 = `Fluxo Real + Agendado ${periodoTotal}`;
    labelCard2 = `Fluxo Meta ${periodoTotal}`;
  } else {
    // estimado
    subtituloPeriodo = `Real ${ano} vs Meta ${ano} — ${periodoRealizadoTxt} realizado${periodoProjetadoTxt ? ' + ' + periodoProjetadoTxt + ' projetado' : ''}`;
    const periodoTotal = periodoProjetadoTxt
      ? `Jan→${mesYY(mesHorizonteInclusivo, ano)}`
      : periodoRealizadoTxt;
    labelCard1 = `Fluxo Projetado ${periodoTotal}`;
    labelCard2 = `Fluxo Meta ${periodoTotal}`;
  }

  // 7. Warnings + origem.
  const warnings = montarWarnings(modo, lancamentos, isContextoIndividual);
  const origemProjecao = montarOrigemProjecao(modo);

  return {
    trilhoReal2025,
    trilhoMeta2026,
    trilhoReal2026,
    kpis,
    topImpactos,
    modo,
    mesAlvo,
    ano,
    mesHorizonteInclusivo,
    subtituloPeriodo,
    labelCard1,
    labelCard2,
    warnings,
    origemProjecao,
  };
}
