/**
 * useReceitaPecMetaIndependente
 *
 * Hook auxiliar do cockpit V2PlanejamentoVisaoGeral.
 *
 * Busca Receita Pecuária META direto de `lancamentos` (cenario='meta',
 * tipos abate/venda) sem passar pelo PC-100. Existência justificada por
 * bug no pipeline interno do PC-100 onde pecMeta12 é populado correto
 * via fetch mas receitaPecIndicador.serieMeta chega null à tela
 * (diagnóstico Marco 1.1.B-FIX-3-DIAG-RUNTIME).
 *
 * Retorna série mensal não-cumulativa (12 elementos, Jan..Dez).
 * Tela é responsável por cumSum se precisar de série cumulativa.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Params {
  ano: number;
  clienteId: string | undefined;
  fazendaId: string | undefined;
  isGlobal: boolean;
  enabled?: boolean;
}

interface ReceitaPecMetaResult {
  serieMensal: number[];     // 12 elementos, Jan..Dez, valores BRL
  serieAcumulada: number[];  // 12 elementos cumulativos
  totalAnual: number;
  loading: boolean;
  error: string | null;
}

const TIPOS_META = ['abate', 'venda', 'venda_pe'] as const;

export function useReceitaPecMetaIndependente({
  ano, clienteId, fazendaId, isGlobal, enabled = true,
}: Params): ReceitaPecMetaResult {
  const [state, setState] = useState<ReceitaPecMetaResult>({
    serieMensal: Array(12).fill(0),
    serieAcumulada: Array(12).fill(0),
    totalAnual: 0,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    if (isGlobal && !clienteId) return;
    if (!isGlobal && (!fazendaId || fazendaId === '__global__')) return;

    let cancelled = false;
    const load = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      try {
        let q = supabase
          .from('lancamentos')
          .select('valor_total, data')
          .eq('cancelado', false)
          .eq('cenario', 'meta')
          .in('tipo', [...TIPOS_META] as string[])
          .gte('data', `${ano}-01-01`)
          .lte('data', `${ano}-12-31`);

        if (isGlobal) {
          q = q.eq('cliente_id', clienteId!);
        } else {
          q = q.eq('fazenda_id', fazendaId!);
        }

        const allRows: any[] = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
          const { data, error } = await q.order('data').range(from, from + PAGE - 1);
          if (cancelled) return;
          if (error) {
            setState(prev => ({ ...prev, loading: false, error: error.message }));
            return;
          }
          if (!data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < PAGE) break;
          from += PAGE;
        }

        if (cancelled) return;

        const serieMensal = Array(12).fill(0);
        for (const r of allRows) {
          const m = parseInt(String(r.data ?? '').slice(5, 7));
          if (isNaN(m) || m < 1 || m > 12) continue;
          serieMensal[m - 1] += Math.abs(Number(r.valor_total) || 0);
        }

        const serieAcumulada = serieMensal.reduce<number[]>((acc, v, i) => {
          acc.push((acc[i - 1] ?? 0) + v);
          return acc;
        }, []);

        const totalAnual = serieMensal.reduce((a, v) => a + v, 0);

        setState({
          serieMensal,
          serieAcumulada,
          totalAnual,
          loading: false,
          error: null,
        });
      } catch (e: any) {
        if (!cancelled) {
          setState(prev => ({ ...prev, loading: false, error: e?.message ?? 'unknown' }));
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [enabled, ano, clienteId, fazendaId, isGlobal]);

  return state;
}
