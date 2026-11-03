/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2b — os três diálogos do caminho de volta (as RPCs são MOCKADAS: o GO do banco é depois):
 * a prévia chama com p_simular = true e mostra a tabela e a frase; o Gravar chama com false (e exige o motivo); a recusa do banco aparece NO
 * diálogo, que não fecha e não avisa a tela.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const estado = vi.hoisted(() => ({
  chamadas: [] as { fn: string; a: Record<string, unknown> }[],
  resposta: (_fn: string, _a: Record<string, unknown>): { data: unknown; error: unknown } => ({ data: null, error: null }),
  toasts: [] as string[],
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, a: Record<string, unknown>) => { estado.chamadas.push({ fn, a }); return Promise.resolve(estado.resposta(fn, a)); },
    from: () => ({ select: () => ({ in: async (_c: string, ids: string[]) => ({ data: ids.map(id => ({ id, versao: 7 })), error: null }) }) }),
  },
}));
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('sonner', () => ({ toast: { success: (m: string) => { estado.toasts.push(m); }, error: vi.fn() } }));

import { DesfazerPiquetesDialog, JuntarDialog, MoverLinhaDialog } from './PiquetesVolta';

const quad = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const A = quad(-54.03, -19.64, -54.02, -19.63);
const B = quad(-54.02, -19.64, -54.01, -19.63);
const A2 = quad(-54.03, -19.64, -54.0195, -19.63);
const B2 = quad(-54.0195, -19.64, -54.01, -19.63);
const HOJE = new Date(2026, 10, 2);

beforeEach(() => { estado.chamadas = []; estado.toasts = []; estado.resposta = () => ({ data: null, error: null }); });
const rpcs = (fn: string) => estado.chamadas.filter(c => c.fn === fn);
const recusaDoBanco = (message: string, code = 'P0001') => ({ data: null, error: { code, message } });

describe('Mover linha', () => {
  const a = { pastoId: 'pA', geoId: 'gA', nome: '6A', antes: A, depois: A2 };
  const b = { pastoId: 'pB', geoId: 'gB', nome: '6B', antes: B, depois: B2 };
  const respostaBoa = (_fn: string, args: Record<string, unknown>) => ({ error: null, data: {
    ok: true, simulado: args.p_simular, mes: '2026-11-01', gesto_id: 'x',
    itens: [{ pasto_id: 'pA', nome: '6A', situacao: 'muda', area_antes: 117.5, area_mapa: 123.4, dif_ha: 5.9, dif_pct: 5.0 },
      { pasto_id: 'pB', nome: '6B', situacao: 'muda', area_antes: 117.5, area_mapa: 111.6, dif_ha: -5.9, dif_pct: -5.0 }],
    soma_antes_ha: 235, soma_depois_ha: 235, dif_soma_ha: 0, area_muda: true, frase: 'A linha entre 6A e 6B muda; a área oficial vale a do mapa a partir de 11/2026.',
  } });

  it('a prévia chama com p_simular true, as DUAS divisões (versão lida na hora) e o mês atual; mostra a tabela e a frase', async () => {
    estado.resposta = respostaBoa;
    render(<MoverLinhaDialog fazendaId="faz" a={a} b={b} hoje={HOJE} aoFechar={vi.fn()} aoGravar={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('tr[data-linha="soma"]')?.textContent).toContain('235,00'));
    const c = rpcs('fn_piquetes_mover_linha');
    expect(c).toHaveLength(1);
    expect(c[0].a.p_simular).toBe(true);
    expect(c[0].a.p_fazenda_id).toBe('faz');
    expect(c[0].a.p_mes).toBe('2026-11-01');
    const alterar = Reflect.get(Object(c[0].a.p_gesto), 'alterar');
    expect(alterar).toHaveLength(2);
    expect(alterar.map((x: { id: string; versao: number }) => `${x.id}:${x.versao}`)).toEqual(['gA:7', 'gB:7']);
    expect(document.querySelector('tr[data-divisao="6A"]')?.textContent).toContain('117,50');
    expect(screen.getByTestId('volta-frase').textContent).toContain('A linha entre 6A e 6B muda');
  });

  it('o Gravar só acende com o motivo (e diz por quê); com ele chama com p_simular false e avisa a tela', async () => {
    estado.resposta = respostaBoa;
    const aoGravar = vi.fn(); const aoFechar = vi.fn();
    render(<MoverLinhaDialog fazendaId="faz" a={a} b={b} hoje={HOJE} aoFechar={aoFechar} aoGravar={aoGravar} />);
    await waitFor(() => expect(screen.getByTestId('volta-bloqueio').textContent).toBe('Diga o motivo para gravar.'));
    const botao = screen.getByTestId('volta-gravar');
    expect(botao).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'divisa errada' } });
    expect(botao).toHaveProperty('disabled', false);
    fireEvent.click(botao);
    await waitFor(() => expect(aoGravar).toHaveBeenCalledTimes(1));
    const gravou = rpcs('fn_piquetes_mover_linha').filter(c => c.a.p_simular === false);
    expect(gravou).toHaveLength(1);
    expect(gravou[0].a.p_motivo).toBe('divisa errada');
    expect(aoFechar).toHaveBeenCalled();
    expect(estado.toasts).toEqual(['Linha movida.']);
  });

  it('recusa do banco no Gravar (P0001) aparece NO diálogo; ele não fecha, não avisa a tela e nenhum toast sai', async () => {
    estado.resposta = (fn, args) => (args.p_simular === false ? recusaDoBanco('A área oficial não muda em 11/2026: 6A — mês fechado. Nada foi gravado.') : respostaBoa(fn, args));
    const aoGravar = vi.fn(); const aoFechar = vi.fn();
    render(<MoverLinhaDialog fazendaId="faz" a={a} b={b} hoje={HOJE} aoFechar={aoFechar} aoGravar={aoGravar} />);
    await waitFor(() => expect(document.querySelector('tr[data-linha="soma"]')).toBeTruthy());
    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'ajuste' } });
    fireEvent.click(screen.getByTestId('volta-gravar'));
    await waitFor(() => expect(screen.getByTestId('volta-recusa').textContent).toContain('mês fechado'));
    expect(aoGravar).not.toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();
    expect(estado.toasts).toEqual([]);
    expect(screen.getByTestId('mover-linha-dialogo')).toBeTruthy();
  });

  it('recusa na própria prévia e 40001 ("alguém mexeu") também vão para o diálogo, sem tabela e com o Gravar travado', async () => {
    estado.resposta = () => recusaDoBanco('versão', '40001');
    render(<MoverLinhaDialog fazendaId="faz" a={a} b={b} hoje={HOJE} aoFechar={vi.fn()} aoGravar={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('volta-recusa').textContent).toContain('Recarregue a tela'));
    expect(document.querySelector('tr[data-linha="soma"]')).toBeNull();
    expect(screen.getByTestId('volta-gravar')).toHaveProperty('disabled', true);
  });
});

describe('Juntar', () => {
  const fica = { pastoId: 'pA', geoId: 'gA', nome: '6A', geojson: A };
  const sai = { pastoId: 'pB', geoId: 'gB', nome: '6B', geojson: B };
  const uniao = quad(-54.03, -19.64, -54.01, -19.63);
  const boa = (_fn: string, args: Record<string, unknown>) => ({ error: null, data: {
    ok: true, simulado: args.p_simular, mes: '2026-11-01',
    fica: { id: 'pA', nome: '6A', area_antes_ha: 117.5, area_depois_ha: 235 }, sai: { id: 'pB', nome: '6B', area_antes_ha: 117.5, encerra_em: '2026-10-31' },
    grupo: { id: 'g', nome: 'R_01', divisoes: 3 }, frase: '6A absorve 6B a partir de 11/2026 (235,00 ha).',
  } });

  it('a prévia manda A (fica), B (sai), a união como Polygon e as duas versões; mostra "até 31/10/2026" e a frase', async () => {
    estado.resposta = boa;
    render(<JuntarDialog fica={fica} sai={sai} uniao={uniao} hoje={HOJE} aoFechar={vi.fn()} aoGravar={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('tr[data-divisao="6B"]')?.textContent).toContain('até 31/10/2026'));
    const c = rpcs('fn_piquetes_juntar')[0];
    expect(c.a).toMatchObject({ p_fica: 'pA', p_sai: 'pB', p_mes: '2026-11-01', p_simular: true });
    const desenho = Object(c.a.p_desenho);
    expect(Reflect.get(Object(Reflect.get(desenho, 'geojson')), 'type')).toBe('Polygon');
    expect([Reflect.get(desenho, 'versao_fica'), Reflect.get(desenho, 'versao_sai')]).toEqual([7, 7]);
    expect(screen.getByTestId('volta-frase').textContent).toContain('6A absorve 6B');
  });

  it('grava com o motivo (p_simular false); a recusa do banco fica no diálogo', async () => {
    estado.resposta = (fn, args) => (args.p_simular === false ? recusaDoBanco('6B já tem, de 11/2026 em diante: 2 movimentação(ões) de gado. Nada foi gravado.') : boa(fn, args));
    const aoGravar = vi.fn(); const aoFechar = vi.fn();
    render(<JuntarDialog fica={fica} sai={sai} uniao={uniao} hoje={HOJE} aoFechar={aoFechar} aoGravar={aoGravar} />);
    await waitFor(() => expect(document.querySelector('tr[data-divisao="6A"]')).toBeTruthy());
    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'sobrou' } });
    fireEvent.click(screen.getByTestId('volta-gravar'));
    await waitFor(() => expect(screen.getByTestId('volta-recusa').textContent).toContain('movimentação(ões) de gado'));
    expect(rpcs('fn_piquetes_juntar').filter(c => c.a.p_simular === false)).toHaveLength(1);
    expect(aoGravar).not.toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

describe('Desfazer piquetes', () => {
  const desenhos = new Map<string, GeoJSON.Geometry>([['g1', A], ['g2', B], ['z', quad(-54.0, -19.6, -53.99, -19.59)]]);
  const boa = (_fn: string, args: Record<string, unknown>) => ({ error: null, data: {
    ok: true, simulado: args.p_simular, modo: 'criados', pai: { id: 'pai', nome: 'R_01', volta_a_valer: true }, grupo: { id: 'grp', nome: 'R_01', desativado: true },
    divisoes: [{ id: 'd1', nome: '1A', fica_inativo: true }, { id: 'd2', nome: '1B', fica_inativo: true }],
    poligonos: [{ id: 'g1', nome: '1A', pasto_id: 'd1', destino: 'apagar' }, { id: 'g2', nome: '1B', pasto_id: 'd2', destino: 'soltar' }],
    areas: [{ id: 'z', nome: 'Praça', tipo: 'benfeitoria' }],
    frase: 'R_01 volta a ser um pasto só; as 2 divisões ficam inativas.',
  } });

  it('a prévia lista o que sai do mapa, o que volta a ficar sem classificação, as divisões inativas e a frase', async () => {
    estado.resposta = boa;
    render(<DesfazerPiquetesDialog grupoId="grp" nomeDoPai="R_01" geoDoPai={A} desenhos={desenhos} aoFechar={vi.fn()} aoGravar={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('tr[data-desenho="1A"]')?.textContent).toContain('sai do mapa'));
    expect(document.querySelector('tr[data-desenho="1B"]')?.textContent).toContain('fica sem classificação');
    expect(document.querySelector('tr[data-desenho="Praça"]')?.textContent).toContain('sai do mapa');
    expect(screen.getByTestId('desfazer-inativas').textContent).toContain('1A, 1B');
    expect(screen.getByTestId('volta-frase').textContent).toContain('volta a ser um pasto só');
    const c = rpcs('fn_piquetes_desfazer')[0];
    expect(c.a).toMatchObject({ p_grupo: 'grp', p_simular: true });
  });

  it('o motivo é obrigatório; grava com p_simular false; recusa do banco fica no diálogo', async () => {
    estado.resposta = (fn, args) => (args.p_simular === false ? recusaDoBanco('Os piquetes de R_01 não se desfazem: 1A tem 3 movimentação(ões) de gado. Nada foi gravado.') : boa(fn, args));
    const aoGravar = vi.fn(); const aoFechar = vi.fn();
    render(<DesfazerPiquetesDialog grupoId="grp" nomeDoPai="R_01" geoDoPai={A} desenhos={desenhos} aoFechar={aoFechar} aoGravar={aoGravar} />);
    await waitFor(() => expect(document.querySelector('tr[data-desenho="1A"]')).toBeTruthy());
    expect(screen.getByTestId('volta-gravar')).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'erro de desenho' } });
    fireEvent.click(screen.getByTestId('volta-gravar'));
    await waitFor(() => expect(screen.getByTestId('volta-recusa').textContent).toContain('não se desfazem'));
    const gravou = rpcs('fn_piquetes_desfazer').filter(c => c.a.p_simular === false);
    expect(gravou).toHaveLength(1);
    expect(gravou[0].a.p_motivo).toBe('erro de desenho');
    expect(aoGravar).not.toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();
  });
});
