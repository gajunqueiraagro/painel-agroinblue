/**
 * P153 — `nomeDoHistorico`: as formas do histórico por banco (medidas no proto na FASE 0), com nomes SINTÉTICOS.
 * D1: banco que não traz o nome → '' (o campo vazio; nunca o texto inteiro, nunca os dígitos).
 */
import { describe, it, expect } from 'vitest';
import { nomeDoHistorico } from './nomeDoHistorico';

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
    '',
  ])('sem nome: "%s" → ""', (texto) => {
    expect(nomeDoHistorico(texto, '2026-10-02')).toBe('');
  });

  it('nulo ou indefinido → ""', () => {
    expect(nomeDoHistorico(null)).toBe('');
    expect(nomeDoHistorico(undefined)).toBe('');
  });
});
