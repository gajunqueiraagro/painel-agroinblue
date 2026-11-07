/**
 * MAPA-LOTES-01 (C2) — o mapa EMBUTÍVEL dos pastos da fazenda: os polígonos pintados por `corDe`, o nome e a dica de cada pasto, e o
 * clique que devolve o pasto (`onPastoClick`). Usado pelo Fechamento de pastos na vista "Mapa" (o clique abre o MESMO modal do card,
 * pelo `useModalDoPasto`). Polígono de pasto fora da lista (fora do mês) fica cinza e sem clique.
 * ⚠ O MAPA NASCE PELO `useStableLeafletMap` (o dos mapas da casa), como a `PreviaDoMapa`; a caixa tem altura própria (quem monta dá).
 * ⚠ Não é o `MapaGestorView`: aquele é a TELA do Geo pastos (importar, infraestrutura, piquetes); este só mostra e devolve o clique.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';

export interface PoligonoDoMapa { pasto_id: string | null; tipo: string; geojson: GeoJSON.Geometry }

interface Props {
  geometrias: readonly PoligonoDoMapa[];
  /** os pastos que respondem ao clique (os do mês) */
  pastoIds: ReadonlySet<string>;
  corDe: (pastoId: string) => string;
  /** a dica do polígono: nome · cab. · situação */
  dicaDe: (pastoId: string) => string;
  onPastoClick: (pastoId: string) => void;
  legenda?: readonly { cor: string; texto: string }[];
}

const COR_FORA = '#C9CED6';

export function MapaDosPastos({ geometrias, pastoIds, corDe, dicaDe, onPastoClick, legenda }: Props) {
  const { mapContainerRef, mapInstanceRef, featureLayerRef, status } = useStableLeafletMap({ debugName: 'MapaDosPastos' });
  const enquadrado = useRef(false);
  const aoClicar = useRef(onPastoClick);
  aoClicar.current = onPastoClick;

  useEffect(() => {
    const mapa = mapInstanceRef.current;
    const grupo = featureLayerRef.current;
    if (status !== 'ready' || !mapa || !grupo) return;
    grupo.clearLayers();
    const limites = L.latLngBounds([]);
    /* a área total por baixo de tudo */
    const ordem = [...geometrias].sort((a, b) => Number(b.tipo === 'area_total') - Number(a.tipo === 'area_total'));
    for (const g of ordem) {
      const doMes = g.tipo === 'pasto' && g.pasto_id != null && pastoIds.has(g.pasto_id);
      const estilo: L.PathOptions = g.tipo === 'area_total'
        ? { color: '#9AA3AE', weight: 1.5, dashArray: '5 4', fill: false }
        : { color: '#ffffff', weight: 1, fillColor: doMes && g.pasto_id ? corDe(g.pasto_id) : COR_FORA, fillOpacity: doMes ? 0.8 : 0.45 };
      const camada = L.geoJSON(g.geojson, { style: estilo });
      if (doMes && g.pasto_id) {
        const id = g.pasto_id;
        camada.bindTooltip(dicaDe(id), { sticky: true });
        camada.on('click', () => aoClicar.current(id));
      }
      camada.addTo(grupo);
      const b = camada.getBounds();
      if (b.isValid()) limites.extend(b);
    }
    if (!enquadrado.current && limites.isValid()) {
      mapa.fitBounds(limites, { padding: [12, 12] });
      enquadrado.current = true;
    }
  }, [status, geometrias, pastoIds, corDe, dicaDe, mapInstanceRef, featureLayerRef]);

  return (
    /* ⚠ `isolate`: as camadas do Leaflet (400+) e a legenda (500) ficam DENTRO do mapa; sem ele a legenda passava por cima do escurecido
       do modal do pasto (z-50), aberto pelo clique — visto na foto da bancada */
    <div className="relative isolate h-full w-full overflow-hidden rounded bg-[#DCE3D3]" data-testid="quadro-do-mapa">
      {/* ⚠ h-full w-full, NUNCA `absolute inset-0` (o `.leaflet-container` é forçado a relative no index.css: ver a PreviaDoMapa) */}
      <div ref={mapContainerRef} className="h-full w-full" data-testid="mapa-dos-pastos" />
      {legenda && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-white/90 px-1.5 py-1 text-[9.5px] leading-[13px] text-[#1d232b]">
          {legenda.map(item => (
            <div key={item.texto} className="flex items-center gap-1">
              <span className="inline-block h-[9px] w-[9px] rounded-[2px]" style={{ background: item.cor }} />
              {item.texto}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
