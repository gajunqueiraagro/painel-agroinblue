import { describe, expect, it } from 'vitest';
import { dozeMesesAte, fechamentoDoMesAberto, mesAntes, mesCurtoNumerico, mesDeAbertura, montarMapaDoMes, separarFechamentosEItens, ocupacoesDoMes, type FechamentoLido, type ItemLido } from './mapaDoMes';

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
    expect(h[9]).toEqual({ anoMes: '2026-07', kgHa: null, pesoTotalKg: null, faixa: null });
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

describe('MAPA-PERF-01: ler só a janela dá os MESMOS números que ler o histórico inteiro', () => {
  // 3 pastos, 3 anos de fechamentos (2023-10 a 2026-09); o p3 parou em 2024 (sem fechamento nos 12 meses da janela)
  const pastos = [{ id: 'p1', nome: 'P_01', area_produtiva_ha: 40 }, { id: 'p2', nome: 'P_02', area_produtiva_ha: 25 }, { id: 'p3', nome: 'P_03', area_produtiva_ha: 30 }];
  const todos: FechamentoLido[] = []; const itensTodos: ItemLido[] = [];
  for (let a = 2023; a <= 2026; a++) for (let m = 1; m <= 12; m++) {
    const am = `${a}-${String(m).padStart(2, '0')}`;
    if (am < '2023-10' || am > '2026-09') continue;
    pastos.forEach((p, k) => {
      if (p.id === 'p3' && am > '2024-06') return;
      if (p.id === 'p2' && am === '2026-09') return; // sem fechamento NO mês: "último fechamento 08/26"
      const id = `${p.id}-${am}`;
      todos.push({ id, pasto_id: p.id, ano_mes: am, tipo_uso_mes: k === 0 ? 'recria' : 'cria', status: 'fechado' });
      itensTodos.push({ fechamento_id: id, quantidade: 20 + ((m * 7 + k * 3) % 40), peso_medio_kg: 250 + ((m * 11 + a) % 120), categoria_id: k ? 'c2' : 'c1' });
    });
  }
  const janela = dozeMesesAte('2026-09');
  const naJanela = new Set(janela);
  // ANTES: todos os fechamentos até o mês + os itens só da janela (o hook do MAPA-02a)
  const antes = montarMapaDoMes({ anoMes: '2026-09', vigentes: pastos, fechamentos: todos,
    itens: itensTodos.filter(i => naJanela.has(i.fechamento_id.slice(3))), nomeDaCategoria: nome });
  // DEPOIS: uma consulta só, a janela com os itens embutidos
  const linhas = todos.filter(f => naJanela.has(f.ano_mes)).map(f => ({ ...f, fazenda_id: 'fz', fechamento_pasto_itens: itensTodos.filter(i => i.fechamento_id === f.id) }));
  const { fechamentos, itens } = separarFechamentosEItens(linhas, ['fz'], janela);
  const depois = montarMapaDoMes({ anoMes: '2026-09', vigentes: pastos, fechamentos, itens, nomeDaCategoria: nome });

  it('cabeças, peso, kg/ha, faixa, atividade, categorias e os 12 meses: idênticos em todos os pastos', () => {
    for (const p of pastos) {
      const { ultimoFechamento: ua, ...a } = antes.get(p.id)!;
      const { ultimoFechamento: ud, ...d } = depois.get(p.id)!;
      expect(d).toEqual(a);
      if (p.id !== 'p3') expect(ud).toBe(ua);
    }
    expect(depois.get('p2')!.ultimoFechamento).toBe('2026-08');
  });
  it('a única diferença declarada: o pasto sem fechamento há mais de 12 meses não cita o último (antes: 2024-06)', () => {
    expect(antes.get('p3')!.ultimoFechamento).toBe('2024-06');
    expect(depois.get('p3')!.ultimoFechamento).toBeNull();
  });
  it('nada de fora da janela nem de outra fazenda entra na conta', () => {
    const r = separarFechamentosEItens([...linhas, { ...linhas[0], id: 'x1', fazenda_id: 'outra' }, { ...linhas[0], id: 'x2', ano_mes: '2025-09' }], ['fz'], janela);
    expect(r.fechamentos.some(f => f.id === 'x1' || f.id === 'x2')).toBe(false);
    expect(r.fechamentos).toHaveLength(linhas.length);
  });
  it('o mesmo fechamento lido duas vezes conta uma vez só (as 12 leituras em paralelo)', () => {
    const r = separarFechamentosEItens([...linhas, ...linhas], ['fz'], janela);
    expect(r.fechamentos).toHaveLength(linhas.length);
    expect(r.itens).toHaveLength(itens.length);
  });
});
