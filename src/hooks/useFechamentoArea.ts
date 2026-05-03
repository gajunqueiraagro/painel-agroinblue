import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SnapshotAreaMes {
  mes: number;              // 1–12
  area_pecuaria_ha: number;
  area_agricultura_ha: number;
  area_produtiva_ha: number;
}

export interface UseSnapshotAreaAnualResult {
  areaMensal: number[];
  snapshots: SnapshotAreaMes[];
  totalFazendasAtivas: number;
  fazendasAtivasCarregadas: boolean;
  fazendasComSnapPorMes: number[];
  temP1FechadoPorMes: boolean[];
  loading: boolean;
}

export function useSnapshotAreaAnual(
  ano: number,
  fazendaId: string | undefined,
  isGlobal: boolean,
  clienteId: string | undefined,
): UseSnapshotAreaAnualResult {
  const [areaMensal, setAreaMensal] = useState<number[]>(Array(12).fill(0));
  const [snapshots, setSnapshots] = useState<SnapshotAreaMes[]>([]);
  const [totalFazendasAtivas, setTotalFazendasAtivas] = useState(0);
  const [fazendasAtivasCarregadas, setFazendasAtivasCarregadas] = useState(false);
  const [fazendasComSnapPorMes, setFazendasComSnapPorMes] = useState<number[]>(Array(12).fill(0));
  const [temP1FechadoPorMes, setTemP1FechadoPorMes] = useState<boolean[]>(Array(12).fill(false));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clienteId) {
      setAreaMensal(Array(12).fill(0));
      setSnapshots([]);
      setTotalFazendasAtivas(0);
      setFazendasAtivasCarregadas(false);
      setFazendasComSnapPorMes(Array(12).fill(0));
      setTemP1FechadoPorMes(Array(12).fill(false));
      return;
    }

    let cancelled = false;

    const fetch = async () => {
      setLoading(true);

      let query = supabase
        .from('fechamento_area_snapshot')
        .select('fazenda_id, ano_mes, area_pecuaria_ha, area_agricultura_ha, area_produtiva_ha')
        .eq('cliente_id', clienteId)
        .gte('ano_mes', `${ano}-01-01`)
        .lte('ano_mes', `${ano}-12-01`);

      if (!isGlobal && fazendaId) {
        query = query.eq('fazenda_id', fazendaId);
      }

      const { data, error } = await query;

      if (cancelled) return;

      if (error || !data) {
        setAreaMensal(Array(12).fill(0));
        setSnapshots([]);
        setTotalFazendasAtivas(0);
        setFazendasAtivasCarregadas(false);
        setFazendasComSnapPorMes(Array(12).fill(0));
        setTemP1FechadoPorMes(Array(12).fill(false));
        setLoading(false);
        return;
      }

      // Montar array de 12 posições
      const arr = Array(12).fill(0);
      const snaps: SnapshotAreaMes[] = [];

      for (const row of data) {
        // ano_mes vem como '2026-02-01' (DATE)
        const mesIdx = parseInt((row.ano_mes as string).split('-')[1], 10) - 1; // 0-11
        const pec = Number(row.area_pecuaria_ha) || 0;
        const agric = Number(row.area_agricultura_ha) || 0;
        const prod = Number(row.area_produtiva_ha) || 0;

        // Global: somar fazendas do mesmo mês; específica: sobrescrever
        arr[mesIdx] = isGlobal ? arr[mesIdx] + pec : pec;

        // snapshots — para global, agregar por mês
        const existing = snaps.find(s => s.mes === mesIdx + 1);
        if (existing) {
          existing.area_pecuaria_ha += pec;
          existing.area_agricultura_ha += agric;
          existing.area_produtiva_ha += prod;
        } else {
          snaps.push({
            mes: mesIdx + 1,
            area_pecuaria_ha: pec,
            area_agricultura_ha: agric,
            area_produtiva_ha: prod,
          });
        }
      }

      setAreaMensal(arr);
      setSnapshots(snaps);

      // Busca paralela de fazendas ativas (apenas global)
      let totalAtivas = 0;
      const comSnapPorMes = Array(12).fill(0);
      if (isGlobal) {
        const { data: fazAtivas } = await supabase
          .from('fazendas')
          .select('id')
          .eq('cliente_id', clienteId)
          .eq('status_operacional', 'ativa')
          .eq('tem_pecuaria', true);
        totalAtivas = fazAtivas?.length ?? 0;
        setFazendasAtivasCarregadas(true);

        // Contar fazendas distintas com snapshot por mês
        const porMes = new Map<number, Set<string>>();
        for (const row of data) {
          const mesIdx = parseInt((row.ano_mes as string).split('-')[1], 10) - 1;
          if (!porMes.has(mesIdx)) porMes.set(mesIdx, new Set());
          porMes.get(mesIdx)!.add(row.fazenda_id as string);
        }
        for (const [mes, faz] of porMes) {
          comSnapPorMes[mes] = faz.size;
        }
      }
      setTotalFazendasAtivas(totalAtivas);
      setFazendasComSnapPorMes(comSnapPorMes);

      // Query de P1 para fazenda específica — distingue p1_aberto de p1_fechado_sem_snap
      let p1Mensal = Array(12).fill(false);
      if (!isGlobal && fazendaId) {
        const anoStr = String(ano);
        const { data: p1Data } = await supabase
          .from('fechamento_pastos')
          .select('ano_mes')
          .eq('fazenda_id', fazendaId)
          .eq('status', 'fechado')
          .gte('ano_mes', `${anoStr}-01`)
          .lte('ano_mes', `${anoStr}-99`);
        if (p1Data) {
          for (const row of p1Data) {
            const mesIdx = parseInt((row.ano_mes as string).split('-')[1], 10) - 1;
            if (mesIdx >= 0 && mesIdx < 12) p1Mensal[mesIdx] = true;
          }
        }
      }
      setTemP1FechadoPorMes(p1Mensal);
      setLoading(false);
    };

    fetch();
    return () => { cancelled = true; };
  }, [ano, fazendaId, isGlobal, clienteId]);

  return { areaMensal, snapshots, totalFazendasAtivas, fazendasAtivasCarregadas, fazendasComSnapPorMes, temP1FechadoPorMes, loading };
}
