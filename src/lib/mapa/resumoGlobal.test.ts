import { describe, expect, it } from 'vitest';
import { montarMapaDoMes, resumoDosPastos, type FechamentoLido, type ItemLido } from './mapaDoMes';
import {
  contagemDosFiltros, ordenarLinhas, pastosDoGlobal, pedemAtencao, resumoGlobal, type EntradaGlobal, type PastoDoGlobal,
} from './resumoGlobal';

/* duas fazendas: AA (2 pastos com polígono + 1 sem polígono com 66 cab) e BB (3 pastos: um vazio, um sem fechamento, um carga alta) */
const AA = { id: 'fa', codigo: 'AA', nome: 'Faz. Alfa' };
const BB = { id: 'fb', codigo: 'BB', nome: 'Faz. Beta' };
const P: PastoDoGlobal[] = [
  { id: 'a1', fazenda_id: 'fa', nome: 'P_01', area_produtiva_ha: 100 },
  { id: 'a2', fazenda_id: 'fa', nome: 'P_02', area_produtiva_ha: 50 },
  { id: 'a9', fazenda_id: 'fa', nome: 'Divergência', area_produtiva_ha: 0 },
  { id: 'b1', fazenda_id: 'fb', nome: 'P_01', area_produtiva_ha: 10 },
  { id: 'b2', fazenda_id: 'fb', nome: 'P_02', area_produtiva_ha: 20 },
  { id: 'b3', fazenda_id: 'fb', nome: 'P_03', area_produtiva_ha: 30 },
];
const F: FechamentoLido[] = [
  { id: 'fa1', pasto_id: 'a1', ano_mes: '2026-09', tipo_uso_mes: 'recria', status: 'fechado' },
  { id: 'fa2', pasto_id: 'a2', ano_mes: '2026-09', tipo_uso_mes: 'cria', status: 'fechado' },
  { id: 'fa9', pasto_id: 'a9', ano_mes: '2026-09', tipo_uso_mes: 'recria', status: 'fechado' },
  { id: 'fb1', pasto_id: 'b1', ano_mes: '2026-09', tipo_uso_mes: 'vedado', status: 'fechado' },
  { id: 'fb3', pasto_id: 'b3', ano_mes: '2026-09', tipo_uso_mes: 'engorda', status: 'fechado' },
  { id: 'fa1-8', pasto_id: 'a1', ano_mes: '2026-08', tipo_uso_mes: 'recria', status: 'fechado' },
  { id: 'fb3-8', pasto_id: 'b3', ano_mes: '2026-08', tipo_uso_mes: 'engorda', status: 'fechado' },
];
const I: ItemLido[] = [
  { fechamento_id: 'fa1', quantidade: 100, peso_medio_kg: 300, categoria_id: 'c' }, // 30.000 kg em 100 ha = 300
  { fechamento_id: 'fa2', quantidade: 50, peso_medio_kg: 400, categoria_id: 'c' },  // 20.000 kg em 50 ha = 400
  { fechamento_id: 'fa9', quantidade: 66, peso_medio_kg: 200, categoria_id: 'c' },  // sem polígono: o aviso
  { fechamento_id: 'fb3', quantidade: 60, peso_medio_kg: 300, categoria_id: 'c' },  // 18.000 kg em 30 ha = 600 (carga alta)
  { fechamento_id: 'fa1-8', quantidade: 90, peso_medio_kg: 300, categoria_id: 'c' },
  { fechamento_id: 'fb3-8', quantidade: 50, peso_medio_kg: 300, categoria_id: 'c' },
];
const dados = montarMapaDoMes({ anoMes: '2026-09', vigentes: P, fechamentos: F, itens: I, nomeDaCategoria: () => 'Bois' });
const E: EntradaGlobal = {
  anoMes: '2026-09', fazendas: [AA, BB], vigentes: P, comPoligono: new Set(['a1', 'a2', 'b1', 'b2', 'b3']),
  fazendasComMapa: new Set(['fa', 'fb']), dados,
};

describe('resumoGlobal (D2): cada fazenda pela regra do Gestor; o total pela mesma regra', () => {
  const { fazendas, total } = resumoGlobal(E);
  it('a linha da fazenda é IDÊNTICA ao resumoDosPastos dos pastos com polígono (o Gestor dela)', () => {
    const gestorAA = resumoDosPastos(['a1', 'a2'], dados, id => P.find(p => p.id === id)?.area_produtiva_ha);
    expect(fazendas[0].cabecas).toBe(gestorAA.cabecas);
    expect(fazendas[0].kgHa).toBe(gestorAA.lotacao);
    expect(fazendas[0].area).toBe(gestorAA.area);
    expect(fazendas[0].kgHa).toBeCloseTo(50000 / 150, 6); // 333,3: não a média 350 dos dois pastos
  });
  it('o total é kg total ÷ área total, nunca a média das médias', () => {
    // AA 50.000 kg / 150 ha; BB 18.000 kg / 60 ha → 68.000 / 210 = 323,8 (a média de 333,3 e 300 daria 316,7)
    expect(total.kgHa).toBeCloseTo(68000 / 210, 6);
    expect(total.cabecas).toBe(210);
    expect(total.area).toBe(210);
    expect(total.pesoMedio).toBeCloseTo(68000 / 210, 6);
  });
  it('nada some em silêncio: 66 cab em pasto sem polígono viram o aviso, na fazenda e no total (fora dos números)', () => {
    expect(fazendas[0].cabecasSemMapa).toBe(66);
    expect(fazendas[1].cabecasSemMapa).toBe(0);
    expect(total.cabecasSemMapa).toBe(66);
    expect(fazendas[0].cabecas).toBe(150);
  });
  it('situação por pasto, área por situação e sem fechamento', () => {
    expect(fazendas[1].contagem).toEqual({ carga_alta: 1, sublotado: 0, ideal: 0, vazio: 1, sem_fechamento: 1 });
    expect(fazendas[1].areaPorSituacao.carga_alta).toBe(30);
    expect(fazendas[1].semFechamento).toBe(1);
    expect(total.semFechamento).toBe(1);
  });
  it('a série de 12 meses soma kg ÷ área dos pastos com fechamento em cada mês', () => {
    const ago = fazendas[0].serie[10]; const set = fazendas[0].serie[11];
    expect(ago.anoMes).toBe('2026-08');
    expect(ago.kgHa).toBeCloseTo(27000 / 100, 6); // em ago só o a1 tinha fechamento
    expect(set.kgHa).toBeCloseTo(50000 / 150, 6);
    expect(fazendas[0].serie[0].kgHa).toBeNull();
  });
  it('cabeças por atividade (o tipo_uso_mes do fechamento)', () => {
    expect(fazendas[0].cabecasPorAtividade.get('recria')).toBe(100);
    expect(fazendas[0].cabecasPorAtividade.get('cria')).toBe(50);
  });
});

describe('pedemAtencao (D4): carga alta, sem fechamento e vazios, kg/ha decrescente', () => {
  const pastos = pastosDoGlobal(E);
  it('só os três tipos, nesta ordem: o de maior kg/ha, depois o vazio (0), por último o sem fechamento (—)', () => {
    expect(pedemAtencao(pastos).map(p => `${p.fazenda.codigo} ${p.nome} ${p.situacao}`)).toEqual([
      'BB P_03 carga_alta', 'BB P_01 vazio', 'BB P_02 sem_fechamento',
    ]);
  });
  it('sublotado e ideal NÃO pedem atenção', () => {
    const f = { id: 'x', codigo: 'XX', nome: 'X' };
    const p = (id: string, kgHa: number | null, situacao: 'sublotado' | 'ideal' | 'carga_alta') =>
      ({ pastoId: id, fazenda: f, nome: id, atividade: null, area: 10, cabecas: 1, pesoMedio: 1, kgHa, situacao });
    expect(pedemAtencao([p('s', 120, 'sublotado'), p('i', 400, 'ideal'), p('a', 800, 'carga_alta')]).map(x => x.pastoId)).toEqual(['a']);
  });
  it('o pasto sem polígono não entra na lista de pastos', () => {
    expect(pastos.some(p => p.pastoId === 'a9')).toBe(false);
    expect(contagemDosFiltros(pastos)).toEqual({ todos: 5, carga_alta: 1, sublotado: 0, ideal: 2, vazio: 1, sem_fechamento: 1 });
  });
});

describe('ordenarLinhas: números, texto e "—" por último nos dois sentidos', () => {
  const l = [{ v: 3 }, { v: null }, { v: 10 }, { v: 1 }];
  it('asc e desc', () => {
    expect(ordenarLinhas(l, x => x.v, 'asc').map(x => x.v)).toEqual([1, 3, 10, null]);
    expect(ordenarLinhas(l, x => x.v, 'desc').map(x => x.v)).toEqual([10, 3, 1, null]);
  });
  it('texto em pt-BR com número natural (P_2 antes de P_10)', () => {
    expect(ordenarLinhas([{ v: 'P_10' }, { v: 'P_2' }], x => x.v, 'asc').map(x => x.v)).toEqual(['P_2', 'P_10']);
  });
});
