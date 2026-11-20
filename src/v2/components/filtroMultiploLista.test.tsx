/** PROD-LANC-FILTROS-01 (Gabriel 19/11) — o padrão ÚNICO de seleção múltipla: lista vertical de largura fixa, uma opção por linha, altura
 *  máxima com rolagem por dentro, busca no topo acima de 8 opções, "Todas · Nenhuma", contagem por opção. */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FiltroMultiplo } from './FiltroMultiplo';

const R = { todos: 'Categorias', um: 'categoria', varios: 'categorias' };
const NOVE = ['Mamotes M', 'Desmama M', 'Garrotes', 'Bois', 'Touros', 'Mamotes F', 'Desmama F', 'Novilhas', 'Vacas']
  .map((l, i) => ({ value: `c${i}`, label: l, contagem: i }));
const abrir = () => { fireEvent.click(screen.getByTestId('filtro-multiplo')); return screen.getByTestId('filtro-multiplo-lista'); };

describe('a lista do filtro', () => {
  it('lista vertical de 220px, uma opção por linha (24px), altura máxima com rolagem; contagem à direita', () => {
    render(<FiltroMultiplo opcoes={NOVE} selecionadas={[]} onChange={vi.fn()} rotulo={R} />);
    const lista = abrir();
    expect(lista.className).toContain('w-[220px]');
    const linhas = lista.querySelectorAll('[data-opcao]');
    expect(linhas).toHaveLength(9);
    for (const l of linhas) expect(l.className).toContain('h-6');
    expect(lista.querySelector('[role="listbox"]')?.className).toMatch(/max-h-\[216px\].*overflow-y-auto/);
    expect(linhas[3].textContent).toBe('Bois3');
  });
  it('busca no topo só acima de 8 opções, sem acento', () => {
    const { unmount } = render(<FiltroMultiplo opcoes={NOVE.slice(0, 8)} selecionadas={[]} onChange={vi.fn()} rotulo={R} />);
    expect(abrir().querySelector('[data-testid="filtro-multiplo-busca"]')).toBeNull();
    unmount();
    render(<FiltroMultiplo opcoes={NOVE} selecionadas={[]} onChange={vi.fn()} rotulo={R} />);
    fireEvent.change(abrir().querySelector('[data-testid="filtro-multiplo-busca"]') ?? document.body, { target: { value: 'NOVILHA' } });
    expect([...screen.getByTestId('filtro-multiplo-lista').querySelectorAll('[data-opcao]')].map((x) => x.textContent)).toEqual(['Novilhas7']);
  });
  it('"Nenhuma" desmarca tudo na lista e o próximo clique escolhe só aquela; "Todas" volta ao vazio', () => {
    const onChange = vi.fn();
    render(<FiltroMultiplo opcoes={NOVE} selecionadas={[]} onChange={onChange} rotulo={R} />);
    const lista = abrir();
    fireEvent.click(screen.getByText('Nenhuma'));
    expect(lista.querySelectorAll('[data-state="checked"]')).toHaveLength(0);
    fireEvent.click(lista.querySelector('[data-opcao="c3"] button') ?? lista);
    expect(onChange).toHaveBeenLastCalledWith(['c3']);
    fireEvent.click(screen.getByText('Todas'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
  it('o botão diz "Categorias · 2 de 9" numa linha só (o texto inteiro no title)', () => {
    render(<FiltroMultiplo opcoes={NOVE} selecionadas={['c1', 'c2']} onChange={vi.fn()} rotulo={R} />);
    const b = screen.getByTestId('filtro-multiplo');
    expect(b.textContent).toBe('Categorias · 2 de 9');
    expect(b.getAttribute('title')).toBe('Categorias · 2 de 9');
    expect(b.querySelector('span')?.className).toContain('truncate');
  });
});
