/**
 * MAPA-AREA-TIPOS-02 (D5) — o GRUPO no seletor da casa: cabeçalho uma vez por grupo, não escolhível; a busca acha pelo nome do grupo;
 * SEM grupo nas opções a lista é a de sempre (as outras montagens não mudam).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchableSelect } from './searchable-select';

const COM_GRUPO = [
  { value: 'a', label: 'Armazém', grupo: 'Estruturas' }, { value: 's', label: 'Silo', grupo: 'Estruturas' },
  { value: 'l', label: 'Lagoa', grupo: 'Água' },
];

beforeEach(() => { Element.prototype.scrollIntoView = () => {}; });

/* o seletor como FILTRO (com "Todos" no gatilho), igual aos outros testes do componente */
async function abrir(options: { value: string; label: string; grupo?: string }[], onValueChange = vi.fn()) {
  render(<SearchableSelect value="__all__" onValueChange={onValueChange} options={options} placeholder="Escolha" />);
  fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
  await screen.findByPlaceholderText('Escolha');
  return onValueChange;
}

describe('SearchableSelect com grupo', () => {
  it('um cabeçalho por grupo, antes da 1ª opção dele; o cabeçalho não é botão', async () => {
    await abrir(COM_GRUPO);
    const cabecalhos = document.querySelectorAll('[data-grupo]');
    expect([...cabecalhos].map(c => c.textContent)).toEqual(['Estruturas', 'Água']);
    expect(screen.queryByRole('button', { name: 'Estruturas' })).toBeNull();
  });
  it('a busca pelo nome do grupo acha as opções dele', async () => {
    await abrir(COM_GRUPO);
    fireEvent.change(screen.getByPlaceholderText('Escolha'), { target: { value: 'agua' } });
    expect(screen.getByText('Lagoa')).toBeTruthy();
    expect(screen.queryByText('Silo')).toBeNull();
  });
  it('sem grupo: nenhum cabeçalho (a lista de sempre)', async () => {
    await abrir([{ value: 'a', label: 'Armazém' }, { value: 'l', label: 'Lagoa' }]);
    expect(document.querySelectorAll('[data-grupo]')).toHaveLength(0);
  });
});
