/**
 * FIN-LANC-DESCRICAO-CONTRATO-01 — o nome de cada contrato do cliente ("<nº> · <descrição>"), para o `title` do selo "F" da lista
 * de Lançamentos. Uma leitura por cliente (RLS por tenant), relida quando um lançamento do cliente muda.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { tituloDoContrato } from '@/lib/financeiro/colunasDaListaV2';

export const CHAVE_CONTRATOS_DO_CLIENTE = 'contratos-do-cliente';

export function useContratosDoCliente(clienteId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => {
      void qc.invalidateQueries({ queryKey: [CHAVE_CONTRATOS_DO_CLIENTE, clienteId] }, { cancelRefetch: false });
    });
  }, [clienteId, qc]);
  return useQuery({
    queryKey: [CHAVE_CONTRATOS_DO_CLIENTE, clienteId],
    enabled: !!clienteId,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.from('financiamentos').select('id, numero_contrato, descricao').eq('cliente_id', clienteId!);
      if (error) throw error;
      return new Map((data ?? []).map((f) => [f.id, tituloDoContrato(f.numero_contrato, f.descricao)]));
    },
  });
}
