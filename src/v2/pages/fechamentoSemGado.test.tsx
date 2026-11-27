/**
 * REBANHO-SEM-GADO-01 — a faixa "Rebanho N/M" e o modal "Fechamento do rebanho — todas as fazendas" da Visão geral MONTADOS: a fazenda
 * sem rebanho no mês (o banco devolve os 2 pilares 'nao_aplicavel', a Faz. São João) não aparece nem conta; a que tem gado continua.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StatusFechamentoBanda } from './V2Home';

describe('a faixa e o modal do fechamento do rebanho', () => {
  it('a São João (sem pasto e sem gado) não aparece nem conta; a Sta. Rita pendente continua', () => {
    render(<StatusFechamentoBanda isGlobal loading={false} mesLabel="out/2026" status={[
      { fazendaId: 'sr', nome: 'Faz. Sta. Rita', p1: 'oficial', p2: 'pendente' },
      { fazendaId: 'sj', nome: 'Faz. São João', p1: 'nao_aplicavel', p2: 'nao_aplicavel' },
      { fazendaId: 'sl', nome: 'Faz. Sta. Luzia', p1: 'oficial', p2: 'nao_aplicavel' },
    ]} />);
    const faixa = screen.getByRole('button', { name: /^Rebanho/ });
    expect(faixa.textContent).toBe('Rebanho 1/2');
    fireEvent.click(faixa);
    expect(screen.getByText('Faz. Sta. Rita')).toBeTruthy();
    expect(screen.getByText('Faz. Sta. Luzia')).toBeTruthy();
    expect(screen.queryByText('Faz. São João')).toBeNull();
  });
  it('só fazendas sem rebanho no mês: a faixa não aparece', () => {
    const { container } = render(<StatusFechamentoBanda isGlobal loading={false} mesLabel="out/2026"
      status={[{ fazendaId: 'sj', nome: 'Faz. São João', p1: 'nao_aplicavel', p2: 'nao_aplicavel' }]} />);
    expect(container.textContent).toBe('');
  });
});
