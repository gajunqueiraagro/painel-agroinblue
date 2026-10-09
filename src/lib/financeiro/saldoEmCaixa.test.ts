/**
 * O saldo em caixa — âncora conciliada + roll-forward (PR-CPR-2A.1).
 *
 * ⚠ OS NÚMEROS SÃO OS DA VERA EM 19/09/2026, medidos no proto, não inventados: é o caso que
 * originou o PR (o card mostrava R$ 462.109,65, um saldo que nunca existiu em dia nenhum) e é
 * contra ele que a regra tem de fechar em R$ 198.299,74.
 */
import { describe, it, expect } from 'vitest';
import {
  ancoraDaConta, ancoraSemExtrato, contaSemExtrato, estimarSaldoDaConta, estimarSaldoEmCaixa,
  grupoDoTipoConta, posicaoDoSaldo, serieDoSaldoPassado, saldoDaContaNaData, realizadoDoCaixa, contasComRealizadoNoPeriodo,
  type SaldoMesConta,
} from './saldoEmCaixa';
import type { LinhaDaPosicao } from '@/hooks/useExtratoDaConta';

const ITAU = 'itau-personalite';
const CDI = 'itau-cdi';
const BTG = 'btg';

const HOJE = '2026-09-19';
const JANELA = '2026-04';

/** Saída na conta (valor positivo + sinal −1, como o banco grava). */
const saida = (conta: string, data: string, valor: number): LinhaDaPosicao => ({
  valor, sinal: -1, tipo_operacao: '2-Saídas', data_pagamento: data,
  conta_bancaria_id: conta, conta_destino_id: null,
});
const entrada = (conta: string, data: string, valor: number): LinhaDaPosicao => ({
  valor, sinal: 1, tipo_operacao: '1-Entradas', data_pagamento: data,
  conta_bancaria_id: conta, conta_destino_id: null,
});

const saldo = (
  conta: string, anoMes: string, ini: number, fim: number, data: string | null = null,
): SaldoMesConta => ({
  conta_bancaria_id: conta, ano_mes: anoMes, saldo_inicial: ini, saldo_final: fim, saldo_data: data,
});

describe('posicaoDoSaldo', () => {
  it('sem saldo_data a posição é o fim do mês', () => {
    expect(posicaoDoSaldo(saldo(ITAU, '2026-08', 0, 0))).toBe('2026-08-31');
    expect(posicaoDoSaldo(saldo(ITAU, '2026-02', 0, 0))).toBe('2026-02-28');
  });
  it('saldo_data declarado manda sobre o fim do mês', () => {
    expect(posicaoDoSaldo(saldo(ITAU, '2026-09', 0, 0, '2026-09-17'))).toBe('2026-09-17');
  });
});

describe('ancoraDaConta', () => {
  it('escolhe o mês mais recente que FECHA, pulando o que não fecha', () => {
    const saldos = [
      saldo(CDI, '2026-07', 100, 150),
      saldo(CDI, '2026-08', 150, 999),   // não fecha: 150 + 50 = 200, não 999
    ];
    const linhas = [entrada(CDI, '2026-07-10', 50), entrada(CDI, '2026-08-10', 50)];
    expect(ancoraDaConta(CDI, saldos, linhas, JANELA))
      .toEqual({ contaId: CDI, anoMes: '2026-07', data: '2026-07-31', valor: 150 });
  });

  /**
   * ⚠ ESTE É O CASO QUE JUSTIFICA O ARQUIVO. Somando o mês INTEIRO o Itaú de setembro não
   * fecha (dif 58.809,06) e a âncora mais recente seria descartada; somando até a posição
   * declarada de 17/09 a diferença é zero.
   */
  it('a posição declarada define até onde somar — setembro FECHA em 17/09', () => {
    const saldos = [saldo(ITAU, '2026-09', 30943.91, 155746.78, '2026-09-17')];
    const linhas = [
      entrada(ITAU, '2026-09-05', 124802.87),   // fecha a posição de 17/09
      saida(ITAU, '2026-09-18', 58809.06),      // depois da posição: NÃO conta para o teste
    ];
    expect(ancoraDaConta(ITAU, saldos, linhas, JANELA)?.data).toBe('2026-09-17');
    expect(ancoraDaConta(ITAU, saldos, linhas, JANELA)?.valor).toBe(155746.78);
  });

  it('devolve null quando nenhum mês da janela fecha', () => {
    const saldos = [saldo(BTG, '2026-08', 0, 500)];
    expect(ancoraDaConta(BTG, saldos, [], JANELA)).toBeNull();
  });

  it('ignora meses anteriores à janela', () => {
    const saldos = [saldo(BTG, '2026-01', 0, 0)];
    expect(ancoraDaConta(BTG, saldos, [], JANELA)).toBeNull();
  });

  it('linha sem data de pagamento não entra na conferência', () => {
    const saldos = [saldo(BTG, '2026-08', 100, 100)];
    const semData: LinhaDaPosicao = {
      valor: 9999, sinal: -1, tipo_operacao: '2-Saídas', data_pagamento: null,
      conta_bancaria_id: BTG, conta_destino_id: null,
    };
    expect(ancoraDaConta(BTG, saldos, [semData], JANELA)?.valor).toBe(100);
  });
});

describe('estimarSaldoDaConta', () => {
  /**
   * ⚠ O INVARIANTE DO ROLL-FORWARD: partir de 31/08 e somar setembro inteiro tem de dar o
   * MESMO que partir de 17/09 e somar o que veio depois. Se divergir, a cadeia de saldos está
   * quebrada — e foi essa convergência que provou, no proto, que a regra estava certa.
   */
  it('a âncora de agosto e a de 17/09 chegam ao mesmo saldo de hoje', () => {
    const linhas = [
      entrada(ITAU, '2026-09-05', 124802.87),
      saida(ITAU, '2026-09-18', 58809.06),
    ];
    const porAgosto = estimarSaldoDaConta(
      { contaId: ITAU, anoMes: '2026-08', data: '2026-08-31', valor: 30943.91 }, linhas, HOJE);
    const porSetembro = estimarSaldoDaConta(
      { contaId: ITAU, anoMes: '2026-09', data: '2026-09-17', valor: 155746.78 }, linhas, HOJE);
    expect(porAgosto).toBe(96937.72);
    expect(porSetembro).toBe(96937.72);
  });

  it('não soma o que é posterior a hoje', () => {
    const linhas = [saida(ITAU, '2026-09-30', 1000)];
    expect(estimarSaldoDaConta(
      { contaId: ITAU, anoMes: '2026-08', data: '2026-08-31', valor: 500 }, linhas, HOJE)).toBe(500);
  });

  it('não soma o que é anterior ou igual à âncora — nada é recontado', () => {
    const linhas = [saida(ITAU, '2026-08-31', 1000), saida(ITAU, '2026-08-01', 1000)];
    expect(estimarSaldoDaConta(
      { contaId: ITAU, anoMes: '2026-08', data: '2026-08-31', valor: 500 }, linhas, HOJE)).toBe(500);
  });

  it('a perna de destino de uma transferência entra positiva', () => {
    const transf: LinhaDaPosicao = {
      valor: 200, sinal: -1, tipo_operacao: '3-Transferências', data_pagamento: '2026-09-10',
      conta_bancaria_id: CDI, conta_destino_id: ITAU,
    };
    expect(estimarSaldoDaConta(
      { contaId: ITAU, anoMes: '2026-08', data: '2026-08-31', valor: 0 }, [transf], HOJE)).toBe(200);
    expect(estimarSaldoDaConta(
      { contaId: CDI, anoMes: '2026-08', data: '2026-08-31', valor: 0 }, [transf], HOJE)).toBe(-200);
  });
});

describe('estimarSaldoEmCaixa — o caso da Vera em 19/09/2026', () => {
  const contas = [
    { id: ITAU, nome: 'Itaú Personalite', tipo: 'cc' },
    { id: CDI, nome: 'Itaú CDI', tipo: 'inv' },
    { id: BTG, nome: 'BTG Corretora', tipo: 'cc' },
  ];
  const saldos = [
    saldo(ITAU, '2026-08', 208561.46, 30943.91, '2026-08-31'),
    saldo(ITAU, '2026-09', 30943.91, 155746.78, '2026-09-17'),
    saldo(CDI, '2026-08', 301905.93, 305208.79, '2026-08-31'),
    saldo(BTG, '2026-08', 1154.08, 1154.08),
  ];
  const linhas = [
    saida(ITAU, '2026-08-15', 177617.55),
    entrada(ITAU, '2026-09-05', 124802.87),
    saida(ITAU, '2026-09-18', 58809.06),
    entrada(CDI, '2026-08-15', 3302.86),
    saida(CDI, '2026-09-10', 205000.85),
  ];

  it('soma 198.299,74 — e NÃO os 462.109,65 do maior ano_mes de cada conta', () => {
    const r = estimarSaldoEmCaixa({ contas, saldos, linhas, hoje: HOJE, mesMinimo: JANELA });
    expect(r.total).toBe(198299.74);
    expect(r.total).not.toBe(462109.65);
    expect(r.ancoradas).toBe(3);
    expect(r.semAncora).toEqual([]);
  });

  it('quebra em disponível (cc) e aplicado (inv) — e os dois somam o total', () => {
    const r = estimarSaldoEmCaixa({ contas, saldos, linhas, hoje: HOJE, mesMinimo: JANELA });
    expect(r.disponivel).toBe(98091.80);   // Itaú Personalite 96.937,72 + BTG 1.154,08
    expect(r.aplicado).toBe(100207.94);    // Itaú CDI
    expect(r.disponivel + r.aplicado).toBe(r.total);
  });

  it('o elo fraco é a posição mais atrasada, e nomeia as contas presas nela', () => {
    const r = estimarSaldoEmCaixa({ contas, saldos, linhas, hoje: HOJE, mesMinimo: JANELA });
    expect(r.ancoraMaisAtrasada).toBe('2026-08-31');
    expect(r.contasNoEloFraco.sort()).toEqual(['BTG Corretora', 'Itaú CDI']);
  });

  it('conta sem âncora fica FORA do total e é nomeada', () => {
    const comOrfa = [...contas, { id: 'orfa', nome: 'Conta Órfã', tipo: 'cc' }];
    const r = estimarSaldoEmCaixa({ contas: comOrfa, saldos, linhas, hoje: HOJE, mesMinimo: JANELA });
    expect(r.total).toBe(198299.74);
    expect(r.semAncora).toEqual(['Conta Órfã']);
    expect(r.ancoradas).toBe(3);
  });
});

describe('grupoDoTipoConta', () => {
  it('corrente é disponível; investimento e permuta são aplicado; cartão fica fora', () => {
    expect(grupoDoTipoConta('cc')).toBe('disponivel');
    expect(grupoDoTipoConta('inv')).toBe('aplicado');
    expect(grupoDoTipoConta('permuta')).toBe('aplicado');
    expect(grupoDoTipoConta('cartao')).toBe('fora');
  });
  /**
   * ⚠ O CASO QUE PROTEGE O NÚMERO: tipo desconhecido (ou nulo) NÃO entra no caixa. É a mesma
   * doutrina da lista branca da 2A.1 — um tipo novo que entrasse sozinho, em silêncio, inflaria
   * um número que decide pagamento.
   */
  it('tipo desconhecido ou nulo fica FORA, nunca no caixa por omissão', () => {
    expect(grupoDoTipoConta('cripto')).toBe('fora');
    expect(grupoDoTipoConta(null)).toBe('fora');
    expect(grupoDoTipoConta(undefined)).toBe('fora');
    expect(grupoDoTipoConta('')).toBe('fora');
  });
  it('só a permuta é conta sem extrato', () => {
    expect(contaSemExtrato('permuta')).toBe(true);
    expect(contaSemExtrato('cc')).toBe(false);
    expect(contaSemExtrato('inv')).toBe(false);
  });
});

describe('ancoraSemExtrato', () => {
  const PERM = 'permuta-nj';
  /**
   * ⚠ ESTE É O CASO QUE A 2A.1 ERRAVA. Onde não há banco não há extrato a bater, e exigir que o
   * mês "feche" descartava a conta inteira. O declarado vale como âncora por si.
   */
  it('aceita o último saldo declarado SEM exigir que o mês feche', () => {
    const saldos = [saldo(PERM, '2026-08', 0, 500)];   // 0 + nada ≠ 500: não "fecha"
    expect(ancoraDaConta(PERM, saldos, [], JANELA)).toBeNull();
    expect(ancoraSemExtrato(PERM, saldos))
      .toEqual({ contaId: PERM, anoMes: '2026-08', data: '2026-08-31', valor: 500 });
  });
  it('pega o mês mais recente quando há vários', () => {
    const saldos = [saldo(PERM, '2026-06', 0, 10), saldo(PERM, '2026-08', 0, 99)];
    expect(ancoraSemExtrato(PERM, saldos)?.valor).toBe(99);
  });
  it('sem saldo declarado nenhum devolve null — a conta é nomeada, nunca chutada', () => {
    expect(ancoraSemExtrato(PERM, [])).toBeNull();
  });
});

describe('permuta — o caso do NJ em 19/09/2026', () => {
  const PERM = 'permuta-parapua';
  const CC = 'sicredi-lavoura';
  const contas = [
    { id: CC, nome: 'Sicredi Lavoura', tipo: 'cc' },
    { id: 'cartao-bb', nome: 'Cartão BB', tipo: 'cartao' },
    /* O acumulado real: 69 lançamentos de barter entre set/2023 e mar/2026. */
    { id: PERM, nome: 'Permuta · Cooperativa', tipo: 'permuta', acumuladoRealizados: 264875.89 },
  ];
  const saldos = [
    saldo(CC, '2026-08', 30150.70, 30150.70),   // fecha: sem movimento no mês
    saldo(PERM, '2026-08', 0, 0, '2026-08-31'),
    saldo('cartao-bb', '2026-08', 0, 999999),
  ];

  it('a permuta ENTRA no aplicado — não some mais, como somia na 2A.1', () => {
    const r = estimarSaldoEmCaixa({ contas, saldos, linhas: [], hoje: HOJE, mesMinimo: JANELA });
    expect(r.ancoradas).toBe(2);              // corrente + permuta; o cartão nem é avaliado
    expect(r.semAncora).toEqual([]);
    expect(r.disponivel).toBe(30150.70);
    expect(r.aplicado).toBe(0);
  });

  it('o cartão fica FORA do total, com saldo alto e tudo', () => {
    const r = estimarSaldoEmCaixa({ contas, saldos, linhas: [], hoje: HOJE, mesMinimo: JANELA });
    expect(r.total).toBe(30150.70);
    expect(r.total).not.toBe(1030150.70);
  });

  /**
   * ⚠ O CASO QUE JUSTIFICA A NOTA ÂMBAR. O declarado de ago/2026 é R$ 0,00 e a conta carrega
   * R$ 264.875,89 de movimentos que esse zero não explica. O total usa o DECLARADO — inventar
   * outro número aqui criaria uma segunda verdade ao lado da tela de Saldos —, mas a
   * divergência para de ser invisível.
   */
  it('declarado que não explica os movimentos acende "a conferir", sem mexer no total', () => {
    const r = estimarSaldoEmCaixa({ contas, saldos, linhas: [], hoje: HOJE, mesMinimo: JANELA });
    expect(r.aConferir).toEqual(['Permuta · Cooperativa']);
    expect(r.total).toBe(30150.70);
  });

  it('permuta coerente com os movimentos NÃO acende nada', () => {
    const coerente = contas.map((c) => c.id === PERM ? { ...c, acumuladoRealizados: 0 } : c);
    const r = estimarSaldoEmCaixa({
      contas: coerente, saldos, linhas: [], hoje: HOJE, mesMinimo: JANELA });
    expect(r.aConferir).toEqual([]);
  });

  /** ⚠ Negativo é erro de lançamento, nunca estado válido — e aparece, nunca é zerado. */
  it('permuta negativa aparece no total e acende "a conferir"', () => {
    const negativa = [saldo(CC, '2026-08', 30150.70, 30150.70), saldo(PERM, '2026-08', 0, -800)];
    const r = estimarSaldoEmCaixa({
      contas, saldos: negativa, linhas: [], hoje: HOJE, mesMinimo: JANELA });
    expect(r.aplicado).toBe(-800);
    expect(r.total).toBe(29350.70);
    expect(r.aConferir).toEqual(['Permuta · Cooperativa']);
  });
});

describe('serieDoSaldoPassado — regra fixa de mês — PR-CPR-2B.3.1', () => {
  const contasVera = [
    { id: ITAU, nome: 'Itaú Personalite', tipo: 'cc' },
    { id: CDI, nome: 'Itaú CDI', tipo: 'inv' },
    { id: BTG, nome: 'BTG Corretora', tipo: 'cc' },
    { id: 'cartao', nome: 'Cartão', tipo: 'cartao' },
  ];
  /* Partida = 31/jul somado das contas de caixa; o cartão não entra. */
  const saldosVera = [
    saldo(ITAU, '2026-07', 172615.25, 208561.46, '2026-07-31'),
    saldo(CDI, '2026-07', 311388.14, 301905.93, '2026-07-31'),
    saldo(BTG, '2026-07', 1154.08, 1154.08),
    saldo('cartao', '2026-07', 0, 999999),
  ];
  const linhasVera = [
    saida(ITAU, '2026-08-15', 177617.55),
    entrada(CDI, '2026-08-15', 3302.86),
    entrada(ITAU, '2026-09-05', 124802.87),
    saida(ITAU, '2026-09-18', 58809.06),
    saida(CDI, '2026-09-10', 205000.85),
  ];
  const base = {
    contas: contasVera, saldos: saldosVera, linhas: linhasVera, hoje: HOJE,
    conciliadoAte: '2026-08-31',
  };

  it('começa em 01 do mês ANTERIOR, partindo do saldo do mês retrasado', () => {
    const s = serieDoSaldoPassado(base);
    expect(s.pontos[0].data).toBe('2026-08-01');
    expect(s.boundary).toBe('2026-08-31');
    /* 208.561,46 + 301.905,93 + 1.154,08 = 511.621,47 — o cartão fica de fora. */
    expect(s.pontos[0].saldo).toBe(511621.47);
  });

  /**
   * ⚠ O DEFEITO QUE A 2B.3.1 CONSERTA: com a âncora POR CONTA, uma única conta atrasada puxava
   * o gráfico um mês para trás. A regra fixa é a mesma para todo cliente.
   */
  it('o mês retrasado NÃO aparece na série', () => {
    const s = serieDoSaldoPassado(base);
    expect(s.pontos.some((p) => p.data.startsWith('2026-07'))).toBe(false);
  });

  /** ⚠ O passado VIVE: o mês anterior é percorrido dia a dia, não é patamar. */
  it('a linha CAMINHA no mês conciliado, com os realizados do dia', () => {
    const s = serieDoSaldoPassado(base);
    const dia15 = s.pontos.find((p) => p.data === '2026-08-15')!;
    expect(dia15.saidas).toBe(-177617.55);
    expect(dia15.entradas).toBe(3302.86);
    const saldosDeAgosto = new Set(
      s.pontos.filter((p) => p.conciliado).map((p) => p.saldo));
    expect(saldosDeAgosto.size).toBeGreaterThan(1);
  });

  it('o fim do mês anterior é o saldo conciliado somado', () => {
    const s = serieDoSaldoPassado(base);
    const fimAgosto = s.pontos.find((p) => p.data === '2026-08-31')!;
    expect(fimAgosto.conciliado).toBe(true);
    /* 511.621,47 − 177.617,55 + 3.302,86 = 337.306,78 */
    expect(fimAgosto.saldo).toBe(337306.78);
  });

  /**
   * ⚠ O NÚMERO QUE A HOMOLOGAÇÃO CONFERE. Medido no proto em 19/09/2026: a caminhada fixa e o
   * card caem no MESMO valor quando toda conta está conciliada até o fim do mês anterior.
   * Quando não caem, a diferença vira um degrau visível em hoje — que é a denúncia.
   */
  it('chega em hoje no mesmo valor do card, quando a conciliação fecha', () => {
    const s = serieDoSaldoPassado(base);
    const hoje = s.pontos[s.pontos.length - 1];
    expect(hoje.data).toBe(HOJE);
    expect(hoje.saldo).toBe(198299.74);
  });

  it('setembro sem realizado até hoje fica PLANO — o caso do NJ', () => {
    const s = serieDoSaldoPassado({ ...base, linhas: [
      saida(ITAU, '2026-08-15', 177617.55), entrada(CDI, '2026-08-15', 3302.86),
      /* 30/09 é FUTURO: realizado com data adiante não entra na caminhada. */
      saida(ITAU, '2026-09-30', 13750),
    ] });
    const setembro = s.pontos.filter((p) => !p.conciliado);
    expect(new Set(setembro.map((p) => p.saldo)).size).toBe(1);
    expect(setembro[setembro.length - 1].saldo).toBe(337306.78);
  });

  it('cartão e permuta não entram na partida nem nas barras', () => {
    const s = serieDoSaldoPassado({ ...base, linhas: [
      ...linhasVera, saida('cartao', '2026-08-20', 50000),
    ] });
    expect(s.pontos.find((p) => p.data === '2026-08-20')?.saidas).toBe(0);
  });

  it('sem saldo no mês retrasado não há passado a desenhar', () => {
    expect(serieDoSaldoPassado({ ...base, saldos: [] }))
      .toEqual({ pontos: [], boundary: null });
  });
});

describe('a fronteira do verde é dinâmica — PR-CPR-2B.3.2', () => {
  const contas = [{ id: ITAU, nome: 'Itaú', tipo: 'cc' }];
  const saldos = [saldo(ITAU, '2026-07', 0, 1000, '2026-07-31')];
  const base = { contas, saldos, linhas: [], hoje: HOJE, conciliadoAte: '2026-08-31' };

  it('conciliado até o meio do mês: o verde para exatamente ali', () => {
    const s = serieDoSaldoPassado({ ...base, conciliadoAte: '2026-09-17' });
    expect(s.pontos.find((p) => p.data === '2026-09-17')?.conciliado).toBe(true);
    expect(s.pontos.find((p) => p.data === '2026-09-18')?.conciliado).toBe(false);
  });

  /**
   * ⚠ O CASO DO NJ: o elo fraco é 31/jul e o desenho começa em 01/ago — o cliente nasce SEM
   * verde, e isso é a verdade sobre ele, não um defeito de desenho.
   */
  it('conciliado antes do início do desenho: nenhum ponto é verde', () => {
    const s = serieDoSaldoPassado({ ...base, conciliadoAte: '2026-07-31' });
    expect(s.pontos.some((p) => p.conciliado)).toBe(false);
    expect(s.pontos.length).toBeGreaterThan(0);
  });

  it('sem conciliação nenhuma, nada é verde', () => {
    const s = serieDoSaldoPassado({ ...base, conciliadoAte: null });
    expect(s.pontos.some((p) => p.conciliado)).toBe(false);
  });
});

describe('elo fraco por natureza — PR-CPR-SALDO-NATUREZA-01', () => {
  const contas = [
    { id: ITAU, nome: 'Itaú Personalite', tipo: 'cc' },
    { id: BTG, nome: 'BTG Corretora', tipo: 'cc' },
    { id: CDI, nome: 'Itaú CDI', tipo: 'inv' },
  ];
  /**
   * ⚠ CENÁRIO CONSTRUÍDO, NÃO RETRATO DE CLIENTE. Os nomes vêm da Vera por conveniência, mas o
   * que o bloco trava é o INVARIANTE: corrente e investimento podem estar conciliados até datas
   * diferentes, e cada natureza tem de dizer a sua. Aqui a corrente fica em 31/08 e o
   * investimento em 17/09.
   * ⚠ E A VERA JÁ NÃO É ASSIM — em 21/09/2026 as duas naturezas dela estão em 17/09. Amarrar o
   * teste ao estado de um cliente o faria falhar a cada conciliação feita, que é o oposto do
   * que um teste deve fazer: ele guarda a REGRA, não o dia.
   */
  const saldos = [
    saldo(ITAU, '2026-08', 30943.91, 30943.91, '2026-08-31'),   // fecha: sem movimento
    saldo(BTG, '2026-09', 1154.08, 1154.08, '2026-09-17'),
    saldo(CDI, '2026-09', 100207.94, 100207.94, '2026-09-17'),
  ];
  const base = { contas, saldos, linhas: [], hoje: HOJE, mesMinimo: JANELA };

  /**
   * ⚠ O DEFEITO QUE ISTO CONSERTA: uma data só para as duas naturezas fazia o elo fraco de uma
   * explicar o total das duas. Corrente e investimento fecham por relógios diferentes.
   */
  it('cada natureza tem o seu elo fraco, e eles podem divergir', () => {
    const r = estimarSaldoEmCaixa(base);
    expect(r.conciliadoCorrenteAte).toBe('2026-08-31');
    expect(r.conciliadoAplicadoAte).toBe('2026-09-17');
    /* O elo fraco geral continua existindo — é ele que o Fluxo usa. */
    expect(r.ancoraMaisAtrasada).toBe('2026-08-31');
  });

  it('as somas por natureza fecham no total', () => {
    const r = estimarSaldoEmCaixa(base);
    expect(r.disponivel).toBe(32097.99);
    expect(r.aplicado).toBe(100207.94);
    expect(r.disponivel + r.aplicado).toBe(r.total);
  });

  it('conta as contas de cada natureza — a linha some quando é zero', () => {
    const r = estimarSaldoEmCaixa(base);
    expect(r.contasCorrente).toBe(2);
    expect(r.contasAplicado).toBe(1);
  });

  it('cliente sem investimento: o lado aplicado fica nulo e vazio', () => {
    const r = estimarSaldoEmCaixa({ ...base, contas: contas.filter((c) => c.tipo === 'cc') });
    expect(r.conciliadoAplicadoAte).toBeNull();
    expect(r.contasAplicado).toBe(0);
    expect(r.aplicado).toBe(0);
  });

  it('sem conta ancorada, as duas datas são nulas', () => {
    const r = estimarSaldoEmCaixa({ ...base, saldos: [] });
    expect(r.conciliadoCorrenteAte).toBeNull();
    expect(r.conciliadoAplicadoAte).toBeNull();
  });
});

/* CPR-SALDO-DIA-01 — a âncora de cada conta é LIDA do cálculo do cartão (nenhum espelho): o que `ancoraPorConta` diz é a data que
   o saldo de cada conta de fato usou. */
describe('estimarSaldoEmCaixa · ancoraPorConta', () => {
  const MEIO = 'cc-posicao-no-meio', SEM = 'cc-sem-linha-que-concilie', PERMUTA = 'permuta', CARTAO = 'cartao', INV = 'investimento';
  const contas = [
    { id: MEIO, nome: 'Posição no meio', tipo: 'cc', acumuladoRealizados: null },
    { id: SEM, nome: 'Não concilia', tipo: 'cc', acumuladoRealizados: null },
    { id: PERMUTA, nome: 'Permuta', tipo: 'permuta', acumuladoRealizados: 500 },
    { id: CARTAO, nome: 'Cartão', tipo: 'cartao', acumuladoRealizados: null },
    { id: INV, nome: 'Investimento', tipo: 'inv', acumuladoRealizados: null },
  ];
  const saldos = [
    saldo(MEIO, '2026-08', 0, 1000),                       // ago fecha (entrada de 1000)
    saldo(MEIO, '2026-09', 1000, 700, '2026-09-17'),       // set fecha ATÉ 17/09 (saída de 300 em 10/09)
    saldo(SEM, '2026-08', 0, 999),                         // nada explica 999: não concilia em mês nenhum
    saldo(PERMUTA, '2026-08', 0, 500),                     // sem extrato: vale o declarado mais recente
    saldo(CARTAO, '2026-09', 0, 0),
    saldo(INV, '2026-07', 0, 150),                         // jul fecha; ago não tem linha
  ];
  const linhas = [
    entrada(MEIO, '2026-08-05', 1000), saida(MEIO, '2026-09-10', 300), saida(MEIO, '2026-09-18', 50),
    entrada(INV, '2026-07-02', 150),
  ];
  const r = estimarSaldoEmCaixa({ contas, saldos, linhas, hoje: HOJE, mesMinimo: JANELA });
  const mapa = new Map(r.ancoraPorConta.map((a) => [a.contaId, a.data]));

  it('uma entrada por conta que ENTROU na soma, com a data que o cálculo usou', () => {
    expect(r.ancoraPorConta).toHaveLength(r.ancoradas);
    expect(mapa.get(MEIO)).toBe('2026-09-17');             // a posição declarada no meio do mês manda
    expect(mapa.get(PERMUTA)).toBe('2026-08-31');
    expect(mapa.get(INV)).toBe('2026-07-31');
    /* a mesma data que as funções da âncora dão, conta a conta */
    expect(mapa.get(MEIO)).toBe(ancoraDaConta(MEIO, saldos, linhas, JANELA)?.data);
    expect(mapa.get(INV)).toBe(ancoraDaConta(INV, saldos, linhas, JANELA)?.data);
    expect(mapa.get(PERMUTA)).toBe(ancoraSemExtrato(PERMUTA, saldos)?.data);
  });
  it('conta sem linha que concilie e cartão de crédito NÃO têm âncora', () => {
    expect(mapa.has(SEM)).toBe(false);
    expect(mapa.has(CARTAO)).toBe(false);
    expect(r.semAncora).toEqual(['Não concilia']);
  });
  it('o saldo de cada conta parte dessa data: a soma fecha com âncora + o que veio depois', () => {
    /* MEIO 700 − 50 (18/09) = 650; INV 150; PERMUTA 500 */
    expect(r.disponivel).toBe(650);
    expect(r.aplicado).toBe(650);
    expect(r.ancoraMaisAtrasada).toBe(r.ancoraPorConta.map((a) => a.data).sort()[0]);
  });
  it('sem nenhuma conta ancorada a lista é vazia', () => {
    expect(estimarSaldoEmCaixa({ contas: [contas[1], contas[3]], saldos, linhas, hoje: HOJE, mesMinimo: JANELA }).ancoraPorConta).toEqual([]);
  });
});


/* CPR-PDF-ACABAMENTO-01 — o saldo numa data e o realizado do período: o MESMO cálculo do cartão Caixa, respondido em outra data. */
describe('saldoDaContaNaData e realizadoDoCaixa — CPR-PDF-ACABAMENTO-01', () => {
  const A = 'conta-a';
  const B = 'conta-b';
  const HOJE2 = '2026-10-09';
  const contas = [{ id: A, nome: 'Conta A', tipo: 'cc' }, { id: B, nome: 'Conta B', tipo: 'cc' }, { id: 'cartao', nome: 'Cartão', tipo: 'cartao' }];
  /* A conferida em 06/10 (500,00); B conferida em 30/09 (1.000,00) */
  const saldos = [
    saldo(A, '2026-09', 100, 300, '2026-09-30'),
    saldo(A, '2026-10', 300, 500, '2026-10-06'),
    saldo(B, '2026-09', 900, 1000, '2026-09-30'),
  ];
  const transferencia = (de: string, para: string, data: string, valor: number): LinhaDaPosicao => ({
    valor, sinal: -1, tipo_operacao: '3-Transferências', data_pagamento: data, conta_bancaria_id: de, conta_destino_id: para,
  });
  const linhas = [
    entrada(A, '2026-09-10', 250), saida(A, '2026-09-20', 50),         // setembro de A: 100 → 300
    entrada(A, '2026-10-02', 400), saida(A, '2026-10-05', 200),        // até a âncora de A (06/10): 300 → 500
    saida(A, '2026-10-08', 30),                                        // depois da âncora de A
    entrada(B, '2026-09-15', 100),                                     // setembro de B: 900 → 1000
    saida(B, '2026-10-03', 100), entrada(B, '2026-10-07', 10),         // depois da âncora de B
    transferencia(A, B, '2026-10-08', 70),                             // entre contas do caixa: o total não muda
    saida('cartao', '2026-10-04', 999),                                // cartão não entra no caixa
  ];
  const entradaDoCaixa = { contas, saldos, linhas, hoje: HOJE2, mesMinimo: '2026-08' };
  const caixa = estimarSaldoEmCaixa(entradaDoCaixa);
  const ancA = { contaId: A, anoMes: '2026-10', data: '2026-10-06', valor: 500 };

  it('em HOJE é o número do cartão Caixa; para trás desfaz os movimentos; para a frente soma', () => {
    expect(caixa.total).toBe(1380);                                    // A 500 − 30 − 70 = 400; B 1000 − 100 + 10 + 70 = 980
    const a = caixa.ancoraPorConta.find((x) => x.contaId === A);
    expect(a?.data).toBe('2026-10-06');
    expect(saldoDaContaNaData(ancA, linhas, HOJE2)).toBe(400);
    expect(saldoDaContaNaData(ancA, linhas, '2026-10-06')).toBe(500);
    expect(saldoDaContaNaData(ancA, linhas, '2026-10-05')).toBe(500);  // fim do dia 05: a saída do dia já saiu
    expect(saldoDaContaNaData(ancA, linhas, '2026-10-04')).toBe(700);  // desfaz a saída de 05/10
    expect(saldoDaContaNaData(ancA, linhas, '2026-09-30')).toBe(300);  // = o saldo final conferido de setembro
    expect(saldoDaContaNaData(ancA, linhas, '2026-08-31')).toBe(100);  // = o saldo inicial de setembro
  });
  it('contasComRealizadoNoPeriodo: só conta do caixa com movimento no período, até hoje; fora da janela, nenhuma', () => {
    expect(contasComRealizadoNoPeriodo(entradaDoCaixa, '2026-10-01', '2026-10-31').sort()).toEqual([A, B]);   // o cartão moveu e não entra
    expect(contasComRealizadoNoPeriodo(entradaDoCaixa, '2026-10-02', '2026-10-02')).toEqual([A]);
    expect(contasComRealizadoNoPeriodo(entradaDoCaixa, '2026-09-15', '2026-09-15')).toEqual([B]);
    expect(contasComRealizadoNoPeriodo(entradaDoCaixa, '2026-10-06', '2026-10-06')).toEqual([]);              // dia sem movimento
    expect(contasComRealizadoNoPeriodo(entradaDoCaixa, '2026-10-08', '2026-10-08').sort()).toEqual([A, B]);   // as duas pontas da transferência
    expect(contasComRealizadoNoPeriodo({ ...entradaDoCaixa, hoje: '2026-10-04' }, '2026-10-01', '2026-10-31').sort()).toEqual([A, B]);
    expect(contasComRealizadoNoPeriodo({ ...entradaDoCaixa, hoje: '2026-10-02' }, '2026-10-01', '2026-10-31')).toEqual([A]);  // depois de hoje não conta
    expect(contasComRealizadoNoPeriodo(entradaDoCaixa, '2026-07-01', '2026-07-31')).toEqual([]);              // véspera fora da janela
    expect(contasComRealizadoNoPeriodo(entradaDoCaixa, '2026-11-01', '2026-11-30')).toEqual([]);              // período futuro
    /* conta do caixa SEM saldo conferido não entra (a tela não tem realizado para mostrar dela); e fora da janela nada entra,
       mesmo havendo movimento carregado naquele mês */
    const comOutras = { ...entradaDoCaixa, contas: [...contas, { id: 'sem-ancora', nome: 'Sem âncora', tipo: 'cc' }], linhas: [...linhas, saida('sem-ancora', '2026-10-02', 5), saida(A, '2026-07-10', 5)] };
    expect(contasComRealizadoNoPeriodo(comOutras, '2026-10-02', '2026-10-02')).toEqual([A]);
    expect(contasComRealizadoNoPeriodo(comOutras, '2026-07-01', '2026-07-31')).toEqual([]);
  });
  it('realizadoDoCaixa: o Caixa inicial é o fim da véspera, os dias andam até min(até, hoje) e fecham no Caixa de hoje', () => {
    const r = realizadoDoCaixa(entradaDoCaixa, '2026-10-01', '2026-10-31');
    expect(r?.inicial).toEqual({ data: '2026-09-30', saldo: 1300 });
    expect(r?.dias.map((d) => d.data)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(r?.dias.find((d) => d.data === '2026-10-02')).toMatchObject({ entradas: 400, saidas: 0, nEntradas: 1, nSaidas: 0, saldo: 1700 });
    expect(r?.dias.find((d) => d.data === '2026-10-04')).toMatchObject({ entradas: 0, saidas: 0, saldo: 1600 });   // o cartão não entra
    /* a transferência entre contas do caixa aparece dos dois lados do dia e NÃO muda o saldo */
    expect(r?.dias.find((d) => d.data === '2026-10-08')).toMatchObject({ entradas: 70, saidas: 100, saldo: 1380 });
    expect(r?.dias[r.dias.length - 1].saldo).toBe(caixa.total);
    /* a véspera é o dia ANTERIOR: começando em 03/10, o Caixa inicial já tem a entrada de 02/10 e ainda não a saída de 03/10 */
    expect(realizadoDoCaixa(entradaDoCaixa, '2026-10-03', '2026-10-31')?.inicial).toEqual({ data: '2026-10-02', saldo: 1700 });
    /* conciliado até a âncora MAIS ATRASADA (B, 30/09): nenhum dia de outubro */
    expect(caixa.ancoraMaisAtrasada).toBe('2026-09-30');
    expect(r?.dias.some((d) => d.conciliado)).toBe(false);
  });
  it('período inteiro no passado: para em "até"; o último dia é o saldo conferido do mês', () => {
    const r = realizadoDoCaixa(entradaDoCaixa, '2026-09-01', '2026-09-30');
    expect(r?.inicial).toEqual({ data: '2026-08-31', saldo: 1000 });   // A 100 + B 900
    expect(r?.dias.length).toBe(30);
    expect(r?.dias[29]).toMatchObject({ data: '2026-09-30', saldo: 1300, conciliado: true });
  });
  it('uma conta só: lê só a âncora dela', () => {
    const r = realizadoDoCaixa({ ...entradaDoCaixa, contas: contas.filter((c) => c.id === A) }, '2026-10-01', '2026-10-31');
    expect(r?.inicial.saldo).toBe(300);
    expect(r?.dias[r.dias.length - 1].saldo).toBe(400);
    expect(r?.dias.find((d) => d.data === '2026-10-06')?.conciliado).toBe(true);
    expect(r?.dias.find((d) => d.data === '2026-10-07')?.conciliado).toBe(false);
  });
  it('nunca inventa: nulo fora da janela carregada, com início depois de amanhã e sem conta ancorada', () => {
    expect(realizadoDoCaixa(entradaDoCaixa, '2026-08-01', '2026-09-30')).toBeNull();   // a véspera (31/07) é anterior à janela
    expect(realizadoDoCaixa(entradaDoCaixa, '2026-10-11', '2026-10-31')).toBeNull();   // a véspera é depois de hoje
    expect(realizadoDoCaixa(entradaDoCaixa, '2026-10-10', '2026-10-31')).toMatchObject({ inicial: { data: HOJE2, saldo: 1380 }, dias: [] });
    expect(realizadoDoCaixa({ ...entradaDoCaixa, contas: contas.filter((c) => c.id === 'cartao') }, '2026-10-01', '2026-10-31')).toBeNull();
  });
});
