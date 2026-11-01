/* MAPA-EDITAR-POLIGONO-01 (D4, Gabriel 01/11): na Validação o "Excluir" virou o APAGAR da edição — pede motivo e grava pela
   fn_geometria_gravar (trilha + desfazer), um gesto por polígono, NUNCA por DELETE direto; o polígono ligado a pasto recusado vem escrito. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { rpc, deletes, linhas } = vi.hoisted(() => ({
  rpc: vi.fn(async (_n: string, _a: unknown) => ({ data: { gesto_id: 'g1' }, error: null as unknown })),
  deletes: [] as string[],
  linhas: {
    a: { id: 'a', versao: 3, nome_original: 'Pasto A', geojson: { type: 'Polygon', coordinates: [] }, pasto_id: null },
    b: { id: 'b', versao: 1, nome_original: 'Pasto B', geojson: { type: 'Polygon', coordinates: [] }, pasto_id: 'p1' },
  } as Record<string, unknown>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc,
    from: (tabela: string) => {
      let id = '';
      const q = {
        select: () => q,
        eq: (_c: string, v: string) => { id = v; return q; },
        delete: () => { deletes.push(tabela); return q; },
        maybeSingle: async () => ({ data: linhas[id] ?? null, error: null }),
      };
      return q;
    },
  },
}));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli' } }) }));

import { ValidacaoPoligonosView } from './ValidacaoPoligonosView';

const GEOS = [
  { id: 'a', fazenda_id: 'faz', cliente_id: 'cli', pasto_id: null, tipo: 'outra', nome_original: 'Pasto A', geojson: { type: 'Polygon', coordinates: [] }, cor: null, created_at: '', updated_at: '' },
  { id: 'b', fazenda_id: 'faz', cliente_id: 'cli', pasto_id: 'p1', tipo: 'pasto', nome_original: 'Pasto B', geojson: { type: 'Polygon', coordinates: [] }, cor: null, created_at: '', updated_at: '' },
];

function abrir(onDelete = vi.fn(async () => true), onRefresh = vi.fn()) {
  render(<ValidacaoPoligonosView geometrias={GEOS as never} pastos={[{ id: 'p1', nome: 'P1' }] as never} geoLoading={false}
    onUpdate={vi.fn()} onDelete={onDelete} onLink={vi.fn()} onRefresh={onRefresh} />);
  return { onDelete, onRefresh };
}

beforeEach(() => { vi.clearAllMocks(); deletes.length = 0; });

describe('Validação — Apagar em lote (D4)', () => {
  it('pede motivo; grava um gesto "apagar" por polígono pela fn_geometria_gravar, com a versão lida na hora; nunca DELETE', async () => {
    rpc.mockImplementation(async (_n, a) => {
      const g = (a as { p_gesto: { remover: { id: string }[] } }).p_gesto;
      return g.remover[0].id === 'b'
        ? { data: null, error: { code: '22023', message: 'Este polígono está ligado a um pasto: desligue o vínculo antes ou escolha o polígono que fica com o pasto.' } }
        : { data: { gesto_id: 'g1' }, error: null };
    });
    const { onDelete, onRefresh } = abrir();
    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos/ }));
    fireEvent.click(screen.getByRole('button', { name: /Apagar \(2\)/ }));
    const apagar = await screen.findByRole('button', { name: /^Apagar$/ });
    expect(apagar).toHaveProperty('disabled', true); // sem motivo, não apaga
    fireEvent.change(screen.getByTestId('apagar-lote-motivo'), { target: { value: 'divisa errada no KMZ' } });
    fireEvent.click(apagar);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[0]).toEqual(['fn_geometria_gravar', {
      p_fazenda_id: 'faz', p_simular: false,
      p_gesto: { acao: 'apagar', motivo: 'divisa errada no KMZ', remover: [{ id: 'a', versao: 3 }] },
    }]);
    // o ligado a pasto é recusado pelo banco e a recusa fica escrita no diálogo
    expect((await screen.findByTestId('apagar-lote-recusas')).textContent).toContain('Pasto B');
    expect(onDelete).not.toHaveBeenCalled();
    expect(deletes).toEqual([]);
    expect(onRefresh).toHaveBeenCalled();
  });
});
