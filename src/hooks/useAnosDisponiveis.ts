/**
 * useAnosDisponiveis — Busca os anos reais com dados no banco.
 *
 * Fontes: lancamentos + saldos_iniciais + pastos + fechamento_pastos.
 * Retorna array de strings ['2024','2023','2022',...] em ordem decrescente.
 *
 * PR-ANOS-PASTOS-01 — as duas últimas fontes entraram porque "dados" estava definido
 * como FINANCEIRO. Fazenda com pasto e fechamento mas sem lançamento recebia só o ano
 * corrente, e não havia como fechar os meses anteriores. Caso vivo: Retiro Agricultura,
 * desmembrada da Pureza em jun/2025, com 0 lançamentos e 0 saldos_iniciais — o seletor
 * só oferecia 2026, e jun/25 a dez/25 precisam existir para a soma das duas fazendas
 * bater em todo período.
 *
 * Um pasto que passa a existir em 2025 significa que 2025 é ano com dado; um mês já
 * fechado é a evidência mais forte disso.
 *
 * PROIBIDO: derivar anos de listas parciais carregadas no frontend.
 *
 * ISOLAMENTO: filtra SEMPRE por cliente_id no modo Global.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';

export function useAnosDisponiveis() {
  const { fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;
  const clienteId = clienteAtual?.id;
  const isGlobal = !fazendaId || fazendaId === '__global__';

  return useQuery({
    queryKey: ['anos-disponiveis', isGlobal ? `global-${clienteId}` : fazendaId],
    enabled: isGlobal ? !!clienteId : !!fazendaId,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const anos = new Set<number>();
      anos.add(new Date().getFullYear());

      // 1. Min year from lancamentos
      {
        let q = supabase
          .from('lancamentos')
          .select('data')
          .eq('cancelado', false)
          .order('data', { ascending: true })
          .limit(1);

        if (isGlobal) {
          q = q.eq('cliente_id', clienteId);
        } else {
          q = q.eq('fazenda_id', fazendaId);
        }
        const { data } = await q;
        if (data?.[0]?.data) {
          const minYear = Number(data[0].data.substring(0, 4));
          if (!isNaN(minYear)) anos.add(minYear);
        }
      }

      // 2. Max year from lancamentos
      {
        let q = supabase
          .from('lancamentos')
          .select('data')
          .eq('cancelado', false)
          .order('data', { ascending: false })
          .limit(1);

        if (isGlobal) {
          q = q.eq('cliente_id', clienteId);
        } else {
          q = q.eq('fazenda_id', fazendaId);
        }
        const { data } = await q;
        if (data?.[0]?.data) {
          const maxYear = Number(data[0].data.substring(0, 4));
          if (!isNaN(maxYear)) anos.add(maxYear);
        }
      }

      // 3. Anos de saldos_iniciais
      {
        let q = supabase.from('saldos_iniciais').select('ano');
        if (isGlobal) {
          q = q.eq('cliente_id', clienteId);
        } else {
          q = q.eq('fazenda_id', fazendaId);
        }
        const { data } = await q;
        (data || []).forEach((r: any) => anos.add(r.ano));
      }

      // 4. Anos de vigência dos pastos (data_inicio / data_fim).
      // UMA query com as duas colunas, no idioma do bloco 3 (saldos_iniciais também
      // traz todas as linhas de uma coluna estreita). O volume é o número de pastos —
      // 297 na base inteira —, não uma tabela grande.
      {
        let q = supabase.from('pastos').select('data_inicio, data_fim');
        if (isGlobal) {
          q = q.eq('cliente_id', clienteId);
        } else {
          q = q.eq('fazenda_id', fazendaId);
        }
        const { data } = await q;
        (data || []).forEach((r: any) => {
          for (const d of [r.data_inicio, r.data_fim]) {
            if (typeof d !== 'string') continue;
            const y = Number(d.substring(0, 4));
            if (Number.isFinite(y)) anos.add(y);
          }
        });
      }

      // 5. Min/max de fechamento_pastos.ano_mes ('YYYY-MM').
      // Aqui NÃO cabe trazer a coluna inteira: a tabela tem ~20 mil linhas. Duas
      // queries com order+limit 1, como os blocos 1 e 2 fazem para lancamentos.
      // nullsFirst: false na descendente — o default do Postgres é NULLS FIRST em
      // DESC, e sem isso a query voltaria uma linha nula em vez do máximo.
      for (const asc of [true, false]) {
        let q = supabase
          .from('fechamento_pastos')
          .select('ano_mes')
          .order('ano_mes', { ascending: asc, nullsFirst: false })
          .limit(1);

        if (isGlobal) {
          q = q.eq('cliente_id', clienteId);
        } else {
          q = q.eq('fazenda_id', fazendaId);
        }
        const { data } = await q;
        const bruto = (data as any)?.[0]?.ano_mes;
        if (typeof bruto === 'string') {
          const y = Number(bruto.substring(0, 4));
          if (Number.isFinite(y)) anos.add(y);
        }
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
