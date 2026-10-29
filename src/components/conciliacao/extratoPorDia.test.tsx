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
  it('a régua do mock: Data 44 · Histórico · Valor 96 · Saldo 100 · ✓ 20 · Situação 150', () => {
    const { container } = montar();
    expect([...container.querySelectorAll('col')].map((c) => c.style.width)).toEqual(['44px', '', '96px', '100px', '20px', '150px']);
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Data', 'Histórico', 'Valor', 'Saldo', '', 'Situação']);
  });
  it('dentro do dia o maior |valor| primeiro; a data só na 1ª linha do dia', () => {
    montar();
    expect(linhas().map((tr) => within(tr).getByTestId('extrato-historico').textContent)).toEqual([
      'PAGAMENTO DE BOLETO · EMPRESA EXEMPLO S A', 'Pix Recebido · Beltrana', 'PIX ENVIADO · FULANO DE TAL', 'Movimento do Dia']);
    expect(linhas().map((tr) => within(tr).getByTestId('lista-dia').textContent)).toEqual(['01/10', '', '', '02/10']);
  });
  it('o saldo SÓ no fim do dia, em negrito: o acumulado depois da ÚLTIMA linha do dia NA ORDEM DO ARQUIVO (740 e 735)', () => {
    montar();
    expect(linhas().map((tr) => tr.children[3].textContent)).toEqual(['', '', '740,00', '735,00']);
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
  it('sem sugestão: o botão fica apagado e diz por quê; sem os botões (o Importar), a Situação diz "sem par"', () => {
    const { unmount } = montar({ nSugestoes: () => 0, aoSugestoes: vi.fn(), aoCriar: vi.fn() });
    expect(screen.getByTestId('sem-par-sugestoes')).toBeDisabled();
    expect(screen.getByTestId('sem-par-sugestoes').getAttribute('title')).toBe('nenhuma sugestão para este movimento');
    unmount();
    montar();
    expect(within(linhas()[0]).getByTestId('extrato-situacao').textContent).toBe('sem par');
  });
  it('o rodapé preso: saldo final do extrato e o informado no arquivo, com a diferença em âmbar', () => {
    montar();
    expect(screen.getByTestId('extrato-saldo-final').textContent).toBe('735,00');
    expect(screen.getByTestId('extrato-informado').textContent).toBe('informado no arquivo 700,00 · difere R$ 35,00');
  });
});
