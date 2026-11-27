/** DA-NOTA-CLASSIF-01 + NOTA-ITENS-SUGESTAO (27/11) — o leitor único da escada do banco e o resumo para a tela. PURO. Dados SINTÉTICOS. */
import { describe, it, expect } from 'vitest';
import {
  contasSugeridasDosItens, fraseDaFaixa, lerItensSugeridos, lerSugestaoDoFornecedor, nomeCurtoDoItem, resumoDaSugestao, sugestaoParaAsParcelas,
  type ItemSugerido,
} from './sugestaoDosItens';

const it_ = (n: number, plano: string | null, sub: string | null, confianca: ItemSugerido['confianca'] = 'media', porque = `porque ${n}`,
  extra: Partial<ItemSugerido> = {}): ItemSugerido =>
  ({ itemId: `i${n}`, nItem: n, planoContaId: plano, subcentro: sub, fonte: plano ? 'mesmo_produto' : 'sem_sugestao', confianca, porque, origem: null, pergunta: null, ...extra });
const PERGUNTA = { manutencao: { planoContaId: 'pm', subcentro: 'Manutenção de Cercas' }, obra: { planoContaId: 'po', subcentro: 'Investimento em Cercas' } };

describe('lerItensSugeridos — a resposta da fn_itens_sugerir_conta / fn_nota_itens_sugerir_conta', () => {
  it('lê o contrato; o que não tem a forma fica de fora; sem `itens` = lista vazia', () => {
    const r = lerItensSugeridos({ ok: true, itens: [
      { item_id: 'a', n_item: 1, plano_conta_id: 'p1', subcentro: 'Peças', fonte: 'regra', confianca: 'alta', porque: 'Regra sua.', origem: 'regra sua' },
      { item_id: 'b', n_item: 2, plano_conta_id: null, subcentro: null, fonte: 'sem_sugestao', confianca: null, porque: 'Sem sugestão: escolha a conta.' },
      { n_item: 0 }, null, 'x', { item_id: 'c', n_item: 4, confianca: 'enorme' },
    ] });
    expect(r.map((x) => [x.itemId, x.planoContaId, x.confianca, x.origem])).toEqual([['a', 'p1', 'alta', 'regra sua'], ['b', null, null, null], ['c', null, null, null]]);
    expect(lerItensSugeridos(null)).toEqual([]);
    expect(lerItensSugeridos({ ok: true })).toEqual([]);
  });
  it('a nota NÃO gravada: sem item_id, o item se acha pelo n_item', () => {
    const [x] = lerItensSugeridos({ itens: [{ item_id: null, n_item: 3, plano_conta_id: 'p1', subcentro: 'Nutrição', fonte: 'ncm_cliente', origem: 'NCM 2309 · 8× no cliente' }] });
    expect(x).toMatchObject({ itemId: null, nItem: 3, planoContaId: 'p1', origem: 'NCM 2309 · 8× no cliente', pergunta: null });
  });
  it('obra × manutenção: `pergunta` com as DUAS contas; opção incompleta = sem pergunta', () => {
    const [a, b] = lerItensSugeridos({ itens: [
      { n_item: 1, fonte: 'familia_pergunta', pergunta: true, plano_conta_id: null,
        opcoes: { manutencao: { plano_conta_id: 'pm', subcentro: 'Manutenção de Cercas' }, obra: { plano_conta_id: 'po', subcentro: 'Investimento em Cercas' } } },
      { n_item: 2, fonte: 'familia_pergunta', pergunta: true, opcoes: { manutencao: { plano_conta_id: 'pm', subcentro: 'X' } } },
    ] });
    expect(a.pergunta).toEqual(PERGUNTA);
    expect(b.pergunta).toBeNull();
  });
  it('o último deste fornecedor', () => {
    expect(lerSugestaoDoFornecedor({ fornecedor: { plano_conta_id: 'pf', subcentro: 'Ferramentas', ultimo: '2026-08-14' } }))
      .toEqual({ planoContaId: 'pf', subcentro: 'Ferramentas', ultimo: '2026-08-14' });
    expect(lerSugestaoDoFornecedor({ fornecedor: null })).toBeNull();
    expect(lerSugestaoDoFornecedor(null)).toBeNull();
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
  it('item que PERGUNTA obra × manutenção nunca deixa a nota em "uma"', () => {
    expect(sugestaoParaAsParcelas([it_(1, 'p1', 'Peças'), it_(2, null, null, null, '', { pergunta: PERGUNTA })], [])).toEqual({ tipo: 'varias', contas: 2 });
    expect(sugestaoParaAsParcelas([it_(2, null, null, null, '', { pergunta: PERGUNTA })], [])).toEqual({ tipo: 'varias', contas: 1 });
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

describe('contasSugeridasDosItens', () => {
  it('a conta de partida de cada item; o que pergunta fica SEM conta', () => {
    const m = contasSugeridasDosItens([it_(1, 'p1', 'Peças'), it_(2, null, null), it_(3, 'pm', 'X', 'baixa', '', { pergunta: PERGUNTA })]);
    expect([...m]).toEqual([[1, 'p1']]);
  });
});

describe('resumoDaSugestao + fraseDaFaixa — a faixa da Classificação no NOVO', () => {
  const valor = new Map([[1, 960000], [2, 425000], [3, 118000], [4, 71600], [5, 39200], [6, 10000]]);
  const desc = new Map([[1, 'SAL MINERAL 80 P SC 30KG'], [2, 'RACAO ENGORDA 18% SC 40KG'], [3, 'UREIA PECUARIA SC 25KG'], [4, 'VERMIFUGO 500ML'], [5, 'ARAME FARPADO 500M'], [6, 'BRINCO CX 100']]);
  const dc = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
  it('todos na mesma conta = "uma": a classificação já vem nela e a faixa diz a ORIGEM com os itens', () => {
    const r = resumoDaSugestao([it_(1, 'pn', 'Nutrição Engorda'), it_(2, 'pn', 'Nutrição Engorda', 'media', '', { fonte: 'ncm_cliente' }),
      it_(3, 'pn', 'Nutrição Engorda', 'baixa', '', { fonte: 'fornecedor' })], valor, desc);
    expect(r).toEqual({ tipo: 'uma', planoContaId: 'pn', subcentro: 'Nutrição Engorda', itens: 3, peloFornecedor: false, nomes: ['sal mineral', 'racao engorda'] });
    expect(fraseDaFaixa(r, null, dc)).toBe('Classificação sugerida pelos itens (3): Nutrição Engorda · sal mineral, racao engorda');
  });
  it('nenhum item conhecido (todos pelo fornecedor) = a faixa diz "último deste fornecedor"', () => {
    const r = resumoDaSugestao([it_(1, 'pf', 'Ferramentas', 'baixa', '', { fonte: 'fornecedor' })], valor, desc);
    expect(fraseDaFaixa(r, { planoContaId: 'pf', subcentro: 'Ferramentas', ultimo: '2026-08-14' }, dc))
      .toBe('Classificação sugerida: Ferramentas · último deste fornecedor (14/08/26) · nenhum item conhecido');
  });
  it('várias contas = o aviso pequeno; a de partida é a de MAIOR valor (Q2); o que pergunta conta como "a decidir"', () => {
    const r = resumoDaSugestao([it_(1, 'pn', 'Nutrição Engorda'), it_(2, 'pn', 'Nutrição Engorda'), it_(3, 'pn', 'Nutrição Engorda'),
      it_(4, 'pv', 'Vacinas e Vermífugos'), it_(5, null, null, null, '', { fonte: 'familia_pergunta', pergunta: PERGUNTA }), it_(6, 'pb', 'Brincos')], valor, desc);
    expect(r).toEqual({ tipo: 'varias', itens: 6, classificacoes: 3, aDecidir: 1, maior: { planoContaId: 'pn', subcentro: 'Nutrição Engorda' } });
    expect(fraseDaFaixa(r, null, dc)).toBe('A nota tem 6 itens em 3 classificações (1 a decidir: obra ou manutenção)');
  });
  it('só itens que perguntam (a NF de areia/brita) = "varias" sem conta de partida', () => {
    const r = resumoDaSugestao([it_(1, null, null, null, '', { pergunta: PERGUNTA }), it_(2, null, null, null, '', { pergunta: PERGUNTA })], valor, desc);
    expect(r).toEqual({ tipo: 'varias', itens: 2, classificacoes: 0, aDecidir: 2, maior: null });
    expect(fraseDaFaixa(r, null, dc)).toBe('A nota tem 2 itens: todos esperam obra ou manutenção');
  });
  it('nada sugerido = sem faixa', () => {
    expect(fraseDaFaixa(resumoDaSugestao([it_(1, null, null)], valor, desc), null, dc)).toBeNull();
  });
  it('nomeCurtoDoItem: as 2 primeiras palavras com letra, em minúsculas', () => {
    expect(nomeCurtoDoItem('AREIA GROSSA LAVADA M3')).toBe('areia grossa');
    expect(nomeCurtoDoItem('  80 P SC ')).toBe('p sc');
    expect(nomeCurtoDoItem('')).toBe('');
  });
});
