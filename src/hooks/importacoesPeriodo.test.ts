/**
 * CONC-PAINEL-02 ajuste (Gabriel 23/11 17:09) — a lista dos arquivos do painel: o PERÍODO de cada importação sai dos movimentos VIVOS do
 * arquivo (o desfeito por inteiro: de todos) e o saldo final é o que o banco declarou. Dado SINTÉTICO.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const tabelas = vi.hoisted(() => ({
  extrato_bancario_v2: [
    { id: 'a1', importacao_id: 'A', cancelado_em: null, data_movimento: '2031-09-20' },
    { id: 'a2', importacao_id: 'A', cancelado_em: null, data_movimento: '2031-09-03' },
    { id: 'a3', importacao_id: 'A', cancelado_em: '2031-10-01T10:00:00Z', data_movimento: '2031-08-30' }, // cancelada: fora do período
    { id: 'b1', importacao_id: 'B', cancelado_em: '2031-10-01T10:00:00Z', data_movimento: '2031-09-05' },
    { id: 'b2', importacao_id: 'B', cancelado_em: '2031-10-01T10:00:00Z', data_movimento: '2031-09-01' },
  ],
  financeiro_importacoes_v2: [
    { id: 'A', nome_arquivo: 'a.ofx', created_at: '2031-10-02T10:00:00Z', cancelado_em: null, cancelada_em: null, tipo_arquivo: 'OFX',
      saldo_declarado: '1234.5', saldo_declarado_data: '2031-09-20', arquivo_caminho: null },
    { id: 'B', nome_arquivo: 'b.ofx', created_at: '2031-10-01T10:00:00Z', cancelado_em: null, cancelada_em: null, tipo_arquivo: 'OFX',
      saldo_declarado: null, saldo_declarado_data: null, arquivo_caminho: null },
  ],
  conciliacao_bancaria_itens: [],
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: keyof typeof tabelas) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'in', 'is', 'order', 'limit']) q[m] = () => q;
      q.then = (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: tabelas[t] ?? [], error: null }).then(ok);
      return q;
    },
  },
}));
import { useImportacoesDaConta } from './useExtratoDaConta';

describe('o período e o saldo final da importação (a lista do painel)', () => {
  it('o período dos movimentos VIVOS; o arquivo desfeito por inteiro, de todos; o saldo declarado vira número', async () => {
    const { result } = renderHook(() => useImportacoesDaConta('cli', 'cc'));
    await waitFor(() => expect(result.current.importacoes).toHaveLength(2));
    const por = Object.fromEntries(result.current.importacoes.map((i) => [i.id, [i.periodoDe, i.periodoAte, i.saldoDeclarado]]));
    expect(por).toEqual({ A: ['2031-09-03', '2031-09-20', 1234.5], B: ['2031-09-01', '2031-09-05', null] });
  });
});
