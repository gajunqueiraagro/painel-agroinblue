/**
 * MAPA-02b (Gabriel, 31/10/2026) — o FUNDO do mapa de pastos: satélite do Google (Map Tiles API 2D) ou mapa (OpenStreetMap).
 * Fonte única do fundo (D1): a preferência por usuário, a sessão do Google, as URLs e a leitura do viewport. Sem Leaflet e sem React
 * (quem monta a camada é `camadaDoFundo.ts`).
 *
 * Regras da Google (developers.google.com/maps/documentation/tile, lidas na FASE 0):
 *  - a sessão (`createSession`) vale ~2 semanas e serve a vários clientes → um pedido só e reaproveitado (D2). Guardada no
 *    `sessionStorage` (P5: por aba) com a validade — NUNCA a chave;
 *  - a atribuição (o `copyright` do viewport) varia com a área visível e é obrigatória; o viewport também diz o zoom máximo da
 *    região (`maxZoomRects`, D6);
 *  - tile não se guarda nem se pede antes (sem pré-busca, sem cache próprio: o navegador respeita o `max-age`).
 * Sem chave ou com falha: o mapa cai no OpenStreetMap com o aviso `FRASE_SEM_SATELITE` (D4) — troca de FUNDO, não de dado.
 */

export type FundoDoMapa = 'satelite' | 'mapa';

export const FUNDO_PADRAO: FundoDoMapa = 'satelite';
export const FUNDOS: ReadonlyArray<{ valor: FundoDoMapa; rotulo: string }> = [
  { valor: 'satelite', rotulo: 'Satélite' },
  { valor: 'mapa', rotulo: 'Mapa' },
];
export const FRASE_SEM_SATELITE = 'satélite indisponível · usando mapa';
export const CREDITO_OSM = '© OpenStreetMap';
/** O copyright quando o viewport não responde: a atribuição nunca some. */
export const CREDITO_GOOGLE_RESERVA = 'Imagens © Google';

export const ZOOM_MAXIMO_OSM = 19;
/** Até o viewport dizer o zoom da região. */
export const ZOOM_MAXIMO_SATELITE_INICIAL = 19;
/** Renova a sessão 1 h antes de ela vencer. */
export const RENOVAR_SESSAO_ANTES_MS = 60 * 60 * 1000;

export const URL_SESSAO = 'https://tile.googleapis.com/v1/createSession';
export const URL_TILES = 'https://tile.googleapis.com/v1/2dtiles';
export const URL_VIEWPORT = 'https://tile.googleapis.com/tile/v1/viewport';
export const URL_OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const CHAVE_SESSAO = 'agroinblue.mapa.google.sessao';
const chaveDaPreferencia = (usuarioId: string | null | undefined) => `agroinblue.mapa.fundo.${usuarioId || 'sem-usuario'}`;

export function ehFundo(v: unknown): v is FundoDoMapa {
  return v === 'satelite' || v === 'mapa';
}

/** A escolha salva do usuário (D5). Storage bloqueado ou valor estranho = o padrão. */
export function lerFundoSalvo(usuarioId: string | null | undefined): FundoDoMapa {
  try {
    const v = window.localStorage.getItem(chaveDaPreferencia(usuarioId));
    return ehFundo(v) ? v : FUNDO_PADRAO;
  } catch {
    return FUNDO_PADRAO;
  }
}

export function salvarFundo(usuarioId: string | null | undefined, fundo: FundoDoMapa): void {
  try {
    window.localStorage.setItem(chaveDaPreferencia(usuarioId), fundo);
  } catch {
    /* storage bloqueado: a escolha vale só nesta tela */
  }
}

/** A chave do navegador (`VITE_GOOGLE_MAPS_API_KEY`); vazia = sem satélite. Nunca se loga nem se guarda. */
export function chaveDoGoogle(): string | null {
  const v: unknown = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export interface SessaoGoogle {
  session: string;
  /** milissegundos desde 1970 */
  expiraEm: number;
  tileWidth: number;
}

/** A resposta do `createSession` (`session`, `expiry` em segundos, `tileWidth`); fora do contrato = nulo. */
export function lerRespostaDaSessao(j: unknown): SessaoGoogle | null {
  if (typeof j !== 'object' || j === null) return null;
  const session: unknown = Reflect.get(j, 'session');
  const expiry = Number(Reflect.get(j, 'expiry'));
  const largura = Number(Reflect.get(j, 'tileWidth'));
  if (typeof session !== 'string' || session === '' || !Number.isFinite(expiry) || expiry <= 0) return null;
  return { session, expiraEm: expiry * 1000, tileWidth: Number.isFinite(largura) && largura > 0 ? largura : 256 };
}

function sessaoValida(v: unknown, agora: number): SessaoGoogle | null {
  if (typeof v !== 'object' || v === null) return null;
  const session: unknown = Reflect.get(v, 'session');
  const expiraEm: unknown = Reflect.get(v, 'expiraEm');
  const tileWidth: unknown = Reflect.get(v, 'tileWidth');
  if (typeof session !== 'string' || session === '' || typeof expiraEm !== 'number' || typeof tileWidth !== 'number') return null;
  if (expiraEm - RENOVAR_SESSAO_ANTES_MS <= agora) return null;
  return { session, expiraEm, tileWidth };
}

function lerSessaoGuardada(agora: number): SessaoGoogle | null {
  try {
    const raw = window.sessionStorage.getItem(CHAVE_SESSAO);
    return raw ? sessaoValida(JSON.parse(raw), agora) : null;
  } catch {
    return null;
  }
}

function guardarSessao(s: SessaoGoogle): void {
  try {
    window.sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ session: s.session, expiraEm: s.expiraEm, tileWidth: s.tileWidth }));
  } catch {
    /* sem storage: a sessão vale enquanto a página estiver aberta (memória) */
  }
}

let naMemoria: SessaoGoogle | null = null;
let emVoo: Promise<SessaoGoogle> | null = null;

/**
 * A sessão do satélite: a guardada (memória ou `sessionStorage`) enquanto valer; senão UM `createSession` (dois mapas pedindo ao
 * mesmo tempo esperam o mesmo pedido). Falha = rejeita (quem chama cai no OpenStreetMap).
 */
export function sessaoDoGoogle(chave: string, agora: number = Date.now(), buscar: typeof fetch = fetch): Promise<SessaoGoogle> {
  const daMemoria = sessaoValida(naMemoria, agora);
  if (daMemoria) return Promise.resolve(daMemoria);
  const guardada = lerSessaoGuardada(agora);
  if (guardada) {
    naMemoria = guardada;
    return Promise.resolve(guardada);
  }
  if (emVoo) return emVoo;
  emVoo = (async () => {
    const r = await buscar(`${URL_SESSAO}?key=${encodeURIComponent(chave)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapType: 'satellite', language: 'pt-BR', region: 'BR' }),
    });
    if (!r.ok) throw new Error(`createSession ${r.status}`);
    const s = lerRespostaDaSessao(await r.json());
    if (!s) throw new Error('createSession: resposta fora do contrato');
    naMemoria = s;
    guardarSessao(s);
    return s;
  })().finally(() => {
    emVoo = null;
  });
  return emVoo;
}

/** Só para os testes: esquece a sessão da memória (o `sessionStorage` o teste limpa). */
export function esquecerSessaoParaTeste(): void {
  naMemoria = null;
  emVoo = null;
}

export function urlDosTiles(session: string, chave: string): string {
  return `${URL_TILES}/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(chave)}`;
}

export interface LimitesDaVista {
  norte: number;
  sul: number;
  leste: number;
  oeste: number;
}

/** O zoom do viewport é inteiro (o mesmo nível dos tiles: o Leaflet pede `Math.round(zoom)`). */
export function urlDaVista(session: string, chave: string, zoom: number, l: LimitesDaVista): string {
  const z = Math.min(22, Math.max(0, Math.round(zoom)));
  const c = (n: number) => n.toFixed(6);
  return `${URL_VIEWPORT}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(chave)}&zoom=${z}`
    + `&north=${c(l.norte)}&south=${c(l.sul)}&east=${c(l.leste)}&west=${c(l.oeste)}`;
}

/** Igual = não pede de novo (D6). */
export function assinaturaDaVista(zoom: number, l: LimitesDaVista): string {
  const c = (n: number) => n.toFixed(3);
  return `${Math.round(zoom)}|${c(l.norte)}|${c(l.sul)}|${c(l.leste)}|${c(l.oeste)}`;
}

export interface InfoDaVista {
  copyright: string;
  zoomMaximo: number | null;
}

/**
 * A resposta do viewport: o `copyright` (obrigatório na tela) e o zoom máximo — o do retângulo que contém o CENTRO da vista; nenhum
 * contém = o maior dos que vieram; nenhum = nulo (fica o inicial).
 */
export function lerInfoDaVista(j: unknown, centro: { lat: number; lng: number }): InfoDaVista {
  if (typeof j !== 'object' || j === null) return { copyright: '', zoomMaximo: null };
  const cr: unknown = Reflect.get(j, 'copyright');
  const rects: unknown = Reflect.get(j, 'maxZoomRects');
  const lista = Array.isArray(rects) ? rects : [];
  let doCentro: number | null = null;
  let maior: number | null = null;
  for (const r of lista) {
    if (typeof r !== 'object' || r === null) continue;
    const z = Number(Reflect.get(r, 'maxZoom'));
    if (!Number.isFinite(z)) continue;
    maior = maior === null ? z : Math.max(maior, z);
    const n = Number(Reflect.get(r, 'north'));
    const s = Number(Reflect.get(r, 'south'));
    const e = Number(Reflect.get(r, 'east'));
    const w = Number(Reflect.get(r, 'west'));
    if (centro.lat <= n && centro.lat >= s && centro.lng <= e && centro.lng >= w) {
      doCentro = doCentro === null ? z : Math.max(doCentro, z);
    }
  }
  return { copyright: typeof cr === 'string' ? cr.trim() : '', zoomMaximo: doCentro ?? maior };
}
