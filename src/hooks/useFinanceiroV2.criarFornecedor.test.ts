/**
 * FORN-CRIAR-DA-NOTA-ERRO (Gabriel 24/11 07:02, NF 39.814) — "+ Da nota" → criar o fornecedor falhava com o toast genérico "Um dos
 * campos está em formato inválido". A causa: o modal do lançamento passa a fazenda do estado dele, '' quando nenhuma foi escolhida, e o
 * banco recusa o uuid vazio (22P02, provado no proto: `invalid input syntax for type uuid: ""`). O banco FALSO daqui recusa igual.
 * (1) vazio grava SEM fazenda; (3) o erro de formato diz o campo e o valor, nunca o genérico.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const banco = vi.hoisted(() => ({ inseridos: [] as Record<string, unknown>[], erro: null as null | { code: string; message: string; details: null; hint: null } }));
const UUID = /^[0-9a-f-]{36}$/;
function construtor(tabela: string) {
  let linha: Record<string, unknown> | null = null;
  const b: Record<string, unknown> = {};
  const responder = () => {
    if (tabela !== 'financeiro_fornecedores' || !linha) return { data: [], count: 0, error: null };
    /* como o Postgres: texto que não é uuid numa coluna uuid = 22P02 citando o valor */
    const fz = linha.fazenda_id;
    if (typeof fz === 'string' && !UUID.test(fz)) return { data: null, error: { code: '22P02', message: `invalid input syntax for type uuid: "${fz}"`, details: null, hint: null } };
    if (banco.erro) return { data: null, error: banco.erro };
    banco.inseridos.push(linha);
    return { data: { id: 'f-novo', ...linha }, error: null };
  };
  Object.assign(b, {
    select: () => b,
    insert: (l: Record<string, unknown>) => { linha = l; return b; },
    single: () => Promise.resolve(responder()),
    maybeSingle: () => Promise.resolve(responder()),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(responder()).then(ok, erro),
  });
  for (const m of ['eq', 'neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt', 'or', 'not', 'order', 'range', 'limit', 'ilike', 'like', 'filter', 'match', 'contains']) b[m] = () => b;
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => construtor(t), rpc: () => Promise.resolve({ data: null, error: null }) } }));
const toastErro = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastErro, warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));

import { useFinanceiroV2 } from './useFinanceiroV2';

beforeEach(() => { banco.inseridos = []; banco.erro = null; toastErro.mockClear(); vi.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('criarFornecedor — fazenda vazia e o erro de formato', () => {
  it('fazenda não escolhida ("") grava SEM fazenda, e o fornecedor é criado', async () => {
    const { result } = renderHook(() => useFinanceiroV2());
    let novo: unknown = null;
    await act(async () => { novo = await result.current.criarFornecedor('Pneus Sinteticos Ltda', '', '11.222.333/0001-81'); });
    expect(novo).toMatchObject({ id: 'f-novo' });
    expect(banco.inseridos).toEqual([{ cliente_id: 'cli', fazenda_id: null, nome: 'Pneus Sinteticos Ltda', cpf_cnpj: '11.222.333/0001-81' }]);
    expect(toastErro).not.toHaveBeenCalled();
  });
  it('o banco recusa o formato de um campo: a frase diz qual e o valor (nunca o genérico)', async () => {
    banco.erro = { code: '22P02', message: 'invalid input syntax for type uuid: "zzz"', details: null, hint: null };
    const { result } = renderHook(() => useFinanceiroV2());
    await act(async () => { await result.current.criarFornecedor('Pneus Sinteticos Ltda', null, 'zzz'); });
    expect(toastErro).toHaveBeenCalledWith('CPF/CNPJ: formato inválido (valor "zzz"). Nada foi gravado.');
    expect(toastErro.mock.calls.flat().join(' ')).not.toContain('Um dos campos está em formato inválido');
  });
});
