/**
 * O que este teste trava — que a proposta do abate feche com o valor acordado.
 *
 * ⚠ O FUNRURAL É RETIDO NA FONTE E NÃO É COMPROMISSO. No abate o frigorífico retém o
 * Funrural/SENAR e paga o líquido; `valor_liquido` já vem líquido dele — conferido na NF
 * 6713, em que base + bônus − funrural = líquido nos quatro lotes. Enquanto ele era
 * proposto como obrigação, o produtor recebia o líquido E ficava devendo o imposto por
 * fora: na OC do Agnaldo o Total proposto dava 959.082,43 contra 961.008,30 de Acordado.
 * ⚠ O IMPOSTO NÃO SUMIU: segue em `zoo_operacao_abate.funrural_valor` e vai à DRE como
 * dedução de receita, sem caixa. Mudou de leitor, não de existência.
 */
import { describe, it, expect } from 'vitest';
import { classificarLotesPorLado, type LoteOC } from '@/hooks/useOperacaoLiquidacao';

/** OC ed3c4a4e (Agnaldo): 155 bois, líquido 961.008,30, Funrural retido de 1.925,87. */
const AGNALDO: LoteOC = {
  id: '38221f9b', categoria: 'bois', qtd: 155, pesoMedioKg: 520,
  criterio: 'kg', valorInformado: null, valorLiquidoAbate: 961008.30,
};
const VALOR_ACORDADO = 961008.30;
const FUNRURAL_RETIDO = 1925.87;

describe('proposta do abate × valor acordado', () => {
  it('o principal sozinho fecha com o Acordado, ao centavo', () => {
    const c = classificarLotesPorLado([AGNALDO], 'abate');
    expect(c.status).toBe('ok');
    if (c.status !== 'ok') return;
    const totalProposto = c.itens.reduce((a, i) => a + i.valorBruto, 0);
    expect(Math.abs(totalProposto - VALOR_ACORDADO)).toBeLessThanOrEqual(0.01);
  });

  it('⚠ com a obrigação do Funrural somada, NÃO fechava — o defeito, em número', () => {
    const c = classificarLotesPorLado([AGNALDO], 'abate');
    if (c.status !== 'ok') throw new Error('não classificou');
    const comFunrural = c.itens.reduce((a, i) => a + i.valorBruto, 0) - FUNRURAL_RETIDO;
    expect(Math.abs(comFunrural - VALOR_ACORDADO)).toBeGreaterThan(0.01);
    expect(comFunrural).toBeCloseTo(959082.43, 2);
  });

  it('o líquido já é líquido do Funrural: somá-lo de volta daria o bruto, não o acordado', () => {
    /* A prova de que a retenção está DENTRO do líquido, e não ao lado dele. */
    expect(VALOR_ACORDADO + FUNRURAL_RETIDO).toBeCloseTo(962934.17, 2);
    expect(VALOR_ACORDADO + FUNRURAL_RETIDO).not.toBeCloseTo(VALOR_ACORDADO, 2);
  });
});
