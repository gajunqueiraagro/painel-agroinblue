/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2b — o ENCAIXE do caminho de volta na Validação (as RPCs são mockadas): os ícones só aparecem onde se aplicam
 * (divisão de um grupo que nasceu de um pasto; o pai), cada um abre o gesto certo, a união que não dá um Polygon trava no popover, e a
 * barra do Mover linha trava a prévia quando o gesto tocou mais (ou outros) que as duas divisões do grupo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';

const estado = vi.hoisted(() => ({
  rpcs: [] as { fn: string; a: Record<string, unknown> }[],
  mudou: [] as string[],
  sobre: {} as Record<string, unknown>,
  uniaoFalha: false,
}));
vi.mock('@/integrations/supabase/client', () => {
  const GRUPOS = [{ id: 'g1', nome: 'R_01', pasto_origem_id: 'pai', ativo: true }];
  const q = (tabela: string) => {
    const c = {
      select: () => c, in: () => c, eq: () => c,
      not: async () => ({ data: tabela === 'pasto_grupos' ? GRUPOS : [], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (ok: (v: { data: unknown; error: null }) => unknown) => ok({ data: [{ id: 'gA', versao: 5 }, { id: 'gB', versao: 6 }], error: null }),
    };
    return c;
  };
  return {
    supabase: {
      from: (t: string) => q(t),
      rpc: (fn: string, a: Record<string, unknown>) => {
        estado.rpcs.push({ fn, a });
        if (fn === 'fn_piquetes_juntar') return Promise.resolve({ error: null, data: { ok: true, simulado: a.p_simular, mes: '2026-11-01',
          fica: { id: 'pA', nome: '6A', area_antes_ha: 117, area_depois_ha: 234 }, sai: { id: 'pB', nome: '6B', area_antes_ha: 117, encerra_em: '2026-10-31' },
          grupo: { id: 'g1', nome: 'R_01', divisoes: 2 }, frase: '6A absorve 6B.' } });
        if (fn === 'fn_piquetes_desfazer') return Promise.resolve({ error: null, data: { ok: true, simulado: a.p_simular, modo: 'criados',
          pai: { id: 'pai', nome: 'R_01', volta_a_valer: true }, grupo: { id: 'g1', nome: 'R_01' }, divisoes: [{ id: 'pA', nome: '6A', fica_inativo: true }],
          poligonos: [{ id: 'gA', nome: '6A', destino: 'apagar' }], areas: [], frase: 'R_01 volta a ser um pasto só.' } });
        if (fn === 'fn_piquetes_mover_linha') return Promise.resolve({ error: null, data: { ok: true, simulado: a.p_simular, itens: [], soma_antes_ha: 234, soma_depois_ha: 234,
          dif_soma_ha: 0, area_muda: false, frase: 'A linha muda.' } });
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
});
vi.mock('@/hooks/useStableLeafletMap', () => ({
  useStableLeafletMap: () => ({ mapContainerRef: { current: null }, mapInstanceRef: { current: null }, featureLayerRef: { current: null }, status: 'waiting_container' }),
}));
vi.mock('@/contexts/FazendaContext', () => ({ useFazenda: () => ({ fazendaAtual: { id: 'faz', cliente_id: 'cli' } }) }));
vi.mock('@/hooks/usePastos', async (original) => ({
  ...(await original<typeof import('@/hooks/usePastos')>()),
  pastosMudaramPorFora: (c: string) => { estado.mudou.push(c); },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() } }));
vi.mock('@/hooks/useEdicaoDoPoligono', async (orig) => {
  const real = await orig<typeof import('@/hooks/useEdicaoDoPoligono')>();
  return { ...real, useEdicaoDoPoligono: (args: Parameters<typeof real.useEdicaoDoPoligono>[0]) => ({ ...real.useEdicaoDoPoligono(args), ...estado.sobre }) };
});
vi.mock('@/lib/mapa/piquetesVolta', async (orig) => {
  const real = await orig<typeof import('@/lib/mapa/piquetesVolta')>();
  return {
    ...real,
    uniaoDasDuas: (f: { id: string; nome: string; geojson: GeoJSON.Geometry }, s: { id: string; nome: string; geojson: GeoJSON.Geometry }) =>
      (estado.uniaoFalha ? { ok: false as const, motivo: `${f.nome} e ${s.nome} não são vizinhas: a união não ficou numa peça só.` } : real.uniaoDasDuas(f, s)),
  };
});

import { ValidacaoPoligonosView } from './ValidacaoPoligonosView';

const quad = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const A = quad(-54.03, -19.64, -54.02, -19.63);
const B = quad(-54.02, -19.64, -54.01, -19.63);
const A2 = quad(-54.03, -19.64, -54.0195, -19.63);
const B2 = quad(-54.0195, -19.64, -54.01, -19.63);
const geo = (id: string, nome: string, pasto: string | null, g: GeoJSON.Polygon): FazendaGeometria => ({
  id, fazenda_id: 'faz', cliente_id: 'cli', pasto_id: pasto, tipo: pasto ? 'pasto' : 'outra', nome_original: nome, geojson: g, cor: null, created_at: '', updated_at: '',
});
const pasto = (id: string, nome: string, grupo: string | null): Pasto => ({
  id, fazenda_id: 'faz', nome, lote_padrao: null, area_produtiva_ha: 100, tipo_uso: 'cria', qualidade: null, entra_conciliacao: true, ativo: true,
  observacoes: null, ordem_exibicao: 0, data_inicio: null, data_fim: null, grupo_id: grupo, created_at: '', updated_at: '',
});
const GEOMETRIAS = [geo('gPai', 'R_01', 'pai', quad(-54.04, -19.65, -54.0, -19.62)), geo('gA', '6A', 'pA', A), geo('gB', '6B', 'pB', B),
  geo('gZ', '9Z', 'pZ', quad(-53.9, -19.64, -53.89, -19.63)), geo('gS', 'Solto', 'pS', quad(-53.8, -19.64, -53.79, -19.63))];
const PASTOS = [pasto('pai', 'R_01', null), pasto('pA', '6A', 'g1'), pasto('pB', '6B', 'g1'), pasto('pZ', '9Z', 'g1'), pasto('pS', 'Solto', null)];

function montar() {
  const onRefresh = vi.fn();
  const r = render(<ValidacaoPoligonosView geometrias={GEOMETRIAS} pastos={PASTOS} geoLoading={false} onUpdate={vi.fn()} onDelete={vi.fn()} onRefresh={onRefresh} />);
  return { onRefresh, ...r };
}
const escolher = (nome: string) => fireEvent.click(screen.getAllByText(nome)[0]);
beforeEach(() => { estado.rpcs = []; estado.mudou = []; estado.sobre = {}; estado.uniaoFalha = false; });

describe('Validação — onde o caminho de volta aparece', () => {
  it('divisão de um grupo com origem: Mover linha e Juntar; o pai: Desfazer piquetes; pasto comum: nenhum dos três', async () => {
    montar();
    escolher('6A');
    expect((await screen.findByTestId('editar-mover-linha')).getAttribute('aria-label')).toBe('Mover linha');
    expect(screen.getByTestId('editar-juntar').getAttribute('aria-label')).toBe('Juntar com…');
    expect(screen.queryByTestId('editar-desfazer-piquetes')).toBeNull();
    expect(screen.getByTestId('editar-mover-linha')).toHaveProperty('disabled', false);

    escolher('R_01');
    expect((await screen.findByTestId('editar-desfazer-piquetes')).getAttribute('aria-label')).toBe('Desfazer piquetes');
    expect(screen.queryByTestId('editar-mover-linha')).toBeNull();
    expect(screen.queryByTestId('editar-juntar')).toBeNull();

    escolher('Solto');
    await waitFor(() => expect(screen.getByTestId('validacao-painel-nome').textContent).toContain('Solto'));
    expect(screen.queryByTestId('editar-mover-linha')).toBeNull();
    expect(screen.queryByTestId('editar-desfazer-piquetes')).toBeNull();
  });

  it('divisão sem irmã encostada: os dois ícones ficam desabilitados (a dica diz por quê, no botão e na frase)', async () => {
    montar();
    escolher('9Z');
    const mover = await screen.findByTestId('editar-mover-linha');
    expect(mover).toHaveProperty('disabled', true);
    expect(screen.getByTestId('editar-juntar')).toHaveProperty('disabled', true);
  });

  it('"Mover linha" abre o modo vértices da divisão com a marca do Mover linha', async () => {
    const iniciar = vi.fn();
    estado.sobre = { iniciar };
    montar();
    escolher('6A');
    fireEvent.click(await screen.findByTestId('editar-mover-linha'));
    expect(iniciar).toHaveBeenCalledWith('vertices', 'gA', { moverLinha: true });
  });
});

describe('Validação — Juntar com…', () => {
  it('escolhe a irmã que encosta → a prévia (p_simular true, A fica e B sai) → grava; a tela relê e avisa os pastos', async () => {
    const { onRefresh } = montar();
    escolher('6A');
    fireEvent.click(await screen.findByTestId('editar-juntar'));
    const lista = await screen.findByTestId('juntar-escolher');
    expect(lista.querySelectorAll('[data-juntar-com]')).toHaveLength(1);       // só a 6B encosta; a 9Z (longe) não aparece
    fireEvent.click(lista.querySelector('[data-juntar-com="6B"]')!);
    await screen.findByTestId('juntar-dialogo');
    await waitFor(() => expect(screen.getByTestId('volta-frase').textContent).toContain('6A absorve 6B'));
    const previa = estado.rpcs.find(c => c.fn === 'fn_piquetes_juntar');
    expect(previa?.a).toMatchObject({ p_fica: 'pA', p_sai: 'pB', p_simular: true });

    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'sobrou' } });
    fireEvent.click(screen.getByTestId('volta-gravar'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(estado.rpcs.filter(c => c.fn === 'fn_piquetes_juntar' && c.a.p_simular === false)).toHaveLength(1);
    expect(estado.mudou).toEqual(['cli']);
  });

  it('a união que não dá UM polígono trava: a frase fica no popover, o diálogo não abre e nada vai ao banco', async () => {
    estado.uniaoFalha = true;
    montar();
    escolher('6A');
    fireEvent.click(await screen.findByTestId('editar-juntar'));
    const lista = await screen.findByTestId('juntar-escolher');
    fireEvent.click(lista.querySelector('[data-juntar-com="6B"]')!);
    await waitFor(() => expect(screen.getByTestId('juntar-recusa').textContent).toContain('6A e 6B não são vizinhas'));
    expect(screen.queryByTestId('juntar-dialogo')).toBeNull();
    expect(estado.rpcs.filter(c => c.fn === 'fn_piquetes_juntar')).toEqual([]);
  });
});

describe('Validação — Desfazer piquetes', () => {
  it('no pai: abre o diálogo com a prévia do grupo e, gravando, relê a tela e os pastos', async () => {
    const { onRefresh } = montar();
    escolher('R_01');
    fireEvent.click(await screen.findByTestId('editar-desfazer-piquetes'));
    await screen.findByTestId('desfazer-dialogo');
    await waitFor(() => expect(screen.getByTestId('volta-frase').textContent).toContain('volta a ser um pasto só'));
    expect(estado.rpcs.find(c => c.fn === 'fn_piquetes_desfazer')?.a).toMatchObject({ p_grupo: 'g1', p_simular: true });
    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'desenho errado' } });
    fireEvent.click(screen.getByTestId('volta-gravar'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(estado.rpcs.filter(c => c.fn === 'fn_piquetes_desfazer' && c.a.p_simular === false)).toHaveLength(1);
    expect(estado.mudou).toEqual(['cli']);
  });
});

describe('Validação — a barra do Mover linha', () => {
  const alvo = { id: 'gA', versao: 5, nome: '6A', geojson: A, pasto_id: 'pA' };
  const gestoCom = (...ids: string[]) => ({ g: { acao: 'editar', alterar: ids.map(id => ({ id, versao: -1, geojson: A })) }, antes: 117, depois: 117 });
  const comBarra = (ids: string[], prever = vi.fn()) => {
    estado.sobre = { modo: 'vertices', moverLinha: true, alvo, gesto: gestoCom(...ids), divisoesDaLinha: new Set(['gA', 'gB']), prever };
    montar();
    return prever;
  };

  it('o gesto que tocou 3 polígonos (a borda do pasto andou junto) trava a Prévia com a frase', async () => {
    const prever = comBarra(['gA', 'gB', 'gPai']);
    const botao = await screen.findByTestId('edicao-previa');
    expect(botao).toHaveProperty('disabled', true);
    expect(screen.getByTestId('edicao-erro').textContent).toBe('A linha só se move entre as duas divisões; não arraste pontos da borda do pasto');
    fireEvent.click(botao);
    expect(prever).not.toHaveBeenCalled();
  });

  it('2 polígonos mas um de fora do grupo (o contorno do pai) também trava', async () => {
    comBarra(['gA', 'gPai']);
    expect(await screen.findByTestId('edicao-previa')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('edicao-erro').textContent).toContain('não arraste pontos da borda do pasto');
  });

  it('exatamente as duas divisões do grupo: a Prévia acende e chama o prever', async () => {
    const prever = comBarra(['gA', 'gB']);
    const botao = await screen.findByTestId('edicao-previa');
    expect(botao).toHaveProperty('disabled', false);
    fireEvent.click(botao);
    expect(prever).toHaveBeenCalledTimes(1);
  });
});

describe('Validação — o diálogo do Mover linha nasce do gesto', () => {
  const alvo = { id: 'gA', versao: 5, nome: '6A', geojson: A, pasto_id: 'pA' };
  it('com as duas divisões (a editada e a que andou junto), abre a prévia; gravando, sai da edição e relê', async () => {
    const cancelar = vi.fn();
    estado.sobre = { linhaAberta: true, alvo, formaNova: A2, afetados: [{ id: 'gB', nome: '6B', antes: B, depois: B2 }], cancelar, fecharLinha: vi.fn() };
    const { onRefresh } = montar();
    await screen.findByTestId('mover-linha-dialogo');
    await waitFor(() => expect(screen.getByTestId('volta-frase').textContent).toContain('A linha muda.'));
    const previa = estado.rpcs.find(c => c.fn === 'fn_piquetes_mover_linha');
    expect(previa?.a).toMatchObject({ p_fazenda_id: 'faz', p_simular: true });
    fireEvent.change(screen.getByTestId('volta-motivo'), { target: { value: 'divisa errada' } });
    fireEvent.click(screen.getByTestId('volta-gravar'));
    await waitFor(() => expect(cancelar).toHaveBeenCalled());
    expect(onRefresh).toHaveBeenCalled();
    expect(estado.mudou).toEqual(['cli']);
  });

  it('com mais de uma vizinha andando junto o diálogo nem abre (a barra já travou)', async () => {
    estado.sobre = { linhaAberta: true, alvo, formaNova: A2, afetados: [{ id: 'gB', nome: '6B', antes: B, depois: B2 }, { id: 'gPai', nome: 'R_01', antes: A, depois: A2 }] };
    montar();
    await new Promise(r => setTimeout(r, 30));
    expect(screen.queryByTestId('mover-linha-dialogo')).toBeNull();
    expect(estado.rpcs).toEqual([]);
  });
});
