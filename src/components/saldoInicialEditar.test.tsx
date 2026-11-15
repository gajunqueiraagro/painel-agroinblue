/**
 * REBANHO-INICIAL-EDITAR-01 (Chat 12/11 15:15) — o Editar do rebanho inicial grava SEMPRE no janeiro de partida.
 * O caso real (Vera · Faz Baia Grande): partida jan/2024 = 609 cab com preço; jan/2025 = 842 e jan/2026 = 1.012 são do
 * fechamento de dezembro. O formulário nascia com a lista vazia, guardava o ano de HOJE e o Salvar gravava em jan/2026.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SaldoInicial } from '@/types/cattle';
import { SaldoInicialForm } from './SaldoInicialForm';
import { anosDoFechamento, mudancasDoSaldo, periodoDoFormulario } from '@/lib/rebanho/saldoInicialEditar';

const BG: SaldoInicial[] = [
  { ano: 2024, mes: 1, categoria: 'vacas', quantidade: 313, pesoMedioKg: 468.31, precoKg: 11 },
  { ano: 2024, mes: 1, categoria: 'novilhas', quantidade: 296, pesoMedioKg: 380, precoKg: 12 },
  { ano: 2025, mes: 1, categoria: 'vacas', quantidade: 400, pesoMedioKg: 470 },
  { ano: 2025, mes: 1, categoria: 'novilhas', quantidade: 442, pesoMedioKg: 390 },
  { ano: 2026, mes: 1, categoria: 'vacas', quantidade: 313, pesoMedioKg: 468.31 },
  { ano: 2026, mes: 1, categoria: 'novilhas', quantidade: 699, pesoMedioKg: 450 },
];

describe('a regra (lib)', () => {
  it('com saldo cadastrado, o período é a partida — o ano guardado não manda', () => {
    expect(periodoDoFormulario(BG, '2026')).toEqual({ ano: 2024, mes: 1 });
    expect(periodoDoFormulario(BG, '')).toEqual({ ano: 2024, mes: 1 });
  });
  it('sem saldo, vale o ano escolhido (o 1º cadastro define a partida)', () => {
    expect(periodoDoFormulario([], '2023')).toEqual({ ano: 2023, mes: 1 });
  });
  it('os janeiros seguintes são os do fechamento', () => {
    expect(anosDoFechamento(BG)).toEqual([2025, 2026]);
  });
  it('a prévia lista só o que muda, antes × depois', () => {
    const m = mudancasDoSaldo(BG, { ano: 2024, mes: 1 }, {
      vacas: { quantidade: 314, pesoMedioKg: 468.31, precoKg: 11 },
      novilhas: { quantidade: 296, pesoMedioKg: 380, precoKg: 12 },
    }, ['vacas', 'novilhas']);
    expect(m).toEqual([{ categoria: 'vacas', campo: 'Cabeças', antes: 313, depois: 314 }]);
  });
});

describe('a tela', () => {
  it('a lista chega DEPOIS do 1º render: o Editar abre e grava em jan/2024, nunca no janeiro do fechamento', async () => {
    const onSetSaldo = vi.fn();
    const { rerender } = render(<SaldoInicialForm saldosIniciais={[]} onSetSaldo={onSetSaldo} alwaysVisible />);
    rerender(<SaldoInicialForm saldosIniciais={BG} onSetSaldo={onSetSaldo} alwaysVisible />);

    fireEvent.click(screen.getByText('Editar'));
    expect(screen.getByText('Editar Saldo Inicial — Jan/2024')).toBeTruthy();
    expect(screen.getByText('Rebanho em Jan/2024:')).toBeTruthy();
    expect(screen.getByText(/Os janeiros de 2025, 2026 vêm do fechamento de dezembro/)).toBeTruthy();
    expect(screen.getByDisplayValue('313')).toBeTruthy();
    expect(screen.getByDisplayValue('296')).toBeTruthy();
    expect(screen.queryByDisplayValue('699')).toBeNull();

    fireEvent.change(screen.getByDisplayValue('313'), { target: { value: '314' } });
    fireEvent.click(screen.getByText('Salvar Saldo Inicial'));
    // prévia: nada gravado ainda
    expect(onSetSaldo).not.toHaveBeenCalled();
    expect(screen.getByText('Conferir antes de gravar — Jan/2024')).toBeTruthy();
    expect(screen.getByText('314')).toBeTruthy();

    fireEvent.click(screen.getByText('Confirmar e gravar'));
    await vi.waitFor(() => expect(onSetSaldo).toHaveBeenCalled());
    for (const chamada of onSetSaldo.mock.calls) {
      expect(chamada[0]).toBe(2024);
      expect(chamada[1]).toBe(1);
    }
  });

  it('nada mudou: a prévia diz e o gravar fica desligado; Cancelar existe', () => {
    const onSetSaldo = vi.fn();
    render(<SaldoInicialForm saldosIniciais={BG} onSetSaldo={onSetSaldo} alwaysVisible />);
    fireEvent.click(screen.getByText('Editar'));
    expect(screen.getByText('Cancelar')).toBeTruthy();
    fireEvent.click(screen.getByText('Salvar Saldo Inicial'));
    expect(screen.getByText('Nada a gravar: o saldo inicial já está assim.')).toBeTruthy();
    expect(screen.getByText('Confirmar e gravar').closest('button')?.hasAttribute('disabled')).toBe(true);
  });
});
