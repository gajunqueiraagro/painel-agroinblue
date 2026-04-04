/**
 * Hook: useStatusFechamentosAno
 *
 * Fetches P1 closing status for all 12 months of a given year/farm.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type StatusMes = 'oficial' | 'provisorio' | 'bloqueado' | 'nao_iniciado';

export interface MesStatus {
  mes: string; // '01'..'12'
  status: StatusMes;
  motivo?: string;
  divergencias?: number;
  detalheFechados?: number;
  detalheTotal?: number;
}

export function useStatusFechamentosAno(fazendaId: string | undefined, ano: string) {
  const [data, setData] = useState<MesStatus[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!fazendaId || fazendaId === '__global__') {
      setData([]);
      return;
    }

    setLoading(true);
    const results: MesStatus[] = [];

    try {
      const promises = Array.from({ length: 12 }, (_, i) => {
        const mes = String(i + 1).padStart(2, '0');
        const anoMes = `${ano}-${mes}`;
        return supabase
          .rpc('get_status_pilares_fechamento', { _fazenda_id: fazendaId, _ano_mes: anoMes })
          .then(({ data: result }) => {
            if (!result || typeof result !== 'object') {
              return { mes, status: 'nao_iniciado' as StatusMes };
            }
            const r = result as Record<string, unknown>;
            const p1 = r.p1_mapa_pastos as Record<string, unknown> | undefined;
            if (!p1) return { mes, status: 'nao_iniciado' as StatusMes };

            const raw = (p1.status as string) || 'nao_iniciado';
            let status: StatusMes = 'nao_iniciado';
            if (raw === 'oficial') status = 'oficial';
            else if (raw === 'bloqueado') status = 'bloqueado';
            else if (raw === 'provisorio') status = 'provisorio';

            const detalhe = p1.detalhe as Record<string, unknown> | undefined;
            const motivo = detalhe?.motivo as string | undefined;
            const divs = detalhe?.divergencias as unknown[] | undefined;

            return {
              mes,
              status,
              motivo,
              divergencias: divs?.length,
              detalheFechados: detalhe?.pastos_fechados as number | undefined,
              detalheTotal: detalhe?.pastos_total as number | undefined,
            };
          });
      });

      const all = await Promise.all(promises);
      results.push(...all);
    } catch {
      // ignore
    }

    setData(results.sort((a, b) => a.mes.localeCompare(b.mes)));
    setLoading(false);
  }, [fazendaId, ano]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { meses: data, loading, refetch };
}
