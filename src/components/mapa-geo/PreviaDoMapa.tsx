/**
 * MAPA-IMPORT-01b — a prévia do mapa no "Importar mapa da fazenda": os polígonos do arquivo coloridos pelo destino escolhido.
 * Passar o mouse num polígono avisa a tabela (`aoPassar`); a linha com o mouse acende o polígono (`acesa`).
 * ⚠ O MAPA NASCE PELO `useStableLeafletMap` (o dos mapas da casa): ele espera a caixa ter tamanho e acompanha o tamanho dela. A prévia
 *   antiga criava o mapa num `setTimeout` de 150 ms ao abrir, dentro do modal ainda animando e numa coluna sem altura própria — ver o
 *   relatório MAPA-IMPORT-01b.
 * ⚠ Este componente só monta com o modal aberto e com arquivo lido: o hook cria o mapa uma vez por montagem.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';
import { COR_DO_DESTINO, corDoDestino, type LinhaDoMapa } from '@/lib/mapa/destinoDoPoligono';

interface Props {
  linhas: readonly LinhaDoMapa[];
  acesa: number | null;
  aoPassar: (i: number | null) => void;
}

const LEGENDA: { cor: string; texto: string; contorno?: boolean }[] = [
  { cor: COR_DO_DESTINO.pasto, texto: 'Pasto ligado' },
  { cor: COR_DO_DESTINO.escolher, texto: 'A escolher' },
  { cor: COR_DO_DESTINO.novo, texto: 'Pasto novo' },
  { cor: COR_DO_DESTINO.ambiental, texto: 'Reserva / APP' },
  { cor: COR_DO_DESTINO.estrutura, texto: 'Benfeitoria / estrada' },
  { cor: COR_DO_DESTINO.areaTotal, texto: 'Área total', contorno: true },
];

function estiloDa(l: LinhaDoMapa, acesa: boolean): L.PathOptions {
  const areaTotal = l.destino.tipo === 'area' && l.destino.area === 'area_total';
  const cor = corDoDestino(l.destino);
  if (areaTotal) return { color: cor, weight: acesa ? 3 : 1.5, dashArray: '5 4', fill: false };
  return { color: acesa ? '#1B2A44' : '#ffffff', weight: acesa ? 2.2 : 0.8, fillColor: cor, fillOpacity: acesa ? 0.85 : 0.6 };
}

export function PreviaDoMapa({ linhas, acesa, aoPassar }: Props) {
  const { mapContainerRef, mapInstanceRef, featureLayerRef, status } = useStableLeafletMap({ debugName: 'PreviaDoMapa' });
  const camadas = useRef(new Map<number, L.GeoJSON>());
  const enquadrado = useRef(false);
  const aoPassarRef = useRef(aoPassar);
  aoPassarRef.current = aoPassar;

  // Desenha (de novo) quando o mapa fica pronto ou os destinos mudam.
  useEffect(() => {
    const mapa = mapInstanceRef.current;
    const grupo = featureLayerRef.current;
    if (status !== 'ready' || !mapa || !grupo) return;
    grupo.clearLayers();
    camadas.current.clear();
    const limites = L.latLngBounds([]);
    // a área total por baixo de tudo: desenhada primeiro
    const ordem = [...linhas].sort((a, b) => Number(b.destino.tipo === 'area' && b.destino.area === 'area_total')
      - Number(a.destino.tipo === 'area' && a.destino.area === 'area_total'));
    for (const l of ordem) {
      const camada = L.geoJSON(l.geojson, { style: estiloDa(l, false) });
      camada.on('mouseover', () => aoPassarRef.current(l.i));
      camada.on('mouseout', () => aoPassarRef.current(null));
      camada.addTo(grupo);
      camadas.current.set(l.i, camada);
      const b = camada.getBounds();
      if (b.isValid()) limites.extend(b);
    }
    if (!enquadrado.current && limites.isValid()) {
      mapa.fitBounds(limites, { padding: [12, 12] });
      enquadrado.current = true;
    }
  }, [status, linhas, mapInstanceRef, featureLayerRef]);

  // Acende o polígono da linha com o mouse.
  useEffect(() => {
    for (const l of linhas) {
      const camada = camadas.current.get(l.i);
      if (!camada) continue;
      camada.setStyle(estiloDa(l, l.i === acesa));
      if (l.i === acesa && !(l.destino.tipo === 'area' && l.destino.area === 'area_total')) camada.bringToFront();
    }
  }, [acesa, linhas, status]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded bg-[#DCE3D3]">
      {/* ⚠ h-full w-full, NUNCA `absolute inset-0`: o `index.css` força `.leaflet-container { position: relative }` (fora das camadas do
          Tailwind, vence o `absolute`) e a caixa ficava relativa SEM altura — 0px, o mapa em branco (MAPA-IMPORT-01b-fix1, medido no navegador). */}
      <div ref={mapContainerRef} className="h-full w-full" data-testid="previa-do-mapa" />
      <div className="absolute left-2 bottom-2 z-[500] rounded bg-white/90 px-1.5 py-1 text-[9px] leading-[13px] text-[#1d232b] pointer-events-none">
        {LEGENDA.map(item => (
          <div key={item.texto} className="flex items-center gap-1">
            <span
              className="inline-block h-[9px] w-[9px] rounded-[2px]"
              style={item.contorno ? { border: `1.5px dashed ${item.cor}` } : { background: item.cor }}
            />
            {item.texto}
          </div>
        ))}
      </div>
    </div>
  );
}
