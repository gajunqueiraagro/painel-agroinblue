/**
 * FIN-FINANC-28 · PASSO 4c — o modal "O que falta pagar" v2. LEI DO GRÁFICO: a altura de cada segmento é a razão do dado (na mesma
 * escala do eixo); o NÚMERO EM CIMA DE CADA COLUNA = a soma dos segmentos dela (a mesma fonte do tooltip); as cores são as de SAÍDA;
 * anos completos; a linha de hoje com o rótulo ABAIXO do eixo; o vencido fica no mês em que venceu (sem coluna "venc." à parte).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CronogramaEmAbertoDialog, ALTURA_DO_GRAFICO } from './CronogramaEmAbertoDialog';
import { COR_SAIDA } from '@/lib/graficos/coresDeSaida';
import type { ParcelaDoContrato, SituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';

const par = (p: Partial<ParcelaDoContrato>): ParcelaDoContrato => ({
  id: 'x', numero: 1, dataVencimento: '2026-11-10', valorPrincipal: 100, valorJuros: 0, valorTotal: 100, situacao: 'pendente',
  pagoEm: null, valorPago: 0, lancamentoId: null, lancamentoJurosId: null, fonte: 'lancamento', diverge: false, detalhe: null, ...p,
});
const sit = (ps: ParcelaDoContrato[]): SituacaoDoContrato => ({ parcelas: ps, cartoes: { valorContrato: 0, pago: 0, aVencer: 0, vencido: 0, adiado: 0, adiadoQtde: 0, pagas: 0, parcelas: ps.length,
  jurosPrevistos: 0, somaPrincipal: 0, somaTotal: 0, divergentes: 0, detalhe: null } });
const HOJE = '2026-10-17';
const COMPRAS = [sit([
  par({ dataVencimento: '2026-08-10', valorTotal: 1000, valorPrincipal: 1000, situacao: 'paga', valorPago: 1000 }),
  par({ dataVencimento: '2026-09-10', valorTotal: 400, valorPrincipal: 400, situacao: 'vencida' }),
  par({ dataVencimento: '2026-11-10', valorTotal: 1430.56, valorPrincipal: 1430.56 }),
  par({ dataVencimento: '2027-02-05', valorTotal: 75.2, valorPrincipal: 75.2 }),
])];

const colunas = () => Array.from(document.querySelectorAll<SVGGElement>('[data-testid=coluna-grafico]'));
const segmentos = (g: Element) => Array.from(g.querySelectorAll<SVGRectElement>('rect[data-segmento]'));

describe('modal mês a mês', () => {
  const abrir = () => render(<CronogramaEmAbertoDialog aberto aoFechar={vi.fn()} modo="mensal" situacoes={COMPRAS} hoje={HOJE} recorte="teste" />);

  it('anos COMPLETOS (jan/26 a dez/27 = 24 colunas), sem coluna "venc."; o vencido fica no mês em que venceu', () => {
    abrir();
    expect(colunas()).toHaveLength(24);
    expect(document.body.textContent).not.toContain('venc.');
    const set = colunas()[8];
    expect(segmentos(set).map((r) => r.getAttribute('data-segmento'))).toEqual(['vencido']);
    expect(segmentos(set)[0].getAttribute('fill')).toBe(COR_SAIDA.vencido);
    expect(segmentos(colunas()[7])[0].getAttribute('fill')).toBe(COR_SAIDA.pago);
    expect(segmentos(colunas()[10])[0].getAttribute('fill')).toBe(COR_SAIDA.aPagar);
    expect(screen.getByTestId('periodo-do-grafico').textContent).toBe('jan/26 a dez/27 · anos completos');
  });

  it('o número em cima de cada coluna = a soma dos segmentos dela (a mesma fonte do tooltip); coluna zerada não leva número', () => {
    abrir();
    for (const g of colunas()) {
      const soma = segmentos(g).reduce((a, r) => a + Number(r.getAttribute('data-valor')), 0);
      expect(Number(g.getAttribute('data-total'))).toBe(soma);
      const rot = g.querySelector('[data-testid=rotulo-coluna]');
      if (soma === 0) expect(rot).toBeNull(); else expect(rot).not.toBeNull();
    }
    const nov = colunas()[10];
    expect(nov.querySelector('[data-testid=rotulo-coluna]')!.textContent).toBe('1,4k');
    expect(nov.querySelector('title')!.textContent).toBe('nov/26: pago R$ 0,00 · vencido R$ 0,00 · a pagar R$ 1.430,56');
    /* o número na cor do texto do tema, nunca na da série */
    expect(nov.querySelector('[data-testid=rotulo-coluna]')!.getAttribute('class')).toContain('fill-foreground');
  });

  it('LEI DO GRÁFICO — a altura de cada segmento é a razão do valor na escala do eixo', () => {
    abrir();
    const nov = segmentos(colunas()[10])[0]; const set = segmentos(colunas()[8])[0];
    expect(Number(nov.getAttribute('height')) / Number(set.getAttribute('height'))).toBeCloseTo(143056 / 40000, 6);
  });

  it('a soma do que falta das colunas (vencido + a pagar) = "A pagar hoje"; topo e linha de hoje', () => {
    abrir();
    let falta = 0;
    for (const g of colunas()) for (const r of segmentos(g)) if (r.getAttribute('data-segmento') !== 'pago') falta += Number(r.getAttribute('data-valor'));
    expect(falta).toBe(40000 + 143056 + 7520);
    expect(screen.getByTestId('num-a-pagar').textContent).toContain('R$ 1.905,76');
    expect(screen.getByTestId('num-vencidas').textContent).toContain('R$ 400,00');
    expect(screen.getByTestId('num-janeiro').textContent).toBe('Ainda a pagar em jan/27R$ 75,20');
    /* "hoje 17/10" ABAIXO do eixo horizontal (y maior que o da base do gráfico) */
    const hoje = screen.getByTestId('linha-de-hoje');
    expect(hoje.textContent).toBe('hoje 17/10');
    expect(Number(hoje.querySelector('text')!.getAttribute('y'))).toBeGreaterThan(ALTURA_DO_GRAFICO - 36);
  });
});

describe('modal ano a ano', () => {
  const FIN = [sit([
    par({ dataVencimento: '2026-10-01', valorPrincipal: 0, valorJuros: 57388.2, valorTotal: 57388.2, situacao: 'vencida' }),
    par({ dataVencimento: '2027-10-01', valorPrincipal: 100, valorJuros: 50, valorTotal: 150 }),
  ])];
  it('juros em violeta, principal em laranja, vencido em vermelho; "Vencidos" em vermelho no topo', () => {
    render(<CronogramaEmAbertoDialog aberto aoFechar={vi.fn()} modo="anual" situacoes={FIN} hoje={HOJE} recorte="teste" />);
    expect(colunas()).toHaveLength(2);
    expect(segmentos(colunas()[0]).map((r) => r.getAttribute('fill'))).toEqual([COR_SAIDA.vencido]);
    expect(segmentos(colunas()[1]).map((r) => r.getAttribute('fill'))).toEqual([COR_SAIDA.aPagar, COR_SAIDA.juros]);
    expect(screen.getByTestId('num-vencidos').textContent).toContain('R$ 57.388,20');
    expect(screen.getByTestId('num-vencidos').innerHTML).toContain('#b91c1c');
    expect(colunas()[1].querySelector('title')!.textContent).toBe('2027: pago R$ 0,00 · vencido R$ 0,00 · principal a pagar R$ 100,00 · juros previstos R$ 50,00');
    expect(screen.queryByTestId('linha-de-hoje')).toBeNull();
  });
});

describe('fonte: sem mono, sem soma no desenho, tamanho fixo, cores pelos tokens', () => {
  const fonte = readFileSync(resolve(__dirname, 'CronogramaEmAbertoDialog.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  it('o modal não soma nem usa mono; tamanho fixo; nenhuma cor de série escrita à mão (azul de entrada nunca)', () => {
    expect(fonte).not.toMatch(/font-mono/);
    expect(fonte).not.toMatch(/\.reduce\(|\+=/);
    expect(fonte).toMatch(/h-\[440px\] w-\[760px\]/);
    expect(fonte).not.toMatch(/#2563a8|#d08a2c|#d97706|#8b5cf6|#cbd5e1/);
  });
});
