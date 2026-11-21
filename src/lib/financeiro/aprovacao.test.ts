/** BPO-APROVACAO-01 — as regras puras da tela do aprovador (fixture sintética). */
import { describe, expect, it } from 'vitest';
import { lerLinhasDaAprovacao, porDiaDeVencimento, saldosDepoisDosPagamentos, somaDe } from './aprovacao';

const row = (id: string, o: Record<string, unknown> = {}) => ({ lancamento_id: id, rodada: 1, situacao: 'aguardando', valor: -100, vencimento: '2026-11-18',
  conta_bancaria_id: 'itau', conta: 'Itaú 7225', fornecedor: `F ${id}`, status_transacao: 'programado', tem_nota: true, tem_boleto: false, ...o });

describe('aprovação — leitura, dias e saldo depois dos pagamentos', () => {
  it('lê o contrato e larga o que está fora (sem id, situação estranha, valor não numérico)', () => {
    const l = lerLinhasDaAprovacao([row('a'), { lancamento_id: 'b', situacao: 'substituido', valor: 1 }, { situacao: 'aguardando', valor: 1 }, row('c', { valor: 'x' })]);
    expect(l.map((x) => x.lancamentoId)).toEqual(['a']);
    expect(l[0]).toMatchObject({ valor: -100, temNota: true, temBoleto: false, contaId: 'itau' });
    expect(lerLinhasDaAprovacao('x')).toEqual([]);
  });
  it('por dia de vencimento (o maior primeiro no dia; sem vencimento por último) com o total do dia', () => {
    const d = porDiaDeVencimento(lerLinhasDaAprovacao([row('a', { valor: -50, vencimento: '2026-11-21' }), row('b', { valor: -10 }), row('c', { valor: -90 }), row('s', { vencimento: null })]));
    expect(d.map((x) => [x.dia, x.total, x.linhas.map((l) => l.lancamentoId)])).toEqual([
      ['2026-11-18', 100, ['c', 'b']], ['2026-11-21', 50, ['a']], [null, 100, ['s']],
    ]);
  });
  it('saldo depois da fila: banco − pagamentos; sem leitura do banco = nulo ("—"), nunca zero; recusado e pago não contam; negativo marcado', () => {
    const l = lerLinhasDaAprovacao([row('a', { valor: -300 }), row('b', { valor: -900, situacao: 'aprovado' }), row('r', { valor: -5000, situacao: 'recusado' }),
      row('p', { valor: -7000, status_transacao: 'realizado', situacao: 'aprovado' }), row('x', { conta_bancaria_id: 'sic', conta: 'Sicredi', valor: -10 })]);
    const s = saldosDepoisDosPagamentos(l, new Map([['itau', { saldo: 1000, em: '2026-11-17T12:00:00Z' }]]));
    expect(s).toEqual([
      { contaId: 'itau', conta: 'Itaú 7225', banco: 1000, bancoEm: '2026-11-17T12:00:00Z', pagamentos: 1200, depois: -200, negativo: true },
      { contaId: 'sic', conta: 'Sicredi', banco: null, bancoEm: null, pagamentos: 10, depois: null, negativo: false },
    ]);
    expect(somaDe(l.slice(0, 2))).toBe(1200);
  });
});
