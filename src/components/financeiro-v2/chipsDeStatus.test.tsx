/**
 * P79 — as pílulas de status compartilhadas (CPR e Visão Geral).
 *   C1 na CPR o DOM é o de antes do P79: div.cpr-status com 4 botões, sem title nem testid próprio, as classes de sempre
 *   C2 ligar/desligar troca a cor e o aria-pressed; o rótulo (e a largura) não muda
 *   C3 o padrão das duas telas é o da CPR: previsto, programado, agendado
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChipsDeStatus, STATUS_DISPONIVEIS, STATUS_INICIAIS, alternarNaLista, pilulasDosStatus } from './ChipsDeStatus';

/* o HTML que a CPR desenhava antes do P79 (copiado da tela publicada), com 'previsto' ligado e 'realizado' desligado */
const BOTAO_CPR = (rotulo: string, ligado: boolean) => `<button type="button" aria-pressed="${ligado}" class="rounded-md border font-medium transition-colors h-[22px] px-2 text-[10px] ${
  ligado ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-muted-foreground hover:bg-muted'}">${rotulo}</button>`;

describe('ChipsDeStatus', () => {
  it('C1 na CPR, o mesmo HTML de antes', () => {
    const { container } = render(<ChipsDeStatus pilulas={pilulasDosStatus(STATUS_DISPONIVEIS)} ligados={['previsto', 'programado', 'agendado']} onAlternar={vi.fn()} />);
    expect(container.innerHTML).toBe(`<div class="flex shrink-0 items-center gap-1" data-testid="cpr-status">${
      BOTAO_CPR('Previsto', true)}${BOTAO_CPR('Programado', true)}${BOTAO_CPR('Agendado', true)}${BOTAO_CPR('Realizado', false)}</div>`);
  });

  it('C2 alternar muda a cor e o aria-pressed, nunca o rótulo', () => {
    const onAlternar = vi.fn();
    const { rerender } = render(<ChipsDeStatus testId="vg-status" pilulas={[...pilulasDosStatus(STATUS_INICIAIS), { chave: 'vencidos', rotulo: 'Vencidos' }]}
      ligados={['previsto', 'vencidos']} onAlternar={onAlternar} />);
    fireEvent.click(screen.getByTestId('vg-status-vencidos'));
    expect(onAlternar).toHaveBeenCalledWith('vencidos');
    rerender(<ChipsDeStatus testId="vg-status" pilulas={[...pilulasDosStatus(STATUS_INICIAIS), { chave: 'vencidos', rotulo: 'Vencidos' }]}
      ligados={['previsto']} onAlternar={onAlternar} />);
    const b = screen.getByTestId('vg-status-vencidos');
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.textContent).toBe('Vencidos');
    expect(b.className).toContain('text-muted-foreground');
    expect(alternarNaLista(['a', 'b'], 'a')).toEqual(['b']);
    expect(alternarNaLista(['b'], 'a')).toEqual(['b', 'a']);
  });

  it('C3 o padrão é o da CPR', () => {
    expect(STATUS_INICIAIS).toEqual(['previsto', 'programado', 'agendado']);
    expect([...STATUS_DISPONIVEIS]).toEqual(['previsto', 'programado', 'agendado', 'realizado']);
  });

});
