/**
 * CUSTEIO-TXT-03 — a recusa do lote fica escrita no lugar, com a frase do banco (UX-TOAST-01).
 *
 * `criarLancamentosEmLote(forms, hashes, { aoRecusar })`: quem passa `aoRecusar` tem onde escrever a recusa e NÃO
 * recebe toast; P0001 (o RAISE das regras do próprio sistema) chega com a frase do banco, qualquer outro código com a
 * frase do normalizador. Sem `aoRecusar` nada muda — é o contrato do outro chamador (`onSaveBatch` do Financeiro V2).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

interface ErroDoBanco { code: string; message: string; details: string | null; hint: string | null }
const banco: { erro: ErroDoBanco | null; inserts: unknown[][] } = { erro: null, inserts: [] };

function construtor() {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    insert: (linhas: unknown[]) => { banco.inserts.push(linhas); return Promise.resolve({ data: null, error: banco.erro }); },
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], count: 0, error: null }).then(ok, erro),
  });
  for (const m of ['eq', 'neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt', 'or', 'not', 'order', 'range', 'limit', 'ilike', 'like', 'filter', 'match', 'contains']) {
    b[m] = () => b;
  }
  return b;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => construtor(), rpc: () => Promise.resolve({ data: null, error: null }) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));

import { toast } from 'sonner';
import { useFinanceiroV2, type LancamentoV2Form } from './useFinanceiroV2';
import { normalizarErro } from '@/lib/erroOperacional';

const FRASE_DO_BANCO = 'Subcentro "Xyz" nao existe no plano de contas. Selecione um subcentro canonico.';
const P0001: ErroDoBanco = { code: 'P0001', message: FRASE_DO_BANCO, details: null, hint: null };
const VINCULO: ErroDoBanco = { code: '23503', message: 'insert or update on table "x" violates foreign key constraint "y"', details: 'Key (z)', hint: null };

const form = (valor: number): LancamentoV2Form => ({
  fazenda_id: 'faz',
  conta_bancaria_id: 'conta',
  data_competencia: '2026-09-30',
  data_vencimento: '2026-09-30',
  data_pagamento: '2026-09-30',
  valor,
  tipo_operacao: '2-Saídas',
  status_transacao: 'realizado',
  descricao: `item ${valor}`,
});
const FORMS = [form(10), form(20)];

describe('criarLancamentosEmLote — a recusa do banco', () => {
  beforeEach(() => { banco.erro = null; banco.inserts.length = 0; vi.clearAllMocks(); });

  it('sem `aoRecusar`: toast de erro com a frase normalizada e `false`, como sempre', async () => {
    banco.erro = P0001;
    const { result } = renderHook(() => useFinanceiroV2());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.criarLancamentosEmLote(FORMS); });
    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(normalizarErro(P0001, 'criarLancamentosEmLote').mensagem);
    // ⚠ A FRASE DO BANCO NÃO VAI AO TOAST — o normalizador a troca; é por isso que o diálogo precisa do `aoRecusar`.
    expect(toast.error).not.toHaveBeenCalledWith(FRASE_DO_BANCO);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('com `aoRecusar` e P0001: recebe a frase DO BANCO, nenhum toast, `false`', async () => {
    banco.erro = P0001;
    const aoRecusar = vi.fn();
    const { result } = renderHook(() => useFinanceiroV2());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.criarLancamentosEmLote(FORMS, undefined, { aoRecusar }); });
    expect(ok).toBe(false);
    expect(aoRecusar).toHaveBeenCalledTimes(1);
    expect(aoRecusar).toHaveBeenCalledWith(FRASE_DO_BANCO);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('com `aoRecusar` e outro código: recebe a frase NORMALIZADA (nunca o texto cru), nenhum toast', async () => {
    banco.erro = VINCULO;
    const aoRecusar = vi.fn();
    const { result } = renderHook(() => useFinanceiroV2());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.criarLancamentosEmLote(FORMS, undefined, { aoRecusar }); });
    expect(ok).toBe(false);
    const normalizada = normalizarErro(VINCULO, 'criarLancamentosEmLote').mensagem;
    expect(normalizada).not.toBe(VINCULO.message);
    expect(aoRecusar).toHaveBeenCalledWith(normalizada);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('sucesso: `true`, o toast de sucesso de sempre, um único INSERT com as N linhas, e `aoRecusar` não é chamado', async () => {
    const aoRecusar = vi.fn();
    const { result } = renderHook(() => useFinanceiroV2());
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.criarLancamentosEmLote(FORMS, ['h1', 'h2'], { aoRecusar }); });
    expect(ok).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('2 lançamentos salvos');
    expect(aoRecusar).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(banco.inserts).toHaveLength(1);
    expect(banco.inserts[0]).toHaveLength(2);
  });
});
