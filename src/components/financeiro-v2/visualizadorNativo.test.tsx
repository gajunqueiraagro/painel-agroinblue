/**
 * VISUALIZADOR-PDF-02b (Gabriel 25/11 15:23) — com o leitor de PDF do navegador (`navigator.pdfViewerEnabled`), o visualizador ÚNICO abre o PDF
 * num `iframe` com uma URL `blob:` LOCAL (nunca pública; revogada ao fechar) em `#zoom=100`: o zoom e a pinça são os do navegador, os mesmos da
 * guia nova. O pdf.js nem carrega. Baixar e Abrir em nova aba seguem na nossa barra. Arquivo que não é PDF e navegador sem leitor: o pdf.js.
 * Sem dado de cliente: bytes sintéticos.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

const getDocument = vi.fn(() => ({ promise: Promise.reject(new Error('sem pdf no teste')) }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: () => getDocument() }));

import { PDFDocument } from 'pdf-lib';
import { VisualizadorDeDocumento, ehPdf, enderecoNoLeitor } from './VisualizadorDeDocumento';

const PDF = new TextEncoder().encode('%PDF-1.7\n% sintetico\n').buffer;
const NAO_PDF = new TextEncoder().encode('<?xml version="1.0"?><nfeProc/>').buffer;

let criadas: string[] = [];
let blobs: Blob[] = [];
let revogadas: string[] = [];
const urlOriginal = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL };

beforeEach(() => {
  criadas = []; revogadas = []; blobs = []; getDocument.mockClear();
  Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true, configurable: true });
  URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); const u = `blob:teste/${criadas.length + 1}`; criadas.push(u); return u; });
  URL.revokeObjectURL = vi.fn((u: string) => { revogadas.push(u); });
});
afterEach(() => {
  cleanup();   // desmonta (e revoga) ANTES de devolver o URL do jsdom
  Reflect.deleteProperty(navigator, 'pdfViewerEnabled');
  URL.createObjectURL = urlOriginal.criar;
  URL.revokeObjectURL = urlOriginal.revogar;
});

/** o conteúdo do Blob (o do jsdom não tem `arrayBuffer()`) */
const lerBlob = (b: Blob) => new Promise<Uint8Array>((ok, falha) => {
  const r = new FileReader();
  r.onload = () => (r.result instanceof ArrayBuffer ? ok(new Uint8Array(r.result)) : falha(new Error('sem bytes')));
  r.onerror = () => falha(r.error);
  r.readAsArrayBuffer(b);
});

const props = { nome: 'boleto.pdf', onFechar: () => {}, onNovaAba: () => {} };

describe('VISUALIZADOR-PDF-02b — o leitor do navegador', () => {
  it('abre o PDF no iframe, em 100%, por URL blob local; o pdf.js nem carrega; a barra fica com Baixar e Nova aba', async () => {
    const baixar = vi.fn();
    render(<VisualizadorDeDocumento open bytes={PDF} onBaixar={baixar} {...props} />);
    const iframe = await screen.findByTestId('visualizador-iframe');
    expect(iframe.getAttribute('src')).toBe('blob:teste/1#zoom=100&navpanes=0');
    expect(screen.getByTestId('visualizador-quadro').getAttribute('data-modo')).toBe('nativo');
    expect(screen.queryByTestId('visualizador-zoom')).toBeNull();      // o zoom é o do leitor
    expect(screen.queryByTestId('visualizador-girar')).toBeNull();
    fireEvent.click(screen.getByTestId('visualizador-baixar'));
    expect(baixar).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('visualizador-nova-aba')).toBeTruthy();
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('fechar revoga a URL (o arquivo sai da memória); abrir de novo cria outra', async () => {
    const { rerender } = render(<VisualizadorDeDocumento open bytes={PDF} {...props} />);
    await screen.findByTestId('visualizador-iframe');
    rerender(<VisualizadorDeDocumento open={false} bytes={PDF} {...props} />);
    expect(revogadas).toEqual(['blob:teste/1']);
    rerender(<VisualizadorDeDocumento open bytes={PDF} {...props} />);
    expect((await screen.findByTestId('visualizador-iframe')).getAttribute('src')).toBe('blob:teste/2#zoom=100&navpanes=0');
  });

  it('fechado ANTES de a cópia ficar pronta: nenhuma URL fica criada sem ser revogada (o arquivo nunca fica na memória)', async () => {
    const { rerender } = render(<VisualizadorDeDocumento open bytes={PDF} {...props} />);
    rerender(<VisualizadorDeDocumento open={false} bytes={PDF} {...props} />);
    await new Promise((ok) => setTimeout(ok, 200));
    expect(criadas.filter((u) => !revogadas.includes(u))).toEqual([]);
  });

  it('embutido (o painel da Conciliação): o mesmo iframe, sem o diálogo', async () => {
    render(<VisualizadorDeDocumento open embutido bytes={PDF} {...props} />);
    expect((await screen.findByTestId('visualizador-iframe')).getAttribute('src')).toBe('blob:teste/1#zoom=100&navpanes=0');
    expect(screen.getByTestId('visualizador-documento').hasAttribute('data-embutido')).toBe(true);
  });

  it('arquivo que não é PDF nunca vai ao leitor do navegador (o pdf.js tenta e diz que não deu)', async () => {
    render(<VisualizadorDeDocumento open bytes={NAO_PDF} {...props} />);
    expect(await screen.findByTestId('visualizador-falhou')).toBeTruthy();
    expect(screen.queryByTestId('visualizador-iframe')).toBeNull();
    expect(criadas).toEqual([]);
  });

  it('navegador sem leitor (Chrome do Android): o pdf.js, abrindo em 100%', async () => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false, configurable: true });
    render(<VisualizadorDeDocumento open bytes={PDF} {...props} />);
    expect(screen.queryByTestId('visualizador-iframe')).toBeNull();
    expect(screen.getByTestId('visualizador-zoom').textContent).toBe('100%');
    expect(criadas).toEqual([]);
  });

  it('a barra do leitor mostra o NOME do arquivo: o leitor recebe uma cópia com o título; o PDF que o pdf-lib não abre vai como está', async () => {
    const sintetico = await PDFDocument.create();
    sintetico.addPage([200, 200]);
    const bom = await sintetico.save();
    const bytes = bom.buffer.slice(bom.byteOffset, bom.byteOffset + bom.byteLength);
    const { unmount } = render(<VisualizadorDeDocumento open bytes={bytes} {...props} />);
    await screen.findByTestId('visualizador-iframe');
    const lido = await PDFDocument.load(await lerBlob(blobs[0]));
    expect(lido.getTitle()).toBe('boleto.pdf');
    expect(lido.getPageCount()).toBe(1);
    unmount();
    /* o %PDF falso (o pdf-lib não abre): o original, byte a byte — e o iframe abre do mesmo jeito */
    render(<VisualizadorDeDocumento open bytes={PDF} {...props} />);
    await screen.findByTestId('visualizador-iframe');
    expect(await lerBlob(blobs[1])).toEqual(new Uint8Array(PDF));
  });

  it('o ✕ de fechar é branco sobre a barra azul (o padrão dos modais de barra azul) e centrado nela', async () => {
    render(<VisualizadorDeDocumento open bytes={PDF} {...props} />);
    const conteudo = await screen.findByTestId('visualizador-documento');
    expect(conteudo.className).toContain('[&>button]:text-primary-foreground');
    expect(conteudo.className).toContain('[&>button]:top-2.5');
    expect(screen.getByRole('button', { name: 'Close' }).parentElement).toBe(conteudo);
  });

  it('as contas: %PDF no começo (até 1 KB, como o leitor aceita) e o endereço com #zoom=100&navpanes=0', () => {
    expect(ehPdf(PDF)).toBe(true);
    expect(ehPdf(NAO_PDF)).toBe(false);
    expect(ehPdf(new ArrayBuffer(0))).toBe(false);
    expect(enderecoNoLeitor('blob:x/1')).toBe('blob:x/1#zoom=100&navpanes=0');
  });
});
