/**
 * UI-ARRASTAR-ARQUIVO-01a — a proteção global: arquivo solto FORA de uma área não navega; arrastar que não é arquivo segue intacto.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { protegerSoltarFora } from './protegerSoltarFora';

let desligar: (() => void) | null = null;
afterEach(() => { desligar?.(); desligar = null; document.body.innerHTML = ''; });

/** Um evento de arrastar como o navegador o entrega, com os `types` pedidos. */
function arrastar(alvo: EventTarget, tipo: 'dragover' | 'drop', types: string[]) {
  const e = new Event(tipo, { bubbles: true, cancelable: true });
  const dataTransfer = { types, dropEffect: 'copy' as string };
  Object.defineProperty(e, 'dataTransfer', { value: dataTransfer });
  alvo.dispatchEvent(e);
  return { prevenido: e.defaultPrevented, dropEffect: dataTransfer.dropEffect };
}

describe('protegerSoltarFora', () => {
  it('controle — SEM a proteção, o arquivo solto fora não é tratado (é quando o navegador abre o arquivo)', () => {
    expect(arrastar(document.body, 'dragover', ['Files']).prevenido).toBe(false);
    expect(arrastar(document.body, 'drop', ['Files']).prevenido).toBe(false);
  });
  it('com a proteção: arquivo sobre qualquer ponto da página não navega, e o cursor diz "aqui não"', () => {
    desligar = protegerSoltarFora();
    const sobre = arrastar(document.body, 'dragover', ['Files']);
    expect(sobre).toEqual({ prevenido: true, dropEffect: 'none' });
    expect(arrastar(document.body, 'drop', ['Files']).prevenido).toBe(true);
    expect(arrastar(document.documentElement, 'drop', ['Files']).prevenido).toBe(true);
  });
  it('arrastar que NÃO é arquivo (texto, link, linha) não é tocado', () => {
    desligar = protegerSoltarFora();
    for (const types of [['text/plain'], ['text/uri-list', 'text/html'], []]) {
      expect(arrastar(document.body, 'dragover', types)).toEqual({ prevenido: false, dropEffect: 'copy' });
      expect(arrastar(document.body, 'drop', types).prevenido).toBe(false);
    }
  });
  it('área que já tratou o arrastar fica com a decisão dela (o cursor não vira "aqui não")', () => {
    desligar = protegerSoltarFora();
    const area = document.createElement('div');
    area.addEventListener('dragover', (e) => { e.preventDefault(); });
    document.body.appendChild(area);
    expect(arrastar(area, 'dragover', ['Files'])).toEqual({ prevenido: true, dropEffect: 'copy' });
  });
  it('desligar tira os dois ouvintes', () => {
    protegerSoltarFora()();
    expect(arrastar(document.body, 'drop', ['Files']).prevenido).toBe(false);
  });
  it('é UMA, e está no shell: o `App` a liga; os arrastares que não são de arquivo usam @dnd-kit com ponteiro (sem dataTransfer)', () => {
    const ler = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');
    expect(ler('App.tsx')).toContain('useEffect(() => protegerSoltarFora(), [])');
    for (const p of ['components/financeiro-v2/EspelhoConciliacaoTab.tsx', 'pages/DividendosTab.tsx', 'pages/PastosTab.tsx']) {
      const fonte = ler(p);
      expect(fonte).toContain('@dnd-kit/core');
      expect(fonte).toContain('PointerSensor');
      /* a busca sabe achar: a palavra existe em quem arrasta arquivo */
      expect(fonte).not.toMatch(/dataTransfer|onDrop=|onDragOver=|draggable=/);
    }
    expect(ler('pages/CadernoImportTab.tsx')).toMatch(/dataTransfer/);
  });
});
