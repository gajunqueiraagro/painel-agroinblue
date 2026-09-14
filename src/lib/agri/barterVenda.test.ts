/**
 * Os testes da venda do grão no barter — PR-AGRI-BARTER-TELA-C.
 *
 * ⚠ OS NÚMEROS SÃO OS DO PROTO, medidos em 13/09/2026 na safra 23/24 de amendoim: 4.040,28 sc
 * até 20 ppb, 3.706,37 sc acima, 603,70 sc de roça, em dez cargas. Testar com números
 * inventados provaria que a função soma; testar com estes prova que ela soma o que a tela vai
 * mostrar — e é este o caso que o briefing manda homologar.
 */
import { describe, it, expect } from 'vitest';
import {
  disponivelPorClasse, calcularEntregas, totaisVenda, deducaoPorAliquota, aliquotaDoValor,
  saldoDoContrato, labelDaClasse, CLASSES_VENDA, composicaoDasVendas,
} from './barterVenda';

describe('disponivelPorClasse', () => {
  it('separa pelas faixas de aflatoxina e mantém a roça fora das duas', () => {
    const d = disponivelPorClasse([
      { aflatoxina_ppb: 8, sacas_boas: 1000, grao_roca_sacas: 100 },
      { aflatoxina_ppb: 20, sacas_boas: 500, grao_roca_sacas: null },
      { aflatoxina_ppb: 21, sacas_boas: 300, grao_roca_sacas: 3.7 },
      { aflatoxina_ppb: null, sacas_boas: 50, grao_roca_sacas: null },
    ]);
    /* 20 ppb é o LIMITE e entra em "até": a cooperativa paga o lote bom até 20 inclusive. */
    expect(d.ate_20).toBe(1500);
    expect(d.acima_20).toBe(300);
    expect(d.sem_classe).toBe(50);
    /* A roça soma de QUALQUER carga, inclusive das que já contaram na faixa. */
    expect(d.roca).toBe(103.7);
  });

  it('carga sem ppb é pendência, não faixa — e não some', () => {
    const d = disponivelPorClasse([{ aflatoxina_ppb: null, sacas_boas: 1032, grao_roca_sacas: null }]);
    expect(d.sem_classe).toBe(1032);
    expect(d.ate_20).toBe(0);
    expect(d.acima_20).toBe(0);
  });

  it('lista vazia dá zero em todas as classes, nunca NaN', () => {
    const d = disponivelPorClasse([]);
    expect(d).toEqual({ ate_20: 0, acima_20: 0, roca: 0, sem_classe: 0 });
  });
});

describe('calcularEntregas — o caso da homologação', () => {
  const disp = { ate_20: 4040.28, acima_20: 3706.37, roca: 603.7, sem_classe: 0 };

  it('4.040,28 sc a R$ 90 + 3.706,37 sc a R$ 80 fecha o bruto', () => {
    const e = calcularEntregas([
      { classe: 'ate_20', sacas: '4.040,28', precoSaca: '90' },
      { classe: 'acima_20', sacas: '3.706,37', precoSaca: '80' },
    ], disp);
    expect(e[0].valor).toBe(363625.2);
    expect(e[1].valor).toBe(296509.6);
    expect(totaisVenda(e, 0).bruto).toBe(660134.8);
    expect(e.some(l => l.excede)).toBe(false);
  });

  it('o ponto é MILHAR, não decimal — "4.040,28" são quatro mil sacas', () => {
    const [l] = calcularEntregas([{ classe: 'ate_20', sacas: '4.040,28', precoSaca: '1' }], disp);
    expect(l.sacas).toBe(4040.28);
  });

  it('avisa quando vende mais do que a safra colheu, sem bloquear', () => {
    const [l] = calcularEntregas([{ classe: 'ate_20', sacas: '5.000', precoSaca: '90' }], disp);
    expect(l.excede).toBe(true);
    /* Avisar não é recusar: o valor continua calculado. */
    expect(l.valor).toBe(450000);
  });

  it('meia saca de diferença não é excesso — é arredondamento de romaneio', () => {
    const [l] = calcularEntregas([{ classe: 'ate_20', sacas: '4.040,7', precoSaca: '90' }], disp);
    expect(l.excede).toBe(false);
  });

  it('campo vazio vale zero, não NaN', () => {
    const [l] = calcularEntregas([{ classe: 'ate_20', sacas: '', precoSaca: '' }], disp);
    expect(l.sacas).toBe(0);
    expect(l.valor).toBe(0);
  });

  it('classe fora da lista não tem disponível — e por isso qualquer venda excede', () => {
    const [l] = calcularEntregas([{ classe: 'inventada', sacas: '1', precoSaca: '10' }], disp);
    expect(l.disponivel).toBe(0);
    expect(l.excede).toBe(true);
  });
});

describe('totaisVenda', () => {
  const entregas = calcularEntregas(
    [{ classe: 'ate_20', sacas: '1000', precoSaca: '100' }],
    { ate_20: 5000, acima_20: 0, roca: 0, sem_classe: 0 },
  );

  it('a dedução reduz o líquido e o bruto fica intacto', () => {
    const t = totaisVenda(entregas, 1500);
    expect(t.bruto).toBe(100000);
    expect(t.deducoes).toBe(1500);
    expect(t.liquido).toBe(98500);
  });

  it('dedução negativa não vira receita', () => {
    expect(totaisVenda(entregas, -500).liquido).toBe(100000);
  });

  it('conta quantas linhas excedem', () => {
    const e = calcularEntregas([
      { classe: 'ate_20', sacas: '1000', precoSaca: '1' },
      { classe: 'acima_20', sacas: '1', precoSaca: '1' },
    ], { ate_20: 5000, acima_20: 0, roca: 0, sem_classe: 0 });
    expect(totaisVenda(e, 0).excedentes).toBe(1);
  });
});

describe('dedução por alíquota', () => {
  it('1,5% sobre o bruto', () => {
    expect(deducaoPorAliquota(660134.8, 1.5)).toBe(9902.02);
    expect(deducaoPorAliquota(0, 1.5)).toBe(0);
  });

  /* ⚠ A ALÍQUOTA MUDOU DE VERDADE — subiu para 1,7%. É o caso que motivou torná-la editável. */
  it('1,7% sobre o mesmo bruto dá outro número', () => {
    expect(deducaoPorAliquota(660134.8, 1.7)).toBe(11222.29);
  });

  it('alíquota zerada ou inválida não deduz nada', () => {
    expect(deducaoPorAliquota(1000, 0)).toBe(0);
    expect(deducaoPorAliquota(1000, -1)).toBe(0);
    expect(deducaoPorAliquota(1000, NaN)).toBe(0);
  });

  /* ⚠ O CAMINHO INVERSO tem de fechar com o de ida, senão a % exibida mente sobre o valor. */
  it('a alíquota de um valor é o inverso do cálculo', () => {
    expect(aliquotaDoValor(660134.8, 9902.02)).toBe(1.5);
    expect(aliquotaDoValor(660134.8, 11222.29)).toBe(1.7);
  });

  it('sem bruto não há alíquota — e não é divisão por zero', () => {
    expect(aliquotaDoValor(0, 100)).toBe(0);
  });
});

describe('saldoDoContrato', () => {
  it('entregou mais do que recebeu: crédito com o parceiro', () => {
    const r = saldoDoContrato(780000, 390000);
    expect(r.saldo).toBe(390000);
    expect(r.rotulo).toBe('crédito com o parceiro');
  });

  it('só recebeu insumo: deve ao parceiro', () => {
    const r = saldoDoContrato(0, 390000);
    expect(r.saldo).toBe(-390000);
    expect(r.rotulo).toBe('deve ao parceiro');
  });

  it('zero a zero é quitado, não "deve"', () => {
    expect(saldoDoContrato(1000, 1000).rotulo).toBe('quitado');
  });
});

describe('vocabulário das classes', () => {
  it('as quatro classes existem e têm rótulo legível', () => {
    expect(CLASSES_VENDA.map(c => c.valor))
      .toEqual(['ate_20', 'acima_20', 'roca', 'sem_classe']);
    expect(labelDaClasse('ate_20')).toBe('Até 20 ppb');
    expect(labelDaClasse('roca')).toBe('Grão de roça');
  });

  it('classe desconhecida devolve o próprio valor, nunca vazio', () => {
    expect(labelDaClasse('xpto')).toBe('xpto');
    expect(labelDaClasse(null)).toBe('—');
  });
});

describe('composicaoDasVendas — a mesma conta no card e no detalhe', () => {
  /* ⚠ DUAS VENDAS DA MESMA CLASSE A PREÇOS DIFERENTES — é o caso que o preço médio existe para
     responder, e o único em que mostrar "o preço da primeira linha" mentiria. */
  const v1 = {
    valor_bruto: 100000, descontos: 1500,
    entregas: [{ classe_aflatoxina: 'ate_20', sacas: 1000, valor: 100000 }],
  };
  const v2 = {
    valor_bruto: 40000, descontos: 600,
    entregas: [{ classe_aflatoxina: 'ate_20', sacas: 500, valor: 40000 }],
  };

  it('agrupa por classe e devolve o preço MÉDIO PONDERADO, não o da primeira', () => {
    const c = composicaoDasVendas([v1, v2]);
    expect(c.linhas).toHaveLength(1);
    expect(c.linhas[0].sacas).toBe(1500);
    expect(c.linhas[0].valor).toBe(140000);
    /* 140.000 ÷ 1.500 = 93,33 — nem os 100 de uma nem os 80 da outra. */
    expect(c.linhas[0].precoMedio).toBeCloseTo(93.333, 3);
  });

  it('o líquido é bruto menos deduções, derivado e não recebido', () => {
    const c = composicaoDasVendas([v1, v2]);
    expect(c.bruto).toBe(140000);
    expect(c.deducoes).toBe(2100);
    expect(c.liquido).toBe(137900);
  });

  /* ⚠ É O MESMO CÁLCULO NOS DOIS LEITORES, e este teste é o que trava isso: a composição de UMA
     venda tem de ser exatamente o que a do contrato mostraria se só ela existisse. */
  it('uma venda só devolve o que o card mostraria se ela fosse a única', () => {
    const so = composicaoDasVendas([v1]);
    expect(so.sacas).toBe(1000);
    expect(so.liquido).toBe(98500);
    expect(so.linhas[0].precoMedio).toBe(100);
  });

  it('classes diferentes saem ordenadas por valor, da maior para a menor', () => {
    const c = composicaoDasVendas([{
      valor_bruto: 0, descontos: 0,
      entregas: [
        { classe_aflatoxina: 'roca', sacas: 100, valor: 8000 },
        { classe_aflatoxina: 'ate_20', sacas: 1000, valor: 90000 },
      ],
    }]);
    expect(c.linhas.map(l => l.classe)).toEqual(['ate_20', 'roca']);
  });

  /* ⚠ SEM ENTREGA NÃO É ERRO: uma venda pode existir antes de as classes serem lançadas, e a
     tabela tem de dizer "nada ainda" em vez de estourar numa divisão por zero. */
  it('sem entregas não vira NaN', () => {
    const c = composicaoDasVendas([{ valor_bruto: 0, descontos: 0, entregas: [] }]);
    expect(c.linhas).toEqual([]);
    expect(c.sacas).toBe(0);
    expect(c.liquido).toBe(0);
  });

  it('classe nula vira um nó próprio, não some da conta', () => {
    const c = composicaoDasVendas([{
      valor_bruto: 500, descontos: 0,
      entregas: [{ classe_aflatoxina: null, sacas: 10, valor: 500 }],
    }]);
    expect(c.linhas[0].classe).toBe('—');
    expect(c.sacas).toBe(10);
  });
});
