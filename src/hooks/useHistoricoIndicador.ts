// ⚠️ HISTÓRICO AUXILIAR LEGADO
// Fonte: zoot_mensal_cache (raw, SEM fechamento overlay aplicado pelo useRebanhoOficial).
// Anos anteriores ao corrente PODEM divergir do PC-100 em casos de:
//   - snapshot validado
//   - fechamento overlay (substituição de saldo_final/peso_total_final/producao_biologica/gmd)
//   - global com transferências inter-fazenda
//
// REGRA: o anoAtual deve ser fornecido via prop `valorOficialAnoAtual` (vinda do hook
// principal usePainelConsultorData) — garante paridade EXATA com o topo do modal.
// Anos < anoAtual usam o cálculo via cache (apenas comparativo histórico — divergência
// silenciosa rejeitada pela equipe está documentada aqui).
//
// NÃO usar este hook para:
// - cards
// - gráfico principal
// - deltas
// - indicadores de área (uaHa, kgHa)
//
// Para todos os usos acima, consumir SEMPRE usePainelConsultorData (fonte oficial PC-100).

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  cabecasMediaPeriodoFromRows,
  pesoMedioPonderadoFromRows,
  computePeriodGmd,
  rollingAvg,
  buildDesfruteCabMensal,
  TIPOS_DESFRUTE_OFICIAL,
} from '@/lib/calculos/painelConsultorIndicadores';

// Desfrute usa fonte separada (lancamentos), pois zoot_mensal_cache.saidas_externas
// inclui mortes — divergente da definição oficial (abate + venda + consumo).
// valorRebanho usa fonte oficial separada (valor_rebanho_realizado_validado / view global).
// uaHa e kgHa cruzam zoot_mensal_cache + fechamento_area_snapshot por ano.
export type HistoricoIndicadorKey =
  | 'cabecas'
  | 'pesoMedio'
  | 'arrobas'
  | 'gmd'
  | 'desfrute'
  | 'valorRebanho'
  | 'uaHa'
  | 'kgHa'
  | 'receitaPec'   // fonte: lancamentos cenario='realizado'/'meta', TIPOS_DESFRUTE, valor_total
  | 'precoArr'     // fonte: mesma — Σ valor_total / Σ (qtd × peso_medio_kg / 30)
  | 'custeioPec'   // fonte: financeiro_lancamentos_v2 grupo IN (Custo Fixo Pec, Custo Variável Pec) + planejamento_financeiro meta
  | 'custoArr'     // fonte: custeioPec / arrobasProd (zoot_mensal_cache.producao_biologica/30)
  | 'custoCab'     // fonte: custeioPec / cabMedia (zoot_mensal_cache.saldo_inicial/saldo_final)
  | 'margemArr';   // fonte: precoArr − custoArr (mesma fonte oficial dos dois)

export interface AnoValor {
  ano: number;
  valor: number | null;
}

interface Params {
  enabled: boolean;
  clienteId?: string;
  fazendaId?: string | null;
  fazendaIds?: string[];
  indicadorKey: HistoricoIndicadorKey;
  mesAtual: number;
  viewMode?: 'mes' | 'periodo';
  anoAtual: number;
  anoInicio?: number;
  /**
   * Valor oficial do anoAtual já calculado pelo hook principal (ex. gmdIndicador.valor).
   * Quando fornecido, a barra do anoAtual usa este valor — garantindo paridade exata com o topo.
   * Anos anteriores continuam via cache zoot_mensal_cache (auxiliar legado).
   */
  valorOficialAnoAtual?: number | null;
  /** Valor oficial da meta do anoAtual (do hook principal). Aplica mesma regra. */
  valorOficialMetaAnoAtual?: number | null;
}

interface Result {
  historico: AnoValor[];
  historicoMeta: AnoValor[];
  loading: boolean;
}

export function useHistoricoIndicador({
  enabled,
  clienteId,
  fazendaId,
  fazendaIds,
  indicadorKey,
  mesAtual,
  viewMode = 'mes',
  anoAtual,
  anoInicio,
  valorOficialAnoAtual,
  valorOficialMetaAnoAtual,
}: Params): Result {
  const [historico, setHistorico] = useState<AnoValor[]>([]);
  const [historicoMeta, setHistoricoMeta] = useState<AnoValor[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !clienteId) {
      setHistorico([]);
      setHistoricoMeta([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const inicio = anoInicio ?? anoAtual - 6;
    setLoading(true);

    (async () => {
      try {
        // ───── Branch UA/HA e KG VIVO/HA — cruza fechamento_area_snapshot + zoot_mensal_cache ─────
        if (indicadorKey === 'uaHa' || indicadorKey === 'kgHa') {
          if (!fazendaId && !(fazendaIds && fazendaIds.length > 0)) {
            if (!cancelled) {
              setHistorico([]); setHistoricoMeta([]); setLoading(false);
            }
            return;
          }

          // Query 1: fechamento_area_snapshot (range completo)
          let areaQuery = supabase
            .from('fechamento_area_snapshot')
            .select('fazenda_id, ano_mes, area_pecuaria_ha')
            .eq('cliente_id', clienteId)
            .gte('ano_mes', `${inicio}-01-01`)
            .lte('ano_mes', `${anoAtual}-12-31`);
          if (fazendaId) areaQuery = areaQuery.eq('fazenda_id', fazendaId);

          // Query 2: zoot_mensal_cache (range completo, paginado)
          const PAGE = 1000;
          const zootRows: any[] = [];
          let zfrom = 0;
          while (true) {
            let zq = supabase
              .from('zoot_mensal_cache')
              .select('fazenda_id, ano, mes, saldo_inicial, saldo_final, peso_total_final')
              .eq('cenario', 'realizado')
              .gte('ano', inicio)
              .lte('ano', anoAtual);
            if (fazendaId) zq = zq.eq('fazenda_id', fazendaId);
            else if (fazendaIds && fazendaIds.length > 0) zq = zq.in('fazenda_id', fazendaIds);
            const { data, error } = await zq.range(zfrom, zfrom + PAGE - 1);
            if (cancelled) return;
            if (error) {
              setHistorico([]); setHistoricoMeta([]);
              return;
            }
            if (!data || data.length === 0) break;
            zootRows.push(...data);
            if (data.length < PAGE) break;
            zfrom += PAGE;
          }

          const areaRes = await areaQuery;
          if (cancelled) return;
          if (areaRes.error) {
            setHistorico([]); setHistoricoMeta([]);
            return;
          }
          const areaRows = areaRes.data ?? [];

          // Agrupa: por ano → array 12 com soma area_pecuaria_ha
          const areaPorAnoMes: Record<number, number[]> = {};
          for (const r of areaRows as any[]) {
            const [yyyy, mm] = String(r.ano_mes).split('-');
            const a = Number(yyyy);
            const mIdx = Number(mm) - 1;
            if (!areaPorAnoMes[a]) areaPorAnoMes[a] = Array(12).fill(0);
            areaPorAnoMes[a][mIdx] += Number(r.area_pecuaria_ha) || 0;
          }

          // Agrupa: por ano e mês → soma cabIni, cabFin, peso_total_final
          type ZootCell = { cabIni: number; cabFin: number; ptf: number };
          const zootPorAnoMes: Record<number, ZootCell[]> = {};
          for (const r of zootRows as any[]) {
            const a = Number(r.ano);
            const mIdx = Number(r.mes) - 1;
            if (!zootPorAnoMes[a]) {
              zootPorAnoMes[a] = Array.from({ length: 12 }, () => ({ cabIni: 0, cabFin: 0, ptf: 0 }));
            }
            zootPorAnoMes[a][mIdx].cabIni += Number(r.saldo_inicial) || 0;
            zootPorAnoMes[a][mIdx].cabFin += Number(r.saldo_final) || 0;
            zootPorAnoMes[a][mIdx].ptf += Number(r.peso_total_final) || 0;
          }

          const calcAno = (a: number): number | null => {
            const area12 = areaPorAnoMes[a] ?? Array(12).fill(0);
            const zoot12 = zootPorAnoMes[a]
              ?? Array.from({ length: 12 }, () => ({ cabIni: 0, cabFin: 0, ptf: 0 }));

            if (indicadorKey === 'uaHa') {
              // Mesma fórmula de calcularIndicadoresEficienciaArea
              const lotUaHa12 = Array.from({ length: 12 }, (_, i) => {
                const z = zoot12[i];
                const cabMed = (z.cabIni + z.cabFin) / 2;
                const pm = z.cabFin > 0 ? z.ptf / z.cabFin : NaN;
                const uaMed = cabMed > 0 && pm > 0 ? (cabMed * pm) / 450 : NaN;
                return area12[i] > 0 ? uaMed / area12[i] : NaN;
              });
              const arr = viewMode === 'periodo' ? rollingAvg(lotUaHa12) : lotUaHa12;
              const v = arr[mesAtual - 1];
              return v != null && !isNaN(v) ? v : null;
            }
            // kgHa: peso_total_final / area_pecuaria_ha
            const kgHa12 = Array.from({ length: 12 }, (_, i) => {
              const ptf = zoot12[i].ptf;
              const area = area12[i];
              return ptf > 0 && area > 0 ? ptf / area : NaN;
            });
            const arr = viewMode === 'periodo' ? rollingAvg(kgHa12) : kgHa12;
            const v = arr[mesAtual - 1];
            return v != null && !isNaN(v) ? v : null;
          };

          const resR: AnoValor[] = [];
          const resM: AnoValor[] = [];   // sem meta multi-ano para uaHa/kgHa nesta fase
          for (let a = inicio; a <= anoAtual; a++) {
            if (a === anoAtual && valorOficialAnoAtual !== undefined) {
              resR.push({ ano: a, valor: valorOficialAnoAtual ?? null });
            } else {
              resR.push({ ano: a, valor: calcAno(a) });
            }
            resM.push({ ano: a, valor: null });
          }

          if (!cancelled) {
            setHistorico(resR);
            setHistoricoMeta(resM);
          }
          return;
        }

        // ───── Branch VALOR REBANHO — fonte oficial (validado), sem cálculo no front ─────
        if (indicadorKey === 'valorRebanho') {
          if (!fazendaId && !(fazendaIds && fazendaIds.length > 0)) {
            if (!cancelled) {
              setHistorico([]); setHistoricoMeta([]); setLoading(false);
            }
            return;
          }

          const isGlobal = !fazendaId && (fazendaIds?.length ?? 0) > 0;
          const mesesAlvo: { ano: number; ano_mes: string }[] = [];
          for (let a = inicio; a <= anoAtual; a++) {
            mesesAlvo.push({
              ano: a,
              ano_mes: `${a}-${String(mesAtual).padStart(2, '0')}`,
            });
          }

          let q;
          if (isGlobal) {
            // Global precisa de cliente_id; vamos derivar do conjunto de fazendaIds (não temos clienteId aqui).
            // A view filtra por cliente_id; pegamos via 'in' nos ano_mes alvo + filtragem por ids depois? Não.
            // A view é por cliente — sem clienteId não dá. Para Global, precisamos do clienteId no parâmetro.
            // Solução: para Global, usar fazendaIds para filtrar via tabela base — mas a view é agregada por cliente.
            // Sem clienteId, não conseguimos. Retornar vazio.
            if (!clienteId) {
              if (!cancelled) {
                setHistorico([]); setHistoricoMeta([]); setLoading(false);
              }
              return;
            }
            q = supabase
              .from('vw_valor_rebanho_realizado_global_mensal' as any)
              .select('ano_mes, valor_total')
              .eq('cliente_id', clienteId)
              .in('ano_mes', mesesAlvo.map(m => m.ano_mes));
          } else {
            q = supabase
              .from('valor_rebanho_realizado_validado' as any)
              .select('ano_mes, valor_total, status')
              .eq('fazenda_id', fazendaId!)
              .eq('status', 'validado')
              .in('ano_mes', mesesAlvo.map(m => m.ano_mes));
          }

          const { data, error } = await q;
          if (cancelled) return;
          if (error || !data) {
            setHistorico([]); setHistoricoMeta([]);
            return;
          }

          const byMes = new Map<string, number>();
          for (const r of data as any[]) {
            byMes.set(r.ano_mes, Number(r.valor_total));
          }

          const resR: AnoValor[] = [];
          const resM: AnoValor[] = []; // sem meta multi-ano nesta fase
          for (const { ano: a, ano_mes } of mesesAlvo) {
            if (a === anoAtual && valorOficialAnoAtual !== undefined) {
              resR.push({ ano: a, valor: valorOficialAnoAtual ?? null });
            } else {
              const v = byMes.get(ano_mes);
              resR.push({ ano: a, valor: (v != null && !isNaN(v) ? v : null) });
            }
            resM.push({ ano: a, valor: null });
          }

          if (!cancelled) {
            setHistorico(resR);
            setHistoricoMeta(resM);
          }
          return;
        }

        // ───── Branch DESFRUTE — fonte oficial: lancamentos (abate + venda + consumo) ─────
        if (indicadorKey === 'desfrute') {
          if (!fazendaId && !(fazendaIds && fazendaIds.length > 0)) {
            if (!cancelled) {
              setHistorico([]);
              setHistoricoMeta([]);
              setLoading(false);
            }
            return;
          }

          // Paginação simples — lancamentos pode ter > 1000 registros em N anos.
          const PAGE = 1000;
          const allRows: any[] = [];
          let from = 0;
          while (true) {
            let q = supabase
              .from('lancamentos')
              .select('tipo, quantidade, data')
              .eq('cancelado', false)
              .eq('cenario', 'realizado')
              .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
              .gte('data', `${inicio}-01-01`)
              .lte('data', `${anoAtual}-12-31`);
            if (fazendaId) q = q.eq('fazenda_id', fazendaId);
            else if (fazendaIds && fazendaIds.length > 0) q = q.in('fazenda_id', fazendaIds);

            const { data, error } = await q.order('data').range(from, from + PAGE - 1);
            if (cancelled) return;
            if (error) {
              setHistorico([]); setHistoricoMeta([]);
              return;
            }
            if (!data || data.length === 0) break;
            allRows.push(...data);
            if (data.length < PAGE) break;
            from += PAGE;
          }

          // Agrupa por ano
          const rowsPorAno: Record<number, any[]> = {};
          for (const r of allRows) {
            const a = Number(String(r.data ?? '').slice(0, 4));
            if (isNaN(a)) continue;
            (rowsPorAno[a] ??= []).push(r);
          }

          const calcDesfrute = (rowsDoAno: any[], ano: number): number | null => {
            const lancsLite = rowsDoAno.map(r => ({
              tipo: r.tipo,
              quantidade: Number(r.quantidade) || 0,
              data: r.data,
              cenario: 'realizado',
            }));
            const mensal12 = buildDesfruteCabMensal(lancsLite, ano);
            if (viewMode === 'periodo') {
              let acc = 0;
              for (let i = 0; i < mesAtual; i++) acc += (mensal12[i] || 0);
              return acc > 0 ? acc : null;
            }
            const v = mensal12[mesAtual - 1];
            return v > 0 ? v : null;
          };

          const resR: AnoValor[] = [];
          const resM: AnoValor[] = [];   // PC-100 não expõe meta para Desfrute → sempre null
          for (let a = inicio; a <= anoAtual; a++) {
            if (a === anoAtual && valorOficialAnoAtual !== undefined) {
              resR.push({ ano: a, valor: valorOficialAnoAtual ?? null });
            } else {
              resR.push({ ano: a, valor: calcDesfrute(rowsPorAno[a] ?? [], a) });
            }
            resM.push({ ano: a, valor: null });
          }

          if (!cancelled) {
            setHistorico(resR);
            setHistoricoMeta(resM);
          }
          return;
        }

        // ───── Branch RECEITA PEC / PREÇO R$/@ — fonte: lancamentos (TIPOS_DESFRUTE) ─────
        // Receita Pec: Σ valor_total por mês.
        // Preço R$/@: Σ valor_total / Σ (qtd × peso_medio_kg / 30) — mesma query.
        if (indicadorKey === 'receitaPec' || indicadorKey === 'precoArr') {
          if (!fazendaId && !(fazendaIds && fazendaIds.length > 0)) {
            if (!cancelled) {
              setHistorico([]);
              setHistoricoMeta([]);
              setLoading(false);
            }
            return;
          }

          const PAGE = 1000;
          const allRows: any[] = [];
          let from = 0;
          while (true) {
            let q = supabase
              .from('lancamentos')
              .select('tipo, quantidade, peso_medio_kg, valor_total, data, cenario, status_operacional')
              .eq('cancelado', false)
              .in('cenario', ['realizado', 'meta'])
              .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
              .gte('data', `${inicio}-01-01`)
              .lte('data', `${anoAtual}-12-31`);
            if (fazendaId) q = q.eq('fazenda_id', fazendaId);
            else if (fazendaIds && fazendaIds.length > 0) q = q.in('fazenda_id', fazendaIds);

            const { data, error } = await q.order('data').range(from, from + PAGE - 1);
            if (cancelled) return;
            if (error) {
              setHistorico([]); setHistoricoMeta([]);
              return;
            }
            if (!data || data.length === 0) break;
            allRows.push(...data);
            if (data.length < PAGE) break;
            from += PAGE;
          }

          // Agrupa por (ano, cenario). Realizado exige status_operacional='realizado';
          // meta tem status_operacional=null por design — não filtrar.
          const rowsR: Record<number, any[]> = {};
          const rowsM: Record<number, any[]> = {};
          for (const r of allRows) {
            const a = Number(String(r.data ?? '').slice(0, 4));
            if (isNaN(a)) continue;
            if (r.cenario === 'meta') {
              (rowsM[a] ??= []).push(r);
            } else if (r.status_operacional === 'realizado') {
              (rowsR[a] ??= []).push(r);
            }
          }

          const calcAgregado = (rowsDoAno: any[]): { rec: number[]; desfArr: number[] } => {
            const rec = Array(12).fill(0);
            const desfArr = Array(12).fill(0);
            for (const r of rowsDoAno) {
              const m = parseInt(String(r.data ?? '').slice(5, 7));
              if (isNaN(m) || m < 1 || m > 12) continue;
              const qtd = Number(r.quantidade) || 0;
              const pmk = Number(r.peso_medio_kg) || 0;
              const vt  = Math.abs(Number(r.valor_total) || 0);
              rec[m - 1]    += vt;
              desfArr[m - 1] += (qtd * pmk) / 30;
            }
            return { rec, desfArr };
          };

          const calcValor = (rowsDoAno: any[]): number | null => {
            if (!rowsDoAno || rowsDoAno.length === 0) return null;
            const { rec, desfArr } = calcAgregado(rowsDoAno);
            if (indicadorKey === 'receitaPec') {
              if (viewMode === 'periodo') {
                let acc = 0;
                for (let i = 0; i < mesAtual; i++) acc += rec[i];
                return acc > 0 ? acc : null;
              }
              const v = rec[mesAtual - 1];
              return v > 0 ? v : null;
            }
            // precoArr
            if (viewMode === 'periodo') {
              let rAcc = 0; let dAcc = 0;
              for (let i = 0; i < mesAtual; i++) { rAcc += rec[i]; dAcc += desfArr[i]; }
              return dAcc > 0 ? rAcc / dAcc : null;
            }
            const r = rec[mesAtual - 1];
            const d = desfArr[mesAtual - 1];
            return d > 0 ? r / d : null;
          };

          const resR: AnoValor[] = [];
          const resM: AnoValor[] = [];
          for (let a = inicio; a <= anoAtual; a++) {
            if (a === anoAtual && valorOficialAnoAtual !== undefined) {
              resR.push({ ano: a, valor: valorOficialAnoAtual ?? null });
            } else {
              resR.push({ ano: a, valor: calcValor(rowsR[a] ?? []) });
            }
            if (a === anoAtual && valorOficialMetaAnoAtual !== undefined) {
              resM.push({ ano: a, valor: valorOficialMetaAnoAtual ?? null });
            } else {
              resM.push({ ano: a, valor: calcValor(rowsM[a] ?? []) });
            }
          }

          if (!cancelled) {
            setHistorico(resR);
            setHistoricoMeta(resM);
          }
          return;
        }

        // ───── Branch CUSTEIO/CUSTO/MARGEM — fonte: financeiro_lancamentos_v2 + planejamento_financeiro + zoot_mensal_cache + (margem) lancamentos pec ─────
        // Fórmulas:
        //   custeioPec = Σ valor por mês (status='realizado', cenario='realizado',
        //                                  cancelado=false, sem_movimentacao_caixa=false,
        //                                  grupo_custo IN ('Custo Fixo Pecuária','Custo Variável Pecuária'))
        //                META: planejamento_financeiro cenario='meta', mesmos grupos.
        //   custoArr   = custeioPec / arrobasProd (arrobasProd = zoot.producao_biologica / 30)
        //   custoCab   = custeioPec / cabMedia    (cabMedia = (saldo_inicial + saldo_final) / 2)
        //                Período = (Σcusteio / mediaCabMedia) / numMeses
        //   margemArr  = precoArr − custoArr (precoArr = Σ valor_total / Σ (qtd × peso_medio_kg / 30))
        //
        // NÃO usa: custOper legado, investimento, juros, agricultura, deduções, dividendos.
        if (
          indicadorKey === 'custeioPec' ||
          indicadorKey === 'custoArr'   ||
          indicadorKey === 'custoCab'   ||
          indicadorKey === 'margemArr'
        ) {
          if (!fazendaId && !(fazendaIds && fazendaIds.length > 0)) {
            if (!cancelled) { setHistorico([]); setHistoricoMeta([]); setLoading(false); }
            return;
          }

          // 1) Financeiro REALIZADO — paginado.
          const PAGE = 1000;
          const finRealRows: any[] = [];
          {
            let from = 0;
            while (true) {
              let q = (supabase
                .from('financeiro_lancamentos_v2')
                .select('data_pagamento, valor, grupo_custo') as any)
                .eq('cancelado', false)
                .eq('sem_movimentacao_caixa', false)
                .eq('status_transacao', 'realizado')
                .eq('cenario', 'realizado')
                .in('grupo_custo', ['Custo Fixo Pecuária', 'Custo Variável Pecuária'])
                .gte('data_pagamento', `${inicio}-01-01`)
                .lte('data_pagamento', `${anoAtual}-12-31`);
              if (fazendaId) q = q.eq('fazenda_id', fazendaId);
              else if (fazendaIds && fazendaIds.length > 0) q = q.in('fazenda_id', fazendaIds);
              const { data, error } = await q.range(from, from + PAGE - 1);
              if (cancelled) return;
              if (error) { setHistorico([]); setHistoricoMeta([]); return; }
              if (!data || data.length === 0) break;
              finRealRows.push(...data);
              if (data.length < PAGE) break;
              from += PAGE;
            }
          }

          // 2) Financeiro META — planejamento_financeiro (mensal).
          const finMetaRows: any[] = [];
          {
            let from = 0;
            while (true) {
              let q = (supabase
                .from('planejamento_financeiro' as any)
                .select('ano, mes, valor_planejado, grupo_custo') as any)
                .eq('cenario', 'meta')
                .in('grupo_custo', ['Custo Fixo Pecuária', 'Custo Variável Pecuária'])
                .gte('ano', inicio)
                .lte('ano', anoAtual);
              if (fazendaId) q = q.eq('fazenda_id', fazendaId);
              else if (fazendaIds && fazendaIds.length > 0) q = q.in('fazenda_id', fazendaIds);
              const { data, error } = await q.range(from, from + PAGE - 1);
              if (cancelled) return;
              if (error) { setHistorico([]); setHistoricoMeta([]); return; }
              if (!data || data.length === 0) break;
              finMetaRows.push(...data);
              if (data.length < PAGE) break;
              from += PAGE;
            }
          }

          // 3) Zoot multi-ano (apenas se custoArr/custoCab/margemArr).
          const precisaZoot = indicadorKey !== 'custeioPec';
          let zootRowsAll: any[] = [];
          if (precisaZoot) {
            let zq = supabase
              .from('zoot_mensal_cache')
              .select('ano, mes, cenario, saldo_inicial, saldo_final, producao_biologica')
              .in('cenario', ['realizado', 'meta'])
              .gte('ano', inicio)
              .lte('ano', anoAtual);
            if (fazendaId) zq = zq.eq('fazenda_id', fazendaId);
            else if (fazendaIds && fazendaIds.length > 0) zq = zq.in('fazenda_id', fazendaIds);
            const { data, error } = await zq;
            if (cancelled) return;
            if (error) { setHistorico([]); setHistoricoMeta([]); return; }
            zootRowsAll = (data as any[]) || [];
          }

          // 4) Lancamentos pec multi-ano (apenas se margemArr — para precoArr).
          const precisaLancsPec = indicadorKey === 'margemArr';
          const pecRowsAll: any[] = [];
          if (precisaLancsPec) {
            let from = 0;
            while (true) {
              let q = supabase
                .from('lancamentos')
                .select('tipo, quantidade, peso_medio_kg, valor_total, data, cenario, status_operacional')
                .eq('cancelado', false)
                .in('cenario', ['realizado', 'meta'])
                .in('tipo', [...TIPOS_DESFRUTE_OFICIAL] as string[])
                .gte('data', `${inicio}-01-01`)
                .lte('data', `${anoAtual}-12-31`);
              if (fazendaId) q = q.eq('fazenda_id', fazendaId);
              else if (fazendaIds && fazendaIds.length > 0) q = q.in('fazenda_id', fazendaIds);
              const { data, error } = await q.order('data').range(from, from + PAGE - 1);
              if (cancelled) return;
              if (error) { setHistorico([]); setHistoricoMeta([]); return; }
              if (!data || data.length === 0) break;
              pecRowsAll.push(...data);
              if (data.length < PAGE) break;
              from += PAGE;
            }
          }

          // ── Agrega custeio mensal por (cenario, ano).
          // realizado vem do financeiro_lancamentos_v2 (data_pagamento → mês).
          // meta vem do planejamento_financeiro (mes direto).
          const custeioR: Record<number, number[]> = {}; // ano → 12 meses
          const custeioM: Record<number, number[]> = {};
          for (const r of finRealRows) {
            const a = Number(String(r.data_pagamento ?? '').slice(0, 4));
            const m = parseInt(String(r.data_pagamento ?? '').slice(5, 7));
            if (isNaN(a) || isNaN(m) || m < 1 || m > 12) continue;
            (custeioR[a] ??= Array(12).fill(0))[m - 1] += Math.abs(Number(r.valor) || 0);
          }
          for (const r of finMetaRows) {
            const a = Number(r.ano);
            const m = Number(r.mes);
            if (!Number.isInteger(a) || !Number.isInteger(m) || m < 1 || m > 12) continue;
            (custeioM[a] ??= Array(12).fill(0))[m - 1] += Number(r.valor_planejado) || 0;
          }

          // ── Agrega zoot mensal por (cenario, ano): arrobasProd[12], cabIni[12], cabFin[12].
          const zootR: Record<number, { arr: number[]; cabIni: number[]; cabFin: number[] }> = {};
          const zootM: Record<number, { arr: number[]; cabIni: number[]; cabFin: number[] }> = {};
          for (const r of zootRowsAll) {
            const a = Number(r.ano), m = Number(r.mes);
            if (!Number.isInteger(a) || !Number.isInteger(m) || m < 1 || m > 12) continue;
            const bucket = r.cenario === 'meta' ? zootM : zootR;
            const slot = bucket[a] ??= { arr: Array(12).fill(0), cabIni: Array(12).fill(0), cabFin: Array(12).fill(0) };
            slot.arr[m - 1]    += (Number(r.producao_biologica) || 0) / 30;
            slot.cabIni[m - 1] += Number(r.saldo_inicial) || 0;
            slot.cabFin[m - 1] += Number(r.saldo_final)   || 0;
          }

          // ── Agrega lancs pec multi-ano (margemArr): rec[12], desfArr[12] por (cenario, ano).
          const pecR: Record<number, { rec: number[]; desfArr: number[] }> = {};
          const pecM: Record<number, { rec: number[]; desfArr: number[] }> = {};
          for (const r of pecRowsAll) {
            const a = Number(String(r.data ?? '').slice(0, 4));
            const m = parseInt(String(r.data ?? '').slice(5, 7));
            if (isNaN(a) || isNaN(m) || m < 1 || m > 12) continue;
            const isMeta = r.cenario === 'meta';
            if (!isMeta && r.status_operacional !== 'realizado') continue;
            const bucket = isMeta ? pecM : pecR;
            const slot = bucket[a] ??= { rec: Array(12).fill(0), desfArr: Array(12).fill(0) };
            const qtd = Number(r.quantidade) || 0;
            const pmk = Number(r.peso_medio_kg) || 0;
            const vt  = Math.abs(Number(r.valor_total) || 0);
            slot.rec[m - 1]    += vt;
            slot.desfArr[m - 1] += (qtd * pmk) / 30;
          }

          // ── Calculadores por ano (mode mês/periodo) ──
          const isPer = viewMode === 'periodo';
          const sumUpTo = (arr: number[]) => {
            let s = 0;
            for (let i = 0; i < mesAtual; i++) s += (arr[i] ?? 0);
            return s;
          };
          const meanCabMediaUpTo = (cabIni: number[], cabFin: number[]): number => {
            let acc = 0; let n = 0;
            for (let i = 0; i < mesAtual; i++) {
              const cm = ((cabIni[i] ?? 0) + (cabFin[i] ?? 0)) / 2;
              if (cm > 0) { acc += cm; n++; }
            }
            return n > 0 ? acc / n : 0;
          };

          const calcCusteio = (ano: number): number | null => {
            const arr = custeioR[ano];
            if (!arr) return null;
            const v = isPer ? sumUpTo(arr) : (arr[mesAtual - 1] ?? 0);
            return v > 0 ? v : null;
          };
          const calcCusteioMeta = (ano: number): number | null => {
            const arr = custeioM[ano];
            if (!arr) return null;
            const v = isPer ? sumUpTo(arr) : (arr[mesAtual - 1] ?? 0);
            return v > 0 ? v : null;
          };

          const calcCustoArr = (ano: number, isMeta: boolean): number | null => {
            const cArr = isMeta ? custeioM[ano] : custeioR[ano];
            const z    = isMeta ? zootM[ano]    : zootR[ano];
            if (!cArr || !z) return null;
            if (isPer) {
              const cAcum = sumUpTo(cArr);
              const aAcum = sumUpTo(z.arr);
              return aAcum > 0 ? cAcum / aAcum : null;
            }
            const c = cArr[mesAtual - 1] ?? 0;
            const a = z.arr[mesAtual - 1] ?? 0;
            return a > 0 ? c / a : null;
          };

          const calcCustoCab = (ano: number, isMeta: boolean): number | null => {
            const cArr = isMeta ? custeioM[ano] : custeioR[ano];
            const z    = isMeta ? zootM[ano]    : zootR[ano];
            if (!cArr || !z) return null;
            if (isPer) {
              const cAcum  = sumUpTo(cArr);
              const cmMean = meanCabMediaUpTo(z.cabIni, z.cabFin);
              if (!(cmMean > 0) || mesAtual <= 0) return null;
              return (cAcum / cmMean) / mesAtual;
            }
            const c = cArr[mesAtual - 1] ?? 0;
            const cm = ((z.cabIni[mesAtual - 1] ?? 0) + (z.cabFin[mesAtual - 1] ?? 0)) / 2;
            return cm > 0 ? c / cm : null;
          };

          const calcPrecoArr = (ano: number, isMeta: boolean): number | null => {
            const p = isMeta ? pecM[ano] : pecR[ano];
            if (!p) return null;
            if (isPer) {
              const rAcc = sumUpTo(p.rec);
              const dAcc = sumUpTo(p.desfArr);
              return dAcc > 0 ? rAcc / dAcc : null;
            }
            const r = p.rec[mesAtual - 1] ?? 0;
            const d = p.desfArr[mesAtual - 1] ?? 0;
            return d > 0 ? r / d : null;
          };

          const calcMargem = (ano: number, isMeta: boolean): number | null => {
            const preco = calcPrecoArr(ano, isMeta);
            const custo = calcCustoArr(ano, isMeta);
            if (preco == null || custo == null) return null;
            return preco - custo;
          };

          const calcValor = (ano: number, isMeta: boolean): number | null => {
            switch (indicadorKey) {
              case 'custeioPec': return isMeta ? calcCusteioMeta(ano) : calcCusteio(ano);
              case 'custoArr':   return calcCustoArr(ano, isMeta);
              case 'custoCab':   return calcCustoCab(ano, isMeta);
              case 'margemArr':  return calcMargem(ano, isMeta);
              default: return null;
            }
          };

          const resR: AnoValor[] = [];
          const resM: AnoValor[] = [];
          for (let a = inicio; a <= anoAtual; a++) {
            if (a === anoAtual && valorOficialAnoAtual !== undefined) {
              resR.push({ ano: a, valor: valorOficialAnoAtual ?? null });
            } else {
              resR.push({ ano: a, valor: calcValor(a, false) });
            }
            if (a === anoAtual && valorOficialMetaAnoAtual !== undefined) {
              resM.push({ ano: a, valor: valorOficialMetaAnoAtual ?? null });
            } else {
              resM.push({ ano: a, valor: calcValor(a, true) });
            }
          }

          if (!cancelled) {
            setHistorico(resR);
            setHistoricoMeta(resM);
          }
          return;
        }

        // ───── Branch padrão — zoot_mensal_cache (cabecas/pesoMedio/arrobas/gmd) ─────
        let query = supabase
          .from('zoot_mensal_cache')
          .select('ano, mes, cenario, saldo_inicial, saldo_final, peso_total_final, producao_biologica, saidas_externas, gmd')
          .in('cenario', ['realizado', 'meta'])
          .gte('ano', inicio)
          .lte('ano', anoAtual)
          .lte('mes', mesAtual);

        if (fazendaId) {
          query = query.eq('fazenda_id', fazendaId);
        } else if (fazendaIds && fazendaIds.length > 0) {
          query = query.in('fazenda_id', fazendaIds);
        } else {
          if (!cancelled) {
            setHistorico([]);
            setHistoricoMeta([]);
            setLoading(false);
          }
          return;
        }

        const { data, error } = await query;
        if (cancelled) return;
        if (error || !data) {
          setHistorico([]);
          setHistoricoMeta([]);
          return;
        }

        const porAnoR: Record<number, any[]> = {};
        const porAnoM: Record<number, any[]> = {};
        for (const r of data as any[]) {
          if (r.cenario === 'meta') {
            (porAnoM[r.ano] ??= []).push(r);
          } else {
            (porAnoR[r.ano] ??= []).push(r);
          }
        }

        // calcValor — replica fórmulas oficiais PC-100 onde aplicável.
        // Para GMD reusa computePeriodGmd (helper compartilhado).
        const calcValor = (rowsAll: any[], ano: number): number | null => {
          if (!rowsAll || rowsAll.length === 0) return null;
          const rowsMes = rowsAll.filter(r => r.mes === mesAtual);
          const rowsPer = rowsAll.filter(r => r.mes <= mesAtual);

          if (indicadorKey === 'cabecas') {
            if (viewMode === 'periodo') {
              return cabecasMediaPeriodoFromRows(rowsPer, mesAtual);
            }
            // mes — saldo_final no mesAtual
            const s = rowsMes.reduce((acc: number, r: any) =>
              acc + (Number(r.saldo_final) || 0), 0);
            return s > 0 ? s : null;
          }

          if (indicadorKey === 'pesoMedio') {
            return viewMode === 'periodo'
              ? pesoMedioPonderadoFromRows(rowsPer)
              : pesoMedioPonderadoFromRows(rowsMes);
          }

          if (indicadorKey === 'arrobas') {
            // mes: producao_biologica do mes / 30
            // periodo: Σ producao_biologica Jan→m / 30
            const rows = viewMode === 'periodo' ? rowsPer : rowsMes;
            const pb = rows.reduce((acc: number, r: any) =>
              acc + (Number(r.producao_biologica) || 0), 0);
            return pb > 0 ? pb / 30 : null;
          }

          if (indicadorKey === 'gmd') {
            // Constrói prodKg/cabMedia/dias do ano e aplica fórmula oficial.
            const prodKg12 = Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              return rowsAll
                .filter(r => r.mes === m)
                .reduce((s: number, r: any) =>
                  s + (Number(r.producao_biologica) || 0), 0);
            });
            const cabMedia12 = Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              const rs = rowsAll.filter(r => r.mes === m);
              const ini = rs.reduce((s: number, r: any) =>
                s + (Number(r.saldo_inicial) || 0), 0);
              const fin = rs.reduce((s: number, r: any) =>
                s + (Number(r.saldo_final) || 0), 0);
              return (ini + fin) / 2;
            });
            const dias12 = Array.from({ length: 12 }, (_, i) =>
              new Date(ano, i + 1, 0).getDate());

            if (viewMode === 'periodo') {
              const arr12 = computePeriodGmd(prodKg12, cabMedia12, dias12);
              const v = arr12[mesAtual - 1];
              return v != null && !isNaN(v) ? v : null;
            }
            // mes — fórmula oficial pontual: prodKg[m] / cabMedia[m] / dias[m]
            const m = mesAtual;
            const cm = cabMedia12[m - 1];
            const pb = prodKg12[m - 1];
            const d = dias12[m - 1];
            return cm > 0 && d > 0 ? pb / cm / d : null;
          }

          // 'desfrute', 'valorRebanho', 'uaHa' e 'kgHa' têm branches separados acima.

          return null;
        };

        const resR: AnoValor[] = [];
        const resM: AnoValor[] = [];
        for (let a = inicio; a <= anoAtual; a++) {
          // anoAtual: usar valor oficial (passado por prop) p/ bater 100% com topo.
          // Anos anteriores: usar cálculo via cache (auxiliar legado, sem overlay).
          if (a === anoAtual && valorOficialAnoAtual !== undefined) {
            resR.push({ ano: a, valor: valorOficialAnoAtual ?? null });
          } else {
            resR.push({ ano: a, valor: calcValor(porAnoR[a] ?? [], a) });
          }
          if (a === anoAtual && valorOficialMetaAnoAtual !== undefined) {
            resM.push({ ano: a, valor: valorOficialMetaAnoAtual ?? null });
          } else {
            resM.push({ ano: a, valor: calcValor(porAnoM[a] ?? [], a) });
          }
        }

        if (!cancelled) {
          setHistorico(resR);
          setHistoricoMeta(resM);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [
    enabled, clienteId, fazendaId,
    fazendaIds?.join(','),
    indicadorKey, anoAtual, anoInicio, mesAtual, viewMode,
    valorOficialAnoAtual, valorOficialMetaAnoAtual,
  ]);

  return { historico, historicoMeta, loading };
}
