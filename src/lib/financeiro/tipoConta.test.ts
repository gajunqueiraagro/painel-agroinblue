/**
 * O que soma no caixa — PR-AGRI-BARTER-PERMUTA-SEPARADA.
 *
 * ⚠ ESTE TESTE PROTEGE UM NÚMERO QUE NINGUÉM CONFERE NA MÃO: o saldo do produtor na Home. Uma
 * conta de permuta entrando ali infla o dinheiro que ele acha que tem.
 */
import { describe, it, expect } from 'vitest';
import { ehContaDeCaixa, ehPermuta, TIPOS_DE_CAIXA, TIPO_PERMUTA } from './tipoConta';
import { grupoDaConta, ROTULO_GRUPO_CONTA, ORDEM_GRUPO_CONTA } from './gruposDeConta';

describe('o que é caixa', () => {
  it('os três tipos de dinheiro somam', () => {
    expect(ehContaDeCaixa('cc')).toBe(true);
    expect(ehContaDeCaixa('inv')).toBe(true);
    expect(ehContaDeCaixa('cartao')).toBe(true);
  });

  it('⚠ PERMUTA NÃO SOMA — é o que se deve e se tem a receber em grão, não dinheiro', () => {
    expect(ehContaDeCaixa('permuta')).toBe(false);
    expect(ehPermuta('permuta')).toBe(true);
  });

  it('⚠ LISTA BRANCA: tipo novo fica FORA do caixa até alguém decidir que entra', () => {
    /* Errar para menos num saldo é conservador; errar para mais é o produtor achar que tem
       dinheiro que não tem. */
    expect(ehContaDeCaixa('consignado')).toBe(false);
    expect(ehContaDeCaixa('adiantamento')).toBe(false);
  });

  it('sem tipo declarado não é caixa: é justamente a conta que ninguém classificou', () => {
    expect(ehContaDeCaixa(null)).toBe(false);
    expect(ehContaDeCaixa('')).toBe(false);
    expect(ehContaDeCaixa('   ')).toBe(false);
  });

  it('o texto do banco pode vir com espaço ou maiúscula', () => {
    expect(ehContaDeCaixa(' CC ')).toBe(true);
    expect(ehPermuta(' Permuta ')).toBe(true);
  });

  it('a permuta não está entre os tipos de caixa', () => {
    expect(TIPOS_DE_CAIXA).not.toContain(TIPO_PERMUTA);
  });
});

describe('o grupo da permuta nos seletores', () => {
  it('⚠ TEM GRUPO PRÓPRIO, não cai em "Outros"', () => {
    expect(grupoDaConta('permuta')).toBe('permuta');
    expect(ROTULO_GRUPO_CONTA.permuta).toBe('Permuta');
  });

  it('e vem DEPOIS dos três tipos de dinheiro — ela não é dinheiro', () => {
    expect(ORDEM_GRUPO_CONTA.permuta).toBeGreaterThan(ORDEM_GRUPO_CONTA.cartao);
    expect(ORDEM_GRUPO_CONTA.permuta).toBeLessThan(ORDEM_GRUPO_CONTA.outro);
  });

  it('os tipos de dinheiro não mudaram de ordem', () => {
    expect(ORDEM_GRUPO_CONTA.cc).toBe(0);
    expect(ORDEM_GRUPO_CONTA.inv).toBe(1);
    expect(ORDEM_GRUPO_CONTA.cartao).toBe(2);
  });
});
