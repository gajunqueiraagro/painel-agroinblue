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
  it('abre em "Página inteira" (a folha toda no quadro), e "Ajustar à largura" é a opção', async () => {
    render(<VisualizadorDeDocumento open {...props} />);
    const quadro = await screen.findByTestId('visualizador-quadro');
    expect(quadro.getAttribute('data-modo')).toBe('pagina');
    await waitFor(() => expect(zoom()).toBe('103%'));
    expect(screen.getByTestId('visualizador-pagina-n').textContent).toBe('1/3');
    fireEvent.click(screen.getByTestId('visualizador-largura'));
    await waitFor(() => expect(zoom()).toBe('163%'));
  });

  it('Ctrl + roda amplia e cancela o zoom do navegador (o PDF abriu: nada de "falhou" para rodar o efeito de novo)', async () => {
    render(<VisualizadorDeDocumento open {...props} />);
    const quadro = await screen.findByTestId('visualizador-quadro');
    await waitFor(() => expect(zoom()).toBe('103%'));
    expect(screen.queryByTestId('visualizador-falhou')).toBeNull();
    const e = roda(quadro, { deltaY: -100, ctrlKey: true, clientX: 10, clientY: 10 });
    expect(e.defaultPrevented).toBe(true);
    await waitFor(() => expect(zoom()).toBe('126%'));
    expect(quadro.getAttribute('data-modo')).toBe('livre');
  });

  it('um dente da roda (deltaY 100) é ≈ +22%, nunca ×2,7', async () => {
    const { zoomPelaRoda } = await import('./VisualizadorDeDocumento');
    expect(zoomPelaRoda(1, -100)).toBe(1.22);
    expect(zoomPelaRoda(1, 100)).toBe(0.82);
  });

  it('a pinça do trackpad no Chrome do Mac (roda com ctrlKey, deltaY pequeno e seguidos) amplia aos poucos; ⌘ + roda reduz', async () => {
    render(<VisualizadorDeDocumento open {...props} />);
    const quadro = await screen.findByTestId('visualizador-quadro');
    await waitFor(() => expect(zoom()).toBe('103%'));
    for (let i = 0; i < 5; i++) expect(roda(quadro, { deltaY: -8, ctrlKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(Number.parseInt(zoom() ?? '0', 10)).toBeGreaterThan(103));
    const antes = Number.parseInt(zoom() ?? '0', 10);
    expect(roda(quadro, { deltaY: 200, metaKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(Number.parseInt(zoom() ?? '0', 10)).toBeLessThan(antes));
  });

  it('nasce FECHADO e abre depois (o caso das telas): Ctrl + roda funciona', async () => {
    const { rerender } = render(<VisualizadorDeDocumento open={false} {...props} />);
    rerender(<VisualizadorDeDocumento open {...props} />);
    const quadro = await screen.findByTestId('visualizador-quadro');
    await waitFor(() => expect(zoom()).toBe('103%'));
    expect(roda(quadro, { deltaY: -100, ctrlKey: true }).defaultPrevented).toBe(true);
    await waitFor(() => expect(zoom()).toBe('126%'));
  });
});
