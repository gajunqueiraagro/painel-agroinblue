/**
 * MAPA-GLOBAL-01 — os polígonos de VÁRIAS fazendas de uma vez, só leitura (as miniaturas do Global e o "tem polígono?" de cada pasto).
 * Uma ida paginada (`.in('fazenda_id', …)`), nunca uma por fazenda. A escrita do mapa continua só no `usePastoGeometrias`.
 * ⚠ Leitura que termina depois de a lista mudar não escreve (OC-ABRIR-LENTO-01). Erro não vai a toast: fica em `erro`.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated, MAX_ROWS } from '@/lib/supabase/fetchAllPaginated';
export interface GeometriaDoGlobal { id: string; fazenda_id: string; pasto_id: string | null; tipo: string; geojson: GeoJSON.Geometry }

/* a mesma conferência do `usePastoGeometrias` (que não a exporta; o arquivo é do Code 4, piquetes) */
function ehGeometria(j: unknown): j is GeoJSON.Geometry {
  return typeof j === 'object' && j !== null && !Array.isArray(j) && 'type' in j && typeof j.type === 'string';
}

export function useGeometriasDasFazendas(fazendaIds: readonly string[]): { geometrias: GeometriaDoGlobal[]; carregando: boolean; erro: string | null } {
  const chave = [...fazendaIds].sort().join(',');
  const ids = useMemo(() => (chave ? chave.split(',') : []), [chave]);
  const [lidas, setLidas] = useState<{ chave: string; geometrias: GeometriaDoGlobal[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) { setLidas({ chave, geometrias: [] }); return; }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    (async () => {
      try {
        const { data } = await fetchAllPaginated<{ id: string; fazenda_id: string; pasto_id: string | null; tipo: string; geojson: unknown }>({
          query: () => supabase
            .from('fazenda_geometrias')
            .select('id, fazenda_id, pasto_id, tipo, geojson')
            .in('fazenda_id', ids)
            .order('id', { ascending: true }),
          getKey: r => r.id,
          maxRows: MAX_ROWS,
          context: 'useGeometriasDasFazendas',
          shouldAbort: () => cancelado,
        });
        if (cancelado) return;
        const geometrias: GeometriaDoGlobal[] = [];
        for (const d of data) {
          if (ehGeometria(d.geojson)) geometrias.push({ id: d.id, fazenda_id: d.fazenda_id, pasto_id: d.pasto_id, tipo: d.tipo, geojson: d.geojson });
        }
        setLidas({ chave, geometrias });
      } catch (e) {
        if (cancelado) return;
        console.error('[useGeometriasDasFazendas]', e);
        setErro('Não foi possível ler os mapas das fazendas.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [ids, chave]);

  return { geometrias: lidas && lidas.chave === chave ? lidas.geometrias : [], carregando, erro };
}
