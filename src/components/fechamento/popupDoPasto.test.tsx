/**
 * POPUP-PASTO-01 — o popup do pasto (um componente para o Fechamento e o Geo pastos): faixas navy em cima e embaixo, o meio claro em
 * colunas (categoria · cab · kg). Dados SINTÉTICOS.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PopupDoPasto, type DadosDoPopupDoPasto } from './PopupDoPasto';

const P12: DadosDoPopupDoPasto = {
  nome: 'P_12', lote: 'Vacas CAR09', totalCab: 121, pesoMedioKg: 241.7, uaHa: 0.82,
  categorias: [{ sigla: 'MM', cab: 30, pesoMedioKg: 95 }, { sigla: 'MF', cab: 31, pesoMedioKg: null }, { sigla: 'V', cab: 60, pesoMedioKg: 410 }],
};

describe('PopupDoPasto', () => {
  it('cabeçalho navy: nome, lote e "121 cab · 241,7 kg" com os números em negrito', () => {
    render(<PopupDoPasto d={P12} />);
    const cab = screen.getByTestId('popup-do-pasto-cabecalho');
    expect(cab.className).toContain('bg-primary');
    expect(cab.textContent).toBe('P_12121 cab · 241,7 kgLote Vacas CAR09');
    expect([...cab.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['121', '241,7']);
  });
  it('o meio em colunas: categoria · cab · kg (sem peso = "—")', () => {
    render(<PopupDoPasto d={P12} />);
    const linhas = within(screen.getByTestId('popup-do-pasto-categorias')).getAllByRole('row').slice(1);
    expect(linhas.map((l) => [...l.querySelectorAll('td')].map((c) => c.textContent))).toEqual([['MM', '30', '95'], ['MF', '31', '—'], ['V', '60', '410']]);
  });
  it('rodapé navy: "Lotação 0,82 UA/ha" com o número grande em negrito', () => {
    render(<PopupDoPasto d={P12} />);
    const rod = screen.getByTestId('popup-do-pasto-rodape');
    expect(rod.className).toContain('bg-primary');
    expect(rod.textContent).toBe('Lotação0,82 UA/ha');
    expect(rod.querySelector('b')?.className).toContain('text-[14px]');
  });
  it('sem gado: só o cabeçalho, com "—" e o lote "—"; quem só recebe o lote mostra a origem no rodapé', () => {
    const { unmount } = render(<PopupDoPasto d={{ ...P12, lote: null, totalCab: 0, pesoMedioKg: null, categorias: [], uaHa: null }} />);
    expect(screen.getByTestId('popup-do-pasto-cabecalho').textContent).toBe('P_12—Lote —');
    expect(screen.queryByTestId('popup-do-pasto-categorias')).toBeNull();
    expect(screen.queryByTestId('popup-do-pasto-rodape')).toBeNull();
    unmount();
    render(<PopupDoPasto d={{ ...P12, totalCab: 0, categorias: [], uaHa: 1.1, recebeDe: ['P_11'] }} />);
    expect(screen.getByTestId('popup-do-pasto-rodape').textContent).toBe('Recebe o lote do P_111,10 UA/ha');
  });
});
