/**
 * useAuditoriaCustoCab — bloco de AUDITORIA do indicador "Custo Cab. período R$/cab.mês".
 *
 * ⚠️ AVISO: ESTE HOOK NÃO É FONTE OFICIAL DEFINITIVA.
 *   - Usado APENAS pelo bloco de auditoria visual em PainelConsultorTab.
 *   - NÃO consumir em V2Home, IndicadorHistoricoModal nem em qualquer outro
 *     componente de produção.
 *   - Quando o bug do gráfico histórico for resolvido, este hook e o bloco
 *     de auditoria podem ser removidos.
 *
 * OBJETIVO
 * ────────
 * Calcular para cada ano [anoInicio..anoAtual] os componentes do custoCab
 * período usando EXATAMENTE os mesmos filtros SQL e a mesma fórmula que o
 * `usePainelConsultorData` aplica para o ano corrente — porém para todos os anos
 * de uma vez. Serve como ground-truth visual para conferir o gráfico histórico.
 *
 * FILTRO (idêntico ao oficial)
 * ────────────────────────────
 *   custeio: financeiro_lancamentos_v2
 *     - cancelado=false
 *     - sem_movimentacao_caixa=false
 *     - status_transacao='realizado'
 *     - cenario='realizado'
 *     - grupo_custo IN ('Custo Fixo Pecuária', 'Custo Variável Pecuária')
 *     - data_pagamento entre [inicio-01-01, anoAtual-12-31]
 *
 *   zoot:    zoot_mensal_cache
 *     - cenario='realizado'
 *     - ano entre [inicio, anoAtual]
 *
 *   ambos paginados via fetchAllPaginated (sem corte silencioso).
 *
 * FÓRMULA (idêntica ao oficial)
 * ─────────────────────────────
 *   custoCab = (Σ custeio[Jan→mesAtual] / cabMediaMean) / mesAtual
 *   onde:
 *     cabMediaMean = média de (saldo_inicial+saldo_final)/2 para os meses Jan→mesAtual
 *                    com cabMedia > 0 (filtra meses zerados antes de mediar).
 *
 * NÃO altera nada no banco. NÃO escreve. NÃO usa fonte paralela.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/lib/supabase/fetchAllPaginated';

export interface AuditoriaCustoCabRow {
  ano: number;
  /** Σ custeio realizado Jan→mesAtual. */
  custeioAcum: number;
  /** Quantos meses de Jan→mesAtual têm cabMedia > 0. */
  mesesComRebanho: number;
  /** Mean de cabMedia[Jan→mesAtual] filtrando >0. */
  cabMediaMean: number;
  /** Quantidade de meses considerados no divisor (= mesAtual). */
  mesesPeriodo: number;
  /** Resultado final (R$/cab.mês). */
  custoCab: number | null;
}

interface Params {
  enabled: boolean;
  clienteId?: string;
  fazendaId?: string | null;
  fazendaIds?: string[];
  anoInicio: number;
  anoAtual: number;
  mesAtual: number;
}

export function useAuditoriaCustoCab({
  enabled,
  clienteId,
  fazendaId,
  fazendaIds,
  anoInicio,
  anoAtual,
  mesAtual,
}: Params): { rows: AuditoriaCustoCabRow[]; loading: boolean } {
  const [rows, setRows] = useState<AuditoriaCustoCabRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !clienteId) { setRows([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // 1) Custeio realizado paginado.
        const finRes = await fetchAllPaginated<{ data_pagamento: string; valor: number }>({
          query: () => {
            let q = (supabase
              .from('financeiro_lancamentos_v2')
              .select('data_pagamento, valor') as any)
              .eq('cancelado', false)
              .eq('sem_movimentacao_caixa', false)
              .eq('status_transacao', 'realizado')
              .eq('cenario', 'realizado')
              .in('grupo_custo', ['Custo Fixo Pecuária', 'Custo Variável Pecuária'])
              .gte('data_pagamento', `${anoInicio}-01-01`)
              .lte('data_pagamento', `${anoAtual}-12-31`);
            if (fazendaId) q = q.eq('fazenda_id', fazendaId);
            else if (fazendaIds && fazendaIds.length > 0) q = q.in('fazenda_id', fazendaIds);
            return q;
          },
          shouldAbort: () => cancelled,
          context: 'useAuditoriaCustoCab/financeiro',
        });
        if (cancelled || finRes.aborted) return;

        // 2) Zoot realizado paginado.
        const zootRes = await fetchAllPaginated<{
          ano: number; mes: number; saldo_inicial: number; saldo_final: number;
        }>({
          query: () => {
            let q = supabase
              .from('zoot_mensal_cache')
              .select('ano, mes, saldo_inicial, saldo_final')
              .eq('cenario', 'realizado')
              .gte('ano', anoInicio)
              .lte('ano', anoAtual);
            if (fazendaId) q = q.eq('fazenda_id', fazendaId);
            else if (fazendaIds && fazendaIds.length > 0) q = q.in('fazenda_id', fazendaIds);
            return q;
          },
          shouldAbort: () => cancelled,
          context: 'useAuditoriaCustoCab/zoot',
        });
        if (cancelled || zootRes.aborted) return;

        // 3) Agrega custeio por (ano, mês).
        const custeioPorAno = new Map<number, number[]>();
        for (const r of finRes.data) {
          const a = Number(String(r.data_pagamento ?? '').slice(0, 4));
          const m = parseInt(String(r.data_pagamento ?? '').slice(5, 7));
          if (isNaN(a) || isNaN(m) || m < 1 || m > 12) continue;
          if (!custeioPorAno.has(a)) custeioPorAno.set(a, Array(12).fill(0));
          custeioPorAno.get(a)![m - 1] += Math.abs(Number(r.valor) || 0);
        }

        // 4) Agrega zoot por (ano, mês) — soma cabIni/cabFin entre múltiplas fazendas.
        const zootPorAno = new Map<number, { cabIni: number[]; cabFin: number[] }>();
        for (const r of zootRes.data) {
          const a = Number(r.ano), m = Number(r.mes);
          if (!Number.isInteger(a) || !Number.isInteger(m) || m < 1 || m > 12) continue;
          if (!zootPorAno.has(a)) {
            zootPorAno.set(a, { cabIni: Array(12).fill(0), cabFin: Array(12).fill(0) });
          }
          const slot = zootPorAno.get(a)!;
          slot.cabIni[m - 1] += Number(r.saldo_inicial) || 0;
          slot.cabFin[m - 1] += Number(r.saldo_final) || 0;
        }

        // 5) Para cada ano no range, computa breakdown + resultado oficial.
        const out: AuditoriaCustoCabRow[] = [];
        for (let a = anoInicio; a <= anoAtual; a++) {
          const cArr = custeioPorAno.get(a) ?? Array(12).fill(0);
          const z    = zootPorAno.get(a)    ?? { cabIni: Array(12).fill(0), cabFin: Array(12).fill(0) };

          // sumUpTo (Jan→mesAtual)
          let custeioAcum = 0;
          for (let i = 0; i < mesAtual; i++) custeioAcum += cArr[i] ?? 0;

          // meanCabMediaUpTo (filtro >0)
          let acc = 0; let n = 0;
          for (let i = 0; i < mesAtual; i++) {
            const cm = ((z.cabIni[i] ?? 0) + (z.cabFin[i] ?? 0)) / 2;
            if (cm > 0) { acc += cm; n++; }
          }
          const cabMediaMean = n > 0 ? acc / n : 0;

          // Fórmula oficial: (cAcum / cmMean) / mesAtual
          const custoCab = cabMediaMean > 0 && mesAtual > 0
            ? (custeioAcum / cabMediaMean) / mesAtual
            : null;

          out.push({
            ano: a,
            custeioAcum,
            mesesComRebanho: n,
            cabMediaMean,
            mesesPeriodo: mesAtual,
            custoCab,
          });
        }

        if (!cancelled) setRows(out);
      } catch (e) {
        console.error('[useAuditoriaCustoCab]', e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [
    enabled, clienteId, fazendaId,
    fazendaIds?.join(','),
    anoInicio, anoAtual, mesAtual,
  ]);

  return { rows, loading };
}
