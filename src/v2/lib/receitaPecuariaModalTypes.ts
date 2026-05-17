import type { LinhaExecutiva } from './blocoResumoExecutivoTypes';

export type DeltaSeguro = number | null;

export interface SubcentroComposicao {
  subcentro: string;
  centro_custo: string;
  metaMeses: number[];        // length 12
  realMeses: number[];        // length 12
  metaTotal: number;
  realTotal: number;
  delta: DeltaSeguro;
  impactoAbs: number;         // meta - real (sempre numérico)
}

export interface CentroComposicao {
  centro_custo: string;
  subcentros: SubcentroComposicao[];
  metaTotal: number;
  realTotal: number;
  delta: DeltaSeguro;
}

export interface ReceitaPecuariaModalData {
  linha: LinhaExecutiva;
  porCentro: CentroComposicao[];
  topImpactos: SubcentroComposicao[];
  conciliado: boolean;
  diferencaMeta: number;
  diferencaReal: number;
  centrosForaDaOrdemOficial: string[];
}
