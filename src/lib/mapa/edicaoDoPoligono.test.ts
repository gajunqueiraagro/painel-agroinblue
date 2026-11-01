/* MAPA-EDITAR-POLIGONO-01 — a geometria da edição: medidas na mesma conta do mapa, unir, sobreposição e dividir sem fresta. */
import { describe, it, expect } from 'vitest';
import { areaEmHectares } from './areaDoPoligono';
import {
  contornosDaFazenda, distanciaM, dividirPorLinha, fraseCompactaDasMedidas, fraseDasAreas, fraseDasSobreposicoes, ladosM, medidasDe,
  cruzamentos, FRASE_DO_CRUZAMENTO, MINIMO_SOBREPOSICAO_HA, recortarDosVizinhos, sobreposicoes, textoHa, textoM, unirVizinhos,
  verticeEmCimaDeOutro, vizinhosDaDivisa, type Ponto,
} from './edicaoDoPoligono';

const quad = (x0: number, y0: number, x1: number, y1: number): GeoJSON.Polygon =>
  ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });

// ~1,1 km de lado perto de -15° de latitude
const A = quad(-48, -15, -47.99, -15.01);
const B = quad(-47.99, -15, -47.98, -15.01); // vizinho de A pelo lado x = -47.99
const LONGE = quad(-47.9, -15, -47.89, -15.01);

describe('medidas (a mesma conta do mapa)', () => {
  it('a área é exatamente a do areaEmHectares; os lados e o perímetro pela esfera de mesmo raio', () => {
    const m = medidasDe(A);
    expect(m.areaHa).toBe(areaEmHectares(A));
    expect(m.ladosM).toHaveLength(4);
    // 0,01° de latitude ≈ 1.111,95 m (esfera de raio 6.371.008,8 m)
    expect(m.ladosM[1]).toBeCloseTo(1111.95, 1);
    expect(m.perimetroM).toBeCloseTo(m.ladosM.reduce((s, l) => s + l, 0), 6);
    expect(distanciaM([0, 0], [0, 1])).toBeCloseTo(111195.08, 1);
  });

  it('anel aberto ou fechado dá os mesmos lados', () => {
    const fechado = A.coordinates[0];
    expect(ladosM(fechado)).toEqual(ladosM(fechado.slice(0, -1)));
  });

  it('textos pt-BR e a frase das duas áreas (a oficial é a do cadastro)', () => {
    expect(textoHa(12.44)).toBe('12,4 ha');
    expect(textoM(1530.4)).toBe('1.530 m');
    expect(fraseDasAreas(12.44, 13)).toBe('área do mapa 12,4 ha · cadastro 13,0 ha');
    expect(fraseDasAreas(12.44, null)).toBe('área do mapa 12,4 ha · cadastro —');
  });
});

describe('unir', () => {
  it('dois vizinhos viram um polígono com a soma das áreas', () => {
    const r = unirVizinhos(A, B);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(areaEmHectares(r.valor)).toBeCloseTo(areaEmHectares(A) + areaEmHectares(B), 3);
  });
  it('polígonos que não se tocam: recusa com frase', () => {
    const r = unirVizinhos(A, LONGE);
    expect(r.ok).toBe(false);
    if ('motivo' in r) expect(r.motivo).toContain('não se tocam');
  });
});

describe('sobreposição (aviso)', () => {
  it('vizinho encostado não conta; invadido conta com a área invadida', () => {
    expect(sobreposicoes(A, [{ id: 'b', nome: 'B', geojson: B }])).toEqual([]);
    const invasor = quad(-48, -15, -47.985, -15.01); // invade metade de B
    const s = sobreposicoes(invasor, [{ id: 'b', nome: 'B', geojson: B }, { id: 'l', nome: 'Longe', geojson: LONGE }]);
    expect(s.map(x => x.id)).toEqual(['b']);
    expect(s[0].areaHa).toBeCloseTo(areaEmHectares(B) / 2, 1);
  });

  // MAPA-EDITAR-POLIGONO-02 (Gabriel 01/11): "Sobrepõe Area Total (58,6 ha)" e "P18 (0,0 ha)" eram aviso à toa
  it('abaixo de 0,1 ha não conta (o "P18 (0,0 ha)"); acima conta', () => {
    expect(MINIMO_SOBREPOSICAO_HA).toBe(0.1);
    const faixaFina = quad(-48, -15, -47.989995, -15.01); // invade B numa faixa de ~0,5 m × 1,1 km ≈ 0,06 ha
    expect(sobreposicoes(faixaFina, [{ id: 'b', nome: 'B', geojson: B }])).toEqual([]);
    const faixaLarga = quad(-48, -15, -47.98998, -15.01); // ~2 m × 1,1 km ≈ 0,24 ha
    expect(sobreposicoes(faixaLarga, [{ id: 'b', nome: 'B', geojson: B }]).map(x => x.id)).toEqual(['b']);
  });

  it('o contorno da fazenda nunca é sobreposição: pelo tipo (area_total, area_fazenda) ou por conter todos os outros', () => {
    const C = quad(-47.98, -15, -47.97, -15.01);
    const TOTAL = quad(-48.001, -14.999, -47.969, -15.011); // contém A, B e C
    const todos = [{ id: 'a', nome: 'A', geojson: A }, { id: 'b', nome: 'B', geojson: B }, { id: 'c', nome: 'C', geojson: C },
      { id: 't', nome: 'Area Total', geojson: TOTAL }];
    expect([...contornosDaFazenda(todos)]).toEqual(['t']);
    // pelo tipo, mesmo sem conter todos
    expect([...contornosDaFazenda([{ id: 'x', nome: 'Contorno', tipo: 'area_fazenda', geojson: LONGE }, todos[0]])]).toEqual(['x']);
    expect([...contornosDaFazenda([{ id: 'y', nome: 'Area Total', tipo: 'area_total', geojson: LONGE }, todos[0]])]).toEqual(['y']);
    const invasor = quad(-48, -15, -47.985, -15.01);
    const vizinhos = todos.filter(v => v.id !== 'a');
    expect(sobreposicoes(invasor, vizinhos).map(x => x.id).sort()).toEqual(['b', 't']); // sem ignorar, acusaria o contorno
    expect(sobreposicoes(invasor, vizinhos, MINIMO_SOBREPOSICAO_HA, contornosDaFazenda(todos)).map(x => x.id)).toEqual(['b']);
    // três pastos lado a lado: nenhum contém os outros, nenhum vira "contorno"
    expect(contornosDaFazenda(todos.slice(0, 3)).size).toBe(0);
  });
});

describe('dividir por uma linha', () => {
  it('linha reta de lado a lado: 2 metades que somam a área e dividem a mesma divisa (sem fresta nem sobreposição)', () => {
    const linha: Ponto[] = [[-47.995, -14.99], [-47.995, -15.02]];
    const r = dividirPorLinha(A, linha);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { a, b } = r.valor;
    expect(areaEmHectares(a) + areaEmHectares(b)).toBeCloseTo(areaEmHectares(A), 6);
    expect(areaEmHectares(a)).toBeCloseTo(areaEmHectares(A) / 2, 2);
    expect(sobreposicoes(a, [{ id: 'b', nome: 'b', geojson: b }])).toEqual([]);
    const u = unirVizinhos(a, b);
    expect(u.ok && areaEmHectares(u.valor)).toBeCloseTo(areaEmHectares(A), 6);
  });

  it('linha com dobra (3 pontos) também divide em 2', () => {
    const r = dividirPorLinha(A, [[-47.998, -14.99], [-47.995, -15.005], [-47.992, -15.02]]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(areaEmHectares(r.valor.a) + areaEmHectares(r.valor.b)).toBeCloseTo(areaEmHectares(A), 6);
  });

  it('linha que não atravessa: recusa', () => {
    const r = dividirPorLinha(A, [[-47.95, -14.99], [-47.95, -15.02]]);
    expect(r.ok).toBe(false);
  });

  it('linha que entra e sai pelo mesmo lado (recorta um canto): 2 pedaços, vale', () => {
    const r = dividirPorLinha(A, [[-48.001, -15.002], [-47.995, -15.002], [-47.995, -15.008], [-48.001, -15.008]]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(areaEmHectares(r.valor.a) + areaEmHectares(r.valor.b)).toBeCloseTo(areaEmHectares(A), 6);
  });

  it('linha que entra e sai duas vezes (3+ pedaços): recusa com frase', () => {
    const zigue: Ponto[] = [[-47.997, -14.99], [-47.997, -15.02], [-47.993, -15.02], [-47.993, -14.99]];
    const r = dividirPorLinha(A, zigue);
    expect(r.ok).toBe(false);
    if ('motivo' in r) expect(r.motivo).toContain('mais de 2 partes');
  });

  it('polígono com furo: recusa', () => {
    const furado: GeoJSON.Polygon = { type: 'Polygon', coordinates: [A.coordinates[0],
      [[-47.996, -15.004], [-47.994, -15.004], [-47.994, -15.006], [-47.996, -15.006], [-47.996, -15.004]]] };
    expect(dividirPorLinha(furado, [[-47.995, -14.99], [-47.995, -15.02]]).ok).toBe(false);
  });
});

/* MAPA-EDITAR-POLIGONO-02 (Gabriel 01/11) — a barra compacta, a divisa compartilhada e o recorte dos vizinhos */
describe('barra compacta', () => {
  it('"65,7 ha · 3.528 m · mapa 65,7 · cadastro 65,7"; sem polígono gravado ou sem pasto: "—"', () => {
    expect(fraseCompactaDasMedidas({ areaHa: 65.71, perimetroM: 3528.4, ladosM: [] }, 65.7, 65.7)).toBe('65,7 ha · 3.528 m · mapa 65,7 · cadastro 65,7');
    expect(fraseCompactaDasMedidas({ areaHa: 2, perimetroM: 600, ladosM: [] }, null, 0)).toBe('2,0 ha · 600 m · mapa — · cadastro —');
  });
  it('sobreposições numa linha, com "+N"', () => {
    const s = [{ id: '1', nome: 'P20', areaHa: 0.3 }, { id: '2', nome: 'Reserva', areaHa: 0.2 }, { id: '3', nome: 'P15', areaHa: 0.15 }, { id: '4', nome: 'X', areaHa: 0.1 }];
    expect(fraseDasSobreposicoes(s)).toBe('Sobrepõe P20 (0,3 ha), Reserva (0,2 ha) +2');
    expect(fraseDasSobreposicoes(s.slice(0, 1))).toBe('Sobrepõe P20 (0,3 ha)');
    expect(fraseDasSobreposicoes([])).toBe('');
  });
});

describe('mover a divisa junto', () => {
  const C = quad(-48, -15.01, -47.99, -15.02); // vizinho de A por baixo (lado y = -15.01), divide o vértice (-47.99,-15.01) com A e B
  const viz = [{ id: 'b', nome: 'B', geojson: B }, { id: 'c', nome: 'C', geojson: C }, { id: 'l', nome: 'Longe', geojson: LONGE },
    { id: 't', nome: 'Area Total', tipo: 'area_total', geojson: quad(-48.01, -14.99, -47.97, -15.03) }];
  it('mover o vértice comum (ou a < 0,5 m dele) move todos os que o têm; o contorno e quem não divide ficam', () => {
    const r = vizinhosDaDivisa(viz, [{ tipo: 'mover', de: [-47.990002, -15.01], para: [-47.989, -15.011] }]); // 0,2 m do vértice
    expect(r.map(x => x.id).sort()).toEqual(['b', 'c']);
    const b = r.find(x => x.id === 'b')!.geojson;
    expect(b.type === 'Polygon' && b.coordinates[0].some(p => p[0] === -47.989 && p[1] === -15.011)).toBe(true);
    expect(vizinhosDaDivisa(viz, [{ tipo: 'mover', de: [-47.99001, -15.01], para: [-47.989, -15.011] }])).toEqual([]); // ~1,1 m: não é o mesmo
  });
  it('acrescentar no lado comum entra no vizinho (e depois move junto); tirar o vértice comum tira dos dois', () => {
    const meio: Ponto = [-47.99, -15.005];
    const r = vizinhosDaDivisa(viz, [{ tipo: 'acrescentar', entre: [[-47.99, -15], [-47.99, -15.01]], ponto: meio },
      { tipo: 'mover', de: meio, para: [-47.9895, -15.005] }]);
    expect(r.map(x => x.id)).toEqual(['b']); // C não tem esse lado
    const b = r[0].geojson;
    expect(b.type === 'Polygon' && b.coordinates[0].length).toBe(6);
    const sem = vizinhosDaDivisa(viz, [{ tipo: 'tirar', de: [-47.99, -15.01] }]);
    expect(sem.map(x => x.id).sort()).toEqual(['b', 'c']);
    expect(sem.every(x => x.geojson.type === 'Polygon' && x.geojson.coordinates[0].length === 4)).toBe(true);
  });
});

describe('recortar dos vizinhos', () => {
  it('a forma nova sai do vizinho: área somada igual e nenhuma sobreposição; o contorno não se recorta', () => {
    const novo = quad(-47.995, -15, -47.985, -15.01); // metade em A, metade em B
    const r = recortarDosVizinhos(novo, [{ id: 'a', nome: 'A', geojson: A }, { id: 'b', nome: 'B', geojson: B },
      { id: 't', nome: 'Area Total', tipo: 'area_total', geojson: quad(-48.01, -14.99, -47.97, -15.03) }, { id: 'l', nome: 'Longe', geojson: LONGE }]);
    if ('motivo' in r) throw new Error(r.motivo);
    expect(r.valor.map(x => x.id)).toEqual(['a', 'b']);
    const soma = r.valor.reduce((s, x) => s + areaEmHectares(x.geojson), 0) + areaEmHectares(novo);
    expect(soma).toBeCloseTo(areaEmHectares(A) + areaEmHectares(B), 1);
    expect(sobreposicoes(novo, r.valor.map(x => ({ ...x })))).toEqual([]);
  });
  it('vizinho inteiro dentro da forma nova: recusa com frase', () => {
    const r = recortarDosVizinhos(quad(-48.001, -14.999, -47.989, -15.011), [{ id: 'a', nome: 'A', geojson: A }]);
    expect(r.ok).toBe(false);
  });
});

describe('a linha que cruza ela mesma', () => {
  it('o "laço" (gravata) acusa o cruzamento no ponto certo; o quadrado não', () => {
    expect(cruzamentos(A.coordinates[0])).toEqual([]);
    const gravata = [[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]];
    const c = cruzamentos(gravata);
    expect(c.length).toBe(1);
    expect(c[0][0]).toBeCloseTo(1, 9); expect(c[0][1]).toBeCloseTo(1, 9);
    expect(FRASE_DO_CRUZAMENTO).toContain('cruza ela mesma');
  });
  it('ponto solto a menos de 0,5 m de outro: acha o outro; longe: nada', () => {
    const anel = [[-48, -15], [-47.99, -15], [-47.990002, -15.000001], [-47.99, -15.01], [-48, -15.01], [-48, -15]];
    expect(verticeEmCimaDeOutro(anel, 2)).toBe(1);
    expect(verticeEmCimaDeOutro(A.coordinates[0], 1)).toBeNull();
  });
});

