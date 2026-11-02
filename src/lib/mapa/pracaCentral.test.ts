/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a — o "Praça central": o losango de 60 m, as cercas que terminam nos vértices, girar, arrastar o canto,
 * "Igualar áreas" (e a cerca fixa que não se mexe), "Alinhar praça", área desejada, círculo, hexágono, octógono.
 */
import { describe, expect, it } from 'vitest';
import { areaDoBancoHa, paraPlano } from './criarPiquetes';
import { distanciaM, type Ponto } from './edicaoDoPoligono';
import { divisoesDasLinhas, planoDoPasto, pontoInterior, projetarNaBorda } from './linhasDosPiquetes';
import {
  alinharPraca, anguloDoLado, areaDaPraca, areaDesejadaNaPraca, centroideDoPasto, cercasComoLinhas, cercaComPontos, comMedida, girarCerca, igualarAreas,
  ladoMaisLongo, ladoMaisPerto, medidasDaPraca, motivoDaPraca, moverCentro, moverVertice, novaPracaCentral, pracaDesenhada, comFixa, deslizarCerca,
  type PracaCentral,
} from './pracaCentral';

const R = 6378137;
function retangulo(ha: number, lon0 = -47.9, latS = -15.51, dLon = 0.0112): GeoJSON.Polygon {
  const dl = (dLon * Math.PI) / 180;
  const latN = (Math.asin(Math.sin((latS * Math.PI) / 180) + (ha * 10000) / (R * R * dl)) * 180) / Math.PI;
  return { type: 'Polygon', coordinates: [[[lon0, latS], [lon0 + dLon, latS], [lon0 + dLon, latN], [lon0, latN], [lon0, latS]]] };
}
const g = retangulo(97.5);
const [[x0, y0], [x1], [, y1]] = g.coordinates[0];
const meio: Ponto = [(x0 + x1) / 2, (y0 + y1) / 2];
const fora: Ponto = [x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.4]; // longe do meio: as áreas saem desiguais
const soma = (ds: { areaHa: number }[]) => ds.reduce((s, d) => s + d.areaHa, 0);
const dividir = (p: PracaCentral) => divisoesDasLinhas(g, cercasComoLinhas(p), [areaDaPraca(p)]);
const praca = (centro: Ponto, n = 4, diagonal = 60, ang = anguloDoLado(g, ladoMaisLongo(g))) => novaPracaCentral(g, { centro, n, formato: 'regular', medida: { tipo: 'diagonal', metros: diagonal }, anguloRad: ang })!;
const naBorda = (p: Ponto) => distanciaM(p, projetarNaBorda(g, [], p)) < 0.05;
const plano = planoDoPasto(g);
const cm = (a: Ponto) => paraPlano(plano, a);

describe('o losango (4 divisões)', () => {
  it('diagonal de 60 m = área d²/2 = 0,18 ha (e o hexágono/octógono saem com 6 e 8 vértices)', () => {
    const p = praca(meio);
    expect(p.vertices).toHaveLength(4);
    expect(Math.abs(areaDoBancoHa(areaDaPraca(p).geojson) - 0.18)).toBeLessThan(0.002);
    const m = medidasDaPraca(g, p);
    expect(Math.abs(m.diagonalM - 60)).toBeLessThan(0.1);
    expect(praca(meio, 6).vertices).toHaveLength(6);
    expect(praca(meio, 8).vertices).toHaveLength(8);
  });

  it('o lado como medida: lado de 42,43 m = losango de 60 m', () => {
    const p = novaPracaCentral(g, { centro: meio, n: 4, formato: 'regular', medida: { tipo: 'lado', metros: 60 / Math.SQRT2 }, anguloRad: 0 })!;
    expect(Math.abs(medidasDaPraca(g, p).diagonalM - 60)).toBeLessThan(0.1);
  });

  it('cada cerca termina num vértice da praça e na borda do pasto', () => {
    const p = praca(fora);
    expect(p.cercas).toHaveLength(4);
    for (const c of p.cercas) {
      expect(c.pontos[0]).toEqual(p.vertices[c.vertice]);
      expect(naBorda(c.pontos[c.pontos.length - 1])).toBe(true);
      expect(c.fixa).toBe(false);
    }
  });

  it('a cruz de 4 é paralela ao lado de referência (e ao perpendicular)', () => {
    const p = praca(fora, 4, 60, anguloDoLado(g, ladoMaisLongo(g)));
    const ref = anguloDoLado(g, ladoMaisLongo(g));
    const c1 = p.cercas[0];
    const a = cm(c1.pontos[0]), b = cm(c1.pontos[1]);
    const dif = Math.atan2(b[1] - a[1], b[0] - a[0]) - ref;
    expect(Math.abs(Math.sin(dif))).toBeLessThan(1e-6);
    const c2 = p.cercas[1];
    const a2 = cm(c2.pontos[0]), b2 = cm(c2.pontos[1]);
    expect(Math.abs((b2[0] - a2[0]) * Math.cos(ref) + (b2[1] - a2[1]) * Math.sin(ref))).toBeLessThan(1e-4 * Math.hypot(b2[0] - a2[0], b2[1] - a2[1]));
  });

  it('4 divisões; divisões + praça = o pasto (0,02 ha); a praça sai de todas', () => {
    const p = praca(fora);
    const ds = dividir(p);
    expect(ds).toHaveLength(4);
    expect(Math.abs(soma(ds) + areaDoBancoHa(areaDaPraca(p).geojson) - areaDoBancoHa(g))).toBeLessThan(0.02);
    expect(ds.every(d => d.areaHa > 5)).toBe(true);
  });

  it('hexágono = 6 divisões, octógono = 8', () => {
    expect(dividir(praca(meio, 6))).toHaveLength(6);
    expect(dividir(praca(meio, 8))).toHaveLength(8);
  });

  it('círculo de 48 lados: 4 cercas saindo de vértices a 90°; área ≈ π·r²', () => {
    const p = novaPracaCentral(g, { centro: fora, n: 4, formato: 'circulo', medida: { tipo: 'raio', metros: 30 }, anguloRad: 0.4 })!;
    expect(p.vertices).toHaveLength(48);
    expect(p.cercas.map(c => c.vertice)).toEqual([0, 12, 24, 36]);
    expect(Math.abs(areaDoBancoHa(areaDaPraca(p).geojson) - (Math.PI * 900) / 10000)).toBeLessThan(0.004);
    expect(dividir(p)).toHaveLength(4);
  });

  it('desenhada ponto a ponto: uma cerca por vértice; com menos de 3 pontos, nada', () => {
    const c = (dx: number, dy: number): Ponto => [fora[0] + dx, fora[1] + dy];
    const p = pracaDesenhada(g, [c(-0.0003, 0), c(0, 0.0003), c(0.0003, 0), c(0, -0.0003), c(-0.0002, -0.0002)])!;
    expect(p.cercas).toHaveLength(5);
    expect(pracaDesenhada(g, [fora, meio])).toBeNull();
  });
});

describe('mexer na praça', () => {
  it('arrastar o centro leva a praça e as cercas (os vértices andam o mesmo)', () => {
    const p = praca(meio);
    const novo: Ponto = [meio[0] + 0.0005, meio[1] + 0.0003];
    const q = moverCentro(g, p, novo);
    expect(distanciaM(q.centro, novo)).toBeLessThan(0.01);
    const d0 = distanciaM(p.vertices[0], p.centro), d1 = distanciaM(q.vertices[0], q.centro);
    expect(Math.abs(d0 - d1)).toBeLessThan(0.05);
    for (const c of q.cercas) { expect(c.pontos[0]).toEqual(q.vertices[c.vertice]); expect(naBorda(c.pontos[1])).toBe(true); }
    expect(dividir(q)).toHaveLength(4);
  });

  it('arrastar um canto move o vértice, leva a cerca ligada (que fica fixa) e as outras não mudam', () => {
    const p = praca(meio);
    const novo: Ponto = [p.vertices[1][0] + 0.00012, p.vertices[1][1] + 0.00005];
    const q = moverVertice(g, p, 1, novo);
    expect(q.vertices[1]).toEqual(novo);
    const c = q.cercas.find(x => x.vertice === 1)!;
    expect(c.pontos[0]).toEqual(novo);
    expect(c.fixa).toBe(true);
    expect(q.cercas.filter(x => x.vertice !== 1).every(x => !x.fixa)).toBe(true);
    expect(q.cercas.find(x => x.vertice === 0)).toEqual(p.cercas.find(x => x.vertice === 0));
    expect(dividir(q)).toHaveLength(4);
  });

  it('girar a cerca pela ponta da borda move o vértice dela na praça (no mesmo raio), presa à borda, e a fixa', () => {
    const p = praca(meio);
    const c3 = p.cercas[2];
    const fim = c3.pontos[1];
    const puxado: Ponto = [fim[0] + 0.0008, fim[1] + 0.0003]; // arrastado para dentro e para o lado: a ponta volta à borda, mais ao norte
    const q = girarCerca(g, p, c3.id, puxado);
    const nova = q.cercas[2];
    expect(nova.fixa).toBe(true);
    expect(nova.pontos[0]).not.toEqual(c3.pontos[0]);
    expect(q.vertices[c3.vertice]).toEqual(nova.pontos[0]);
    expect(naBorda(nova.pontos[nova.pontos.length - 1])).toBe(true);
    const r0 = distanciaM(p.centro, p.vertices[c3.vertice]), r1 = distanciaM(q.centro, q.vertices[c3.vertice]);
    expect(Math.abs(r0 - r1)).toBeLessThan(0.1);
    expect(dividir(q)).toHaveLength(4);
  });

  it('cerca quebrada (ponto no meio) fica fixa e a cerca continua ligada ao vértice; deslizar a cerca leva o vértice', () => {
    const p = praca(meio);
    const c = p.cercas[0];
    const mid: Ponto = [(c.pontos[0][0] + c.pontos[1][0]) / 2, (c.pontos[0][1] + c.pontos[1][1]) / 2 + 0.00005];
    const q = cercaComPontos(p, c.id, [c.pontos[0], mid, c.pontos[1]]);
    expect(q.cercas[0].pontos).toHaveLength(3);
    expect(q.cercas[0].fixa).toBe(true);
    const d = deslizarCerca(g, p, p.cercas[1].id, 20);
    expect(d.cercas[1].fixa).toBe(true);
    expect(d.vertices[p.cercas[1].vertice]).toEqual(d.cercas[1].pontos[0]);
    expect(distanciaM(d.vertices[p.cercas[1].vertice], p.vertices[p.cercas[1].vertice])).toBeGreaterThan(15);
  });

  it('comMedida escala em volta do centro (a diagonal dobra, a área quadruplica)', () => {
    const p = praca(meio);
    const q = comMedida(g, p, { tipo: 'diagonal', metros: 120 });
    expect(Math.abs(medidasDaPraca(g, q).diagonalM - 120)).toBeLessThan(0.2);
    expect(Math.abs(medidasDaPraca(g, q).areaHa / medidasDaPraca(g, p).areaHa - 4)).toBeLessThan(0.02);
  });

  it('praça com ponta fora do pasto: a frase; dentro: nada', () => {
    expect(motivoDaPraca(g, praca(meio))).toBeNull();
    expect(motivoDaPraca(g, praca([x0 + 0.00003, meio[1]]))).toContain('dentro do pasto');
  });

  it('o centro do pasto: dentro, e no meio de um retângulo', () => {
    const c = centroideDoPasto(g);
    expect(Math.abs(c[0] - meio[0])).toBeLessThan(1e-6);
    expect(Math.abs(c[1] - meio[1])).toBeLessThan(1e-4);
  });

  it('o lado mais perto do clique troca a referência', () => {
    expect(ladoMaisPerto(g, [meio[0], y0 + 0.00001])).toBe(0);
    expect(ladoMaisPerto(g, [x1 - 0.00001, meio[1]])).toBe(1);
  });
});

describe('Igualar áreas', () => {
  it('as não fixas ficam iguais (±0,01 ha) e a fixa não se mexe', () => {
    const p0 = praca(fora);
    const antes = dividir(p0).map(d => d.areaHa);
    expect(Math.max(...antes) - Math.min(...antes)).toBeGreaterThan(5); // o ponto de partida é desigual
    // a cerca 2 é ajustada à mão (um empurrão no ângulo) e fica fixa
    const puxada = girarCerca(g, p0, p0.cercas[1].id, [p0.cercas[1].pontos[1][0], p0.cercas[1].pontos[1][1] + 0.0002]);
    expect(puxada.cercas[1].fixa).toBe(true);
    const r = igualarAreas(g, puxada);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.praca.cercas[1]).toEqual(puxada.cercas[1]); // a fixa: idêntica
    const ds = dividir(r.praca);
    expect(ds).toHaveLength(4);
    const as = ds.map(d => d.areaHa);
    expect(Math.max(...as) - Math.min(...as)).toBeLessThanOrEqual(0.01);
    expect(r.praca.cercas.filter(c => !c.fixa).every(c => c.pontos.length === 2)).toBe(true);
  });

  it('sem nenhuma fixa a 1ª é o pivô e as 4 ficam iguais', () => {
    const p0 = praca(fora);
    const r = igualarAreas(g, p0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.praca.cercas[0]).toEqual(p0.cercas[0]);
    const as = dividir(r.praca).map(d => d.areaHa);
    expect(Math.max(...as) - Math.min(...as)).toBeLessThanOrEqual(0.01);
    expect(r.praca.cercas.every(c => !c.fixa)).toBe(true);
  });

  it('duas fixas: o que fica entre elas se iguala entre si; o resto, também', () => {
    const p0 = praca(fora, 6);
    const p1 = comFixa(comFixa(p0, p0.cercas[0].id, true), p0.cercas[3].id, true);
    const r = igualarAreas(g, p1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.praca.cercas[0]).toEqual(p1.cercas[0]);
    expect(r.praca.cercas[3]).toEqual(p1.cercas[3]);
    const ds = dividir(r.praca);
    expect(ds).toHaveLength(6);
    // dois trechos de 3 divisões (entre as fixas 0 e 3, e de volta): ordenadas, as 3 menores são iguais entre si e as 3 maiores também
    const as = ds.map(d => d.areaHa).sort((a, b) => a - b);
    expect(as[2] - as[0]).toBeLessThanOrEqual(0.01);
    expect(as[5] - as[3]).toBeLessThanOrEqual(0.01);
    expect(Math.abs(soma(ds) + areaDoBancoHa(areaDaPraca(r.praca).geojson) - areaDoBancoHa(g))).toBeLessThan(0.02);
  });

  it('uma cerca só: recusa com frase', () => {
    const p0 = praca(meio);
    const r = igualarAreas(g, { ...p0, cercas: [p0.cercas[0]] });
    expect(r.ok).toBe(false);
  });
});

describe('Alinhar praça', () => {
  it('reorienta o polígono regular pelas cercas: giradas juntas, o losango volta a ser regular no ângulo delas', () => {
    let p = praca(meio, 4, 60, 0);
    const alvo = 0.35; // rad
    const pl = plano;
    const c = paraPlano(pl, p.centro);
    // gira as 4 pontas da borda 20° em volta da praça (cada uma presa à borda)
    for (const cerca of [...p.cercas]) {
      const f = paraPlano(pl, cerca.pontos[1]);
      const ang = Math.atan2(f[1] - c[1], f[0] - c[0]) + alvo, raio = 400;
      const novo: Ponto = [p.centro[0] + (raio * Math.cos(ang)) / pl.kx, p.centro[1] + (raio * Math.sin(ang)) / pl.ky];
      p = girarCerca(g, p, cerca.id, novo);
    }
    const q = alinharPraca(g, p);
    const angs = q.vertices.map(v => { const a = paraPlano(pl, v); return Math.atan2(a[1] - c[1], a[0] - c[0]); });
    for (let k = 1; k < 4; k++) {
      const dif = ((angs[k] - angs[0] + 2 * Math.PI) % (2 * Math.PI));
      expect(Math.abs(dif - (k * Math.PI) / 2)).toBeLessThan(0.002);
    }
    const rs = q.vertices.map(v => distanciaM(v, q.centro));
    expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(0.05);
    expect(q.cercas.every(x => x.pontos[0][0] === q.vertices[x.vertice][0])).toBe(true);
  });

  it('praça livre não se alinha (devolve igual)', () => {
    const p = pracaDesenhada(g, [[fora[0] - 0.0003, fora[1]], [fora[0], fora[1] + 0.0003], [fora[0] + 0.0003, fora[1]]])!;
    expect(alinharPraca(g, p)).toBe(p);
  });
});

describe('área desejada na praça', () => {
  it('pedir 20 ha na divisão: a cerca livre que a limita gira e ela fica fixa', () => {
    const p0 = praca(fora);
    const ds = dividir(p0);
    const alvo = ds[0];
    const r = areaDesejadaNaPraca(g, p0, { linhas: [], internas: [] }, pontoInterior(alvo.geojson!), 20);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const depois = dividir(r.praca);
    expect(depois.some(d => Math.abs(d.areaHa - 20) <= 0.01)).toBe(true);
    expect(r.praca.cercas.filter(c => c.fixa)).toHaveLength(1);
  });
  it('as duas cercas da divisão fixas: recusa pedindo para destravar', () => {
    const p0 = praca(fora);
    const ref = pontoInterior(dividir(p0)[0].geojson!);
    const fixas = { ...p0, cercas: p0.cercas.map(c => ({ ...c, fixa: true })) };
    const r = areaDesejadaNaPraca(g, fixas, { linhas: [], internas: [] }, ref, 20);
    expect(r.ok).toBe(false);
    if ('motivo' in r) expect(r.motivo).toContain('fixas');
    expect(areaDesejadaNaPraca(g, p0, { linhas: [], internas: [] }, ref, 0).ok).toBe(false);
  });
});
