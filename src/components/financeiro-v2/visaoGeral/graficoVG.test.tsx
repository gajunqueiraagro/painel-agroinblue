/**
 * P90 — o gráfico "Entradas × saídas por mês" (quadro de 600×300 dado ao jsdom):
 *   G1 o valor da COLUNA na horizontal (sem girar), EM CIMA da própria coluna
 *   G2 o valor do SALDO em cima do próprio ponto (não numa faixa no topo)
 *   G3 a linha do saldo COMEÇA no ponto "i" (saldo inicial) e é CURVA (Bézier), não reta
 *   G4 azul ≥ 0 e vermelha < 0 trocando no zero (a mesma curva recortada acima/abaixo do zero); o PREVISTO laranja e pontilhado fino,
 *      recortado a partir do último mês realizado
 *   G5 (Gabriel 31/10 11:13) a linha do saldo com a espessura da linha da gaveta (1,6 px, medida no navegador; era 2) e os marcadores e
 *      a pontilhada do previsto na mesma proporção (×0,8): cores, valores e posições não mudam
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render } from '@testing-library/react';
import { GraficoVG } from './GraficoVG';
import { COR, type TelaVG } from '@/lib/financeiro/visaoGeral';

const M = ['2026-01', '2026-02', '2026-03', '2026-04'];
const TELA = {
  mes_atual: '2026-02',
  meses: M.map((am) => ({ am, previsto: am > '2026-02', vigente: am === '2026-02' })),
  linhas: [
    { chave: 'saldo_inicial', tipo: 'saldo', rotulo: 'Saldo inicial', valores: [5000, 9000, -2000, 1000] },
    { chave: 'entrada:total::', tipo: 'total', lado: 'entrada', rotulo: 'ENTRADAS', valores: [8000, 1000, 6000, 3000] },
    { chave: 'saida:total::', tipo: 'total', lado: 'saida', rotulo: 'SAÍDAS TOTAIS', valores: [4000, 12000, 3000, 9000] },
    { chave: 'saldo_final', tipo: 'saldo', rotulo: 'Saldo final', valores: [9000, -2000, 1000, -5000] },
  ],
  grafico: null, conciliado_ate: null, contas_sem_ancora: [],
} as unknown as TelaVG;

const orig: Record<string, PropertyDescriptor | undefined> = {};
beforeAll(() => {
  for (const [k, v] of [['clientWidth', 600], ['clientHeight', 300]] as const) {
    orig[k] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, k);
    Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => v });
  }
  (globalThis as any).ResizeObserver ??= class { observe() {} disconnect() {} };
});
afterAll(() => { for (const k of Object.keys(orig)) if (orig[k]) Object.defineProperty(HTMLElement.prototype, k, orig[k]!); });

const num = (e: Element | null, a: string) => Number(e?.getAttribute(a));

describe('gráfico entradas × saídas', () => {
  it('G1 valor da coluna horizontal em cima dela', () => {
    const { getByTestId } = render(<GraficoVG tela={TELA} modo="flx" sel="2026-02" onSel={() => {}} />);
    const r = getByTestId('rotulo-coluna-entradas-2026-01');
    const b = getByTestId('barra-entradas-2026-01');
    expect(r.getAttribute('transform')).toBeNull();
    expect(r.textContent).toBe('8');
    expect(num(r, 'y')).toBeLessThan(num(b, 'y'));
  });

  it('G2 valor do saldo em cima do ponto', () => {
    const { getByTestId, container } = render(<GraficoVG tela={TELA} modo="flx" sel="2026-02" onSel={() => {}} />);
    const r = getByTestId('rotulo-saldo-2026-02');
    const pontos = [...container.querySelectorAll('circle')];
    const ponto = pontos.find((c) => c.querySelector('title')?.textContent?.startsWith('saldo final de fev/26'))!;
    expect(num(r, 'y')).toBeCloseTo(num(ponto, 'cy') - 5, 0);
    expect(num(r, 'y')).toBeGreaterThan(40); /* o saldo negativo de fev fica embaixo — nunca na faixa do topo */
  });

  it('G3 a curva começa no "i" e é Bézier', () => {
    const { getByTestId } = render(<GraficoVG tela={TELA} modo="flx" sel="2026-02" onSel={() => {}} />);
    const d = getByTestId('linha-saldo-pos').getAttribute('d')!;
    const xi = num(getByTestId('barra-saldo-inicial'), 'x') + num(getByTestId('barra-saldo-inicial'), 'width') / 2;
    expect(Number(d.slice(1).split(' ')[0])).toBeCloseTo(xi, 1);
    expect(d).toContain('C');
  });

  it('G4 azul/vermelha recortadas no zero; previsto laranja pontilhado fino a partir do último realizado', () => {
    const { getByTestId, container } = render(<GraficoVG tela={TELA} modo="flx" sel="2026-02" onSel={() => {}} />);
    const pos = getByTestId('linha-saldo-pos'), neg = getByTestId('linha-saldo-neg'), prev = getByTestId('linha-saldo-previsto');
    expect(pos.getAttribute('stroke')).toBe(COR.pos);
    expect(neg.getAttribute('stroke')).toBe(COR.neg);
    expect(pos.getAttribute('d')).toBe(neg.getAttribute('d'));
    expect(prev.getAttribute('stroke')).toBe(COR.previsto);
    expect(prev.getAttribute('stroke-dasharray')).toBe('1.2 2.6');
    const acima = container.querySelector(`clipPath[id$="-acima"] rect`)!, abaixo = container.querySelector(`clipPath[id$="-abaixo"] rect`)!;
    expect(num(acima, 'height')).toBeCloseTo(num(abaixo, 'y'), 5);
    const real = container.querySelector(`clipPath[id$="-real"] rect`)!, prevC = container.querySelector(`clipPath[id$="-prev"] rect`)!;
    const xFev = num(getByTestId('coluna-2026-02'), 'x') + num(getByTestId('coluna-2026-02'), 'width') / 2;
    expect(num(real, 'width')).toBeCloseTo(xFev, 5);
    expect(num(prevC, 'x')).toBeCloseTo(xFev, 5);
  });

  it('G5 saldo a 1,6 px (a da gaveta), marcadores e previsto ×0,8', () => {
    const { getByTestId, container } = render(<GraficoVG tela={TELA} modo="flx" sel="2026-02" onSel={() => {}} />);
    expect(getByTestId('linha-saldo-pos').getAttribute('stroke-width')).toBe('1.6');
    expect(getByTestId('linha-saldo-neg').getAttribute('stroke-width')).toBe('1.6');
    expect(getByTestId('linha-saldo-previsto').getAttribute('stroke-width')).toBe('1.12');
    const raios = [...container.querySelectorAll('circle')].filter((c) => c.querySelector('title')?.textContent?.startsWith('saldo final'))
      .map((c) => c.getAttribute('r'));
    expect(raios).toEqual(['1.92', '2.72', '1.92', '1.92']);
  });
});
