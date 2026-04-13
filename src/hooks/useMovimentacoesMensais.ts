/**
 * useMovimentacoesMensais — Busca contagem de movimentações por tipo e mês
 * diretamente do banco com paginação completa.
 *
 * ISOLAMENTO: filtra SEMPRE por cliente_id no modo Global.
 * Nunca busca dados sem filtro de cliente ou fazenda.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import type { FluxoTipo } from '@/lib/calculos/zootecnicos';
import { FLUXO_LINHAS } from '@/lib/calculos/zootecnicos';

export function useMovimentacoesMensais(ano: number, cenario: 'realizado' | 'meta') {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;
  const clienteId = clienteAtual?.id;
  const isGlobal = !fazendaId || fazendaId === '__global__';

  return useQuery({
    queryKey: ['movimentacoes-mensais', isGlobal ? `global-${clienteId}` : fazendaId, ano, cenario],
    enabled: isGlobal ? !!clienteId : !!fazendaId,
    queryFn: async (): Promise<{
      porMesTipo: Record<string, Record<FluxoTipo, number>>;
      totalAno: Record<FluxoTipo, number>;
    }> => {
      const startDate = `${ano}-01-01`;
      const endDate = `${ano}-12-31`;

      // Paginate to get ALL records with stable ordering
      const allRows: { tipo: string; data: string; quantidade: number }[] = [];
      const batchSize = 1000;
      let from = 0;

      while (true) {
        let q = supabase
          .from('lancamentos')
          .select('tipo, data, quantidade')
          .eq('cancelado', false)
          .neq('tipo', 'reclassificacao')
          .gte('data', startDate)
          .lte('data', endDate);

        if (cenario === 'realizado') {
          q = q.eq('cenario', 'realizado').eq('status_operacional', 'realizado');
        } else {
          q = q.eq('cenario', 'meta');
        }

        // CRITICAL: Always filter by client or farm — never query without scope
        if (isGlobal) {
          q = q.eq('cliente_id', clienteId);
        } else {
          q = q.eq('fazenda_id', fazendaId);
        }

        const { data, error } = await q
          .order('data', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...(data as any));
        if (data.length < batchSize) break;
        from += batchSize;
      }

      // Aggregate
      const porMesTipo: Record<string, Record<FluxoTipo, number>> = {};
      const tipos = FLUXO_LINHAS.map(l => l.tipo);

      for (let m = 1; m <= 12; m++) {
        const mesKey = String(m).padStart(2, '0');
        porMesTipo[mesKey] = {} as Record<FluxoTipo, number>;
        tipos.forEach(t => { porMesTipo[mesKey][t] = 0; });
      }

      allRows.forEach(row => {
        const mes = row.data.substring(5, 7);
        const tipo = row.tipo as FluxoTipo;
        if (porMesTipo[mes]?.[tipo] !== undefined) {
          porMesTipo[mes][tipo] += row.quantidade || 0;
        }
      });

      const totalAno: Record<FluxoTipo, number> = {} as any;
      tipos.forEach(t => {
        totalAno[t] = Object.values(porMesTipo).reduce((s, m) => s + m[t], 0);
      });

      return { porMesTipo, totalAno };
    },
  });
}
