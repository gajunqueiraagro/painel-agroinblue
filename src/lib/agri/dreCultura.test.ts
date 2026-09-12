/**
 * O pivô e os derivados do DRE por cultura — PR-AGRI-DRE-01.
 *
 * ⚠ OS NÚMEROS DESTES TESTES SÃO OS DO PROTO, não inventados: safra 25/26-Lav do NJ, medida
 * na RPC em 12/09/2026 — amendoim 192,3 ha e resultado 516.393,01; mandioca 34,8 ha e
 * 91.721,61; total 227,1 ha e 608.114,62. Se um dia a regra de rateio mudar, é aqui que a
 * divergência aparece antes de chegar à tela.
 */
import { describe, it, expect } from 'vitest';
import {
  montarMatriz, valorDe, resultadoPorHa, percentualCustoDireto, montanteRateado,
  houveRateio, exibeTraco, LINHA, COL_TOTAL, COL_COMPARTILHADO, ORDENS_CASCATA,
  type CelulaDre,
} from './dreCultura';

const cel = (
  cultura: string, ordem: number, valor: number | null,
  over: Partial<CelulaDre> = {},
): CelulaDre => ({
  cultura, ordem, valor,
  area_ha: null, area_cadastrada: null, linha: `l${ordem}`, rotulo: `R${ordem}`,
  rateio_admin_declarado: true,
  ...over,
});

/* A safra 25/26 do NJ, reduzida às linhas que os testes usam. */
const SET: CelulaDre[] = [
  cel('amendoim', LINHA.receitaLiquida, 2356772.42, { area_ha: 192.3, area_cadastrada: true }),
  cel('amendoim', LINHA.custoVariavel, 0, { area_ha: 192.3, area_cadastrada: true }),
  cel('amendoim', LINHA.custoFixo, 0, { area_ha: 192.3, area_cadastrada: true }),
  cel('amendoim', LINHA.juros, 0, { area_ha: 192.3, area_cadastrada: true }),
  cel('amendoim', LINHA.rateioCompartilhado, 908663.51, { area_ha: 192.3, area_cadastrada: true }),
  cel('amendoim', LINHA.rateioAdmin, 200605.06, { area_ha: 192.3, area_cadastrada: true }),
  cel('amendoim', LINHA.resultadoCaixa, 516393.01, { area_ha: 192.3, area_cadastrada: true }),
  cel('mandioca', LINHA.receitaLiquida, 426498.60, { area_ha: 34.8, area_cadastrada: true }),
  cel('mandioca', LINHA.custoVariavel, 131604.58, { area_ha: 34.8, area_cadastrada: true }),
  cel('mandioca', LINHA.custoFixo, 0, { area_ha: 34.8, area_cadastrada: true }),
  cel('mandioca', LINHA.juros, 0, { area_ha: 34.8, area_cadastrada: true }),
  cel('mandioca', LINHA.rateioCompartilhado, 164438.33, { area_ha: 34.8, area_cadastrada: true }),
  cel('mandioca', LINHA.rateioAdmin, 36302.94, { area_ha: 34.8, area_cadastrada: true }),
  cel('mandioca', LINHA.resultadoCaixa, 91721.61, { area_ha: 34.8, area_cadastrada: true }),
  cel(COL_COMPARTILHADO, LINHA.receitaLiquida, 2783271.02),
  cel(COL_COMPARTILHADO, LINHA.rateioCompartilhado, 1073101.84),
  cel(COL_COMPARTILHADO, LINHA.rateioAdmin, 236908.00),
  cel(COL_TOTAL, LINHA.receitaLiquida, 2783271.02, { area_ha: 227.1 }),
  cel(COL_TOTAL, LINHA.rateioCompartilhado, 1073101.84, { area_ha: 227.1 }),
  cel(COL_TOTAL, LINHA.rateioAdmin, 236908.00, { area_ha: 227.1 }),
  cel(COL_TOTAL, LINHA.resultadoCaixa, 608114.62, { area_ha: 227.1 }),
  cel(COL_TOTAL, LINHA.depreciacao, null, { area_ha: 227.1 }),
];

describe('o pivô', () => {
  const m = montarMatriz(SET);

  it('as culturas reais saem em ordem alfabética, sem as colunas especiais', () => {
    expect(m.culturas).toEqual(['amendoim', 'mandioca']);
  });

  it('⚠ `__total__` e `__compartilhado__` NÃO são culturas', () => {
    /* Se escapassem para a lista, virariam coluna e o total apareceria duas vezes. */
    expect(m.culturas).not.toContain(COL_TOTAL);
    expect(m.culturas).not.toContain(COL_COMPARTILHADO);
  });

  it('a área de cada cultura e a do total vêm do próprio conjunto', () => {
    expect(m.areaPorCultura.get('amendoim')).toBe(192.3);
    expect(m.areaTotal).toBe(227.1);
  });

  it('célula ausente devolve null em vez de quebrar', () => {
    expect(valorDe(m, 'amendoim', LINHA.depreciacao)).toBeNull();
    expect(valorDe(m, 'soja', LINHA.receitaBruta)).toBeNull();
  });

  it('conjunto vazio não quebra e se declara vazio', () => {
    const v = montarMatriz([]);
    expect(v.vazio).toBe(true);
    expect(v.culturas).toEqual([]);
    expect(v.areaTotal).toBeNull();
  });
});

describe('⚠ o total é lido, nunca somado', () => {
  const m = montarMatriz(SET);

  it('o resultado do total vem da coluna __total__', () => {
    expect(valorDe(m, COL_TOTAL, LINHA.resultadoCaixa)).toBe(608114.62);
  });

  it('e a soma das culturas bate com ele — mas NÃO é ela que a tela usa', () => {
    /* Bater é coincidência boa, não contrato: o dia em que o rateio deixar resíduo, o total
       da RPC continua certo e a soma do front estaria errada. */
    const soma = m.culturas.reduce((s, c) => s + (valorDe(m, c, LINHA.resultadoCaixa) ?? 0), 0);
    expect(soma).toBeCloseTo(608114.62, 2);
  });
});

describe('resultado por hectare', () => {
  const m = montarMatriz(SET);

  it('o do total é o que o Gabriel confere: ~R$ 2.678/ha', () => {
    expect(resultadoPorHa(m, COL_TOTAL)).toBeCloseTo(2677.74, 2);
  });

  it('por cultura, usa a área da cultura', () => {
    expect(resultadoPorHa(m, 'amendoim')).toBeCloseTo(2685.35, 2);
  });

  it('⚠ sem área não há indicador — nem zero, nem infinito', () => {
    const semArea = montarMatriz([
      cel('soja', LINHA.resultadoCaixa, 1000, { area_ha: 0, area_cadastrada: false }),
    ]);
    expect(resultadoPorHa(semArea, 'soja')).toBeNull();
    const areaNula = montarMatriz([
      cel('soja', LINHA.resultadoCaixa, 1000, { area_ha: null, area_cadastrada: false }),
    ]);
    expect(resultadoPorHa(areaNula, 'soja')).toBeNull();
  });
});

describe('percentual de custo direto', () => {
  const m = montarMatriz(SET);

  it('amendoim não tem custo direto nenhum: 0%', () => {
    expect(percentualCustoDireto(m, 'amendoim')).toBe(0);
  });

  it('mandioca tem o custo variável dela: 40%', () => {
    /* 131.604,58 direto contra 200.741,27 rateado = 39,6% → 40. */
    expect(percentualCustoDireto(m, 'mandioca')).toBe(40);
  });

  it('⚠ sem custo algum o selo SOME — 0/0 não é 0%', () => {
    const semCusto = montarMatriz([cel('soja', LINHA.resultadoCaixa, 10)]);
    expect(percentualCustoDireto(semCusto, 'soja')).toBeNull();
  });
});

describe('a faixa de rateio', () => {
  const m = montarMatriz(SET);

  it('o montante é o rateio compartilhado mais o administrativo do total', () => {
    expect(montanteRateado(m)).toBeCloseTo(1310009.84, 2);
    expect(houveRateio(m)).toBe(true);
  });

  it('sem rateio, não há faixa', () => {
    const sem = montarMatriz([cel(COL_TOTAL, LINHA.rateioCompartilhado, 0)]);
    expect(houveRateio(sem)).toBe(false);
  });
});

describe('quando a célula mostra traço', () => {
  it('nulo é sempre traço', () => {
    expect(exibeTraco(LINHA.depreciacao, null, COL_TOTAL)).toBe(true);
  });

  it('zero em COMPONENTE é traço — seis zeros escondem os três números que importam', () => {
    expect(exibeTraco(LINHA.custoFixo, 0, 'amendoim')).toBe(true);
    expect(exibeTraco(LINHA.deducoes, 0, 'amendoim')).toBe(true);
  });

  it('zero em SUBTOTAL é número: ali ele é o resultado, não a falta dele', () => {
    expect(exibeTraco(LINHA.receitaLiquida, 0, 'amendoim')).toBe(false);
    expect(exibeTraco(LINHA.resultadoCaixa, 0, 'amendoim')).toBe(false);
  });

  it('na coluna Total, zero é sempre número', () => {
    expect(exibeTraco(LINHA.custoFixo, 0, COL_TOTAL)).toBe(false);
  });

  it('valor diferente de zero nunca vira traço', () => {
    expect(exibeTraco(LINHA.custoVariavel, 131604.58, 'mandioca')).toBe(false);
  });
});

describe('as ordens da cascata', () => {
  it('são as nove primeiras, e o investimento fica fora', () => {
    expect(ORDENS_CASCATA).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ORDENS_CASCATA).not.toContain(LINHA.investimento);
    expect(ORDENS_CASCATA).not.toContain(LINHA.depreciacao);
  });
});
