/**
 * DRE-MODAL-SUBCENTRO-01 — o `useRateioAdmPec` repassa o SUBCENTRO que a RPC passou a devolver.
 *
 * ⚠ NASCE DE UM DEFEITO VISTO NA TELA, com a suite verde: o hook remonta cada linha campo a campo, e sem esta linha
 *   o quadro "Por subcentro" mostrava todo o rateio administrativo como "(sem subcentro)" — a RPC mandava o campo e o
 *   hook o jogava fora. O quadro fechava (a soma nao depende do nome); o que sumia era o recorte.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { useRateioAdmPec } from '@/hooks/useDrePecuaria';

describe('useRateioAdmPec — o subcentro da linha', () => {
  it('passa o subcentro de cada linha; ausente vira null, nunca some', async () => {
    rpc.mockResolvedValue({
      data: {
        lancamentos: [
          { id: 'a', data: '2026-01-05', valor: 700, grupo: 'Mão de Obra', subcentro: 'Salários e Encargos Administrativo', pct: 40, parte: 280, origem: 'lancamento' },
          { id: 'b', data: '2026-01-06', valor: 55, grupo: 'Mão de Obra', pct: 40, parte: 22, origem: 'lancamento' },
        ],
        grupos: [{ grupo: 'Mão de Obra', bruto: 755, parte: 302 }],
      },
      error: null,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useRateioAdmPec('c1', '2025-07', '2026-06', 'realizado', true), { wrapper });
    await waitFor(() => expect(result.current.rateio).not.toBeNull());
    expect(result.current.rateio?.lancamentos.map(l => l.subcentro)).toEqual(['Salários e Encargos Administrativo', null]);
    expect(rpc).toHaveBeenCalledWith('fn_painel_rateio_detalhe', expect.objectContaining({ p_tipo: 'admin', p_atividade: 'pecuaria' }));
  });
});
