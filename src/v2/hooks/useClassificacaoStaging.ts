/**
 * useClassificacaoStaging — wrappers React Query para as RPCs do PR-M:
 *   - fn_classificacao_populate_staging(sessao_id, cliente_id, rows)
 *   - fn_classificacao_apply(sessao_id)
 *   + SELECT * FROM financeiro_classificacao_staging WHERE sessao_id = $1
 *
 * Tipos do supabase ainda não regenerados após PR-M aplicado via
 * Chrome MCP (PR-M2: sincronizar quando regenerar). Casts `(supabase as any)`
 * são intencionais e padrão do projeto para RPCs/tabelas novas.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ClassificacaoRow } from '@/v2/lib/excelPreview/loteToClassificacao';

// PR-M2: sincronizar com fn_classificacao_populate_staging quando types regenerarem.
export type MatchStatus =
  | 'exato'
  | 'ambiguo'
  | 'sem_match'
  | 'ja_classificado'
  | 'divergente';

/** Espelho da row em financeiro_classificacao_staging. */
export interface ClassificacaoStagingRow {
  staging_id: string;
  sessao_id: string;
  cliente_id: string;
  excel_linha_origem: number | null;
  excel_subcentro: string | null;
  excel_fornecedor: string | null;
  excel_produto: string | null;
  excel_conta_origem: string | null;
  excel_conta_destino: string | null;
  excel_ano_mes: string | null;
  excel_data: string | null;
  excel_valor: number | null;
  excel_tipo_operacao: string | null;
  excel_fazenda_codigo: string | null;
  match_lancamento_id: string | null;
  match_status: MatchStatus;
  update_proposto: Record<string, unknown> | null;
  estado_anterior: Record<string, unknown> | null;
  aplicado: boolean;
  aplicado_em: string | null;
  aplicado_por: string | null;
  erro_apply: string | null;
  created_at: string;
  updated_at: string;
}

export interface PopulateResult {
  sessao_id: string;
  total_linhas: number;
  inseridas: number;
  counts_por_status: Partial<Record<MatchStatus, number>>;
}

export interface ApplyResult {
  sessao_id: string;
  aplicados: number;
  pulados_subcentro_preenchido: number;
  erros: number;
}

function queryKeyStaging(sessaoId: string | null) {
  return ['classificacao-staging', sessaoId ?? null] as const;
}

/**
 * Hook agregador da staging de classificação.
 *
 * @param sessaoId  UUID da sessão (null = sem fetch).
 * @param clienteId Cliente atual (usado em populate; opcional na query).
 */
export function useClassificacaoStaging(
  sessaoId: string | null,
  clienteId: string | null | undefined,
) {
  const qc = useQueryClient();

  const stagingQuery = useQuery({
    queryKey: queryKeyStaging(sessaoId),
    enabled: !!sessaoId,
    queryFn: async () => {
      // PR-M2: tipos de RPC/tabelas novas ainda não regenerados — cast `any`.
      const { data, error } = await (supabase as any)
        .from('financeiro_classificacao_staging')
        .select('*')
        .eq('sessao_id', sessaoId)
        .order('excel_linha_origem', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassificacaoStagingRow[];
    },
    staleTime: 30_000,
  });

  const populateMutation = useMutation({
    mutationFn: async (params: {
      sessao_id: string;
      rows: ClassificacaoRow[];
    }): Promise<PopulateResult> => {
      if (!clienteId) throw new Error('Cliente atual não definido');
      // PR-M2: cast `any` enquanto types não regenerarem.
      const { data, error } = await (supabase as any).rpc(
        'fn_classificacao_populate_staging',
        {
          p_sessao_id: params.sessao_id,
          p_cliente_id: clienteId,
          p_rows: params.rows,
        },
      );
      if (error) throw error;
      return data as PopulateResult;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeyStaging(variables.sessao_id) });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (sessao_id: string): Promise<ApplyResult> => {
      // PR-M2: cast `any` enquanto types não regenerarem.
      const { data, error } = await (supabase as any).rpc(
        'fn_classificacao_apply',
        { p_sessao_id: sessao_id },
      );
      if (error) throw error;
      return data as ApplyResult;
    },
    onSuccess: (_data, sessao_id) => {
      qc.invalidateQueries({ queryKey: queryKeyStaging(sessao_id) });
    },
  });

  return {
    staging: stagingQuery.data ?? [],
    isLoading: stagingQuery.isLoading,
    isFetching: stagingQuery.isFetching,
    populate: populateMutation.mutateAsync,
    isPopulating: populateMutation.isPending,
    populateResult: populateMutation.data ?? null,
    apply: applyMutation.mutateAsync,
    isApplying: applyMutation.isPending,
    applyResult: applyMutation.data ?? null,
  };
}
