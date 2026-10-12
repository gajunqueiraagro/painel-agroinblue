/**
 * OC-CC-PADRAO-NOVAS-01b — em conta corrente registrar / estornar a saída sincronizam a entrega no banco e a versão da OC anda.
 * As RPCs devolvem a versão GRAVADA; a tela a repassa ao dono (`onVersaoChange`) e o próximo gesto vai com ela. E a conta
 * corrente (outro hook, sempre montado no shell) relê UMA vez quando a versão muda por fora dela.
 * Os dois hooks são os de verdade; o banco é falso, recusa versão velha (40001) e conta cada chamada.
 */
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const banco = vi.hoisted(() => ({ versao: 10, chamadas: [] as Array<{ fn: string; versao: unknown }>, devolveVersao: true }));
vi.mock('@/integrations/supabase/client', () => {
  const from = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) b[m] = () => b;
    b.then = (ok: (x: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return b;
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    banco.chamadas.push({ fn, versao: args.p_versao_esperada });
    if (fn === 'oc_conta_corrente') {
      return { data: { modelo: 'conta_corrente', versao: banco.versao, valor_acordado: 0, entregue: 0, cab_entregue: 0, recebido: 0, programado: 0,
        devolvido: 0, saldo: 0, explicado: 0, saldo_a_explicar: 0, falta_explicar: 0, situacao: 'aguardando_saida', a_entregar: 0,
        recebimentos_sem_conta_bancaria: 0, saidas_sem_entrega: 0, linhas: [], explicacoes: [] }, error: null };
    }
    if (fn === 'oc_registrar_movimentacao' || fn === 'oc_estornar_movimentacao') {
      banco.versao += 1;   // o gancho sincronizou a entrega: a versao andou
      return { data: banco.devolveVersao ? { ok: true, versao: banco.versao } : { ok: true }, error: null };
    }
    if (fn === 'oc_encerrar_entrega' || fn === 'oc_desvincular_movimentacao') {
      if (args.p_versao_esperada !== banco.versao) {
        return { data: null, error: { code: '40001', message: `Conflito de versao (esperada ${args.p_versao_esperada}, atual ${banco.versao})` } };
      }
      banco.versao += 1;
      return { data: { ok: true, versao: banco.versao }, error: null };
    }
    return { data: null, error: null };
  };
  return { supabase: { from, rpc } };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { useOperacaoRecebimento } from '@/hooks/useOperacaoRecebimento';
import { useOcContaCorrente } from '@/hooks/useOcContaCorrente';

/** O hospedeiro em miniatura: UM dono da versão (o `ocVersao` do `LancamentosTab`), entregue aos dois hooks. */
function useHost() {
  const [versao, setVersao] = useState<number | null>(10);
  const rec = useOperacaoRecebimento({ operacaoId: 'op', clienteId: 'cli', versao, onVersaoChange: setVersao, enabled: true });
  const cc = useOcContaCorrente({ operacaoId: 'op', enabled: true, versao, onVersaoChange: setVersao });
  return { versao, rec, cc };
}
const SAIDA = { data: '2031-03-11', categoria: 'desmama_m', quantidade: 10, pesoMedio: 200, observacao: '' };
const de = (fn: string) => banco.chamadas.filter(c => c.fn === fn);

beforeEach(() => { banco.versao = 10; banco.chamadas = []; banco.devolveVersao = true; });

describe('a versão devolvida pela saída vai para o próximo gesto', () => {
  it('registrar: a tela passa a 11 e o encerrar seguinte vai com 11 (sem 40001)', async () => {
    const { result } = renderHook(() => useHost());
    await waitFor(() => expect(result.current.cc.contaCorrente).not.toBeNull());
    await act(async () => { await result.current.rec.registrar('l1', SAIDA); });
    expect(result.current.versao).toBe(11);
    await act(async () => { await result.current.rec.encerrar('fim'); });
    expect(de('oc_encerrar_entrega').map(c => c.versao)).toEqual([11]);
    expect(result.current.versao).toBe(12);
  });
  it('estornar: a tela passa a 11 e o desvincular seguinte vai com 11', async () => {
    const { result } = renderHook(() => useHost());
    await waitFor(() => expect(result.current.cc.contaCorrente).not.toBeNull());
    await act(async () => { await result.current.rec.estornar('m1', 'teste'); });
    expect(result.current.versao).toBe(11);
    let erro: string | null = 'x';
    await act(async () => { erro = await result.current.rec.desvincular('m2'); });
    expect(erro).toBeNull();
    expect(de('oc_desvincular_movimentacao').map(c => c.versao)).toEqual([11]);
  });
  it('o detector sabe achar: banco que NÃO devolve a versão (o de antes) deixa a tela na 10 e o gesto seguinte é recusado', async () => {
    banco.devolveVersao = false;
    const { result } = renderHook(() => useHost());
    await waitFor(() => expect(result.current.cc.contaCorrente).not.toBeNull());
    await act(async () => { await result.current.rec.registrar('l1', SAIDA); });
    expect(result.current.versao).toBe(10);
    let erro: string | null = null;
    await act(async () => { erro = await result.current.rec.desvincular('m2'); });
    expect(erro).not.toBeNull();
  });
});

describe('a conta corrente relê quando a versão anda por fora dela', () => {
  it('depois de registrar a saída: UMA leitura a mais, e nenhuma depois', async () => {
    const { result } = renderHook(() => useHost());
    await waitFor(() => expect(result.current.cc.contaCorrente).not.toBeNull());
    const antes = de('oc_conta_corrente').length;
    await act(async () => { await result.current.rec.registrar('l1', SAIDA); });
    await waitFor(() => expect(result.current.cc.contaCorrente?.versao).toBe(11));
    await act(async () => { await new Promise(r => setTimeout(r, 80)); });
    expect(de('oc_conta_corrente').length).toBe(antes + 1);
  });
  it('versão igual à que a leitura trouxe: não relê', async () => {
    const { result } = renderHook(() => useHost());
    await waitFor(() => expect(result.current.cc.contaCorrente).not.toBeNull());
    await act(async () => { await new Promise(r => setTimeout(r, 80)); });
    expect(de('oc_conta_corrente').length).toBe(1);
  });
});
