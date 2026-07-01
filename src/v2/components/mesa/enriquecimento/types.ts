// ============================================================================
// Mesa Global de Enriquecimento — view-models da UI.
// A UI é BURRA: só apresenta strings/flags já prontos. Nenhuma regra de negócio,
// nenhum SELECT, nenhum formato aqui — tudo vem do adapter puro enriquecimentoView.
// ============================================================================
export type EnriqStatus = 'exato' | 'ambiguo' | 'sem_match' | 'ja_classificado' | 'divergente';

export interface EnriqSessaoVM {
  id: string;
  label: string;          // ex.: "Mai/2026 · Imp 02 · 01/07 09:15 · 191 linhas"
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

// Conta bancária para o filtro visual (Todas/BB/Bradesco/…). id '__sem__' = sem conta.
export interface EnriqContaVM {
  id: string;
  nome: string;
  total: number;
}

// Tom para colorir o "Resultado" (e o subcentro na lista).
export type EnriqTom = 'neutro' | 'ok' | 'muda' | 'bloqueio' | 'difere';

// Uma linha do comparativo Sistema atual | Excel | Resultado (strings já formatadas).
export interface EnriqComparativoLinha {
  campo: string;
  sistema: string;   // '—' quando vazio/indisponível
  excel: string;
  resultado: string;
  tom: EnriqTom;
}

export interface EnriqRowVM {
  id: string;
  linha: number | null;      // excel_linha_origem (contexto)
  status: EnriqStatus;
  statusLabel: string;
  aplicado: boolean;
  temMatch: boolean;   // lanc_id != null → pode Salvar (sem_match/ambíguo não resolvido = false)
  mudaAlgo: boolean;
  // LISTA (esquerda) — só o necessário para localizar o lançamento (lado SISTEMA).
  data: string;
  valor: string;
  banco: string;
  fornecedor: string;
  // DETALHE (direita) — comparativo completo Sistema | Excel | Resultado.
  comparativo: EnriqComparativoLinha[];
}
