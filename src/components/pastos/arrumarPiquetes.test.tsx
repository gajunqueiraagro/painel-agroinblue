/**
 * FECH-PASTO-UNIDADE-01 F2b — o "É piquete de outro pasto…" (Cadastros › Pastos, só admin): no formato do P5 da PUR (P5A 101 ha + P5B 86,1 ha
 * lado a lado). A prévia e a gravação são do banco (`fn_pastos_viram_piquetes`, 117490): a tela manda os pastos, os nomes, o mês e o
 * contorno (a união dos desenhos pela lib do mapa); com os desenhos sem fechar, ela diz e não deixa ver a prévia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn(async (_fn: string, a: { p_simular: boolean }) => ({ data: a.p_simular
  ? { frase: 'P5 nasce com 187,1 ha em 11/2026; P5A, P5B viram os piquetes P5A, P5B e terminam em 31/10/2026; 1 card(s) passam ao P5 e 1 card(s) vazio(s) saem (o antes fica na trilha).', mantidos: [], saem: [] }
  : { ok: true }, error: null })) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc, from: () => ({}) } }));

import { ArrumarPiquetesDialog, mesesDoInicio, podeVirarPiquete } from './ArrumarPiquetesDialog';

const sq = (x: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x, -21.44], [x + 0.005, -21.44], [x + 0.005, -21.435], [x, -21.435], [x, -21.44]]] });
const geo = (id: string, pasto: string, g: GeoJSON.Geometry) => ({ id, fazenda_id: 'pur', cliente_id: 'c', pasto_id: pasto, tipo: 'pasto', nome_original: id, geojson: g, cor: null, created_at: '', updated_at: '' });
const P5A = { id: 'p5a', nome: 'P5A', area_ha: 101, ativo: true, data_fim: null, grupo_id: null, pai_id: null };
const P5B = { id: 'p5b', nome: 'P5B', area_ha: 86.1, ativo: true, data_fim: null, grupo_id: null, pai_id: null };
const P7 = { id: 'p7', nome: 'P7', area_ha: 97.5, ativo: true, data_fim: null, grupo_id: null, pai_id: null };
const P7A = { id: 'p7a', nome: '7A', area_ha: 24.8, ativo: true, data_fim: null, grupo_id: 'g7', pai_id: 'p7' };

function abrir(geometrias = [geo('g5a', 'p5a', sq(-52.9)), geo('g5b', 'p5b', sq(-52.895))]) {
  const aoGravar = vi.fn(); const onFechar = vi.fn();
  render(<ArrumarPiquetesDialog pastoInicial={P5A} pastos={[P5A, P5B, P7, P7A]} geometrias={geometrias} pais={new Set(['p7'])} onFechar={onFechar} aoGravar={aoGravar} />);
  return { aoGravar, onFechar };
}
const escolher = (nome: string) => {
  fireEvent.click(screen.getByRole('button', { name: /\+ Escolher pasto/ }));
  fireEvent.click(within(screen.getByTestId('searchable-select-painel')).getAllByRole('button').find((b) => (b.textContent ?? '').startsWith(nome))!);
};

beforeEach(() => { rpc.mockClear(); });

describe('quem pode virar piquete', () => {
  it('pasto solto, ativo e sem fim; nem pai, nem piquete, nem de grupo', () => {
    expect(podeVirarPiquete(P5A, new Set(['p7']))).toBe(true);
    expect(podeVirarPiquete(P7, new Set(['p7']))).toBe(false);
    expect(podeVirarPiquete(P7A, new Set(['p7']))).toBe(false);
    expect(podeVirarPiquete({ ...P5B, data_fim: '2026-09-30' }, new Set())).toBe(false);
  });
  it('os meses do início: o de hoje e 11 para trás', () => {
    const m = mesesDoInicio('2026-11-08');
    expect(m[0]).toEqual({ value: '2026-11', label: 'nov/2026' });
    expect(m[1].label).toBe('out/2026');
    expect(m).toHaveLength(12);
  });
});

describe('P5A + P5B viram piquetes do P5', () => {
  it('a lista oferece só quem pode (o P7 e o 7A não); a área do pasto novo é a soma', () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: /\+ Escolher pasto/ }));
    const ops = within(screen.getByTestId('searchable-select-painel')).getAllByRole('button').map((b) => b.textContent ?? '');
    expect(ops.some((t) => t.startsWith('P5B'))).toBe(true);
    expect(ops.some((t) => t.startsWith('P7') || t.startsWith('7A'))).toBe(false);
    fireEvent.click(within(screen.getByTestId('searchable-select-painel')).getAllByRole('button').find((b) => (b.textContent ?? '').startsWith('P5B'))!);
    expect(screen.getByTestId('area-do-pai').textContent).toBe('187,10 ha');
  });

  it('sem o nome do pasto ou com 1 pasto só, a prévia não abre', () => {
    abrir();
    expect((screen.getByTestId('ver-previa-piquetes') as HTMLButtonElement).disabled).toBe(true);
    escolher('P5B');
    expect((screen.getByTestId('ver-previa-piquetes') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('nome-do-pai'), { target: { value: 'P5' } });
    expect((screen.getByTestId('ver-previa-piquetes') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a prévia é a do banco (simular) com os pastos, os nomes, o mês e o contorno = a união; Confirmar grava (simular falso)', async () => {
    const { aoGravar } = abrir();
    escolher('P5B');
    fireEvent.change(screen.getByTestId('nome-do-pai'), { target: { value: 'P5' } });
    fireEvent.click(screen.getByTestId('ver-previa-piquetes'));
    await waitFor(() => expect(screen.getByTestId('frase-da-previa').textContent).toContain('P5 nasce com 187,1 ha'));
    const [fn, a] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('fn_pastos_viram_piquetes');
    expect(a).toMatchObject({ p_pastos: ['p5a', 'p5b'], p_nome_pai: 'P5', p_nomes: ['P5A', 'P5B'], p_simular: true });
    expect(String(a.p_inicio)).toMatch(/^\d{4}-\d{2}-01$/);
    expect((a.p_contorno as GeoJSON.Polygon).type).toBe('Polygon');
    fireEvent.click(screen.getByTestId('confirmar-piquetes'));
    await waitFor(() => expect(aoGravar).toHaveBeenCalledTimes(1));
    expect((rpc.mock.calls[1] as [string, { p_simular: boolean }])[1].p_simular).toBe(false);
  });

  it('os desenhos não fecham numa peça só: a tela diz e a prévia não abre', () => {
    abrir([geo('g5a', 'p5a', sq(-52.9)), geo('g5b', 'p5b', sq(-52.8))]);
    escolher('P5B');
    fireEvent.change(screen.getByTestId('nome-do-pai'), { target: { value: 'P5' } });
    expect(screen.getByTestId('frase-da-previa').textContent).toContain('Os desenhos não fecham numa peça só');
    expect((screen.getByTestId('ver-previa-piquetes') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sem desenho nenhum: sem contorno (o banco aceita)', async () => {
    abrir([]);
    escolher('P5B');
    fireEvent.change(screen.getByTestId('nome-do-pai'), { target: { value: 'P5' } });
    fireEvent.click(screen.getByTestId('ver-previa-piquetes'));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect((rpc.mock.calls[0] as [string, Record<string, unknown>])[1].p_contorno).toBeNull();
  });
});
