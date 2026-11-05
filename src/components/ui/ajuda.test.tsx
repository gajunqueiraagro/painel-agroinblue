/**
 * A AJUDA ⓘ (regra do Gabriel, 05/11 10:31): na tela só o ícone; o texto no popover, em três partes — o que é · por que · como fazer.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Ajuda } from './ajuda';

describe('Ajuda', () => {
  it('fechada: só o ícone (com o rótulo acessível); aberta: o título e as três partes', () => {
    render(<Ajuda titulo="Livro caixa" oQueE="O livro do produtor." porQue="A Receita pede." comoFazer="Confira a marca." />);
    const icone = screen.getByTestId('ajuda');
    expect(icone.getAttribute('aria-label')).toBe('Ajuda: Livro caixa');
    expect(icone.textContent).toBe('i');
    expect(screen.queryByTestId('ajuda-texto')).toBeNull();
    fireEvent.click(icone);
    const texto = screen.getByTestId('ajuda-texto');
    expect([...texto.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['O que é', 'Por que', 'Como fazer']);
    expect([...texto.querySelectorAll('dd')].map((d) => d.textContent)).toEqual(['O livro do produtor.', 'A Receita pede.', 'Confira a marca.']);
    expect(texto.textContent).toContain('Livro caixa');
  });
});
