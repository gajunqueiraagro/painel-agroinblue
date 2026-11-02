/**
 * MAPA-CRIAR-PIQUETES-01 fatia 2a — o desenho como UM dado (praça + cercas + linhas + corredor) e os gestos de editar QUALQUER linha; o
 * payload da gravação (`p_areas`, `p_infra`) e a frase da prévia; o rascunho do navegador.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { areaDoBancoHa } from './criarPiquetes';
import {
  acrescentarLinha, alternarFixa, apagarLinha, comCorredor, comLarguraDoCorredor, desenhoDaGrade, desenhoVazio, deslizarLinha, divisoesDoDesenho, ehCerca,
  extrasParaGravar, linhaDoDesenho, linhasDoDesenho, moverPontoDaLinha, pontoNaLinha, rotuloDaLinha, temDesenho, tirarPontoDaLinha,
  type ConfigDosPiquetes, type Desenho,
} from './desenhoDosPiquetes';
import { distanciaM, type Ponto } from './edicaoDoPoligono';
import { fraseDaPrevia, nomesEmFrase, pedidoDosPiquetes, secaoDaPrevia } from './gravacaoDosPiquetes';
import { areaDaPraca, novaPracaCentral } from './pracaCentral';
import {
  chaveDoRascunhoDosPiquetes, ehEstadoDosPiquetes, guardarRascunhoDosPiquetes, horaDoRascunho, lerRascunhoDosPiquetes, type EstadoDosPiquetes,
} from './rascunhoDosPiquetes';

const R = 6378137;
function retangulo(ha: number): GeoJSON.Polygon {
  const dl = (0.0112 * Math.PI) / 180;
  const latN = (Math.asin(Math.sin((-15.51 * Math.PI) / 180) + (ha * 10000) / (R * R * dl)) * 180) / Math.PI;
  return { type: 'Polygon', coordinates: [[[-47.9, -15.51], [-47.9 + 0.0112, -15.51], [-47.9 + 0.0112, latN], [-47.9, latN], [-47.9, -15.51]]] };
}
const g = retangulo(97.5);
const [[x0, y0], [x1], [, y1]] = g.coordinates[0];
const meio: Ponto = [(x0 + x1) / 2, (y0 + y1) / 2];
const comPraca = (): Desenho => ({
  ...desenhoVazio(),
  praca: novaPracaCentral(g, { centro: meio, n: 4, formato: 'regular', medida: { tipo: 'diagonal', metros: 60 }, anguloRad: 0 }),
});

describe('o desenho', () => {
  it('as linhas do desenho = as cercas da praça + as riscadas; divisões = praça + corredor fora', () => {
    const d = comPraca();
    expect(linhasDoDesenho(d)).toHaveLength(4);
    expect(divisoesDoDesenho(g, d)).toHaveLength(4);
    expect(temDesenho(desenhoVazio())).toBe(false);
    expect(temDesenho(d)).toBe(true);
    const r = acrescentarLinha(d, [[x0, meio[1] - 0.001], [x0 + 0.002, meio[1] - 0.001]]);
    expect(r.id).toBe('linha-1');
    expect(rotuloDaLinha(r.desenho, 'cerca-3')).toEqual({ rotulo: 'Cerca', numero: 3 });
    expect(rotuloDaLinha(r.desenho, 'linha-1')).toEqual({ rotulo: 'Linha', numero: 1 });
    expect(rotuloDaLinha(r.desenho, 'x')).toBeNull();
  });

  it('a grade só gera as linhas: 2 × 4 = 8 divisões; a praça sai', () => {
    const d = desenhoDaGrade(g, comPraca(), 2, 4, false);
    expect(d.praca).toBeNull();
    expect(divisoesDoDesenho(g, d)).toHaveLength(8);
  });

  it('editar qualquer linha: ponto no meio da cerca (fixa), mover e tirar; a ponta da praça leva o vértice; a da borda gira', () => {
    const d0 = comPraca();
    const c = d0.praca!.cercas[0];
    const mid: Ponto = [(c.pontos[0][0] + c.pontos[1][0]) / 2, (c.pontos[0][1] + c.pontos[1][1]) / 2];
    const d1 = pontoNaLinha(d0, c.id, mid);
    expect(linhaDoDesenho(d1, c.id)!.pontos).toHaveLength(3);
    expect(d1.praca!.cercas[0].fixa).toBe(true);
    const d2 = moverPontoDaLinha(g, d1, c.id, 1, [mid[0], mid[1] + 0.0002]);
    expect(linhaDoDesenho(d2, c.id)!.pontos[1][1]).toBeCloseTo(mid[1] + 0.0002, 9);
    const d3 = tirarPontoDaLinha(d2, c.id, 1);
    expect(linhaDoDesenho(d3, c.id)!.pontos).toHaveLength(2);
    expect(tirarPontoDaLinha(d3, c.id, 0)).toBe(d3); // as pontas da cerca não saem
    const novoVertice: Ponto = [c.pontos[0][0] + 0.0001, c.pontos[0][1] + 0.0001];
    const d4 = moverPontoDaLinha(g, d0, c.id, 0, novoVertice);
    expect(d4.praca!.vertices[c.vertice]).toEqual(novoVertice);
    const d5 = moverPontoDaLinha(g, d0, c.id, 1, [c.pontos[1][0], c.pontos[1][1] + 0.0003]);
    expect(distanciaM(d5.praca!.vertices[c.vertice], d0.praca!.vertices[c.vertice])).toBeGreaterThan(1);
  });

  it('editar a linha riscada: ponto, mover, tirar (mínimo 2), deslizar, apagar', () => {
    const { desenho: d1, id } = acrescentarLinha(desenhoVazio(), [[meio[0], y0], [meio[0], y1]]);
    expect(divisoesDoDesenho(g, d1)).toHaveLength(2);
    const d2 = pontoNaLinha(d1, id, [meio[0] + 0.00001, meio[1]]);
    expect(linhaDoDesenho(d2, id)!.pontos).toHaveLength(3);
    const d3 = tirarPontoDaLinha(d2, id, 1);
    expect(linhaDoDesenho(d3, id)!.pontos).toHaveLength(2);
    expect(tirarPontoDaLinha(d3, id, 0)).toBe(d3);
    const d4 = moverPontoDaLinha(g, d3, id, 0, [meio[0] - 0.001, y0]);
    expect(linhaDoDesenho(d4, id)!.pontos[0][0]).toBeCloseTo(meio[0] - 0.001, 9);
    const d5 = deslizarLinha(g, d1, id, 100);
    expect(linhaDoDesenho(d5, id)!.pontos[0][0]).toBeLessThan(meio[0]);
    const d6 = apagarLinha(d1, id);
    expect(linhasDoDesenho(d6)).toHaveLength(0);
    expect(ehCerca(d1, id)).toBe(false);
  });

  it('apagar uma cerca tira só ela; o cadeado liga e desliga', () => {
    const d = comPraca();
    expect(linhasDoDesenho(apagarLinha(d, 'cerca-2'))).toHaveLength(3);
    const f = alternarFixa(d, 'cerca-1');
    expect(f.praca!.cercas[0].fixa).toBe(true);
    expect(alternarFixa(f, 'cerca-1').praca!.cercas[0].fixa).toBe(false);
    expect(alternarFixa(d, 'linha-9')).toBe(d);
  });

  it('o corredor sai das divisões e a soma bate: divisões + praça + corredor = pasto', () => {
    const d0 = comPraca();
    const d = comCorredor(d0, [[x0 + 0.002, y0], [x0 + 0.002, y1]], 6);
    expect(d.corredor).not.toBeNull();
    const ds = divisoesDoDesenho(g, d);
    const soma = ds.reduce((s, x) => s + x.areaHa, 0) + areaDoBancoHa(areaDaPraca(d.praca!).geojson) + areaDoBancoHa(d.corredor!.geojson);
    expect(Math.abs(soma - areaDoBancoHa(g))).toBeLessThan(0.02);
    const larga = comLarguraDoCorredor(d, 12);
    expect(areaDoBancoHa(larga.corredor!.geojson)).toBeGreaterThan(areaDoBancoHa(d.corredor!.geojson) * 1.9);
    expect(comLarguraDoCorredor(d0, 12)).toBe(d0);
  });
});

describe('o pedido à fn_piquetes_criar (P3)', () => {
  const piquetes = [{ nome: 'M3-A', geojson: g, pasto_id: null }];
  it('praça = benfeitoria "Praça de alimentação"; corredor = estrada "Corredor"; cocho = ponto no centro da praça', () => {
    const d = comCorredor(comPraca(), [[x0 + 0.002, y0], [x0 + 0.002, y1]], 6);
    const ped = pedidoDosPiquetes({ paiId: 'pai', mes: '2026-11', simular: true, piquetes, desenho: d, cocho: true });
    expect(ped.p_areas.map(a => [a.nome, a.tipo])).toEqual([['Praça de alimentação', 'benfeitoria'], ['Corredor', 'estrada']]);
    expect(ped.p_areas.every(a => a.geojson.type === 'Polygon' || a.geojson.type === 'MultiPolygon')).toBe(true);
    expect(ped.p_infra).toEqual([{ tipo: 'cocho', nome: 'Cocho', ponto: d.praca!.centro }]);
    expect(ped.p_simular).toBe(true);
    expect(ped.p_contorno).toBeNull();
    expect(Object.keys(ped).sort()).toEqual(['p_areas', 'p_contorno', 'p_infra', 'p_mes', 'p_pasto_pai', 'p_piquetes', 'p_simular']);
  });
  it('sem cocho marcado, sem praça ou sem corredor: listas vazias (os parâmetros vão sempre)', () => {
    expect(extrasParaGravar(comPraca(), false).infra).toEqual([]);
    const sem = extrasParaGravar(desenhoVazio(), true);
    expect(sem).toEqual({ areas: [], infra: [] });
    const ped = pedidoDosPiquetes({ paiId: 'pai', mes: null, simular: false, piquetes, desenho: desenhoVazio(), cocho: true });
    expect(ped.p_areas).toEqual([]);
    expect(ped.p_infra).toEqual([]);
  });
  it('a frase da prévia (a do mock) e a seção própria (nome, tipo, área)', () => {
    const d = comPraca();
    const { areas, infra } = extrasParaGravar(d, true);
    const frase = fraseDaPrevia({ paiNome: 'Modulo 03', caso: 'novo', areas, infra,
      piquetes: ['A', 'B', 'C', 'D'].map(l => ({ nome: `Modulo 03-${l}`, areaHa: 24.4 })) });
    expect(frase).toBe('4 pastos novos (Modulo 03-A…D, 24,40 ha cada) · Praça de alimentação 0,18 ha (área da fazenda, dentro de Modulo 03) · Cocho no centro da praça (infraestrutura) · o contorno de Modulo 03 fica.');
    const secao = secaoDaPrevia(areas, infra);
    expect(secao).toEqual([
      { nome: 'Praça de alimentação', tipo: 'benfeitoria (área da fazenda)', areaHa: expect.closeTo(0.18, 2) },
      { nome: 'Cocho', tipo: 'infraestrutura', areaHa: null },
    ]);
    expect(fraseDaPrevia({ paiNome: 'P6', caso: 'grupo_existente', areas: [], infra: [], piquetes: [{ nome: '6A', areaHa: 10 }, { nome: '6B', areaHa: 12.5 }] }))
      .toBe('2 divisões do cadastro ligadas (6A…B, 10,00 a 12,50 ha) · o contorno de P6 fica.');
    expect(nomesEmFrase(['M-A', 'M-B', 'M-C'])).toBe('M-A…C');
  });
});

describe('o rascunho no navegador', () => {
  const config: ConfigDosPiquetes = { modo: 'praca', n: 4, formato: 'regular', medida: { tipo: 'diagonal', metros: 60 }, refLado: 0, cocho: true,
    linhasGrade: 2, colunas: 4, girado: false, larguraCorredor: 6, prefixo: 'M3-' };
  const estado = (): EstadoDosPiquetes => ({ desenho: comCorredor(comPraca(), [[x0 + 0.002, y0], [x0 + 0.002, y1]], 6), presos: [{ ponto: meio, nome: 'M3-A', liga: null }], config });
  /* o Node desta máquina expõe um `localStorage` sem métodos por cima do do jsdom: um de memória, por teste */
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); },
      removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } });
  });

  it('chave por cliente e geometria; guarda, lê igual, apaga', () => {
    expect(chaveDoRascunhoDosPiquetes('cli', 'geo')).toBe('piquetes-rascunho:cli:geo');
    guardarRascunhoDosPiquetes('cli', 'geo', { em: '09:30', estado: estado() });
    expect(localStorage.getItem('piquetes-rascunho:cli:geo')).not.toBeNull();
    const lido = lerRascunhoDosPiquetes('cli', 'geo');
    expect(lido?.em).toBe('09:30');
    expect(lido?.estado).toEqual(JSON.parse(JSON.stringify(estado())));
    expect(lerRascunhoDosPiquetes('cli', 'outra')).toBeNull();
    guardarRascunhoDosPiquetes('cli', 'geo', null);
    expect(lerRascunhoDosPiquetes('cli', 'geo')).toBeNull();
  });

  it('dado estragado (JSON ruim, forma errada, cerca de vértice inexistente) vira "sem rascunho", nunca erro', () => {
    localStorage.setItem('piquetes-rascunho:c:g', '{nao e json');
    expect(lerRascunhoDosPiquetes('c', 'g')).toBeNull();
    localStorage.setItem('piquetes-rascunho:c:g', JSON.stringify({ em: '1', estado: { desenho: {} } }));
    expect(lerRascunhoDosPiquetes('c', 'g')).toBeNull();
    const ruim = JSON.parse(JSON.stringify(estado()));
    ruim.desenho.praca.cercas[0].vertice = 99;
    expect(ehEstadoDosPiquetes(ruim)).toBe(false);
    expect(ehEstadoDosPiquetes(JSON.parse(JSON.stringify(estado())))).toBe(true);
    expect(ehEstadoDosPiquetes(null)).toBe(false);
  });

  it('a hora do rascunho é HH:MM', () => {
    expect(horaDoRascunho(new Date(2026, 10, 2, 9, 5))).toBe('09:05');
  });
});
