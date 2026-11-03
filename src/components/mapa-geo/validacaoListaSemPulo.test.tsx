/* MAPA-LISTA-SEM-PULO-01 — marcar a caixa de um polígono não desloca a lista: a faixa de ações e o selo da seleção existem SEMPRE
   (com 0 marcados os botões que dependem da seleção ficam à vista, inativos, com o motivo no `title`). */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: () => Promise.resolve({ data: null, error: null }), from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; } },
}));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));

import { ValidacaoPoligonosView } from './ValidacaoPoligonosView';

const poligono = (id: string, nome: string): FazendaGeometria => ({
  id, fazenda_id: 'faz', cliente_id: 'cli', pasto_id: null, tipo: 'outra', nome_original: nome, cor: null, created_at: '', updated_at: '',
  geojson: { type: 'Polygon', coordinates: [[[-54.03, -19.63], [-54.0238, -19.63], [-54.0238, -19.6362], [-54.03, -19.6362], [-54.03, -19.63]]] },
});

const props = { pastos: [], geoLoading: false, onUpdate: vi.fn(), onDelete: vi.fn(), onRefresh: vi.fn() };
const geometrias = [poligono('a', 'P_01'), poligono('b', 'P_02'), poligono('c', 'P_03')];

const botoes = () => ({
  todos: screen.queryByTestId('validacao-selecionar-todos'),
  unir: screen.queryByTestId('unir-selecionados'),
  apagar: screen.queryByTestId('apagar-selecionados'),
  semClassificacao: screen.queryByTestId('apagar-sem-classificacao'),
});

describe('Validação — a lista não pula com a seleção', () => {
  it('com 0 marcados a faixa e os 4 botões existem, inativos com o motivo no title; com 1 o Apagar fica ativo', () => {
    render(<ValidacaoPoligonosView {...props} geometrias={geometrias} />);
    const faixa0 = screen.getByTestId('validacao-lista-acoes');
    const contador0 = screen.getByTestId('validacao-contador');
    const b0 = botoes();
    expect(b0.todos).not.toBeNull(); expect(b0.unir).not.toBeNull(); expect(b0.apagar).not.toBeNull(); expect(b0.semClassificacao).not.toBeNull();
    expect((b0.unir as HTMLButtonElement).disabled).toBe(true);
    expect((b0.apagar as HTMLButtonElement).disabled).toBe(true);
    expect((b0.todos as HTMLButtonElement).disabled).toBe(false);
    expect((b0.semClassificacao as HTMLButtonElement).disabled).toBe(false); // há 3 sem classificação
    expect(b0.unir?.getAttribute('title')).toBe('Marque pelo menos 2 polígonos para unir');
    expect(b0.apagar?.getAttribute('title')).toBe('Marque polígonos para apagar');
    expect(contador0.textContent).toContain('0 selecionados');

    const caixas = screen.getAllByRole('checkbox');
    fireEvent.click(caixas[0]);
    expect(screen.getByTestId('validacao-lista-acoes')).toBe(faixa0); // o MESMO elemento (nada montou/desmontou)
    expect(screen.getByTestId('validacao-contador')).toBe(contador0);
    expect(contador0.textContent).toContain('1 selecionados');
    const b1 = botoes();
    expect(b1.unir).toBe(b0.unir); expect(b1.apagar).toBe(b0.apagar); expect(b1.todos).toBe(b0.todos); expect(b1.semClassificacao).toBe(b0.semClassificacao);
    expect((b1.apagar as HTMLButtonElement).disabled).toBe(false);
    expect((b1.unir as HTMLButtonElement).disabled).toBe(true); // Unir pede 2+
    expect(b1.unir?.getAttribute('title')).toBe('Marque pelo menos 2 polígonos para unir');

    fireEvent.click(caixas[1]);
    expect((botoes().unir as HTMLButtonElement).disabled).toBe(false);
  });

  it('sem nenhum polígono sem classificação o "Apagar sem classificação" fica inativo e diz por quê', () => {
    render(<ValidacaoPoligonosView {...props} geometrias={[{ ...poligono('a', 'P_01'), tipo: 'pasto' }]} />);
    const b = botoes().semClassificacao as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('title')).toBe('Nenhum polígono sem classificação para apagar');
  });
});
