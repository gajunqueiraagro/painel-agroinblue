/**
 * useSplitSubstituir — ato atômico do split 1→N (PR-MESA-SPLIT-01): substitui um
 * lançamento consolidado não explicado pelos N detalhes do Excel de uma composição.
 * Chama fn_classificacao_split_substituir. O front NÃO recalcula a composição — passa
 * exatamente os staging_ids retornados pela fn_classificacao_composicao_sugerida.
 *
 * onSuccess invalida as queries envolvidas (não-explicados + staging + sessões +
 * composição + cbi-batch — padrão PR-CBI-REFRESH-01).
 *
 * Cast `(supabase as any)` intencional: tipos não regenerados (padrão do projeto).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useSplitSubstituir(sessaoId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { lancamentoId: string; stagingIds: string[] }): Promise<any> => {
      const { data, error } = await (supabase as any).rpc('fn_classificacao_split_substituir', {
        p_lancamento_id: params.lancamentoId,
        p_sessao_id: sessaoId,
        p_staging_ids: params.stagingIds,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sistema-nao-explicado', sessaoId] });
      qc.invalidateQueries({ queryKey: ['classificacao-staging', sessaoId] });
      qc.invalidateQueries({ queryKey: ['classificacao-sessoes'] });
      qc.invalidateQueries({ queryKey: ['composicao-sugerida'] });
      qc.invalidateQueries({ queryKey: ['cbi-batch'] });
    },
  });
}
