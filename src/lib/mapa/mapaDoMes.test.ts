import { describe, expect, it } from 'vitest';
import { dozeMesesAte, fechamentoDoMesAberto, mesAntes, mesCurtoNumerico, mesDeAbertura, montarMapaDoMes, ocupacoesDoMes, type FechamentoLido, type ItemLido } from './mapaDoMes';

const P10 = { id: 'p10', nome: 'P_10', area_produtiva_ha: 50 };
const P09 = { id: 'p09', nome: 'P_09', area_produtiva_ha: 27 };
const P07 = { id: 'p07', nome: 'P_07', area_produtiva_ha: 35 };
const nome = (id: string) => ({ c1: 'Bois 2-3', c2: 'Garrotes' } as Record<string, string>)[id] ?? 'Sem nome';

const F: FechamentoLido[] = [
  { id: 'f10-09', pasto_id: 'p10', ano_mes: '2026-09', tipo_uso_mes: 'recria' },
  { id: 'f10-08', pasto_id: 'p10', ano_mes: '2026-08', tipo_uso_mes: 'cria' },
  { id: 'f10-10', pasto_id: 'p10', ano_mes: '2026-10', tipo_uso_mes: 'recria' }, // depois do mês escolhido: não conta
  { id: 'f09-08', pasto_id: 'p09', ano_mes: '2026-08', tipo_uso_mes: 'recria' }, // P_09 sem fechamento em set
  { id: 'f07-09', pasto_id: 'p07', ano_mes: '2026-09', tipo_uso_mes: 'vedado' }, // fechamento sem animais
];
const I: ItemLido[] = [
  { fechamento_id: 'f10-09', quantidade: 60, peso_medio_kg: 300, categoria_id: 'c1' },
  { fechamento_id: 'f10-09', quantidade: 16, peso_medio_kg: 200, categoria_id: 'c2' },
  { fechamento_id: 'f10-08', quantidade: 70, peso_medio_kg: 280, categoria_id: 'c1' },
  { fechamento_id: 'f10-10', quantidade: 999, peso_medio_kg: 999, categoria_id: 'c1' },
  { fechamento_id: 'f09-08', quantidade: 30, peso_medio_kg: 250, categoria_id: 'c2' },
];

describe('meses (MAPA-02a)', () => {
  it('mês anterior e os 12 meses corridos', () => {
    expect(mesAntes('2026-01', 1)).toBe('2025-12');
    expect(dozeMesesAte('2026-09')).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
      '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(mesCurtoNumerico('2026-08')).toBe('08/26');
  });
});

describe('montarMapaDoMes (MAPA-02a, D1/D3)', () => {
  const m = montarMapaDoMes({ anoMes: '2026-09', vigentes: [P10, P09, P07], fechamentos: F, itens: I, nomeDaCategoria: nome });

  it('o fechamento DAQUELE mês: cabeças, peso, kg/ha = Σ(qtd × peso) ÷ área, atividade do mês', () => {
    const d = m.get('p10')!;
    expect(d.temFechamento).toBe(true);
    expect(d.cabecas).toBe(76);
    expect(d.pesoTotalKg).toBe(60 * 300 + 16 * 200);
    expect(d.kgHa).toBeCloseTo((60 * 300 + 16 * 200) / 50, 6);
    expect(d.faixa).toBe('ideal');
    expect(d.atividade).toBe('recria');
    expect(d.categorias.map(c => c.nome)).toEqual(['Bois 2-3', 'Garrotes']);
    expect(d.categoriaPrincipalId).toBe('c1');
  });

  it('sem fechamento no mês: "—" (null, nunca 0) e o último fechamento anterior', () => {
    const d = m.get('p09')!;
    expect(d.temFechamento).toBe(false);
    expect([d.cabecas, d.pesoMedioKg, d.kgHa, d.faixa, d.atividade]).toEqual([null, null, null, null, null]);
    expect(d.ultimoFechamento).toBe('2026-08');
  });

  it('fechamento sem animais: vazio (0), não "—"', () => {
    const d = m.get('p07')!;
    expect(d.temFechamento).toBe(true);
    expect(d.cabecas).toBe(0);
    expect(d.kgHa).toBe(0);
    expect(d.faixa).toBe('vazio');
    expect(d.atividade).toBe('vedado');
  });

  it('histórico: 12 meses corridos, mês sem fechamento = null; o mês depois do escolhido não entra', () => {
    const h = m.get('p10')!.historico;
    expect(h).toHaveLength(12);
    expect(h[11].anoMes).toBe('2026-09');
    expect(h[10].kgHa).toBeCloseTo((70 * 280) / 50, 6);
    expect(h[9]).toEqual({ anoMes: '2026-07', kgHa: null, faixa: null });
    expect(h.some(x => x.anoMes === '2026-10')).toBe(false);
  });

  it('pasto fora da vigência não aparece (quem chama passa só os vigentes)', () => {
    expect(m.has('baldasso')).toBe(false);
  });

  it('a Operação recebe só quem tem fechamento no mês, com o status da mesma régua', () => {
    const oc = ocupacoesDoMes(m);
    expect([...oc.keys()].sort()).toEqual(['p07', 'p10']);
    expect(oc.get('p10')!.status).toBe('adequado');
    expect(oc.get('p07')!.status).toBe('sem_ocupacao');
  });
});

describe('mesDeAbertura (fix1 A): o último mês com fechamento de pastos, sem nenhum o mês de hoje', () => {
  it('3M: P1 oficial em dez/25, pastos fechados até set/26 → abre em set/26 (não no mês de hoje)', () => {
    expect(mesDeAbertura('2026-09', '2026-10-31')).toBe('2026-09');
  });
  it('fazenda sem nenhum fechamento → o mês de hoje (não o anterior)', () => {
    expect(mesDeAbertura(null, '2026-10-31')).toBe('2026-10');
  });
});

describe('fechamentoDoMesAberto (fix1 E): algum pasto do mapa com fechamento do mês não fechado', () => {
  const fech = (status: string | null): FechamentoLido[] => [
    { id: 'a', pasto_id: 'p10', ano_mes: '2026-09', tipo_uso_mes: 'recria', status: 'fechado' },
    { id: 'b', pasto_id: 'p09', ano_mes: '2026-09', tipo_uso_mes: 'cria', status },
  ];
  const montar = (status: string | null) => montarMapaDoMes({ anoMes: '2026-09', vigentes: [P10, P09, P07], fechamentos: fech(status), itens: [], nomeDaCategoria: nome });
  it('todos fechados → não avisa; P07 sem fechamento não conta como aberto', () => {
    expect(fechamentoDoMesAberto(montar('fechado'), ['p10', 'p09', 'p07'])).toBe(false);
  });
  it('um em rascunho (ou aberto) → avisa', () => {
    expect(fechamentoDoMesAberto(montar('rascunho'), ['p10', 'p09', 'p07'])).toBe(true);
    expect(fechamentoDoMesAberto(montar('aberto'), ['p10', 'p09'])).toBe(true);
  });
  it('o aberto é de um pasto fora do mapa (sem polígono) → não avisa', () => {
    expect(fechamentoDoMesAberto(montar('rascunho'), ['p10', 'p07'])).toBe(false);
  });
});
