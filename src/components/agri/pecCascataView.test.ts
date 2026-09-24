/**
 * A LEI DO GRÁFICO da cascata do DRE — DRE-CASCATA-GRAFICO-01.
 *
 * ⚠ NUMA PONTE, A ALTURA DE UMA BARRA É `ate − de`, E ELA TEM DE SER O MÓDULO DO VALOR. Como a
 * escala é linear, provar isso é provar a proporcionalidade inteira — sem montar SVG nenhum. TSC e
 * build ficam mudos: é aritmética dentro de um `rect`, e a homologação a olho não distingue uma
 * barra 3% menor do que devia.
 *
 * ⚠ E O ENCAIXE É A OUTRA METADE: um subtotal sai do ZERO e um passo FLUTUA a partir do acumulado.
 * Se os passos não encaixarem, a ponte vira um gráfico de barras e o olho deixa de ver a conta
 * andando. O caso do encaixe percorre as quinze e confere que cada subtotal é exatamente onde os
 * passos anteriores o deixaram.
 *
 * ⚠ O ANO DE LUCRO NEGATIVO É CASO PRÓPRIO, com os números medidos no SR civil 2025 (lucro
 * −3.496.515,22): é ele que exercita o `chao < 0`, o eixo negativo e a barra final abaixo do zero.
 * Sem ele, uma escala que ignorasse o negativo passaria verde em todo o resto.
 */
import { describe, it, expect } from 'vitest';
import { montarBarras } from '@/components/agri/PecCascataView';
import type { ColunaPec } from '@/components/agri/drePecRegua';
import type { DrePecLinhas } from '@/hooks/useDrePecuaria';

/** Os números medidos no SR civil 2021, cliente inteiro, realizado. */
const SR2021 = {
  receita_bruta: 4016637.80, deducoes: 37500.27, receita_liquida: 3979137.53,
  vpb_operacional: 1024679.71, reposicao: 0, vbp: 5003817.24,
  custo_variavel: 1241228.54, margem: 3762588.70,
  custo_fixo: 1086047.33, rateio_adm: 153571.94, resultado_operacional: 2522969.43,
  juros: 311733.73, resultado_periodo: 2211235.70,
  efeito_mercado: 2583931.57, resultado_com_mercado: 4795167.27,
  investimento: 1636432.30, lucro_liquido: 3158734.97,
};
/** SR civil 2025 — o ano de prejuízo. */
const SR2025 = {
  receita_bruta: 8504803.42, deducoes: 88486.51, receita_liquida: 8416316.91,
  vpb_operacional: -654320.51, reposicao: 0, vbp: 7761996.40,
  custo_variavel: 4324624.13, margem: 3437372.27,
  custo_fixo: 1671414.19, rateio_adm: 271913.90, resultado_operacional: 1494044.18,
  juros: 528312.95, resultado_periodo: 965731.23,
  efeito_mercado: 11794.20, resultado_com_mercado: 977525.43,
  investimento: 4474040.65, lucro_liquido: -3496515.22,
};

const coluna = (v: Record<string, number>): ColunaPec => ({
  chave: 'c', nome: 'jan – dez', sub: '', fazendaId: null, total: true, tipo: 'valor',
  unidade: null, de: '2021-01', ate: '2021-12', cenario: 'realizado', meses: 12, atual: true,
  linhas: {
    ...v,
    juros_proprio: 0, juros_rateado: 0, juros_nao_rateado: 0, a_pagar: 0,
    vendas: 0, outras_receitas: 0,
    patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 0 },
    p0_fonte: null, p1_fonte: null,
    producao: { ha_medio: 0, at_produzida: 0, at_desfrutada: 0, cab_desfrutada: 0,
      at_comprada: 0, cab_comprada: 0 },
    centros: [], centros_juros: [],
  } as unknown as DrePecLinhas,
});

describe('montarBarras — a lei do gráfico da cascata', () => {
  it('desenha as catorze linhas do Resumido, terminando no investimento', () => {
    const g = montarBarras(coluna(SR2021))!;
    /* ⚠ CATORZE DESDE O DRE-DESTAQUE-01: o lucro líquido saiu da cascata. */
    expect(g.barras).toHaveLength(14);
    expect(g.barras[0].chave).toBe('receita_bruta');
    expect(g.barras.some(b => b.chave === 'lucro_liquido')).toBe(false);
    /* A última é o investimento, e ele é INFORMATIVO: desenha, não soma. */
    expect(g.barras[13].chave).toBe('investimento');
    expect(g.barras[13].informativa).toBe(true);
    expect(g.barras[13].subtotal).toBe(false);
    expect(g.barras[13].cor).toBe('#8A8880');
    /* ⚠ E OS DOIS QUE FECHAM BLOCO SAEM EM 500 — o resto, não. Sem isto o olho perde onde a
       cascata dobra de assunto. O segundo passou a ser o resultado com mercado. */
    expect(g.barras.filter(b => b.forte).map(b => b.chave))
      .toEqual(['resultado_operacional', 'resultado_com_mercado']);
  });

  /**
   * ⚠ O INVESTIMENTO NÃO PODE MOVER O ACUMULADO, e este caso existe para provar o ESTRAGO de
   * voltar atrás: com ele somando, a cascata do SR 2021 fecharia em 3.158.734,97 (o antigo lucro
   * líquido) em vez de 4.795.167,27. São 1,6 milhão de diferença numa barra que o olho lê como
   * o fim da conta.
   */
  it('o investimento desenha a partir do acumulado mas NÃO entra nele', () => {
    const g = montarBarras(coluna(SR2021))!;
    const inv = g.barras.find(b => b.chave === 'investimento')!;
    const rcm = g.barras.find(b => b.chave === 'resultado_com_mercado')!;
    /* Flutua a partir de onde o resultado com mercado parou — mostra quanto pesaria. */
    expect(Math.max(inv.de, inv.ate)).toBeCloseTo(rcm.valor, 2);
    expect(inv.ate - inv.de).toBeCloseTo(SR2021.investimento, 2);
    /* E o número do rodapé é o do resultado com mercado, não o do investimento. */
    expect(g.lucro).toBeCloseTo(SR2021.resultado_com_mercado, 2);
  });

  it('RAZÃO: a altura de cada barra é o módulo do valor dela', () => {
    for (const col of [SR2021, SR2025]) {
      const g = montarBarras(coluna(col))!;
      for (const b of g.barras) {
        expect(b.ate - b.de).toBeCloseTo(Math.abs(b.valor), 2);
      }
    }
  });

  it('ENCAIXE: subtotal sai do zero e cada passo flutua do acumulado', () => {
    const g = montarBarras(coluna(SR2021))!;
    let acc = 0;
    for (const b of g.barras) {
      if (b.subtotal) {
        /* Um subtotal sai do zero, e é ONDE os passos anteriores deixaram o acumulado. */
        expect(Math.min(0, b.valor)).toBeCloseTo(b.de, 2);
        expect(Math.max(0, b.valor)).toBeCloseTo(b.ate, 2);
        expect(acc).toBeCloseTo(b.valor, 2);
        acc = b.valor;
      } else if (b.informativa) {
        /* ⚠ INFORMATIVA FLUTUA E NÃO ANDA: desenha a partir do acumulado e o deixa como estava. */
        const antes = acc, depois = acc + b.valor;
        expect(b.de).toBeCloseTo(Math.min(antes, depois), 2);
        expect(b.ate).toBeCloseTo(Math.max(antes, depois), 2);
      } else {
        /* O passo vai do acumulado ANTES ao acumulado DEPOIS — `de` é o menor dos dois e `ate`, o
           maior. É isso que faz uma barra que desce nascer no topo da anterior. */
        const antes = acc, depois = acc + b.valor;
        expect(b.de).toBeCloseTo(Math.min(antes, depois), 2);
        expect(b.ate).toBeCloseTo(Math.max(antes, depois), 2);
        acc = depois;
      }
    }
    /* ⚠ A CASCATA FECHA NO RESULTADO COM MERCADO — o investimento não a move. */
    expect(acc).toBeCloseTo(SR2021.resultado_com_mercado, 2);
  });

  it('o sinal vem da LINHA do DRE, não do número', () => {
    const g = montarBarras(coluna(SR2021))!;
    const por = (k: string) => g.barras.find(b => b.chave === k)!;
    /* "(−) Deduções" chega positiva da RPC e tem de SUBTRAIR. */
    expect(SR2021.deducoes).toBeGreaterThan(0);
    expect(por('deducoes').valor).toBeCloseTo(-SR2021.deducoes, 2);
    /* "Variação do estoque" é composta e não leva "(−)": entra com o sinal que tem. */
    expect(por('vpb_operacional').valor).toBeCloseTo(SR2021.vpb_operacional - SR2021.reposicao, 2);
    /* "(−) Custo fixo" é composta E subtrai: leva o rateio junto. */
    expect(por('custo_fixo').valor).toBeCloseTo(-(SR2021.custo_fixo + SR2021.rateio_adm), 2);
  });

  it('ano de prejuízo: a escala desce abaixo do zero e o lucro fecha negativo', () => {
    const g = montarBarras(coluna(SR2025))!;
    /* ⚠ O RODAPÉ PASSOU A SER O RESULTADO COM MERCADO (977.525,43), não o lucro líquido. */
    expect(g.lucro).toBeCloseTo(SR2025.resultado_com_mercado, 2);
    /* ⚠ É ISTO QUE LIGA O EIXO NEGATIVO: sem `chao < 0` a linha do zero não é desenhada. */
    expect(g.chao).toBeLessThan(0);
    expect(g.topo).toBeGreaterThan(0);
    /* ⚠ E QUEM DESCE ABAIXO DO ZERO AGORA É O INVESTIMENTO, não o lucro: ele flutua a partir do
       resultado com mercado (977.525,43) e desce 4.474.040,65, chegando a -3.496.515,22 — o
       mesmo fundo de antes, por outra barra. O eixo negativo não se perdeu com a linha. */
    const inv = g.barras.find(b => b.chave === 'investimento')!;
    expect(inv.informativa).toBe(true);
    expect(inv.de).toBeCloseTo(-3496515.22, 2);
    expect(inv.ate).toBeCloseTo(SR2025.resultado_com_mercado, 2);

    /* ⚠ E A PROVA DE QUE A BUSCA SABE ACHAR: no ano BOM o chão é zero, então afirmar "chao < 0"
       sozinho passaria verde também numa escala quebrada que sempre descesse. */
    expect(montarBarras(coluna(SR2021))!.chao).toBe(0);
  });
});
