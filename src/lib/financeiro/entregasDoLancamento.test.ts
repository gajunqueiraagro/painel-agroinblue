/** NOTA-ENTREGA-FUTURA-01 (B) — a leitura da `fn_lancamento_entregas` e os textos (dados SINTÉTICOS no formato do banco). */
import { describe, expect, it } from 'vitest';
import { fraseDaFalta, fraseDasEntregas, lerEntregas, oQueOPapelFaz, rotuloDoPapel } from './entregasDoLancamento';

const banco = {
  compra: { chave: '5'.repeat(44), nf: '30150' }, entregas: 2,
  papeis: [{ documento_id: 'c', papel: 'compra', n: null }, { documento_id: 'e1', papel: 'entrega', n: 1 }, { documento_id: 'e2', papel: 'entrega', n: 2 },
    { documento_id: 'b', papel: 'boleto', n: null }, { documento_id: 'd', papel: 'devolucao', n: null }],
  itens: [{ produto: 'Milho', unidade: 'sc', comprado: '10000.0000', entregue: 3588, falta: 6412 }], motivo: null,
};

describe('entregasDoLancamento', () => {
  it('lê o banco: compra, papéis com o nº da entrega, o saldo (número em texto também)', () => {
    const e = lerEntregas(banco);
    expect(e?.compra?.nf).toBe('30150');
    expect(e?.papeis.get('e2')).toEqual({ papel: 'entrega', n: 2 });
    expect(e?.itens).toEqual([{ produto: 'Milho', unidade: 'sc', comprado: 10000, entregue: 3588, falta: 6412 }]);
  });
  it('forma estranha = null (nunca vazio no lugar)', () => {
    expect(lerEntregas(null)).toBeNull();
    expect(lerEntregas({ ...banco, papeis: [{ documento_id: 'x', papel: 'inventado' }] })).toBeNull();
    expect(lerEntregas({ ...banco, itens: [{ produto: 'x', comprado: 'abc', entregue: 0, falta: 0 }] })).toBeNull();
    expect(lerEntregas({ ...banco, compra: 'x' })).toBeNull();
  });
  it('sem compra: itens nulos e o motivo', () => {
    const e = lerEntregas({ compra: null, entregas: 1, papeis: [], itens: null, motivo: 'sem_compra' });
    expect(e).toEqual({ compra: null, entregas: 1, papeis: new Map(), itens: null, motivo: 'sem_compra' });
  });
  it('os textos: papel, o que faz, falta, a linha do Resumo', () => {
    expect([rotuloDoPapel({ papel: 'compra', n: null }), rotuloDoPapel({ papel: 'entrega', n: 3 }), rotuloDoPapel({ papel: 'boleto', n: null }),
      rotuloDoPapel({ papel: 'comprovante', n: null }), rotuloDoPapel({ papel: 'devolucao', n: null })])
      .toEqual(['Compra', 'Entrega 3', 'Boleto', 'Comprovante', 'Devolução']);
    expect(oQueOPapelFaz('compra')).toBe('gera a conta · vai no LCDPR');
    expect(oQueOPapelFaz('entrega')).toBe('entrega · sem financeiro');
    expect(oQueOPapelFaz('boleto')).toBe('');
    expect(fraseDaFalta({ falta: 6412, unidade: 'sc' })).toBe('6.412 sc');
    expect(fraseDaFalta({ falta: 0, unidade: 'kg' })).toBe('completa');
    expect(fraseDasEntregas({ entregas: 7, itens: [{ produto: 'M', unidade: 'sc', comprado: 10000, entregue: 3588, falta: 6412 }] })).toBe('7 · falta 6.412 sc');
    expect(fraseDasEntregas({ entregas: 1, itens: [{ produto: 'U', unidade: 'kg', comprado: 1000, entregue: 1000, falta: 0 }] })).toBe('1 · completa');
    expect(fraseDasEntregas({ entregas: 1, itens: null })).toBe('1');
  });
});
