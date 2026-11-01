/**
 * MAPA-EDITAR-POLIGONO-09 (Gabriel 01/11 16:45, Sta. Tereza › Modulo 02 em Vértices: "umas medições aparecem os metros, outras não") —
 * UM componente para os metros de cada lado, em TODOS os modos (desenhar, rascunho, Vértices, Dividir, Redesenhar, Unir e o polígono
 * selecionado). Antes, os rótulos só eram desenhados com até 40 lados (o Modulo 02 tem mais) e nunca no polígono selecionado.
 * Regra de tela, refeita a cada zoom: o rótulo vai no meio do lado; lado curto demais para o rótulo, ou rótulo que encavalaria noutro, NÃO
 * desenha — o lado ganha uma faixa invisível que mostra os metros ao passar o mouse. O mesmo estilo de etiqueta em todo modo.
 */
import L from 'leaflet';
import { distanciaM } from '@/lib/mapa/edicaoDoPoligono';

export interface LadoNaTela { a: { x: number; y: number }; b: { x: number; y: number }; texto: string }

/** Largura aproximada da etiqueta (9,5 px, algarismos tabulares) em px. */
export const larguraDoRotulo = (texto: string) => Math.ceil(texto.length * 5.7 + 6);
const ALTURA_DO_ROTULO = 13;

/** Quais rótulos aparecem: o lado precisa ter na tela o comprimento do rótulo + folga, e a caixa não pode encostar numa já posta
 *  (os lados mais longos têm preferência). Pura: decide só com os pontos em px. */
export function rotulosVisiveis(lados: readonly LadoNaTela[]): boolean[] {
  const ordem = lados.map((l, i) => ({ i, len: Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) })).sort((x, y) => y.len - x.len);
  const postos: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const visivel = lados.map(() => false);
  for (const { i, len } of ordem) {
    const l = lados[i];
    const w = larguraDoRotulo(l.texto);
    if (len < w + 8) continue;
    const cx = (l.a.x + l.b.x) / 2, cy = (l.a.y + l.b.y) / 2;
    const caixa = { x0: cx - w / 2 - 2, y0: cy - ALTURA_DO_ROTULO / 2 - 1, x1: cx + w / 2 + 2, y1: cy + ALTURA_DO_ROTULO / 2 + 1 };
    if (postos.some(p => caixa.x0 < p.x1 && caixa.x1 > p.x0 && caixa.y0 < p.y1 && caixa.y1 > p.y0)) continue;
    postos.push(caixa);
    visivel[i] = true;
  }
  return visivel;
}

export const textoDoLado = (metros: number) => `${Math.round(metros).toLocaleString('pt-BR')} m`;

const ESTILO = 'position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-size:9.5px;font-weight:600;color:#1e3a8a;'
  + 'background:rgba(255,255,255,.88);padding:0 2px;border-radius:2px;font-variant-numeric:tabular-nums';

/** Desenha os metros dos lados de `pontos` (fechado ou não) no `grupo`, com a regra acima. Os lados sem rótulo ganham o tooltip. */
export function desenharRotulosDosLados(mapa: L.Map, grupo: L.LayerGroup, pontos: readonly (readonly number[])[], fechar: boolean) {
  grupo.clearLayers();
  if (pontos.length < 2) return;
  const total = fechar ? pontos.length : pontos.length - 1;
  const lados = Array.from({ length: total }, (_x, i) => {
    const p = pontos[i], q = pontos[(i + 1) % pontos.length];
    return { p, q, texto: textoDoLado(distanciaM(p, q)) };
  });
  const naTela: LadoNaTela[] = lados.map(l => ({
    a: mapa.latLngToContainerPoint([l.p[1], l.p[0]]), b: mapa.latLngToContainerPoint([l.q[1], l.q[0]]), texto: l.texto,
  }));
  const visivel = rotulosVisiveis(naTela);
  lados.forEach((l, i) => {
    if (visivel[i]) {
      const icone = L.divIcon({ className: 'lado-do-poligono', iconSize: [0, 0], html: `<span style="${ESTILO}">${l.texto}</span>` });
      L.marker([(l.p[1] + l.q[1]) / 2, (l.p[0] + l.q[0]) / 2], { icon: icone, interactive: false, pmIgnore: true }).addTo(grupo);
    } else {
      // lado curto (ou rótulo que encavalaria): os metros aparecem ao passar o mouse no lado
      L.polyline([[l.p[1], l.p[0]], [l.q[1], l.q[0]]], { weight: 12, opacity: 0, interactive: true, pmIgnore: true, className: 'lado-do-poligono-curto' })
        .bindTooltip(l.texto, { sticky: true, direction: 'top', className: 'lado-do-poligono-dica' })
        .addTo(grupo);
    }
  });
}
