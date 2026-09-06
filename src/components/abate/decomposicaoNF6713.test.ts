/**
 * O que este teste trava — a DECOMPOSIÇÃO do abate contra uma nota fiscal real.
 *
 * NF-e 6713, Minerva/Fortunceres, abate de 16/04/2026, quatro lotes. Os números abaixo são
 * os da nota, não os do banco: em 05/09 os quatro lotes foram gravados certos às 15:28 e
 * reescritos às 17:04 com `preco_arroba` 362 nos três primeiros — 375,00 nos lotes 7914 e
 * 7963 e 361,4574 (preço pelo total) no 7915 viraram todos 362. Às 17:48 os líquidos foram
 * restaurados à mão, com R$ 13,00/@ acomodados em `bonus_lista_trace`: R$ 10.645,33 no
 * 7914, R$ 5.221,23 no 7963 e R$ 3.555,71 no 7915, mais um desconto de qualidade de
 * R$ 3.726,33 que não existe na nota.
 *
 * ⚠ O LÍQUIDO FECHAVA NOS TRÊS MOMENTOS, E ERA ESSE O PROBLEMA. Um bônus fictício que
 * compensa um preço errado dá o mesmo total e mente sobre COMO se chegou nele — some no
 * R$/@ da lista, no comparativo entre frigoríficos e em qualquer leitura que pergunte
 * "quanto vale a arroba aqui". Por isso este teste confere a decomposição, e não só o
 * resultado: `bonusListaTrace` e `descontoQualidade` são ZERO nos quatro lotes.
 *
 * ⚠ OS "TRÊS CENTAVOS" DO LOTE 7916 NÃO SÃO DO CÁLCULO. Medido aqui: a lib devolve
 * 113.069,41, o valor da nota na vírgula. Quem trazia 113.069,44 era o banco, desde a
 * primeira gravação, e foi essa diferença que virou um "desconto de qualidade" de R$ 0,03.
 * A nota inteira também fecha ao centavo: 700.064,34.
 */
import { describe, it, expect } from 'vitest';
import { buildAbateCalculation } from '@/lib/calculos/abate';
import { paraCalculo, linhaVazia, type LoteAbate } from './calculoDoLote';
import type { LinhaAbate } from '@/hooks/useOperacaoAbate';

/** Um lote da nota: carcaça TOTAL em kg, como o banco guarda; a conversão é de `paraCalculo`. */
const daNota = (o: {
  qtd: number; pesoVivoMedio: number; carcacaTotalKg: number;
  precoArroba?: number; valorBaseTotal?: number;
  precoce: number; qualidade: number; funrural: number;
}): { lote: LoteAbate; linha: LinhaAbate } => ({
  lote: {
    id: 'l', ordem: 1, categoria: 'garrotes', categoriaLabel: 'Garrotes',
    quantidade: o.qtd, pesoMedioKg: o.pesoVivoMedio,
  },
  linha: {
    ...linhaVazia('l'),
    pesoCarcacaKg: o.carcacaTotalKg,
    pesoCarcacaFonte: 'total',
    precoArroba: o.precoArroba ?? null,
    precoFonte: o.valorBaseTotal != null ? 'total' : 'arroba',
    valorBaseOverride: o.valorBaseTotal ?? null,
    bonusPrecoce: { valor: o.precoce, fonte: 'reais' },
    bonusQualidade: { valor: o.qualidade, fonte: 'reais' },
    funrural: { valor: o.funrural, fonte: 'reais' },
  },
});

const calcular = (x: { lote: LoteAbate; linha: LinhaAbate }) =>
  buildAbateCalculation(paraCalculo(x.linha, x.lote));

describe('NF 6713 — a decomposição de cada lote, e não só o total', () => {
  it('lote 7914 · 41 bois · 375,00/@ → líquido 314.915,61', () => {
    const c = calcular(daNota({
      qtd: 41, pesoVivoMedio: 540.22, carcacaTotalKg: 12260.80,
      precoArroba: 375, precoce: 8409.85, qualidade: 600, funrural: 614.24,
    }));
    expect(c.valorLiquido).toBeCloseTo(314915.61, 2);
    /* Sem bônus inventado: os R$ 10.645,33 do banco são (375 − 362) × 817,39 @. */
    expect(c.bonusListaTraceTotal).toBe(0);
    expect(c.descQualidadeTotal).toBe(0);
  });

  it('lote 7963 · 20 bois · 375,00/@ → líquido 155.084,79', () => {
    const c = calcular(daNota({
      qtd: 20, pesoVivoMedio: 548.60, carcacaTotalKg: 6024.50,
      precoArroba: 375, precoce: 4254.56, qualidade: 520, funrural: 302.27,
    }));
    expect(c.valorLiquido).toBeCloseTo(155084.79, 2);
    expect(c.bonusListaTraceTotal).toBe(0);
  });

  it('lote 7916 · 20 novilhas · 362,00/@ → 113.069,41, o centavo exato da nota', () => {
    const c = calcular(daNota({
      qtd: 20, pesoVivoMedio: 437.00, carcacaTotalKg: 4539.50,
      precoArroba: 362, precoce: 3375.97, qualidade: 360, funrural: 219.83,
    }));
    /* ⚠ NÃO HÁ TRÊS CENTAVOS A EXPLICAR: a lib devolve 113.069,41, que é o valor da nota
       na vírgula. Quem carregava a diferença era o BANCO, que gravou 113.069,44 em 15:28
       e em 17:04 — e foi ela que virou um "desconto de qualidade" de R$ 0,03 às 17:48.
       O cálculo nunca errou; o dado gravado é que não vinha dele. */
    expect(c.valorLiquido).toBeCloseTo(113069.41, 2);
    expect(c.descQualidadeTotal).toBe(0);
  });

  it('lote 7915 · 20 novilhas · preço PELO TOTAL 113.666,31 → líquido 116.994,53', () => {
    /* ⚠ O ÚNICO LOTE COM PREÇO PELO TOTAL, e é onde o override existe para isto: a base é
       digitada e o R$/@ (361,4574) é derivado dela. Gravar 362 "redondo" aqui muda a base
       em R$ 170,62 — que foi exatamente o que o banco depois compensou com bônus. */
    const c = calcular(daNota({
      qtd: 20, pesoVivoMedio: 440.80, carcacaTotalKg: 4717.00,
      valorBaseTotal: 113666.31, precoce: 3475.71, qualidade: 80, funrural: 227.49,
    }));
    expect(c.valorLiquido).toBeCloseTo(116994.53, 2);
    expect(c.bonusListaTraceTotal).toBe(0);
    expect(c.descQualidadeTotal).toBe(0);
  });

  it('a nota inteira: bruto 701.428,17 · funrural 1.363,83 · líquido 700.064,34', () => {
    const lotes = [
      daNota({ qtd: 41, pesoVivoMedio: 540.22, carcacaTotalKg: 12260.80, precoArroba: 375, precoce: 8409.85, qualidade: 600, funrural: 614.24 }),
      daNota({ qtd: 20, pesoVivoMedio: 548.60, carcacaTotalKg: 6024.50, precoArroba: 375, precoce: 4254.56, qualidade: 520, funrural: 302.27 }),
      daNota({ qtd: 20, pesoVivoMedio: 437.00, carcacaTotalKg: 4539.50, precoArroba: 362, precoce: 3375.97, qualidade: 360, funrural: 219.83 }),
      daNota({ qtd: 20, pesoVivoMedio: 440.80, carcacaTotalKg: 4717.00, valorBaseTotal: 113666.31, precoce: 3475.71, qualidade: 80, funrural: 227.49 }),
    ].map(calcular);
    const soma = (f: (c: ReturnType<typeof calcular>) => number) => lotes.reduce((a, c) => a + f(c), 0);
    expect(soma(c => c.funruralTotal)).toBeCloseTo(1363.83, 2);
    /* ⚠ A NOTA INTEIRA, AO CENTAVO. É o teste que mais importa: reproduzindo os quatro
       lotes a partir da NF, a lib chega ao mesmo total que o frigorífico pagou, sem um
       único bônus ou desconto de acerto. Todo o desvio que existe no banco veio do dado
       gravado — três preços trocados por 362 —, nunca do cálculo. */
    expect(soma(c => c.valorLiquido)).toBeCloseTo(700064.34, 2);
  });
});
