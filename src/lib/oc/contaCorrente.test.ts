/**
 * OC-VENDA-ENTREGAS-01b — a leitura da conta corrente da venda. O saldo e' do banco (`oc_conta_corrente`); aqui se trava o
 * que a tela faz com ele: o sinal nas duas colunas (ele deve x adiantado por ele), o "saldo final a explicar" so' com as
 * entregas concluidas, e o status que o dado tem (D6: sem conta bancaria nunca vira conciliado).
 * Os tres casos de saldo que o briefing pede: ADIANTAMENTO (dinheiro antes do gado), PARCIAL (no meio do contrato) e A MAIS
 * (pagou mais que o entregue). O fixture principal e' a 232c05aa real, medida em rollback no proto.
 */
import { describe, it, expect } from 'vitest';
import { lerContaCorrente, colunasDoSaldo, cartoesDaContaCorrente, saldoFinalAExplicar, rotuloRecebimento } from './contaCorrente';

const linha = (tipo: 'entrega' | 'recebimento', data: string, valor: number, saldo: number, extra: Record<string, unknown> = {}) => ({
  tipo, data, lancamento_id: `${tipo}-${data}`, valor, saldo, status: tipo === 'entrega' ? 'sem_caixa' : 'sem_conta_bancaria',
  conta: tipo === 'entrega' ? 'Venda de Desmama Machos' : 'Adiantamento de Clientes', no_saldo: true, ...extra,
});

/* 232c05aa, Santa Rita 2025 — os numeros do rollback do OC-VENDA-ENTREGAS-01b. */
const HELDER = {
  modelo: 'conta_corrente', versao: 23, valor_acordado: 2366601.26, entregue: 2366601.26, cab_entregue: 779,
  recebido: 2365243.37, programado: 0, saldo: 1357.89, situacao: 'ele_deve', a_entregar: 0,
  recebimentos_sem_conta_bancaria: 4, saidas_sem_entrega: 0,
  linhas: [
    linha('entrega', '2025-03-19', 565521.66, 565521.66, { cab: 178, lote_ordem: 1, categoria: 'desmama_m' }),
    linha('entrega', '2025-03-20', 426616.58, 992138.24, { cab: 139, lote_ordem: 2, categoria: 'desmama_m' }),
    linha('recebimento', '2025-04-17', 992140.99, -2.75),
    linha('entrega', '2025-04-23', 574046.85, 574044.10, { cab: 193, lote_ordem: 3, categoria: 'desmama_m' }),
    linha('entrega', '2025-05-21', 18030.34, 592074.44, { cab: 6, lote_ordem: 6, categoria: 'garrotes' }),
    linha('entrega', '2025-05-21b', 549925.25, 1141999.69, { cab: 183, lote_ordem: 4, categoria: 'desmama_m' }),
    linha('recebimento', '2025-05-22', 574042.04, 567957.65),
    linha('recebimento', '2025-06-21', 567956.34, 1.31),
    linha('entrega', '2025-06-25', 207404.34, 207405.65, { cab: 69, lote_ordem: 5, categoria: 'desmama_m' }),
    linha('entrega', '2025-06-25b', 25056.24, 232461.89, { cab: 11, lote_ordem: 7, categoria: 'garrotes' }),
    linha('recebimento', '2025-07-25', 231104.00, 1357.89),
  ],
};

describe('conta corrente da venda', () => {
  it("232c05aa: le o envelope do banco sem somar nada, e o saldo final e' 1.357,89 que ele deve", () => {
    const cc = lerContaCorrente(HELDER);
    expect(cc).not.toBeNull();
    if (!cc) return;
    expect(cc.linhas).toHaveLength(11);
    expect(cc.saldo).toBe(1357.89);
    expect(cartoesDaContaCorrente(cc)).toEqual({ entregue: 2366601.26, recebido: 2365243.37, eleDeve: 1357.89, adiantado: 0 });
    expect(saldoFinalAExplicar(cc)).toEqual({
      frase: 'Entregas concluídas e o comprador pagou menos que o entregue · a OC fecha mesmo assim', valor: -1357.89,
    });
    expect(rotuloRecebimento(cc.linhas, 'recebimento-2025-05-22')).toBe('Recebimento 2 de 4');
  });

  it('D6: recebimento sem conta bancaria le "sem_conta_bancaria", nunca conciliado; status fora do contrato cai em realizado', () => {
    const cc = lerContaCorrente(HELDER);
    const recs = cc?.linhas.filter(l => l.tipo === 'recebimento') ?? [];
    expect(recs.map(l => l.status)).toEqual(['sem_conta_bancaria', 'sem_conta_bancaria', 'sem_conta_bancaria', 'sem_conta_bancaria']);
    const outro = lerContaCorrente({ ...HELDER, linhas: [linha('recebimento', '2025-01-01', 10, -10, { status: 'inventado' })] });
    expect(outro?.linhas[0].status).toBe('realizado');
  });

  it('ADIANTAMENTO: dinheiro antes do gado vai para "Adiantado por ele", e a coluna "Ele deve" fica vazia', () => {
    expect(colunasDoSaldo(-1000000)).toEqual({ eleDeve: null, adiantado: 1000000 });
    expect(colunasDoSaldo(-2.75)).toEqual({ eleDeve: null, adiantado: 2.75 });
    const cc = lerContaCorrente({ ...HELDER, entregue: 0, recebido: 1000000, saldo: -1000000, situacao: 'nos_devemos',
      a_entregar: 2366601.26, linhas: [linha('recebimento', '2025-03-01', 1000000, -1000000)] });
    expect(cc && cartoesDaContaCorrente(cc)).toEqual({ entregue: 0, recebido: 1000000, eleDeve: 0, adiantado: 1000000 });
    expect(cc && saldoFinalAExplicar(cc)).toBeNull();
  });

  it("PARCIAL: no meio do contrato o saldo e' andamento, nao diferenca — sem saldo final a explicar", () => {
    const cc = lerContaCorrente({ ...HELDER, entregue: 992138.24, recebido: 0, saldo: 992138.24, a_entregar: 1374463.02,
      linhas: HELDER.linhas.slice(0, 2) });
    expect(cc && cartoesDaContaCorrente(cc).eleDeve).toBe(992138.24);
    expect(cc && saldoFinalAExplicar(cc)).toBeNull();
  });

  it('A MAIS: pagou mais que o entregue com as entregas concluidas — a diferenca aparece positiva e a frase diz "mais"', () => {
    const cc = lerContaCorrente({ ...HELDER, recebido: 2367000, saldo: -398.74, situacao: 'nos_devemos' });
    expect(cc && cartoesDaContaCorrente(cc)).toEqual({ entregue: 2366601.26, recebido: 2367000, eleDeve: 0, adiantado: 398.74 });
    expect(cc && saldoFinalAExplicar(cc)).toEqual({
      frase: 'Entregas concluídas e o comprador pagou mais que o entregue · a OC fecha mesmo assim', valor: 398.74,
    });
  });

  it("quitado: zero e' valor — 0,00 em Ele deve, nunca as duas colunas vazias, e nada a explicar", () => {
    expect(colunasDoSaldo(0)).toEqual({ eleDeve: 0, adiantado: null });
    const cc = lerContaCorrente({ ...HELDER, recebido: 2366601.26, saldo: 0, situacao: 'quitado' });
    expect(cc && saldoFinalAExplicar(cc)).toBeNull();
  });
});
