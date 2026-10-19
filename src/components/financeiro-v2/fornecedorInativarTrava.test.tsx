/**
 * FORN-INATIVAR-TRAVA-01 — inativar fornecedor com lançamento vivo ou recorrência ativa: a tela pergunta ao banco ANTES de gravar e
 * escreve a frase ao lado do botão (o tratamento de erro troca a mensagem do banco). Banco de mentira.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const gravacoes: unknown[] = [];
function cadeia() {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'not', 'or', 'order', 'range', 'in', 'is', 'limit', 'single', 'maybeSingle', 'insert', 'delete']) c[m] = () => c;
  c.update = (p: unknown) => { gravacoes.push(p); return c; };
  c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
  return c;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => cadeia(), rpc: async () => ({ data: null, error: null }) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());

import { FornecedorFormDialog, FRASE_FALHA_AO_CONFERIR_INATIVAR, type TravaDeInativar } from './FornecedorFormDialog';

const EDIT = { id: 'f1', nome: 'Fornecedor Alfa', cpf_cnpj: null, fazenda_id: null, ativo: true };
const FRASE = 'Este fornecedor tem 3 lançamentos e 1 recorrência ativa. Para tirá-lo de uso, mescle no cadastro certo (Cadastros › Fornecedores › Mesclar fornecedores).';

function montar(trava: (id: string) => Promise<TravaDeInativar | null>, ativoGravado = true) {
  const lerTrava = vi.fn(trava);
  const onSaved = vi.fn();
  render(<FornecedorFormDialog open onClose={() => {}} editing={{ ...EDIT, ativo: ativoGravado }} allFornecedores={[]} fazendas={[]} clienteId="cli"
    onSaved={onSaved} lerCadastro={async () => []} lerLinha={async () => ({ ...EDIT, ativo: ativoGravado })} lerUso={async () => null} lerTrava={lerTrava} />);
  return { lerTrava, onSaved };
}
const salvar = () => fireEvent.click(screen.getByRole('button', { name: /Salvar fornecedor/ }));

beforeEach(() => { gravacoes.length = 0; });

describe('inativar com lançamento vivo ou recorrência ativa', () => {
  it('recusado ANTES de gravar: a frase do banco fica escrita ao lado do botão, nada é gravado', async () => {
    const { lerTrava, onSaved } = montar(async () => ({ pode: false, frase: FRASE }));
    await screen.findByDisplayValue('Fornecedor Alfa');
    fireEvent.click(screen.getByRole('button', { name: 'Inativo' }));
    salvar();
    await waitFor(() => expect(screen.getByTestId('fornecedor-recado').textContent).toBe(FRASE));
    expect(lerTrava).toHaveBeenCalledWith('f1');
    expect(gravacoes).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('leitura que falha também não grava, e diz', async () => {
    montar(async () => null);
    await screen.findByDisplayValue('Fornecedor Alfa');
    fireEvent.click(screen.getByRole('button', { name: 'Inativo' }));
    salvar();
    await waitFor(() => expect(screen.getByTestId('fornecedor-recado').textContent).toBe(FRASE_FALHA_AO_CONFERIR_INATIVAR));
    expect(gravacoes).toHaveLength(0);
  });
  it('sem nada que segure: grava', async () => {
    const { onSaved } = montar(async () => ({ pode: true, frase: null }));
    await screen.findByDisplayValue('Fornecedor Alfa');
    fireEvent.click(screen.getByRole('button', { name: 'Inativo' }));
    salvar();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(gravacoes).toHaveLength(1);
  });
  it('salvar sem trocar para inativo (ou já inativo) não pergunta', async () => {
    const a = montar(async () => ({ pode: false, frase: FRASE }));
    await screen.findByDisplayValue('Fornecedor Alfa');
    salvar();
    await waitFor(() => expect(a.onSaved).toHaveBeenCalled());
    expect(a.lerTrava).not.toHaveBeenCalled();
  });
});
