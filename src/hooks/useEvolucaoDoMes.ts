/**
 * PROD-EVOLUCAO-01b — os dados do nível 2 (o mês por categoria), das fontes que a Evolução por Categoria de hoje já lia:
 *   - as linhas do cache com o overlay do Fechamento: `useRebanhoOficial` (`rawCategorias`), filtradas no mês;
 *   - as 9 categorias, na ordem do Fechamento: `usePastos().categorias` (`categorias_rebanho.ordem_exibicao`);
 *   - "Conferir pesos": os lançamentos do mês (`lancamentos`, com a RLS por tenant; o MESMO recorte do `useMovimentacoesMensais`, com a
 *     reclassificação, que é a evolução de categoria).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { usePastos } from '@/hooks/usePastos';
import type { LancamentoDoMes } from '@/lib/producao/evolucaoMes';

const ultimoDia = (ano: number, mes: number) => String(new Date(ano, mes, 0).getDate()).padStart(2, '0');

export function useEvolucaoDoMes(ano: number, mes: number, cenario: 'realizado' | 'meta') {
  const { isGlobal, fazendaAtual } = useFazenda();
  const { clienteAtual } = useCliente();
  const rebanho = useRebanhoOficial({ ano, cenario, global: isGlobal });
  const { categorias } = usePastos();

  const rowsDoMes = useMemo(() => rebanho.rawCategorias.filter((r) => r.mes === mes), [rebanho.rawCategorias, mes]);
  const rowsDoMesAnterior = useMemo(() => rebanho.rawCategorias.filter((r) => r.mes === mes - 1), [rebanho.rawCategorias, mes]);
  /* o mês tem o Fechamento (a régua do desvio só existe com ele) — a regra de hoje: `fonte_oficial_mes === 'fechamento'` */
  const fechado = cenario === 'meta' || rebanho.fazendaByMes[String(mes).padStart(2, '0')]?.fonte_oficial_mes === 'fechamento';
  /* o último mês fechado do ano (onde o nível 2 abre quando ninguém disse o mês) */
  const ultimoFechado = useMemo(() => {
    let u: number | null = null;
    for (const [k, z] of Object.entries(rebanho.fazendaByMes)) if (z?.fonte_oficial_mes === 'fechamento') u = Math.max(u ?? 0, Number(k));
    return u;
  }, [rebanho.fazendaByMes]);

  const mm = String(mes).padStart(2, '0');
  const lancs = useQuery({
    queryKey: ['evolucao-mes-lancamentos', clienteAtual?.id, isGlobal ? 'global' : fazendaAtual?.id, ano, mes, cenario],
    enabled: !!clienteAtual?.id && (isGlobal || !!fazendaAtual?.id),
    staleTime: 30_000,
    queryFn: async (): Promise<LancamentoDoMes[]> => {
      let q = supabase.from('lancamentos')
        .select('id, data, tipo, categoria, categoria_destino, quantidade, peso_medio_kg')
        .eq('cancelado', false)
        .gte('data', `${ano}-${mm}-01`).lte('data', `${ano}-${mm}-${ultimoDia(ano, mes)}`);
      q = cenario === 'realizado' ? q.eq('cenario', 'realizado').eq('status_operacional', 'realizado') : q.eq('cenario', 'meta');
      q = isGlobal ? q.eq('cliente_id', clienteAtual!.id) : q.eq('fazenda_id', fazendaAtual!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id, data: l.data, tipo: l.tipo, categoria: l.categoria, categoria_destino: l.categoria_destino ?? null,
        quantidade: Number(l.quantidade) || 0, peso_medio_kg: l.peso_medio_kg == null ? null : Number(l.peso_medio_kg),
      }));
    },
  });

  return {
    rowsDoMes, rowsDoMesAnterior, categorias, fechado, ultimoFechado, isGlobal,
    lancamentos: lancs.data ?? [], erroLancamentos: lancs.error ? 'Não consegui ler os lançamentos do mês.' : null,
    carregando: rebanho.loading || lancs.isLoading,
  };
}
