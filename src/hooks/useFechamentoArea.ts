import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isOperacionalPecuaria } from '@/lib/pastos/tiposUso';

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
  fazendasComP1PorMes: number[];
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
  const [fazendasComP1PorMes, setFazendasComP1PorMes] = useState<number[]>(Array(12).fill(0));
  const [temP1FechadoPorMes, setTemP1FechadoPorMes] = useState<boolean[]>(Array(12).fill(false));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clienteId) {
      setAreaMensal(Array(12).fill(0));
      setSnapshots([]);
      setTotalFazendasAtivas(0);
      setFazendasAtivasCarregadas(false);
      setFazendasComSnapPorMes(Array(12).fill(0));
      setFazendasComP1PorMes(Array(12).fill(0));
      setTemP1FechadoPorMes(Array(12).fill(false));
      return;
    }

    let cancelled = false;

    const fetch = async () => {
      setLoading(true);

      // Montar as 3 queries em paralelo
      let snapshotsQuery = supabase
        .from('fechamento_area_snapshot')
        .select('fazenda_id, ano_mes, area_pecuaria_ha, area_agricultura_ha, area_produtiva_ha')
        .eq('cliente_id', clienteId)
        .gte('ano_mes', `${ano}-01-01`)
        .lte('ano_mes', `${ano}-12-31`);

      if (!isGlobal && fazendaId) {
        snapshotsQuery = snapshotsQuery.eq('fazenda_id', fazendaId);
      }

      const fazendasAtivasQuery = isGlobal
        ? supabase
            .from('fazendas')
            .select('id')
            .eq('cliente_id', clienteId)
            .eq('status_operacional', 'ativa')
            .eq('tem_pecuaria', true)
        : Promise.resolve({ data: null as null, error: null });

      // Query paralela: pastos fechados + relacao cadastral, para recalculo de area_pecuaria_ha
      // usando isOperacionalPecuaria sobre tipo_uso_efetivo = COALESCE(tipo_uso_mes, tipo_uso).
      // Snapshots historicos ficam intactos; apenas a leitura do hook usa a regra oficial nova.
      let pastosQuery = supabase
        .from('fechamento_pastos')
        .select('fazenda_id, ano_mes, tipo_uso_mes, pasto:pastos!inner(area_produtiva_ha, tipo_uso)')
        .eq('cliente_id', clienteId)
        .eq('status', 'fechado')
        .gte('ano_mes', `${ano}-01`)
        .lte('ano_mes', `${ano}-12`);

      if (!isGlobal && fazendaId) {
        pastosQuery = pastosQuery.eq('fazenda_id', fazendaId);
      }

      // Helper interno paginador — busca todas as rows em batches de 1000.
      // PostgREST trunca em 1000 rows por request sem .range(). NJ 2025 tem
      // 1.152 rows (96 pastos x 12 meses) — sem pagination perde os meses finais.
      // Cada .range() em um builder do supabase-js produz uma nova thenable
      // (builder é imutável), então reusar o mesmo `builder` como base é seguro.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetchPastosRowsPaginado = async (builder: any): Promise<{ data: unknown[]; error: unknown }> => {
        const PAGE_SIZE = 1000;
        const out: unknown[] = [];
        let from = 0;
        let safety = 0;
        while (safety < 50) {
          const batch = await builder.range(from, from + PAGE_SIZE - 1);
          if (batch.error) return { data: out, error: batch.error };
          const rows = (batch.data ?? []) as unknown[];
          out.push(...rows);
          if (rows.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
          safety++;
        }
        return { data: out, error: null };
      };

      const [snapRes, fazRes, pastosRes] = await Promise.all([
        snapshotsQuery,
        fazendasAtivasQuery,
        fetchPastosRowsPaginado(pastosQuery),
      ]);

      const fazendaIdsGlobal = isGlobal ? (fazRes.data ?? []).map((f: any) => f.id) : [];

      // Paginar igual a pastosQuery: PostgREST trunca em 1000 rows sem .range().
      // NJ Global 2025 (1.296 rows pos backfill Sta. Luzia) ficava com meses
      // finais incompletos e disparava dadosCompletos=false silenciosamente.
      const p1Res = isGlobal && fazendaIdsGlobal.length > 0
        ? await fetchPastosRowsPaginado(
            supabase
              .from('fechamento_pastos')
              .select('fazenda_id, ano_mes')
              .in('fazenda_id', fazendaIdsGlobal)
              .eq('status', 'fechado')
              .gte('ano_mes', `${ano}-01`)
              .lte('ano_mes', `${ano}-99`)
          )
        : (!isGlobal && fazendaId)
          ? await fetchPastosRowsPaginado(
              supabase
                .from('fechamento_pastos')
                .select('ano_mes')
                .eq('fazenda_id', fazendaId)
                .eq('status', 'fechado')
                .gte('ano_mes', `${ano}-01`)
                .lte('ano_mes', `${ano}-99`)
            )
          : { data: null as null, error: null };

      if (cancelled) return;

      // Tratar erro de snapshots — crítico
      if (snapRes.error || !snapRes.data) {
        setAreaMensal(Array(12).fill(0));
        setSnapshots([]);
        setTotalFazendasAtivas(0);
        setFazendasAtivasCarregadas(false);
        setFazendasComSnapPorMes(Array(12).fill(0));
        setTemP1FechadoPorMes(Array(12).fill(false));
        setLoading(false);
        return;
      }

      // Flag explicita de sucesso da query de pastos. NAO usar Map.size como proxy:
      // um cliente pode legitimamente ter zero pastos operacionais pecuarios em todo o ano,
      // e nesse caso o resultado correto eh zero, nao fallback ao snapshot antigo.
      const pastosQueryOk = !pastosRes.error && Array.isArray(pastosRes.data);
      if (pastosRes.error) {
        console.warn(
          '[useFechamentoArea] query fechamento_pastos falhou; usando area_pecuaria_ha do snapshot como fallback:',
          pastosRes.error,
        );
      }

      // Construir mapa de area pecuaria recalculada por (fazenda_id, ano_mes 'YYYY-MM').
      // Aplicar isOperacionalPecuaria ao tipo efetivo = COALESCE(tipo_uso_mes, tipo_uso).
      const pecRecalcPorFazendaMes = new Map<string, number>();
      if (pastosQueryOk) {
        type PastoRow = {
          fazenda_id: string;
          ano_mes: string;
          tipo_uso_mes: string | null;
          pasto: { area_produtiva_ha: number | null; tipo_uso: string | null } | null;
        };
        const pastosRows = (pastosRes.data ?? []) as unknown as PastoRow[];
        for (const row of pastosRows) {
          const tipoEfetivo: string | null =
            row.tipo_uso_mes || row.pasto?.tipo_uso || null;
          if (!isOperacionalPecuaria(tipoEfetivo)) continue;
          const area = Number(row.pasto?.area_produtiva_ha) || 0;
          if (area <= 0) continue;
          const key = `${row.fazenda_id}|${row.ano_mes}`;
          pecRecalcPorFazendaMes.set(key, (pecRecalcPorFazendaMes.get(key) || 0) + area);
        }
      }

      const data = snapRes.data;

      // Montar array de 12 posições a partir dos snapshots
      const arr = Array(12).fill(0);
      const snaps: SnapshotAreaMes[] = [];

      // NOTA: agric e prod_total continuam vindo do snapshot mesmo quando
      // pec eh recalculada. Mistura conhecida — sera revisada em commit
      // posterior. Objetivo deste commit: impedir perda silenciosa de pec
      // e paginacao truncando query de fechamento_pastos.
      for (const row of data) {
        const mesIdx = parseInt((row.ano_mes as string).split('-')[1], 10) - 1;
        // Chave do recalculado: ano_mes do snapshot eh DATE ('YYYY-MM-DD'); converter pra 'YYYY-MM'
        // para casar com fechamento_pastos.ano_mes (TEXT).
        const anoMesKey = (row as unknown as { ano_mes: string }).ano_mes.slice(0, 7);
        const fazMesKey = `${(row as unknown as { fazenda_id: string }).fazenda_id}|${anoMesKey}`;
        // Regra de fallback explicita:
        //   pastosQueryOk=false              -> degradar para o snapshot antigo (area_pecuaria_ha).
        //   recalc definido                  -> usar recalc (inclui zero valido = sem pasto pec).
        //   recalc undefined + snap > 0      -> base incompleta; usar snap e warn.
        //   recalc undefined + snap nulo/0   -> mes sem pec valido (zero).
        let pec: number;
        if (!pastosQueryOk) {
          pec = Number(row.area_pecuaria_ha ?? 0);
        } else {
          const recalc = pecRecalcPorFazendaMes.get(fazMesKey);
          if (recalc !== undefined) {
            pec = recalc;
          } else {
            const snapVal = Number(row.area_pecuaria_ha ?? 0);
            if (snapVal > 0) {
              console.warn(
                '[useFechamentoArea] recalculo ausente, fallback snapshot:',
                {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  fazenda_id: (row as any).fazenda_id,
                  ano_mes: anoMesKey,
                  snapVal,
                },
              );
              pec = snapVal;
            } else {
              pec = 0;
            }
          }
        }
        const agric = Number(row.area_agricultura_ha) || 0;
        const prod = Number(row.area_produtiva_ha) || 0;

        arr[mesIdx] = isGlobal ? (arr[mesIdx] || 0) + pec : pec;

        const existing = snaps.find(s => s.mes === mesIdx + 1);
        if (existing) {
          existing.area_pecuaria_ha += pec;
          existing.area_agricultura_ha += agric;
          existing.area_produtiva_ha += prod;
        } else {
          snaps.push({ mes: mesIdx + 1, area_pecuaria_ha: pec, area_agricultura_ha: agric, area_produtiva_ha: prod });
        }
      }

      setAreaMensal(arr);
      setSnapshots(snaps);

      // Processar fazendas ativas (global) — erro não-crítico
      let totalAtivas = 0;
      const comSnapPorMes = Array(12).fill(0);
      if (isGlobal) {
        totalAtivas = fazRes.data?.length ?? 0;
        setFazendasAtivasCarregadas(true);

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

      // Processar fazendas com P1 fechado por mês (global)
      const comP1PorMes = Array(12).fill(0);
      if (isGlobal && p1Res.data) {
        const p1PorMes = new Map<number, Set<string>>();
        for (const row of p1Res.data as any[]) {
          const mesIdx = parseInt((row.ano_mes as string).split('-')[1], 10) - 1;
          if (mesIdx >= 0 && mesIdx < 12) {
            if (!p1PorMes.has(mesIdx)) p1PorMes.set(mesIdx, new Set());
            p1PorMes.get(mesIdx)!.add(row.fazenda_id as string);
          }
        }
        for (const [mes, faz] of p1PorMes) {
          comP1PorMes[mes] = faz.size;
        }
      }
      setFazendasComP1PorMes(comP1PorMes);

      // Processar P1 (fazenda específica) — erro não-crítico
      const p1Mensal = Array(12).fill(false);
      if (!isGlobal && fazendaId && p1Res.data) {
        for (const row of p1Res.data as Array<{ ano_mes: string }>) {
          const mesIdx = parseInt(row.ano_mes.split('-')[1], 10) - 1;
          if (mesIdx >= 0 && mesIdx < 12) p1Mensal[mesIdx] = true;
        }
      }
      setTemP1FechadoPorMes(p1Mensal);
      setLoading(false);
    };

    fetch();
    return () => { cancelled = true; };
  }, [ano, fazendaId, isGlobal, clienteId]);

  return { areaMensal, snapshots, totalFazendasAtivas, fazendasAtivasCarregadas, fazendasComSnapPorMes, fazendasComP1PorMes, temP1FechadoPorMes, loading };
}
