/**
 * ⚠ ESTE MÓDULO NASCEU DE UMA MEDIÇÃO QUE CONTRARIOU O BRIEFING: o drill-down "que já existe
 * no Finanças" não existe. O `DrillDownMacro` é uma tabela mensal expansível — sem
 * breadcrumb, sem nível de lançamento, presa a `{ano, meses}`. Os testes guardam a peça nova.
 */
import { describe, it, expect } from 'vitest';
import {
  agruparPorNivel, ordenarNos, ordenarLancamentos, semNivel, type ItemDrill,
} from './drillEconomico';

const item = (over: Partial<ItemDrill>): ItemDrill => ({
  id: 'x', data: '2026-03-10', mov: -100, tipo: '2-Saídas', produto: null, fornecedor: '', doc: '',
  macro: 'Custeio Produção', grupo: 'Custo Variável', centroPlano: 'Insumos', subcentro: 'Fertilizantes',
  ...over,
});

const ITENS: ItemDrill[] = [
  item({ id: 'a', mov: -1000, subcentro: 'Fertilizantes' }),
  item({ id: 'b', mov: -300, subcentro: 'Defensivos' }),
  item({ id: 'c', mov: -50, grupo: 'Custo Fixo', centroPlano: 'Mão de Obra', subcentro: 'Salários' }),
  item({ id: 'd', mov: -7, grupo: null, centroPlano: null, subcentro: null }),
];

describe('agrupar por nível', () => {
  it('soma em módulo e conta as linhas', () => {
    const nos = agruparPorNivel(ITENS, 'grupo');
    expect(nos.find(n => n.chave === 'Custo Variável')).toMatchObject({ total: 1300, count: 2 });
    expect(nos.find(n => n.chave === 'Custo Fixo')).toMatchObject({ total: 50, count: 1 });
  });

  it('o que o plano não classificou vira nó, não some', () => {
    /* ⚠ Esconder o não classificado faria os filhos somarem MENOS que o pai, e o operador
       procuraria a diferença sem achar onde ela está. */
    const nos = agruparPorNivel(ITENS, 'grupo');
    const sem = nos.find(n => n.chave === semNivel('grupo'));
    expect(sem).toMatchObject({ total: 7, count: 1 });
    expect(nos.reduce((s, n) => s + n.total, 0)).toBe(1357);
  });

  it('texto em branco conta como não classificado', () => {
    expect(agruparPorNivel([item({ id: 'e', subcentro: '  ' })], 'subcentro')[0].chave)
      .toBe(semNivel('subcentro'));
  });
});

describe('ordenar os níveis agregados', () => {
  const nos = agruparPorNivel(ITENS, 'grupo');
  const SEM = semNivel('grupo');

  it('por valor, desc e asc', () => {
    expect(ordenarNos(nos, 'valor', 'desc', SEM).map(n => n.chave)).toEqual(['Custo Variável', 'Custo Fixo', SEM]);
    expect(ordenarNos(nos, 'valor', 'asc', SEM).map(n => n.chave)).toEqual(['Custo Fixo', 'Custo Variável', SEM]);
  });

  it('por nome, com acento na ordem do português', () => {
    expect(ordenarNos(nos, 'nome', 'asc', SEM).map(n => n.chave)).toEqual(['Custo Fixo', 'Custo Variável', SEM]);
  });

  it('o "sem" fica por último NOS DOIS sentidos — ele é o resto, não um competidor', () => {
    expect(ordenarNos(nos, 'nome', 'desc', SEM).at(-1)?.chave).toBe(SEM);
    expect(ordenarNos(nos, 'valor', 'asc', SEM).at(-1)?.chave).toBe(SEM);
  });
});

describe('ordenar os lançamentos', () => {
  const L: ItemDrill[] = [
    item({ id: '2', data: '2026-03-05', fornecedor: 'Zeca', doc: 'B', mov: -10 }),
    item({ id: '1', data: '2026-03-05', fornecedor: 'Ana', doc: 'A', mov: -900 }),
    item({ id: '3', data: '2026-01-20', fornecedor: 'Bento', doc: 'C', mov: -50 }),
  ];

  it('data asc é o padrão da tela', () => {
    expect(ordenarLancamentos(L, 'data', 'asc').map(i => i.id)).toEqual(['3', '1', '2']);
  });

  it('favorecido a-z', () => {
    expect(ordenarLancamentos(L, 'fornecedor', 'asc').map(i => i.fornecedor)).toEqual(['Ana', 'Bento', 'Zeca']);
  });

  it('valor ordena por módulo — a lista é de um lado só do caixa', () => {
    expect(ordenarLancamentos(L, 'mov', 'desc').map(i => i.id)).toEqual(['1', '3', '2']);
  });

  it('empate desempata pelo id, e a ordem não muda entre chamadas', () => {
    /* Sem o desempate, duas linhas de mesma data trocam de lugar entre renders e a lista
       "pisca" justamente quando alguém está conferindo uma delas. */
    const a = ordenarLancamentos(L, 'data', 'asc').map(i => i.id);
    const b = ordenarLancamentos(L.slice().reverse(), 'data', 'asc').map(i => i.id);
    expect(a).toEqual(b);
  });
});
