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
} from '@/lib/calculos/painelConsultorIndicadores';

export type HistoricoIndicadorKey =
  | 'cabecas'
  | 'pesoMedio'
  | 'arrobas'
  | 'gmd'
  | 'desfrute';

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
            // soma producao_biologica Jan→mesAtual / 30
            const pb = rowsPer.reduce((acc: number, r: any) =>
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

          if (indicadorKey === 'desfrute') {
            const s = rowsPer.reduce((acc: number, r: any) =>
              acc + (Number(r.saidas_externas) || 0), 0);
            return s > 0 ? s : null;
          }

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
