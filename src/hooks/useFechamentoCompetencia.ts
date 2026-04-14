import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook leve de apresentação: retorna quais meses do ano estão "fechado"
 * na tabela competencia_fechamento.
 * NÃO altera dados — apenas leitura para sinalização visual.
 */
export function useFechamentoCompetencia(fazendaId: string | undefined, ano: number) {
  const { data: fechamentos } = useQuery({
    queryKey: ['fechamento-competencia-status', fazendaId, ano],
    enabled: !!fazendaId && fazendaId !== '__global__' && !!ano,
    queryFn: async () => {
      const { data } = await supabase
        .from('competencia_fechamento')
        .select('ano_mes, status')
        .eq('fazenda_id', fazendaId!)
        .like('ano_mes', `${ano}-%`);
      return data ?? [];
    },
  });

  const mesFechado = (mes: number): boolean => {
    const anoMesStr = `${ano}-${String(mes).padStart(2, '0')}`;
    return fechamentos?.some(f => f.ano_mes === anoMesStr && f.status === 'fechado') ?? false;
  };

  const temMesAberto = (() => {
    for (let m = 1; m <= 12; m++) {
      if (!mesFechado(m)) return true;
    }
    return false;
  })();

  return { mesFechado, temMesAberto, fechamentos };
}
