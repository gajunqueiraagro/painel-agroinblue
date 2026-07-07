/**
 * useClassificacaoCandidatosProximos — busca os candidatos da JANELA ±3 dias para
 * uma staging row marcada como 'candidatos_proximos' (PR-MESA-DATA-01 / -RESOLUCAO-01).
 *
 * Espelho de useClassificacaoCandidatos, chamando a RPC irmã
 * fn_classificacao_candidatos_proximos — que devolve os mesmos campos + documento e
 * distancia_dias (|data_pagamento - excel_data|), já ORDENADOS por distância (ranking
 * do banco). O front NÃO reordena.
 *
 * Cast `(supabase as any)` intencional: tipos do Supabase não regenerados para a RPC
 * nova (padrão do projeto).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CandidatoProximo {
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
  documento: string | null;
  distancia_dias: number | null;
}

export function useClassificacaoCandidatosProximos(stagingId: string | null) {
  return useQuery({
    queryKey: ['classificacao-candidatos-proximos', stagingId],
    enabled: !!stagingId,
    staleTime: 60_000,
    queryFn: async () => {
      // types Supabase não regenerados; cast `any` padrão do projeto.
      const { data, error } = await (supabase as any).rpc(
        'fn_classificacao_candidatos_proximos',
        { p_staging_id: stagingId },
      );
      if (error) throw error;
      return (data ?? []) as CandidatoProximo[];
    },
  });
}
