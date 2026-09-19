/**
 * O espelho do `guard_zoo_financeiro_cancelamento_realizado`.
 *
 * ⚠ OS CASOS SÃO OS RAMOS DO TRIGGER, um a um: se o guard mudar no banco e este arquivo não
 * mudar junto, é aqui que a divergência aparece — não numa tela que oferece um botão e leva
 * P0001 na cara do operador.
 */
import { describe, it, expect } from 'vitest';
import {
  bloqueiaCancelamentoPeloFinanceiro, type LinhaCancelavel,
} from './cancelamentoLancamento';

const base: LinhaCancelavel = {
  movimentacao_rebanho_id: null,
  conciliado_em: null,
  status_transacao: 'previsto',
  sem_movimentacao_caixa: false,
};
const com = (p: Partial<LinhaCancelavel>): LinhaCancelavel => ({ ...base, ...p });

describe('bloqueiaCancelamentoPeloFinanceiro', () => {
  it('sem origem de rebanho NUNCA bloqueia, qualquer que seja o status', () => {
    for (const s of ['previsto', 'programado', 'agendado', 'realizado']) {
      expect(bloqueiaCancelamentoPeloFinanceiro(com({ status_transacao: s }))).toBe(false);
    }
    expect(bloqueiaCancelamentoPeloFinanceiro(
      com({ conciliado_em: '2026-09-01T00:00:00Z' }))).toBe(false);
  });

  it('origem de rebanho CONCILIADO bloqueia, mesmo previsto', () => {
    expect(bloqueiaCancelamentoPeloFinanceiro(com({
      movimentacao_rebanho_id: 'mov-1', conciliado_em: '2026-09-01T00:00:00Z',
      status_transacao: 'previsto',
    }))).toBe(true);
  });

  it('origem de rebanho realizado ou agendado bloqueia', () => {
    expect(bloqueiaCancelamentoPeloFinanceiro(com({
      movimentacao_rebanho_id: 'mov-1', status_transacao: 'realizado' }))).toBe(true);
    expect(bloqueiaCancelamentoPeloFinanceiro(com({
      movimentacao_rebanho_id: 'mov-1', status_transacao: 'agendado' }))).toBe(true);
  });

  it('origem de rebanho previsto ou programado NÃO bloqueia', () => {
    expect(bloqueiaCancelamentoPeloFinanceiro(com({
      movimentacao_rebanho_id: 'mov-1', status_transacao: 'previsto' }))).toBe(false);
    expect(bloqueiaCancelamentoPeloFinanceiro(com({
      movimentacao_rebanho_id: 'mov-1', status_transacao: 'programado' }))).toBe(false);
  });

  it('`sem_movimentacao_caixa` verdadeiro libera o realizado de rebanho', () => {
    expect(bloqueiaCancelamentoPeloFinanceiro(com({
      movimentacao_rebanho_id: 'mov-1', status_transacao: 'realizado',
      sem_movimentacao_caixa: true,
    }))).toBe(false);
  });

  /**
   * ⚠ O CASO QUE JUSTIFICA O ARQUIVO. No SQL `NULL IS NOT TRUE` é VERDADEIRO, então coluna
   * nula BLOQUEIA. Traduzir o guard para `=== false` deixaria estas linhas passarem pela tela
   * e baterem no servidor — o defeito clássico de espelhar um guard.
   */
  it('`sem_movimentacao_caixa` NULO ou ausente bloqueia, como o `IS NOT TRUE` do SQL', () => {
    expect(bloqueiaCancelamentoPeloFinanceiro(com({
      movimentacao_rebanho_id: 'mov-1', status_transacao: 'realizado',
      sem_movimentacao_caixa: null,
    }))).toBe(true);
    expect(bloqueiaCancelamentoPeloFinanceiro({
      movimentacao_rebanho_id: 'mov-1', conciliado_em: null, status_transacao: 'realizado',
    })).toBe(true);
  });

  it('status em caixa alta não escapa do guard', () => {
    expect(bloqueiaCancelamentoPeloFinanceiro(com({
      movimentacao_rebanho_id: 'mov-1', status_transacao: 'REALIZADO' }))).toBe(true);
  });
});
