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
  grupoDoTipoConta, posicaoDoSaldo,
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
