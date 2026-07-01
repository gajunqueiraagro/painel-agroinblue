// ============================================================================
// Mesa Global de Enriquecimento — view-models da UI (PR-1 layout).
// A UI é BURRA: só apresenta estes tipos. Nenhuma regra de negócio aqui.
// O container mapeia (em PR-2+) vw_classificacao_staging_preview -> estes VMs.
// ============================================================================
export type EnriqStatus = 'exato' | 'ambiguo' | 'sem_match' | 'ja_classificado' | 'divergente';

export interface EnriqSessaoVM {
  id: string;
  label: string;          // ex.: "2026-05 · 191 linhas"
  exatos: number;
  ambiguos: number;
  aplicados: number;
}

export interface EnriqContagensVM {
  total: number;
  exatos: number;
  ambiguos: number;
  semMatch: number;
  aplicados: number;
}

export interface EnriqRowVM {
  id: string;
  data: string | null;
  valor: number | null;
  descricao: string | null;
  status: EnriqStatus;
  aplicado: boolean;
  // comparativo (o que o Aplicar faria — só leitura)
  subcentroAtual: string | null;
  subcentroProposto: string | null;
  gravaSubcentro: boolean;
  subcentroOrfao: boolean;
  favorecidoAtual: string | null;
  favorecidoProposto: string | null;
  gravaFavorecido: boolean;
  mudaAlgo: boolean;
}
