/**
 * A REGRA ÚNICA DO FILTRO DE TIPO — FIN-LISTA-ORDENA-FILTRO-01.
 *
 * ⚠ O TIPO ERA O ÚNICO FILTRO DA BARRA APLICADO SÓ NO SERVIDOR. Conta, produto, documento,
 * fornecedor, atividade, safra, grupo e status já eram reconferidos em memória; o tipo, não.
 * A assimetria ficou invisível até uma carga chegar sem o predicado — e aí a tela mostrava,
 * sob "Tipo = Transferências", 9.366 linhas de dois anos inteiros, com amortização e ajuste
 * de caixa entre elas. Estes testes prendem os dois lados à mesma resposta.
 */
import { describe, it, expect } from 'vitest';
import { casaTipoOperacao } from './filtrosListaV2';

describe('casaTipoOperacao', () => {
  it('sem filtro, tudo passa', () => {
    expect(casaTipoOperacao('__all__', '2-Saídas')).toBe(true);
    expect(casaTipoOperacao('', '2-Saídas')).toBe(true);
    expect(casaTipoOperacao(undefined, '3-Transferências')).toBe(true);
  });

  it('Transferências aceita as DUAS grafias', () => {
    expect(casaTipoOperacao('3-Transferências', '3-Transferências')).toBe(true);
    expect(casaTipoOperacao('3-Transferências', '3-Transferência')).toBe(true);
  });

  it('e recusa o que não é transferência — o caso relatado', () => {
    /* Amortização e ajuste de caixa são `2-Saídas`: foi o que apareceu na tela sob o filtro
       de transferências quando o predicado do servidor se perdeu. */
    expect(casaTipoOperacao('3-Transferências', '2-Saídas')).toBe(false);
    expect(casaTipoOperacao('3-Transferências', '1-Entradas')).toBe(false);
  });

  it('Entradas e Saídas são igualdade exata', () => {
    expect(casaTipoOperacao('1-Entradas', '1-Entradas')).toBe(true);
    expect(casaTipoOperacao('1-Entradas', '2-Saídas')).toBe(false);
    expect(casaTipoOperacao('2-Saídas', '2-Saídas')).toBe(true);
    expect(casaTipoOperacao('2-Saídas', '3-Transferências')).toBe(false);
  });

  it('linha sem tipo não casa com filtro nenhum, e não estoura', () => {
    expect(casaTipoOperacao('2-Saídas', null)).toBe(false);
    expect(casaTipoOperacao('3-Transferências', undefined)).toBe(false);
  });

  it('espaços em volta não mudam a resposta', () => {
    expect(casaTipoOperacao(' 3-Transferências ', ' 3-Transferência ')).toBe(true);
  });
});
