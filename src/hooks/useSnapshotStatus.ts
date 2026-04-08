import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';

export type SnapshotStatusValue = 'validado' | 'invalidado' | 'cadeia_quebrada' | 'sem_snapshot';

export interface SnapshotStatusMes {
  anoMes: string;
  status: SnapshotStatusValue;
}

/**
 * Hook que retorna o status do snapshot validado (valor_rebanho_realizado_validado)
 * para cada mês do ano, permitindo que as telas reajam a:
 *  - validado: dado oficial
 *  - invalidado: dado alterado após validação, precisa revalidar
 *  - cadeia_quebrada: mês anterior foi reaberto, exige reconciliação
 *  - sem_snapshot: nunca foi validado
 */
export function useSnapshotStatus(ano: number) {
  const { fazendaAtual, fazendas } = useFazenda();
  const fazendaId = fazendaAtual?.id;

  const [statusMap, setStatusMap] = useState<Record<string, SnapshotStatusValue>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const fazendaIds = fazendaId === '__global__'
        ? fazendas.filter(f => f.tem_pecuaria !== false).map(f => f.id)
        : [fazendaId];

      if (fazendaIds.length === 0) { setStatusMap({}); return; }

      const dezAnoAnterior = `${ano - 1}-12`;
      const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
      const todasMeses = [dezAnoAnterior, ...meses];

      const { data, error } = await supabase
        .from('valor_rebanho_realizado_validado')
        .select('ano_mes, status')
        .in('fazenda_id', fazendaIds)
        .in('ano_mes', todasMeses);

      if (error) { setStatusMap({}); return; }

      const map: Record<string, SnapshotStatusValue> = {};
      for (const mes of todasMeses) {
        const rows = (data || []).filter((r: any) => r.ano_mes === mes);
        if (rows.length === 0) {
          map[mes] = 'sem_snapshot';
        } else {
          // Para Global: se qualquer fazenda está quebrada, considerar quebrada
          const statuses = rows.map((r: any) => r.status as string);
          if (statuses.includes('cadeia_quebrada')) map[mes] = 'cadeia_quebrada';
          else if (statuses.includes('invalidado')) map[mes] = 'invalidado';
          else if (statuses.includes('validado')) map[mes] = 'validado';
          else map[mes] = 'sem_snapshot';
        }
      }
      setStatusMap(map);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, ano, fazendas]);

  useEffect(() => { load(); }, [load]);

  /** Retorna status de um mês específico no formato YYYY-MM */
  const getStatus = useCallback((anoMes: string): SnapshotStatusValue => {
    return statusMap[anoMes] || 'sem_snapshot';
  }, [statusMap]);

  /** Retorna status por índice de mês (1-12) */
  const getStatusByMonth = useCallback((mes: number): SnapshotStatusValue => {
    const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;
    return getStatus(anoMes);
  }, [ano, getStatus]);

  /** Verifica se um mês pode ser usado como dado oficial (apenas validado) */
  const isOficial = useCallback((mes: number): boolean => {
    return getStatusByMonth(mes) === 'validado';
  }, [getStatusByMonth]);

  /** Verifica se o snapshot existe mas está comprometido */
  const isComprometido = useCallback((mes: number): boolean => {
    const s = getStatusByMonth(mes);
    return s === 'invalidado' || s === 'cadeia_quebrada';
  }, [getStatusByMonth]);

  /** Array de 12 status (Jan=0 ... Dez=11) */
  const statusArray = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => getStatusByMonth(i + 1)),
    [getStatusByMonth],
  );

  return {
    statusMap,
    statusArray,
    getStatus,
    getStatusByMonth,
    isOficial,
    isComprometido,
    loading,
    refetch: load,
  };
}
