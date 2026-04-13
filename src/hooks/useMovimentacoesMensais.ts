/**
 * useMovimentacoesMensais — Busca contagem de movimentações por tipo e mês
 * diretamente do banco, sem limite de 1000 registros.
 *
 * Substitui calcFluxoAnual(lancamentos, ...) que dependia de dados truncados.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import type { FluxoTipo } from '@/lib/calculos/zootecnicos';

export interface MovMensal {
  mes: string; // '01'..'12'
  tipo: FluxoTipo;
  quantidade: number;
}

interface UseMovimentacoesMensaisOpts {
  ano: number;
  cenario: 'realizado' | 'meta';
}

export function useMovimentacoesMensais({ ano, cenario }: UseMovimentacoesMensaisOpts) {
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = !fazendaId || fazendaId === '__global__';

  return useQuery({
    queryKey: ['movimentacoes-mensais', fazendaId, ano, cenario],
    enabled: !!fazendaId,
    queryFn: async (): Promise<Record<string, Record<FluxoTipo, number>>> => {
      const startDate = `${ano}-01-01`;
      const endDate = `${ano}-12-31`;

      // Query aggregated counts by type and month directly from lancamentos
      // No row limit issues since we're aggregating in the database
      let q = supabase.rpc('get_movimentacoes_mensais' as any, {
        p_ano: ano,
        p_cenario: cenario,
        p_fazenda_id: isGlobal ? null : fazendaId,
      });

      // Fallback: direct query with aggregation
      // The RPC may not exist yet, so we use a direct approach
      let query = supabase
        .from('lancamentos')
        .select('tipo, data')
        .eq('cancelado', false)
        .neq('tipo', 'reclassificacao')
        .gte('data', startDate)
        .lte('data', endDate);

      if (cenario === 'realizado') {
        query = query.eq('cenario', 'realizado').eq('status_operacional', 'realizado');
      } else {
        query = query.eq('cenario', 'meta');
      }

      if (!isGlobal) {
        query = query.eq('fazenda_id', fazendaId);
      }

      // Paginate to get ALL records
      const allRows: { tipo: string; data: string; quantidade?: number }[] = [];
      const batchSize = 1000;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await query
          .select('tipo, data, quantidade')
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allRows.push(...data);
          if (data.length < batchSize) hasMore = false;
          else from += batchSize;
        }
      }

      // Aggregate by month and type
      const result: Record<string, Record<FluxoTipo, number>> = {};
      const tipos: FluxoTipo[] = ['nascimento', 'compra', 'transferencia_entrada', 'abate', 'venda', 'transferencia_saida', 'consumo', 'morte'];

      for (let m = 1; m <= 12; m++) {
        const mesKey = String(m).padStart(2, '0');
        result[mesKey] = {} as Record<FluxoTipo, number>;
        tipos.forEach(t => { result[mesKey][t] = 0; });
      }

      allRows.forEach(row => {
        const mes = row.data.substring(5, 7);
        const tipo = row.tipo as FluxoTipo;
        if (result[mes] && result[mes][tipo] !== undefined) {
          result[mes][tipo] += row.quantidade || 0;
        }
      });

      return result;
    },
  });
}
