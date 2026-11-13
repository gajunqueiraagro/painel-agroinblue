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
    /* FIN-FINANC-LAYOUT-03 (escolha A): o grupo de LINHA leva os bancos (a coluna Banco saiu) */
    expect(grupos[0]).toContain('Linha · PRONAMP · Banco A · 1 contrato');
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

  it('régua fixa: table-fixed e colgroup em em da régua, só a Descrição sem largura; sem a coluna Banco; sem largura mínima (nunca rola)', () => {
    montar([c('a')]);
    const tabela = screen.getByTestId('lista-fin-tabela');
    expect(tabela.className).toContain('table-fixed');
    const cols = Array.from(tabela.querySelectorAll('col'));
    expect(cols).toHaveLength(10);
    expect(cols.filter((x) => !x.getAttribute('style')).length).toBe(1);
    expect(cols[2].getAttribute('style')).toBeNull();
    for (const x of cols.filter((k) => k.getAttribute('style'))) expect(x.style.width).toMatch(/em$/);
    expect(tabela.style.minWidth).toBe('');
    expect(screen.getByTestId('lista-fin-rolagem').className).toContain('overflow-x-hidden');
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).not.toContain('Banco');
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

describe('FIN-FINANC-LAYOUT-03 — a lista na RÉGUA ÚNICA com o contrato (saiu da régua de Lançamentos)', () => {
  it('sem table-financeiro: célula e cabeçalho pelas variáveis da régua; valor em negrito tabular; selo na forma do status; todo cabeçalho de dado ordena', () => {
    montar([c('a')]);
    const tabela = screen.getByTestId('lista-fin-tabela');
    expect(tabela.className).not.toContain('table-financeiro');
    expect(tabela.className).toContain('text-[length:var(--fin-td)]');
    const linha = screen.getAllByTestId('lista-fin-contrato')[0];
    const saldo = within(linha).getByTestId('cel-saldo');
    expect(saldo.className).toMatch(/text-right font-semibold tabular-nums/);
    expect(saldo.className).toContain('h-[var(--fin-linha)]');
    expect(saldo.className).not.toContain('font-mono');
    const tds = linha.querySelectorAll('td');
    expect(tds[3].querySelector('span')?.className).toContain('rounded-[7px]');
    const ths = screen.getAllByRole('columnheader');
    expect(ths[0].className).toContain('text-[length:var(--fin-th)]');
    /* Chat 22:00: TODA coluna ordena, Próx. venc. e Pendência também */
    expect(ths.map((th) => th.getAttribute('aria-sort'))).not.toContain(null);
    expect(ths).toHaveLength(10);
  });
  it('a Descrição é a única célula que quebra a linha; número, data e valor nunca', () => {
    montar([c('a')]);
    const linha = screen.getAllByTestId('lista-fin-contrato')[0];
    expect(within(linha).getByTestId('cel-descricao').className).toContain('whitespace-normal');
    for (const id of ['cel-data', 'cel-numero', 'cel-saldo', 'cel-pendencia']) expect(within(linha).getByTestId(id).className).toContain('whitespace-nowrap');
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

  it('FIX4 + FIN-FINANC-LAYOUT-03 (escolha A) — o banco pelo NOME INTEIRO na linha do grupo (cada nome numa peça que não quebra) e "Nome · CNPJ" no title da Descrição; Data primeiro, dd/mm/aaaa', () => {
    montar([c('a', { banco: 'Banco do Brasil S.A. (001)', bancoDocumento: '00000000000191', linhaCreditoId: 'L1', linhaCreditoNome: 'PRONAMP' }),
      c('b', { banco: 'Sicoob Ltda', linhaCreditoId: 'L1', linhaCreditoNome: 'PRONAMP' })]);
    expect(screen.queryByTestId('cel-banco')).toBeNull();
    const rotulo = screen.getByTestId('rotulo-do-grupo');
    expect([...rotulo.children].map((x) => x.textContent?.replace(/^ · /, ''))).toEqual(['Linha · PRONAMP', 'Banco do Brasil S.A. (001)', 'Sicoob Ltda', '2 contratos']);
    for (const x of [...rotulo.children]) expect(x.className).toContain('whitespace-nowrap');
    const desc = screen.getAllByTestId('cel-descricao');
    expect(desc.map((d) => d.getAttribute('title'))).toEqual(['Contrato a · Banco do Brasil S.A. (001) · 00.000.000/0001-91', 'Contrato b · Sicoob Ltda']);
    expect(screen.getAllByRole('columnheader')[0].textContent).toBe('Data');
    expect(screen.getAllByTestId('cel-data')[0].textContent).toBe('10/01/2025');
  });

  it('ordenar pela Pendência: pelo texto da 1ª; sem pendência no fim (Chat 22:00)', () => {
    montar([c('a', { banco: 'B' }), c('b', { banco: 'B', saldo: saldo({ pendencias: ['sem_numero_contrato'] }) }), c('d', { banco: 'B', saldo: saldo({ pendencias: ['sem_documento'] }) })]);
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Pendência/ })).getByRole('button'));
    expect(screen.getAllByTestId('cel-pendencia').map((x) => x.textContent)).toEqual(['sem doc', 'sem nº', '—']);
  });
  it('o rolado: a seta pode quebrar, o número do sucessor fica INTEIRO numa linha (Chat 22:00)', () => {
    montar([c('r', { status: 'rolado', sucessorNumero: 'C_998.877.665.540001' })], true);
    const cel = screen.getByTestId('cel-pendencia');
    expect(cel.textContent).toBe('→ C_998.877.665.540001');
    expect(cel.querySelector('span')?.className).toContain('whitespace-nowrap');
    expect(cel.querySelector('span')?.textContent).toBe('C_998.877.665.540001');
  });
  it('duas pendências: a 1ª curta + o selo "+1" (Chat 18:00); as duas por extenso no title', () => {
    montar([c('a', { numeroContrato: 'Sem dados', saldo: saldo({ liberado: null, saldo: null, pendencias: ['sem_liberacao', 'sem_numero_contrato'] }) })]);
    expect(screen.getByTestId('cel-pendencia').textContent).toBe('sem lib. +1');
    expect(screen.getByTestId('mais-pendencias').className).toContain('rounded-full');
    expect(screen.getByTestId('cel-pendencia').getAttribute('title')).toBe('liberação não gravada · falta nº do contrato');
  });

  it('FIX2 — agrupada só por banco: a coluna Banco não existe e o banco vai no title da Descrição (desde o FIN-FINANC-LAYOUT-03, sempre)', () => {
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
    expect(botao.closest('[class*=h-\\[40px\\]]')?.querySelector('span')?.getAttribute('title')).toBe('Principal das parcelas a vencer; vencidos e juros previstos no gráfico');
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
