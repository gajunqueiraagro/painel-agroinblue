/**
 * P153 — `nomeDoHistorico`: as formas do histórico por banco (medidas no proto na FASE 0), com nomes SINTÉTICOS.
 * D1: banco que não traz o nome → '' (o campo vazio; nunca o texto inteiro, nunca os dígitos).
 */
import { describe, it, expect } from 'vitest';
import { nomeDoHistorico, documentoDoHistorico, formatarDocumento, campoDoHistorico, termoDoCampo } from './nomeDoHistorico';

describe('nomeDoHistorico', () => {
  it.each([
    /* BB: o nome depois da hora, ou depois do " - " */
    ['Pix - Enviado - 02/10 11:23 Fornecedor Sintetico Ltda', '2026-10-02', 'Fornecedor Sintetico Ltda'],
    ['Pix - Recebido - 01/09 14:02 Comprador Sintético de Bezerros', '2026-09-01', 'Comprador Sintético de Bezerros'],
    ['Pagamento de Boleto - CASA DO CRIADOR SINT', null, 'CASA DO CRIADOR SINT'],
    /* Itaú: o prefixo sem separador e o documento no fim (ou no começo, no TED) */
    ['PIX ENVIADO ZEBRALUX SINTETICA 999.999.999-99', null, 'ZEBRALUX SINTETICA'],
    ['PIX TRANSF ZEBRALU 99 99', null, 'ZEBRALU'],
    ['BOLETO PAGO ZEBRALUX COMERCIO', null, 'ZEBRALUX COMERCIO'],
    ['TED RECEBIDA 999.9999.ZEBRALUX AGRO CNPJ', null, 'ZEBRALUX AGRO'],
    /* CONC-SUGESTOES-V2 A — Sicredi pelo Open Finance: o documento no meio, o nome depois */
    ['LIQUIDACAO BOLETO SICREDI 11222333000181 TRANSPORTADORA SINTETICA LTDA', null, 'TRANSPORTADORA SINTETICA LTDA'],
    ['LIQUIDACAO BOLETO 11222333000181 POSTO SINTETICO LTDA', null, 'POSTO SINTETICO LTDA'],
    ['PAGAMENTO PIX 11222333000181 Z R SINTETICA LTDA', null, 'Z R SINTETICA LTDA'],
    ['RECEBIMENTO PIX 12345678909 FULANO SINTETICO', null, 'FULANO SINTETICO'],
  ])('%s → %s', (texto, data, nome) => {
    expect(nomeDoHistorico(texto, data)).toBe(nome);
  });

  it.each([
    'PIX ENVIADO',                        /* Bradesco: sem nome */
    'PFOR TIT OUTROS BANCOS',             /* Bradesco: tipo de operação, sem nome */
    'CONTA DE LUZ',
    'PAGAMENTO PIX-PIX_DEB 99999999',     /* Sicredi: só o código e os dígitos */
    'LIQUIDACAO BOLETO- 99999999',
    'Pix - Enviado - 02/10 11:23',        /* BB sem o nome no fim */
    'LIQUIDACAO DE PARCELA',              /* Sicredi: parcela de empréstimo, sem nome */
    'LIQUIDACAO BOLETO SICREDI 11222333000181',
    '',
  ])('sem nome: "%s" → ""', (texto) => {
    expect(nomeDoHistorico(texto, '2026-10-02')).toBe('');
  });

  it('nulo ou indefinido → ""', () => {
    expect(nomeDoHistorico(null)).toBe('');
    expect(nomeDoHistorico(undefined)).toBe('');
  });
});

describe('documentoDoHistorico (CONC-SUGESTOES-V2 A)', () => {
  it('lê o CNPJ corrido ou formatado, com a raiz; o CPF também', () => {
    expect(documentoDoHistorico('LIQUIDACAO BOLETO SICREDI 11222333000181 TRANSPORTADORA SINTETICA')).toEqual({ tipo: 'cnpj', digitos: '11222333000181', raiz: '11222333' });
    expect(documentoDoHistorico('TED RECEBIDA 11.222.333/0002-62 ZEBRALUX')?.raiz).toBe('11222333');
    expect(documentoDoHistorico('RECEBIMENTO PIX 123.456.789-09 FULANO')).toEqual({ tipo: 'cpf', digitos: '12345678909', raiz: '12345678909' });
  });
  it('dígito verificador errado, número curto ou repetido → null (nunca adivinha)', () => {
    expect(documentoDoHistorico('LIQUIDACAO BOLETO 11222333000182 X')).toBeNull();
    expect(documentoDoHistorico('PAGAMENTO PIX-PIX_DEB 99999999')).toBeNull();
    expect(documentoDoHistorico('PIX 11111111111 FULANO')).toBeNull();
    expect(documentoDoHistorico(null)).toBeNull();
  });
  it('formata como o cadastro', () => {
    expect(formatarDocumento({ tipo: 'cnpj', digitos: '11222333000181', raiz: '11222333' })).toBe('11.222.333/0001-81');
    expect(formatarDocumento({ tipo: 'cpf', digitos: '12345678909', raiz: '12345678909' })).toBe('123.456.789-09');
  });
});

describe('o campo do Procurar (CONC-SUGESTOES-V2 A)', () => {
  it('nasce com nome · documento; só um, se só houver um; vazio sem nenhum', () => {
    expect(campoDoHistorico('LIQUIDACAO BOLETO SICREDI 11222333000181 TRANSPORTADORA SINTETICA LTDA')).toBe('TRANSPORTADORA SINTETICA LTDA · 11.222.333/0001-81');
    expect(campoDoHistorico('BOLETO PAGO ZEBRALUX COMERCIO')).toBe('ZEBRALUX COMERCIO');
    expect(campoDoHistorico('LIQUIDACAO BOLETO SICREDI 11222333000181')).toBe('11.222.333/0001-81');
    expect(campoDoHistorico('PAGAMENTO PIX-PIX_DEB 99999999')).toBe('');
  });
  it('o que vai ao banco: o nome e o documento, lidos do campo (o operador pode editar)', () => {
    expect(termoDoCampo('TRANSPORTADORA SINTETICA LTDA · 11.222.333/0001-81')).toEqual({ nome: 'TRANSPORTADORA SINTETICA LTDA', documento: { tipo: 'cnpj', digitos: '11222333000181', raiz: '11222333' } });
    expect(termoDoCampo('zebralux')).toEqual({ nome: 'zebralux', documento: null });
    expect(termoDoCampo('11222333000181').documento?.raiz).toBe('11222333');
    expect(termoDoCampo('NF 9.779 · zebra')).toEqual({ nome: 'NF 9.779 zebra', documento: null });
  });
});
