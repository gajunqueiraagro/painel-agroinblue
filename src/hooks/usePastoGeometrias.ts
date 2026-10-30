import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useFazenda } from '@/contexts/FazendaContext';
import { toast } from 'sonner';

/**
 * MAPA-IMPORT-01a — os polígonos do mapa da fazenda (`fazenda_geometrias`): um por pasto (tipo 'pasto') e as áreas da fazenda
 * (reserva, APP, benfeitoria...). Gravar o mapa inteiro é SÓ pela `fn_mapa_fazenda_substituir` (apaga e grava numa transação; erro
 * desfaz tudo). A área em ha não é gravada: sai do polígono na leitura.
 */
export type TipoGeometria =
  | 'pasto' | 'area_sem_uso' | 'reserva_legal' | 'app' | 'benfeitoria' | 'estrada' | 'area_total' | 'outra';

export interface FazendaGeometria {
  id: string;
  fazenda_id: string;
  cliente_id: string;
  pasto_id: string | null;
  tipo: string;
  nome_original: string;
  geojson: GeoJSON.Geometry;
  cor: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoligonoParaGravar {
  tipo: TipoGeometria;
  pasto_id: string | null;
  nome_original: string;
  geojson: GeoJSON.Geometry;
  cor?: string | null;
}

function ehGeometria(j: Json): j is Json & GeoJSON.Geometry {
  return typeof j === 'object' && j !== null && !Array.isArray(j) && typeof j.type === 'string';
}

/** A frase da recusa do banco (o texto cru vai ao console). */
function fraseDoErro(erro: { code?: string } | null | undefined, padrao: string): string {
  if (erro?.code === '23505') return 'Este pasto já tem um polígono. Desvincule o outro antes.';
  if (erro?.code === '23514') return 'O polígono não pode ser ligado a um pasto de outra fazenda.';
  if (erro?.code === '42501') return 'Sem acesso a esta fazenda.';
  return padrao;
}

export function usePastoGeometrias() {
  const { fazendaAtual } = useFazenda();
  const [geometrias, setGeometrias] = useState<FazendaGeometria[]>([]);
  const [loading, setLoading] = useState(true);

  const fazendaId = fazendaAtual?.id === '__global__' ? undefined : fazendaAtual?.id;

  const loadGeometrias = useCallback(async () => {
    if (!fazendaId) { setGeometrias([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fazenda_geometrias')
        .select('*')
        .eq('fazenda_id', fazendaId)
        .order('nome_original');
      if (error) { toast.error('Erro ao carregar geometrias'); console.error(error); return; }
      const lidas: FazendaGeometria[] = [];
      for (const d of data ?? []) {
        if (ehGeometria(d.geojson)) lidas.push({ ...d, geojson: d.geojson });
        else console.error('fazenda_geometrias: geojson sem tipo', d.id);
      }
      setGeometrias(lidas);
    } catch (e) {
      toast.error('Erro ao carregar geometrias');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [fazendaId]);

  useEffect(() => { loadGeometrias(); }, [loadGeometrias]);

  /** Troca o mapa da fazenda inteiro (lista vazia = remove o mapa). */
  const substituirMapa = useCallback(async (poligonos: PoligonoParaGravar[], sucesso: string) => {
    if (!fazendaId) return false;
    try {
      const { error } = await supabase.rpc('fn_mapa_fazenda_substituir', {
        p_fazenda_id: fazendaId,
        p_poligonos: poligonos.map((p): Json => ({
          tipo: p.tipo,
          pasto_id: p.pasto_id,
          nome_original: p.nome_original,
          // a interface do GeoJSON não cabe no tipo Json do client; a cópia JSON é o próprio dado que vai no corpo (sem `as`).
          geojson: JSON.parse(JSON.stringify(p.geojson)),
          cor: p.cor ?? null,
        })),
      });
      if (error) { toast.error(fraseDoErro(error, 'Erro ao salvar o mapa. Nada foi alterado.')); console.error(error); return false; }
      toast.success(sucesso);
      return true;
    } catch (e) {
      toast.error('Erro ao salvar o mapa. Nada foi alterado.');
      console.error(e);
      return false;
    } finally {
      await loadGeometrias();
    }
  }, [fazendaId, loadGeometrias]);

  const salvarGeometrias = useCallback(
    (poligonos: PoligonoParaGravar[]) => substituirMapa(poligonos, `${poligonos.length} polígonos salvos`),
    [substituirMapa],
  );

  const removerGeometrias = useCallback(() => substituirMapa([], 'Mapa removido com sucesso'), [substituirMapa]);

  // --- Single geometry CRUD ---

  const atualizarGeometria = useCallback(async (
    id: string,
    updates: { nome_original?: string; pasto_id?: string | null; tipo?: TipoGeometria; cor?: string | null }
  ) => {
    const { error } = await supabase
      .from('fazenda_geometrias')
      .update(updates)
      .eq('id', id);
    if (error) { toast.error(fraseDoErro(error, 'Erro ao atualizar polígono')); console.error(error); return false; }
    await loadGeometrias();
    return true;
  }, [loadGeometrias]);

  const excluirGeometrias = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return false;
    const { error } = await supabase
      .from('fazenda_geometrias')
      .delete()
      .in('id', ids);
    if (error) { toast.error('Erro ao excluir polígonos'); console.error(error); return false; }
    toast.success(`${ids.length} polígono(s) excluído(s)`);
    await loadGeometrias();
    return true;
  }, [loadGeometrias]);

  /** Vincular = tipo 'pasto' com o pasto; desvincular = tipo 'outra' sem pasto (o banco exige os dois juntos). */
  const vincularPasto = useCallback(async (geoId: string, pastoId: string | null) => {
    return atualizarGeometria(geoId, pastoId ? { tipo: 'pasto', pasto_id: pastoId } : { tipo: 'outra', pasto_id: null });
  }, [atualizarGeometria]);

  return {
    geometrias, loading, loadGeometrias, salvarGeometrias, removerGeometrias,
    atualizarGeometria, excluirGeometrias, vincularPasto,
  };
}
