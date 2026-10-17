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
  linhaCreditoNome: null, sucessorNumero: null, saldo: saldo(), proxVencimento: '2026-11-10', data: '2025-01-10', dataOrigem: 'contrato', ...p,
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
    expect(within(b).getByTestId('cel-pendencia').textContent).toBe('sem lib.');
    expect(within(b).getByTestId('cel-pendencia').getAttribute('title')).toBe('liberação não gravada');
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
    expect(cols).toHaveLength(11);
    expect(cols.filter((x) => !x.getAttribute('style')).length).toBe(1);
    expect(cols[3].getAttribute('style')).toBeNull();
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
    expect(tds[0].className).toContain('celula-data');
    expect(tds[9].className).toContain('celula-data');
    expect(tds[4].className).toContain('celula-status');
    expect(tds[4].querySelector('span')?.className).toContain('rounded-[7px]');
    expect(screen.getAllByTestId('lista-fin-grupo')[0].className).toContain('h-[27px]');
  });
});

describe('FIN-FINANC-28-P3-FIX', () => {
  const semLib = (id: string, p: Partial<ContratoDaLista> = {}) =>
    c(id, { saldo: saldo({ liberado: null, saldo: null, pendencias: ['sem_liberacao'] }), ...p });
  const card = (rotulo: string) => {
    const cards = Array.from(screen.getByTestId('lista-fin-cards').children);
    return cards.find((x) => x.textContent?.startsWith(rotulo))!;
  };

  it('todos sem liberação: o subtotal, o total e os cards dizem "?" (nunca "0,00 + ?"), com "N a confirmar"', () => {
    montar([semLib('a'), semLib('b')]);
    const grupo = screen.getByTestId('lista-fin-grupo');
    const tds = grupo.querySelectorAll('td');
    expect(tds[2].textContent).toBe('?');      // liberado
    expect(tds[4].textContent).toBe('?');      // saldo
    expect(grupo.textContent).not.toContain('0,00 + ?');
    const total = screen.getByTestId('lista-fin-total').querySelectorAll('td');
    expect(total[2].textContent).toBe('?');
    expect(total[4].textContent).toBe('?');
    expect(card('Liberado').textContent).toContain('2 a confirmar');
    expect(card('Liberado').textContent).not.toContain('R$');
    expect(card('Saldo devedor').textContent).toContain('?');
    expect(card('Saldo devedor').textContent).not.toContain('R$ 0,00');
  });

  it('com um conhecido: "R$ x" e "+ N a confirmar"; o subtotal "x + ?"', () => {
    montar([c('a'), semLib('b')]);
    expect(card('Saldo devedor').textContent).toContain('R$ 800,00');
    expect(card('Saldo devedor').textContent).toContain('+ 1 a confirmar');
    expect(screen.getByTestId('lista-fin-grupo').textContent).toContain('800,00 + ?');
    expect(card('Saldo devedor').querySelector('span')?.getAttribute('title')).toContain('principal');
  });

  it('FIX4 — banco pelo NOME DO CADASTRO INTEIRO (o nome curto acabou), cortando com reticências; title "Nome · CNPJ"; Data é a primeira coluna', () => {
    montar([c('a', { banco: 'Banco do Brasil S.A. (001)', bancoDocumento: '00000000000191' }), c('b', { banco: 'Sicoob Ltda' })]);
    const [b, b2] = screen.getAllByTestId('cel-banco');
    expect(b.textContent).toBe('Banco do Brasil S.A. (001)');
    expect(b.className).toContain('truncate');
    expect(b.getAttribute('title')).toBe('Banco do Brasil S.A. (001) · 00.000.000/0001-91');
    expect(b2.getAttribute('title')).toBe('Sicoob Ltda');
    expect(screen.getAllByRole('columnheader')[0].textContent).toBe('Data');
    expect(screen.getAllByTestId('cel-data')[0].textContent).toBe('10/01/25');
    expect(screen.getAllByTestId('cel-data')[0].className).toContain('celula-data');
  });

  it('duas pendências: a 1ª curta + "+1" na coluna estreita; as duas por extenso no title', () => {
    montar([c('a', { numeroContrato: 'Sem dados', saldo: saldo({ liberado: null, saldo: null, pendencias: ['sem_liberacao', 'sem_numero_contrato'] }) })]);
    expect(screen.getByTestId('cel-pendencia').textContent).toBe('sem lib. +1');
    expect(screen.getByTestId('cel-pendencia').getAttribute('title')).toBe('liberação não gravada · falta nº do contrato');
  });

  it('FIX2 — agrupada só por banco (mostrarBanco=false): a coluna Banco some e o banco vai no title da Descrição', () => {
    render(<ListaDeFinanciamentos contratos={[c('a', { banco: 'Banco do Brasil' })]} encerradosAbertos={false}
      aoAlternarEncerrados={vi.fn()} aoAbrir={vi.fn()} mostrarBanco={false} />);
    expect(screen.queryByTestId('cel-banco')).toBeNull();
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).not.toContain('Banco');
    expect(screen.getByTestId('lista-fin-tabela').querySelectorAll('col')).toHaveLength(10);
    expect(screen.getByTestId('cel-descricao').getAttribute('title')).toBe('Contrato a · Banco do Brasil');
  });
});

describe('FIN-FINANC-28 P3-GRAFICO — card "Parcelas a pagar"', () => {
  it('entra na fileira (5 cards de mesma régua), mostra o principal em aberto e é ELE que abre o cronograma; o Saldo devedor não', () => {
    const abrir = vi.fn();
    render(<ListaDeFinanciamentos contratos={[c('a')]} encerradosAbertos={false} aoAlternarEncerrados={vi.fn()} aoAbrir={vi.fn()}
      aoAbrirCronograma={abrir} parcelasAPagar={11087377.51} />);
    const cards = screen.getByTestId('lista-fin-cards');
    expect(cards.className).toContain('grid-cols-5');
    expect(Array.from(cards.children).map((x) => x.querySelector('span')?.textContent)).toEqual(['Contratado', 'Liberado', 'Saldo devedor', 'Parcelas a pagar', 'Com pendência']);
    expect(Array.from(cards.children).every((x) => x.className.includes('h-[40px]'))).toBe(true);
    const botao = screen.getByTestId('abrir-cronograma-anual');
    expect(botao.textContent?.replace(/\s/g, ' ')).toBe('R$ 11.087.377,51');
    expect(botao.closest('[class*=h-\\[40px\\]]')?.querySelector('span')?.getAttribute('title')).toBe('Principal das parcelas em aberto; juros previstos no gráfico');
    fireEvent.click(botao);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button').filter((b) => b.getAttribute('data-testid') === 'abrir-cronograma-anual')).toHaveLength(1);
  });

  it('sem `parcelasAPagar` a fileira é a de antes (4 cards) e nada abre o cronograma', () => {
    render(<ListaDeFinanciamentos contratos={[c('a')]} encerradosAbertos={false} aoAlternarEncerrados={vi.fn()} aoAbrir={vi.fn()} />);
    expect(screen.getByTestId('lista-fin-cards').className).toContain('grid-cols-4');
    expect(screen.queryByTestId('abrir-cronograma-anual')).toBeNull();
  });
});
