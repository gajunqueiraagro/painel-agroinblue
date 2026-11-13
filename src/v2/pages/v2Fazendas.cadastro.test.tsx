/** FAZENDA-CADASTRO-01 · F1a/F1b — a tela REAL (V2Fazendas) com banco simulado: a lista de fazendas (área sem contar piquete duas vezes,
 *  fazenda sem pasto com "—", a administrativa à parte, rebanho e lotação do último fechamento) e o cadastro (Salvar só com mudança,
 *  Cancelar volta ao lido, CCIR grava, erro ao lado do Salvar e nunca em toast). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';

const b = vi.hoisted(() => ({
  global: true,
  upserts: [] as Record<string, unknown>[],
  erroNoUpsert: false,
  toastErro: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const linhas = (t: string, eq: Record<string, unknown>): unknown[] => {
    const daFaz = (ls: Record<string, unknown>[]) => (eq.fazenda_id ? ls.filter(l => l.fazenda_id === eq.fazenda_id) : ls);
    if (t === 'fazenda_cadastros') return daFaz([
      { id: 'cad-f1', fazenda_id: 'f1', cliente_id: 'cli', municipio: 'Coxim', estado: 'MS', car: null, nirf: '1', ccir: null, ie: '28', roteiro: null,
        area_total_ha: 300, matricula_conferida_em: null },
    ]);
    if (t === 'zoot_mensal_cache') return daFaz([
      { fazenda_id: 'f1', ano_mes: '2026-01', saldo_inicial: 390, saldo_final: 395, fonte_oficial_mes: 'fechamento' },
      { fazenda_id: 'f1', ano_mes: '2026-01', saldo_inicial: 90, saldo_final: 92, fonte_oficial_mes: 'fechamento' },
      { fazenda_id: 'f1', ano_mes: '2026-10', saldo_final: 400, fonte_oficial_mes: 'fechamento' },
      { fazenda_id: 'f1', ano_mes: '2026-10', saldo_final: 100, fonte_oficial_mes: 'fechamento' },
    ]);
    if (t === 'saldos_iniciais') return daFaz([{ fazenda_id: 'f1', ano: 2024, mes: 1, quantidade: 450 }]);
    if (t === 'fazenda_geometrias') return eq.tipo === 'area_fazenda' ? [] : [{ pasto_id: 'pai' }];
    if (t === 'audit_log') return [];
    return [];
  };
  const cadeia = (t: string) => {
    const eq: Record<string, unknown> = {};
    let um = false;
    const p: Record<string, unknown> = {};
    const eu = () => p;
    Object.assign(p, {
      select: eu, in: eu, gt: eu, gte: eu, lte: eu, not: eu, order: eu, limit: eu,
      eq: (k: string, v: unknown) => { eq[k] = v; return p; },
      maybeSingle: () => { um = true; return p; },
      single: () => { um = true; return p; },
      upsert: (payload: Record<string, unknown>) => { b.upserts.push(payload); return p; },
      update: eu,
      then: (ok: (r: unknown) => unknown) => {
        if (b.erroNoUpsert && b.upserts.length > 0 && t === 'fazenda_cadastros' && um) return Promise.resolve({ data: null, error: { message: 'x' } }).then(ok);
        const ls = linhas(t, eq);
        return Promise.resolve({ data: um ? ls[0] ?? null : ls, error: null }).then(ok);
      },
    });
    return p;
  };
  return {
    supabase: {
      from: (t: string) => cadeia(t),
      rpc: async (fn: string) => {
        if (fn === 'fn_lotacao_do_mes') return { data: [{ pasto_id: 'pai', area_ha: 100, ua: 80 }], error: null };
        if (fn === 'fn_pastos_area_comparar') return { data: [{ pasto_id: 'pai', area_mapa_ha: 98, n_poligonos: 1 }, { pasto_id: 'lav', area_mapa_ha: null, n_poligonos: 0 }], error: null };
        return { data: null, error: null };
      },
    },
  };
});
vi.mock('sonner', () => ({ toast: { error: b.toastErro, success: vi.fn() } }));

const FAZ = [
  { id: 'f1', nome: 'Santa Clara', codigo: 'SCL', codigo_importacao: 'SCL', status_operacional: 'ativa', cliente_id: 'cli', owner_id: 'u' },
  { id: 'f2', nome: 'Lagoa Seca', codigo: 'LGS', codigo_importacao: 'LGS', status_operacional: 'ativa', cliente_id: 'cli', owner_id: 'u' },
  { id: 'f3', nome: 'Administrativo', codigo: 'ADM', codigo_importacao: 'ADM', status_operacional: 'ativa', cliente_id: 'cli', owner_id: 'u' },
];
const setFazendaAtual = vi.fn();
vi.mock('@/contexts/FazendaContext', () => ({
  GLOBAL_FAZENDA: { id: '__global__', nome: 'Global', owner_id: '' },
  useFazenda: () => ({
    fazendas: FAZ, fazendaAtual: b.global ? { id: '__global__', nome: 'Global' } : FAZ[0], isGlobal: b.global,
    setFazendaAtual, reloadFazendas: vi.fn(async () => {}), criarFazenda: vi.fn(),
  }),
}));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
const PASTO = (id: string, ha: number, tipo: string, pai_id: string | null = null) => ({ id, fazenda_id: 'f1', nome: id, area_produtiva_ha: ha, tipo_uso: tipo,
  ativo: true, data_inicio: '2024-01-01', data_fim: null, pai_id, lote_padrao: null, qualidade: null, entra_conciliacao: false, observacoes: null, ordem_exibicao: 0 });
vi.mock('@/hooks/usePastos', async (orig) => ({
  ...(await orig<typeof import('@/hooks/usePastos')>()),
  usePastos: () => ({ pastos: [PASTO('pai', 100, 'cria'), PASTO('q1', 50, 'cria', 'pai'), PASTO('q2', 50, 'cria', 'pai'), PASTO('lav', 200, 'agricultura')] }),
}));
vi.mock('@/pages/PastosTab', () => ({ PastosTab: () => null }));
vi.mock('@/hooks/useLancamentos', () => ({ useLancamentos: () => ({ saldosIniciais: [], setSaldoInicial: vi.fn(), lancamentos: [] }) }));
vi.mock('@/hooks/useStatusPilares', () => ({ useStatusPilares: () => ({ status: { p1_mapa_pastos: { status: 'aberto' } } }) }));

import { V2Fazendas } from './V2Fazendas';

beforeEach(() => { b.upserts = []; b.erroNoUpsert = false; b.toastErro.mockReset(); setFazendaAtual.mockReset(); });

describe('FAZENDA-CADASTRO-01 · lista de fazendas', () => {
  beforeEach(() => { b.global = true; });
  it('uma linha por fazenda; piquete não conta duas vezes; sem pasto = "—"; administrativa à parte; rebanho e lotação do fechamento', async () => {
    render(<V2Fazendas />);
    const linhas = await screen.findAllByTestId('fazenda-linha');
    expect(linhas).toHaveLength(2);
    const scl = linhas.find(l => l.textContent?.includes('Santa Clara'))!;
    await waitFor(() => expect(within(scl).getByText('500')).toBeTruthy());
    const cel = within(scl).getAllByRole('cell').map(c => c.textContent);
    /* matrícula 300 · pastos 300 (pai 100 + lavoura 200; os piquetes 50+50 ficam fora) · diferença 0 · 2 pastos · 1 no mapa · 500 cab
       · no ano ▲ 20 (contra o saldo inicial de jan 480) · 0,80 */
    expect(cel.slice(5, 13)).toEqual(['300,00', '300,00', '0,00', '2', '1', '500', '▲ 20 · 4,2%', '0,80']);
    expect(within(scl).getByTestId('fazenda-no-ano').getAttribute('title')).toBe('▲ 20 cab. · ▲ 4,2% no ano (saldo inicial 480)');
    expect(within(scl).getByTestId('fazenda-no-ano').className).toContain('text-emerald-700');
    expect(screen.getByTestId('kpi-rebanho-no-ano').textContent).toBe('▲ 20 cab. · ▲ 4,2% no ano');
    expect(cel[4]).toBe('Cria · Agricultura');
    expect(cel[13]).toBe('CAR · roteiro');
    const lgs = linhas.find(l => l.textContent?.includes('Lagoa Seca'))!;
    expect(within(lgs).getAllByRole('cell').map(c => c.textContent).slice(5, 8)).toEqual(['—', '—', '—']);
    expect(screen.getByTestId('fazenda-administrativa').textContent).toContain('Administrativo (ADM)');
    fireEvent.click(scl);
    expect(setFazendaAtual).toHaveBeenCalledWith(FAZ[0]);
  });
});

describe('FAZENDA-CADASTRO-01 · cadastro', () => {
  beforeEach(() => { b.global = false; });
  it('Salvar só com mudança; Cancelar volta ao lido; CCIR vai na gravação; contadores nas abas', async () => {
    render(<V2Fazendas />);
    const salvar = await screen.findByTestId('cadastro-salvar');
    await waitFor(() => expect(screen.getByTestId('cadastro-municipio')).toHaveProperty('value', 'Coxim'));
    expect(salvar).toBeDisabled();
    expect(screen.getByTestId('cadastro-frase-salvar').textContent).toBe('Nada a salvar: o cadastro já está assim.');
    expect(screen.getByTestId('cadastro-aba-pastos').textContent).toBe('Pastos 2');
    await waitFor(() => expect(screen.getByTestId('cadastro-aba-rebanho').textContent).toBe('Rebanho inicial 450 cab'));
    expect(screen.getByTestId('cadastro-pendencias').textContent).toContain('CAR · roteiro');
    await waitFor(() => expect(screen.getByTestId('cadastro-rebanho-no-ano').textContent).toBe('▲ 20 cab. · ▲ 4,2% no ano'));
    /* a soma dos pastos do cadastro: pai 100 + lavoura 200 = 300 (os piquetes 50+50 ficam dentro do pai), diferença 0 com a matrícula */
    const medidas = screen.getByTestId('cadastro-tres-medidas').textContent ?? '';
    expect(medidas).toContain('Soma dos pastos (cadastro)300,00 ha');
    expect(medidas).toContain('diferença 0,00 ha');
    expect(medidas).toContain('Pastos desenhados · 1 de 2');
    expect(medidas).toContain('falta 1 pasto no mapa');
    expect(medidas).not.toContain('da matrícula');

    fireEvent.change(screen.getByTestId('cadastro-ccir'), { target: { value: '950.123' } });
    expect(salvar).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('cadastro-cancelar'));
    expect(screen.getByTestId('cadastro-ccir')).toHaveProperty('value', '');
    expect(salvar).toBeDisabled();

    fireEvent.change(screen.getByTestId('cadastro-ccir'), { target: { value: '950.123' } });
    fireEvent.click(salvar);
    await waitFor(() => expect(b.upserts).toHaveLength(1));
    expect(b.upserts[0]).toMatchObject({ ccir: '950.123', municipio: 'Coxim', fazenda_id: 'f1' });
  });

  it('nome vazio não grava: a frase fica ao lado do Salvar, nunca em toast', async () => {
    render(<V2Fazendas />);
    await waitFor(() => expect(screen.getByTestId('cadastro-nome')).toHaveProperty('value', 'Santa Clara'));
    fireEvent.change(screen.getByTestId('cadastro-nome'), { target: { value: '  ' } });
    fireEvent.click(screen.getByTestId('cadastro-salvar'));
    expect(screen.getByTestId('cadastro-frase-salvar').textContent).toBe('Falta o nome da fazenda.');
    expect(b.upserts).toHaveLength(0);
    expect(b.toastErro).not.toHaveBeenCalled();
  });
});
