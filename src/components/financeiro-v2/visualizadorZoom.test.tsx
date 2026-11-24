/**
 * VISUALIZADOR-PDF-01 (Gabriel 18/11 14:50) — o zoom do visualizador ÚNICO: Ctrl/⌘ + roda (e a pinça, que chega como roda com Ctrl) amplia no
 * documento e CANCELA o zoom da página do navegador; a roda sem Ctrl só rola; o ponto sob o cursor fica sob o cursor; duplo clique alterna
 * largura ↔ 100%; a camada de texto existe para selecionar.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error('sem pdf no teste')) }) }));

import { VisualizadorDeDocumento, limitarZoom, rolagemCentrada, zoomPelaRoda } from './VisualizadorDeDocumento';

const montar = () => render(<VisualizadorDeDocumento open bytes={new ArrayBuffer(4)} nome="boleto.pdf" onFechar={() => {}} onNovaAba={() => {}} />);
const zoomNaBarra = () => screen.getByTestId('visualizador-zoom').textContent;
const roda = (alvo: Element, init: WheelEventInit) => {
  const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  alvo.dispatchEvent(e);
  return e;
};

describe('VISUALIZADOR-PDF-01 — as contas', () => {
  it('a roda para cima amplia, para baixo reduz; o zoom fica entre 25% e 400%', () => {
    expect(zoomPelaRoda(1, -100)).toBeGreaterThan(1);
    expect(zoomPelaRoda(1, 100)).toBeLessThan(1);
    expect(zoomPelaRoda(4, -1000)).toBe(4);
    expect(zoomPelaRoda(0.25, 1000)).toBe(0.25);
    expect(limitarZoom(1.234)).toBe(1.23);
  });
  it('o ponto sob o cursor fica sob o cursor (o dobro do zoom = o dobro da distância, menos o cursor)', () => {
    expect(rolagemCentrada(0, 100, 1, 2)).toBe(100);
    expect(rolagemCentrada(50, 100, 1, 2)).toBe(200);
    expect(rolagemCentrada(0, 100, 2, 1)).toBe(0);
  });
});

describe('VISUALIZADOR-PDF-01 — no componente', () => {
  it('Ctrl + roda: amplia o DOCUMENTO e cancela o zoom do navegador; ⌘ + roda também; a roda sozinha não', async () => {
    montar();
    const quadro = await screen.findByTestId('visualizador-quadro');
    expect(zoomNaBarra()).toBe('100%');
    const comCtrl = roda(quadro, { deltaY: -100, ctrlKey: true, clientX: 10, clientY: 10 });
    expect(comCtrl.defaultPrevented).toBe(true);
    await waitFor(() => expect(zoomNaBarra()).toBe('122%'));
    const comCmd = roda(quadro, { deltaY: 100, metaKey: true });
    expect(comCmd.defaultPrevented).toBe(true);
    await waitFor(() => expect(zoomNaBarra()).toBe('100%'));
    /* a roda sozinha rola o documento (o zoom não muda; o cancelar dela, em jsdom, é do bloqueio de rolagem do diálogo, não nosso) */
    roda(quadro, { deltaY: 100 });
    await new Promise((ok) => setTimeout(ok, 20));
    expect(zoomNaBarra()).toBe('100%');
    expect(quadro.getAttribute('data-modo')).toBe('livre');
  });
  it('a pinça do Safari (gesturechange com scale) amplia e cancela o zoom do navegador', async () => {
    montar();
    const quadro = await screen.findByTestId('visualizador-quadro');
    quadro.dispatchEvent(new Event('gesturestart', { cancelable: true }));
    const g = new Event('gesturechange', { cancelable: true });
    Object.defineProperty(g, 'scale', { value: 2 });
    quadro.dispatchEvent(g);
    expect(g.defaultPrevented).toBe(true);
    await waitFor(() => expect(zoomNaBarra()).toBe('200%'));
  });
  it('duplo clique: da "Página inteira" (VISUALIZADOR-PDF-02 abre nela) vai a "Ajustar à largura", e alterna largura ↔ 100%', async () => {
    montar();
    const quadro = await screen.findByTestId('visualizador-quadro');
    expect(quadro.getAttribute('data-modo')).toBe('pagina');
    fireEvent.doubleClick(quadro);
    await waitFor(() => expect(quadro.getAttribute('data-modo')).toBe('largura'));
    fireEvent.doubleClick(quadro);
    await waitFor(() => expect(quadro.getAttribute('data-modo')).toBe('livre'));
    expect(zoomNaBarra()).toBe('100%');
    fireEvent.doubleClick(quadro);
    await waitFor(() => expect(quadro.getAttribute('data-modo')).toBe('largura'));
  });
});
