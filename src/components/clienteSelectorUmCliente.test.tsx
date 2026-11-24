// ACESSO-UM-CLIENTE-01 — o nome do cliente aparece SEMPRE: com um cliente só, o seletor fica travado (nome, sem lista); sem cliente, nada.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';

const ctx = vi.hoisted(() => ({ isAdmin: false, resumoClientes: false, setResumoClientes: vi.fn(), setClienteAtual: vi.fn(),
  clienteAtual: { id: 'c1', nome: 'Vera Exemplo Sintética' } as { id: string; nome: string } | null, clientes: [{ id: 'c1', nome: 'Vera Exemplo Sintética' }] }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ctx }));

import { ClienteSelector } from './ClienteSelector';

describe('ClienteSelector com um cliente só', () => {
  it('mostra o NOME travado (sem seletor), com o title dizendo que o acesso é a este cliente', () => {
    render(<ClienteSelector />);
    const travado = screen.getByTestId('cliente-travado');
    expect(travado.textContent).toContain('Vera Exemplo Sintética');
    expect(travado.getAttribute('title')).toBe('Vera Exemplo Sintética · o seu acesso é a este cliente');
    expect(screen.queryByRole('combobox')).toBeNull();
  });
  it('sem cliente nenhum, nada', () => {
    ctx.clienteAtual = null; ctx.clientes = [];
    const { container } = render(<ClienteSelector />);
    expect(container.innerHTML).toBe('');
  });
  it('o shell monta o seletor com UM cliente também (menu lateral e cabeçalho do celular)', () => {
    const v2 = readFileSync('src/v2/V2Index.tsx', 'utf8');
    expect(v2).toContain('const clienteSelector = clientes.length > 0 ? <ClienteSelector /> : undefined;');
    expect(v2).not.toContain('clientes.length > 1 && (');
  });
});
