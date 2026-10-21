/**
 * FIN-V2-LISTA-VIRTUAL-01 (Gabriel 21/10/2026) — a lista de Lançamentos só desenha as linhas à vista.
 * Com o NJ em Global (5.279 linhas) a tabela tinha ~150 mil nós. O corpo (`CorpoDaListaMemo`) desenha a janela das linhas
 * visíveis + folga, com duas linhas espaçadoras de altura N × 19px no lugar das outras.
 *
 * (1) 5.000 lançamentos montam no máximo ~100 linhas; rolar para o meio e para o fim troca a janela, e a altura total
 *     (espaçadores + linhas) é a da lista inteira.
 * (2) A janela é aritmética em degraus, e trocar só o dado não a mexe.
 * (3) A ligação em `FinanceiroV2Tab.tsx` e no CSS, lida da fonte: a tela desenha a FATIA, rola no scrollport da lista, e a
 *     linha tem altura fixa de 19px.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRef } from 'react';
import { render, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { CorpoDaListaMemo, janelaDasLinhas, ALTURA_DA_LINHA } from './corpoDaLista';

const N = 5000;
const LINHAS = Array.from({ length: N }, (_, i) => ({ id: `l${i}`, nome: `Lançamento ${i}` }));

function Lista() {
  const rolagem = useRef<HTMLDivElement>(null);
  return (
    <div ref={rolagem} data-testid="rolagem" style={{ height: 600, overflow: 'auto' }}>
      <table><tbody>
        <CorpoDaListaMemo chave={[LINHAS]} total={LINHAS.length} colunas={1} rolagem={rolagem}
          desenhar={(i, f) => LINHAS.slice(i, f).map((l) => <tr key={l.id} className="linha-da-lista"><td>{l.nome}</td></tr>)} />
      </tbody></table>
    </div>
  );
}

/* O jsdom não faz layout: o scrollport tem 600px e o corpo começa no topo dele, subindo com a rolagem. */
let rafs: FrameRequestCallback[] = [];
beforeEach(() => {
  rafs = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { rafs.push(cb); return rafs.length; });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'rolagem' ? 600 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const sc = this.closest('[data-testid="rolagem"]') as HTMLElement | null;
    const top = this.dataset.testid === 'rolagem' ? 0 : -(sc?.scrollTop ?? 0);
    return { top, left: 0, right: 0, bottom: top, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
});
afterEach(() => vi.restoreAllMocks());

const linhas = () => [...document.querySelectorAll('tr.linha-da-lista')];
const espaco = (k: string) => Number((document.querySelector(`[data-espaco-da-lista="${k}"]`) as HTMLElement).style.height.replace('px', ''));
const rolarPara = (px: number) => {
  const sc = document.querySelector('[data-testid="rolagem"]') as HTMLElement;
  act(() => { sc.scrollTop = px; sc.dispatchEvent(new Event('scroll')); });
  act(() => { rafs.splice(0).forEach((cb) => cb(0)); });
};

describe('FIN-V2-LISTA-VIRTUAL-01 — só as linhas à vista', () => {
  it('5.000 lançamentos montam no máximo ~100 linhas, e a altura total é a da lista inteira', () => {
    render(<Lista />);
    expect(linhas().length).toBeGreaterThan(0);
    expect(linhas().length).toBeLessThanOrEqual(100);
    expect(linhas()[0].textContent).toBe('Lançamento 0');
    expect(espaco('antes') + linhas().length * ALTURA_DA_LINHA + espaco('depois')).toBe(N * ALTURA_DA_LINHA);
  });

  it('rolar para o meio e para o fim troca a janela, sem nunca montar a lista inteira', () => {
    render(<Lista />);
    rolarPara(3000 * ALTURA_DA_LINHA);
    expect(linhas().length).toBeLessThanOrEqual(100);
    expect(linhas().some((l) => l.textContent === 'Lançamento 3000')).toBe(true);
    expect(espaco('antes') + linhas().length * ALTURA_DA_LINHA + espaco('depois')).toBe(N * ALTURA_DA_LINHA);
    rolarPara(N * ALTURA_DA_LINHA);
    expect(linhas().length).toBeLessThanOrEqual(100);
    expect(linhas().at(-1)?.textContent).toBe(`Lançamento ${N - 1}`);
    expect(espaco('depois')).toBe(0);
  });

  it('a janela anda em degraus e não se prende ao total', () => {
    expect(janelaDasLinhas(0, 600)).toEqual({ inicio: 0, fim: 50 });
    expect(janelaDasLinhas(5 * ALTURA_DA_LINHA, 600)).toEqual({ inicio: 0, fim: 60 });
    expect(janelaDasLinhas(1000 * ALTURA_DA_LINHA, 600)).toEqual({ inicio: 980, fim: 1050 });
    /* rolar uma linha dentro do degrau não muda a janela */
    expect(janelaDasLinhas(1001 * ALTURA_DA_LINHA, 600)).toEqual(janelaDasLinhas(1000 * ALTURA_DA_LINHA, 600));
  });

  it('a tela desenha a fatia, rola no scrollport da lista, e a linha tem 19px fixos', () => {
    const fonte = readFileSync('src/pages/FinanceiroV2Tab.tsx', 'utf8');
    const corpo = fonte.slice(fonte.indexOf('<CorpoDaListaMemo'), fonte.indexOf('</tbody>', fonte.indexOf('<CorpoDaListaMemo')));
    expect(corpo).toMatch(/rolagem=\{scrollContainerRef\}/);
    expect(corpo).toMatch(/desenhar=\{\(inicio, fim\) =>/);
    expect(corpo).toContain('linhasDaGrade.slice(inicio, fim).map(');
    expect(corpo).not.toMatch(/linhasDaGrade\.map\(/);
    expect(corpo).toContain('linha-da-lista');
    /* o "⋯" cabe na linha de 19px */
    expect(readFileSync('src/components/financeiro-v2/corpoDaLista.tsx', 'utf8')).toMatch(/className="h-4 w-4 rounded-sm" title="Ações"/);
    expect(ALTURA_DA_LINHA).toBe(19);
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toMatch(/\.table-financeiro tr\.linha-da-lista \{ height: 19px !important; \}/);
    expect(css).toMatch(/\.table-financeiro td\.espaco-da-lista \{ padding: 0 !important; border: 0 !important; \}/);
  });
});
