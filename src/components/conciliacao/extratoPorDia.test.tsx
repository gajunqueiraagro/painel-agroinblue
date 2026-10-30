/**
 * P159a (CONC-TELAS-01, mock `mock-extrato-banco-v1.html`) — o Extrato (banco) por dia, no `ListaDoMesPorDia`: data (dd/mm) só na 1ª
 * linha do dia, dentro do dia o maior |valor| primeiro, o saldo SÓ no fim do dia (o acumulado de sempre, na ordem do arquivo), o sem par
 * em âmbar com [Sugestões] [Criar], o histórico limpo com o texto inteiro e o documento no `title`. Dado sintético.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { TabelaExtratoDoMes, type EspOfx } from './TabelaExtratoDoMes';
import type { EspelhoInternas } from '@/hooks/useEspelhoInternas';

const L = (id: string, data: string, valor: number, status: EspOfx['status'], historico: string, documento: string | null = null): EspOfx => ({
  extrato_id: id, data, historico, documento, valor, status, flag_dup: false, flag_investimento: false,
});
/* NA ORDEM DO ARQUIVO: 01/10 −10, −300 (sem par), +50; 02/10 −5. Abertura 1.000 → 990, 690, 740 | 735. */
const OFX = [
  L('a', '2031-10-01', -10, 'conciliado', 'PIX - ENVIADO - 01/10 08:46 FULANO DE TAL', '2031100100001'),
  L('b', '2031-10-01', -300, 'sem_vinculo', 'PAGAMENTO DE BOLETO -  EMPRESA EXEMPLO S A'),
  L('c', '2031-10-01', 50, 'conciliado', 'Pix - Recebido - 01/10 14:02 Beltrana'),
  L('d', '2031-10-02', -5, 'conciliado', 'Movimento do Dia'),
];
const INTERNAS: EspelhoInternas = { contasInternas: new Set(), lancamentosInternos: new Set(), saldoInicialConsolidado: null, saldoInformadoConsolidado: 700 };

const montar = (semPar?: Parameters<typeof TabelaExtratoDoMes>[0]['semPar']) =>
  render(<TabelaExtratoDoMes ofx={OFX} inicial={1000} internas={INTERNAS} semPar={semPar} />);
const linhas = () => screen.getAllByTestId('extrato-linha');

describe('P159a — o Extrato (banco) por dia', () => {
  /* P159e (Gabriel 29/10): o dinheiro em TRÊS colunas e "Nome do extrato"; a régua padrão (10px) */
  /* P159e (mock `mock-casar-abas-v1.html`): Data 70 (dd/mm/aaaa) e a linha de 18px; o saldo inicial e o final de 22px em negrito */
  it('a régua: Data 70 · Nome do extrato · Entradas 96 · Saídas 96 · Saldo 100 · ✓ 20 · Situação 150; linha 18px a 10px, saldos 22px', () => {
    const { container } = montar();
    const lista = container.querySelector('[data-testid="extrato-do-mes"] table');
    if (!lista) throw new Error('sem a lista');
    expect([...lista.querySelectorAll('col')].map((c) => (c instanceof HTMLElement ? c.style.width : '?')))
      .toEqual(['70px', '', '96px', '96px', '100px', '20px', '150px']);
    for (const td of screen.getAllByTestId('extrato-linha').flatMap((tr) => [...tr.children])) expect(td.className).toContain('h-[18px]');
    for (const td of screen.getByTestId('lista-saldo-inicial').children) { expect(td.className).toContain('h-[22px]'); expect(td.className).toContain('font-bold'); }
    expect([...lista.querySelectorAll('thead th')].map((th) => th.textContent))
      .toEqual(['Data', 'Nome do extrato', 'Entradas', 'Saídas', 'Saldo', '', 'Situação']);
    expect(lista.querySelector('thead th[data-coluna="saldo"]')?.textContent).toBe('Saldo');
    /* o corpo a 10px; a data do dia (cinza) fica a 9,5, o tamanho do cabeçalho da régua */
    for (const td of lista.querySelectorAll('tbody td:not([data-testid="lista-dia"])')) expect(td.className).toContain('text-[10px]');
  });
  it('a entrada em Entradas (verde), a saída em Saídas (vermelha); a outra fica vazia', () => {
    montar();
    const [boleto, recebido] = linhas();
    expect(within(boleto).getByTestId('extrato-entrada').textContent).toBe('');
    expect(within(boleto).getByTestId('extrato-saida').className).toContain('text-rose-600');
    expect(within(boleto).getByTestId('extrato-saida').textContent).toMatch(/^-/);
    expect(within(recebido).getByTestId('extrato-entrada').className).toContain('text-emerald-600');
    expect(within(recebido).getByTestId('extrato-entrada').textContent).not.toBe('');
    expect(within(recebido).getByTestId('extrato-saida').textContent).toBe('');
  });
  /* P159e — ALINHAMENTO SOBERANO: o saldo inicial, o do fim do dia e o final do rodapé caem na coluna Saldo (a 5ª), com o mesmo colgroup */
  it('o saldo inicial, o do fim do dia e o saldo final na MESMA coluna Saldo; o rodapé com as mesmas colunas', () => {
    const { container } = montar();
    const coluna = (td: Element) => { let c = 0; for (const x of td.parentElement?.children ?? []) { if (x === td) return c; c += x instanceof HTMLTableCellElement ? x.colSpan : 1; } return -1; };
    const marcados = [...container.querySelectorAll('[data-alinha-coluna="saldo"]')];
    expect(marcados.map((td) => td.getAttribute('data-testid'))).toEqual(['extrato-saldo-inicial', 'extrato-saldo', 'extrato-saldo', 'extrato-saldo-final']);
    for (const td of marcados) expect(coluna(td)).toBe(4);
    const rodape = container.querySelector('[data-testid="extrato-do-mes-rodape"] table');
    if (!rodape) throw new Error('sem o rodapé');
    expect([...rodape.querySelectorAll('col')].map((c) => (c instanceof HTMLElement ? c.style.width : '?')))
      .toEqual(['70px', '', '96px', '96px', '100px', '20px', '150px']);
    /* o rodapé soma Entradas e Saídas nas colunas delas (2 e 3) */
    expect(coluna(screen.getByTestId('extrato-soma-entradas'))).toBe(2);
    expect(coluna(screen.getByTestId('extrato-soma-saidas'))).toBe(3);
    expect(screen.getByTestId('extrato-soma-entradas').textContent).toBe('50,00');
    expect(screen.getByTestId('extrato-soma-saidas').textContent).toBe('-315,00');
    for (const td of screen.getByTestId('extrato-saldo-final').parentElement?.children ?? []) expect(td.className).toContain('h-[22px]');
  });
  it('dentro do dia o maior |valor| primeiro; a data dd/mm/aaaa em toda linha (P159e, o mock)', () => {
    montar();
    expect(linhas().map((tr) => within(tr).getByTestId('extrato-historico').textContent)).toEqual([
      'PAGAMENTO DE BOLETO · EMPRESA EXEMPLO S A', 'Pix Recebido · Beltrana', 'PIX ENVIADO · FULANO DE TAL', 'Movimento do Dia']);
    expect(linhas().map((tr) => within(tr).getByTestId('lista-dia').textContent)).toEqual(['01/10/2031', '01/10/2031', '01/10/2031', '02/10/2031']);
  });
  it('o saldo SÓ no fim do dia, em negrito: o acumulado depois da ÚLTIMA linha do dia NA ORDEM DO ARQUIVO (740 e 735)', () => {
    montar();
    expect(linhas().map((tr) => tr.children[4].textContent)).toEqual(['', '', '740,00', '735,00']);
    expect(screen.getAllByTestId('extrato-saldo').every((td) => td.className.includes('font-bold'))).toBe(true);
    expect(screen.getByTestId('extrato-saldo-inicial').textContent).toBe('1.000,00');
  });
  it('o histórico limpo: a hora na frente; o limpo, o texto inteiro do banco e o documento no title', () => {
    montar();
    const tr = linhas()[2];
    expect(within(tr).getByTestId('extrato-hora').textContent).toBe('08:46');
    expect(tr.children[1].getAttribute('title')).toBe('PIX ENVIADO · FULANO DE TAL\nPIX - ENVIADO - 01/10 08:46 FULANO DE TAL\ndocumento 2031100100001');
  });
  it('casado: ✓ e "casado"; sem par em âmbar, com [Sugestões] [Criar] que chamam quem monta', () => {
    const semPar = { nSugestoes: () => 2, aoSugestoes: vi.fn(), aoCriar: vi.fn() };
    montar(semPar);
    const [sp, casado] = linhas();
    expect(within(casado).getByTestId('extrato-sinal').textContent).toBe('✓');
    expect(within(casado).getByTestId('extrato-situacao').textContent).toBe('casado');
    expect(sp.className).toContain('bg-amber-50');
    expect(within(sp).getByTestId('extrato-sinal').textContent).toBe('○');
    fireEvent.click(within(sp).getByTestId('sem-par-sugestoes'));
    fireEvent.click(within(sp).getByTestId('sem-par-criar'));
    expect(semPar.aoSugestoes).toHaveBeenCalledWith(OFX[1]);
    expect(semPar.aoCriar).toHaveBeenCalledWith(OFX[1]);
  });
  /* P159f (Gabriel 29/10): "Sugestões" abre SEMPRE — sem candidato, o mesmo botão (sem o contorno azul), e o clique chama quem monta */
  it('sem sugestão: o botão abre do mesmo jeito (só sem o contorno azul) e diz o que vai achar; sem os botões (o Importar), "sem par"', () => {
    const aoSugestoes = vi.fn();
    const { unmount } = montar({ nSugestoes: () => 0, aoSugestoes, aoCriar: vi.fn() });
    const b = screen.getAllByTestId('sem-par-sugestoes')[0];
    expect(b).not.toBeDisabled();
    expect(b.className).toContain('border-border');
    expect(b.getAttribute('data-com-sugestoes')).toBe('nao');
    expect(b.getAttribute('title')).toBe('Nenhuma sugestão automática — abrir para procurar no histórico');
    fireEvent.click(b);
    expect(aoSugestoes).toHaveBeenCalledTimes(1);
    unmount();
    montar();
    expect(within(linhas()[0]).getByTestId('extrato-situacao').textContent).toBe('sem par');
  });
  it('o rodapé preso: saldo final do extrato e o informado no arquivo, com a diferença em âmbar', () => {
    montar();
    expect(screen.getByTestId('extrato-saldo-final').textContent).toBe('735,00');
    expect(screen.getByTestId('extrato-informado').textContent).toBe('Saldo final do extrato · informado no arquivo 700,00 · difere R$ 35,00');
  });
});
