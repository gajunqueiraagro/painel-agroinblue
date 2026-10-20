/* FIN-PARCELA-STATUS-01 — a parcela ADIADA (sem vencimento: o consórcio até a contemplação) é dívida, mas não é vencida, não é "próxima", não é
   curto nem longo prazo, e não some do em aberto. Uma regra, em cada leitor que a tela usa:
     · Painel Financiamentos (`useFinanciamentosPainel`): pizza com o grupo "Adiadas, sem vencimento (N)", fora das próximas parcelas;
     · endividamento da Home (`useEndividamentoAtual`): o mesmo grupo na pizza, e a adiada no total da dívida;
     · lista de contratos (`resumoDoContratoNaLista`): o em aberto soma o `adiado` do banco;
     · Mesa (`candidatasParaExtrato`): a adiada não é candidata a pagamento de extrato (GUARDA: ja' valia — data vazia dá distância infinita).
   Fixture SINTÉTICA: o lote do cliente Teste + uma parcela adiada (nº 99, principal 166.666,67). */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import FIX from '@/pages/financiamentosPainelAdiada.fixture.json';

vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli-sint', nome: 'Teste' } }) }));
vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (linhas: unknown[]) => {
    const o: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'order', 'gte', 'lte', 'is', 'not', 'limit']) o[m] = () => o;
    o.then = (r: (x: { data: unknown[]; error: null }) => unknown) => r({ data: linhas, error: null });
    return o;
  };
  return {
    supabase: {
      from: (t: string) => cadeia(t === 'financiamentos' ? [FIX.fin] : []),
      rpc: () => Promise.resolve({ data: FIX.lote, error: null }),
    },
  };
});

import { useFinanciamentosPainel, rotuloDasAdiadas } from '@/hooks/useFinanciamentosPainel';
import { useEndividamentoAtual } from '@/hooks/useEndividamentoAtual';
import { lerSituacaoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';
import { resumoDoContratoNaLista } from '@/lib/financiamentos/situacaoEmLote';
import { candidatasParaExtrato, type ParcelaCandidata } from '@/v2/hooks/useParcelasFinanciamento';

const ADIADA = '00000000-0000-4000-8000-0000000000ad';
const envolver = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('parcela adiada (sem vencimento)', () => {
  it('Painel: grupo próprio na pizza e fora das próximas parcelas', async () => {
    const { result } = renderHook(() => useFinanciamentosPainel(2026, 'todos', 'todos'), { wrapper: envolver() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.parcelasEnriquecidas.length).toBeGreaterThan(0));
    const fatia = result.current.pizzaVencimentos.find((s) => s.nome === rotuloDasAdiadas(1));
    expect(fatia?.valor).toBeCloseTo(166666.67, 2);
    const curto = result.current.pizzaVencimentos.find((s) => s.nome.startsWith('Curto'));
    expect(curto?.valor).toBeCloseTo(166666.67 * 4 + 166666.65, 2);
    expect(result.current.proximasParcelas.map((p) => p.parcela_id)).not.toContain(ADIADA);
  });

  it('Endividamento da Home: grupo próprio na pizza, e a adiada no total', async () => {
    const { result } = renderHook(() => useEndividamentoAtual(2026), { wrapper: envolver() });
    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
    const fatia = result.current.pizzaVencimentos.find((s) => s.nome === rotuloDasAdiadas(1));
    expect(fatia?.valor).toBeCloseTo(166666.67, 2);
    // as 5 em aberto + a adiada + a paga com pagamento em 2027 (no lote sintético; pago depois de hoje conta como em aberto, a regra do hook)
    expect(result.current.total).toBeCloseTo(166666.67 * 6 + 166666.65, 2);
  });

  it('Lista: o em aberto soma o adiado do banco', () => {
    const s = lerSituacaoDoContrato({
      parcelas: [], saldo: null,
      cartoes: { valor_contrato: 300, pago: 100, a_vencer: 50, vencido: 25, adiado: 125, adiado_qtde: 1, pagas: 1, parcelas: 3,
        juros_previstos: 0, soma_principal: 300, soma_total: 300, divergentes: 0 },
    });
    expect(s?.cartoes.adiado).toBe(125);
    expect(resumoDoContratoNaLista(s ?? undefined).totalPendente).toBe(200);
  });

  it('Mesa: a adiada não é candidata a pagamento de extrato', () => {
    const base: ParcelaCandidata = { parcela_id: 'p', financiamento_id: 'f', numero_parcela: 1, total_parcelas: 2, data_vencimento: '',
      valor_principal: 100, valor_juros: 0, valor_total: 100, contrato_descricao: 'SINT', natureza: 'consorcio', credor_nome: null };
    const ps: ParcelaCandidata[] = [{ ...base, parcela_id: 'adiada' }, { ...base, parcela_id: 'normal', data_vencimento: '2026-10-20' }];
    expect(candidatasParaExtrato({ data: '2026-10-20', valor: -100 }, ps).map((p) => p.parcela_id)).toEqual(['normal']);
  });
});
