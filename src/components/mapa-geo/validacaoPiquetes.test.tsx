/**
 * MAPA-PIQUETES-02 — o encaixe na Validação: no painel do polígono, "É piquete de…" põe o polígono na espera (nada grava); o rodapé da
 * lista mostra a espera com "Concluir piquetes de R_01"; o diálogo pede a prévia e o Gravar chama `fn_piquetes_concluir` com p_simular =
 * false; depois a tela relê os polígonos (onRefresh) e avisa os pastos (o cliente da fazenda).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';

const estado = vi.hoisted(() => ({ rpc: [] as { fn: string; a: Record<string, unknown> }[], mudou: [] as string[] }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, a: Record<string, unknown>) => {
      estado.rpc.push({ fn, a });
      if (fn !== 'fn_piquetes_concluir') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ error: null, data: a.p_simular ? {
        ok: true, simulado: true, mes: a.p_mes, pai: { id: 'r01', nome: 'R_01', area_oficial_ha: 92.6, encerra_em: '2026-10-31' },
        piquetes: [{ geometria_id: 'g1', nome: '1A', area_ha: 23.63 }, { geometria_id: 'g2', nome: '1B', area_ha: 69.27 }],
        soma_ha: 92.9, dif_ha: 0.3, dif_pct: 0.3, grupo: { nome: 'R_01', area_ha: 92.9 }, frase: '',
      } : { ok: true, simulado: false, grupo_id: 'grupo-novo' } });
    },
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; },
  },
}));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli' } }) }));
vi.mock('@/hooks/usePastos', async (original) => ({
  ...(await original<typeof import('@/hooks/usePastos')>()),
  pastosMudaramPorFora: (c: string) => { estado.mudou.push(c); },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));

import { ValidacaoPoligonosView } from './ValidacaoPoligonosView';

/* MAPA-PIQUETES-04: 1A e 1B são dois quadrados vizinhos (a união deles é o contorno do R_01, que não tem polígono) */
const quadrado = (x: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x, 0], [x + 0.01, 0], [x + 0.01, 0.01], [x, 0.01], [x, 0]]] });
const geo = (id: string, nome: string, x = 0, pasto_id: string | null = null): FazendaGeometria => ({
  id, fazenda_id: 'faz', cliente_id: 'cli', pasto_id, tipo: pasto_id ? 'pasto' : 'outra', nome_original: nome,
  geojson: quadrado(x), cor: null, created_at: '', updated_at: '',
});
const R01: Pasto = {
  id: 'r01', fazenda_id: 'faz', nome: 'R_01', lote_padrao: null, area_produtiva_ha: 92.6, tipo_uso: 'cria', qualidade: null,
  entra_conciliacao: true, ativo: true, observacoes: null, ordem_exibicao: 0, data_inicio: null, data_fim: null, grupo_id: null,
  created_at: '', updated_at: '',
};

beforeEach(() => { estado.rpc = []; estado.mudou = []; });

async function marcar(nome: string) {
  fireEvent.click(screen.getAllByText(nome)[0]);                     // a linha da lista põe o polígono em foco
  fireEvent.click(await screen.findByTestId('validacao-piquete-de'));   // MAPA-ZOOM-E-PAINEL-01: o "É piquete de…" é um popover da barra
  const painel = await screen.findByTestId('marcar-piquete');
  fireEvent.click(within(painel).getByRole('button'));               // abre o "É piquete de…"
  fireEvent.click(await screen.findByRole('button', { name: /^R_01/ }));   // a opção (botão) com o nome e a área
}

describe('Validação — piquetes', () => {
  it('marca 1A e 1B como piquetes de R_01 (nada grava), conclui pela prévia e grava numa chamada; relê polígonos e pastos', async () => {
    const onRefresh = vi.fn();
    render(<ValidacaoPoligonosView geometrias={[geo('g1', '1A', 0), geo('g2', '1B', 0.01)]} pastos={[R01]} geoLoading={false}
      onUpdate={vi.fn()} onDelete={vi.fn()} onLink={vi.fn()} onRefresh={onRefresh} />);

    await marcar('1A');
    await marcar('1B');
    expect(estado.rpc).toEqual([]);                                   // a espera é só da tela

    const espera = screen.getByTestId('piquetes-em-espera');
    expect(espera.textContent).toContain('1A');
    expect(espera.textContent).toContain('1B');
    fireEvent.click(within(espera).getByRole('button', { name: 'Concluir piquetes de R_01' }));

    await waitFor(() => expect(document.querySelector('tr[data-linha="soma"]')?.textContent).toContain('92,90'));
    const previa = estado.rpc[0];
    expect(previa.fn).toBe('fn_piquetes_concluir');
    expect(previa.a.p_simular).toBe(true);
    expect(previa.a.p_pasto_pai).toBe('r01');
    expect([...(Array.isArray(previa.a.p_geometrias) ? previa.a.p_geometrias : [])].sort()).toEqual(['g1', 'g2']);
    // MAPA-PIQUETES-04: o R_01 não tem polígono → o contorno (a união de 1A e 1B: um retângulo, 4 cantos + o fecho) vai junto
    const contorno = previa.a.p_contorno;
    expect(contorno && typeof contorno === 'object' && Reflect.get(contorno, 'type')).toBe('Polygon');
    expect((Reflect.get(Object(contorno), 'coordinates') ?? [])[0]).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'Gravar' }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(estado.rpc.at(-1)?.a.p_simular).toBe(false);
    expect(estado.rpc.at(-1)?.a.p_contorno).toEqual(contorno);
    expect(estado.mudou).toEqual(['cli']);
    expect(screen.queryByTestId('piquetes-em-espera')).toBeNull();     // os concluídos saem da espera
  });
  it('o R_01 que JÁ tem polígono: o contorno dele fica (p_contorno nulo)', async () => {
    render(<ValidacaoPoligonosView geometrias={[geo('g0', 'R_01', 0.05, 'r01'), geo('g1', '1A', 0), geo('g2', '1B', 0.01)]} pastos={[R01]}
      geoLoading={false} onUpdate={vi.fn()} onDelete={vi.fn()} onLink={vi.fn()} onRefresh={vi.fn()} />);
    await marcar('1A');
    await marcar('1B');
    fireEvent.click(within(screen.getByTestId('piquetes-em-espera')).getByRole('button', { name: 'Concluir piquetes de R_01' }));
    await waitFor(() => expect(estado.rpc.length).toBeGreaterThan(0));
    expect(estado.rpc[0].a.p_contorno).toBeNull();
  });
});
