import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';

export interface PastoGeometria {
  id: string;
  fazenda_id: string;
  pasto_id: string | null;
  cliente_id: string;
  nome_original: string | null;
  geojson: GeoJSON.Geometry;
  cor: string | null;
  created_at: string;
}

export function usePastoGeometrias() {
  const { fazendaAtual } = useFazenda();
  const [geometrias, setGeometrias] = useState<PastoGeometria[]>([]);
  const [loading, setLoading] = useState(true);

  const fazendaId = fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id;
  const clienteId = fazendaAtual?.cliente_id;

  const loadGeometrias = useCallback(async () => {
    if (!fazendaId) { setGeometrias([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('pasto_geometrias')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('nome_original');
    if (error) { toast.error('Erro ao carregar geometrias'); console.error(error); }
    else setGeometrias((data || []).map(d => ({ ...d, geojson: d.geojson as unknown as GeoJSON.Geometry })));
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { loadGeometrias(); }, [loadGeometrias]);

  const salvarGeometrias = useCallback(async (
    items: { pasto_id: string | null; nome_original: string; geojson: GeoJSON.Geometry; cor?: string }[]
  ) => {
    if (!fazendaId || !clienteId) return false;

    // Delete existing geometries for this farm
    await supabase.from('pasto_geometrias').delete().eq('fazenda_id', fazendaId);

    const rows = items.map(item => ({
      fazenda_id: fazendaId,
      cliente_id: clienteId,
      pasto_id: item.pasto_id,
      nome_original: item.nome_original,
      geojson: item.geojson as any,
      cor: item.cor || null,
    }));

    const { error } = await supabase.from('pasto_geometrias').insert(rows);
    if (error) { toast.error('Erro ao salvar geometrias'); console.error(error); return false; }
    toast.success(`${rows.length} polígonos salvos`);
    await loadGeometrias();
    return true;
  }, [fazendaId, clienteId, loadGeometrias]);

  const removerGeometrias = useCallback(async () => {
    if (!fazendaId) return false;
    const { error } = await supabase.from('pasto_geometrias').delete().eq('fazenda_id', fazendaId);
    if (error) { toast.error('Erro ao remover geometrias'); console.error(error); return false; }
    toast.success('Mapa removido com sucesso');
    setGeometrias([]);
    return true;
  }, [fazendaId]);

  return { geometrias, loading, loadGeometrias, salvarGeometrias, removerGeometrias };
}
