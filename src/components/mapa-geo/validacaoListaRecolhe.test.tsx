/* MAPA-EDITAR-POLIGONO-02b (Gabriel 01/11 14:19, Pureza: "não faz sentido uma aba tão grande e o mapa tão pequeno"): a lista da Validação
   recolhe também FORA da edição (faixa de 24 px com "›") e a escolha fica lembrada na sessão; aberta, ela tem 240 px. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: () => ({}) } }));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli' } }) }));

import { ValidacaoPoligonosView } from './ValidacaoPoligonosView';

const GEOS = [{ id: 'a', fazenda_id: 'faz', cliente_id: 'cli', pasto_id: 'p1', tipo: 'pasto', nome_original: 'P_04 Retiro do Córrego Comprido',
  geojson: { type: 'Polygon', coordinates: [] }, cor: null, created_at: '', updated_at: '' }];
const abrir = () => render(<ValidacaoPoligonosView geometrias={GEOS as never} pastos={[{ id: 'p1', nome: 'P_04 Retiro do Córrego Comprido' }] as never}
  geoLoading={false} onUpdate={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);

beforeEach(() => { cleanup(); sessionStorage.clear(); });

describe('Validação — a lista recolhe fora da edição (02b)', () => {
  it('aberta tem 240 px; "Recolher a lista" deixa a faixa com "›", lembrada na sessão; "›" volta', () => {
    abrir();
    expect(screen.getByTestId('validacao-lista').className).toContain('sm:w-[240px]');
    expect(screen.getByTestId('validacao-selo-pasto').getAttribute('title')).toBe('Pasto → P_04 Retiro do Córrego Comprido');
    fireEvent.click(screen.getByTestId('validacao-recolher-lista'));
    expect(screen.queryByTestId('validacao-lista')).toBeNull();
    expect(screen.getByTestId('validacao-lista-recolhida')).toBeTruthy();
    expect(sessionStorage.getItem('mapa-validacao-lista-recolhida')).toBe('1');
    cleanup();
    abrir(); // volta à tela: continua recolhida
    expect(screen.queryByTestId('validacao-lista')).toBeNull();
    fireEvent.click(screen.getByTestId('validacao-reabrir-lista'));
    expect(screen.getByTestId('validacao-lista')).toBeTruthy();
    expect(sessionStorage.getItem('mapa-validacao-lista-recolhida')).toBe('0');
  });
});
