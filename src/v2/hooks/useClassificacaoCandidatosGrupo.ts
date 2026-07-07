/**
 * useClassificacaoCandidatosGrupo — candidatos de GRUPO (match N:1) para uma linha
 * em 'candidatos_proximos' ou 'sem_match' (PR-MESA-GRUPO-01).
 *
 * Espelho de useClassificacaoCandidatosProximos, chamando fn_classificacao_candidatos_grupo
 * — mesmos filtros/janela (±10 ∩ ano_mes) EXCETO o valor unitário: membros SOMAM
 * (ABS(valor) <= excel_valor + 0.005), não igualam. Mesma shape de retorno
 * (CandidatoProximo) → o drawer reaproveita a renderização. ORDER BY distância (RPC).
 *
 * Cast `(supabase as any)` intencional: tipos não regenerados (padrão do projeto).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CandidatoProximo } from './useClassificacaoCandidatosProximos';

export function useClassificacaoCandidatosGrupo(stagingId: string | null) {
  return useQuery({
    queryKey: ['classificacao-candidatos-grupo', stagingId],
    enabled: !!stagingId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        'fn_classificacao_candidatos_grupo',
        { p_staging_id: stagingId },
      );
      if (error) throw error;
      return (data ?? []) as CandidatoProximo[];
    },
  });
}
