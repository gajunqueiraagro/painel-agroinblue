/**
 * RESUMO-ATIVIDADE-01a — a agregacao do Resumo por Atividade.
 *
 * Fixture REAL: Faz. Pureza (NJ), set/2026, lida do proto em 15/10/2026 (depois do LEGADO-POR-PASTO-01): pastos, cards de
 * dez/25 a dez/26, itens de set/26, as linhas do `zoot_mensal_cache` de set/26, a area pecuaria do snapshot e as culturas
 * da safra que cobre o mes. Os esperados sao os do briefing (FASE 0 do Chat); se o dado mudar, o teste diz.
 * E os dois casos sinteticos que a tela antiga travava (tipo DO MES e "sem fechamento" fora de toda atividade).
 */
import { describe, it, expect } from 'vitest';
import fx from './resumoPorAtividade.pur.fixture.json';
import {
  montarResumoDoMes, totalDaPecuariaDoCache, divergenciaDasFases, indicadoresDaParte, colunasDaArea, mesesDoAnoCivil,
  type PastoDoResumo, type CardDoResumo, type ItemDoResumo, type LinhaCacheDoResumo,
} from './resumoPorAtividade';

const pastos: PastoDoResumo[] = fx.pastos;
const cards: CardDoResumo[] = fx.cards;
const itens: ItemDoResumo[] = fx.itens;
const cache: LinhaCacheDoResumo[] = fx.cache;
const culturas = new Map(Object.entries(fx.culturas));
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
const r3 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);

describe('Resumo por Atividade — PUR set/2026', () => {
  const r = montarResumoDoMes({ anoMes: '2026-09', pastos, cards, itens, culturasPorPasto: culturas });
  const fase = (k: string) => r.grupos.pecuaria.filhas.find(f => f.chave === k)!;

  it('areas por atividade', () => {
    expect([r.grupos.pecuaria.areas, r1(r.grupos.pecuaria.areaHa)]).toEqual([74, 3315.8]);
    expect([fase('cria').areas, r1(fase('cria').areaHa)]).toEqual([42, 2190.0]);
    expect([fase('recria').areas, r1(fase('recria').areaHa)]).toEqual([7, 353.1]);
    expect([fase('engorda').areas, r1(fase('engorda').areaHa)]).toEqual([12, 129.8]);
    expect([fase('vedado').areas, r1(fase('vedado').areaHa)]).toEqual([13, 642.9]);
    expect([fase('reforma_pecuaria').areas, fase('reforma_pecuaria').areaHa]).toEqual([0, 0]);
    expect([r.grupos.agricultura.areas, r1(r.grupos.agricultura.areaHa)]).toEqual([3, 279.3]);
    expect(r.grupos.agricultura.filhas.map(f => [f.rotulo, f.areas, r1(f.areaHa)])).toEqual([['Amendoim', 3, 279.3]]);
    expect([r.grupos.nao_produtiva.areas, r1(r.grupos.nao_produtiva.areaHa)]).toEqual([3, 1061.1]);
    expect(r.grupos.nao_produtiva.filhas.map(f => [f.chave, r1(f.areaHa)])).toEqual([['reserva', 903.9], ['app', 59.0], ['benfeitorias', 98.2]]);
    expect([r.grupos.silvicultura.areas, r.grupos.cana.areas]).toEqual([0, 0]);
    expect(r1(r.totalAreaHa)).toBe(4656.2);
    expect(r.semFechamento).toEqual({ areas: 0, areaHa: 0 });
  });

  it('por fase: cabecas, peso medio, lotacao e @ em estoque', () => {
    const ind = (k: string) => { const f = fase(k); const i = indicadoresDaParte(f); return [f.cab, r1(i.pesoMedio), r2(i.lotacao), r1(i.arrobasEstoque)]; };
    expect(ind('cria')).toEqual([4628, 282.0, 1.32, 43500.3]);
    expect(ind('recria')).toEqual([620, 297.2, 1.16, 6141.2]);
    expect(ind('engorda')).toEqual([623, 412.6, 4.40, 8569.3]);
    expect(fase('vedado').cab).toBe(0);
  });

  it('total da pecuaria = zoot_mensal_cache (sem overlay); lotacao pela area do snapshot', () => {
    const t = totalDaPecuariaDoCache(cache, fx.area_pecuaria_ha);
    expect([t.cab, r1(t.pesoMedio), r1(t.arrobasEstoque), r1(t.arrobasProduzidas), r3(t.gmd), r2(t.lotacao)])
      .toEqual([5872, 297.4, 58219.5, 3269.5, 0.567, 1.17]);
  });

  it('a divergencia de 1 cab (pasto Divergencia, 0 ha) aparece e NAO e ajustada', () => {
    const t = totalDaPecuariaDoCache(cache, fx.area_pecuaria_ha);
    expect(r.grupos.pecuaria.cab).toBe(5871);
    expect(r.foraDasAtividades.cab).toBe(1);
    expect(divergenciaDasFases(t, r)).toBe(1);
  });

  it('colunas: Ini (dez/25) + 12 meses; mes sem card e coluna vazia; % soma 100', () => {
    const col = colunasDaArea({ meses: mesesDoAnoCivil(2026), modo: 'fazenda', pastos, cards });
    expect(col.map(c => c.anoMes)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
    const set = col[9];
    expect(set.semFechamento).toBe(false);
    expect(set.partes.map(p => [p.chave, r1(p.areaHa)])).toEqual([['pecuaria', 3315.8], ['agricultura', 279.3],
      ['silvicultura', 0], ['cana', 0], ['nao_produtiva', 1061.1]]);
    expect(Math.round(set.partes.reduce((s, p) => s + p.pct, 0))).toBe(100);
    expect(col[0].semFechamento).toBe(false);
    for (const c of col.filter(x => x.semFechamento)) expect(c.partes).toEqual([]);
    const pec = colunasDaArea({ meses: ['2026-09'], modo: 'pecuaria', pastos, cards })[0];
    expect(pec.partes.map(p => [p.chave, r1(p.areaHa)])).toEqual([['cria', 2190.0], ['recria', 353.1], ['engorda', 129.8],
      ['reforma_pecuaria', 0], ['vedado', 642.9]]);
  });
});

describe('regras que vieram da tela antiga', () => {
  const P = (id: string, tipo: string, area: number): PastoDoResumo => ({ id, nome: id, tipo_uso: tipo, area_produtiva_ha: area, ativo: true, data_inicio: '2020-01-01', data_fim: null });
  const C = (id: string, pasto: string, tipo: string | null): CardDoResumo => ({ id, pasto_id: pasto, ano_mes: '2026-08', status: 'fechado', tipo_uso_mes: tipo });

  it('o tipo DO MES manda; card sem tipo cai no cadastro; vedado existe so no mes', () => {
    const r = montarResumoDoMes({ anoMes: '2026-08', pastos: [P('a', 'engorda', 10), P('b', 'cria', 20), P('c', 'cria', 5)],
      cards: [C('ca', 'a', 'cria'), C('cb', 'b', null), C('cc', 'c', 'vedado')], itens: [{ fechamento_id: 'ca', quantidade: 7, peso_medio_kg: 300 }] });
    const f = (k: string) => r.grupos.pecuaria.filhas.find(x => x.chave === k)!;
    expect([f('cria').areas, f('cria').areaHa, f('cria').cab]).toEqual([2, 30, 7]);
    expect([f('engorda').areas, f('vedado').areas, f('vedado').areaHa]).toEqual([0, 1, 5]);
  });

  it('pasto sem card no mes: balde proprio, fora de toda atividade e de todo denominador', () => {
    const r = montarResumoDoMes({ anoMes: '2026-08', pastos: [P('a', 'cria', 10), P('b', 'cria', 90)],
      cards: [C('ca', 'a', 'cria')], itens: [{ fechamento_id: 'ca', quantidade: 45, peso_medio_kg: 400 }] });
    expect(r.semFechamento).toEqual({ areas: 1, areaHa: 90 });
    expect([r.grupos.pecuaria.areaHa, r.totalAreaHa]).toEqual([10, 10]);
    expect(r2(indicadoresDaParte(r.grupos.pecuaria).lotacao)).toBe(4);
  });
});
