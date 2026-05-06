/**
 * useEndividamentoAtual — leitura enxuta da dívida em aberto AGORA, por cliente.
 *
 * Usado em superfícies (V2Home) que precisam apenas do saldo devedor atual e
 * 2 indicadores leves derivados, SEM o overhead do painel completo.
 *
 * Critério de "em aberto na data de hoje":
 *   - financiamento.status != 'cancelado'
 *   - financiamento.data_contrato <= hoje (exclui contratos futuros)
 *   - parcela.data_pagamento IS NULL (ainda não foi paga)
 *   - parcela.status != 'cancelado' (defensivo)
 *
 * Saídas:
 *   - total / principal / juros (saldo devedor em aberto)
 *   - alavancagem { percentual, status } — dívida pecuária principal / valor do rebanho
 *     (snapshot mais recente de valor_rebanho_fechamento; sem fallback inventado).
 *   - pizzaVencimentos: 2 buckets curto/longo prazo, baseados em data_vencimento.
 *
 * NÃO calcula: histórico, mensal, cronograma, credor, parcelas enriquecidas,
 * evolução. Para isso, usar `useFinanciamentosPainel`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';

export interface PizzaSliceLeve {
  nome: string;
  valor: number;
  color: string;
}

export interface AlavancagemLeve {
  percentual: number | null;
  status: 'saudavel' | 'atencao' | 'critico' | 'indisponivel';
}

export interface EndividamentoAtual {
  total: number;
  principal: number;
  juros: number;
  alavancagem: AlavancagemLeve;
  pizzaVencimentos: PizzaSliceLeve[];
  loading: boolean;
}

const EMPTY = {
  total: 0,
  principal: 0,
  juros: 0,
  alavancagem: { percentual: null as number | null, status: 'indisponivel' as const },
  pizzaVencimentos: [] as PizzaSliceLeve[],
};

export function useEndividamentoAtual(anoBase?: number): EndividamentoAtual {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const anoBaseEff = anoBase ?? new Date().getFullYear();

  const { data, isLoading } = useQuery({
    queryKey: ['endividamento-atual', clienteId, anoBaseEff],
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const hojeISO = new Date().toISOString().slice(0, 10);

      // 1) Financiamentos não-cancelados, contratados até hoje (com tipo).
      const { data: fins, error: e1 } = await supabase
        .from('financiamentos')
        .select('id, tipo_financiamento')
        .eq('cliente_id', clienteId!)
        .neq('status', 'cancelado')
        .lte('data_contrato', hojeISO);
      if (e1) throw e1;

      const ids = (fins ?? []).map((f) => f.id);
      if (ids.length === 0) return EMPTY;

      const tipoById = new Map<string, string>();
      for (const f of fins ?? []) tipoById.set(f.id, f.tipo_financiamento);

      // 2) Parcelas em aberto (data_pagamento IS NULL).
      const { data: parcs, error: e2 } = await supabase
        .from('financiamento_parcelas')
        .select('financiamento_id, valor_principal, valor_juros, data_vencimento')
        .in('financiamento_id', ids)
        .neq('status', 'cancelado')
        .is('data_pagamento', null);
      if (e2) throw e2;

      // 3) Snapshot mais recente de valor_rebanho_fechamento (somando fazendas).
      // Limite de 100 cobre ~10 fazendas × 10 meses recentes — bounded e barato.
      const { data: snaps } = await supabase
        .from('valor_rebanho_fechamento')
        .select('ano_mes, valor_total')
        .eq('cliente_id', clienteId!)
        .order('ano_mes', { ascending: false })
        .limit(100);
      const aggReb = new Map<string, number>();
      for (const r of snaps ?? []) {
        aggReb.set(r.ano_mes, (aggReb.get(r.ano_mes) || 0) + (Number(r.valor_total) || 0));
      }
      const sortedReb = Array.from(aggReb.entries()).sort((a, b) => b[0].localeCompare(a[0]));
      const valorRebanho = sortedReb[0]?.[1] ?? 0;

      // 4) Reduce em uma única passada das parcelas.
      let principal = 0;
      let juros = 0;
      let dividaPecPrincipal = 0;
      let curtoPrazo = 0;
      let longoPrazo = 0;

      for (const p of parcs ?? []) {
        const vp = Number(p.valor_principal) || 0;
        const vj = Number(p.valor_juros) || 0;
        principal += vp;
        juros += vj;

        if (tipoById.get(p.financiamento_id) === 'pecuaria') {
          dividaPecPrincipal += vp;
        }

        const venc = p.data_vencimento;
        const vencYear = venc ? Number(venc.slice(0, 4)) : NaN;
        if (!Number.isNaN(vencYear)) {
          if (vencYear <= anoBaseEff + 1) curtoPrazo += vp;
          else longoPrazo += vp;
        }
      }

      // Alavancagem (sem fallback inventado).
      let alavancagemPerc: number | null = null;
      let status: AlavancagemLeve['status'] = 'indisponivel';
      if (valorRebanho > 0) {
        alavancagemPerc = (dividaPecPrincipal / valorRebanho) * 100;
        status =
          alavancagemPerc < 30 ? 'saudavel'
            : alavancagemPerc < 50 ? 'atencao'
              : 'critico';
      }

      const pizzaVencimentos: PizzaSliceLeve[] = [
        { nome: `Curto Prazo (${anoBaseEff}–${anoBaseEff + 1})`, valor: curtoPrazo, color: '#EF4444' },
        { nome: `Longo Prazo (${anoBaseEff + 2}+)`,              valor: longoPrazo, color: '#EAB308' },
      ].filter((s) => s.valor > 0);

      return {
        total: principal + juros,
        principal,
        juros,
        alavancagem: { percentual: alavancagemPerc, status },
        pizzaVencimentos,
      };
    },
  });

  return {
    total: data?.total ?? 0,
    principal: data?.principal ?? 0,
    juros: data?.juros ?? 0,
    alavancagem: data?.alavancagem ?? EMPTY.alavancagem,
    pizzaVencimentos: data?.pizzaVencimentos ?? EMPTY.pizzaVencimentos,
    loading: isLoading,
  };
}
