/**
 * FIN-FINANC-28-P3 — a aba "Financiamentos" desenhada, e a aba "Compras parceladas" igual à lista de antes.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ListaDeFinanciamentos } from './ListaDeFinanciamentos';
import type { ContratoDaLista } from '@/lib/financiamentos/listaDeFinanciamentos';
import type { SaldoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';

const saldo = (p: Partial<SaldoDoContrato> = {}): SaldoDoContrato => ({
  aplicaSaldo: true, regra: 'calculado', contratado: 1000, liberado: 1000, liberacoes: 1, amortizado: 200, saldo: 800,
  jurosPagos: 0, jurosPrevistos: 0, foraDasSomas: false, pendencias: [], ...p,
});
const c = (id: string, p: Partial<ContratoDaLista> = {}): ContratoDaLista => ({
  id, numeroContrato: `C-${id}1`, banco: 'Banco A', descricao: `Contrato ${id}`, status: 'ativo', linhaCreditoId: null,
  linhaCreditoNome: null, sucessorNumero: null, saldo: saldo(), proxVencimento: '2026-11-10', ...p,
});

function montar(contratos: ContratoDaLista[], encerradosAbertos = false) {
  const aoAbrir = vi.fn();
  const aoAlternar = vi.fn();
  render(<ListaDeFinanciamentos contratos={contratos} encerradosAbertos={encerradosAbertos}
    aoAlternarEncerrados={aoAlternar} aoAbrir={aoAbrir} />);
  return { aoAbrir, aoAlternar };
}

describe('ListaDeFinanciamentos', () => {
  it('saldo NULO aparece "?" em âmbar, e o total diz "+ ?"', () => {
    montar([c('a'), c('b', { saldo: saldo({ liberado: null, saldo: null, pendencias: ['sem_liberacao'] }) })]);
    const linhas = screen.getAllByTestId('lista-fin-contrato');
    const b = linhas.find((l) => l.textContent?.includes('Contrato b'))!;
    expect(within(b).getByTestId('cel-saldo').textContent).toBe('?');
    expect(within(b).getByTestId('cel-liberado').textContent).toBe('?');
    expect(within(b).getByTestId('cel-pendencia').textContent).toBe('liberação não gravada');
    const total = screen.getByTestId('lista-fin-total');
    expect(total.textContent).toContain('800,00');
    expect(total.textContent).toContain('+ ?');
  });

  it('nº vazio ou sem dígito: "sem nº"', () => {
    montar([c('a', { numeroContrato: 'Sem dados' }), c('b', { numeroContrato: null })]);
    const nums = screen.getAllByTestId('cel-numero').map((n) => n.textContent);
    expect(nums).toEqual(['sem nº', 'sem nº']);
  });

  it('grupo de linha de crédito e de banco, com subtotal', () => {
    montar([c('a'), c('b', { linhaCreditoId: 'L1', linhaCreditoNome: 'PRONAMP' })]);
    const grupos = screen.getAllByTestId('lista-fin-grupo').map((g) => g.textContent ?? '');
    expect(grupos[0]).toContain('Linha · PRONAMP · 1 contrato');
    expect(grupos[1]).toContain('Banco A · 1 contrato');
    expect(grupos[1]).toContain('800,00');
  });

  it('encerrados recolhidos numa linha; abrir lista o rolado com o sucessor', () => {
    const rolado = c('r', { status: 'rolado', sucessorNumero: 'C-a1', saldo: saldo({ saldo: 0, foraDasSomas: true }) });
    const { aoAlternar } = montar([c('a'), rolado]);
    expect(screen.getByTestId('lista-fin-encerrados').textContent).toContain('Encerrados · 1 contrato');
    expect(screen.queryByText('→ C-a1')).toBeNull();
    fireEvent.click(screen.getByTestId('lista-fin-encerrados'));
    expect(aoAlternar).toHaveBeenCalledTimes(1);
  });

  it('com os encerrados abertos o rolado diz "→ <sucessor>" e fica fora do total', () => {
    montar([c('a'), c('r', { status: 'rolado', sucessorNumero: 'C-a1', saldo: saldo({ saldo: 0, foraDasSomas: true }) })], true);
    expect(screen.getAllByTestId('cel-pendencia').some((p) => p.textContent === '→ C-a1')).toBe(true);
    expect(screen.getByTestId('lista-fin-total').textContent).toContain('1.000,00');
  });

  it('clique na linha abre o contrato', () => {
    const { aoAbrir } = montar([c('a')]);
    fireEvent.click(screen.getAllByTestId('lista-fin-contrato')[0]);
    expect(aoAbrir).toHaveBeenCalledWith('a');
  });

  it('régua fixa: table-fixed e colgroup em px, só a Descrição sem largura', () => {
    montar([c('a')]);
    const tabela = screen.getByTestId('lista-fin-tabela');
    expect(tabela.className).toContain('table-fixed');
    const cols = Array.from(tabela.querySelectorAll('col'));
    expect(cols).toHaveLength(10);
    expect(cols.filter((x) => !x.getAttribute('style')).length).toBe(1);
    expect(cols[2].getAttribute('style')).toBeNull();
  });
});

describe('as duas abas na fonte da página (o conteúdo de "Compras parceladas" é provado montado em financiamentosListaCompacta)', () => {
  const fonte = readFileSync(resolve(__dirname, '../../pages/FinanciamentosListaPage.tsx'), 'utf8');
  it('a lista antiga fica só com os parcelamentos; a nova com o resto, pelos mesmos filtros', () => {
    expect(fonte).toMatch(/financiamentos\.filter\(f => ehCompraParcelada\(f\.natureza\) && passaNosFiltros\(f, filtroStatus\)\)/);
    expect(fonte).toMatch(/!ehCompraParcelada\(f\.natureza\)[\s\S]{0,160}passaNosFiltros\(f, filtroSituacaoFin\)/);
  });
  it('a tela não calcula saldo: o saldo é a chave do lote', () => {
    expect(fonte).toMatch(/saldo: lote\.get\(f\.id\)\?\.saldo/);
  });
  it('as duas tabelas usam a régua de Lançamentos (table-financeiro), e não há fonte mono nos valores', () => {
    expect(fonte).toMatch(/className=\{`\$\{TABELA_LANC\} table-fixed /);
    expect(fonte).toMatch(/const MOEDA = TD_VALOR_LANC;/);
    expect(fonte).not.toMatch(/text-\[16px\] font-bold/);
  });
});

describe('régua de Lançamentos na tabela nova', () => {
  it('tabela table-financeiro, valor celula-valor sem mono, data celula-data, selo na forma do status, linha de 25px', () => {
    montar([c('a')]);
    expect(screen.getByTestId('lista-fin-tabela').className).toContain('table-financeiro');
    const linha = screen.getAllByTestId('lista-fin-contrato')[0];
    expect(linha.className).toContain('h-[25px]');
    const saldo = within(linha).getByTestId('cel-saldo');
    expect(saldo.className).toContain('celula-valor');
    expect(saldo.className).not.toContain('font-mono');
    const tds = linha.querySelectorAll('td');
    expect(tds[8].className).toContain('celula-data');
    expect(tds[3].className).toContain('celula-status');
    expect(tds[3].querySelector('span')?.className).toContain('rounded-[7px]');
    expect(screen.getAllByTestId('lista-fin-grupo')[0].className).toContain('h-[27px]');
  });
});
