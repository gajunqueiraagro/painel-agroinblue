/** PROD-LANC-FILTROS-01 (Gabriel 19/11) — o "Personalizado…" da fita de meses abre o SeletorDePeriodo do DRE (o ÚNICO seletor de período
 *  personalizado do produto): o mesmo painel (2 calendários + atalhos + Cancelar/Aplicar), por MÊS; a conversão mês ↔ data na borda. */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/hooks/useSafrasDoCliente', () => ({ useSafrasDoCliente: () => ({ safras: [], carregando: false }) }));
const { SeletorPeriodo } = await import('./SeletorPeriodo');
const { intervaloDoPeriodo, periodoDoIntervalo } = await import('@/v2/lib/periodo');

describe('a conversão mês ↔ data', () => {
  it('meses → do 1º dia ao último (fevereiro e ano bissexto inclusive); de volta, os meses que as datas tocam', () => {
    expect(intervaloDoPeriodo({ de: { ano: 2026, mes: 2 }, ate: { ano: 2026, mes: 2 } })).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    expect(intervaloDoPeriodo({ de: { ano: 2028, mes: 2 }, ate: { ano: 2028, mes: 2 } })).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
    expect(intervaloDoPeriodo({ de: { ano: 2026, mes: 11 }, ate: { ano: 2025, mes: 10 } })).toEqual({ de: '2025-10-01', ate: '2026-11-30' });
    expect(periodoDoIntervalo({ de: '2025-10-15', ate: '2026-03-02' })).toEqual({ de: { ano: 2025, mes: 10 }, ate: { ano: 2026, mes: 3 } });
    expect(periodoDoIntervalo({ de: 'x', ate: '2026-03-02' })).toBeNull();
  });
});

describe('o "Personalizado…" da fita', () => {
  it('só monta o seletor no clique; abre o painel do DRE; "Este ano" + Aplicar devolve os meses à fita', () => {
    const onPeriodoChange = vi.fn();
    render(<SeletorPeriodo anos={['2025', '2026']} periodo={{ de: { ano: 2026, mes: 3 }, ate: { ano: 2026, mes: 3 } }} onPeriodoChange={onPeriodoChange} />);
    expect(screen.queryByTestId('periodo-personalizado-popup')).toBeNull();
    fireEvent.click(screen.getByTestId('periodo-personalizado-gatilho'));
    const popup = screen.getByTestId('periodo-personalizado-popup');
    expect(popup.querySelectorAll('[data-atalho]').length).toBeGreaterThan(2);
    fireEvent.click(popup.querySelector('[data-atalho="este-ano"]') ?? popup);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    const ano = new Date().getFullYear();
    expect(onPeriodoChange).toHaveBeenCalledWith({ de: { ano, mes: 1 }, ate: { ano, mes: 12 } });
    expect(screen.queryByTestId('periodo-personalizado-popup')).toBeNull();
  });
});
