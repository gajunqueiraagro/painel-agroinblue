/**
 * MAPA-PIQUETES-FECHADOS-01 F0b (Gabriel 06/11 16:07, "não consigo clicar no 8A"): depois de gravar o "Criar piquetes", a Validação relê os
 * GRUPOS (o tique da `useGruposComOrigem` sobe) — sem isso o pasto que virou pai seguia desenhado como pasto comum, por baixo do piquete, e
 * fora do conjunto de pais que a edição não mexe (F0).
 */
import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';

const estado = vi.hoisted(() => ({ tiques: [] as number[], aoGravar: null as null | (() => void) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, maybeSingle: async () => ({ data: null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok) }; return q; },
  },
}));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));
vi.mock('@/hooks/useGruposComOrigem', () => ({
  useGruposComOrigem: (_ids: unknown, tique: number) => { estado.tiques.push(tique); return { grupos: [] }; },
}));
vi.mock('@/hooks/useCriarPiquetes', async (original) => {
  const real = await original<typeof import('@/hooks/useCriarPiquetes')>();
  return {
    ...real,
    useCriarPiquetes: (args: Parameters<typeof real.useCriarPiquetes>[0]) => { estado.aoGravar = args.aoGravar; return real.useCriarPiquetes(args); },
  };
});

import { ValidacaoPoligonosView } from './ValidacaoPoligonosView';

const geo: FazendaGeometria = {
  id: 'g8', fazenda_id: 'faz', cliente_id: 'cli', pasto_id: 'p8', tipo: 'pasto', nome_original: 'P8',
  geojson: { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]] }, cor: null, created_at: '', updated_at: '',
};

describe('Validação — o "Criar piquetes" relê os grupos ao gravar', () => {
  it('gravou os piquetes = a leitura dos grupos se refaz (o tique sobe)', async () => {
    const onRefresh = vi.fn();
    render(<ValidacaoPoligonosView geometrias={[geo]} pastos={[]} geoLoading={false} onUpdate={vi.fn()} onDelete={vi.fn()} onLink={vi.fn()} onRefresh={onRefresh} />);
    const antes = Math.max(...estado.tiques);
    expect(estado.aoGravar).not.toBeNull();
    await act(async () => { estado.aoGravar?.(); });
    expect(onRefresh).toHaveBeenCalled();
    expect(Math.max(...estado.tiques)).toBeGreaterThan(antes);
  });
});
