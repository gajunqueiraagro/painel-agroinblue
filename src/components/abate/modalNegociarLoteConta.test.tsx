/**
 * FIN-VALOR-CALC-01b — o ensaio do caso do Gabriel (23/10 09h32): Negociar lote · Bois · 136 cab, Realizado, aba "Bônus, descontos e
 * impostos", preço base R$ 976.224,00 (R$ 360,00/@). Ele sabe o valor pago no acerto e digita no bônus "pago − 976.224".
 * Dado SINTÉTICO: 136 cab, carcaça 40.676 kg no lote → 2.711,7333 @ × R$ 360 = R$ 976.224,00.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ModalNegociarLote } from '@/components/abate/ModalNegociarLote';
import { linhaVazia, type LoteAbate } from '@/components/abate/calculoDoLote';
import type { LinhaAbate } from '@/hooks/useOperacaoAbate';

/** O elemento como input, sem cast: falha alto se não for. */
const comoInput = (el: Element | null | undefined): HTMLInputElement => { if (!(el instanceof HTMLInputElement)) throw new Error('não é input'); return el; };
const caixa = (el: Element | null): HTMLElement => { if (!(el instanceof HTMLElement)) throw new Error('sem caixa'); return el; };

const LOTE: LoteAbate = { id: 'l1', ordem: 1, categoria: 'bois', categoriaLabel: 'Bois', quantidade: 136, pesoMedioKg: 540 };
const LINHA: LinhaAbate = { ...linhaVazia('l1'), pesoCarcacaKg: 40676, pesoCarcacaFonte: 'total', precoArroba: 360, precoFonte: 'arroba' };

function montar() {
  const onAplicar = vi.fn();
  render(<ModalNegociarLote lote={LOTE} linha={LINHA} cenario="realizado" onAplicar={onAplicar} onFechar={vi.fn()} />);
  fireEvent.click(screen.getByText('Bônus, descontos e impostos'));
  return onAplicar;
}
const campoPorRotulo = (rotulo: string) => {
  const label = screen.getAllByText(rotulo).find(el => el.tagName === 'LABEL');
  return comoInput(label?.parentElement?.querySelector('input'));
};
/** O total de uma linha do Resultado do lote. */
const totalDaLinha = (rotulo: string) => {
  const td = screen.getAllByText(rotulo).find(el => el.tagName === 'TD')!;
  return (within(td.parentElement!).getAllByRole('cell')[1].textContent ?? '').replace(/\u00a0/g, ' ');   // o formatMoeda usa espaço inquebrável
};

describe('a conta no bônus do lote', () => {
  it('"988.224-976.224" no Precoce (R$) → R$ 12.000,00, e o Resultado do lote atualiza', () => {
    const onAplicar = montar();
    expect(totalDaLinha('Preço base')).toBe('R$ 976.224,00');
    const precoce = campoPorRotulo('Precoce');
    fireEvent.focus(precoce);
    fireEvent.change(precoce, { target: { value: '988.224' } });
    fireEvent.change(precoce, { target: { value: '988.224-976.224' } });
    expect(screen.getByTestId('conta-do-campo').textContent).toBe('= 12.000,00');
    fireEvent.keyDown(precoce, { key: 'Enter' });
    expect(precoce.value).toBe('12.000,00');
    expect(totalDaLinha('Bruto')).toBe('R$ 988.224,00');
    fireEvent.blur(precoce);
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar.mock.calls[0][0].bonusPrecoce).toEqual({ valor: 12000, fonte: 'reais' });
  });
  it('na unidade @ a conta vale para o número digitado em R$/@: "10-2" = R$ 8,00/@ × 2.711,7333 @', () => {
    montar();
    const precoce = campoPorRotulo('Precoce');
    fireEvent.click(within(caixa(precoce.closest('.flex.min-w-0.gap-1'))).getByText('@'));
    fireEvent.focus(precoce);
    fireEvent.change(precoce, { target: { value: '10-2' } });
    fireEvent.blur(precoce);
    expect(precoce.value).toBe('8,00');
    expect(totalDaLinha('Bruto')).toBe('R$ 997.917,87');
  });
  it('Esc com a conta aberta não fecha o modal e o Bruto não mudou', () => {
    montar();
    const precoce = campoPorRotulo('Precoce');
    fireEvent.focus(precoce);
    fireEvent.change(precoce, { target: { value: '5+' } });
    fireEvent.keyDown(precoce, { key: 'Escape' });
    expect(screen.getByText('Aplicar')).toBeInTheDocument();
    expect(precoce.value).toBe('');
    expect(totalDaLinha('Bruto')).toBe('R$ 976.224,00');
  });
});
