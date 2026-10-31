/**
 * MAPA-02b — a fonte única do fundo: a preferência salva (D5), a sessão do Google pedida UMA vez e reaproveitada (D2/D6), a chave nunca
 * guardada, o viewport (copyright e zoom máximo da região). Nenhuma chamada de rede: o `fetch` é falso e a chave é de mentira.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FUNDO_PADRAO, RENOVAR_SESSAO_ANTES_MS, URL_SESSAO, assinaturaDaVista, chaveDoGoogle, esquecerSessaoParaTeste, lerFundoSalvo,
  lerInfoDaVista, lerRespostaDaSessao, salvarFundo, sessaoDoGoogle, urlDaVista, urlDosTiles,
} from './fundoDoMapa';

const CHAVE = 'AIza-de-mentira-para-teste';
const AGORA = Date.UTC(2026, 9, 31, 12, 0, 0);
const respostaDaSessao = (expirySeg: number) => new Response(JSON.stringify({
  session: 'sessao-1', expiry: String(expirySeg), tileWidth: 256, imageFormat: 'jpeg', tileHeight: 256,
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

/* o Node desta máquina expõe um `localStorage` sem métodos por cima do do jsdom (como em hospedeiroLeve.test.tsx): um de memória */
const memoria = (lanca = false) => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => { if (lanca) throw new Error('bloqueado'); return m.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (lanca) throw new Error('bloqueado'); m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    conteudo: () => JSON.stringify([...m.entries()]),
  };
};
let local = memoria();
let sessao = memoria();
const usar = (l: ReturnType<typeof memoria>, s: ReturnType<typeof memoria>) => {
  local = l; sessao = s;
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => local });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => sessao });
};
beforeEach(() => {
  usar(memoria(), memoria());
  esquecerSessaoParaTeste();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('a preferência do fundo (D5)', () => {
  it('sem nada salvo = satélite; salva por usuário; um usuário não vê a do outro', () => {
    expect(FUNDO_PADRAO).toBe('satelite');
    expect(lerFundoSalvo('u1')).toBe('satelite');
    salvarFundo('u1', 'mapa');
    expect(lerFundoSalvo('u1')).toBe('mapa');
    expect(lerFundoSalvo('u2')).toBe('satelite');
  });
  it('valor estranho = o padrão; storage que lança erro não quebra nada', () => {
    window.localStorage.setItem('agroinblue.mapa.fundo.u1', 'hibrido');
    expect(lerFundoSalvo('u1')).toBe('satelite');
    usar(memoria(true), memoria(true));
    expect(() => salvarFundo('u1', 'mapa')).not.toThrow();
    expect(lerFundoSalvo('u1')).toBe('satelite');
  });
});

describe('a chave', () => {
  it('vazia ou ausente = sem satélite', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    expect(chaveDoGoogle()).toBeNull();
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '  ');
    expect(chaveDoGoogle()).toBeNull();
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', CHAVE);
    expect(chaveDoGoogle()).toBe(CHAVE);
  });
});

describe('a sessão do Google (D2/D6)', () => {
  it('pede UMA vez (POST com satellite, pt-BR, BR) e reaproveita: dois mapas ao mesmo tempo e uma troca de tela = 1 pedido', async () => {
    const buscar = vi.fn(async (_url: string, _init?: RequestInit) => respostaDaSessao(AGORA / 1000 + 14 * 24 * 3600));
    const [a, b] = await Promise.all([sessaoDoGoogle(CHAVE, AGORA, buscar), sessaoDoGoogle(CHAVE, AGORA, buscar)]);
    const c = await sessaoDoGoogle(CHAVE, AGORA + 60_000, buscar);
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(a.session).toBe('sessao-1');
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    const [url, init] = buscar.mock.calls[0];
    expect(url).toBe(`${URL_SESSAO}?key=${CHAVE}`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ mapType: 'satellite', language: 'pt-BR', region: 'BR' });
  });
  it('a aba recarregada lê a do sessionStorage (sem pedir); a guardada NUNCA tem a chave', async () => {
    const buscar = vi.fn(async () => respostaDaSessao(AGORA / 1000 + 14 * 24 * 3600));
    await sessaoDoGoogle(CHAVE, AGORA, buscar);
    const guardado = sessao.conteudo();
    expect(guardado).toContain('sessao-1');
    expect(guardado).not.toContain(CHAVE);
    expect(local.conteudo()).not.toContain(CHAVE);
    esquecerSessaoParaTeste(); // a memória some (aba recarregada); o sessionStorage fica
    await sessaoDoGoogle(CHAVE, AGORA, buscar);
    expect(buscar).toHaveBeenCalledTimes(1);
  });
  it('perto de vencer (menos de 1 h) pede outra', async () => {
    const venceEm = AGORA / 1000 + 2 * 3600;
    const buscar = vi.fn(async () => respostaDaSessao(venceEm));
    await sessaoDoGoogle(CHAVE, AGORA, buscar);
    await sessaoDoGoogle(CHAVE, venceEm * 1000 - RENOVAR_SESSAO_ANTES_MS + 1, buscar);
    expect(buscar).toHaveBeenCalledTimes(2);
  });
  it('recusa (403) ou resposta fora do contrato = rejeita (quem chama cai no mapa); a próxima tentativa pede de novo', async () => {
    const recusa = vi.fn(async () => new Response('{}', { status: 403 }));
    await expect(sessaoDoGoogle(CHAVE, AGORA, recusa)).rejects.toThrow('403');
    const torta = vi.fn(async () => new Response(JSON.stringify({ sessao: 'x' }), { status: 200 }));
    await expect(sessaoDoGoogle(CHAVE, AGORA, torta)).rejects.toThrow('fora do contrato');
    expect(lerRespostaDaSessao({ session: 's', expiry: '1798000000' })).toEqual({ session: 's', expiraEm: 1798000000000, tileWidth: 256 });
  });
});

describe('URLs e o viewport', () => {
  it('tiles pela 2dtiles com session + key; viewport no zoom INTEIRO', () => {
    expect(urlDosTiles('s 1', CHAVE)).toBe(`https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=s%201&key=${CHAVE}`);
    const l = { norte: -15.1, sul: -15.2, leste: -47.1, oeste: -47.3 };
    expect(urlDaVista('s', CHAVE, 15.6, l)).toBe(`https://tile.googleapis.com/tile/v1/viewport?session=s&key=${CHAVE}&zoom=16`
      + '&north=-15.100000&south=-15.200000&east=-47.100000&west=-47.300000');
    expect(assinaturaDaVista(15.4, l)).toBe(assinaturaDaVista(15.2, { ...l, norte: -15.1001 }));
  });
  it('o copyright e o zoom máximo do retângulo do CENTRO; sem retângulo do centro, o maior; sem nada, nulo', () => {
    const j = { copyright: ' Imagens ©2026 Airbus ', maxZoomRects: [
      { maxZoom: 19, north: 10, south: -60, east: -30, west: -80 },
      { maxZoom: 21, north: -15, south: -16, east: -47, west: -48 },
    ] };
    expect(lerInfoDaVista(j, { lat: -15.5, lng: -47.5 })).toEqual({ copyright: 'Imagens ©2026 Airbus', zoomMaximo: 21 });
    expect(lerInfoDaVista(j, { lat: -20, lng: -50 }).zoomMaximo).toBe(19);
    expect(lerInfoDaVista(j, { lat: 40, lng: 10 }).zoomMaximo).toBe(21);
    expect(lerInfoDaVista({}, { lat: 0, lng: 0 })).toEqual({ copyright: '', zoomMaximo: null });
  });
});
