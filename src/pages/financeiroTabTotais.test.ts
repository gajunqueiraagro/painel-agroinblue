/**
 * O que este teste trava — a linha TOTAL da lista de movimentações (ZOOT-LISTA-01).
 *
 * ⚠ A REND DO TOTAL NÃO É A MÉDIA DAS RENDS. É a média PONDERADA PELA CARCAÇA: soma dos
 * quilos de carcaça sobre soma dos quilos de peso vivo. Numa média simples um lote de 200
 * cabeças pesa igual a um de 18, e não é isso que o frigorífico paga.
 *
 * ⚠ E LINHA SEM CARCAÇA SAI DAS DUAS PONTAS. Deixá-la só no denominador afundaria a média
 * com peso vivo que ninguém abateu. O caso não é hipotético: os 12 abates de OC do proto
 * têm `peso_carcaca_kg` NULO no lançamento — a carcaça mora em `zoo_operacao_abate` e chega
 * por enriquecimento, que pode falhar ou não ter rodado ainda.
 */
import { describe, it, expect } from 'vitest';
import { totaisDaLista } from './FinanceiroTab';
import type { Lancamento } from '@/types/cattle';

const mk = (over: Partial<Lancamento>): Lancamento => ({
  id: 'x', data: '2026-04-15', tipo: 'abate', categoria: 'garrotes',
  quantidade: 10, cenario: 'realizado',
  ...over,
} as Lancamento);

describe('totaisDaLista — REND ponderada pela carcaça', () => {
  it('pondera pela carcaça, não pela contagem de linhas', () => {
    /* 100 cab a 50% e 1 cab a 60%: a média simples diria 55%; a ponderada, 50,03%. */
    const muitos = mk({ id: 'a', quantidade: 100, pesoMedioKg: 500, pesoCarcacaKg: 250 });
    const uma = mk({ id: 'b', quantidade: 1, pesoMedioKg: 500, pesoCarcacaKg: 300 });
    const { rendPonderado } = totaisDaLista([muitos, uma]);
    const esperado = ((250 * 100 + 300) / (500 * 100 + 500)) * 100;
    expect(rendPonderado).toBeCloseTo(esperado, 4);
    expect(rendPonderado).toBeLessThan(51);          // longe dos 55% da média simples
  });

  it('linha sem carcaça sai do numerador E do denominador', () => {
    const com = mk({ id: 'a', quantidade: 10, pesoMedioKg: 500, pesoCarcacaKg: 275 });
    const sem = mk({ id: 'b', quantidade: 90, pesoMedioKg: 500 });   // abate de OC não enriquecido
    const { rendPonderado } = totaisDaLista([com, sem]);
    expect(rendPonderado).toBeCloseTo(55, 6);        // 55%, e não 5,5% diluído pelas 90
  });

  it('sem carcaça em lugar nenhum, a REND é zero — e a tabela imprime "—"', () => {
    const a = mk({ id: 'a', quantidade: 10, pesoMedioKg: 500 });
    const b = mk({ id: 'b', quantidade: 20, pesoMedioKg: 480 });
    expect(totaisDaLista([a, b]).rendPonderado).toBe(0);
  });

  it('peso vivo ausente também exclui a linha: sem as duas pontas não há razão', () => {
    const semVivo = mk({ id: 'a', quantidade: 10, pesoCarcacaKg: 275 });
    const ok = mk({ id: 'b', quantidade: 10, pesoMedioKg: 500, pesoCarcacaKg: 250 });
    expect(totaisDaLista([semVivo, ok]).rendPonderado).toBeCloseTo(50, 6);
  });
});

describe('totaisDaLista — RECEBIDO NF', () => {
  it('o abate de OC soma o LÍQUIDO do abate, não a cópia velha do lançamento', () => {
    /* Os dois números reais do proto para os mesmos 41 garrotes de 15/04. */
    const oc = mk({ id: 'a', quantidade: 41, pesoMedioKg: 540.22,
      valorTotal: 305905.76, valorLiquidoAbate: 314915.61 });
    const outro = mk({ id: 'b', quantidade: 1, pesoMedioKg: 500, valorTotal: 1000 });
    expect(totaisDaLista([oc, outro]).totals.valorTotal).toBeCloseTo(314915.61 + 1000, 2);
  });

  it('o legado soma o valor da época — sem subtrair Funrural', () => {
    /* 112-GO, item 1: em 21 dos 109 abates legados com Funrural ele JÁ está dentro do
       `valor_total`; subtrair cegamente descontaria R$ 124.558,12 duas vezes. */
    const legado = mk({ id: 'a', quantidade: 41, pesoMedioKg: 540.22,
      valorTotal: 315529.85, descontoFunrural: 614.24 });
    expect(totaisDaLista([legado, legado]).totals.valorTotal).toBeCloseTo(315529.85 * 2, 2);
  });

  it('R$/@ e /Cab do TOTAL derivam da SOMA, não da média das linhas', () => {
    const a = mk({ id: 'a', quantidade: 10, pesoMedioKg: 500, pesoCarcacaKg: 250, valorTotal: 100000 });
    const b = mk({ id: 'b', quantidade: 30, pesoMedioKg: 500, pesoCarcacaKg: 250, valorTotal: 300000 });
    const { liqCabeca, liqArroba, totals } = totaisDaLista([a, b]);
    expect(liqCabeca).toBeCloseTo(400000 / 40, 6);
    expect(liqArroba).toBeCloseTo(400000 / totals.arrobasTotal, 6);
  });
});
