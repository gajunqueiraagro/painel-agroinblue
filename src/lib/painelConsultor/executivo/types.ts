import type { RunwayStatus } from './config';

/**
 * Runway = "quantos meses o saldo de caixa aguenta ao ritmo atual?"
 *
 * Dois conceitos expostos lado a lado:
 *   runwayBruto    = saldoAtual / saidaMediaMensal
 *     responde: "se não entrar mais nada".
 *   runwayLiquido  = saldoAtual / deficitMedioMensal
 *     responde: "mantendo o padrão recente (saídas - entradas)".
 *
 * deficitMedioMensal pode ser NEGATIVO (cliente gerando caixa).
 * Quando ≤ 0, runwayLiquido = 'estavel'.
 *
 * janelaParcial:
 *   true quando havia menos meses disponíveis que janelaMediaMeses
 *   (ex: mes=2 com janela=3 — só há 2 meses). Os runways são calculados
 *   com os meses disponíveis e este flag sinaliza interpretação cautelosa.
 *
 * tendencia: gap reservado para Step futuro.
 *   Requer recalcular runway em mes-1 e classificar variação >|±thresholdTendencia|.
 */
export interface Runway {
  saldoAtual:           number | null;       // R$
  saidaMediaMensal:     number | null;       // R$ /mês (sempre ≥ 0)
  deficitMedioMensal:   number | null;       // R$ /mês (pode ser negativo)
  runwayBruto:          number | null;       // meses (sempre ≥ 0)
  runwayLiquido:        number | 'estavel' | null;
  janelaMeses:          number;              // efetiva: min(N, mesesDisponiveis)
  janelaParcial:        boolean;
  statusBruto:          RunwayStatus;
  statusLiquido:        RunwayStatus;
  tendencia:            null;                // gap reservado
}

export interface PC100_Executivo {
  runway: Runway | null;
}
