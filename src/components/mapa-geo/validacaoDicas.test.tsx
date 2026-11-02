/* MAPA-DICAS-01 — na barra do polígono da Validação: cada ícone tem a dica (sem `title` nativo), e o Classificar (dica + popover no
   mesmo botão) continua abrindo o popover. */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: () => Promise.resolve({ data: null, error: null }), from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; } },
}));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));

import { ValidacaoPoligonosView } from './ValidacaoPoligonosView';

const geo: FazendaGeometria = {
  id: 'g1', fazenda_id: 'faz', cliente_id: 'cli', pasto_id: null, tipo: 'outra', nome_original: 'Gleba 1',
  geojson: { type: 'Polygon', coordinates: [] }, cor: null, created_at: '', updated_at: '',
};

function abrir() {
  render(<ValidacaoPoligonosView geometrias={[geo]} pastos={[]} geoLoading={false} onUpdate={vi.fn()} onDelete={vi.fn()} onLink={vi.fn()} onRefresh={vi.fn()} />);
  fireEvent.click(screen.getAllByText('Gleba 1')[0]);
}

/* MAPA-DICAS-01 (área): um quadrado de ~0,0062° (≈ 45 ha) ligado a um pasto de 41,6 ha */
const geoComPasto: FazendaGeometria = {
  ...geo, id: 'g2', pasto_id: 'p1', tipo: 'pasto', nome_original: 'P_01',
  geojson: { type: 'Polygon', coordinates: [[[-54.03, -19.63], [-54.0238, -19.63], [-54.0238, -19.6362], [-54.03, -19.6362], [-54.03, -19.63]]] },
};
const pasto = { id: 'p1', nome: 'P_01', area_produtiva_ha: 41.6 } as unknown as Pasto;

describe('Validação — a área do polígono (MAPA-DICAS-01)', () => {
  it('a barra mostra a área do mapa e o cadastro com a diferença; o perímetro vai na dica, sem title nativo', async () => {
    render(<ValidacaoPoligonosView geometrias={[geoComPasto]} pastos={[pasto]} geoLoading={false} onUpdate={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getAllByText('P_01')[0]);
    const barra = await screen.findByTestId('validacao-painel-poligono');
    const area = within(barra).getByTestId('validacao-painel-area');
    expect(area.textContent).toMatch(/^\d{2},\d{2} ha · cadastro 41,60 \(\+\d,\d{2}\)$/);
    expect(within(barra).getByTestId('validacao-painel-nome').getAttribute('title')).toBeNull();
    const nome = within(barra).getByTestId('validacao-painel-nome');
    fireEvent.pointerMove(nome); fireEvent.pointerEnter(nome); fireEvent.mouseEnter(nome);
    const dica = await screen.findByTestId('dica-do-mapa');
    expect(dica.textContent).toMatch(/Perímetro: [\d.]+ m/);
  });

  it('sem pasto ligado: só a área, sem "cadastro"', async () => {
    render(<ValidacaoPoligonosView geometrias={[{ ...geoComPasto, pasto_id: null, tipo: 'outra' }]} pastos={[pasto]} geoLoading={false} onUpdate={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getAllByText('P_01')[0]);
    const area = await screen.findByTestId('validacao-painel-area');
    expect(area.textContent).toMatch(/^\d{2},\d{2} ha$/);
  });

  it('a lista tem a coluna "ha": 2 casas, vírgula, "—" quando não há polígono medível', () => {
    render(<ValidacaoPoligonosView geometrias={[geoComPasto, geo]} pastos={[pasto]} geoLoading={false} onUpdate={vi.fn()} onDelete={vi.fn()} onRefresh={vi.fn()} />);
    const celulas = screen.getAllByTestId('validacao-area').map(c => c.textContent);
    expect(celulas[0]).toMatch(/^\d{2},\d{2}$/);
    expect(celulas[1]).toBe('—');
  });
});

describe('Validação — dicas da barra do polígono', () => {
  it('os ícones da barra mostram a dica rica ao focar e não levam `title` nativo', async () => {
    abrir();
    const barra = await screen.findByTestId('validacao-painel-poligono');
    for (const [nome, frase] of [['Vértices', 'Ajustar o contorno'], ['Dividir', 'Cortar este polígono em dois'], ['Apagar', 'Tirar este desenho do mapa'], ['Fechar', 'Fechar o painel sem mudar nada']] as const) {
      const botao = within(barra).getByRole('button', { name: nome });
      expect(botao.getAttribute('title')).toBeNull();
      act(() => { botao.focus(); });
      const dica = await screen.findByTestId('dica-do-mapa');
      expect(dica.textContent).toContain(frase);
      act(() => { botao.blur(); });
    }
  });

  it('Classificar: com a dica no mesmo botão, o clique abre o popover', async () => {
    abrir();
    fireEvent.click(await screen.findByTestId('validacao-classificar'));
    expect(await screen.findByTestId('validacao-popover')).toBeTruthy();
  });
});
