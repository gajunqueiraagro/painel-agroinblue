/**
 * P31 — FORN-CNPJ-RECEITA-02 no cadastro completo: a consulta do CNPJ com a razão social e a fantasia JÁ escritas e diferentes — a
 * Receita é OFERECIDA no campo ("Receita: … · Usar"), nunca escrita por cima; "Usar" põe o valor da Receita e o Salvar o grava.
 * A resposta da BrasilAPI é GRAVADA (sintética, o formato medido em 23/10); nada chama a rede.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RESPOSTA_COM_FANTASIA } from '@/lib/fornecedores/__fixtures__/respostasDaReceita';

/* ── banco de mentira: grava o que o UPDATE/INSERT recebeu; qualquer leitura devolve vazio ── */
const gravados: Array<{ tabela: string; op: string; payload: unknown }> = [];
function cadeia(tabela: string) {
  const resposta = { data: [], error: null, count: 0 };
  const c: Record<string, unknown> = {};
  const devolve = () => c;
  for (const m of ['select', 'eq', 'neq', 'not', 'or', 'order', 'range', 'in', 'is', 'limit', 'single', 'maybeSingle']) c[m] = devolve;
  c.update = (payload: unknown) => { gravados.push({ tabela, op: 'update', payload }); return c; };
  c.insert = (payload: unknown) => { gravados.push({ tabela, op: 'insert', payload }); return c; };
  c.delete = devolve;
  c.then = (ok: (r: unknown) => unknown) => Promise.resolve(resposta).then(ok);
  return c;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => cadeia(t), rpc: async () => ({ data: null, error: null }) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/hooks/useFornecedoresDoCliente', async () => (await import('@/test/leitorDeFornecedoresFake')).moduloDoLeitorFake());
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendas: [{ id: 'faz1', nome: 'Faz Um' }] }) }));

import { FornecedorFormDialog } from './FornecedorFormDialog';
import type { FornecedorParaConferir } from '@/lib/fornecedores/repetidosDoCadastro';

const base = { fazenda_id: null, ativo: true };
const EDITANDO = { id: 'f1', nome: 'Omega Materiais', nome_fantasia: 'Loja do Omega', cpf_cnpj: null, ...base };

function montar(opcoes: { editing?: typeof EDITANDO | null; cadastro?: FornecedorParaConferir[] } = {}) {
  const lerCadastro = vi.fn(async () => opcoes.cadastro ?? []);
  const onSaved = vi.fn();
  const onMesclar = vi.fn();
  render(
    <FornecedorFormDialog open onClose={() => {}} editing={opcoes.editing === undefined ? EDITANDO : opcoes.editing}
      allFornecedores={[]} fazendas={[]} clienteId="cli" onSaved={onSaved} lerCadastro={lerCadastro} onMesclar={onMesclar} />,
  );
  return { lerCadastro, onSaved, onMesclar };
}
const campoDoc = () => screen.getByPlaceholderText('000.000.000-00 ou 00.000.000/0000-00');
/* FORN-CADASTRO-02: o botão é "Salvar fornecedor" e só acende depois de a linha inteira ser lida (na edição) */
const botaoSalvar = () => screen.getByRole('button', { name: /^(Salvar fornecedor|Salvar mesmo assim)$/ });
const pronto = () => waitFor(() => expect(botaoSalvar()).toBeEnabled());
const ultimoPayload = (): Record<string, unknown> => { const p: unknown = gravados.filter((g) => g.tabela === 'financeiro_fornecedores').at(-1)?.payload; return p && typeof p === 'object' ? Object.fromEntries(Object.entries(p)) : {}; };


const fetchAntes = globalThis.fetch;
beforeEach(() => {
  gravados.length = 0;
  globalThis.fetch = async (entrada: RequestInfo | URL): Promise<Response> => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    return /brasilapi/.test(url) ? new Response(JSON.stringify(RESPOSTA_COM_FANTASIA), { status: 200 }) : new Response('{}', { status: 503 });
  };
});
afterEach(() => { globalThis.fetch = fetchAntes; });

describe('P31 — a Receita oferecida, nunca por cima', () => {
  it('razão social e fantasia escritas e DIFERENTES: o campo fica; a oferta aparece; "Usar" põe a da Receita; o Salvar a grava', async () => {
    montar();
    await pronto();
    const valor = (id: string) => { const i = screen.getByTestId(id); return i instanceof HTMLInputElement ? i.value : null; };
    const razao = () => ({ value: valor('campo-razao-social') });
    const fantasia = () => ({ value: valor('campo-fantasia') });
    await waitFor(() => expect(razao().value).toBe('Omega Materiais'));
    fireEvent.change(campoDoc(), { target: { value: '11222333000181' } });
    const oferta = await screen.findByTestId('oferta-receita-nome', {}, { timeout: 3000 });
    expect(oferta.textContent).toContain('Receita: OMEGA COMERCIO DE MATERIAIS DE CONSTRUCAO LTDA');
    expect(screen.getByTestId('oferta-receita-nome_fantasia').textContent).toContain('Receita: OMEGA COMERCIO DE MATERIAIS');
    expect(razao().value).toBe('Omega Materiais');
    expect(fantasia().value).toBe('Loja do Omega');
    expect(screen.getByTestId('cpf-cnpj-recado').textContent).toContain('A Receita tem outra razão social e outra fantasia: "Usar" no campo.');
    fireEvent.click(screen.getByTestId('oferta-receita-nome-usar'));
    expect(razao().value).toBe('OMEGA COMERCIO DE MATERIAIS DE CONSTRUCAO LTDA');
    expect(screen.queryByTestId('oferta-receita-nome')).toBeNull();
    expect(fantasia().value).toBe('Loja do Omega');
    fireEvent.click(botaoSalvar());
    await waitFor(() => expect(ultimoPayload().nome).toBe('OMEGA COMERCIO DE MATERIAIS DE CONSTRUCAO LTDA'));
    expect(ultimoPayload().nome_fantasia).toBe('Loja do Omega');
  });
});
