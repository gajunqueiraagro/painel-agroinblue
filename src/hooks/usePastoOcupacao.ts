import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';

export interface PastoOcupacao {
  pasto_id: string;
  cabecas: number;
  peso_total_kg: number;
  peso_medio_kg: number | null;
  categoria_principal: string | null;
  kg_ha: number | null;
  status: 'sem_ocupacao' | 'atencao' | 'adequado' | 'pressao';
}

function classificar(kgHa: number | null): PastoOcupacao['status'] {
  if (kgHa == null || kgHa === 0) return 'sem_ocupacao';
  if (kgHa < 280) return 'atencao';
  if (kgHa <= 600) return 'adequado';
  return 'pressao';
}

export function usePastoOcupacao(pastos: { id: string; area_produtiva_ha: number | null }[]) {
  const { fazendaAtual } = useFazenda();
  const [ocupacoes, setOcupacoes] = useState<Map<string, PastoOcupacao>>(new Map());
  const [loading, setLoading] = useState(false);

  const fazendaId = fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id;
  const clienteId = fazendaAtual?.cliente_id;

  const pastoIds = useMemo(() => pastos.map(p => p.id), [pastos]);
  const areaMap = useMemo(() => {
    const m = new Map<string, number>();
    pastos.forEach(p => { if (p.area_produtiva_ha) m.set(p.id, p.area_produtiva_ha); });
    return m;
  }, [pastos]);

  const load = useCallback(async () => {
    if (!fazendaId || !clienteId || pastoIds.length === 0) {
      setOcupacoes(new Map());
      return;
    }
    setLoading(true);

    // Get latest fechamento_pastos per pasto
    const { data: fechamentos, error: fErr } = await supabase
      .from('fechamento_pastos')
      .select('id, pasto_id, ano_mes')
      .eq('fazenda_id', fazendaId)
      .in('pasto_id', pastoIds)
      .order('ano_mes', { ascending: false });

    if (fErr || !fechamentos?.length) {
      setOcupacoes(new Map());
      setLoading(false);
      return;
    }

    // Keep only latest fechamento per pasto
    const latestByPasto = new Map<string, string>();
    fechamentos.forEach(f => {
      if (!latestByPasto.has(f.pasto_id)) {
        latestByPasto.set(f.pasto_id, f.id);
      }
    });

    const fechamentoIds = Array.from(latestByPasto.values());

    // Get items for those fechamentos
    const { data: itens, error: iErr } = await supabase
      .from('fechamento_pasto_itens')
      .select('fechamento_id, quantidade, peso_medio_kg, categoria_id')
      .in('fechamento_id', fechamentoIds);

    if (iErr) {
      console.error('[usePastoOcupacao]', iErr);
      setOcupacoes(new Map());
      setLoading(false);
      return;
    }

    // Build fechamento_id -> pasto_id reverse map
    const fechToPasto = new Map<string, string>();
    latestByPasto.forEach((fechId, pastoId) => fechToPasto.set(fechId, pastoId));

    // Aggregate per pasto
    const agg = new Map<string, { cabecas: number; pesoTotal: number; catPrincipal: string | null; maxQty: number }>();
    (itens || []).forEach(item => {
      const pastoId = fechToPasto.get(item.fechamento_id);
      if (!pastoId) return;
      const cur = agg.get(pastoId) || { cabecas: 0, pesoTotal: 0, catPrincipal: null, maxQty: 0 };
      cur.cabecas += item.quantidade;
      cur.pesoTotal += item.quantidade * (item.peso_medio_kg || 0);
      if (item.quantidade > cur.maxQty) {
        cur.maxQty = item.quantidade;
        cur.catPrincipal = item.categoria_id;
      }
      agg.set(pastoId, cur);
    });

    const result = new Map<string, PastoOcupacao>();
    agg.forEach((v, pastoId) => {
      const area = areaMap.get(pastoId);
      const kgHa = area && area > 0 ? v.pesoTotal / area : null;
      result.set(pastoId, {
        pasto_id: pastoId,
        cabecas: v.cabecas,
        peso_total_kg: v.pesoTotal,
        peso_medio_kg: v.cabecas > 0 ? v.pesoTotal / v.cabecas : null,
        categoria_principal: v.catPrincipal,
        kg_ha: kgHa,
        status: classificar(kgHa),
      });
    });

    setOcupacoes(result);
    setLoading(false);
  }, [fazendaId, clienteId, pastoIds, areaMap]);

  useEffect(() => { load(); }, [load]);

  const getOcupacao = useCallback((pastoId: string): PastoOcupacao | null => {
    return ocupacoes.get(pastoId) || null;
  }, [ocupacoes]);

  return { ocupacoes, loading, reload: load, getOcupacao };
}
