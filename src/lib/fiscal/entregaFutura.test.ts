/**
 * ENTREGA-FUTURA-LIGAR-01 — a regra do "Ligar à compra". Dados SINTÉTICOS (o caso do milho: 10.000 sc por R$ 600.000 em 3 × 200.000).
 *   E1 as remessas que vão juntas: mesmo emitente + o mesmo faturamento citado
 *   E2 a compra: os lançamentos agrupados pela descrição sem o "n/N"; o grupo único que cobre as remessas se marca sozinho
 *   E3 a quantidade: kg/t/saca viram kg e sacas de 60 kg; outra unidade não vira saca
 *   E4 "Entregue X de Y · P% · falta Z"
 *   E5 o gravador: a NF da remessa é registrada na 1ª parcela e ligada a todas; uma que falha não derruba as outras
 *   E6 a paridade com o banco: a MESMA tabela de casos do ensaio do lote 30 (`fn_classe_da_nota`)
 */
import { describe, expect, it, vi } from 'vitest';
import { classeDaNota } from './classeDaNota';
import { descricaoDoGrupo, entregaDaCompra, grupoSugerido, gruposDaCompra, quantidadeDosItens, remessasDaMesmaCompra } from './entregaFutura';
import { ligarRemessasACompra } from './ligarACompra';
import { montarLista, type LinhaRecebida } from './notasDaReceita';
import type { LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';
import { novoPendente, type DocumentoPendente, type ParcelaGravada } from '@/lib/financeiro/documentosPendentes';

const chave = (n: number, emit = '12345678000190') => `5026091${emit}55890${String(n).padStart(9, '0')}1000000010`.slice(0, 44);
const linha = (n: number, emit: string, dia: number, valor: number): LinhaRecebida => ({ id: `r${n}`, titularId: 't', chave: chave(n, emit), situacao: 'xml',
  emitenteDocumento: emit, emitenteNome: 'Produtor Exemplo', emissao: `2026-09-${String(dia).padStart(2, '0')}`, valorCent: valor, notaId: null, recebidoEm: null,
  eventos: [], temXml: true });

describe('E1 — as remessas que vão juntas', () => {
  it('mesmo emitente e o mesmo faturamento citado; outro emitente ou outro faturamento fica fora', () => {
    const fat = chave(8568045, '02935843000105');
    const outro = chave(1111, '02935843000105');
    const ls = [linha(1, '11122233344', 3, 2800000), linha(2, '11122233344', 24, 1190000), linha(3, '99988877766', 4, 500000), linha(4, '11122233344', 5, 300000)];
    const at = new Map([
      [ls[0].chave, { cfops: ['5116'], tpNF: '1', natOp: null, refs: [fat], dups: [], tpags: [] }],
      [ls[1].chave, { cfops: ['5116'], tpNF: '1', natOp: null, refs: [fat], dups: [], tpags: [] }],
      [ls[2].chave, { cfops: ['5116'], tpNF: '1', natOp: null, refs: [fat], dups: [], tpags: [] }],
      [ls[3].chave, { cfops: ['5116'], tpNF: '1', natOp: null, refs: [outro], dups: [], tpags: [] }],
    ]);
    const lista = montarLista(ls, new Map([['t', 'P']]), new Set(), new Map(), at, '2026-11-22');
    const g = remessasDaMesmaCompra(lista, lista[0]);
    expect(g.map((x) => x.id)).toEqual(['r1', 'r2']);
    expect(lista[0].refs).toEqual([fat]);
  });
});

const lanc = (id: string, descricao: string, valorCent: number): LancamentoJaLancado => ({ id, vencimento: '2026-07-20', pagamento: '2026-07-20', competencia: '2026-07-01',
  descricao, valorCent, status: 'realizado', conciliado: false, financiamentoId: null, numeroDocumento: null, parcelas: [], por: ['escolhido'], cancelado: false,
  fornecedorId: 'f1', fornecedorNome: 'Produtor Exemplo', fornecedorPor: 'cnpj' });

describe('E2 — a compra', () => {
  it('agrupa pela descrição sem o n/N; o único grupo que cobre as remessas é o sugerido', () => {
    expect(descricaoDoGrupo('Compra 10.000 sc milho 2/3')).toBe('compra 10.000 sc milho');
    const gs = gruposDaCompra([lanc('a', 'Compra 10.000 sc milho 1/3', 20000000), lanc('b', 'Compra 10.000 sc milho 2/3', 20000000),
      lanc('c', 'Compra 10.000 sc milho 3/3', 20000000), lanc('d', 'Frete', 90000)]);
    expect(gs[0]).toMatchObject({ rotulo: 'Compra 10.000 sc milho', ids: ['a', 'b', 'c'], totalCent: 60000000 });
    expect(grupoSugerido(gs, 45106000)?.ids).toEqual(['a', 'b', 'c']);
    expect(grupoSugerido(gs, 70000000)).toBeNull();
  });
});

describe('E3 — a quantidade dos itens', () => {
  it('kg e saca viram kg e sacas de 60 kg; outra unidade não vira saca', () => {
    expect(quantidadeDosItens([{ quantidade: '28000.0000', unidade: 'KG' }])).toEqual({ kg: 28000, sacas: 28000 / 60 });
    expect(quantidadeDosItens([{ quantidade: '10', unidade: 'SC' }, { quantidade: '1', unidade: 'T' }])).toEqual({ kg: 1600, sacas: 1600 / 60 });
    expect(quantidadeDosItens([{ quantidade: '24', unidade: 'GALAO' }])).toEqual({ kg: null, sacas: null });
  });
});

describe('E4 — Entregue X de Y', () => {
  it('as 15 remessas do caso (R$ 451.060, 451.060 kg) contra a compra de R$ 600.000', () => {
    const e = entregaDaCompra([{ valorCent: 45106000, qtd: { kg: 451060, sacas: 451060 / 60 } }], 60000000);
    expect(e).toMatchObject({ entregueCent: 45106000, faltaCent: 14894000, pct: 75, kg: 451060 });
    expect(e.sacas).toBeCloseTo(7517.67, 1);
    expect(entregaDaCompra([{ valorCent: 100, qtd: { kg: 10, sacas: 1 } }, { valorCent: 100, qtd: { kg: null, sacas: null } }], 1000).kg).toBeNull();
  });
});

describe('E5 — o gravador', () => {
  it('registra na 1ª parcela e liga a todas; a remessa que falha não derruba as outras', async () => {
    const gravar = vi.fn(async (_c: string, parcelas: readonly ParcelaGravada[], p: readonly DocumentoPendente[]): Promise<DocumentoPendente[]> =>
      p.map((x) => ({ ...x, gravado: parcelas.length === 3 })));
    const pendentes = vi.fn(async (xml: string): Promise<DocumentoPendente[] | { erro: string }> =>
      (xml === 'ruim' ? { erro: 'XML ilegível' } : [novoPendente({ especie: 'nf', nome: 'nf 1' }, null), novoPendente({ especie: 'nf', nome: 'nf 1 (DANFE)' }, null)]));
    const r = await ligarRemessasACompra('cli', [{ numero: '9335106', chave: 'k1', xml: '<ok/>' }, { numero: '9335139', chave: 'k2', xml: 'ruim' }], ['a', 'b', 'c'],
      { gravar, pendentes });
    expect(r).toEqual({ ligadas: 1, falhas: [{ numero: '9335139', frase: 'XML ilegível' }] });
    expect(gravar.mock.calls[0][1]).toEqual([{ numero: 1, lancamentoId: 'a' }, { numero: 2, lancamentoId: 'b' }, { numero: 3, lancamentoId: 'c' }]);
  });
});

describe('E6 — a paridade com o banco (a tabela do ensaio do lote 30)', () => {
  const casos: [string[], string | null, string | null, string, string?][] = [
    [['5116'], null, null, 'nao_financeira', 'entrega_futura'], [['5908'], null, null, 'nao_financeira', 'comodato'],
    [['5910'], null, null, 'nao_financeira', 'bonificacao'], [['1202'], '0', null, 'nao_financeira', 'devolucao'],
    [['1913'], '0', null, 'nao_financeira', 'retorno_demonstracao'], [['5912'], null, null, 'nao_financeira', 'demonstracao'],
    [['5915'], null, null, 'nao_financeira', 'conserto'], [['5909'], null, null, 'nao_financeira', 'retorno'],
    [['5949'], null, 'Remessa em garantia', 'nao_financeira', 'garantia'], [['5949'], null, 'Outras saidas', 'nao_financeira', 'outra_remessa'],
    [['5949'], null, 'Nota de debito', 'compra'], [['5901'], null, null, 'nao_financeira', 'outra_remessa'], [['5922'], null, null, 'compra'],
    [['5102'], '0', null, 'venda_do_titular'], [['5102', '5405'], '1', null, 'compra'],
  ];
  it.each(casos)('%j tpNF %s natOp %s → %s %s', (cfops, tpNF, natOp, classe, motivo) => {
    const c = classeDaNota({ cfops, tpNF, natOp }, false);
    expect(c.classe).toBe(classe);
    if (motivo) expect(c.classe === 'nao_financeira' ? c.motivo : null).toBe(motivo);
  });
});
