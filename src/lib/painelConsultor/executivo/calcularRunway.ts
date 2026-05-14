/**
 * Função pura calcularRunway.
 *
 * Sem nova query, sem efeito colateral. Recebe séries já calculadas
 * pelo PC-100 (caixaIndicador.serieAno + saidasTotais.serieAno) e
 * o mes corrente. Devolve Runway completo.
 *
 * FORMAS DE CÁLCULO:
 *   saidaMediaMensal   = média( saidasSerie[mes-janela+1 .. mes] )
 *   variacao(m)        = caixaSerie[m] - caixaSerie[m-1]
 *   deficit(m)         = -variacao(m)   (positivo = queimou caixa)
 *   deficitMedioMensal = média( deficit[mes-janela+1 .. mes] )
 *
 *   runwayBruto = saldoAtual > 0 && saidaMedia > 0
 *                 ? saldoAtual / saidaMedia
 *                 : (saldoAtual <= 0 ? 0 : null)
 *
 *   runwayLiquido =
 *     saldoAtual <= 0    → 0
 *     deficitMedio <= 0  → 'estavel'   (gerando caixa ou neutro)
 *     senão              → saldoAtual / deficitMedio
 *
 * CLASSIFICAÇÃO:
 *   status = 'curto'          se runway ≤ thresholdCurto
 *          | 'intermediario'  se ≤ thresholdIntermediario
 *          | 'alongado'       se ≤ thresholdAlongado
 *          | 'estavel'        se 'estavel' (só runwayLiquido)
 *          | null             se runway é null
 *   (runway > thresholdAlongado também classifica como 'alongado')
 *
 * EDGE CASES:
 *   - mes < janela → calcula com meses disponíveis, marca janelaParcial=true
 *   - saidasSerie[i] = NaN → ignora aquele mês na média
 *   - caixaSerie[i] = NaN → variação naquele intervalo = NaN, ignora
 *   - saldoAtual ≤ 0 → runway = 0, status = 'curto'
 *   - saldoAtual null/NaN → runway = null
 */
import { RUNWAY_CONFIG, type RunwayStatus } from './config';
import type { Runway } from './types';

interface CalcularRunwayArgs {
  /** caixaIndicador.serieAno — length 13: 0=Dez(ano-1), 1..12=Jan..Dez. */
  caixaSerie:  number[];
  /** saidasTotais.serieAno em mode 'mes' (não acumulado) — length 13. */
  saidasSerie: number[];
  /** Mês corrente (1..12). */
  mes:         number;
}

const safe = (v: number | undefined | null): number | null =>
  v == null || Number.isNaN(v) ? null : v;

function classificarStatus(
  runway: number | 'estavel' | null,
): RunwayStatus {
  if (runway === null) return null;
  if (runway === 'estavel') return 'estavel';
  if (runway <= RUNWAY_CONFIG.thresholdCurto) return 'curto';
  if (runway <= RUNWAY_CONFIG.thresholdIntermediario) return 'intermediario';
  return 'alongado';
}

export function calcularRunway({
  caixaSerie,
  saidasSerie,
  mes,
}: CalcularRunwayArgs): Runway | null {
  if (mes < 1 || mes > 12) return null;
  if (!Array.isArray(caixaSerie) || caixaSerie.length !== 13) return null;
  if (!Array.isArray(saidasSerie) || saidasSerie.length !== 13) return null;

  const saldoAtual = safe(caixaSerie[mes]);

  // ─── Janela móvel ─────────────────────────────────────────────────
  const janelaSolicitada = RUNWAY_CONFIG.janelaMediaMeses;
  const inicioJanela = Math.max(1, mes - janelaSolicitada + 1);
  const janelaEfetiva = mes - inicioJanela + 1;
  const janelaParcial = janelaEfetiva < janelaSolicitada;

  // ─── Saídas: média da janela ──────────────────────────────────────
  const saidasNaJanela: number[] = [];
  for (let m = inicioJanela; m <= mes; m++) {
    const v = safe(saidasSerie[m]);
    if (v != null) saidasNaJanela.push(v);
  }
  const saidaMediaMensal = saidasNaJanela.length > 0
    ? saidasNaJanela.reduce((s, v) => s + v, 0) / saidasNaJanela.length
    : null;

  // ─── Déficit: média da janela ─────────────────────────────────────
  // deficit(m) = caixaSerie[m-1] - caixaSerie[m]  (positivo = queimou)
  const deficitsNaJanela: number[] = [];
  for (let m = inicioJanela; m <= mes; m++) {
    const curr = safe(caixaSerie[m]);
    const prev = safe(caixaSerie[m - 1]);
    if (curr != null && prev != null) {
      deficitsNaJanela.push(prev - curr);
    }
  }
  const deficitMedioMensal = deficitsNaJanela.length > 0
    ? deficitsNaJanela.reduce((s, v) => s + v, 0) / deficitsNaJanela.length
    : null;

  // ─── Runway Bruto ────────────────────────────────────────────────
  let runwayBruto: number | null;
  if (saldoAtual == null) {
    runwayBruto = null;
  } else if (saldoAtual <= 0) {
    runwayBruto = 0;
  } else if (saidaMediaMensal != null && saidaMediaMensal > 0) {
    runwayBruto = saldoAtual / saidaMediaMensal;
  } else {
    // saídas zero ou indisponíveis — runway "infinito", representamos como null
    runwayBruto = null;
  }

  // ─── Runway Líquido ──────────────────────────────────────────────
  let runwayLiquido: number | 'estavel' | null;
  if (saldoAtual == null) {
    runwayLiquido = null;
  } else if (saldoAtual <= 0) {
    runwayLiquido = 0;
  } else if (deficitMedioMensal == null) {
    runwayLiquido = null;
  } else if (deficitMedioMensal <= 0) {
    runwayLiquido = 'estavel';
  } else {
    runwayLiquido = saldoAtual / deficitMedioMensal;
  }

  return {
    saldoAtual,
    saidaMediaMensal,
    deficitMedioMensal,
    runwayBruto,
    runwayLiquido,
    janelaMeses:   janelaEfetiva,
    janelaParcial,
    statusBruto:   classificarStatus(runwayBruto),
    statusLiquido: classificarStatus(runwayLiquido),
    tendencia:     null,
  };
}
