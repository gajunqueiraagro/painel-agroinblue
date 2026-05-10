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
  area_ambiental_ha: number | null;
  area_infraestrutura_ha: number | null;
  area_total_ha: number | null;
}

export interface AreaMetaAnual {
  porMes: AreaMetaMes[];                    // SEMPRE length 12, jan→dez
  mediaPecuaria: number | null;             // ignora meses null
  mediaAgricultura: number | null;
  mediaAmbiental: number | null;
  mediaInfraestrutura: number | null;
  mediaTotal: number | null;
  totalAcumPecuaria: number | null;
  totalAcumAgricultura: number | null;
  totalAcumAmbiental: number | null;
  totalAcumInfraestrutura: number | null;
  totalAcumTotal: number | null;
  mesesCadastrados: number;                 // 0-12
  isCompleto: boolean;                      // mesesCadastrados === 12
}

export interface UpsertLinhaArea {
  mes: number;
  area_pecuaria_ha: number;
  area_agricultura_ha: number;
  area_ambiental_ha?: number;               // omitido = 0
  area_infraestrutura_ha?: number;          // omitido = 0
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
    area_ambiental_ha: null,
    area_infraestrutura_ha: null,
    area_total_ha: null,
  };
}

function buildEmptyAnual(): AreaMetaAnual {
  return {
    porMes: Array.from({ length: 12 }, (_, i) => emptyMes(i + 1)),
    mediaPecuaria: null,
    mediaAgricultura: null,
    mediaAmbiental: null,
    mediaInfraestrutura: null,
    mediaTotal: null,
    totalAcumPecuaria: null,
    totalAcumAgricultura: null,
    totalAcumAmbiental: null,
    totalAcumInfraestrutura: null,
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
  area_ambiental_ha: number | null;
  area_infraestrutura_ha: number | null;
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
    slot.area_ambiental_ha = Number(row.area_ambiental_ha ?? 0);
    slot.area_infraestrutura_ha = Number(row.area_infraestrutura_ha ?? 0);
    slot.area_total_ha = Number(row.area_total_ha ?? 0);
  }
  anual.mesesCadastrados = anual.porMes.filter(m => m.area_total_ha !== null).length;
  anual.isCompleto = anual.mesesCadastrados === 12;
  anual.mediaPecuaria        = mediaSafe(anual.porMes.map(m => m.area_pecuaria_ha));
  anual.mediaAgricultura     = mediaSafe(anual.porMes.map(m => m.area_agricultura_ha));
  anual.mediaAmbiental       = mediaSafe(anual.porMes.map(m => m.area_ambiental_ha));
  anual.mediaInfraestrutura  = mediaSafe(anual.porMes.map(m => m.area_infraestrutura_ha));
  anual.mediaTotal           = mediaSafe(anual.porMes.map(m => m.area_total_ha));
  anual.totalAcumPecuaria       = somaSafe(anual.porMes.map(m => m.area_pecuaria_ha));
  anual.totalAcumAgricultura    = somaSafe(anual.porMes.map(m => m.area_agricultura_ha));
  anual.totalAcumAmbiental      = somaSafe(anual.porMes.map(m => m.area_ambiental_ha));
  anual.totalAcumInfraestrutura = somaSafe(anual.porMes.map(m => m.area_infraestrutura_ha));
  anual.totalAcumTotal          = somaSafe(anual.porMes.map(m => m.area_total_ha));
  return anual;
}

// ────────── Hook principal ──────────

export function useAreaPlanejamento(
  clienteId: string | null | undefined,
  fazendaId: string | null | undefined,
  ano: number,
  isGlobal: boolean,
): UseAreaPlanejamentoResult {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<AreaMetaAnual | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    if (!clienteId) {
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
            .select('mes, area_pecuaria_ha, area_agricultura_ha, area_ambiental_ha, area_infraestrutura_ha, area_total_ha')
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
              area_ambiental_ha: 0,
              area_infraestrutura_ha: 0,
              area_total_ha: 0,
            };
            prev.area_pecuaria_ha       = (prev.area_pecuaria_ha       ?? 0) + Number(r.area_pecuaria_ha ?? 0);
            prev.area_agricultura_ha    = (prev.area_agricultura_ha    ?? 0) + Number(r.area_agricultura_ha ?? 0);
            prev.area_ambiental_ha      = (prev.area_ambiental_ha      ?? 0) + Number(r.area_ambiental_ha ?? 0);
            prev.area_infraestrutura_ha = (prev.area_infraestrutura_ha ?? 0) + Number(r.area_infraestrutura_ha ?? 0);
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
            .select('mes, area_pecuaria_ha, area_agricultura_ha, area_ambiental_ha, area_infraestrutura_ha, area_total_ha')
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
  }, [clienteId, fazendaId, ano, isGlobal, reloadKey]);

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
        area_pecuaria_ha: Number(l.area_pecuaria_ha) || 0,
        area_agricultura_ha: Number(l.area_agricultura_ha) || 0,
        area_ambiental_ha: Number(l.area_ambiental_ha ?? 0) || 0,
        area_infraestrutura_ha: Number(l.area_infraestrutura_ha ?? 0) || 0,
        // area_total_ha NÃO enviado — é GENERATED no banco
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
