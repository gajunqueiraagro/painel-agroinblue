/**
 * O que este teste trava — o combobox com `persistKey` não esquece o que foi digitado.
 *
 * ⚠ O DEFEITO ERA DE PACIÊNCIA, NÃO DE DADO: com 3.361 fornecedores e seis "Wilson",
 * achar o certo custava seis reaberturas, e cada reabertura chegava com a caixa
 * vazia. O componente zerava a busca em CINCO lugares diferentes (clique fora,
 * Esc, Tab, escolher um item, e o X) — quatro deles agora preservam.
 *
 * ⚠ E O CASO SEM `persistKey` É METADE DO TESTE: existem outras 24 montagens do
 * SearchableSelect no app (26 no total, contadas em 11 arquivos), e nenhuma pediu
 * memória. Se elas mudarem junto, o PR deixou de ser aditivo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchableSelect, limparBuscasLembradas } from '@/components/ui/searchable-select';

const OPCOES = [
  { value: 'a', label: 'Wilson Zaplana', hint: '41' },
  { value: 'b', label: 'Wilson Zaplana; Gasto Recorrente - Mês Fev/2026' },
  { value: 'c', label: 'Outro Fulano' },
];

function montar(persistKey?: string) {
  const onValueChange = vi.fn();
  const r = render(
    <SearchableSelect value="__all__" onValueChange={onValueChange} options={OPCOES} persistKey={persistKey} />,
  );
  return { onValueChange, ...r };
}

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Todos/i }));
const caixa = () => screen.getByPlaceholderText('Buscar...');

beforeEach(() => {
  sessionStorage.clear();
  /* jsdom não implementa `scrollIntoView`, e o componente o chama ao mover o
     destaque da lista. É buraco do ambiente, não do código — sem o stub o teste
     acusaria um defeito que não existe no navegador. */
  Element.prototype.scrollIntoView = () => {};
});

describe('SearchableSelect — memória da busca', () => {
  it('com persistKey: escolher um item NÃO esquece a busca', () => {
    const { unmount } = montar('teste');
    abrir();
    fireEvent.change(caixa(), { target: { value: 'wilson' } });
    fireEvent.click(screen.getByText('Wilson Zaplana'));
    unmount();

    montar('teste');
    abrir();
    expect(caixa()).toHaveValue('wilson');
    /* A lista volta filtrada, não inteira: é isso que poupa a redigitação. */
    expect(screen.queryByText('Outro Fulano')).not.toBeInTheDocument();
  });

  it('com persistKey: Escape não esquece', () => {
    const { unmount } = montar('teste');
    abrir();
    fireEvent.change(caixa(), { target: { value: 'zap' } });
    fireEvent.keyDown(caixa(), { key: 'Escape' });
    unmount();

    montar('teste');
    abrir();
    expect(caixa()).toHaveValue('zap');
  });

  it('o X esquece — sempre', () => {
    sessionStorage.setItem('ss-busca:teste', 'wilson');
    const onValueChange = vi.fn();
    render(<SearchableSelect value="a" onValueChange={onValueChange} options={OPCOES} persistKey="teste" />);
    /* O X só existe quando há valor escolhido; é o irmão do "Limpar" da tela. */
    const x = document.querySelector('.cursor-pointer.hover\\:text-destructive');
    fireEvent.click(x!);
    expect(sessionStorage.getItem('ss-busca:teste')).toBeNull();
  });

  it('limparBuscasLembradas apaga por prefixo e não toca no resto da sessão', () => {
    sessionStorage.setItem('ss-busca:fin-v2-fornecedor', 'wilson');
    sessionStorage.setItem('ss-busca:outra-tela', 'x');
    sessionStorage.setItem('financeiro_v2_state', '{}');
    limparBuscasLembradas('fin-v2-fornecedor');
    expect(sessionStorage.getItem('ss-busca:fin-v2-fornecedor')).toBeNull();
    expect(sessionStorage.getItem('ss-busca:outra-tela')).toBe('x');
    expect(sessionStorage.getItem('financeiro_v2_state')).toBe('{}');
  });

  it('SEM persistKey: nada muda — escolher continua esquecendo', () => {
    const { unmount } = montar();
    abrir();
    fireEvent.change(caixa(), { target: { value: 'wilson' } });
    fireEvent.click(screen.getByText('Wilson Zaplana'));
    unmount();

    montar();
    abrir();
    expect(caixa()).toHaveValue('');
    expect(sessionStorage.length).toBe(0);
  });

  it('o hint aparece ao lado do nome e não entra na busca', () => {
    montar('teste');
    abrir();
    expect(screen.getByText('· 41')).toBeInTheDocument();
    /* Digitar a contagem não pode achar o fornecedor: o operador busca por nome. */
    fireEvent.change(caixa(), { target: { value: '41' } });
    expect(screen.queryByText('Wilson Zaplana')).not.toBeInTheDocument();
  });
});
