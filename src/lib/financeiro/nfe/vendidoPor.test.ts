/** DA-NOTA-CLASSIF-01 (4) — o marketplace: o fornecedor do lançamento é OUTRO que o emitente? PURO. Dados SINTÉTICOS. */
import { describe, it, expect } from 'vitest';
import { fornecedorNaoEOEmitente } from './vendidoPor';

const CADASTROS = [
  { id: 'mkt', cpf_cnpj: '10.000.000/0001-91' },              // o marketplace (quem cobrou)
  { id: 'emit', cpf_cnpj: '11.222.333/0004-24' },             // o emitente da nota
  { id: 'emit-2', cpf_cnpj: '11222333000424' },               // outro cadastro com o MESMO documento do emitente
  { id: 'semdoc', cpf_cnpj: null },
];
const NOTA = '11222333000424';

describe('fornecedorNaoEOEmitente', () => {
  it('o marketplace (outro documento) = sim: a tela diz "vendido por"', () => {
    expect(fornecedorNaoEOEmitente('mkt', 'emit', NOTA, CADASTROS)).toBe(true);
    expect(fornecedorNaoEOEmitente('mkt', null, NOTA, CADASTROS)).toBe(true);   // o emitente sem cadastro
  });
  it('o mesmo cadastro que a nota achou, ou o mesmo documento (com ou sem máscara) = não', () => {
    expect(fornecedorNaoEOEmitente('emit', 'emit', NOTA, CADASTROS)).toBe(false);
    expect(fornecedorNaoEOEmitente('emit-2', 'emit', NOTA, CADASTROS)).toBe(false);
    expect(fornecedorNaoEOEmitente('emit', null, '11.222.333/0004-24', CADASTROS)).toBe(false);
    expect(fornecedorNaoEOEmitente('semdoc', 'semdoc', NOTA, CADASTROS)).toBe(false);   // achado pelo nome, sem CNPJ: é ele
  });
  it('lançamento sem fornecedor = não diz nada; cadastro fora da lista e de outro id = outro', () => {
    expect(fornecedorNaoEOEmitente(null, 'emit', NOTA, CADASTROS)).toBe(false);
    expect(fornecedorNaoEOEmitente('fora', 'emit', NOTA, CADASTROS)).toBe(true);
    expect(fornecedorNaoEOEmitente('semdoc', 'emit', NOTA, CADASTROS)).toBe(true);
  });
});
