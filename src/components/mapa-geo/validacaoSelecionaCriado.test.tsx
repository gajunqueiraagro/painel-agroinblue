/* MAPA-DICAS-01 (área) — logo depois de CRIAR um polígono a barra abre com ele selecionado (o id vem da gravação; a seleção espera o
   recarregamento trazê-lo). */
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: () => Promise.resolve({ data: null, error: null }), from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; } },
}));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));
const guardado: { aoMudar: ((id?: string) => void) | null } = { aoMudar: null };
vi.mock('@/hooks/useEdicaoDoPoligono', async (orig) => {
  const real = await orig<typeof import('@/hooks/useEdicaoDoPoligono')>();
  return { ...real, useEdicaoDoPoligono: (args: Parameters<typeof real.useEdicaoDoPoligono>[0]) => { guardado.aoMudar = args.aoMudar; return real.useEdicaoDoPoligono(args); } };
});

import { ValidacaoPoligonosView } from './ValidacaoPoligonosView';

const poligono = (id: string, nome: string): FazendaGeometria => ({
  id, fazenda_id: 'faz', cliente_id: 'cli', pasto_id: null, tipo: 'outra', nome_original: nome, cor: null, created_at: '', updated_at: '',
  geojson: { type: 'Polygon', coordinates: [[[-54.03, -19.63], [-54.0238, -19.63], [-54.0238, -19.6362], [-54.03, -19.6362], [-54.03, -19.63]]] },
});

describe('Validação — o polígono criado abre selecionado', () => {
  it('aoMudar(id) + recarga que traz o id = barra aberta com a área; sem id, nada abre', async () => {
    const onRefresh = vi.fn();
    const props = { pastos: [], geoLoading: false, onUpdate: vi.fn(), onDelete: vi.fn(), onRefresh };
    const { rerender } = render(<ValidacaoPoligonosView {...props} geometrias={[poligono('a', 'Antigo')]} />);
    expect(screen.queryByTestId('validacao-painel-poligono')).toBeNull();
    act(() => guardado.aoMudar?.());
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('validacao-painel-poligono')).toBeNull();
    act(() => guardado.aoMudar?.('novo'));
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('validacao-painel-poligono')).toBeNull(); // o id ainda não chegou na lista
    rerender(<ValidacaoPoligonosView {...props} geometrias={[poligono('a', 'Antigo'), poligono('novo', 'Piq.8')]} />);
    expect(await screen.findByTestId('validacao-painel-poligono')).toBeTruthy();
    expect(screen.getByTestId('validacao-painel-area').textContent).toMatch(/^\d{2},\d{2} ha$/);
    expect(screen.getByTestId('validacao-painel-nome').textContent).toContain('Piq.8');
  });
});
