/**
 * OC-CORRECOES-01 C2 · OC-CC-GESTOS-LEGADO-01 — os gestos do titulo da conta corrente (cancelar, desvincular, parcelar), o legado sem
 * compromisso incluido. A regra das parcelas e' pura (`gestoNoTitulo`); o dialogo so' grava com motivo e soma ao centavo; a frase do
 * banco fica no dialogo. O banco foi provado em `supabase/tests/oc_recebimento_gestos_01_test.sql`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { divisaoInicial, motivoParcelasInvalidas, somaDasParcelas } from '@/lib/oc/gestoNoTitulo';
import { DialogoGestoNoTitulo } from './DialogoGestoNoTitulo';

const TITULO = { lancamentoId: 'L-375', descricao: 'Venda 118 Vacas - 2/2', valor: 375000, vencimento: '2026-07-30' };

describe('a conta das parcelas', () => {
  it('divide igual ao centavo (o resto na ultima) e a soma bate', () => {
    expect(divisaoInicial(100, 3, '2026-07-30').map(p => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(somaDasParcelas(divisaoInicial(375000, 2, '2026-07-30'))).toBe(375000);
  });
  it('recusa com o porque: menos de duas, valor zero, sem vencimento, soma que nao bate (falta/sobra)', () => {
    expect(motivoParcelasInvalidas([{ valor: 375000, vencimento: 'x' }], 375000)).toBe('Informe ao menos duas parcelas.');
    expect(motivoParcelasInvalidas([{ valor: 0, vencimento: 'x' }, { valor: 1, vencimento: 'x' }], 1)).toMatch(/maior que zero/);
    expect(motivoParcelasInvalidas([{ valor: 1, vencimento: '' }, { valor: 1, vencimento: 'x' }], 2)).toMatch(/vencimento/);
    expect(motivoParcelasInvalidas([{ valor: 290000, vencimento: 'x' }, { valor: 80000, vencimento: 'x' }], 375000))
      .toBe('A soma das parcelas difere do título em R$ 5.000,00 (falta).');
    expect(motivoParcelasInvalidas([{ valor: 290000, vencimento: 'x' }, { valor: 85000, vencimento: 'x' }], 375000)).toBeNull();
  });
});

describe('o dialogo', () => {
  it('parcelar: nasce em 2 iguais; sem motivo nao grava; com motivo grava as parcelas', async () => {
    const gravar = vi.fn(async () => null);
    const fechar = vi.fn();
    render(<DialogoGestoNoTitulo gesto="parcelar" titulo={TITULO} nomeDinheiro="recebimento" onConfirmar={gravar} onFechar={fechar} />);
    expect(screen.getAllByTestId('parcela-do-gesto')).toHaveLength(2);
    expect(screen.getByTestId('soma-parcelas').textContent).toMatch(/375\.000,00 de .*375\.000,00/);
    fireEvent.click(screen.getByTestId('confirmar-gesto'));
    expect(gravar).not.toHaveBeenCalled();
    expect(screen.getByTestId('aviso-gesto').textContent).toBe('Informe o motivo.');
    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'Pix em duas datas' } });
    fireEvent.click(screen.getByTestId('confirmar-gesto'));
    await waitFor(() => expect(gravar).toHaveBeenCalledWith('Pix em duas datas', [
      { valor: 187500, vencimento: '2026-07-30' }, { valor: 187500, vencimento: '2026-07-30' }]));
    await waitFor(() => expect(fechar).toHaveBeenCalled());
  });

  it('parcelar: com uma parcela a mais e vazia, a soma nao bate e nada grava', () => {
    const gravar = vi.fn(async () => null);
    render(<DialogoGestoNoTitulo gesto="parcelar" titulo={TITULO} nomeDinheiro="recebimento" onConfirmar={gravar} onFechar={() => {}} />);
    fireEvent.click(screen.getByTestId('mais-parcela'));
    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('confirmar-gesto'));
    expect(gravar).not.toHaveBeenCalled();
    expect(screen.getByTestId('aviso-gesto').textContent).toMatch(/maior que zero/);
  });

  it('cancelar e desvincular: sem parcelas; a frase do banco fica no dialogo (nada fecha)', async () => {
    const gravar = vi.fn(async () => 'Conciliado com o extrato: desfaça a conciliação na Conferência (Financeiro › Conciliação) primeiro. Nada foi gravado.');
    const fechar = vi.fn();
    render(<DialogoGestoNoTitulo gesto="cancelar" titulo={TITULO} nomeDinheiro="recebimento" onConfirmar={gravar} onFechar={fechar} />);
    expect(screen.queryByTestId('parcelas-do-gesto')).toBeNull();
    fireEvent.change(screen.getByLabelText('Motivo *'), { target: { value: 'refeito' } });
    fireEvent.click(screen.getByTestId('confirmar-gesto'));
    await waitFor(() => expect(gravar).toHaveBeenCalledWith('refeito', null));
    expect((await screen.findByTestId('erro-gesto')).textContent).toMatch(/desfaça a conciliação na Conferência/);
    expect(fechar).not.toHaveBeenCalled();
    const d = render(<DialogoGestoNoTitulo gesto="desvincular" titulo={TITULO} nomeDinheiro="recebimento" onConfirmar={vi.fn(async () => null)} onFechar={() => {}} />);
    expect(within(d.container.ownerDocument.body).getAllByText(/volta a ser avulso/).length).toBeGreaterThan(0);
  });
});
