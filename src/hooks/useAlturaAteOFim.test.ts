/**
 * TABELA-ALTURA-FIXA-01 — o quadro da tabela vai do topo dele até o fim da janela, com qualquer número de linhas: a altura sai só do
 * topo (com a página no início) e da janela; desligado (Ampliado) não manda altura nenhuma; e a tela de Lançamentos usa isso no lugar
 * do `maxHeight` que fazia o quadro encolher.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { alturaAteOFim, topoNaPagina, useAlturaAteOFim } from './useAlturaAteOFim';

/* um quadro de mentira: o topo dele na tela de agora e um pai rolado */
function quadro(topo: number, roladoDoPai = 0) {
  const pai = document.createElement('div');
  const el = document.createElement('div');
  pai.appendChild(el); document.body.appendChild(pai);
  Object.defineProperty(pai, 'scrollTop', { configurable: true, value: roladoDoPai });
  el.getBoundingClientRect = () => ({ top: topo, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: topo, toJSON: () => ({}) });
  return el;
}

describe('a altura até o fim da tela', () => {
  it('topo, janela e folga; nunca abaixo do mínimo', () => {
    expect(alturaAteOFim(218, 579, 8, 200)).toBe(353);
    expect(alturaAteOFim(400, 483, 8, 200)).toBe(200);
  });
  it('o topo é o da página no início: rolar não muda a conta', () => {
    expect(topoNaPagina(quadro(218))).toBe(218);
    expect(topoNaPagina(quadro(-82, 300))).toBe(218);
  });
  it('o hook mede ao receber o quadro e de novo quando a janela muda; desligado = sem altura', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 579 });
    const el = quadro(218);
    const { result, rerender } = renderHook(({ ativo }) => useAlturaAteOFim({ ativo }), { initialProps: { ativo: true } });
    expect(result.current.altura).toBeUndefined();
    act(() => { result.current.ref(el); });
    expect(result.current.altura).toBe(353);
    act(() => { window.innerHeight = 800; window.dispatchEvent(new Event('resize')); });
    expect(result.current.altura).toBe(574);
    rerender({ ativo: false });
    expect(result.current.altura).toBeUndefined();
  });
});

describe('a tela de Lançamentos (lida da fonte)', () => {
  const tela = readFileSync(resolve(__dirname, '../pages/FinanceiroV2Tab.tsx'), 'utf8');
  it('o quadro tem a altura até o fim da tela na lista normal; o scrollport ocupa o quadro; o vazio diz o filtro', () => {
    expect(tela).toContain('const quadroAteOFim = useAlturaAteOFim({ ativo: !modoIntensivo });');
    expect(tela).toContain("style={modoIntensivo ? undefined : { height: quadroAteOFim.altura ?? 'calc(100vh - 264px)' }} data-testid=\"quadro-lancamentos\"");
    expect(tela).toContain('<div ref={scrollContainerRef} className="min-h-0 flex-1 bg-card overflow-auto');
    expect(tela).not.toContain("maxHeight: 'calc(100vh - 264px)'");
    expect(tela).toContain("'Nenhum lançamento neste filtro'");
  });
});
