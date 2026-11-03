/**
 * MAPA-PREVIA-COM-MAPA-01 (Gabriel 02/11/2026) — o mini-mapa da PRÉVIA de um gesto do mapa: ANTES em cinza (só o contorno), DEPOIS em azul com os
 * metros de cada lado (a regra única de `rotulosDosLados`), os VIZINHOS que mudam junto em laranja tracejado. Passar o mouse numa linha da tabela
 * acende o polígono (`acesa`) e passar o mouse no polígono acende a linha (`aoPassar`), como o `PreviaDoMapa` da importação. Sem edição.
 * Aviso VERMELHO (sobre o mapa, sem ocupar lugar: nada se desloca) quando algum vizinho perde mais de 2% da área (`vizinhosQuePerdem`, a área da casa).
 * ⚠ O MAPA NASCE PELO `useStableLeafletMap` (como o `PreviaDoMapa`: ele espera a caixa ter tamanho). Este componente só monta com o diálogo aberto.
 * ⚠ `h-full w-full`, NUNCA `absolute inset-0` na caixa do mapa: o `index.css` força `.leaflet-container { position: relative }` (vence o `absolute`).
 * Hoje usam: Mover linha, Juntar e Desfazer piquetes. Caberia também nas prévias do Concluir piquetes (`ConcluirPiquetesDialog`) e do gesto genérico
 * da barra (`BarraDeEdicaoDoPoligono`, "Prévia — editar vértices/unir/dividir"): bastaria montar os `itens` (antes/depois por polígono).
 */
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle } from 'lucide-react';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';
import { desenharRotulosDeSegmentos } from '@/lib/mapa/rotulosDosLados';
import { segmentosSemRepetir, vizinhosQuePerdem, type ItemDaPreviaComMapa } from '@/lib/mapa/piquetesVolta';

interface Props {
  itens: readonly ItemDaPreviaComMapa[];
  acesa: string | null;
  aoPassar: (chave: string | null) => void;
}

const AZUL = '#1d4ed8';
const LARANJA = '#c2410c';
const CINZA = '#6b7280';

function estiloDoDepois(i: ItemDaPreviaComMapa, acesa: boolean): L.PathOptions {
  if (i.vizinho) return { color: LARANJA, weight: acesa ? 3 : 2, dashArray: '5 4', fillColor: LARANJA, fillOpacity: acesa ? 0.3 : 0.12 };
  return { color: AZUL, weight: acesa ? 3.2 : 2, fillColor: AZUL, fillOpacity: acesa ? 0.4 : 0.18 };
}
const estiloDoAntes = (acesa: boolean): L.PathOptions => ({ color: CINZA, weight: acesa ? 2.2 : 1.2, fill: false, opacity: acesa ? 0.95 : 0.7, interactive: false });

const pct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function PreviaComMapa({ itens, acesa, aoPassar }: Props) {
  const { mapContainerRef, mapInstanceRef, featureLayerRef, status } = useStableLeafletMap({ debugName: 'PreviaComMapa' });
  const camadas = useRef(new Map<string, { antes: L.GeoJSON | null; depois: L.GeoJSON | null }>());
  const rotulos = useRef<L.LayerGroup | null>(null);
  const aoPassarRef = useRef(aoPassar);
  aoPassarRef.current = aoPassar;
  const perdas = useMemo(() => vizinhosQuePerdem(itens), [itens]);

  // desenha (de novo) quando o mapa fica pronto ou os itens mudam
  useEffect(() => {
    const mapa = mapInstanceRef.current;
    const grupo = featureLayerRef.current;
    if (status !== 'ready' || !mapa || !grupo) return;
    grupo.clearLayers();
    camadas.current.clear();
    const limites = L.latLngBounds([]);
    for (const i of itens) {
      const par: { antes: L.GeoJSON | null; depois: L.GeoJSON | null } = { antes: null, depois: null };
      if (i.antes) { par.antes = L.geoJSON(i.antes, { style: estiloDoAntes(false), interactive: false, pmIgnore: true }).addTo(grupo); limites.extend(par.antes.getBounds()); }
      if (i.depois) {
        par.depois = L.geoJSON(i.depois, { style: estiloDoDepois(i, false), pmIgnore: true }).addTo(grupo);
        par.depois.on('mouseover', () => aoPassarRef.current(i.chave));
        par.depois.on('mouseout', () => aoPassarRef.current(null));
        const b = par.depois.getBounds();
        if (b.isValid()) limites.extend(b);
      }
      camadas.current.set(i.chave, par);
    }
    if (limites.isValid()) mapa.fitBounds(limites, { padding: [14, 14], animate: false });

    // os metros de cada lado do DEPOIS (sem repetir o lado comum), refeitos a cada zoom/movimento
    const g = rotulos.current ?? L.layerGroup().addTo(mapa);
    rotulos.current = g;
    const segs = segmentosSemRepetir(itens.filter(i => !i.vizinho && i.depois).map(i => i.depois));
    const redesenhar = () => desenharRotulosDeSegmentos(mapa, g, segs);
    redesenhar();
    mapa.on('zoomend moveend', redesenhar);
    return () => { mapa.off('zoomend moveend', redesenhar); g.clearLayers(); };
  }, [status, itens, mapInstanceRef, featureLayerRef]);

  useEffect(() => () => { rotulos.current?.remove(); rotulos.current = null; }, []);

  // acende o polígono da linha com o mouse
  useEffect(() => {
    for (const i of itens) {
      const par = camadas.current.get(i.chave);
      if (!par) continue;
      const ligada = i.chave === acesa;
      par.antes?.setStyle(estiloDoAntes(ligada));
      par.depois?.setStyle(estiloDoDepois(i, ligada));
      if (ligada) par.depois?.bringToFront();
    }
  }, [acesa, itens, status]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded bg-[#DCE3D3]" data-testid="previa-com-mapa">
      <div ref={mapContainerRef} className="h-full w-full" data-testid="previa-com-mapa-mapa" />
      {perdas.length > 0 && (
        <div className="pointer-events-none absolute left-2 right-2 top-2 z-[500] flex items-start gap-1 rounded border border-red-300 bg-red-50/95 px-1.5 py-1 text-[10px] font-medium leading-[13px] text-red-700"
          role="alert" data-testid="previa-aviso-perda">
          <AlertTriangle className="mt-px h-3 w-3 flex-none" />
          <span>
            {perdas.map(p => `${p.nome} perde ${pct(p.perdaPct)}% da área`).join(' · ')} (acima de 2%): confira antes de gravar.
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-white/90 px-1.5 py-1 text-[9.5px] leading-[13px] text-[#1d232b]">
        <div className="flex items-center gap-1"><span className="inline-block h-[9px] w-[9px] rounded-[2px]" style={{ border: `1.5px solid ${CINZA}` }} />antes</div>
        <div className="flex items-center gap-1"><span className="inline-block h-[9px] w-[9px] rounded-[2px]" style={{ background: AZUL }} />depois</div>
        <div className="flex items-center gap-1"><span className="inline-block h-[9px] w-[9px] rounded-[2px]" style={{ border: `1.5px dashed ${LARANJA}` }} />vizinho que muda</div>
      </div>
    </div>
  );
}
