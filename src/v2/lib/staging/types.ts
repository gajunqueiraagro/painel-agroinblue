// ============================================================================
// PR6.1 — Tipos de domínio do staging
// Tipos de domínio NUNCA importam de componentes React (regra travada PR5)
// ============================================================================

export type StatusPromocao = 'pendente' | 'promovido' | 'descartado' | 'erro';
export type OrigemAprovacaoStaging = 'sugestao_direta' | 'corrigido' | 'excel_orfao';

/** Espelho 1:1 da row da tabela mesa_lancamento_staging */
export interface StagingRow {
  staging_id: string;
  sessao_id: string;
  excel_key: string;

  cliente_id: string;
  fazenda_id: string | null;
  conta_bancaria_id: string | null;
  ano_mes: string;
  data_pagamento: string;
  data_competencia: string | null;
  valor: number;
  sinal: '1' | '-1' | '0' | null;
  tipo_operacao: '1-Entradas' | '2-Saídas' | '3-Transferências' | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  escopo_negocio: string | null;
  descricao: string | null;
  observacao: string | null;

  favorecido_id: string | null;
  favorecido_nome_marcado_novo: string | null;

  ofx_extrato_id: string | null;
  produto: string | null;
  origem_aprovacao: OrigemAprovacaoStaging;

  status_promocao: StatusPromocao;
  lancamento_v2_id: string | null;
  promovido_em: string | null;
  promovido_por: string | null;
  erro_promocao: string | null;

  created_at: string;
  updated_at: string;
}

/** Resultado da geração de staging */
export interface ResultadoGeracaoStaging {
  gerados: number;       // INSERTs novos
  ja_existentes: number; // Já estavam na tabela (idempotência via UNIQUE)
  total_apos: number;    // Total de rows na sessão após operação
  erros: Array<{ excel_key: string; motivo: string }>;
}
