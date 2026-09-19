/**
 * O saldo em caixa — âncora conciliada + roll-forward (PR-CPR-2A.1).
 *
 * ⚠ OS NÚMEROS SÃO OS DA VERA EM 19/09/2026, medidos no proto, não inventados: é o caso que
 * originou o PR (o card mostrava R$ 462.109,65, um saldo que nunca existiu em dia nenhum) e é
 * contra ele que a regra tem de fechar em R$ 198.299,74.
 */
import { describe, it, expect } from 'vitest';
import {
  ancoraDaConta, estimarSaldoDaConta, estimarSaldoEmCaixa, posicaoDoSaldo,
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
    { id: ITAU, nome: 'Itaú Personalite' },
    { id: CDI, nome: 'Itaú CDI' },
    { id: BTG, nome: 'BTG Corretora' },
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

  it('o elo fraco é a posição mais atrasada, e nomeia as contas presas nela', () => {
    const r = estimarSaldoEmCaixa({ contas, saldos, linhas, hoje: HOJE, mesMinimo: JANELA });
    expect(r.ancoraMaisAtrasada).toBe('2026-08-31');
    expect(r.contasNoEloFraco.sort()).toEqual(['BTG Corretora', 'Itaú CDI']);
  });

  it('conta sem âncora fica FORA do total e é nomeada', () => {
    const comOrfa = [...contas, { id: 'orfa', nome: 'Conta Órfã' }];
    const r = estimarSaldoEmCaixa({ contas: comOrfa, saldos, linhas, hoje: HOJE, mesMinimo: JANELA });
    expect(r.total).toBe(198299.74);
    expect(r.semAncora).toEqual(['Conta Órfã']);
    expect(r.ancoradas).toBe(3);
  });
});
