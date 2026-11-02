/**
 * MAPA-ZOOM-ENTRE-VISOES-01 — o enquadramento do mapa é um só por fazenda: a chave (cliente + fazenda), o que se guarda e se lê, o valor
 * inválido que é ignorado, a tela que não quebra sem armazenamento e a decisão "guardado → setView; sem guardado → ajusta à fazenda".
 */
import { describe, expect, it } from 'vitest';
import L from 'leaflet';
import {
  chaveDoEnquadramento, decidirEnquadramento, guardarEnquadramento, lerEnquadramento, limitesDaFazendaAtual, textoDoEnquadramento,
  trocarLimites, paddingDaAreaVisivel, retangulosSobrepostos, OPCOES_PASTO_INTEIRO,
} from './enquadramentoDoMapa';

function armazenamentoFalso() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}
const quebrado = {
  getItem: () => { throw new Error('sem armazenamento'); },
  setItem: () => { throw new Error('sem armazenamento'); },
};

describe('chave do enquadramento', () => {
  it('é por cliente + fazenda', () => {
    expect(chaveDoEnquadramento('c1', 'f1')).toBe('mapa-enquadramento:c1:f1');
    expect(chaveDoEnquadramento('c1', 'f1')).not.toBe(chaveDoEnquadramento('c2', 'f1'));
    expect(chaveDoEnquadramento('c1', 'f1')).not.toBe(chaveDoEnquadramento('c1', 'f2'));
  });
  it('sem cliente ou sem fazenda não há chave', () => {
    expect(chaveDoEnquadramento(null, 'f1')).toBeNull();
    expect(chaveDoEnquadramento('c1', undefined)).toBeNull();
  });
});

describe('guardar e ler', () => {
  it('lê o que guardou', () => {
    const a = armazenamentoFalso();
    const k = chaveDoEnquadramento('c1', 'f1');
    expect(guardarEnquadramento(k, { lat: -15.5, lng: -47.25, zoom: 15.5 }, a)).toBe(true);
    expect(lerEnquadramento(k, a)).toEqual({ lat: -15.5, lng: -47.25, zoom: 15.5 });
    expect(lerEnquadramento(chaveDoEnquadramento('c1', 'f2'), a)).toBeNull();
  });
  it('ignora valor inválido (lido e a guardar)', () => {
    const a = armazenamentoFalso();
    const k = 'mapa-enquadramento:c1:f1';
    for (const ruim of ['lixo', '{}', '{"lat":"x","lng":1,"zoom":3}', '{"lat":1,"lng":1,"zoom":99}', '{"lat":91,"lng":1,"zoom":3}',
      '{"lat":1,"lng":181,"zoom":3}', '{"lat":null,"lng":1,"zoom":3}', 'null', '5']) {
      a.m.set(k, ruim);
      expect(lerEnquadramento(k, a)).toBeNull();
    }
    expect(guardarEnquadramento(k, { lat: NaN, lng: 0, zoom: 5 }, a)).toBe(false);
    expect(guardarEnquadramento(k, { lat: 0, lng: 0, zoom: -3 }, a)).toBe(false);
  });
  it('não quebra sem sessionStorage (stub que lança) nem sem armazenamento', () => {
    const k = 'mapa-enquadramento:c1:f1';
    expect(lerEnquadramento(k, quebrado)).toBeNull();
    expect(guardarEnquadramento(k, { lat: 1, lng: 1, zoom: 5 }, quebrado)).toBe(false);
    expect(lerEnquadramento(k, null)).toBeNull();
    expect(guardarEnquadramento(k, { lat: 1, lng: 1, zoom: 5 }, null)).toBe(false);
  });
  it('o texto do gate tem 6 casas em lat/lng', () => {
    expect(textoDoEnquadramento({ lat: -15.1234567, lng: -47.5, zoom: 15 })).toBe('-15.123457,-47.500000,15');
  });
});

describe('a decisão', () => {
  const guardado = { lat: -15, lng: -47, zoom: 15 };
  it('com enquadramento guardado volta a ele (mesmo com limites)', () => {
    expect(decidirEnquadramento(guardado, true)).toBe('restaurar');
    expect(decidirEnquadramento(guardado, false)).toBe('restaurar');
  });
  it('sem guardado enquadra a fazenda inteira; sem limites ainda, espera', () => {
    expect(decidirEnquadramento(null, true)).toBe('ajustar');
    expect(decidirEnquadramento(null, false)).toBe('esperar');
  });
});

describe('limites da fazenda', () => {
  const lim = L.latLngBounds([-15, -47], [-14.9, -46.9]);
  it('só valem para a fazenda a que pertencem', () => {
    expect(limitesDaFazendaAtual({ fazendaId: 'f1', limites: lim }, 'f1')).toBe(lim);
    expect(limitesDaFazendaAtual({ fazendaId: 'f1', limites: lim }, 'f2')).toBeNull();
    expect(limitesDaFazendaAtual(null, 'f1')).toBeNull();
  });
  it('trocar limites iguais mantém a referência', () => {
    const a = trocarLimites(null, 'f1', lim);
    expect(a).not.toBeNull();
    expect(trocarLimites(a, 'f1', L.latLngBounds([-15, -47], [-14.9, -46.9]))).toBe(a);
    expect(trocarLimites(a, 'f2', lim)).not.toBe(a);
    expect(trocarLimites(a, 'f1', L.latLngBounds([]))).toBe(a);
  });
});

/* MAPA-ZOOM-E-PAINEL-01 — o padding da área visível para o "pasto inteiro" */
describe('paddingDaAreaVisivel', () => {
  const mapa = { left: 0, top: 0, right: 1000, bottom: 500 };
  it('sem nada por cima, só a folga de 10% de cada lado', () => {
    expect(paddingDaAreaVisivel(mapa, [])).toEqual({ paddingTopLeft: [100, 50], paddingBottomRight: [100, 50] });
  });
  it('a barra no topo (encostada em cima e à esquerda) desconta SÓ do topo', () => {
    const barra = { left: 12, top: 12, right: 452, bottom: 48 };
    expect(paddingDaAreaVisivel(mapa, [barra])).toEqual({ paddingTopLeft: [100, 98], paddingBottomRight: [100, 50] });
  });
  it('os botões do topo à direita e a barra: vale o mais baixo (não soma)', () => {
    const barra = { left: 12, top: 12, right: 452, bottom: 48 };
    const botoes = { left: 640, top: 12, right: 988, bottom: 40 };
    expect(paddingDaAreaVisivel(mapa, [barra, botoes]).paddingTopLeft[1]).toBe(98);
  });
  it('o botão de baixo à esquerda desconta da base', () => {
    const desfazer = { left: 12, top: 460, right: 190, bottom: 488 };
    expect(paddingDaAreaVisivel(mapa, [desfazer]).paddingBottomRight[1]).toBe(50 + 40);
  });
  it('um painel colado à direita desconta da direita', () => {
    const painel = { left: 700, top: 0, right: 1000, bottom: 500 };
    expect(paddingDaAreaVisivel(mapa, [painel]).paddingBottomRight[0]).toBe(100 + 300);
  });
  it('o que está no meio do mapa (não encosta em borda) não desconta', () => {
    expect(paddingDaAreaVisivel(mapa, [{ left: 400, top: 200, right: 600, bottom: 300 }])).toEqual(paddingDaAreaVisivel(mapa, []));
  });
  it('retângulo fora do mapa ou sem área é ignorado', () => {
    expect(paddingDaAreaVisivel(mapa, [{ left: 2000, top: 0, right: 2100, bottom: 40 }, { left: 5, top: 5, right: 5, bottom: 5 }])).toEqual(paddingDaAreaVisivel(mapa, []));
  });
  it('sobreposição enorme: sobra pelo menos 30% do lado (tudo encolhe junto)', () => {
    const tudo = { left: 0, top: 0, right: 1000, bottom: 450 };
    const { paddingTopLeft: [e, t], paddingBottomRight: [d, b] } = paddingDaAreaVisivel(mapa, [tudo]);
    expect(1000 - e - d).toBeGreaterThanOrEqual(300 - 1);
    expect(500 - t - b).toBeGreaterThanOrEqual(150 - 1);
  });
  it('a animação do pasto inteiro é curta (0,3 s) e o zoom tem teto', () => {
    expect(OPCOES_PASTO_INTEIRO.duration).toBe(0.3);
    expect(OPCOES_PASTO_INTEIRO.animate).toBe(true);
    expect(OPCOES_PASTO_INTEIRO.maxZoom).toBeGreaterThan(0);
  });
});

describe('retangulosSobrepostos', () => {
  it('lê só o que leva data-sobre-o-mapa (e some o sem tamanho)', () => {
    const raiz = document.createElement('div');
    raiz.innerHTML = '<div data-sobre-o-mapa></div><div id="x"></div>';
    const marcado = raiz.querySelector('[data-sobre-o-mapa]');
    if (!marcado) throw new Error('fixture');
    const caixa = (x: number, y: number, w: number, h: number): DOMRect => ({ x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON: () => ({}) });
    marcado.getBoundingClientRect = () => caixa(10, 20, 100, 30);
    expect(retangulosSobrepostos(raiz)).toEqual([{ left: 10, top: 20, right: 110, bottom: 50 }]);
    marcado.getBoundingClientRect = () => caixa(0, 0, 0, 0);
    expect(retangulosSobrepostos(raiz)).toEqual([]);
    expect(retangulosSobrepostos(null)).toEqual([]);
  });
});
