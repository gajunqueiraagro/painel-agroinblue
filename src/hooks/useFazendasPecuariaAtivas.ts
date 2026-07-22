/**
 * Hook: useFazendasPecuariaAtivas
 *
 * Fonte React Query da lista de fazendas PECUÁRIAS ATIVAS de um cliente (id apenas).
 * Extraído de useSnapshotAreaAnual (PR-ZOOT-PERF-DEDUP-02) para eliminar as
 * ×N chamadas byte-idênticas à tabela `fazendas` em cada remontagem/cascata de boot.
 *
 * Consumo: SOMENTE o escopo global de useSnapshotAreaAnual (esta PR).
 * Demais consumidores de `tem_pecuaria` (usePlanejamentoAprovacaoData, V2Index)
 * permanecem intocados.
 *
 * Key compartilhada p/ dedup: ['fazendas-pecuaria-ativas', clienteId].
 * Invalidada por cadastro/exclusão de fazenda (ClientesTab).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FazendaPecuariaAtiva {
  id: string;
}

export function useFazendasPecuariaAtivas(clienteId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['fazendas-pecuaria-ativas', clienteId],
    queryFn: async (): Promise<FazendaPecuariaAtiva[]> => {
      const { data, error } = await supabase
        .from('fazendas')
        .select('id')
        .eq('cliente_id', clienteId!)
        .eq('status_operacional', 'ativa')
        .eq('tem_pecuaria', true);
      if (error) throw error;
      return (data ?? []) as FazendaPecuariaAtiva[];
    },
    enabled: enabled && !!clienteId,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
}
