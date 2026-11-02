/**
 * MAPA-ZOOM-ENTRE-VISOES-01 (Gabriel, homologação 02/11/2026: "se estou com um zoom e altero para Validação, o mapa refaz o zoom e volta
 * amplo; queria que não mudasse") — o ENQUADRAMENTO (centro + zoom) do mapa é UM só por fazenda e sobrevive à troca de visão, de mês,
 * de camada, ao painel, à lista recolhida e à tela cheia. Fonte única: as três visões (Gestor, Operação, Validação) usam o hook daqui;
 * nenhuma tem mais `fitBounds` automático próprio.
 *
 * Só enquadra a fazenda inteira quando: troca a FAZENDA ou o CLIENTE, é a 1ª abertura daquela fazenda na sessão, ou a pessoa aperta
 * "Ver fazenda inteira". O resto é o enquadramento guardado (`sessionStorage`, por cliente + fazenda; sem armazenamento a tela funciona,
 * só não lembra). Em todo `moveend` o contêiner leva `data-enquadramento="lat,lng,zoom"` — é a medição do gate (`mesmoEnquadramento`).
 */
import { useCallback, useEffect, useRef } from 'react';
import type { FitBoundsOptions, LatLngBounds, Map as MapaLeaflet } from 'leaflet';

export interface Enquadramento { lat: number; lng: number; zoom: number }
/** Os limites da fazenda, com a fazenda a que pertencem (a lista antiga de uma fazenda que acabou de sair nunca enquadra a nova). */
export interface LimitesDaFazenda { fazendaId: string; limites: LatLngBounds }
type Armazenamento = Pick<Storage, 'getItem' | 'setItem'>;

export const ZOOM_MINIMO_GUARDADO = 0;
export const ZOOM_MAXIMO_GUARDADO = 24;

export function chaveDoEnquadramento(clienteId: string | null | undefined, fazendaId: string | null | undefined): string | null {
  if (!clienteId || !fazendaId) return null;
  return `mapa-enquadramento:${clienteId}:${fazendaId}`;
}

export function enquadramentoValido(e: unknown): e is Enquadramento {
  if (!e || typeof e !== 'object') return false;
  if (!('lat' in e) || !('lng' in e) || !('zoom' in e)) return false;
  const { lat, lng, zoom } = e;
  if (typeof lat !== 'number' || typeof lng !== 'number' || typeof zoom !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && zoom >= ZOOM_MINIMO_GUARDADO && zoom <= ZOOM_MAXIMO_GUARDADO;
}

function armazenamentoDaSessao(): Armazenamento | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

/** O que está guardado para a chave; ausente, estragado ou fora da faixa = `null` (nunca lança). */
export function lerEnquadramento(chave: string | null, armazenamento?: Armazenamento | null): Enquadramento | null {
  if (!chave) return null;
  try {
    const dep = armazenamento === undefined ? armazenamentoDaSessao() : armazenamento;
    const bruto = dep?.getItem(chave);
    if (!bruto) return null;
    const lido: unknown = JSON.parse(bruto);
    return enquadramentoValido(lido) ? { lat: lido.lat, lng: lido.lng, zoom: lido.zoom } : null;
  } catch {
    return null;
  }
}

/** Guarda (só valor válido); sem armazenamento a tela funciona, só não lembra. */
export function guardarEnquadramento(chave: string | null, e: Enquadramento, armazenamento?: Armazenamento | null): boolean {
  if (!chave || !enquadramentoValido(e)) return false;
  try {
    const dep = armazenamento === undefined ? armazenamentoDaSessao() : armazenamento;
    if (!dep) return false;
    dep.setItem(chave, JSON.stringify({ lat: e.lat, lng: e.lng, zoom: e.zoom }));
    return true;
  } catch {
    return false;
  }
}

/** O texto do `data-enquadramento` (lat/lng com 6 casas). */
export function textoDoEnquadramento(e: Enquadramento): string {
  return `${e.lat.toFixed(6)},${e.lng.toFixed(6)},${e.zoom}`;
}

export type DecisaoDoEnquadramento = 'restaurar' | 'ajustar' | 'esperar';

/** A regra: há enquadramento guardado desta fazenda → volta a ele; senão enquadra a fazenda inteira; sem limites ainda, espera. */
export function decidirEnquadramento(guardado: Enquadramento | null, limitesValidos: boolean): DecisaoDoEnquadramento {
  if (guardado) return 'restaurar';
  return limitesValidos ? 'ajustar' : 'esperar';
}

/** Os limites só valem para a fazenda a que pertencem. */
export function limitesDaFazendaAtual(l: LimitesDaFazenda | null, fazendaId: string | null | undefined): LatLngBounds | null {
  if (!l || !fazendaId || l.fazendaId !== fazendaId) return null;
  return l.limites.isValid() ? l.limites : null;
}

/** Atualização do estado dos limites sem trocar a referência quando nada mudou (não re-renderiza à toa). */
export function trocarLimites(anterior: LimitesDaFazenda | null, fazendaId: string, limites: LatLngBounds): LimitesDaFazenda | null {
  if (!limites.isValid()) return anterior;
  if (anterior && anterior.fazendaId === fazendaId && anterior.limites.equals(limites)) return anterior;
  return { fazendaId, limites };
}

/* MAPA-ZOOM-E-PAINEL-01 — "pasto inteiro": o polígono selecionado se enquadra na área VISÍVEL do mapa, descontando o que está por cima dele
   (a barra do polígono, os botões do topo, o que mais ficar encostado numa borda), com folga. Retângulos em coordenadas de tela. */
export interface Retangulo { left: number; top: number; right: number; bottom: number }
export interface PaddingDaAreaVisivel { paddingTopLeft: [number, number]; paddingBottomRight: [number, number] }

/** Fração do menor lado que fica livre de qualquer jeito (a folga e o que está por cima nunca comem o mapa todo). */
export const FRACAO_MINIMA_LIVRE = 0.3;
export const FOLGA_DO_POLIGONO = 0.1;
const TOLERANCIA_DE_BORDA = 16;

type Lado = 'esq' | 'topo' | 'dir' | 'base';

/**
 * Padding para o `fitBounds` a partir da caixa do mapa e dos retângulos por cima dele. Cada retângulo é descontado do lado da borda a que
 * está encostado (o de menor custo, se encostar em duas); o que não encosta em borda nenhuma não desconta (está no meio: o gesto é do dono).
 * A folga soma `folga` (10%) da largura/altura em cada lado. Se o total passar de 70% do lado, tudo encolhe junto.
 */
export function paddingDaAreaVisivel(mapa: Retangulo, sobrepostos: readonly Retangulo[], folga: number = FOLGA_DO_POLIGONO): PaddingDaAreaVisivel {
  const largura = Math.max(0, mapa.right - mapa.left);
  const altura = Math.max(0, mapa.bottom - mapa.top);
  const gasto: Record<Lado, number> = { esq: 0, topo: 0, dir: 0, base: 0 };
  for (const o of sobrepostos) {
    const l = Math.max(o.left, mapa.left), t = Math.max(o.top, mapa.top), r = Math.min(o.right, mapa.right), b = Math.min(o.bottom, mapa.bottom);
    if (r - l < 1 || b - t < 1) continue;
    const custos: Array<[Lado, number]> = [];
    if (l - mapa.left <= TOLERANCIA_DE_BORDA) custos.push(['esq', r - mapa.left]);
    if (t - mapa.top <= TOLERANCIA_DE_BORDA) custos.push(['topo', b - mapa.top]);
    if (mapa.right - r <= TOLERANCIA_DE_BORDA) custos.push(['dir', mapa.right - l]);
    if (mapa.bottom - b <= TOLERANCIA_DE_BORDA) custos.push(['base', mapa.bottom - t]);
    if (custos.length === 0) continue;
    const [lado, custo] = custos.reduce((a, c) => (c[1] < a[1] ? c : a));
    gasto[lado] = Math.max(gasto[lado], custo);
  }
  let esq = gasto.esq + largura * folga, dir = gasto.dir + largura * folga;
  let topo = gasto.topo + altura * folga, base = gasto.base + altura * folga;
  const teto = (soma: number, total: number) => (soma > total * (1 - FRACAO_MINIMA_LIVRE) ? (total * (1 - FRACAO_MINIMA_LIVRE)) / soma : 1);
  const kH = teto(esq + dir, largura), kV = teto(topo + base, altura);
  esq *= kH; dir *= kH; topo *= kV; base *= kV;
  return { paddingTopLeft: [Math.round(esq), Math.round(topo)], paddingBottomRight: [Math.round(dir), Math.round(base)] };
}

/** Os retângulos, em tela, de tudo o que está marcado `data-sobre-o-mapa` dentro de `raiz` (a barra do polígono, os botões do topo…). */
export function retangulosSobrepostos(raiz: Element | null): Retangulo[] {
  if (!raiz) return [];
  const out: Retangulo[] = [];
  raiz.querySelectorAll('[data-sobre-o-mapa]').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  });
  return out;
}

/** O `fitBounds` do "pasto inteiro": animação curta (0,3 s), nunca mais perto que `maxZoom`. */
export const OPCOES_PASTO_INTEIRO: FitBoundsOptions = { maxZoom: 18, animate: true, duration: 0.3 };

interface Opcoes {
  mapa: MapaLeaflet | null;
  clienteId: string | null | undefined;
  fazendaId: string | null | undefined;
  limitesDaFazenda: LimitesDaFazenda | null;
  /** Os paddings/`maxZoom` que a visão usa para a fazenda inteira. */
  opcoesDoAjuste: FitBoundsOptions;
}

export function useEnquadramentoDoMapa({ mapa, clienteId, fazendaId, limitesDaFazenda, opcoesDoAjuste }: Opcoes) {
  const chave = chaveDoEnquadramento(clienteId, fazendaId);
  const limites = limitesDaFazendaAtual(limitesDaFazenda, fazendaId);
  const feitoRef = useRef<{ chave: string; mapa: MapaLeaflet } | null>(null);
  const opcoesRef = useRef(opcoesDoAjuste);
  opcoesRef.current = opcoesDoAjuste;
  const chaveRef = useRef(chave);
  chaveRef.current = chave;

  /* todo movimento (inclui zoom e o invalidateSize que mantém o centro): marca o contêiner e guarda — só depois do enquadramento
     inicial da chave, para o passeio do mapa recém-criado (zoom 5) nunca sobrescrever o guardado */
  useEffect(() => {
    if (!mapa) return;
    const aoMover = () => {
      const c = mapa.getCenter();
      const e: Enquadramento = { lat: c.lat, lng: c.lng, zoom: mapa.getZoom() };
      try { mapa.getContainer().setAttribute('data-enquadramento', textoDoEnquadramento(e)); } catch { /* contêiner já desmontado */ }
      const feito = feitoRef.current;
      if (feito && feito.mapa === mapa && feito.chave === chaveRef.current) guardarEnquadramento(feito.chave, e);
    };
    mapa.on('moveend', aoMover);
    return () => { mapa.off('moveend', aoMover); };
  }, [mapa]);

  /* a regra: guardado → setView; senão a fazenda inteira (uma vez por chave, quando os limites chegam) */
  useEffect(() => {
    if (!mapa || !chave) return;
    if (feitoRef.current && feitoRef.current.mapa === mapa && feitoRef.current.chave === chave) return;
    const guardado = lerEnquadramento(chave);
    const decisao = decidirEnquadramento(guardado, !!limites);
    if (decisao === 'esperar') return;
    feitoRef.current = { chave, mapa };
    try {
      if (decisao === 'restaurar' && guardado) mapa.setView([guardado.lat, guardado.lng], guardado.zoom, { animate: false });
      else if (limites) mapa.fitBounds(limites, { ...opcoesRef.current, animate: false });
    } catch { /* mapa ainda sem tamanho: o próximo movimento guarda */ }
  }, [mapa, chave, limites]);

  /** Gesto explícito (o botão "Ver fazenda inteira"): enquadra e o `moveend` guarda. Sem argumento, usa os limites da fazenda. */
  const enquadrarEm = useCallback((alvo?: LatLngBounds | null, opcoes?: FitBoundsOptions) => {
    if (!mapa) return;
    const l = alvo ?? limites;
    if (!l || !l.isValid()) return;
    if (chaveRef.current) feitoRef.current = { chave: chaveRef.current, mapa };
    try { mapa.fitBounds(l, { ...opcoesRef.current, ...opcoes }); } catch { /* */ }
  }, [mapa, limites]);

  /** MAPA-ZOOM-E-PAINEL-01: enquadra o polígono inteiro na área visível (o padding vem da sobreposição real em `raiz`); passa pelo mesmo
   *  caminho do "Ver fazenda inteira", então o `moveend` guarda. */
  const enquadrarPoligono = useCallback((alvo: LatLngBounds | null | undefined, raiz: Element | null) => {
    if (!mapa || !alvo || !alvo.isValid()) return;
    const c = mapa.getContainer().getBoundingClientRect();
    const pad = paddingDaAreaVisivel({ left: c.left, top: c.top, right: c.right, bottom: c.bottom }, retangulosSobrepostos(raiz));
    enquadrarEm(alvo, { ...pad, ...OPCOES_PASTO_INTEIRO });
  }, [mapa, enquadrarEm]);

  return { verFazendaInteira: enquadrarEm, enquadrarEm, enquadrarPoligono };
}
