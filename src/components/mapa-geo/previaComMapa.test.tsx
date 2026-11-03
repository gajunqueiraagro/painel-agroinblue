/* MAPA-PREVIA-COM-MAPA-01 — o aviso VERMELHO do mini-mapa: algum vizinho perde mais de 2% da área (a conta da casa). 1,9% não avisa. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));

import { PreviaComMapa } from './PreviaComMapa';
import type { ItemDaPreviaComMapa } from '@/lib/mapa/piquetesVolta';

const quad = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const itens = (fator: number): ItemDaPreviaComMapa[] => [
  { chave: 'a', nome: '6A', antes: quad(-54.03, -19.64, -54.02, -19.63), depois: quad(-54.03, -19.64, -54.02, -19.63) },
  { chave: 'b', nome: '6B', vizinho: true, antes: quad(-54.02, -19.64, -54.01, -19.63), depois: quad(-54.02, -19.64, -54.02 + 0.01 * fator, -19.63) },
];

describe('PreviaComMapa — o aviso de perda', () => {
  it('o vizinho perde 2,1%: aviso vermelho com o nome e o percentual', () => {
    render(<PreviaComMapa itens={itens(0.979)} acesa={null} aoPassar={() => {}} />);
    const aviso = screen.getByTestId('previa-aviso-perda');
    expect(aviso.textContent).toContain('6B perde 2,1% da área');
    expect(aviso.className).toContain('text-red-700');
    expect(aviso.getAttribute('role')).toBe('alert');
  });
  it('o vizinho perde 1,9%: nenhum aviso', () => {
    render(<PreviaComMapa itens={itens(0.981)} acesa={null} aoPassar={() => {}} />);
    expect(screen.queryByTestId('previa-aviso-perda')).toBeNull();
    expect(screen.getByTestId('previa-com-mapa')).toBeTruthy();   // o auto-teste: o componente montou, só o aviso não
  });
});
