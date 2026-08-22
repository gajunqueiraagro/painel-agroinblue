import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Cliente Supabase casteado de forma frouxa: a tabela planejamento_area_meta
// (criada em C1) ainda não está refletida em src/integrations/supabase/types.ts.
// Mesmo padrão usado em usePlanejamentoAprovacaoData. Trocar quando types.ts
// for regenerado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLoose = any;
const sbLoose = supabase as SupabaseLoose;

// ────────── Tipos públicos ──────────

export interface AreaMetaMes {
  mes: number;                              // 1-12
  area_pecuaria_ha: number | null;          // null = sem cadastro nesse mês
  area_agricultura_ha: number | null;
  area_reserva_ha: number | null;
  area_benfeitorias_ha: number | null;
  area_silvicultura_ha: number | null;
  area_app_ha: number | null;
  area_outras_ha: number | null;
  area_total_ha: number | null;
}

export interface AreaMetaAnual {
  porMes: AreaMetaMes[];                    // SEMPRE length 12, jan→dez
  mediaPecuaria: number | null;             // ignora meses null
  mediaAgricultura: number | null;
  mediaReserva: number | null;
  mediaBenfeitorias: number | null;
  mediaTotal: number | null;
  totalAcumPecuaria: number | null;
  totalAcumAgricultura: number | null;
  totalAcumReserva: number | null;
  totalAcumBenfeitorias: number | null;
  totalAcumTotal: number | null;
  mesesCadastrados: number;                 // 0-12
  isCompleto: boolean;                      // mesesCadastrados === 12
}

export interface UpsertLinhaArea {
  mes: number;
  /* Os SETE campos de area, todos `number | null`. NULL = nao planejado;
     0 = planejado como zero. A distincao e a razao da migration
     20260912120000 e nao pode ser apagada no caminho ate o banco. */
  area_pecuaria_ha: number | null;
  area_agricultura_ha: number | null;
  area_silvicultura_ha: number | null;
  area_reserva_ha: number | null;
  area_app_ha: number | null;
  area_benfeitorias_ha: number | null;
  area_outras_ha: number | null;
}

export interface UseAreaPlanejamentoResult {
  loading: boolean;
  saving: boolean;
  error: Error | null;
  data: AreaMetaAnual | null;
  refresh: () => void;
  upsertAno: (linhas: UpsertLinhaArea[]) => Promise<void>;
}

// ────────── Helpers internos ──────────

function emptyMes(mes: number): AreaMetaMes {
  return {
    mes,
    area_pecuaria_ha: null,
    area_agricultura_ha: null,
    area_reserva_ha: null,
    area_benfeitorias_ha: null,
    area_silvicultura_ha: null,
    area_app_ha: null,
    area_outras_ha: null,
    area_total_ha: null,
  };
}

function buildEmptyAnual(): AreaMetaAnual {
  return {
    porMes: Array.from({ length: 12 }, (_, i) => emptyMes(i + 1)),
    mediaPecuaria: null,
    mediaAgricultura: null,
    mediaReserva: null,
    mediaBenfeitorias: null,
    mediaTotal: null,
    totalAcumPecuaria: null,
    totalAcumAgricultura: null,
    totalAcumReserva: null,
    totalAcumBenfeitorias: null,
    totalAcumTotal: null,
    mesesCadastrados: 0,
    isCompleto: false,
  };
}

function mediaSafe(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  if (validos.length === 0) return null;
  return validos.reduce((s, v) => s + v, 0) / validos.length;
}

function somaSafe(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  if (validos.length === 0) return null;
  return validos.reduce((s, v) => s + v, 0);
}

interface RowArea {
  mes: number;
  area_pecuaria_ha: number | null;
  area_agricultura_ha: number | null;
  area_reserva_ha: number | null;
  area_benfeitorias_ha: number | null;
  area_silvicultura_ha: number | null;
  area_app_ha: number | null;
  area_outras_ha: number | null;
  area_total_ha: number | null;
}

function agregarPorMes(rows: RowArea[]): AreaMetaAnual {
  // rows pode ter múltiplos registros por mês (caso Global agregado já vir SUM, vem 1 por mês;
  // caso individual com cadastro, vem 1 por mês também devido ao UNIQUE).
  const anual = buildEmptyAnual();
  for (const row of rows) {
    const mesIdx = row.mes - 1;
    if (mesIdx < 0 || mesIdx > 11) continue;
    const slot = anual.porMes[mesIdx];
    slot.area_pecuaria_ha = Number(row.area_pecuaria_ha ?? 0);
    slot.area_agricultura_ha = Number(row.area_agricultura_ha ?? 0);
    slot.area_reserva_ha = Number(row.area_reserva_ha ?? 0);
    slot.area_benfeitorias_ha = Number(row.area_benfeitorias_ha ?? 0);
    slot.area_silvicultura_ha = Number(row.area_silvicultura_ha ?? 0);
    slot.area_app_ha = Number(row.area_app_ha ?? 0);
    slot.area_outras_ha = Number(row.area_outras_ha ?? 0);
    slot.area_total_ha = Number(row.area_total_ha ?? 0);
  }
  anual.mesesCadastrados = anual.porMes.filter(m => m.area_total_ha !== null).length;
  anual.isCompleto = anual.mesesCadastrados === 12;
  anual.mediaPecuaria        = mediaSafe(anual.porMes.map(m => m.area_pecuaria_ha));
  anual.mediaAgricultura     = mediaSafe(anual.porMes.map(m => m.area_agricultura_ha));
  anual.mediaReserva       = mediaSafe(anual.porMes.map(m => m.area_reserva_ha));
  anual.mediaBenfeitorias  = mediaSafe(anual.porMes.map(m => m.area_benfeitorias_ha));
  anual.mediaTotal           = mediaSafe(anual.porMes.map(m => m.area_total_ha));
  anual.totalAcumPecuaria       = somaSafe(anual.porMes.map(m => m.area_pecuaria_ha));
  anual.totalAcumAgricultura    = somaSafe(anual.porMes.map(m => m.area_agricultura_ha));
  anual.totalAcumReserva      = somaSafe(anual.porMes.map(m => m.area_reserva_ha));
  anual.totalAcumBenfeitorias = somaSafe(anual.porMes.map(m => m.area_benfeitorias_ha));
  anual.totalAcumTotal          = somaSafe(anual.porMes.map(m => m.area_total_ha));
  return anual;
}

// ────────── Hook principal ──────────

export function useAreaPlanejamento(
  clienteId: string | null | undefined,
  fazendaId: string | null | undefined,
  ano: number,
  isGlobal: boolean,
  /** Gate do caller (default true). enabled=false → não consulta e zera o estado. */
  enabled = true,
): UseAreaPlanejamentoResult {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<AreaMetaAnual | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    if (!enabled || !clienteId) {
      setData(null);
      setLoading(false);
      return;
    }
    if (!isGlobal && !fazendaId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        if (isGlobal) {
          // Agregado: SUM por mês cruzando todas as fazendas do cliente naquele ano.
          // Como Supabase não tem GROUP BY direto via PostgREST, baixar tudo e agrupar em JS.
          //
          // V1: em modo Global, mês é considerado cadastrado se ao menos uma fazenda
          // tiver linha. A completude por fazenda será tratada na UI/PC-100 em etapa futura.
          const { data: rows, error: err } = await sbLoose
            .from('planejamento_area_meta')
            .select('mes, area_pecuaria_ha, area_agricultura_ha, area_silvicultura_ha, area_reserva_ha, area_app_ha, area_benfeitorias_ha, area_outras_ha, area_total_ha')
            .eq('cliente_id', clienteId)
            .eq('ano', ano);
          if (err) throw err;
          const rowsTyped = (rows ?? []) as RowArea[];
          const porMes = new Map<number, RowArea>();
          for (const r of rowsTyped) {
            const mes = r.mes;
            const prev = porMes.get(mes) ?? {
              mes,
              area_pecuaria_ha: 0,
              area_agricultura_ha: 0,
              area_reserva_ha: 0,
              area_benfeitorias_ha: 0,
              area_silvicultura_ha: 0,
              area_app_ha: 0,
              area_outras_ha: 0,
              area_total_ha: 0,
            };
            prev.area_pecuaria_ha       = (prev.area_pecuaria_ha       ?? 0) + Number(r.area_pecuaria_ha ?? 0);
            prev.area_agricultura_ha    = (prev.area_agricultura_ha    ?? 0) + Number(r.area_agricultura_ha ?? 0);
            prev.area_reserva_ha      = (prev.area_reserva_ha      ?? 0) + Number(r.area_reserva_ha ?? 0);
            prev.area_benfeitorias_ha = (prev.area_benfeitorias_ha ?? 0) + Number(r.area_benfeitorias_ha ?? 0);
            prev.area_silvicultura_ha = (prev.area_silvicultura_ha ?? 0) + Number(r.area_silvicultura_ha ?? 0);
            prev.area_app_ha          = (prev.area_app_ha          ?? 0) + Number(r.area_app_ha ?? 0);
            prev.area_outras_ha       = (prev.area_outras_ha       ?? 0) + Number(r.area_outras_ha ?? 0);
            prev.area_total_ha          = (prev.area_total_ha          ?? 0) + Number(r.area_total_ha ?? 0);
            porMes.set(mes, prev);
          }
          if (!cancelled) {
            setData(agregarPorMes(Array.from(porMes.values())));
            setLoading(false);
          }
        } else {
          const { data: rows, error: err } = await sbLoose
            .from('planejamento_area_meta')
            .select('mes, area_pecuaria_ha, area_agricultura_ha, area_silvicultura_ha, area_reserva_ha, area_app_ha, area_benfeitorias_ha, area_outras_ha, area_total_ha')
            .eq('cliente_id', clienteId)
            .eq('fazenda_id', fazendaId!)
            .eq('ano', ano);
          if (err) throw err;
          if (!cancelled) {
            setData(agregarPorMes((rows ?? []) as RowArea[]));
            setLoading(false);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setData(null);
          setLoading(false);
        }
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [enabled, clienteId, fazendaId, ano, isGlobal, reloadKey]);

  const upsertAno = useCallback(async (linhas: UpsertLinhaArea[]) => {
    if (isGlobal) {
      throw new Error('upsertAno não permitido em modo Global. Use modo individual.');
    }
    if (!clienteId || !fazendaId) {
      throw new Error('clienteId e fazendaId obrigatórios.');
    }
    if (linhas.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const payload = linhas.map(l => ({
        cliente_id: clienteId,
        fazenda_id: fazendaId,
        ano,
        mes: l.mes,
        /* NULL = nao planejado; 0 = planejado como zero. `|| 0` apagaria a
           distincao — e ela e a razao da migration 20260912120000.
           area_total_ha NAO enviado — e GENERATED no banco. */
        area_pecuaria_ha: l.area_pecuaria_ha,
        area_agricultura_ha: l.area_agricultura_ha,
        area_silvicultura_ha: l.area_silvicultura_ha,
        area_reserva_ha: l.area_reserva_ha,
        area_app_ha: l.area_app_ha,
        area_benfeitorias_ha: l.area_benfeitorias_ha,
        area_outras_ha: l.area_outras_ha,
      }));
      const { error: err } = await sbLoose
        .from('planejamento_area_meta')
        .upsert(payload, { onConflict: 'cliente_id,fazenda_id,ano,mes' });
      if (err) throw err;
      setSaving(false);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setSaving(false);
      throw e;
    }
  }, [clienteId, fazendaId, ano, isGlobal, refresh]);

  return { loading, saving, error, data, refresh, upsertAno };
}
