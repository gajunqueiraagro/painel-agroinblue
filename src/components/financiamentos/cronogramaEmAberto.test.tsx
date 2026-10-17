/**
 * FIN-FINANC-28 · P3-GRAFICO — o modal "O que falta pagar". LEI DO GRÁFICO: a altura das barras é a razão dos dados (na mesma
 * escala); no anual, principal e juros empilhados na MESMA escala. E os números do topo são os do dono.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CronogramaEmAbertoDialog, barrasDoCronograma, larguraDaBarra } from './CronogramaEmAbertoDialog';
import type { Cronograma } from '@/lib/financiamentos/cronogramaEmAberto';

const col = (chave: string, total: number, principal = total, tipo: 'periodo' | 'vencidas' = 'periodo', depois = 0) =>
  ({ chave, tipo, totalCent: total, principalCent: principal, jurosCent: total - principal, depoisCent: depois });

const MENSAL: Cronograma = {
  colunas: [col('vencidas', 1295200, 1295200, 'vencidas', 46339000), col('2026-10', 17176200, 17176200, 'periodo', 29162800),
    col('2026-11', 14305600, 14305600, 'periodo', 14857200), col('2026-12', 8679800), col('2027-01', 3137700), col('2027-02', 752000)],
  totalCent: 47634200, vencidasCent: 1295200, principalCent: 47634200, jurosCent: 0, ultima: '2027-02',
};
const ANUAL: Cronograma = {
  colunas: [col('2026', 69808200, 0), col('2027', 354631000, 230109400), col('2028', 103973500, 29080000)],
  totalCent: 528412700, vencidasCent: 0, principalCent: 259189400, jurosCent: 269223300, ultima: '2028',
};

const alturas = () => Array.from(document.querySelectorAll<HTMLElement>('[data-testid=grafico-do-cronograma] div[title]'))
  .filter((d) => d.style.height.endsWith('%') && !d.dataset.segmento)
  .map((d) => ({ h: parseFloat(d.style.height), title: d.getAttribute('title') ?? '', el: d }));

describe('modal mês a mês', () => {
  it('números do topo: A pagar hoje = o total; Vencidas em vermelho; ainda em jan/27; última parcela', () => {
    render(<CronogramaEmAbertoDialog aberto aoFechar={vi.fn()} modo="mensal" cronograma={MENSAL} hoje="2026-10-17" recorte="teste" />);
    expect(screen.getByTestId('num-a-pagar').textContent).toContain('R$ 476.342,00');
    expect(screen.getByTestId('num-vencidas').textContent).toContain('R$ 12.952,00');
    expect(screen.getByTestId('num-vencidas').innerHTML).toContain('#b91c1c');
    expect(screen.getByTestId('num-janeiro').textContent).toBe('Ainda a pagar em jan/27R$ 38.897,00');
    expect(screen.getByTestId('num-ultima').textContent).toContain('fev/27');
  });

  it('LEI DO GRÁFICO — a altura de cada barra é a razão do valor sobre o maior (piso de 2% só abaixo dele)', () => {
    render(<CronogramaEmAbertoDialog aberto aoFechar={vi.fn()} modo="mensal" cronograma={MENSAL} hoje="2026-10-17" recorte="teste" />);
    const hs = alturas();
    expect(hs).toHaveLength(6);
    const max = 17176200;
    MENSAL.colunas.forEach((c, i) => {
      const esperado = Math.max(2, (c.totalCent / max) * 100);
      expect(hs[i].h).toBeCloseTo(esperado, 6);
    });
    expect(hs[1].h / hs[2].h).toBeCloseTo(17176200 / 14305600, 6);
    expect(hs[0].el.className).toContain('bg-[#b91c1c]');
    expect(hs[1].title).toBe('out/26: vence R$ 171.762,00 · depois restam R$ 291.628,00');
  });

  it('eixo: mês abreviado e o ano só debaixo do primeiro mês de cada ano; a 1ª coluna é "venc."', () => {
    const b = barrasDoCronograma(MENSAL, 'mensal');
    expect(b.map((x) => x.rotulo)).toEqual(['venc.', 'out', 'nov', 'dez', 'jan', 'fev']);
    expect(b.map((x) => x.nota)).toEqual(['', '2026', '', '', '2027', '']);
    expect(b.map((x) => x.texto)).toEqual(['13k', '172k', '143k', '87k', '31k', '8k']);
  });

  it('barras compactas: 26px até caber, encolhem com muitas colunas (nunca a tela)', () => {
    expect(larguraDaBarra(12)).toBe(26);
    expect(larguraDaBarra(40)).toBeLessThan(26);
    expect(larguraDaBarra(200)).toBe(10);
  });
});

describe('modal ano a ano', () => {
  it('LEI DO GRÁFICO, EMPILHADO — principal e juros na MESMA escala: cada pedaço = valor / maior total', () => {
    render(<CronogramaEmAbertoDialog aberto aoFechar={vi.fn()} modo="anual" cronograma={ANUAL} hoje="2026-10-17" recorte="teste" />);
    const hs = alturas();
    const max = 354631000;
    ANUAL.colunas.forEach((c, i) => {
      expect(hs[i].h).toBeCloseTo((c.totalCent / max) * 100, 6);
      const seg = Array.from(hs[i].el.querySelectorAll<HTMLElement>('[data-segmento]'));
      expect(seg).toHaveLength(2);
      /* pedaço em % da barra × barra em % da escala = o pedaço em % da escala */
      expect(parseFloat(seg[0].style.height) * hs[i].h / 100).toBeCloseTo((c.principalCent / max) * 100, 6);
      expect(parseFloat(seg[1].style.height) * hs[i].h / 100).toBeCloseTo((c.jurosCent / max) * 100, 6);
      expect(seg[0].className).toContain('bg-[#2563a8]');
      expect(seg[1].className).toContain('bg-[#d08a2c]');
    });
    expect(hs[1].title).toBe('2027: principal R$ 2.301.094,00 · juros R$ 1.245.216,00 · total R$ 3.546.310,00');
    expect(screen.getByTestId('num-principal').textContent).toContain('R$ 2.591.894,00');
    expect(screen.getByTestId('num-juros').textContent).toContain('R$ 2.692.233,00');
    expect(screen.getByTestId('num-ultima').textContent).toContain('2028');
    expect(screen.getByTestId('legenda-anual').textContent).toContain('Juros previstos como estão no cronograma de cada contrato.');
  });
});

describe('fonte: sem mono, sem soma no desenho, tamanho fixo', () => {
  const fonte = readFileSync(resolve(__dirname, 'CronogramaEmAbertoDialog.tsx'), 'utf8');
  it('o modal não soma nem usa fonte mono; altura e largura fixas', () => {
    expect(fonte).not.toMatch(/font-mono/);
    expect(fonte).not.toMatch(/\.reduce\(|\+=/);
    expect(fonte).toMatch(/h-\[400px\] w-\[680px\]/);
  });
});
