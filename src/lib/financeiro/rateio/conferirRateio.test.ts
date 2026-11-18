/**
 * RATEIO-HIGINO-01 — a regra pura da conferência da relação do rateio. Números da forma do caso de nov/26 (sintéticos nos ids):
 * a parte arredonda como o item do sistema; o pago não muda de valor; fazenda/conta só por escolha; a soma × pagamento nunca "bate" à força.
 */
import { describe, expect, it } from 'vitest';
import {
  conferencia, itensNovos, numeroDaNf, parteCent, pedidoDoCompletar, rotuloDoPagamento, situacaoDaLinha,
  type ItemDoRateio, type LinhaDaRelacao,
} from './conferirRateio';

const item = (id: string, valorCent: number, extra: Partial<ItemDoRateio> = {}): ItemDoRateio => ({
  id, descricao: 'Item', fazendaId: 'faz-3m', planoContaId: 'pc-energia', valorCent, vencimento: '2026-11-19', competencia: '2026-11-01',
  numeroDocumento: 'R_D15', tipoDocumento: 'Recibo', pago: false, ...extra,
});
const linha = (itemId: string | null, valorCheioCent: number | null, extra: Partial<LinhaDaRelacao> = {}): LinhaDaRelacao => ({
  chave: itemId ?? 'nova', itemId, valorCheioCent, nf: null, fazendaId: null, planoContaId: null, descricao: null, vencimento: null,
  competencia: null, escolha: 'manter', ...extra,
});

describe('RATEIO-HIGINO-01 — a parte (50%)', () => {
  it('arredonda o meio centavo para cima, como o item do sistema (3.302,09 → 1.651,05; 1.905,31 → 952,66)', () => {
    expect([parteCent(330209), parteCent(190531), parteCent(2120321), parteCent(5750_00)]).toEqual([165105, 95266, 1060161, 2875_00]);
  });
  it('outra participação também (30%)', () => {
    expect(parteCent(100000, 30)).toBe(30000);
  });
  it('o nº da NF se compara só pelos dígitos, sem zeros à esquerda', () => {
    expect([numeroDaNf('000.034.756'), numeroDaNf('34756'), numeroDaNf('R_D05'), numeroDaNf(''), numeroDaNf(null)]).toEqual(['34756', '34756', '5', null, null]);
  });
});

describe('RATEIO-HIGINO-01 — a situação da linha', () => {
  it('confere: mesma parte, sem NF nova, fazenda/conta iguais', () => {
    expect(situacaoDaLinha(linha('a', 348284), item('a', 174142))).toMatchObject({ tipo: 'confere', parteCent: 174142, difCent: 0, diferencas: [] });
  });
  it('sem o valor da relação: falta (nada se grava)', () => {
    expect(situacaoDaLinha(linha('a', null), item('a', 174142)).tipo).toBe('falta');
  });
  it('NF na relação e o item com o rótulo: muda o nº', () => {
    const s = situacaoDaLinha(linha('a', 348284, { nf: '885859' }), item('a', 174142));
    expect([s.tipo, s.diferencas, s.frase]).toEqual(['muda', ['nf'], 'nº da NF']);
  });
  it('fazenda diferente com "manter": confere, e diz que mantém a do sistema', () => {
    const s = situacaoDaLinha(linha('a', 18871, { fazendaId: 'faz-bg' }), item('a', 9436, { fazendaId: 'faz-3m' }));
    expect([s.tipo, s.diferencas, s.frase]).toEqual(['confere', ['fazenda'], 'mantém fazenda do sistema']);
  });
  it('fazenda diferente com "usar a relação": muda', () => {
    const s = situacaoDaLinha(linha('a', 18871, { fazendaId: 'faz-bg', escolha: 'relacao' }), item('a', 9436));
    expect([s.tipo, s.frase]).toEqual(['muda', 'fazenda da relação']);
  });
  it('valor diferente num item PAGO: travado (o valor não muda)', () => {
    const s = situacaoDaLinha(linha('a', 200000), item('a', 95000, { pago: true }));
    expect([s.tipo, s.difCent]).toEqual(['travado', 5000]);
  });
  it('linha nova com valor: cria; sem valor: falta', () => {
    expect([situacaoDaLinha(linha(null, 1000), null).tipo, situacaoDaLinha(linha(null, null), null).tipo]).toEqual(['nova', 'falta']);
  });
});

describe('RATEIO-HIGINO-01 — o pedido do completar (só o que muda)', () => {
  const itens = new Map([
    ['a', item('a', 174142)],
    ['b', item('b', 95000, { pago: true })],
    ['c', item('c', 9436, { fazendaId: 'faz-3m' })],
    ['d', item('d', 12450, { tipoDocumento: 'Nota Fiscal', numeroDocumento: '1455958' })],
  ]);
  it('valor + NF no aberto; nada de valor no pago; fazenda só com "usar a relação"; o que confere não vai', () => {
    const p = pedidoDoCompletar([
      linha('a', 360000, { nf: '885859' }),
      linha('b', 200000, { nf: '1' }),
      linha('c', 18871, { fazendaId: 'faz-bg', escolha: 'manter' }),
      linha('d', 24900, { nf: '1.455.958' }),
    ], itens);
    expect(p).toEqual([
      { id: 'a', valor: 1800, numero_documento: '885859', tipo_documento: 'Nota Fiscal' },
      { id: 'b', numero_documento: '1', tipo_documento: 'Nota Fiscal' },
    ]);
  });
  it('"usar a relação" leva fazenda e conta', () => {
    expect(pedidoDoCompletar([linha('c', 18872, { fazendaId: 'faz-bg', planoContaId: 'pc-x', escolha: 'relacao' })], itens))
      .toEqual([{ id: 'c', fazenda_id: 'faz-bg', plano_conta_id: 'pc-x' }]);
  });
});

describe('RATEIO-HIGINO-01 — as linhas novas e a conferência', () => {
  it('nova completa vai com a parte; incompleta fica de fora com a chave', () => {
    const r = itensNovos([
      linha(null, 1458524, { chave: 'n1', fazendaId: 'faz-bg', planoContaId: 'pc-itr', descricao: ' ITR ', vencimento: '2026-11-30', competencia: '2026-01-01' }),
      linha(null, 1000, { chave: 'n2', fazendaId: 'faz-bg' }),
    ]);
    expect(r).toEqual({ prontos: [{ chave: 'n1', valorCent: 729262, fazendaId: 'faz-bg', planoContaId: 'pc-itr', descricao: 'ITR', vencimento: '2026-11-30', competencia: '2026-01-01', nf: null }], incompletos: ['n2'] });
  });
  it('a soma × pagamento: a diferença fica (nunca se ajusta)', () => {
    const itens = new Map([['a', item('a', 174142)], ['b', item('b', 95000, { pago: true })]]);
    const c = conferencia([linha('a', 348284), linha('b', 200000), linha(null, 1000, { chave: 'n' })], itens, 270000);
    expect(c).toEqual({ relacaoCent: 174142 + 100000 + 500, conferidas: 3, linhas: 3, itensCent: 174142 + 95000 + 500, pagamentoCent: 270000, difCent: 270000 - 269642 });
  });
  it('o rótulo antigo do item sai da descrição do pagamento', () => {
    expect([rotuloDoPagamento('Rateio D05'), rotuloDoPagamento('rateio d 15'), rotuloDoPagamento('Rateio Folha Pagamento'), rotuloDoPagamento('Energia')])
      .toEqual(['R_D05', 'R_D15', 'R_Folha', null]);
  });
});
