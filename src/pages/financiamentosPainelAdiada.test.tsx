/* Painel Financiamentos — parcela ADIADA do consórcio (sem vencimento até a contemplação) não derruba a tela nem conta como vencida.
   Nasce da tela branca do Agnaldo (20/10/2026): o 002122 foi gravado com 34 adiadas, o "Próximas parcelas" as punha primeiro (vencimento
   vazio ordena antes) e o `format` da data quebrava. Fixture SINTÉTICA: o lote do cliente Teste + uma parcela adiada. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FIX from './financiamentosPainelAdiada.fixture.json';

(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

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

import FinanciamentosPainelTab from './FinanciamentosPainelTab';

describe('Painel Financiamentos com parcela adiada', () => {
  it('abre sem erro e a adiada não entra nas próximas parcelas', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const erros: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { erros.push(a.map(String).join(' ')); };
    try {
      const r = render(<QueryClientProvider client={qc}><FinanciamentosPainelTab /></QueryClientProvider>);
      await screen.findAllByText(/SINT consorcio/);
      expect(erros.filter(e => /Invalid time value/.test(e))).toEqual([]);
      expect(r.container.textContent).not.toMatch(/Invalid Date/);
      r.unmount();
    } finally { console.error = orig; }
  });
});
