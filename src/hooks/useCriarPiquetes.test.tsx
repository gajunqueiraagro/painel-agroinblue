/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a — o hook do "Criar piquetes" por dentro (sem mapa e com um mapa de verdade no jsdom): a praça de abertura,
 * trocar a forma, nomes presos, Nomear clicando, Desfazer, Igualar, Cancelar que pergunta, rascunho no navegador, Esc que respeita menu/lista/
 * diálogo, e o pedido à RPC com `p_areas` e `p_infra` na prévia E no gravar.
 */
import L from 'leaflet';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ rpc: [] as { fn: string; a: Record<string, unknown> }[], grupo: null as null | { id: string; nome: string } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, a: Record<string, unknown>) => {
      estado.rpc.push({ fn, a });
      const piq = Array.isArray(a.p_piquetes) ? a.p_piquetes : [];
      return Promise.resolve({ error: null, data: a.p_simular ? {
        caso: 'novo', contorno: { area_ha: 97.5 }, soma_ha: 97.3, dif_contorno_ha: 0.2, concluir: { frase: 'frase do banco' },
        piquetes: piq.map((x: { nome: string }) => ({ nome: x.nome, area_ha: 24.3, liga: 'novo' })),
      } : { ok: true } });
    },
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: estado.grupo, error: null }) }; return q; },
  },
}));

import { RAIO_MINIMO_DOS_CANTOS_PX, useCriarPiquetes } from './useCriarPiquetes';

const R = 6378137;
function retangulo(ha: number): GeoJSON.Polygon {
  const dl = (0.0112 * Math.PI) / 180;
  const latN = (Math.asin(Math.sin((-15.51 * Math.PI) / 180) + (ha * 10000) / (R * R * dl)) * 180) / Math.PI;
  return { type: 'Polygon', coordinates: [[[-47.9, -15.51], [-47.9 + 0.0112, -15.51], [-47.9 + 0.0112, latN], [-47.9, latN], [-47.9, -15.51]]] };
}
const GEO = retangulo(97.5);
const PAI = { geometriaId: 'geo-1', pastoId: 'pasto-1', nome: 'Modulo 03', geojson: GEO };
const PASTOS: { id: string; nome: string; grupo_id?: string | null; ativo?: boolean | null }[] = [];
const GEOMETRIAS: { id?: string; pasto_id: string | null; geojson?: GeoJSON.Geometry }[] = [{ id: 'geo-1', pasto_id: 'pasto-1', geojson: GEO }];

function memoria() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

function montar(mapa: L.Map | null = null) {
  const aoGravar = vi.fn();
  const r = renderHook(() => useCriarPiquetes({ mapa, pastos: PASTOS, geometrias: GEOMETRIAS, clienteId: 'cli', aoGravar, enquadrar: () => {} }));
  return { ...r, aoGravar };
}
async function abrir(h: ReturnType<typeof montar>) {
  act(() => h.result.current.abrir(PAI));
  await waitFor(() => expect(h.result.current.grupo.estado).toBe('ok'));
}
const soma = (h: ReturnType<typeof montar>) => h.result.current.divisoes.reduce((s, d) => s + d.areaHa, 0);

beforeEach(() => { estado.rpc = []; estado.grupo = null; vi.stubGlobal('localStorage', memoria()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('abrir: a praça central é o padrão', () => {
  it('abre com a praça de 60 m (losango), 4 cercas, 4 divisões "Modulo 03-A…D" e a prévia liberada', async () => {
    const h = montar();
    await abrir(h);
    const p = h.result.current;
    expect(p.modo).toBe('praca');
    expect(p.desenho.praca?.vertices).toHaveLength(4);
    expect(p.desenho.praca?.cercas).toHaveLength(4);
    expect(p.divisoes).toHaveLength(4);
    expect(p.nomes).toEqual(['Modulo 03-A', 'Modulo 03-B', 'Modulo 03-C', 'Modulo 03-D']);
    expect(p.motivo).toBeNull();
    expect(p.medidasPraca && Math.abs(p.medidasPraca.areaHa - 0.18)).toBeLessThan(0.002);
    expect(p.config.cocho).toBe(true);
    expect(p.totalHa && Math.abs(p.totalHa - 97.5)).toBeLessThan(0.05);
  });

  it('divisões: 6 e 8 (a praça ganha um vértice por divisão); círculo continua com 4', async () => {
    const h = montar();
    await abrir(h);
    act(() => h.result.current.mudarConfig({ n: 6 }));
    expect(h.result.current.divisoes).toHaveLength(6);
    act(() => h.result.current.mudarConfig({ n: 8 }));
    expect(h.result.current.divisoes).toHaveLength(8);
    expect(h.result.current.desenho.praca?.vertices).toHaveLength(8);
    act(() => h.result.current.mudarConfig({ n: 4 }));
    act(() => h.result.current.mudarFormato('circulo'));
    expect(h.result.current.desenho.praca?.vertices).toHaveLength(48);
    expect(h.result.current.divisoes).toHaveLength(4);
  });

  it('a diagonal e o lado: mudar a medida escala a praça', async () => {
    const h = montar();
    await abrir(h);
    act(() => h.result.current.mudarMedida(120));
    expect(Math.abs((h.result.current.medidasPraca?.diagonalM ?? 0) - 120)).toBeLessThan(0.3);
    act(() => h.result.current.mudarMedida(60, 'lado'));
    expect(Math.abs((h.result.current.medidasPraca?.ladoM ?? 0) - 60)).toBeLessThan(0.3);
  });
});

describe('trocar de gesto', () => {
  it('grade 2 × 4 = 8 iguais; N iguais; "Linhas que eu traço" começa vazio e pede a ferramenta de traçar', async () => {
    const h = montar();
    await abrir(h);
    act(() => h.result.current.setModo('grade'));
    expect(h.result.current.divisoes).toHaveLength(8);
    expect(h.result.current.desenho.praca).toBeNull();
    act(() => h.result.current.mudarConfig({ modo: 'iguais', colunas: 5 }));
    expect(h.result.current.divisoes).toHaveLength(5);
    act(() => h.result.current.setModo('linhas'));
    expect(h.result.current.ferramenta).toBe('tracar');
    expect(h.result.current.motivo).toContain('Risque');
    act(() => h.result.current.setModo('praca'));
    expect(h.result.current.divisoes).toHaveLength(4);
    expect(h.result.current.ferramenta).toBeNull();
  });

  it('Desfazer volta o passo (a pilha), inclusive a troca de forma', async () => {
    const h = montar();
    await abrir(h);
    act(() => h.result.current.mudarConfig({ n: 6 }));
    expect(h.result.current.divisoes).toHaveLength(6);
    expect(h.result.current.podeDesfazer).toBe(true);
    act(() => h.result.current.desfazer());
    expect(h.result.current.divisoes).toHaveLength(4);
  });
});

describe('nomes presos e Nomear clicando', () => {
  it('o nome fica preso ao ponto: trocar as divisões de 4 para 6 não perde o que foi renomeado', async () => {
    const h = montar();
    await abrir(h);
    act(() => h.result.current.setNome(0, 'Curral'));
    expect(h.result.current.nomes[0]).toBe('Curral');
    act(() => h.result.current.mudarConfig({ n: 6 }));
    expect(h.result.current.nomes).toHaveLength(6);
    expect(new Set(h.result.current.nomes.map(x => x.toLowerCase())).size).toBe(6);
  });

  it('Nomear clicando: o prefixo editável + a próxima letra a cada clique, na ordem dos cliques; Recomeçar zera', async () => {
    const h = montar();
    await abrir(h);
    act(() => h.result.current.mudarConfig({ prefixo: 'M3-' }));
    act(() => h.result.current.setFerramenta('nomear'));
    act(() => h.result.current.nomearDivisao(3));
    act(() => h.result.current.nomearDivisao(1));
    act(() => h.result.current.nomearDivisao(0));
    act(() => h.result.current.nomearDivisao(2));
    expect(h.result.current.nomes).toEqual(['M3-C', 'M3-B', 'M3-D', 'M3-A']);
    expect(h.result.current.proximaLetra).toBe('E');
    act(() => h.result.current.recomecarNomes());
    expect(h.result.current.nomes.every(x => x === '')).toBe(true);
    expect(h.result.current.proximaLetra).toBe('A');
    expect(h.result.current.motivo).toBe('Dê nome a todas as divisões.');
    expect(h.result.current.ordemDaLista).toHaveLength(4);
  });
});

describe('cancelar, rascunho e teclado', () => {
  it('sem nada feito o Cancelar fecha direto; com trabalho PERGUNTA ("Descartar o que foi feito?") e só descartar fecha', async () => {
    const h = montar();
    await abrir(h);
    act(() => h.result.current.pedirCancelar());
    expect(h.result.current.aberto).toBe(false);
    await abrir(h);
    act(() => h.result.current.mudarConfig({ n: 6 }));
    act(() => h.result.current.pedirCancelar());
    expect(h.result.current.aberto).toBe(true);
    expect(h.result.current.confirmarCancelar).toBe(true);
    act(() => h.result.current.continuarSemDescartar());
    expect(h.result.current.confirmarCancelar).toBe(false);
    act(() => h.result.current.pedirCancelar());
    act(() => h.result.current.descartar());
    expect(h.result.current.aberto).toBe(false);
    expect(localStorage.getItem('piquetes-rascunho:cli:geo-1')).toBeNull();
  });

  it('o rascunho vai para o navegador a cada passo; ao abrir de novo oferece "Continuar o rascunho de HH:MM?" e continuar restaura', async () => {
    const h = montar();
    await abrir(h);
    expect(localStorage.getItem('piquetes-rascunho:cli:geo-1')).toBeNull(); // só abrir não guarda nada
    act(() => h.result.current.mudarConfig({ n: 6 }));
    await waitFor(() => expect(localStorage.getItem('piquetes-rascunho:cli:geo-1')).not.toBeNull());
    act(() => h.result.current.fechar());
    await abrir(h);
    expect(h.result.current.guardado?.em).toMatch(/^\d\d:\d\d$/);
    expect(h.result.current.divisoes).toHaveLength(4);
    act(() => h.result.current.continuarRascunho());
    expect(h.result.current.divisoes).toHaveLength(6);
    expect(h.result.current.guardado).toBeNull();
    // e "começar do zero" apaga
    act(() => h.result.current.fechar());
    await abrir(h);
    act(() => h.result.current.comecarDoZero());
    expect(h.result.current.guardado).toBeNull();
    expect(localStorage.getItem('piquetes-rascunho:cli:geo-1')).toBeNull();
  });

  it('Esc pergunta (com trabalho) e é IGNORADO com o foco em menu, lista ou diálogo; Ctrl+Z desfaz', async () => {
    const h = montar();
    await abrir(h);
    act(() => h.result.current.mudarConfig({ n: 6 }));
    const tecla = (alvo: Element | Window, init: KeyboardEventInit) => act(() => { alvo.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); });
    const menu = document.createElement('div'); menu.setAttribute('role', 'menu'); const item = document.createElement('button'); menu.appendChild(item); document.body.appendChild(menu);
    tecla(item, { key: 'Escape' });
    expect(h.result.current.confirmarCancelar).toBe(false);
    const lista = document.createElement('div'); lista.setAttribute('data-testid', 'piquetes-lista'); const b2 = document.createElement('button'); lista.appendChild(b2); document.body.appendChild(lista);
    tecla(b2, { key: 'Escape' });
    expect(h.result.current.confirmarCancelar).toBe(false);
    const dlg = document.createElement('div'); dlg.setAttribute('role', 'dialog'); const b3 = document.createElement('button'); dlg.appendChild(b3); document.body.appendChild(dlg);
    tecla(b3, { key: 'Escape' });
    expect(h.result.current.confirmarCancelar).toBe(false);
    [menu, lista, dlg].forEach(x => x.remove());
    tecla(document.body, { key: 'Escape' });
    expect(h.result.current.confirmarCancelar).toBe(true);
    tecla(document.body, { key: 'Escape' }); // o 2º Esc fecha a pergunta
    expect(h.result.current.confirmarCancelar).toBe(false);
    tecla(document.body, { key: 'z', ctrlKey: true });
    expect(h.result.current.divisoes).toHaveLength(4);
  });
});

describe('a prévia e o gravar mandam p_areas e p_infra', () => {
  it('praça = benfeitoria, cocho no centro; o gravar manda os mesmos; tira o rascunho e avisa', async () => {
    const h = montar();
    await abrir(h);
    act(() => h.result.current.mudarConfig({ n: 6 })); // deixa rascunho para provar que o gravar o apaga
    await act(async () => { await h.result.current.prever(); });
    const previa = estado.rpc[0];
    expect(previa.fn).toBe('fn_piquetes_criar');
    expect(previa.a.p_simular).toBe(true);
    expect(previa.a.p_areas).toEqual([{ nome: 'Praça de alimentação', tipo: 'benfeitoria', geojson: expect.objectContaining({ type: 'Polygon' }) }]);
    expect(previa.a.p_infra).toEqual([{ tipo: 'cocho', nome: 'Cocho', ponto: h.result.current.desenho.praca!.centro }]);
    expect(Array.isArray(previa.a.p_piquetes) && previa.a.p_piquetes.length).toBe(6);
    expect(h.result.current.previa?.secao.map(x => x.nome)).toEqual(['Praça de alimentação', 'Cocho']);
    expect(h.result.current.previa?.fraseLocal).toContain('6 pastos novos');
    await act(async () => { await h.result.current.gravar(); });
    const grava = estado.rpc[1];
    expect(grava.a.p_simular).toBe(false);
    expect(grava.a.p_areas).toEqual(previa.a.p_areas);
    expect(grava.a.p_infra).toEqual(previa.a.p_infra);
    expect(h.aoGravar).toHaveBeenCalledTimes(1);
    expect(h.result.current.aberto).toBe(false);
    expect(localStorage.getItem('piquetes-rascunho:cli:geo-1')).toBeNull();
  });

  it('sem o cocho marcado, p_infra vai vazio (os dois parâmetros vão sempre)', async () => {
    const h = montar();
    await abrir(h);
    act(() => h.result.current.mudarConfig({ cocho: false }));
    await act(async () => { await h.result.current.prever(); });
    expect(estado.rpc[0].a.p_infra).toEqual([]);
    expect('p_areas' in estado.rpc[0].a).toBe(true);
  });
});

describe('com um mapa de verdade (jsdom)', () => {
  /* o jsdom não tem canvas: o Leaflet (canvas preferido) recebe um contexto que aceita tudo e não desenha nada */
  function canvasDeMentira() {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => ctx, configurable: true });
  }
  function mapaDeTeste() {
    canvasDeMentira();
    const div = document.createElement('div');
    Object.defineProperty(div, 'clientWidth', { value: 1200 });
    Object.defineProperty(div, 'clientHeight', { value: 700 });
    document.body.appendChild(div);
    const m = L.map(div, { zoomControl: false, attributionControl: false, preferCanvas: true });
    m.setView([-15.507, -47.894], 16);
    return m;
  }

  it('desenha as alças (centro, 4 cantos, 4 giros), o arrastar do centro leva a praça sem recriar o marcador, e fechar limpa tudo', async () => {
    const mapa = mapaDeTeste();
    const h = montar(mapa);
    await abrir(h);
    const alcas = () => { const l: L.Marker[] = []; mapa.eachLayer(x => { if (x instanceof L.Marker && x.options.draggable) l.push(x); }); return l; };
    /* MAPA-PRACA-ESTAVEL-01: longe (a praça com raio < 16 px na tela) os cantos NÃO ganham alça — só o centro e os 4 giros; o centro fica por
       cima de tudo. Aproximado, os 4 cantos aparecem. */
    await waitFor(() => expect(alcas().length).toBeGreaterThan(0));
    const raio = () => { const p = h.result.current.desenho.praca!; const c = mapa.latLngToContainerPoint(L.latLng(p.centro[1], p.centro[0]));
      return Math.max(...p.vertices.map(v => c.distanceTo(mapa.latLngToContainerPoint(L.latLng(v[1], v[0]))))); };
    if (raio() >= RAIO_MINIMO_DOS_CANTOS_PX) act(() => { mapa.setZoom(mapa.getZoom() - Math.ceil(Math.log2(raio() / 8)), { animate: false }); });
    await waitFor(() => expect(alcas()).toHaveLength(5));
    expect(alcas().find(m => m.options.title?.includes('praça inteira'))?.options.zIndexOffset).toBe(2000);
    act(() => { mapa.setZoom(mapa.getZoom() + 6, { animate: false }); });
    await waitFor(() => expect(alcas()).toHaveLength(9));
    expect(Math.max(...alcas().map(m => m.options.zIndexOffset ?? 0))).toBe(2000);
    const antes = h.result.current.desenho.praca!.centro;
    const centro = alcas().find(m => m.options.title?.includes('praça inteira'))!;
    const novo = L.latLng(antes[1] + 0.0004, antes[0] + 0.0006);
    act(() => { centro.fire('dragstart'); centro.setLatLng(novo); centro.fire('drag'); });
    expect(h.result.current.desenho.praca!.centro[0]).toBeCloseTo(antes[0] + 0.0006, 6);
    expect(alcas().includes(centro)).toBe(true); // o marcador arrastado é o mesmo
    act(() => { centro.fire('dragend'); });
    expect(h.result.current.desenho.praca!.centro[1]).toBeCloseTo(antes[1] + 0.0004, 6);
    expect(h.result.current.podeDesfazer).toBe(true);
    // a praça longe do meio: as áreas saem desiguais; "Igualar áreas" as iguala (±0,01 ha); "Alinhar praça" mantém a praça regular
    const longe = L.latLng(antes[1] - 0.0012, antes[0] - 0.0035);
    act(() => { centro.fire('dragstart'); centro.setLatLng(longe); centro.fire('drag'); centro.fire('dragend'); });
    const spread = () => { const as = h.result.current.divisoes.map(d => d.areaHa); return Math.max(...as) - Math.min(...as); };
    expect(spread()).toBeGreaterThan(1);
    act(() => h.result.current.igualar());
    expect(h.result.current.aviso).toBeNull();
    expect(spread()).toBeLessThanOrEqual(0.01);
    act(() => h.result.current.alinhar());
    expect(h.result.current.desenho.praca!.vertices).toHaveLength(4);
    // clicar na cerca a seleciona: aparece a frase da cerca, o cadeado e as alças dos pontos do meio/deslizar
    act(() => h.result.current.setSelecionada('cerca-2'));
    expect(h.result.current.fraseDaSelecionada).toMatch(/^Cerca 2: [\d.]+ m/);
    await waitFor(() => expect(alcas().length).toBeGreaterThan(9));
    act(() => h.result.current.fechar());
    await waitFor(() => expect(alcas()).toHaveLength(0));
    mapa.remove();
  });
  /* MAPA-PRACA-ESTAVEL-01 (homologação 02/11 21:54, Modulo 03): "mudando tudo conforme eu clico" — o clique perto de um lado do pasto trocava o
     lado de referência, girava a praça e refazia cercas e nomes. Agora o clique sem ferramenta só escolhe a divisão; a troca é a ferramenta
     "Lado de referência" (um clique e ela desliga). */
  it('clique na borda sem ferramenta não refaz nada; com "Lado de referência" troca o lado e a ferramenta desliga', async () => {
    const mapa = mapaDeTeste();
    const h = montar(mapa);
    await abrir(h);
    const antes = JSON.stringify({ d: h.result.current.desenho, n: h.result.current.nomes, r: h.result.current.config.refLado });
    const [a, b] = [GEO.coordinates[0][1], GEO.coordinates[0][2]]; // o lado leste (curto): clique no meio dele
    const naBorda = L.latLng((a[1] + b[1]) / 2, a[0]);
    for (let k = 0; k < 10; k++) act(() => { mapa.fire('click', { latlng: naBorda, originalEvent: new MouseEvent('click') }); });
    expect(JSON.stringify({ d: h.result.current.desenho, n: h.result.current.nomes, r: h.result.current.config.refLado })).toBe(antes);
    act(() => h.result.current.setFerramenta('referencia'));
    act(() => { mapa.fire('click', { latlng: naBorda, originalEvent: new MouseEvent('click') }); });
    expect(h.result.current.config.refLado).toBe(1);
    expect(h.result.current.ferramenta).toBeNull();
    mapa.remove();
  });
});
