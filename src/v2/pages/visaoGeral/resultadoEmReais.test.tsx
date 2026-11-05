/* VG-RESULTADO-RS-01 (Gabriel 05/11/2026, do bilhete do Code 5): o KPI Resultado com valor ou meta ≤ 0 mostra a diferença em R$ contra a
   meta ("+R$ 645 mil vs meta") no lugar do % (o % sobre prejuízo confundia: "R$ −300,5K · ▲ 68,2% meta"). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { comparacoes, diferencaEmReais, reaisCurtos } from './indicadoresDaAtividade';
import { CartoesDoTopo } from './CartoesDoTopo';

describe('diferencaEmReais', () => {
  it('valor ou meta ≤ 0: a diferença (valor − meta); os dois positivos: null (segue o %); sem um deles: null', () => {
    expect(diferencaEmReais(-300_500, -945_000)).toBe(644_500);
    expect(diferencaEmReais(-300_500, 200_000)).toBe(-500_500);
    expect(diferencaEmReais(150_000, -50_000)).toBe(200_000);
    expect(diferencaEmReais(0, 100_000)).toBe(-100_000);
    expect(diferencaEmReais(100_000, 0)).toBe(100_000);
    expect(diferencaEmReais(300_000, 200_000)).toBeNull();
    expect(diferencaEmReais(null, -1)).toBeNull();
    expect(diferencaEmReais(-1, undefined)).toBeNull();
  });
  it('reaisCurtos: mil, mi e o valor pequeno inteiro, sem sinal', () => {
    expect(reaisCurtos(644_500)).toBe('R$ 645 mil');
    expect(reaisCurtos(-1_234_567)).toBe('R$ 1,2 mi');
    expect(reaisCurtos(950)).toBe('R$ 950');
  });
});

describe('a linha da comparação', () => {
  it('com metaEmReais: "+R$ 645 mil vs meta" verde (melhor que a meta) ou "−R$ 501 mil vs meta" vermelho; o ano ant. segue no %', () => {
    expect(comparacoes({ meta: 68.2, metaEmReais: 644_500, anoAnt: -10 })).toEqual([
      { texto: '+R$ 645 mil vs meta', bom: true }, { texto: '▼ 10,0% ano ant.', bom: false }]);
    expect(comparacoes({ meta: -250, metaEmReais: -500_500, anoAnt: null })).toEqual([{ texto: '−R$ 501 mil vs meta', bom: false }]);
  });
  it('ano ant. pela MESMA regra (Gabriel 05/11 08:22): −300,5 mil × −500 mil = "+R$ 200 mil vs ano ant." verde; pior = vermelho', () => {
    expect(diferencaEmReais(-300_500, -500_000)).toBe(199_500);
    expect(comparacoes({ meta: null, anoAnt: 39.9, anoAntEmReais: 199_500 })).toEqual([{ texto: '+R$ 200 mil vs ano ant.', bom: true }]);
    expect(comparacoes({ meta: null, anoAnt: -60, anoAntEmReais: -300_500 })).toEqual([{ texto: '−R$ 301 mil vs ano ant.', bom: false }]);
    expect(comparacoes({ meta: null, anoAnt: 13.6, anoAntEmReais: null })).toEqual([{ texto: '▲ 13,6% ano ant.', bom: true }]);
  });
  it('sem metaEmReais: o % de sempre', () => {
    expect(comparacoes({ meta: 12.5, anoAnt: null })).toEqual([{ texto: '▲ 12,5% meta', bom: true }]);
  });
  it('o cartão mostra a diferença no lugar do %', () => {
    render(<CartoesDoTopo cartoes={[{ id: 'resultado', titulo: 'Resultado do ano · pecuária', valor: 'R$ −300,5K', meta: 68.2, metaEmReais: 644_500,
      anoAnt: 39.9, anoAntEmReais: 199_500, abrir: 'Abrir DRE' }]} />);
    expect(screen.getByTestId('vg-comparacao').textContent).toBe('+R$ 645 mil vs meta · +R$ 200 mil vs ano ant.');
  });
  it('a Visão Geral passa a diferença só no Resultado, e só para quem vê a meta', () => {
    const home = readFileSync(resolve(__dirname, '../V2Home.tsx'), 'utf8');
    expect(home).toContain('metaEmReais: soMeta(diferencaEmReais(resultadoAno, resultadoMeta)),');
    expect(home.match(/metaEmReais:/g)).toHaveLength(1);
    expect(home).toContain('anoAntEmReais: diferencaEmReais(resultadoAno, drePecAnt?.lucro_liquido),');
    expect(home.match(/anoAntEmReais:/g)).toHaveLength(1);
  });
});
