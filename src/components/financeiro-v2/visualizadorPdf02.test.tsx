/**
 * VISUALIZADOR-PDF-02 (Gabriel 23/11 13:17) — com um PDF que ABRE (o do VISUALIZADOR-PDF-01 falhava de propósito e por isso escondia o
 * defeito): (1) abre em "Página inteira" (a folha toda no quadro), com "Ajustar à largura" de opção; (2) Ctrl/⌘ + roda e a pinça do Chrome
 * no Mac (roda com ctrlKey e deltaY pequeno) ampliam o documento e cancelam o zoom do navegador — também quando o visualizador nasce fechado
 * e abre depois. PDF SINTÉTICO (página A4 595×842 pt, nenhum dado de cliente).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));
vi.mock('pdfjs-dist', () => {
  const pagina = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
    streamTextContent: () => null,
  };
  class TextLayer { render() { return Promise.resolve(); } cancel() {} }
  return { GlobalWorkerOptions: {}, TextLayer, getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: async () => pagina }) }) };
});

import { VisualizadorDeDocumento } from './VisualizadorDeDocumento';

beforeAll(() => {
  /* o quadro de 1000×900 (jsdom não mede): Página inteira = min(968/595, 868/842) = 103%; Ajustar à largura = 968/595 = 163% */
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.getAttribute('data-testid') === 'visualizador-quadro' ? 1000 : 0; } });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return this.getAttribute('data-testid') === 'visualizador-quadro' ? 900 : 0; } });
  HTMLCanvasElement.prototype.getContext = (() => ({})) as unknown as HTMLCanvasElement['getContext'];
});

const props = { bytes: new ArrayBuffer(4), nome: 'nota.pdf', onFechar: () => {}, onNovaAba: () => {} };
const zoom = () => screen.getByTestId('visualizador-zoom').textContent;
const roda = (alvo: Element, init: WheelEventInit) => {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  alvo.dispatchEvent(e);
  return e;
};

describe('VISUALIZADOR-PDF-02 — com um PDF que abre', () => {
  it('VISUALIZADOR-PDF-02b: abre em 100% (sem leitor do navegador); "Página inteira" e "Ajustar à largura" são opções', async () => {
    render(<VisualizadorDeDocumento open {...props} />);
    const quadro = await screen.findByTestId('visualizador-quadro');
    expect(quadro.getAttribute('data-modo')).toBe('livre');
    await waitFor(() => expect(zoom()).toBe('100%'));
    expect(screen.getByTestId('visualizador-pagina-n').textContent).toBe('1/3');
    fireEvent.click(screen.getByTestId('visualizador-pagina'));
    await waitFor(() => expect(zoom()).toBe('103%'));
    fireEvent.click(screen.getByTestId('visualizador-largura'));
    await waitFor(() => expect(zoom()).toBe('163%'));
  });

  it('Ctrl + roda amplia e cancela o zoom do navegador (o PDF abriu: nada de "falhou" para rodar o efeito de novo)', async () => {
    render(<VisualizadorDeDocumento open {...props} />);
    const quadro = await screen.findByTestId('visualizador-quadro');
    await waitFor(() => expect(zoom()).toBe('100%'));
    expect(screen.queryByTestId('visualizador-falhou')).toBeNull();
    const e = roda(quadro, { deltaY: -100, ctrlKey: true, clientX: 10, clientY: 10 });
    expect(e.defaultPrevented).toBe(true);
    await waitFor(() => expect(zoom()).toBe('125%'));
    expect(quadro.getAttribute('data-modo')).toBe('livre');
  });

  it('VISUALIZADOR-PDF-02b: a roda e a pinça andam como no leitor do Chrome (a tabela MEDIDA em 25/11, um evento a partir de 100%)', async () => {
    const { zoomPelaRoda } = await import('./VisualizadorDeDocumento');
    const medido: [number, number][] = [[-1, 1.01], [-3, 1.03], [-5, 1.05], [-10, 1.11], [-20, 1.22], [-40, 1.25], [-100, 1.25], [-200, 1.25],
      [1, 0.99], [5, 0.95], [10, 0.9], [50, 0.75], [100, 0.75], [120, 0.75]];
    for (const [delta, esperado] of medido) expect(zoomPelaRoda(1, delta), `deltaY ${delta}`).toBe(esperado);
    expect(zoomPelaRoda(5, -100)).toBe(5);       // o teto do Chrome: 500%
    expect(zoomPelaRoda(0.25, 100)).toBe(0.25);  // o piso: 25%
  });

  it('a pinça do trackpad no Chrome do Mac (roda com ctrlKey, deltaY pequeno e seguidos) amplia aos poucos; ⌘ + roda reduz', async () => {
    render(<VisualizadorDeDocumento open {...props} />);
    const quadro = await screen.findByTestId('visualizador-quadro');
    await waitFor(() => expect(zoom()).toBe('100%'));
    for (let i = 0; i < 5; i++) expect(roda(quadro, { deltaY: -8, ctrlKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(Number.parseInt(zoom() ?? '0', 10)).toBeGreaterThan(100));
    const antes = Number.parseInt(zoom() ?? '0', 10);
    expect(roda(quadro, { deltaY: 200, metaKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(Number.parseInt(zoom() ?? '0', 10)).toBeLessThan(antes));
  });

  it('nasce FECHADO e abre depois (o caso das telas): Ctrl + roda funciona', async () => {
    const { rerender } = render(<VisualizadorDeDocumento open={false} {...props} />);
    rerender(<VisualizadorDeDocumento open {...props} />);
    const quadro = await screen.findByTestId('visualizador-quadro');
    await waitFor(() => expect(zoom()).toBe('100%'));
    expect(roda(quadro, { deltaY: -100, ctrlKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(zoom()).toBe('125%'));
  });
});
