/**
 * CONC-TRANSF-SEGUNDA-PONTA-01 — o hook traz as DUAS espécies na mesma query (pares de duas pontas livres e meias
 * transferências), e a segunda ponta vai por `fn_transferencia_segunda_ponta`.
 * ⚠ A RPC É FALSA AQUI: quem prova o banco é o teste em ROLLBACK (supabase/tests/conc_transf_segunda_ponta_01_test.sql).
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const M = vi.hoisted(() => ({ chamadas: [] as Array<{ nome: string; params: unknown }> }));
const MEIA = {
  extrato: { id: 'd5b459d6', data: '2026-05-14', valor: 2597, conta_id: 'pes', conta: 'Sicredi Pessoal', descricao: 'PIX RECEBIDO' },
  transferencia_id: 'b0134032',
  ponta_ligada: { extrato_id: 'ff2f9e47', data: '2026-05-14', valor: -2597, conta_id: 'lav', conta: 'Sicredi Lavoura' },
};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (nome: string, params: unknown) => {
      M.chamadas.push({ nome, params });
      if (nome === 'fn_transferencias_sugeridas') return Promise.resolve({ data: { total: 1, linhas: [{ saida: { id: 's1' } }] }, error: null });
      if (nome === 'fn_transferencias_meia_ponta') return Promise.resolve({ data: { total: 1, linhas: [MEIA] }, error: null });
      if (nome === 'fn_transferencia_segunda_ponta') return Promise.resolve({ data: { ok: false, motivo: 'ponta_ja_ligada' }, error: null });
      return Promise.resolve({ data: null, error: { message: `rpc inesperada ${nome}` } });
    },
  },
}));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));

import { useTransferenciasSugeridas, textoMotivo } from './useTransferenciasSugeridas';

function envoltorio({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

beforeEach(() => { M.chamadas = []; });

describe('useTransferenciasSugeridas — as duas espécies', () => {
  it('uma query, duas RPCs com os mesmos parâmetros: os pares em `linhas`, as meias em `meias`', async () => {
    const { result } = renderHook(() => useTransferenciasSugeridas('nj', '2026-05'), { wrapper: envoltorio });
    await waitFor(() => expect(result.current.dados.meias).toHaveLength(1));
    expect(result.current.dados.total).toBe(1);
    expect(result.current.dados.linhas).toHaveLength(1);
    expect(result.current.dados.meias[0].transferencia_id).toBe('b0134032');
    expect(M.chamadas.map((c) => c.nome).sort()).toEqual(['fn_transferencias_meia_ponta', 'fn_transferencias_sugeridas']);
    for (const c of M.chamadas) expect(c.params).toEqual({ p_cliente_id: 'nj', p_ano_mes: '2026-05' });
  });

  it('fecharMeia vai por fn_transferencia_segunda_ponta e devolve a recusa com o motivo', async () => {
    const { result } = renderHook(() => useTransferenciasSugeridas('nj', '2026-05'), { wrapper: envoltorio });
    const r = await result.current.fecharMeia('d5b459d6', 'b0134032', true);
    expect(M.chamadas.find((c) => c.nome === 'fn_transferencia_segunda_ponta')?.params)
      .toEqual({ p_extrato: 'd5b459d6', p_lancamento: 'b0134032', p_simular: true });
    expect(r).toEqual({ ok: false, motivo: 'ponta_ja_ligada' });
  });

  it('os motivos novos têm frase; o desconhecido sai como veio', () => {
    expect(textoMotivo('ponta_ja_ligada')).toBe('esta ponta da transferência já está conciliada');
    expect(textoMotivo('direcao_errada')).toBe('o movimento está na direção errada da transferência');
    expect(textoMotivo('sem_outra_ponta')).toBe('a transferência não tem a outra ponta conciliada');
    expect(textoMotivo('fora_da_janela')).toBe('mais de 1 dia entre o movimento e a transferência');
    expect(textoMotivo('nao_e_transferencia')).toBe('o lançamento não é uma transferência');
    expect(textoMotivo('xyz')).toBe('xyz');
  });
});
