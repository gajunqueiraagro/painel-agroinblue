/**
 * useComposicaoSugerida — SUGESTÃO read-only de composição (PR-MESA-INVERSO-01):
 * combinações de 2-4 linhas do Excel SEM match cuja soma explica um lançamento não
 * referenciado. Fonte única = fn_classificacao_composicao_sugerida. Sem ação/escrita
 * (split assistido = PR futuro SPLIT-01).
 *
 * Cast `(supabase as any)` intencional: tipos não regenerados (padrão do projeto).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ComposicaoSugerida {
  composicao_n: number;
  staging_ids: string[];
  linhas: number[];
  soma: number | null;
  diferenca: number | null;
}

export function useComposicaoSugerida(lancamentoId: string | null, sessaoId: string | null) {
  return useQuery({
    queryKey: ['composicao-sugerida', lancamentoId, sessaoId],
    enabled: !!lancamentoId && !!sessaoId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        'fn_classificacao_composicao_sugerida',
        { p_lancamento_id: lancamentoId, p_sessao_id: sessaoId },
      );
      if (error) throw error;
      return (data ?? []) as ComposicaoSugerida[];
    },
  });
}
