/**
 * `oc_return` NÃO PEGA CARONA — OC-ABRIR-PERDE-ID-01.
 *
 * ⚠ NASCE DE UM CLIQUE QUE IA PARA A TELA ERRADA, EM SILÊNCIO. OC 8b211cae (NJ, venda
 * boitel), 24/09/2026: com os filtros da Central em 2020, clicar na linha levava o
 * operador para "Lançar movimentação" — sem modal, sem toast, sem erro. A URL chegava lá
 * com os filtros intactos e SEM `oc_venda`/`oc_id`.
 *
 * ⚠ A CAUSA ERA UMA LINHA DE PRESERVAÇÃO: `if (!p.get('oc_return'))`. Um
 * `oc_return=lancamentos-zoot`, gravado quando a venda nasceu em "Lançar movimentação",
 * sobrevivia na URL e respondia por um clique que nunca aconteceu. O fecho o lia e obedecia
 * — `'lancamentos-zoot'` é seção conhecida, `'operacoes-comerciais'` cai no fallback.
 *
 * ⚠ NENHUM DOS SETE GATES VÊ ISTO. Não é tipo, não é build, não é hook nem ciclo: é uma
 * string de query que manda a navegação para outro lugar. Só a tela mostra — e mostrou
 * duas vezes, em dois dias.
 */
import { describe, it, expect } from 'vitest';
import { paramsAberturaOC } from '@/lib/oc/paramsAberturaOC';

const q = (s: string, o: Parameters<typeof paramsAberturaOC>[1]) => paramsAberturaOC(s, o);

describe('paramsAberturaOC — oc_return', () => {
  it('o retorno do CHAMADOR ganha do que estava na URL — o caso do NJ 24/09/2026', () => {
    /* A URL trazia o `oc_return` velho de uma abertura em "Lançar movimentação". */
    const p = q('?f_de=2020-01&f_ate=2020-12&f_tipo=venda&oc_return=lancamentos-zoot', {
      ocId: '8b211cae-f2c2-4a0e-afc4-8d607308435e', tipo: 'venda', retorno: 'operacoes-comerciais',
    });
    expect(p.get('oc_return')).toBe('operacoes-comerciais');
    /* ⚠ E O CLIQUE CHEGA INTEIRO: sem estes dois o modal não monta, que era o sintoma. */
    expect(p.get('oc_venda')).toBe('1');
    expect(p.get('oc_id')).toBe('8b211cae-f2c2-4a0e-afc4-8d607308435e');
  });

  it('sem retorno, o `oc_return` velho é APAGADO — nunca herdado', () => {
    /* ⚠ É a regra inteira: "não tenho origem" jamais pode virar "uso a de outro clique". */
    const p = q('?oc_return=lancamentos-zoot', { ocId: 'abc', tipo: 'venda' });
    expect(p.has('oc_return')).toBe(false);
  });

  it('os filtros da tela atravessam — é o que devolve a lista no mesmo recorte', () => {
    const p = q('?f_de=2020-01&f_ate=2020-12&f_tipo=venda&f_ord=data:asc', {
      ocId: 'abc', tipo: 'venda', retorno: 'operacoes-comerciais',
    });
    expect(p.get('f_de')).toBe('2020-01');
    expect(p.get('f_ate')).toBe('2020-12');
    expect(p.get('f_tipo')).toBe('venda');
    expect(p.get('f_ord')).toBe('data:asc');
  });

  it('a volta do drill do Financeiro PRESERVA, porque passa o valor', () => {
    /* ⚠ O motivo da preservação não morreu — mudou de dono. Quem estava na Central, foi ao
       Financeiro e volta, continua voltando para a Central; a diferença é que agora isso
       está escrito no chamador, e não adivinhado pela função. */
    const p = q('?oc_return=operacoes-comerciais', {
      ocId: 'abc', aba: 'financeiro', tipo: 'compra', retorno: 'operacoes-comerciais',
    });
    expect(p.get('oc_return')).toBe('operacoes-comerciais');
    expect(p.get('oc_aba')).toBe('financeiro');
  });
});

describe('paramsAberturaOC — os três tipos', () => {
  it('venda liga oc_venda e APAGA os irmãos', () => {
    const p = q('?oc_compra=1&oc_abate=1', { ocId: 'abc', tipo: 'venda' });
    expect(p.get('oc_venda')).toBe('1');
    expect(p.has('oc_compra')).toBe(false);
    expect(p.has('oc_abate')).toBe(false);
  });

  it('abate liga oc_abate e apaga os irmãos', () => {
    const p = q('?oc_compra=1&oc_venda=1', { ocId: 'abc', tipo: 'abate' });
    expect(p.get('oc_abate')).toBe('1');
    expect(p.has('oc_compra')).toBe(false);
    expect(p.has('oc_venda')).toBe(false);
  });

  it('sem tipo, compra — o default que o drill do Financeiro usa', () => {
    const p = q('?oc_venda=1', { ocId: 'abc' });
    expect(p.get('oc_compra')).toBe('1');
    expect(p.has('oc_venda')).toBe(false);
  });

  /* ⚠ DOIS PARÂMETROS LIGADOS MONTARIAM DOIS SHELLS no mesmo render. Este caso afirma a
     impossibilidade nos três sentidos de uma vez, que é o que a garantia promete. */
  it('nunca há dois tipos ligados ao mesmo tempo', () => {
    for (const tipo of ['compra', 'venda', 'abate']) {
      const p = q('?oc_compra=1&oc_venda=1&oc_abate=1', { ocId: 'abc', tipo });
      const ligados = ['oc_compra', 'oc_venda', 'oc_abate'].filter(k => p.get(k) === '1');
      expect(ligados).toHaveLength(1);
    }
  });
});

describe('paramsAberturaOC — oc_aba', () => {
  it('sem aba, o parâmetro velho é apagado', () => {
    const p = q('?oc_aba=negociacao', { ocId: 'abc', tipo: 'venda' });
    expect(p.has('oc_aba')).toBe(false);
  });

  it('com aba, grava', () => {
    expect(q('', { ocId: 'abc', aba: 'negociacao', tipo: 'venda' }).get('oc_aba')).toBe('negociacao');
  });
});
