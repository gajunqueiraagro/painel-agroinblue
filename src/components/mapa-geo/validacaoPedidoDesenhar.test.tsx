/**
 * MAPA-AREA-TIPOS-02 (Gabriel 02/11 15:54, Ursa Maior: Adicionar › Área só deixava escolher polígono existente) — o pedido da Validação
 * oferece "Desenhar nova" (padrão) e "Escolher existente". Desenhar nova abre o desenho do Code 3 (`useEdicaoDoPoligono`, com o nome do
 * tipo) e o polígono que a gravação criar é classificado com o tipo pedido pelo escritor de sempre; Escolher existente não classifica nada
 * sozinho. O hook do desenho é embrulhado só para capturar o `aoMudar` (a gravação dele, `fn_geometria_gravar`, tem os testes do Code 3).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';

const estado = vi.hoisted(() => ({
  rpc: [] as { fn: string; a: Record<string, unknown> }[],
  aoMudar: null as null | ((criadoId?: string) => void),
  iniciar: [] as unknown[][], nome: [] as string[],
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, a: Record<string, unknown>) => { estado.rpc.push({ fn, a }); return Promise.resolve({ data: { ok: true }, error: null }); },
    from: () => { const q = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }) }; return q; },
  },
}));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));
vi.mock('@/hooks/useEdicaoDoPoligono', async (original) => {
  const o = await original<typeof import('@/hooks/useEdicaoDoPoligono')>();
  return {
    ...o,
    useEdicaoDoPoligono: (args: Parameters<typeof o.useEdicaoDoPoligono>[0]) => {
      estado.aoMudar = args.aoMudar;
      const r = o.useEdicaoDoPoligono(args);
      return { ...r, iniciar: async (...a: unknown[]) => { estado.iniciar.push(a); }, setNomeNovo: (n: string) => { estado.nome.push(n); } };
    },
  };
});

import { ValidacaoPoligonosView } from './ValidacaoPoligonosView';

const geo: FazendaGeometria = { id: 'g1', fazenda_id: 'faz', cliente_id: 'cli', pasto_id: null, tipo: 'outra', nome_original: 'Sem nome 1',
  geojson: { type: 'Polygon', coordinates: [] }, cor: null, created_at: '', updated_at: '' };

beforeEach(() => { estado.rpc = []; estado.aoMudar = null; estado.iniciar = []; estado.nome = []; });

function renderiza(onTipoPedidoUsado = vi.fn(), onRefresh = vi.fn()) {
  render(<ValidacaoPoligonosView geometrias={[geo]} pastos={[]} geoLoading={false} onUpdate={vi.fn()} onDelete={vi.fn()} onRefresh={onRefresh}
    tipoPedido="manga" onTipoPedidoUsado={onTipoPedidoUsado} />);
  return { onTipoPedidoUsado, onRefresh };
}

describe('Validação — Adicionar › Área: Desenhar nova | Escolher existente', () => {
  it('as duas opções lado a lado; "Desenhar nova" é a padrão e diz que vai desenhar', () => {
    renderiza();
    expect(screen.getByTestId('validacao-tipo-pedido').textContent).toContain('Marcar como Manga: desenhe a área nova');
    expect(screen.getByTestId('validacao-tipo-pedido-desenhar')).toBeTruthy();
    expect(screen.getByTestId('validacao-tipo-pedido-escolher')).toBeTruthy();
  });

  it('Desenhar nova: abre o desenho com o nome do tipo; o polígono criado é classificado como Manga e o pedido termina', async () => {
    const { onTipoPedidoUsado, onRefresh } = renderiza();
    fireEvent.click(screen.getByTestId('validacao-tipo-pedido-desenhar'));
    await waitFor(() => expect(estado.iniciar).toEqual([['desenhar', null]]));
    await waitFor(() => expect(estado.nome).toEqual(['Manga']));
    estado.aoMudar?.('novo-1');
    await waitFor(() => expect(estado.rpc).toContainEqual({ fn: 'fn_mapa_geometria_classificar',
      a: expect.objectContaining({ p_geometria: 'novo-1', p_tipo: 'manga', p_simular: false }) }));
    await waitFor(() => expect(onTipoPedidoUsado).toHaveBeenCalled());
    expect(onRefresh).toHaveBeenCalled();
  });

  it('Escolher existente: o texto muda e uma gravação de desenho NÃO classifica sozinha', async () => {
    renderiza();
    fireEvent.click(screen.getByTestId('validacao-tipo-pedido-escolher'));
    expect(screen.getByTestId('validacao-tipo-pedido').textContent).toContain('Marcar como Manga: escolha o polígono');
    estado.aoMudar?.('outro-1');
    await new Promise(r => setTimeout(r, 0));
    expect(estado.rpc.filter(c => c.fn === 'fn_mapa_geometria_classificar')).toEqual([]);
  });
});
