/**
 * Hook: useFazendasPecuariaAtivas
 *
 * Fonte React Query da lista de fazendas ATIVAS de um cliente (id apenas).
 * Extraído de useSnapshotAreaAnual (PR-ZOOT-PERF-DEDUP-02) para eliminar as
 * ×N chamadas byte-idênticas à tabela `fazendas` em cada remontagem.
 *
 * Consumo: SOMENTE o escopo global de useSnapshotAreaAnual.
 *
 * PR-AREA-FONTE-OPERACAO-01 — o filtro `tem_pecuaria = true` foi REMOVIDO.
 * Motivo: `tem_pecuaria` é campo MANUAL (nenhum trigger o mantém; só
 * `provisionar_cliente` o define na criação) e erra nos dois sentidos.
 * Medido em 21/08/2026: "Retiro Agricultura" (NJ) tem a flag em false,
 * está ativa, tem 69,76 ha, 70 cards de fechamento e concentra toda a
 * agricultura do cliente — e ficava fora da área do Global.
 *
 * A pergunta certa para ÁREA é "a fazenda opera?", não "tem gado?".
 * Fazenda ativa com fechamento de área entra na conta de área,
 * independentemente do tipo de uso dos seus pastos.
 *
 * O NOME do hook foi mantido de propósito: renomear exigiria tocar os
 * demais consumidores de `tem_pecuaria`, que são frente própria. O nome
 * é consequência, não causa — renomear antes deixaria o rótulo certo e o
 * comportamento errado.
 *
 * Key compartilhada p/ dedup: ['fazendas-pecuaria-ativas', clienteId].
 * Invalidada por cadastro/exclusão de fazenda (ClientesTab.tsx:107 e :176).
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
        .eq('status_operacional', 'ativa');
      if (error) throw error;
      return (data ?? []) as FazendaPecuariaAtiva[];
    },
    enabled: enabled && !!clienteId,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
}
