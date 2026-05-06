/**
 * useEndividamentoAtual — leitura enxuta da dívida em aberto AGORA, por cliente.
 *
 * Usado em superfícies (V2Home) que precisam apenas do saldo devedor total atual,
 * sem o overhead de calcular histórico/mensal/pizza/credor/alavancagem do painel.
 *
 * Critério de "em aberto na data de hoje":
 *   - financiamento.status != 'cancelado'
 *   - financiamento.data_contrato <= hoje (exclui contratos futuros)
 *   - parcela.data_pagamento IS NULL (ainda não foi paga)
 *   - parcela.status != 'cancelado' (defensivo)
 *
 * Retorna: { total, principal, juros, loading }.
 *
 * Para análise temporal completa (saldo em data passada, histórico de alavancagem,
 * pizza, credor, mensal, próximas) use `useFinanciamentosPainel`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';

export interface EndividamentoAtual {
  total: number;
  principal: number;
  juros: number;
  loading: boolean;
}

export function useEndividamentoAtual(): EndividamentoAtual {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['endividamento-atual', clienteId],
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const hojeISO = new Date().toISOString().slice(0, 10);

      // 1) Financiamentos não-cancelados, contratados até hoje.
      const { data: fins, error: e1 } = await supabase
        .from('financiamentos')
        .select('id')
        .eq('cliente_id', clienteId!)
        .neq('status', 'cancelado')
        .lte('data_contrato', hojeISO);
      if (e1) throw e1;

      const ids = (fins ?? []).map((f) => f.id);
      if (ids.length === 0) return { total: 0, principal: 0, juros: 0 };

      // 2) Parcelas em aberto desses financiamentos (data_pagamento IS NULL).
      const { data: parcs, error: e2 } = await supabase
        .from('financiamento_parcelas')
        .select('valor_principal, valor_juros')
        .in('financiamento_id', ids)
        .neq('status', 'cancelado')
        .is('data_pagamento', null);
      if (e2) throw e2;

      let principal = 0;
      let juros = 0;
      for (const p of parcs ?? []) {
        principal += Number(p.valor_principal) || 0;
        juros += Number(p.valor_juros) || 0;
      }
      return { total: principal + juros, principal, juros };
    },
  });

  return {
    total: data?.total ?? 0,
    principal: data?.principal ?? 0,
    juros: data?.juros ?? 0,
    loading: isLoading,
  };
}
