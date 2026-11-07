/**
 * MAPA-LOTES-01 (C2) — o seletor "Cards | Mapa" do Fechamento de pastos: a vista Mapa pinta cada pasto pela MESMA situação do card, o
 * clique abre o MESMO modal (o `abrir` do `useModalDoPasto`), o pasto sem polígono vai para a faixa e abre o card dele, e a escolha
 * guardada no navegador nunca derruba a tela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { lerVista, gravarVista, pastosSemDesenho, COR_DA_SITUACAO } from '@/lib/fechamento/vistaDoFechamento';

const mapa = vi.hoisted(() => ({ props: null as null | Record<string, unknown>, geometrias: [] as unknown[] }));
vi.mock('@/hooks/usePastoGeometrias', () => ({ usePastoGeometrias: () => ({ geometrias: mapa.geometrias, loading: false }) }));
vi.mock('@/components/mapa-geo/MapaDosPastos', () => ({
  MapaDosPastos: (p: Record<string, unknown>) => { mapa.props = p; return <div data-testid="mapa-dos-pastos" />; },
}));
import { MapaDoFechamento } from './MapaDoFechamento';

const QUADRADO: GeoJSON.Geometry = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };
const P13 = { id: 'p13', nome: 'P13' };
const P14 = { id: 'p14', nome: 'P14' };
const P_10 = { id: 'p10', nome: 'P_10' };

beforeEach(() => {
  mapa.props = null;
  mapa.geometrias = [
    { pasto_id: 'p13', tipo: 'pasto', geojson: QUADRADO },
    { pasto_id: 'p14', tipo: 'pasto', geojson: QUADRADO },
    { pasto_id: 'p10', tipo: 'reserva_legal', geojson: QUADRADO },
    { pasto_id: null, tipo: 'area_total', geojson: QUADRADO },
  ];
});

describe('a regra da vista', () => {
  it('sem escolha, escolha estranha ou armazenamento que falha: Cards; só "mapa" abre o Mapa', () => {
    expect(lerVista(() => null)).toBe('cards');
    expect(lerVista(() => 'tabela')).toBe('cards');
    expect(lerVista(() => { throw new Error('bloqueado'); })).toBe('cards');
    expect(lerVista(() => 'mapa')).toBe('mapa');
    expect(() => gravarVista(() => { throw new Error('cheio'); })).not.toThrow();
  });
  it('sem desenho = pasto do mês sem polígono DE PASTO (a reserva com o mesmo id não conta)', () => {
    const sem = pastosSemDesenho([P13, P14, P_10], mapa.geometrias as { tipo: string; pasto_id: string | null }[]);
    expect(sem.map(p => p.id)).toEqual(['p10']);
  });
});

describe('a vista Mapa', () => {
  it('cada pasto do mês com a cor da situação do card, dica com nome · cab. · situação; clique abre o card daquele pasto', () => {
    const onAbrir = vi.fn();
    const situacao = { p13: 'fechado', p14: 'inconsistente', p10: 'nao_iniciado' } as const;
    render(<MapaDoFechamento pastos={[P13, P14, P_10]} situacaoDe={p => situacao[p.id as keyof typeof situacao]}
      cabecasDe={p => (p.id === 'p13' ? 184 : 0)} onAbrir={onAbrir} />);
    const p = mapa.props!;
    const corDe = p.corDe as (id: string) => string;
    expect(corDe('p13')).toBe(COR_DA_SITUACAO.fechado);
    expect(corDe('p14')).toBe(COR_DA_SITUACAO.inconsistente);
    expect((p.dicaDe as (id: string) => string)('p13')).toBe('P13 · 184 cab. · Fechado');
    expect((p.dicaDe as (id: string) => string)('p14')).toBe('P14 · sem cabeças · Inconsistente');
    expect([...(p.pastoIds as Set<string>)].sort()).toEqual(['p10', 'p13', 'p14']);
    (p.onPastoClick as (id: string) => void)('p14');
    expect(onAbrir).toHaveBeenCalledWith(P14);
    /* o sem desenho abre o card dele pela faixa */
    fireEvent.click(screen.getByRole('button', { name: 'P_10' }));
    expect(onAbrir).toHaveBeenLastCalledWith(P_10);
    expect(screen.getByTestId('faixa-sem-desenho').textContent).toContain('Sem desenho no mapa (1):');
  });
  it('fazenda sem mapa importado: diz isso no lugar do mapa (nada de mapa em branco)', () => {
    mapa.geometrias = [];
    render(<MapaDoFechamento pastos={[P13]} situacaoDe={() => 'fechado'} cabecasDe={() => 0} onAbrir={vi.fn()} />);
    expect(mapa.props).toBeNull();
    expect(screen.getByTestId('vista-mapa').textContent).toContain('ainda não tem o mapa importado');
  });
});

describe('o encaixe no Fechamento', () => {
  it('o seletor mora no lugar reservado do TOPO; o Mapa entra no lugar da grade e abre pelo MESMO abrir do modal', () => {
    const f = readFileSync('src/pages/FechamentoTab.tsx', 'utf8');
    const lugar = f.indexOf('data-testid="lugar-seletor-cards-mapa"');
    expect(lugar).toBeGreaterThan(0);
    expect(f.slice(lugar, lugar + 300)).toContain('<Segmentado valor={vista} onEscolher={escolherVista}');
    expect(f).toContain(") : vista === 'mapa' ? (\n          <MapaDoFechamento pastos={pastosAtivos} situacaoDe={getPastoStatus} onAbrir={handleOpenPasto}");
    expect(f).toContain('const handleOpenPasto = modalDoPasto.abrir;');
  });
});
