/**
 * PIQUETE-VIGENCIA-01 — o diálogo "Mudar mês de início" (as RPCs são MOCKADAS: a 117300 espera o GO). A prévia é a própria função com
 * p_simular = true; D1 = os meses dos últimos 4 a partir de hoje, sem o do início atual; D3 = mês fechado → a frase do banco + o link do Reabrir
 * (o diálogo de sempre) e nada grava; o caminho de volta do gesto mora no mesmo diálogo ("Desfazer a última mudança").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const estado = vi.hoisted(() => ({
  chamadas: [] as { fn: string; a: Record<string, unknown> }[],
  resposta: (_fn: string, _a: Record<string, unknown>): { data: unknown; error: unknown } => ({ data: null, error: null }),
  toasts: [] as string[],
  reabrir: [] as string[],
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (fn: string, a: Record<string, unknown>) => { estado.chamadas.push({ fn, a }); return Promise.resolve(estado.resposta(fn, a)); } },
}));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('sonner', () => ({ toast: { success: (m: string) => { estado.toasts.push(m); }, error: vi.fn() } }));
vi.mock('@/v2/hooks/usePodeAbrir', () => ({ usePodeNaOperacao: () => true }));
vi.mock('@/components/ReabrirP1Dialog', () => ({
  ReabrirP1Dialog: ({ anoMes }: { anoMes: string }) => { estado.reabrir.push(anoMes); return <div data-testid="reabrir-p1">{anoMes}</div>; },
}));

import { MudarInicioDialog } from './PiquetesVolta';

const quad = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const HOJE = new Date(2026, 10, 5);
const PIQUETES = [
  { pastoId: 'p7b', nome: '7B', geojson: quad(-54.02, -19.64, -54.01, -19.63) },
  { pastoId: 'p7a', nome: '7A', geojson: quad(-54.03, -19.64, -54.02, -19.63) },
];

beforeEach(() => { estado.chamadas = []; estado.toasts = []; estado.reabrir = []; estado.resposta = () => ({ data: null, error: null }); });
const rpcs = (fn: string) => estado.chamadas.filter(c => c.fn === fn);
const recusa = (message: string, hint?: string) => ({ data: null, error: { code: 'P0001', message, hint } });

const previaAntecipar = (_fn: string, a: Record<string, unknown>) => ({ error: null, data: {
  ok: true, simulado: a.p_simular, direcao: 'antecipar', meses: ['2026-10'], de: '2026-11-01', para: '2026-10-01',
  pai: { id: 'p7', nome: 'P7', fim_antes: '2026-10-31', fim_depois: '2026-09-30' }, area_pai_ha: 97.3,
  pastos: [{ id: 'p7a', nome: '7A' }, { id: 'p7b', nome: '7B' }], lotacao: { area_grupo_ha: 97.54 }, cards: [], cabecas_antes: 0, card_vai_para: '7A',
  frase: 'P7: os 2 piquetes passam a começar em 10/2026; P7 fica encerrado em 30/09/2026.',
} });

function abrir(aoGravar = vi.fn(), aoFechar = vi.fn()) {
  render(<MudarInicioDialog grupoId="g7" fazendaId="faz" nomeDoPai="P7" paiPastoId="p7" geoDoPai={quad(-54.03, -19.64, -54.01, -19.63)}
    piquetes={PIQUETES} inicioAtual="2026-11-01" hoje={HOJE} aoFechar={aoFechar} aoGravar={aoGravar} />);
  return { aoGravar, aoFechar };
}

describe('Mudar mês de início', () => {
  it('D1: oferece os últimos 4 meses a partir de hoje SEM o do início atual; a prévia chama com p_simular true, o mês mais recente e sem alocar', async () => {
    estado.resposta = previaAntecipar;
    abrir();
    await waitFor(() => expect(screen.getByTestId('volta-frase').textContent).toContain('passam a começar em 10/2026'));
    const botoes = screen.getAllByRole('button').map(b => b.textContent ?? '').filter(t => /^\d{2}\/\d{4}$/.test(t));
    expect(botoes).toEqual(['08/2026', '09/2026', '10/2026']);
    const c = rpcs('fn_piquetes_mudar_inicio');
    expect(c).toHaveLength(1);
    expect(c[0].a).toMatchObject({ p_grupo: 'g7', p_mes: '2026-10-01', p_simular: true, p_alocar: false });
    expect(screen.getByTestId('mudar-inicio-hoje').textContent).toBe('início 11/2026');
  });

  it('antecipar: no mês que muda, ANTES valia o pai e DEPOIS valem os piquetes (com as áreas do banco)', async () => {
    estado.resposta = previaAntecipar;
    abrir();
    await waitFor(() => expect(document.querySelector('tr[data-mes="2026-10"]')).not.toBeNull());
    const cel = [...document.querySelectorAll('tr[data-mes="2026-10"] td')].map(td => td.textContent);
    expect(cel).toEqual(['10/2026', 'P7 · 97,30 ha', '7A–7B (2) · 97,54 ha']);
  });

  it('adiar: o contrário (ANTES os piquetes, DEPOIS o pai)', async () => {
    estado.resposta = (fn, a) => {
      const r = previaAntecipar(fn, a);
      return { error: null, data: { ...Object(r.data), direcao: 'adiar', meses: ['2026-08', '2026-09'] } };
    };
    abrir();
    await waitFor(() => expect(document.querySelector('tr[data-mes="2026-09"]')).not.toBeNull());
    const cel = [...document.querySelectorAll('tr[data-mes="2026-08"] td')].map(td => td.textContent);
    expect(cel).toEqual(['08/2026', '7A–7B (2) · 97,54 ha', 'P7 · 97,30 ha']);
  });

  it('o Gravar só acende com o motivo; com ele chama com p_simular false, avisa a tela e fecha', async () => {
    estado.resposta = previaAntecipar;
    const { aoGravar, aoFechar } = abrir();
    await waitFor(() => expect(screen.getByTestId('volta-bloqueio').textContent).toBe('Diga o motivo para gravar.'));
    const botao = screen.getByTestId('volta-gravar');
    expect(botao.textContent).toBe('Mudar para 10/2026');
    expect(botao).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'criados com 11/2026 por engano' } });
    fireEvent.click(botao);
    await waitFor(() => expect(aoGravar).toHaveBeenCalledTimes(1));
    const gravou = rpcs('fn_piquetes_mudar_inicio').filter(c => c.a.p_simular === false);
    expect(gravou).toHaveLength(1);
    expect(gravou[0].a).toMatchObject({ p_mes: '2026-10-01', p_motivo: 'criados com 11/2026 por engano', p_alocar: false });
    expect(aoFechar).toHaveBeenCalled();
    expect(estado.toasts).toEqual(['Mês de início mudado.']);
  });

  it('D3: mês fechado = a frase do banco NO diálogo + o link do Reabrir (abre o diálogo de sempre no mês do HINT); nada grava', async () => {
    estado.resposta = () => recusa('Os piquetes de P7 não mudam para 09/2026: o fechamento de 09/2026 está fechado. Nada foi gravado.', 'fechamento:2026-09');
    const { aoGravar } = abrir();
    await waitFor(() => expect(screen.getByTestId('volta-recusa').textContent).toContain('o fechamento de 09/2026 está fechado'));
    expect(screen.getByTestId('volta-abaixo-da-recusa').textContent).toContain('09/2026 está fechado:');
    expect(screen.getByTestId('volta-gravar')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByTestId('reabrir-mes'));
    await waitFor(() => expect(screen.getByTestId('reabrir-p1').textContent).toBe('2026-09'));
    expect(aoGravar).not.toHaveBeenCalled();
    expect(rpcs('fn_piquetes_mudar_inicio').every(c => c.a.p_simular === true)).toBe(true);
  });

  it('recusa SEM mês fechado: a frase vai, o link não (a linha fica reservada e vazia)', async () => {
    estado.resposta = () => recusa('Os piquetes de P7 não mudam para 10/2026: 7A já tem card antes de 11/2026. Nada foi gravado.');
    abrir();
    await waitFor(() => expect(screen.getByTestId('volta-recusa').textContent).toContain('7A já tem card'));
    expect(screen.getByTestId('volta-abaixo-da-recusa').textContent).toBe('');
    expect(screen.queryByTestId('reabrir-mes')).toBeNull();
  });

  it('o caminho de volta: "Desfazer a última mudança" lê a prévia do desfazer e grava por ela', async () => {
    estado.resposta = (fn, a) => fn === 'fn_piquetes_mudar_inicio_desfazer' ? { error: null, data: {
      ok: true, simulado: a.p_simular, direcao: 'adiar', meses: ['2026-10'], de: '2026-10-01', para: '2026-11-01', trilha_id: 't1',
      pai: { id: 'p7', nome: 'P7' }, cards: 0, cabecas: 0, frase: 'Desfaz a mudança de 06/11/2026 08:00: os piquetes (7A, 7B) voltam a começar em 11/2026.',
    } } : previaAntecipar(fn, a);
    const { aoGravar } = abrir();
    await waitFor(() => expect(rpcs('fn_piquetes_mudar_inicio')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer a última mudança' }));
    await waitFor(() => expect(screen.getByTestId('volta-frase').textContent).toContain('voltam a começar em 11/2026'));
    expect(rpcs('fn_piquetes_mudar_inicio_desfazer')[0].a).toMatchObject({ p_grupo: 'g7', p_simular: true });
    expect(screen.queryByRole('button', { name: '10/2026' })).toBeNull();
    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'era 11 mesmo' } });
    fireEvent.click(screen.getByTestId('volta-gravar'));
    await waitFor(() => expect(aoGravar).toHaveBeenCalledTimes(1));
    expect(rpcs('fn_piquetes_mudar_inicio_desfazer').filter(c => c.a.p_simular === false)).toHaveLength(1);
    expect(estado.toasts).toEqual(['Mudança de início desfeita.']);
  });
});
