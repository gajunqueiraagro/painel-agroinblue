/**
 * MEDIR-NO-MAPA-01 (Gabriel 03/11 20:54) — a ferramenta de CLICAR PONTO A PONTO no mapa, uma só: a do "+ Adicionar piquete" (MAPA-DIVIDIR-02)
 * e a do "Medir no mapa" / "Régua" da ficha da infraestrutura.
 * - 'linha': cada clique é um ponto; o duplo clique (ou Enter) termina; ao vivo, o comprimento até o cursor ("631 m").
 * - 'poligono': cada clique é um ponto; o clique em cima do 1º ponto (10 px), o duplo clique ou o Enter fecham; ao vivo, a área ("1.234 m²").
 * - Backspace tira o último ponto; Esc cancela (o chamador decide o que isso desfaz: na ficha, nada muda no campo).
 * - Nada se grava aqui: `aoTerminar` recebe os pontos, e quem chamou faz a conta e preenche.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Ponto } from '@/lib/mapa/edicaoDoPoligono';
import { reguaLivre } from '@/lib/mapa/linhasDosPiquetes';
import { areaDoBancoHa } from '@/lib/mapa/criarPiquetes';
import { htmlDaMedida, textoDoLado } from '@/lib/mapa/rotulosDosLados';

export type FormaDoPontoAPonto = 'linha' | 'poligono';
export const FECHA_NO_PRIMEIRO_PX = 10;

/** A área em m² do anel clicado (a fórmula do banco), 0 com menos de 3 pontos. */
export function areaDoAnelM2(pontos: readonly Ponto[]): number {
  if (pontos.length < 3) return 0;
  const anel = [...pontos, pontos[0]].map(p => [p[0], p[1]]);
  return areaDoBancoHa({ type: 'Polygon', coordinates: [anel] }) * 10000;
}
export const comprimentoM = (pontos: readonly Ponto[]) => reguaLivre(pontos).totalM;
export const textoDaArea = (m2: number) => `${Math.round(m2).toLocaleString('pt-BR')} m²`;
/** O texto da medida ao vivo: o comprimento (linha) ou a área (polígono). */
export const textoDaMedida = (forma: FormaDoPontoAPonto, pontos: readonly Ponto[]) =>
  (forma === 'linha' ? textoDoLado(comprimentoM(pontos)) : textoDaArea(areaDoAnelM2(pontos)));

interface Opcoes {
  mapa: L.Map | null;
  /** null = desligada */
  forma: FormaDoPontoAPonto | null;
  aoTerminar: (pontos: Ponto[]) => void;
  aoCancelar: () => void;
}

export function usePontoAPonto({ mapa, forma, aoTerminar, aoCancelar }: Opcoes) {
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const pontosRef = useRef<Ponto[]>([]);
  const trocar = useCallback((p: Ponto[]) => { pontosRef.current = p; setPontos(p); }, []);
  const terminarRef = useRef(aoTerminar); terminarRef.current = aoTerminar;
  const cancelarRef = useRef(aoCancelar); cancelarRef.current = aoCancelar;

  /* trocar de forma (ou desligar) começa do zero */
  useEffect(() => { trocar([]); }, [forma, trocar]);

  const terminar = useCallback(() => {
    const pts = pontosRef.current;
    if (!forma || pts.length < (forma === 'linha' ? 2 : 3)) return false;
    trocar([]);
    terminarRef.current(pts);
    return true;
  }, [forma, trocar]);

  /* os cliques, o duplo clique e o cursor */
  useEffect(() => {
    if (!mapa || !forma) return undefined;
    const contentor = mapa.getContainer();
    const cursor = contentor.style.cursor;
    const dava = mapa.doubleClickZoom.enabled();
    const aoClicar = (ev: L.LeafletMouseEvent) => {
      const pts = pontosRef.current;
      const p: Ponto = [ev.latlng.lng, ev.latlng.lat];
      if (forma === 'poligono' && pts.length >= 3
        && mapa.latLngToContainerPoint(L.latLng(pts[0][1], pts[0][0])).distanceTo(mapa.latLngToContainerPoint(ev.latlng)) <= FECHA_NO_PRIMEIRO_PX) { terminar(); return; }
      const u = pts[pts.length - 1];
      if (u && u[0] === p[0] && u[1] === p[1]) return; // o 2º clique do duplo clique
      trocar([...pts, p]);
    };
    const aoDuplo = () => { terminar(); };
    mapa.on('click', aoClicar); mapa.on('dblclick', aoDuplo);
    mapa.doubleClickZoom.disable();
    contentor.style.cursor = 'crosshair';
    return () => {
      mapa.off('click', aoClicar); mapa.off('dblclick', aoDuplo);
      if (dava) mapa.doubleClickZoom.enable();
      contentor.style.cursor = cursor;
    };
  }, [mapa, forma, terminar, trocar]);

  /* o teclado: Enter termina, Backspace tira o último ponto, Esc cancela (antes de qualquer outro dono do Esc) */
  useEffect(() => {
    if (!forma) return undefined;
    const aoTeclar = (ev: KeyboardEvent) => {
      const alvo = ev.target;
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) return;
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); trocar([]); cancelarRef.current(); return; }
      if (ev.key === 'Enter') { if (terminar()) ev.preventDefault(); return; }
      if (ev.key === 'Backspace' && pontosRef.current.length) { ev.preventDefault(); trocar(pontosRef.current.slice(0, -1)); }
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [forma, terminar, trocar]);

  /* o desenho: o que já foi clicado (tracejado) e a medida ao vivo ao lado do cursor */
  useEffect(() => {
    if (!mapa || !forma) return undefined;
    const g = L.layerGroup().addTo(mapa);
    const ll = (p: Ponto) => L.latLng(p[1], p[0]);
    const linha = L.polyline([], { color: '#7c3aed', weight: 2, dashArray: '6 4', interactive: false }).addTo(g);
    const vivo = L.marker([0, 0], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'ponto-a-ponto-medida', iconSize: [0, 0], html: '' }) });
    const desenhar = (cursor: Ponto | null) => {
      const pts = pontosRef.current;
      const com = cursor ? [...pts, cursor] : pts;
      linha.setLatLngs((forma === 'poligono' && com.length > 2 ? [...com, com[0]] : com).map(ll));
      if (cursor && pts.length) {
        vivo.setLatLng(ll(cursor));
        vivo.setIcon(L.divIcon({ className: 'ponto-a-ponto-medida', iconSize: [0, 0],
          html: `<span data-testid="ponto-a-ponto-medida" style="position:absolute;left:14px;top:-18px">${htmlDaMedida(textoDaMedida(forma, com))}</span>` }));
        if (!g.hasLayer(vivo)) vivo.addTo(g);
      } else vivo.remove();
    };
    pontosRef.current.forEach((p, i) => L.circleMarker(ll(p), { radius: i === 0 && forma === 'poligono' ? 5 : 3, color: '#7c3aed', weight: 2, fillColor: '#fff',
      fillOpacity: 1, interactive: false }).addTo(g));
    desenhar(null);
    const aoMover = (ev: L.LeafletMouseEvent) => desenhar([ev.latlng.lng, ev.latlng.lat]);
    const aoSair = () => desenhar(null);
    mapa.on('mousemove', aoMover); mapa.on('mouseout', aoSair);
    return () => { mapa.off('mousemove', aoMover); mapa.off('mouseout', aoSair); g.remove(); };
  }, [mapa, forma, pontos]);

  return { pontos, terminar };
}
