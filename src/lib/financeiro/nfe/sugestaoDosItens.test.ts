/** DA-NOTA-CLASSIF-01 — a sugestão pelos itens → uma conta para as parcelas (ou "várias" / "nenhuma"). PURO. Dados SINTÉTICOS. */
import { describe, it, expect } from 'vitest';
import { lerItensSugeridos, sugestaoParaAsParcelas, type ItemSugerido } from './sugestaoDosItens';

const it_ = (n: number, plano: string | null, sub: string | null, confianca: ItemSugerido['confianca'] = 'media', porque = `porque ${n}`): ItemSugerido =>
  ({ itemId: `i${n}`, nItem: n, planoContaId: plano, subcentro: sub, fonte: plano ? 'a' : 'sem_sugestao', confianca, porque });

describe('lerItensSugeridos — a resposta da fn_nota_itens_sugerir_conta', () => {
  it('lê o contrato; o que não tem a forma fica de fora; sem `itens` = lista vazia', () => {
    const r = lerItensSugeridos({ ok: true, itens: [
      { item_id: 'a', n_item: 1, plano_conta_id: 'p1', subcentro: 'Peças', fonte: 'a0', confianca: 'alta', porque: 'Regra sua.' },
      { item_id: 'b', n_item: 2, plano_conta_id: null, subcentro: null, fonte: 'sem_sugestao', confianca: null, porque: 'Sem sugestão: escolha a conta.' },
      { n_item: 3 }, null, 'x', { item_id: 'c', n_item: 4, confianca: 'enorme' },
    ] });
    expect(r.map((x) => [x.itemId, x.planoContaId, x.confianca])).toEqual([['a', 'p1', 'alta'], ['b', null, null], ['c', null, null]]);
    expect(lerItensSugeridos(null)).toEqual([]);
    expect(lerItensSugeridos({ ok: true })).toEqual([]);
  });
});

describe('sugestaoParaAsParcelas', () => {
  it('todos os itens com sugestão na MESMA conta = "uma" (o item sem sugestão não decide); o porquê é o do item mais confiável', () => {
    const r = sugestaoParaAsParcelas([it_(1, 'p1', 'Peças', 'baixa'), it_(2, null, null, null), it_(3, 'p1', 'Peças', 'alta', 'Regra sua.')], ['p0', 'p0']);
    expect(r).toEqual({ tipo: 'uma', planoContaId: 'p1', subcentro: 'Peças', porque: 'Regra sua.', igualAHoje: false });
  });
  it('itens em contas diferentes = "varias" com quantas', () => {
    expect(sugestaoParaAsParcelas([it_(1, 'p1', 'Peças'), it_(2, 'p2', 'Combustível'), it_(3, 'p1', 'Peças')], [])).toEqual({ tipo: 'varias', contas: 2 });
  });
  it('nenhum item com sugestão (ou sem itens) = "nenhuma"', () => {
    expect(sugestaoParaAsParcelas([it_(1, null, null)], ['p0'])).toEqual({ tipo: 'nenhuma' });
    expect(sugestaoParaAsParcelas([], ['p0'])).toEqual({ tipo: 'nenhuma' });
  });
  it('igualAHoje só quando TODAS as parcelas já estão na sugerida (uma diferente ou sem parcela = não)', () => {
    const uma = [it_(1, 'p1', 'Peças')];
    expect(sugestaoParaAsParcelas(uma, ['p1', 'p1'])).toMatchObject({ igualAHoje: true });
    expect(sugestaoParaAsParcelas(uma, ['p1', null])).toMatchObject({ igualAHoje: false });
    expect(sugestaoParaAsParcelas(uma, [])).toMatchObject({ igualAHoje: false });
  });
});
