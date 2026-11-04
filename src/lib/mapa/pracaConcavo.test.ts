/**
 * PIQUETES-PRACA-CONCAVO-01 (Gabriel 03/11 09:41, NJ › Pureza › P19A: pediu 4, saíram 6; "Linha 4: 333 m · trechos 329 · 0 m"; a praça
 * "fora do pasto" com o centro dentro) — contornos SINTÉTICOS (metros → graus perto da Pureza):
 *   - o "C": quadrado de 1000 m com uma reentrância a oeste (500 m de fundo, de y 400 a 600);
 *   - o quadrado com FURO de 80 m no meio (a praça antiga que a união de 4 piquetes deixou).
 */
import { describe, expect, it } from 'vitest';
import {
  divisoesDasLinhas, ehDivisaoPequena, fraseDaSaida, linhasQueSaemEVoltam, resolverLinhas, trechosDaLinha, type LinhaDeCorte,
} from '@/lib/mapa/linhasDosPiquetes';
import { motivoDaPraca, novaPracaCentral, pontasForaDaPraca } from '@/lib/mapa/pracaCentral';
import { soltosDentroDoPasto } from '@/lib/mapa/piquetesEmEspera';
import { alternarSeguir, desenhoVazio } from '@/lib/mapa/desenhoDosPiquetes';
import type { Ponto } from '@/lib/mapa/edicaoDoPoligono';

const LON0 = -52.9, LAT0 = -21.47;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 110540;
const g = (x: number, y: number): Ponto => [LON0 + x / KX, LAT0 + y / KY];
const anel = (pts: [number, number][]) => [...pts, pts[0]].map(([x, y]) => g(x, y));
const poligono = (...aneis: [number, number][][]): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: aneis.map(anel) });
const circulo = (cx: number, cy: number, r: number, n = 24): [number, number][] =>
  Array.from({ length: n }, (_x, k): [number, number] => [cx + r * Math.cos((-2 * Math.PI * k) / n), cy + r * Math.sin((-2 * Math.PI * k) / n)]);

const C = poligono([[0, 0], [1000, 0], [1000, 1000], [0, 1000], [0, 600], [500, 600], [500, 400], [0, 400]]);
/* a linha N–S em x = 250: entra pelo sul, sai na reentrância (y 400), volta (y 600) e vai até o norte */
const QUE_VOLTA: LinhaDeCorte = { id: 'l1', pontos: [g(250, 0), g(250, 1000)] };
/* a linha comum, que só passa um pouco da borda nas pontas */
const COMUM: LinhaDeCorte = { id: 'l2', pontos: [g(750, -5), g(750, 1005)] };

describe('PIQUETES-PRACA-CONCAVO-01 · a linha que sai do pasto e volta', () => {
  it('é cortada no 1º encontro com a borda: 2 divisões (antes saíam 3, a do noroeste era fantasma)', () => {
    const divs = divisoesDasLinhas(C, [QUE_VOLTA]);
    expect(divs).toHaveLength(2);
    const areas = divs.map(d => d.areaHa).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(10, 0); // o bloco sudoeste: 250 × 400 m
  });
  it('a resolvida termina na borda da reentrância (y 400) e os trechos não têm "0 m"', () => {
    const [r] = resolverLinhas(C, [QUE_VOLTA]);
    const fim = r.pontos[r.pontos.length - 1];
    expect((fim[1] - LAT0) * KY).toBeCloseTo(400, 0);
    const t = trechosDaLinha(C, [QUE_VOLTA], [], 'l1');
    expect(t?.totalM).toBeGreaterThan(395);
    expect(t?.totalM).toBeLessThan(405);
    expect(t?.trechosM.every(m => m > 1)).toBe(true);
  });
  it('avisa NA LINHA: cruza a borda 2×, cortada no 1º encontro, com o ponto do corte', () => {
    const s = linhasQueSaemEVoltam(C, [QUE_VOLTA, COMUM]);
    expect(s.map(x => x.id)).toEqual(['l1']);
    expect(s[0].cruzamentos).toBe(2);
    expect((s[0].corte[1] - LAT0) * KY).toBeCloseTo(400, 0);
    expect(fraseDaSaida(s[0].cruzamentos)).toBe('cruza a borda 2×: cortada no 1º encontro');
  });
  it('"Seguir além da borda" (o gesto): a mesma linha corta os dois pedaços (3 divisões), o aviso diz que segue; de novo volta ao padrão', () => {
    const d1 = alternarSeguir({ ...desenhoVazio(), linhas: [QUE_VOLTA] }, 'l1');
    expect(d1.linhas[0].seguir).toBe(true);
    expect(divisoesDasLinhas(C, d1.linhas)).toHaveLength(3);
    const [s1] = linhasQueSaemEVoltam(C, d1.linhas);
    expect(fraseDaSaida(s1.cruzamentos, s1.seguida)).toBe('cruza a borda 2×: segue além da borda');
    const d2 = alternarSeguir(d1, 'l1');
    expect(d2.linhas[0]).toEqual(QUE_VOLTA);
    expect(divisoesDasLinhas(C, d2.linhas)).toHaveLength(2);
  });
  it('a linha comum (passa da borda só nas pontas) segue como sempre: 2 divisões e nenhum aviso', () => {
    expect(linhasQueSaemEVoltam(C, [COMUM])).toEqual([]);
    expect(divisoesDasLinhas(C, [COMUM])).toHaveLength(2);
  });
  it('divisão abaixo de 1 ha é "pequena" (âmbar na lista); zero não é (é a vazia)', () => {
    expect(ehDivisaoPequena(0.55)).toBe(true);
    expect(ehDivisaoPequena(1)).toBe(false);
    expect(ehDivisaoPequena(0)).toBe(false);
  });
});

describe('PIQUETES-PRACA-CONCAVO-01 · a praça no pasto com furo', () => {
  const FURADO = poligono([[0, 0], [1000, 0], [1000, 1000], [0, 1000]], circulo(500, 560, 40));
  it('o centro dentro, a praça sobre o furo: diz quantas pontas e que é NO FURO, e quais (o mapa as marca)', () => {
    const p = novaPracaCentral(FURADO, { centro: g(500, 500), n: 4, formato: 'circulo', medida: { tipo: 'raio', metros: 40 }, anguloRad: 0 });
    expect(p).not.toBeNull();
    if (!p) return;
    const fora = pontasForaDaPraca(FURADO, p);
    expect(fora.indices.length).toBeGreaterThan(0);
    expect(fora.noFuro).toBe(true);
    expect(motivoDaPraca(FURADO, p)).toBe(
      `A praça precisa ficar toda dentro do pasto: ${fora.indices.length} pontas no furo do pasto (em vermelho). Arraste o centro ou diminua a diagonal.`);
  });
  it('a praça que passa da borda diz "além da borda"; a que cabe não tem motivo', () => {
    const borda = novaPracaCentral(FURADO, { centro: g(20, 200), n: 4, formato: 'regular', medida: { tipo: 'diagonal', metros: 60 }, anguloRad: 0 });
    expect(borda && pontasForaDaPraca(FURADO, borda).noFuro).toBe(false);
    expect(borda && motivoDaPraca(FURADO, borda)).toMatch(/^A praça precisa ficar toda dentro do pasto: 1 ponta além da borda \(em vermelho\)/);
    const cabe = novaPracaCentral(FURADO, { centro: g(500, 250), n: 4, formato: 'circulo', medida: { tipo: 'raio', metros: 40 }, anguloRad: 0 });
    expect(cabe && motivoDaPraca(FURADO, cabe)).toBeNull();
    expect(cabe && pontasForaDaPraca(FURADO, cabe).indices).toEqual([]);
  });
});

describe('PIQUETES-PRACA-CONCAVO-01 · os polígonos soltos dentro do pasto (o "É piquete de" antes de desenhar)', () => {
  const Q = poligono([[0, 0], [1000, 0], [1000, 1000], [0, 1000]]);
  const quadra = (x: number, y: number): GeoJSON.Polygon => poligono([[x, y], [x + 100, y], [x + 100, y + 100], [x, y + 100]]);
  it('só os sem classificação, sem pasto, com o ponto interior dentro do contorno; nunca o próprio contorno', () => {
    const geos = [
      { id: 'contorno', pasto_id: 'P', tipo: 'pasto', nome_original: 'P19A', geojson: Q },
      { id: 'a', pasto_id: null, tipo: 'outra', nome_original: '19B', geojson: quadra(100, 100) },
      { id: 'b', pasto_id: null, tipo: null, nome_original: '19C', geojson: quadra(600, 600) },
      { id: 'ligado', pasto_id: 'X', tipo: 'pasto', nome_original: 'P18', geojson: quadra(300, 300) },
      { id: 'classificado', pasto_id: null, tipo: 'reserva', nome_original: 'APP', geojson: quadra(400, 700) },
      { id: 'fora', pasto_id: null, tipo: 'outra', nome_original: '20A', geojson: quadra(1500, 100) },
    ];
    expect(soltosDentroDoPasto(Q, geos, 'contorno').map(x => x.id)).toEqual(['a', 'b']);
    expect(soltosDentroDoPasto(Q, geos, 'contorno')[0]).toEqual({ id: 'a', nome_original: '19B', tipo: 'outra', pasto_id: null });
  });
});
