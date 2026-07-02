// ============================================================================
// Mesa Global de Enriquecimento — view-models da UI.
// A UI é BURRA: só apresenta strings/flags já prontos. Nenhuma regra de negócio,
// nenhum SELECT, nenhum formato aqui — tudo vem do adapter puro enriquecimentoView.
// ============================================================================
export type EnriqStatus = 'exato' | 'ambiguo' | 'sem_match' | 'ja_classificado' | 'divergente' | 'ambiguo_resolvido';

// PR-U2d-1 — estado OPERACIONAL da linha (ciclo Editar → Aplicar → Resolvida).
// Derivado do VM (aplicado/temMatch/órfão/match_status); é a leitura principal.
export type EnriqEstado = 'pronto' | 'revisar' | 'aplicado' | 'sem_vinculo' | 'nada';

export interface EnriqSessaoVM {
  id: string;
  label: string;          // ex.: "Mai/2026 · Imp 02 · 01/07 09:15 · 191 linhas"
  exatos: number;
  ambiguos: number;
  aplicados: number;
}

// PR-P0-2 — contadores cobrem TODOS os status e somam ao Total; `aplicados` é
// dimensão/flag ortogonal (sobrepõe qualquer status) e NÃO entra na soma.
export interface EnriqContagensVM {
  total: number;                        // = soma dos 6 status
  status: Record<EnriqStatus, number>;  // exato/ambiguo/sem_match/divergente/ja_classificado/ambiguo_resolvido
  aplicados: number;                    // flag informativa (fora da soma)
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

// PR-U2b — descritor de campo editável da proposta (a UI de U2c consome; aqui só
// prepara). editor = qual componente OFICIAL dos Lançamentos reutilizar.
export type EnriqCampoId = 'subcentro' | 'favorecido_id' | 'fazenda_id' | 'produto' | 'safra' | 'categoria';
export interface EnriqCampoEditavel {
  campo: EnriqCampoId;
  label: string;
  editor: 'plano' | 'fornecedor' | 'fazenda' | 'texto';
  valorAtual: string | null;       // valor proposto atual (display)
  suportadoPeloApply: boolean;     // subcentro/favorecido/fazenda=true; produto/safra/categoria=false (carry-only)
}

// PR-U2b — proveniência da resolução (projeção read-only de _meta). Só rastreabilidade.
export interface EnriqProveniencia {
  tier: string | null;
  origem: string | null;           // origem_resolucao (tier | 'manual' | 'orfao')
  motorVersion: number | null;
}

// PR-U2c-2A — valores crus da proposta que os editores inline (U2c-2B..2E) consomem.
export interface EnriqEdicao {
  subcentro: string | null;
  favorecidoId: string | null;
  fazendaId: string | null;
  produto: string | null;
  tipoOperacao: string | null;     // filtro do PlanoSubcentroSelect
  macro: string | null;            // FazendaSelect: força Administrativo se 'Dividendos'
  descricaoAtual: string | null;   // P0-3: lanc_descricao (editor "Produto / Descrição")
}

export interface EnriqRowVM {
  id: string;
  linha: number | null;      // excel_linha_origem (contexto)
  status: EnriqStatus;
  statusLabel: string;
  estado: EnriqEstado;       // PR-U2d-1 — estado operacional (leitura principal)
  aplicado: boolean;
  temMatch: boolean;        // lanc_id != null → pode Salvar (sem_match/ambíguo não resolvido = false)
  subcentroOrfao: boolean;  // proposto fora do plano → NÃO pode Salvar (trigger rejeita); editar no PR-U2
  mudaAlgo: boolean;
  // LISTA (esquerda) — só o necessário para localizar o lançamento (lado SISTEMA).
  data: string;
  valor: string;
  banco: string;
  fornecedor: string;
  // DETALHE (direita) — comparativo completo Sistema | Excel | Resultado.
  comparativo: EnriqComparativoLinha[];
  // PR-U2b — infra do editor (ainda SEM edição visual): descritores + proveniência.
  camposEditaveis: EnriqCampoEditavel[];
  proveniencia: EnriqProveniencia;
  // PR-U2c-2A — valores crus da proposta (para os editores inline).
  edicao: EnriqEdicao;
}
