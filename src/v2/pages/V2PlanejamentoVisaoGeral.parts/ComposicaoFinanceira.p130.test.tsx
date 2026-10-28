/**
 * P130 — a tabela de Entradas da VG Planejamento (e do Fechamento) mostra a linha "Receita Silvicultura", entre a Receita Agricultura
 * e as Outras Receitas, e o clique abre o modal dela.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ComposicaoFinanceira } from './ComposicaoFinanceira';
import { buildBlocoResumoExecutivo } from '@/v2/lib/buildBlocoResumoExecutivo';

const data = buildBlocoResumoExecutivo({
  lancFin2025: [],
  saldoInicialMeta: 0,
  gridMeta2026: [
    { macro_custo: 'Receita Operacional', grupo_custo: 'Receita Silvícola', centro_custo: 'Arrendamento', subcentro: 'Arrendamento Florestal',
      escopo_negocio: 'silvicultura', ordem_exibicao: 0, meses: new Array(12).fill(100) },
  ],
});

describe('P130 — a linha Receita Silvicultura na tabela de Entradas', () => {
  const modos: Array<'planejamento' | 'fechamento'> = ['planejamento', 'fechamento'];
  for (const modo of modos) {
    it(`${modo}: aparece entre a Receita Agricultura e as Outras Receitas e abre o modal dela`, () => {
      const onLinhaClick = vi.fn();
      render(<ComposicaoFinanceira data={data} modo={modo} onLinhaClick={onLinhaClick} />);
      const rotulos = screen.getAllByText(/^(Receita Agricultura|Receita Silvicultura|Outras Receitas)$/).map((e) => e.textContent);
      expect(rotulos).toEqual(['Receita Agricultura', 'Receita Silvicultura', 'Outras Receitas']);
      fireEvent.click(screen.getByText('Receita Silvicultura'));
      expect(onLinhaClick).toHaveBeenCalledWith('receitaSilvicultura');
    });
  }
});
