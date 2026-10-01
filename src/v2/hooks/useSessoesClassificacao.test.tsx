/**
 * PR-CONC-EXCEL-SESSAO-E-DEPARA-01 — o seletor põe cada importação no mês PREDOMINANTE das linhas dela.
 *
 * ⚠ O CASO DO PRINT: a Imp 03 (8d6efeb7) tinha a primeira linha por `staging_id` em 2026-07 e sumia de setembro.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Linha = { sessao_id: string; excel_ano_mes: string | null; match_status: string; aplicado: boolean; created_at: string };
const linhas: Linha[] = [
  /* a PRIMEIRA linha que a paginação por uuid entrega é de julho */
  { sessao_id: '8d6efeb7', excel_ano_mes: '2026-07', match_status: 'sem_match', aplicado: false, created_at: '2026-10-01T08:08:41Z' },
  ...Array.from({ length: 303 }, (): Linha => ({ sessao_id: '8d6efeb7', excel_ano_mes: '2026-09', match_status: 'exato', aplicado: false, created_at: '2026-10-01T08:09:11Z' })),
  ...Array.from({ length: 108 }, (): Linha => ({ sessao_id: '8d6efeb7', excel_ano_mes: '2026-08', match_status: 'sem_match', aplicado: false, created_at: '2026-10-01T08:09:00Z' })),
];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: (de: number, ate: number) =>
      Promise.resolve({ data: linhas.slice(de, ate + 1), error: null }) }) }) }) }),
  },
}));

import { useSessoesClassificacao } from '@/v2/hooks/useClassificacaoStaging';

function envoltorio({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe('useSessoesClassificacao — o mês da importação', () => {
  it('é o predominante (2026-09), não o da primeira linha (2026-07)', async () => {
    const { result } = renderHook(() => useSessoesClassificacao('nj'), { wrapper: envoltorio });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const s = result.current.data?.find((x) => x.sessao_id === '8d6efeb7');
    expect(s?.excel_ano_mes).toBe('2026-09');
    expect(s?.total).toBe(412);
    expect(s?.criada_em).toBe('2026-10-01T08:09:11Z');
  });
});
