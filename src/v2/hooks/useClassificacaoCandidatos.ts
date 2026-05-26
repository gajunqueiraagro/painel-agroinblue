/**
 * useClassificacaoCandidatos — busca candidatos de match para uma
 * staging row marcada como 'ambiguo' (PR-M4).
 *
 * Encapsula a chamada da RPC fn_classificacao_candidatos_ambiguo,
 * que reproduz o critério da populate. Usado no drawer
 * MesaClassificacaoCandidatosDrawer.
 *
 * Cast `(supabase as any)` intencional: tipos do Supabase ainda
 * não regenerados para incluir a RPC nova (padrão do projeto).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CandidatoLancamento {
  lanc_id: string;
  descricao: string | null;
  observacao: string | null;
  data_pagamento: string | null;
  valor: number | null;
  tipo_operacao: string | null;
  subcentro_atual: string | null;
  macro_atual: string | null;
  grupo_atual: string | null;
  favorecido_id: string | null;
  favorecido_nome: string | null;
  conta_bancaria_nome: string | null;
  conta_destino_nome: string | null;
}

export function useClassificacaoCandidatos(stagingId: string | null) {
  return useQuery({
    queryKey: ['classificacao-candidatos', stagingId],
    enabled: !!stagingId,
    staleTime: 60_000,
    queryFn: async () => {
      // PR-M2.1: types Supabase não regenerados; cast `any` padrão do projeto.
      const { data, error } = await (supabase as any).rpc(
        'fn_classificacao_candidatos_ambiguo',
        { p_staging_id: stagingId },
      );
      if (error) throw error;
      return (data ?? []) as CandidatoLancamento[];
    },
  });
}
