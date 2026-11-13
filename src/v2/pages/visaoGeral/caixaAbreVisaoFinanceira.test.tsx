/**
 * VISAO-GERAL-03 (Gabriel 08/11 09:04, print Agnaldo · Global · set/26) — os cartões do topo compactos e na mesma régua; o card Caixa abre o
 * Financeiro › Visão geral (nunca mais o fluxo de caixa antigo) no MESMO mês e fazenda, com o "‹ Voltar à Visão Geral".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { Kpi } from '@/components/mapa-geo/GeoPastosGlobal';
import { DESTINO_DO_CAIXA, inicialDaVisaoFinanceira } from './caixaAbreVisaoFinanceira';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const ler = (f: string) => readFileSync(path.join(RAIZ, f), 'utf8');

describe('o card Caixa abre o Financeiro › Visão geral', () => {
  it('o destino é a tela nova, nunca o fluxo de caixa antigo', () => {
    expect(DESTINO_DO_CAIXA).toBe('fin-visao-geral');
    const home = ler('src/v2/pages/V2Home.tsx');
    const caixa = home.slice(home.indexOf("{ id: 'caixa'"), home.indexOf("{ id: 'resultado'"));
    expect(caixa).toContain('onAbrir: () => irPara(DESTINO_DO_CAIXA)');
    expect(caixa).not.toContain("'fluxo-caixa'");
  });
  it('o mesmo mês (AAAA-MM) e a mesma fazenda; Global = nulo', () => {
    expect(inicialDaVisaoFinanceira('2026', '9', null)).toEqual({ sel: '2026-09', fazenda: null });
    expect(inicialDaVisaoFinanceira(2026, 11, 'fz-1')).toEqual({ sel: '2026-11', fazenda: 'fz-1' });
  });
  it('o shell passa o mês e a fazenda SÓ quando a tela foi aberta do Início (o menu abre no de sempre) e a volta é a da barra do topo', () => {
    const shell = ler('src/v2/V2Index.tsx');
    expect(shell).toContain('inicial={voltarAVisaoGeral ? inicialDaVisaoFinanceira(ano, mes, isGlobal ? null : fazendaAtual?.id ?? null) : undefined}');
    expect(shell).toMatch(/voltar=\{voltarAVisaoGeral && section !== 'home'/);
  });
  it('a tela aplica a fazenda de lá depois que a lista do cliente chegou, e a volta da lista de Lançamentos não a troca', () => {
    const vg = ler('src/v2/pages/VisaoGeralFinanceiro.tsx');
    expect(vg).toContain('const fazendaInicial = retorno ? undefined : inicial?.fazenda;');
    expect(vg).toMatch(/if \(fazendaInicial === undefined \|\| fazendaAplicada\.current \|\| !filtros\.lista\) return;/);
  });
});

describe('o cartão compacto', () => {
  it('menos folga, a comparação a 9,5 e o número igual (24 px em negrito); o Kpi da Geo pastos segue como era', () => {
    const { container } = render(<><Kpi compacto rotulo="Caixa" valor="R$ 1,2 mi" variacao="▲ 3% meta" testid="c" /><Kpi rotulo="Área" valor="10" variacao="x" testid="n" /></>);
    const [vc, , cc] = [...screen.getByTestId('c').children];
    expect(screen.getByTestId('c').className).toContain('py-[3px]');
    expect(vc.className).toContain('text-[24px]');
    expect(vc.className).toContain('font-bold');
    expect(cc.className).toContain('text-[9.5px]');
    const [, , cn] = [...screen.getByTestId('n').children];
    expect(screen.getByTestId('n').className).toContain('py-1');
    expect(cn.className).toContain('text-[11px]');
    expect(container).toBeTruthy();
  });
});
