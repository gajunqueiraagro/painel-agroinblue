/**
 * A REGRA ÚNICA DO SUBCENTRO DE VENDA — OC-BOITEL-VALOR-01.
 *
 * ⚠ O CASO QUE JUSTIFICA O ARQUIVO é o do garrote: a MESMA categoria vai para dois
 * subcentros diferentes conforme haja boitel, e é exatamente esse par que estava errado no
 * banco — quatro OCs de boitel com a principal em 1140. Afirmar só o caso do boitel
 * passaria verde também numa função que mandasse TUDO para 1150 e apagasse a
 * classificação por categoria; por isso os dois andam juntos.
 */
import { describe, it, expect } from 'vitest';
import { subcentroDaVenda, SUBCENTRO_VENDA_BOITEL } from '@/lib/financeiro/subcentroVenda';

describe('subcentroDaVenda', () => {
  it('o boitel vem ANTES da categoria — o mesmo garrote muda de conta', () => {
    expect(subcentroDaVenda('garrotes', true)).toBe(SUBCENTRO_VENDA_BOITEL);
    expect(subcentroDaVenda('garrotes', false)).toBe('Venda de Machos Adultos');
  });

  it('sem boitel, os quatro do par sexo × faixa etária', () => {
    expect(subcentroDaVenda('bois', false)).toBe('Venda de Machos Adultos');
    expect(subcentroDaVenda('vacas', false)).toBe('Venda de Fêmeas Adultas');
    expect(subcentroDaVenda('desmama_m', false)).toBe('Venda de Desmama Machos');
    expect(subcentroDaVenda('desmama_f', false)).toBe('Venda de Desmama Fêmeas');
  });

  it('com boitel, a categoria não importa — nem uma que nem existe no mapa', () => {
    expect(subcentroDaVenda('vacas', true)).toBe(SUBCENTRO_VENDA_BOITEL);
    expect(subcentroDaVenda('desmama_f', true)).toBe(SUBCENTRO_VENDA_BOITEL);
    expect(subcentroDaVenda('categoria_que_nao_existe', true)).toBe(SUBCENTRO_VENDA_BOITEL);
  });

  it('categoria fora do mapa devolve null, nunca um palpite', () => {
    expect(subcentroDaVenda('categoria_que_nao_existe', false)).toBeNull();
    expect(subcentroDaVenda('', false)).toBeNull();
  });

  it('mamote cai em DESMAMA — a regra da OC venceu a unificação', () => {
    expect(subcentroDaVenda('mamotes_m', false)).toBe('Venda de Desmama Machos');
    expect(subcentroDaVenda('mamotes_f', false)).toBe('Venda de Desmama Fêmeas');
  });

  it('os apelidos que só o Planejamento usava continuam classificando', () => {
    /* ⚠ Sem eles a unificação devolveria `null` onde antes havia conta, e a linha sumiria
       da grade da meta sem erro nenhum. */
    expect(subcentroDaVenda('bezerros_m', false)).toBe('Venda de Desmama Machos');
    expect(subcentroDaVenda('bezerras_f', false)).toBe('Venda de Desmama Fêmeas');
    expect(subcentroDaVenda('machos_adultos', false)).toBe('Venda de Machos Adultos');
    expect(subcentroDaVenda('femeas_adultas', false)).toBe('Venda de Fêmeas Adultas');
  });
});
