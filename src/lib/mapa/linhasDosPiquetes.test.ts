/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a — a prova de verdade da `linhasDosPiquetes` (ela nunca tinha rodado): grade, junção em T, raios de uma
 * praça, soma = pasto, furo, a fita de 0,4 mm e o pasto em U.
 */
import { describe, expect, it } from 'vitest';
import { areaDoBancoHa, cortesIguais, montar } from './criarPiquetes';
import {
  alvosDeEncaixe, areasParaGravar, circuloEmPoligono, comAreaDesejadaPelaLinha, comPontoMovido, comPontoNaLinha, deduplicarSegmentos, deslizarParalela,
  divisoesDasLinhas, encaixar, fraseDaLinha, ladosDasAreas, linhasDaGrade, novaPraca, novoCorredor, pontoDentro, pontoInterior, projetarNaBorda,
  reguaLivre, resolverLinhas, segmentosDaRegua, semPontoDaLinha, trechosDaLinha, type LinhaDeCorte,
} from './linhasDosPiquetes';
import type { Ponto } from './edicaoDoPoligono';

const R = 6378137;
/** Um retângulo lat/lon com a área pedida pela fórmula do banco: R²·Δλ·(sen φn − sen φs). */
function retangulo(ha: number, lon0 = -47.9, latS = -15.51, dLon = 0.0112): GeoJSON.Polygon {
  const dl = (dLon * Math.PI) / 180;
  const latN = (Math.asin(Math.sin((latS * Math.PI) / 180) + (ha * 10000) / (R * R * dl)) * 180) / Math.PI;
  return { type: 'Polygon', coordinates: [[[lon0, latS], [lon0 + dLon, latS], [lon0 + dLon, latN], [lon0, latN], [lon0, latS]]] };
}
const caixa = (g: GeoJSON.Polygon) => {
  const [[x0, y0], [x1], [, y1]] = g.coordinates[0];
  return { x0, y0, x1, y1, xm: (x0 + x1) / 2, ym: (y0 + y1) / 2 };
};
const soma = (ds: { areaHa: number }[]) => ds.reduce((s, d) => s + d.areaHa, 0);

describe('linhasDaGrade + divisoesDasLinhas', () => {
  it('grade 2 × 4 = 8 divisões iguais (85,2 ha → 10,65 ha cada)', () => {
    const g = retangulo(85.2);
    const m = montar(g);
    const linhas = linhasDaGrade(m, cortesIguais(m, 2, 4));
    expect(linhas).toHaveLength(1 + 2 * 3); // 1 corte de faixa + 3 colunas em cada uma das 2 faixas
    const ds = divisoesDasLinhas(g, linhas);
    expect(ds).toHaveLength(8);
    for (const d of ds) expect(Math.abs(d.areaHa - 10.65)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(soma(ds) - areaDoBancoHa(g))).toBeLessThan(0.001);
  });

  it('N iguais = 1 × N: 5 partes de 17 ha', () => {
    const g = retangulo(85);
    const m = montar(g);
    const ds = divisoesDasLinhas(g, linhasDaGrade(m, cortesIguais(m, 1, 5)));
    expect(ds).toHaveLength(5);
    for (const d of ds) expect(Math.abs(d.areaHa - 17)).toBeLessThanOrEqual(0.01);
  });
});

describe('a junção em T', () => {
  const g = retangulo(80);
  const { x0, y0, x1, y1, xm, ym } = caixa(g);
  const horizontal: LinhaDeCorte = { id: 'h', pontos: [[x0, ym], [x1, ym]] };
  const coluna: LinhaDeCorte = { id: 'v', pontos: [[xm, ym], [xm, y1]] }; // só na faixa de cima: do corte à borda norte

  it('a coluna da faixa de cima NÃO corta a de baixo: 3 divisões (2 em cima, 1 embaixo)', () => {
    const ds = divisoesDasLinhas(g, [horizontal, coluna]);
    expect(ds).toHaveLength(3);
    expect(Math.abs(soma(ds) - areaDoBancoHa(g))).toBeLessThan(0.001);
    const areas = ds.map(d => Math.round(d.areaHa)).sort((a, b) => a - b);
    expect(areas).toEqual([20, 20, 40]);
  });

  it('o resultado independe da ordem das linhas', () => {
    const a = divisoesDosOrdenadas(divisoesDasLinhas(g, [horizontal, coluna]));
    const b = divisoesDosOrdenadas(divisoesDasLinhas(g, [coluna, horizontal]));
    expect(b).toEqual(a);
  });

  it('a coluna curta (para antes da horizontal) vai até ela: o mesmo T, sem fresta', () => {
    const curta: LinhaDeCorte = { id: 'v', pontos: [[xm, y1], [xm, ym + (y1 - ym) * 0.2]] };
    const ds = divisoesDasLinhas(g, [horizontal, curta]);
    expect(ds).toHaveLength(3);
    const r = resolverLinhas(g, [horizontal, curta]);
    expect(Math.abs(r[1].pontos[1][1] - ym)).toBeLessThan(1e-7);
  });

  it('a coluna que passa da horizontal é aparada no cruzamento: o mesmo T', () => {
    const longa: LinhaDeCorte = { id: 'v', pontos: [[xm, y1], [xm, y0 + (ym - y0) * 0.5]] };
    const ds = divisoesDasLinhas(g, [horizontal, longa]);
    expect(ds).toHaveLength(3);
    expect(Math.abs(soma(ds) - areaDoBancoHa(g))).toBeLessThan(0.001);
  });
  void y0;
});

const divisoesDosOrdenadas = (ds: { areaHa: number }[]) => ds.map(d => Math.round(d.areaHa * 1000)).sort((a, b) => a - b);

describe('6 cercas em raio para uma praça central', () => {
  it('praça hexagonal + 6 cercas (da ponta da praça para fora) = 6 divisões; praça + divisões = pasto', () => {
    const g = retangulo(97.5);
    const { xm, ym } = caixa(g);
    const hex = circuloEmPoligono([xm, ym], 30, 6);
    const praca = novaPraca('p', 'Praça de alimentação', hex)!;
    const kx = 111320 * Math.cos((ym * Math.PI) / 180), ky = 110540;
    const cercas: LinhaDeCorte[] = hex.map((v, k) => {
      const dx = (v[0] - xm) * kx, dy = (v[1] - ym) * ky, len = Math.hypot(dx, dy);
      return { id: `c${k}`, pontos: [v, [v[0] + (dx / len / kx) * 40, v[1] + (dy / len / ky) * 40]] }; // curtas: o motor leva até a borda
    });
    const ds = divisoesDasLinhas(g, cercas, [praca]);
    expect(ds).toHaveLength(6);
    expect(Math.abs(soma(ds) + areaDoBancoHa(praca.geojson) - areaDoBancoHa(g))).toBeLessThan(0.02);
  });
});

describe('soma das divisões + praça + corredor = o pasto', () => {
  it('com praça no centro, corredor de 6 m de lado a lado e 4 cercas', () => {
    const g = retangulo(100);
    const { x0, x1, xm, ym, y1 } = caixa(g);
    const praca = novaPraca('p', 'Praça', circuloEmPoligono([xm, ym], 25, 4))!;
    const corredor = novoCorredor('c', 'Corredor', [[x0 + 0.002, caixa(g).y0], [x0 + 0.002, y1]], 6)!;
    expect(corredor).not.toBeNull();
    const linhas: LinhaDeCorte[] = [
      { id: 'n', pontos: [[xm, ym + 0.0002], [xm, y1]] }, { id: 's', pontos: [[xm, ym - 0.0002], [xm, caixa(g).y0]] },
      { id: 'l', pontos: [[xm + 0.0002, ym], [x1, ym]] }, { id: 'o', pontos: [[xm - 0.0002, ym], [x0, ym]] },
    ];
    const ds = divisoesDasLinhas(g, linhas, [praca, corredor]);
    expect(ds.length).toBeGreaterThanOrEqual(5);
    const total = soma(ds) + areaDoBancoHa(praca.geojson) + areaDoBancoHa(corredor.geojson);
    expect(Math.abs(total - areaDoBancoHa(g))).toBeLessThan(0.02);
  });
});

describe('pasto com furo', () => {
  it('uma linha de lado a lado: 2 divisões, o furo fica anel interno de uma e a soma é a área sem ele', () => {
    const base = retangulo(90);
    const { x0, y0, x1, y1, xm, ym } = caixa(base);
    const r = (x1 - x0) * 0.04;
    const cx = x0 + (x1 - x0) * 0.25, cy = ym + (y1 - y0) * 0.25;
    const furo = [[cx - r, cy - r], [cx - r, cy + r], [cx + r, cy + r], [cx + r, cy - r], [cx - r, cy - r]];
    const g: GeoJSON.Polygon = { type: 'Polygon', coordinates: [base.coordinates[0], furo] };
    const ds = divisoesDasLinhas(g, [{ id: 'v', pontos: [[xm, y0], [xm, y1]] }]);
    expect(ds).toHaveLength(2);
    expect(Math.abs(soma(ds) - areaDoBancoHa(g))).toBeLessThan(0.001);
    expect(areaDoBancoHa(g)).toBeLessThan(areaDoBancoHa(base));
    expect(ds.filter(d => d.geojson?.type === 'Polygon' && d.geojson.coordinates.length === 2)).toHaveLength(1);
  });
});

describe('a fita de 0,4 mm', () => {
  it('não cria peça nem perde área: 12 linhas em grade 3 × 4 dão 12 peças e a soma erra menos de 0,001 ha', () => {
    const g = retangulo(120);
    const m = montar(g);
    const ds = divisoesDasLinhas(g, linhasDaGrade(m, cortesIguais(m, 3, 4)));
    expect(ds).toHaveLength(12);
    expect(Math.abs(soma(ds) - areaDoBancoHa(g))).toBeLessThan(0.001);
    expect(ds.every(d => d.partes === 1 && d.areaHa > 5)).toBe(true);
  });
});

describe('pasto em U', () => {
  // U: base embaixo e dois braços para cima, em graus (~1 km de largura)
  const u: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [0.03, 0], [0.03, 0.02], [0.02, 0.02], [0.02, 0.006], [0.01, 0.006], [0.01, 0.02], [0, 0.02], [0, 0]]
    .map(([x, y]) => [-47.9 + x, -15.5 + y])] };
  /* PIQUETES-PRACA-CONCAVO-01 (Gabriel 03/11): a linha que sai do pasto e volta corta só até o 1º encontro com a borda POR PADRÃO; os dois
     braços juntos só com "Seguir além da borda" (`seguir`) */
  it('uma linha atravessando os dois braços: por padrão corta só o 1º braço (2 divisões)', () => {
    const y = -15.5 + 0.013;
    const ds = divisoesDasLinhas(u, [{ id: 'h', pontos: [[-47.9 - 0.001, y], [-47.9 + 0.031, y]] }]);
    expect(ds).toHaveLength(2);
    expect(Math.abs(soma(ds) - areaDoBancoHa(u))).toBeLessThan(0.001);
  });
  it('com "seguir": 3 divisões (a base com os pés e as duas pontas)', () => {
    const y = -15.5 + 0.013;
    const ds = divisoesDasLinhas(u, [{ id: 'h', pontos: [[-47.9 - 0.001, y], [-47.9 + 0.031, y]], seguir: true }]);
    expect(ds).toHaveLength(3);
    expect(Math.abs(soma(ds) - areaDoBancoHa(u))).toBeLessThan(0.001);
  });
  it('uma linha dentro de um braço: 2 divisões', () => {
    const y = -15.5 + 0.013;
    const ds = divisoesDasLinhas(u, [{ id: 'h', pontos: [[-47.9 - 0.001, y], [-47.9 + 0.0101, y]] }]);
    expect(ds).toHaveLength(2);
    expect(Math.abs(soma(ds) - areaDoBancoHa(u))).toBeLessThan(0.001);
  });
});

describe('editar a linha', () => {
  const g = retangulo(80);
  const { x0, y0, x1, y1, xm, ym } = caixa(g);
  const v: LinhaDeCorte = { id: 'v', pontos: [[xm, y0], [xm, y1]] };

  it('deslizar paralela: a linha anda e as pontas ficam na borda', () => {
    const d = deslizarParalela(g, [], v, 100); // 100 m à esquerda de quem vai do sul ao norte = oeste
    expect(d.pontos[0][0]).toBeLessThan(xm);
    expect(Math.abs(d.pontos[0][1] - y0)).toBeLessThan(1e-6);
    expect(Math.abs(d.pontos[1][1] - y1)).toBeLessThan(1e-6);
  });

  it('ponto na linha não muda a forma; mover e tirar ponto', () => {
    const c = comPontoNaLinha(v, [xm + 0.0001, ym]);
    expect(c.pontos).toHaveLength(3);
    expect(c.pontos[1][0]).toBeCloseTo(xm, 9);
    const m = comPontoMovido(c, 1, [xm + 0.001, ym]);
    expect(m.pontos[1][0]).toBeCloseTo(xm + 0.001, 9);
    expect(semPontoDaLinha(m, 1)?.pontos).toHaveLength(2);
    expect(semPontoDaLinha(v, 0)).toBeNull();
  });

  it('projetar na borda e ponto interior/dentro', () => {
    const p = projetarNaBorda(g, [], [xm, y1 - 0.0003]);
    expect(Math.abs(p[1] - y1)).toBeLessThan(1e-9);
    const ds = divisoesDasLinhas(g, [v]);
    for (const d of ds) expect(pontoDentro(d.geojson, pontoInterior(d.geojson!))).toBe(true);
    expect(pontoDentro(ds[0].geojson, [x1 + 1, y1 + 1])).toBe(false);
  });

  it('área desejada deslizando a linha: 30 ha na divisão oeste; recusa sem linha', () => {
    const r = comAreaDesejadaPelaLinha(g, [v], [], 0, 30, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ds = divisoesDasLinhas(g, r.linhas);
      expect(Math.abs(ds[0].areaHa - 30)).toBeLessThanOrEqual(0.01);
    }
    const sem = comAreaDesejadaPelaLinha(g, [], [], 0, 30, null);
    expect(sem.ok).toBe(false);
    void x0;
  });
});

describe('encaixe', () => {
  it('o ponto (canto) ganha do trecho; o trecho vale dentro da tolerância; a linha em edição é ignorada', () => {
    const g = retangulo(80);
    const { x0, y0, xm } = caixa(g);
    const alvos = alvosDeEncaixe(g, [{ id: 'v', pontos: [[xm, y0], [xm, y0 + 0.005]] }], []);
    const perto: Ponto = [x0 + 0.000004, y0 + 0.000004]; // ~0,5 m do canto
    expect(encaixar(perto, alvos, 2)?.tipo).toBe('ponto');
    const noTrecho: Ponto = [xm + 0.000004, y0 + 0.0025];
    expect(encaixar(noTrecho, alvos, 2)?.tipo).toBe('trecho');
    expect(encaixar(noTrecho, alvos, 2, 'v')).toBeNull();
    expect(encaixar([xm + 0.01, y0 + 0.0025], alvos, 2)).toBeNull();
  });
});

describe('a régua', () => {
  const g = retangulo(80);
  const { x0, y0, y1, xm, ym } = caixa(g);
  it('segmentos sem repetir o lado comum: o contorno + cada trecho entre cruzamentos', () => {
    const h: LinhaDeCorte = { id: 'h', pontos: [[x0, ym], [caixa(g).x1, ym]] };
    const v: LinhaDeCorte = { id: 'v', pontos: [[xm, y0], [xm, y1]] };
    const segs = segmentosDaRegua(g, [h, v], []);
    // contorno: 4 lados partidos pelos 4 encontros das linhas = 8; linhas: 2 × 2 trechos = 4
    expect(segs).toHaveLength(12);
    expect(deduplicarSegmentos([...segs, ...segs])).toHaveLength(12);
  });
  it('trechos de uma cerca e a frase da barra', () => {
    const h: LinhaDeCorte = { id: 'h', pontos: [[x0, ym], [caixa(g).x1, ym]] };
    const v: LinhaDeCorte = { id: 'v', pontos: [[xm, y0], [xm, y1]] };
    const t = trechosDaLinha(g, [h, v], [], 'h')!;
    expect(t.trechosM).toHaveLength(2);
    expect(Math.abs(t.trechosM[0] - t.trechosM[1])).toBeLessThan(2);
    expect(Math.abs(t.totalM - (t.trechosM[0] + t.trechosM[1]))).toBeLessThan(1);
    expect(fraseDaLinha(3, 278.4, [156.2, 122.2])).toBe('Linha 3: 278 m · trechos 156 · 122 m');
    expect(fraseDaLinha(1, 1234, [1234])).toBe('Linha 1: 1.234 m');
    expect(trechosDaLinha(g, [h], [], 'nada')).toBeNull();
  });
  it('régua livre: parciais e total', () => {
    const r = reguaLivre([[xm, y0], [xm, ym], [xm, y1]]);
    expect(r.parciaisM).toHaveLength(2);
    expect(r.totalM).toBeCloseTo(r.parciaisM[0] + r.parciaisM[1], 6);
  });
  it('lados das áreas internas (praça): 4 lados', () => {
    const p = novaPraca('p', 'Praça', circuloEmPoligono([xm, ym], 30, 4))!;
    expect(ladosDasAreas([p])).toHaveLength(4);
  });
});

describe('praça e corredor', () => {
  it('o losango de 60 m de diagonal tem 0,18 ha; o círculo de 48 lados chega perto de π·r²', () => {
    const losango = novaPraca('p', 'P', circuloEmPoligono([-47.9, -15.5], 30, 4))!;
    expect(Math.abs(areaDoBancoHa(losango.geojson) - 0.18)).toBeLessThan(0.002);
    const c = novaPraca('p', 'P', circuloEmPoligono([-47.9, -15.5], 30))!;
    expect(Math.abs(areaDoBancoHa(c.geojson) - (Math.PI * 900) / 10000)).toBeLessThan(0.004);
  });
  it('corredor: faixa de 6 m × 200 m ≈ 0,12 ha; payload das áreas', () => {
    const eixo: Ponto[] = [[-47.9, -15.5], [-47.9 + 200 / (111320 * Math.cos((15.5 * Math.PI) / 180)), -15.5]];
    const c = novoCorredor('c', 'Corredor', eixo, 6)!;
    expect(Math.abs(areaDoBancoHa(c.geojson) - 0.12)).toBeLessThan(0.003);
    expect(areasParaGravar([c])).toEqual([{ nome: 'Corredor', tipo: 'estrada', geojson: c.geojson }]);
    expect(novoCorredor('c', 'C', [eixo[0]], 6)).toBeNull();
  });
});

describe('pontoInterior: a etiqueta no meio da divisão (homologação 02/11 — num quadrante ela caía na borda de baixo)', () => {
  it('num quadrado, o ponto fica no terço do meio (faixas de mesma largura: ganha a do meio)', () => {
    const q: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[-47.9, -15.5], [-47.89, -15.5], [-47.89, -15.49], [-47.9, -15.49], [-47.9, -15.5]]] };
    const [x, y] = pontoInterior(q);
    expect(y).toBeGreaterThan(-15.5 + 0.01 / 3);
    expect(y).toBeLessThan(-15.49 - 0.01 / 3);
    expect(x).toBeCloseTo(-47.895, 6);
  });
});
