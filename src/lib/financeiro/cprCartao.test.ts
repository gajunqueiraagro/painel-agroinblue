/**
 * P82 (Gabriel 23/10/2026 08h10) — "a compra do cartão é SAÍDA; o pagamento do cartão é TRANSFERÊNCIA", na CPR.
 *   K1 mês com a compra no cartão e o pagamento da fatura (banco → cartão) em aberto: a despesa sai UMA vez (a compra); as duas pontas
 *      do pagamento contam e se anulam; o saldo do fim = caixa − compra
 *   K2 sem a regra (os cartões fora): a ponta do banco contava sozinha e a fatura saía DUAS vezes (o defeito medido no NJ)
 *   K3 o saldo dos cartões (do banco) entra na série de "todas as contas", e no realizado do período; zero não mexe em nada
 *   K4 com UMA conta escolhida (o banco), a ponta do pagamento é dela e sai, como sempre
 */
import { describe, it, expect } from 'vitest';
import { periodoDoAtalho, recortarCpr, serieDoSaldoCpr, realizadoComCartoesCpr, type ContaCpr } from '@/lib/financeiro/cprRecorte';

const HOJE = '2026-10-05';
const MES = periodoDoAtalho('mes', HOJE);
const ANC = new Map([['BANCO', '2026-09-30']]);
const CARTOES = new Set(['CARTAO']);
let n = 0;
const conta = (venc: string, valor: number, o: Partial<ContaCpr> = {}): ContaCpr => ({
  id: `k${++n}`, data_vencimento: venc, data_pagamento: null, status_transacao: 'programado', tipo_operacao: '2-Saídas', valor, ...o,
});
const compra = conta('2026-10-20', 734.21, { conta_bancaria_id: 'CARTAO' });
const fatura = conta('2026-10-20', 734.21, { tipo_operacao: '3-Transferências', conta_bancaria_id: 'BANCO', conta_destino_id: 'CARTAO' });

describe('P82 — a regra do cartão na CPR', () => {
  it('K1 a despesa sai uma vez (a compra); o pagamento da fatura se anula', () => {
    const r = recortarCpr([compra, fatura], { periodo: MES, hoje: HOJE, ancoras: ANC, cartoes: CARTOES });
    const s = serieDoSaldoCpr(r, 10000);
    expect(s.fim).toBe(9265.79);
    /* as duas pontas do pagamento estão na soma, uma de cada lado */
    expect(r.periodoSoma.linhas.filter((l) => l.id === fatura.id).map((l) => l.ponta).sort()).toEqual(['entrada', 'saida']);
  });

  it('K2 sem a regra, a fatura saía duas vezes', () => {
    const r = recortarCpr([compra, fatura], { periodo: MES, hoje: HOJE, ancoras: ANC });
    expect(serieDoSaldoCpr(r, 10000).fim).toBe(8531.58);
  });

  it('K3 o saldo dos cartões entra na série e no realizado; zero não mexe', () => {
    const real = { inicial: { data: '2026-09-30', saldo: 9000 }, dias: [{ data: '2026-10-02', entradas: 0, saidas: 0, nEntradas: 0, nSaidas: 0, saldo: 9000 }] };
    expect(realizadoComCartoesCpr(real, 821.22)).toEqual({ inicial: { data: '2026-09-30', saldo: 9821.22 },
      dias: [{ data: '2026-10-02', entradas: 0, saidas: 0, nEntradas: 0, nSaidas: 0, saldo: 9821.22 }] });
    expect(realizadoComCartoesCpr(real, 0)).toBe(real);
    expect(realizadoComCartoesCpr(null, 821.22)).toBeNull();
  });

  it('K4 com o banco escolhido, a ponta do pagamento é dele e sai', () => {
    const r = recortarCpr([compra, fatura], { periodo: MES, hoje: HOJE, ancoras: ANC, cartoes: CARTOES, conta: 'BANCO' });
    expect(r.periodoSoma.pagar).toEqual({ valor: 734.21, contas: 1 });
  });
});
