import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { StagingRow } from './types';

/** Busca todos os registros de staging de uma sessão */
export function useStaging(sessaoId: string | null) {
  return useQuery<StagingRow[]>({
    queryKey: ['mesa-staging', sessaoId],
    enabled: !!sessaoId,
    staleTime: 0,
    queryFn: async (): Promise<StagingRow[]> => {
      // Cast: tabela PR6.1 ainda não está nos tipos gerados do Supabase.
      const sb = supabase as any;
      const res = await sb
        .from('mesa_lancamento_staging')
        .select('*')
        .eq('sessao_id', sessaoId)
        .order('created_at', { ascending: true });
      if (res.error) throw res.error;
      return ((res.data ?? []) as unknown) as StagingRow[];
    },
  });
}
