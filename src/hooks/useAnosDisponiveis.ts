/**
 * useAnosDisponiveis — Busca os anos reais com dados no banco.
 *
 * Fontes: lancamentos + saldos_iniciais.
 * Retorna array de strings ['2024','2023','2022',...] em ordem decrescente.
 *
 * PROIBIDO: derivar anos de listas parciais carregadas no frontend.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';

export function useAnosDisponiveis() {
  const { fazendaAtual } = useFazenda();
  const fazendaId = fazendaAtual?.id;
  const isGlobal = !fazendaId || fazendaId === '__global__';

  return useQuery({
    queryKey: ['anos-disponiveis', fazendaId],
    enabled: !!fazendaId,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const anos = new Set<number>();
      anos.add(new Date().getFullYear());

      // 1. Anos de lançamentos (distinct via small aggregate query)
      {
        let q = supabase
          .from('lancamentos')
          .select('data')
          .eq('cancelado', false)
          .order('data', { ascending: true })
          .limit(1);

        if (!isGlobal) q = q.eq('fazenda_id', fazendaId);
        const { data } = await q;
        if (data?.[0]?.data) {
          const minYear = Number(data[0].data.substring(0, 4));
          if (!isNaN(minYear)) anos.add(minYear);
        }
      }

      {
        let q = supabase
          .from('lancamentos')
          .select('data')
          .eq('cancelado', false)
          .order('data', { ascending: false })
          .limit(1);

        if (!isGlobal) q = q.eq('fazenda_id', fazendaId);
        const { data } = await q;
        if (data?.[0]?.data) {
          const maxYear = Number(data[0].data.substring(0, 4));
          if (!isNaN(maxYear)) anos.add(maxYear);
        }
      }

      // 2. Anos de saldos_iniciais
      {
        let q = supabase.from('saldos_iniciais').select('ano');
        if (!isGlobal) q = q.eq('fazenda_id', fazendaId);
        const { data } = await q;
        (data || []).forEach((r: any) => anos.add(r.ano));
      }

      // Fill gap between min and max
      const sorted = Array.from(anos).sort((a, b) => a - b);
      if (sorted.length >= 2) {
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        for (let y = min; y <= max; y++) anos.add(y);
      }

      return Array.from(anos).sort((a, b) => b - a).map(String);
    },
  });
}
