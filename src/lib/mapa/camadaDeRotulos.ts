/**
 * FECH-TOPO-02 (adendo 2, Gabriel 07/11 18:03) — a CAMADA DE RÓTULOS dos pastos no mapa, UMA só: a do Geo pastos (MAPA-02a-fix1 (2)),
 * movida VERBATIM de `MapaGestorView.tsx` para o Fechamento área (`MapaDosPastos`) usar a mesma — nome e, embaixo, a 2ª linha; no ponto
 * interno (`pontoMaisInterno`), sem sobreposição (`arrumarRotulos`), só no pasto grande o bastante (o menor fica no hover).
 * Os blocos abaixo são cópia byte a byte do Geo (o diff do trecho movido é vazio); o que é novo vem depois deles (`candidatoDoRotulo`).
 */
import L from 'leaflet';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';
import { arrumarRotulos, distanciaABorda, pontoMaisInterno, type Aneis, type Ponto } from '@/lib/mapa/rotulosDoMapa';

/* fix1 (2): o rótulo do pasto — nome 10px/600, kg/ha 9,5px (o piso da casa) mais claro; tamanho fixo em qualquer zoom */
const ROTULO_NOME_PX = 10;
const ROTULO_SUB_PX = 9.5;
const ROTULO_ALTURA_NOME = 12;
const ROTULO_ALTURA_SUB = 11;
/* o ponto interno e a largura do pasto se medem uma vez, nesta escala fixa; no zoom z vale × 2^(z − ZOOM_DE_MEDIDA) */
const ZOOM_DE_MEDIDA = 20;

interface RotuloDoPasto {
  id: string; nome: string; sub: string; ancora: L.LatLng; folga: number; largura: number; prioridade: number;
  /** Os anéis do pasto na escala de medida (para conferir se a caixa do rótulo fica dentro). */
  aneis: Aneis;
}

let reguaDoTexto: CanvasRenderingContext2D | null = null;
function larguraDoTexto(texto: string, px: number, peso: number): number {
  if (typeof document === 'undefined') return texto.length * px * 0.6;
  reguaDoTexto ??= document.createElement('canvas').getContext('2d');
  if (!reguaDoTexto) return texto.length * px * 0.6;
  reguaDoTexto.font = `${peso} ${px}px ${getComputedStyle(document.body).fontFamily}`;
  return Math.ceil(reguaDoTexto.measureText(texto).width) + 2;
}

/** Os anéis do maior polígono da geometria (Polygon ou MultiPolygon), em pixels na escala de medida. */
function aneisEmPixels(mapa: L.Map, geo: FazendaGeometria['geojson']): Aneis | null {
  const para = (anel: number[][]): Ponto[] => anel.map(([lng, lat]) => { const pt = mapa.project(L.latLng(lat, lng), ZOOM_DE_MEDIDA); return [pt.x, pt.y]; });
  const areaDe = (a: Ponto[]) => Math.abs(a.reduce((s, [x, y], i) => { const [x2, y2] = a[(i + 1) % a.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
  if (geo.type === 'Polygon') return geo.coordinates.map(para);
  if (geo.type === 'MultiPolygon') {
    let melhor: Aneis | null = null; let maior = -1;
    for (const pol of geo.coordinates) { const a = pol.map(para); const ar = a[0] ? areaDe(a[0]) : 0; if (ar > maior) { maior = ar; melhor = a; } }
    return melhor;
  }
  return null;
}
/** Põe os rótulos no zoom atual: cada pasto mostra nome + kg/ha, só o nome ou nada (fica no hover); nunca dois se sobrepõem. */
function desenharRotulos(mapa: L.Map, camada: L.LayerGroup, lista: readonly RotuloDoPasto[]) {
  camada.clearLayers();
  if (lista.length === 0) return;
  const escala = Math.pow(2, mapa.getZoom() - ZOOM_DE_MEDIDA);
  const porId = new Map(lista.map(r => [r.id, r]));
  const modos = arrumarRotulos(lista.map(r => {
    const pt = mapa.project(r.ancora, mapa.getZoom());
    return {
      id: r.id, x: pt.x, y: pt.y, folga: r.folga * escala, larguraDoPasto: r.largura * escala,
      larguraNome: larguraDoTexto(r.nome, ROTULO_NOME_PX, 600), alturaNome: ROTULO_ALTURA_NOME,
      larguraSub: larguraDoTexto(r.sub, ROTULO_SUB_PX, 400), alturaSub: ROTULO_ALTURA_SUB, prioridade: r.prioridade,
      dentro: (x: number, y: number) => distanciaABorda(x / escala, y / escala, r.aneis) >= 0,
    };
  }));
  modos.forEach((modo, id) => {
    const r = porId.get(id);
    if (!r || modo === 'oculto') return;
    const sub = modo === 'completo'
      ? `<div style="font-weight:400;font-size:${ROTULO_SUB_PX}px;line-height:${ROTULO_ALTURA_SUB}px;opacity:.88">${escaparHtml(r.sub)}</div>` : '';
    L.marker(r.ancora, {
      interactive: false,
      icon: L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div data-rotulo-pasto="${modo}" style="transform:translate(-50%,-50%);white-space:nowrap;text-align:center;color:#fff;font-size:${ROTULO_NOME_PX}px;font-weight:600;line-height:${ROTULO_ALTURA_NOME}px;text-shadow:0 1px 2px #000,0 0 2px #000">${escaparHtml(r.nome)}${sub}</div>`,
      }),
    }).addTo(camada);
  });
}

function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export { ROTULO_NOME_PX, ROTULO_SUB_PX, ROTULO_ALTURA_NOME, ROTULO_ALTURA_SUB, ZOOM_DE_MEDIDA, larguraDoTexto, aneisEmPixels, desenharRotulos, escaparHtml };
export type { RotuloDoPasto };

/** FECH-TOPO-02 — o candidato a rótulo de um polígono, pela MESMA conta que o Geo faz para os pastos (ponto interno, largura, prioridade
 *  = área); null quando a geometria não tem um anel de verdade. */
export function candidatoDoRotulo(mapa: L.Map, id: string, nome: string, sub: string, geojson: FazendaGeometria['geojson'], prioridade: number): RotuloDoPasto | null {
  const aneis = aneisEmPixels(mapa, geojson);
  if (!aneis || !(aneis[0]?.length >= 3)) return null;
  const polo = pontoMaisInterno(aneis, 2);
  const xs = aneis[0].map(pt => pt[0]);
  return { id, nome, sub, ancora: mapa.unproject(L.point(polo.x, polo.y), ZOOM_DE_MEDIDA), folga: polo.folga, largura: Math.max(...xs) - Math.min(...xs), prioridade, aneis };
}
