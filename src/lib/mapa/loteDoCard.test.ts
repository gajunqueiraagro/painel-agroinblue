/**
 * MAPA-CARD-LOTE-01 (Gabriel 03/11 09:52) — o painel do pasto no Gestor lê o lote da MESMA fonte do Fechamento: `fechamento_pastos.lote_mes`
 * (o "Lote:" do card, que o modal do pasto grava). Antes lia `fechamento_pasto_itens.lote`, que o Fechamento não mostra nem grava: com o lote
 * no card e os itens vazios, todo pasto dizia "Sem lote" (NJ › Pureza › P19A, set/26: o Fechamento diz "N1 Angus SP CAR_8.2").
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { montarMapaDoMes, separarFechamentosEItens, type FechamentoComItens } from './mapaDoMes';
import { fechamentosDaUnidade } from './unidadesDoMapa';
import { tituloDosLotes } from './lotesDoPasto';

const nome = (id: string) => ({ mm: 'Mamotes M', mf: 'Mamotes F', nov: 'Novilhas' } as Record<string, string>)[id] ?? 'Sem nome';
const JANELA = ['2026-09'];

/** como o banco devolve (o card com o `lote_mes`; os itens embutidos, com a coluna `lote` antiga vazia ou não) */
function lido(linhas: FechamentoComItens[], unidadeDe = new Map<string, string>()) {
  const sep = separarFechamentosEItens(linhas, ['f1'], JANELA);
  const u = fechamentosDaUnidade(sep.fechamentos, sep.itens, unidadeDe);
  const vigentes = [...new Set(linhas.map(l => unidadeDe.get(l.pasto_id) ?? l.pasto_id))].map(id => ({ id, nome: id, area_produtiva_ha: 96.3 }));
  return montarMapaDoMes({ anoMes: '2026-09', vigentes, fechamentos: u.fechamentos, itens: u.itens, nomeDaCategoria: nome });
}

const P19A: FechamentoComItens = {
  id: 'fp19a', fazenda_id: 'f1', pasto_id: 'p19a', ano_mes: '2026-09', tipo_uso_mes: 'cria', status: 'fechado', lote_mes: 'N1 Angus SP CAR_8.2',
  fechamento_pasto_itens: [
    { fechamento_id: 'fp19a', quantidade: 44, peso_medio_kg: 60, categoria_id: 'mm', lote: null },
    { fechamento_id: 'fp19a', quantidade: 48, peso_medio_kg: 60, categoria_id: 'mf', lote: null },
    { fechamento_id: 'fp19a', quantidade: 92, peso_medio_kg: 450, categoria_id: 'nov', lote: null },
  ],
};

describe('MAPA-CARD-LOTE-01 — o lote do painel é o lote do card do Fechamento', () => {
  it('caso P19A (Pureza, set/26): o lote do card com os itens sem lote → "Lote N1 Angus SP CAR_8.2", 184 cab, nunca "Sem lote"', () => {
    const d = lido([P19A]).get('p19a')!;
    expect(d.cabecas).toBe(184);
    expect(d.categorias.map(c => [c.nome, c.quantidade, c.lote])).toEqual([
      ['Novilhas', 92, 'N1 Angus SP CAR_8.2'], ['Mamotes F', 48, 'N1 Angus SP CAR_8.2'], ['Mamotes M', 44, 'N1 Angus SP CAR_8.2']]);
    expect(tituloDosLotes(d.categorias, d.temFechamento)).toEqual({ titulo: 'Lote N1 Angus SP CAR_8.2', varios: false });
  });

  it('a coluna antiga do item NÃO é fonte: item com outro lote (caso Vera/Raul) mostra o do card; card sem lote = "Sem lote"', () => {
    const comItemDiferente: FechamentoComItens = { ...P19A, lote_mes: ' Lote 3 ',
      fechamento_pasto_itens: P19A.fechamento_pasto_itens!.map(i => ({ ...i, lote: 'Lote antigo do import' })) };
    const a = lido([comItemDiferente]).get('p19a')!;
    expect(tituloDosLotes(a.categorias, true)).toEqual({ titulo: 'Lote 3', varios: false });
    expect(a.categorias.map(c => c.lote)).toEqual(['Lote 3', 'Lote 3', 'Lote 3']); // aparado: a coluna Lote da tabela não leva espaço
    const semLoteNoCard: FechamentoComItens = { ...comItemDiferente, lote_mes: '   ' };
    const b = lido([semLoteNoCard]).get('p19a')!;
    expect(b.categorias.every(c => c.lote === null)).toBe(true);
    expect(tituloDosLotes(b.categorias, true).titulo).toBe('Sem lote');
  });

  it('com o grupo: a unidade lista os lotes das divisões no mês ("Lotes: A · B"), cada linha com o lote do seu card', () => {
    const div = (id: string, pasto: string, lote: string | null, cab: number): FechamentoComItens => ({
      id, fazenda_id: 'f1', pasto_id: pasto, ano_mes: '2026-09', tipo_uso_mes: 'recria', status: 'fechado', lote_mes: lote,
      fechamento_pasto_itens: [{ fechamento_id: id, quantidade: cab, peso_medio_kg: 300, categoria_id: 'nov', lote: null }] });
    const unidade = new Map([['p19b-a', 'p19b'], ['p19b-b', 'p19b'], ['p19b-c', 'p19b']]);
    const d = lido([div('fa', 'p19b-a', 'Lote A', 50), div('fb', 'p19b-b', 'Lote B', 30), div('fc', 'p19b-c', 'Lote A', 10)], unidade).get('p19b')!;
    expect(d.cabecas).toBe(90);
    expect(d.categorias.map(c => [c.quantidade, c.lote])).toEqual([[50, 'Lote A'], [30, 'Lote B'], [10, 'Lote A']]);
    expect(tituloDosLotes(d.categorias, true)).toEqual({ titulo: 'Lotes: Lote A · Lote B', varios: true });
  });

  it('a leitura do mapa pede o `lote_mes` do card e não pede a coluna `lote` do item (uma fonte só)', () => {
    const src = readFileSync(resolve(__dirname, '../../hooks/useMapaDoMes.ts'), 'utf8');
    const select = /from\('fechamento_pastos'\)\s*\.select\('([^']+)'\)/.exec(src)?.[1] ?? '';
    expect(select).not.toBe('');
    const [card, itens] = select.split('fechamento_pasto_itens(');
    expect(card.split(',').map(s => s.trim())).toContain('lote_mes');
    expect(itens.replace(')', '').split(',').map(s => s.trim())).not.toContain('lote');
  });
});
