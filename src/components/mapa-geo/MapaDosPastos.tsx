/**
 * MAPA-LOTES-01 (C2) — o mapa EMBUTÍVEL dos pastos da fazenda: os polígonos pintados por `corDe`, o nome e a dica de cada pasto, e o
 * clique que devolve o pasto (`onPastoClick`). Usado pelo Fechamento de pastos na vista "Mapa" (o clique abre o MESMO modal do card,
 * pelo `useModalDoPasto`). Polígono de pasto fora da lista (fora do mês) fica cinza e sem clique.
 * ⚠ O MAPA NASCE PELO `useStableLeafletMap` (o dos mapas da casa), como a `PreviaDoMapa`; a caixa tem altura própria (quem monta dá).
 * ⚠ Não é o `MapaGestorView`: aquele é a TELA do Geo pastos (importar, infraestrutura, piquetes); este só mostra e devolve o clique.
 * FECH-TOPO-02 (adendo 2, Gabriel 07/11 18:03) — o que é do Geo, IGUAL ao Geo:
 *   · o foco sem o retângulo azul do navegador no polígono clicado (o MESMO conserto do MAPA-02a-fix1: a classe no container);
 *   · o pasto selecionado (o último clicado) e o do hover = só o contorno branco grosso (peso 3, como o selecionado do Geo);
 *   · os RÓTULOS pela MESMA camada do Geo (`camadaDeRotulos`: nome e, embaixo, a 2ª linha; ponto interno, sem sobreposição, só no pasto
 *     grande o bastante — o menor fica no hover), refeitos a cada zoom.
 *   · a camada de rótulos em TODO zoom (`labelZoomThreshold: 0`, como o Geo): com o padrão do hook ela some abaixo do zoom 14 — a 3M
 *     inteira no quadro fica em 13,5 e saía sem nenhum rótulo (achado no print do caso real, 07/11 22:20).
 */
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';
import { candidatoDoRotulo, desenharRotulos, type RotuloDoPasto } from '@/lib/mapa/camadaDeRotulos';
import { ladoDaDica } from '@/lib/mapa/ladoDaDica';

export interface PoligonoDoMapa { pasto_id: string | null; tipo: string; geojson: GeoJSON.Geometry }

interface Props {
  geometrias: readonly PoligonoDoMapa[];
  /** os pastos que respondem ao clique (os do mês) */
  pastoIds: ReadonlySet<string>;
  corDe: (pastoId: string) => string;
  /** a dica do polígono (texto ou HTML; FECH-TOPO-02: o Fechamento passa o PopupDoPasto pronto) */
  dicaDe: (pastoId: string) => string;
  /** a classe da caixa da dica (o Fechamento tira o fundo do Leaflet: quem desenha é o popup) */
  classeDaDica?: string;
  onPastoClick: (pastoId: string) => void;
  /** o rótulo no pasto: o nome e, pequeno embaixo, a 2ª linha ("55 cab"); sem a prop, sem rótulo */
  rotuloDe?: (pastoId: string) => { nome: string; sub: string } | null;
  legenda?: readonly { cor: string; texto: string }[];
}

const COR_FORA = '#C9CED6';
/* o contorno do selecionado/hover, o do Geo (MapaGestorView: `weight: sel ? 3 : 1`) */
const PESO_SELECIONADO = 3;
/* o tamanho da dica antes da 1ª abertura (o popup do pasto: 220px; alto o bastante para não sair na 1ª vez) */
const DICA_MAXIMA = { w: 224, h: 200 };

export function MapaDosPastos({ geometrias, pastoIds, corDe, dicaDe, classeDaDica, onPastoClick, rotuloDe, legenda }: Props) {
  const { mapContainerRef, mapInstanceRef, featureLayerRef, labelLayerRef, status } = useStableLeafletMap({ debugName: 'MapaDosPastos', labelZoomThreshold: 0 });
  const enquadrado = useRef(false);
  const aoClicar = useRef(onPastoClick);
  aoClicar.current = onPastoClick;
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const rotulosRef = useRef<RotuloDoPasto[]>([]);

  useEffect(() => {
    const mapa = mapInstanceRef.current;
    const grupo = featureLayerRef.current;
    if (status !== 'ready' || !mapa || !grupo) return;
    grupo.clearLayers();
    const limites = L.latLngBounds([]);
    const candidatos: RotuloDoPasto[] = [];
    /* a área total por baixo de tudo */
    const ordem = [...geometrias].sort((a, b) => Number(b.tipo === 'area_total') - Number(a.tipo === 'area_total'));
    for (const g of ordem) {
      const doMes = g.tipo === 'pasto' && g.pasto_id != null && pastoIds.has(g.pasto_id);
      const estilo: L.PathOptions = g.tipo === 'area_total'
        ? { color: '#9AA3AE', weight: 1.5, dashArray: '5 4', fill: false }
        : { color: '#ffffff', weight: doMes && g.pasto_id === selecionadoId ? PESO_SELECIONADO : 1,
            fillColor: doMes && g.pasto_id ? corDe(g.pasto_id) : COR_FORA, fillOpacity: doMes ? 0.8 : 0.45 };
      const camada = L.geoJSON(g.geojson, { style: estilo });
      if (doMes && g.pasto_id) {
        const id = g.pasto_id;
        /* FECH-TOPO-02 acerto 2: a dica sempre DENTRO do quadro do mapa (o lado que couber). Registrado ANTES do bindTooltip: o Leaflet
           abre e move a dica no mesmo evento e lê a direção/deslocamento na hora; o tamanho é o da dica já aberta (a 1ª vez, o máximo) */
        const ajustarDica = (e: L.LeafletMouseEvent) => {
          const dica = camada.getTooltip();
          if (!dica) return;
          const caixa = dica.getElement();
          const tamanho = mapa.getSize();
          const lado = ladoDaDica(mapa.latLngToContainerPoint(e.latlng), { w: tamanho.x, h: tamanho.y },
            { w: caixa?.offsetWidth || DICA_MAXIMA.w, h: caixa?.offsetHeight || DICA_MAXIMA.h });
          dica.options.direction = lado.direcao;
          dica.options.offset = lado.deslocamento;
        };
        camada.on('mouseover', ajustarDica);
        camada.on('mousemove', ajustarDica);
        camada.bindTooltip(dicaDe(id), { sticky: true, className: classeDaDica, opacity: 1 });
        camada.on('click', () => { setSelecionadoId(id); aoClicar.current(id); });
        camada.on('mouseover', () => camada.setStyle({ weight: PESO_SELECIONADO }));
        camada.on('mouseout', () => camada.setStyle({ weight: id === selecionadoId ? PESO_SELECIONADO : 1 }));
        const r = rotuloDe?.(id);
        const c = r ? candidatoDoRotulo(mapa, g.pasto_id, r.nome, r.sub, g.geojson, areaEmHectares(g.geojson)) : null;
        if (c) candidatos.push(c);
      }
      camada.addTo(grupo);
      const b = camada.getBounds();
      if (b.isValid()) limites.extend(b);
    }
    if (!enquadrado.current && limites.isValid()) {
      mapa.fitBounds(limites, { padding: [12, 12] });
      enquadrado.current = true;
    }
    rotulosRef.current = candidatos;
    const rotulos = labelLayerRef.current;
    if (rotulos) desenharRotulos(mapa, rotulos, candidatos);
  }, [status, geometrias, pastoIds, corDe, dicaDe, classeDaDica, rotuloDe, selecionadoId, mapInstanceRef, featureLayerRef, labelLayerRef]);

  /* o rótulo tem tamanho fixo na tela: a colisão se refaz a cada zoom (como no Geo) */
  useEffect(() => {
    if (status !== 'ready') return;
    const mapa = mapInstanceRef.current;
    const rotulos = labelLayerRef.current;
    if (!mapa || !rotulos) return;
    const refazer = () => desenharRotulos(mapa, rotulos, rotulosRef.current);
    mapa.on('zoomend', refazer);
    return () => { mapa.off('zoomend', refazer); };
  }, [status, mapInstanceRef, labelLayerRef]);

  return (
    /* ⚠ `isolate`: as camadas do Leaflet (400+) e a legenda (500) ficam DENTRO do mapa; sem ele a legenda passava por cima do escurecido
       do modal do pasto (z-50), aberto pelo clique — visto na foto da bancada */
    <div className="relative isolate h-full w-full overflow-hidden rounded bg-[#DCE3D3]" data-testid="quadro-do-mapa">
      {/* ⚠ h-full w-full, NUNCA `absolute inset-0` (o `.leaflet-container` é forçado a relative no index.css: ver a PreviaDoMapa) */}
      {/* o foco sem o retângulo azul no polígono clicado: o MESMO conserto do Geo (MAPA-02a-fix1) */}
      <div ref={mapContainerRef} className="h-full w-full [&_path.leaflet-interactive:focus]:outline-none" data-testid="mapa-dos-pastos" />
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
