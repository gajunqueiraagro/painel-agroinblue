/** O leitor da situação do contrato — PARC-LIVRES-01 passo 4: lê sem inventar; peça torta = nulo inteiro. */
import { describe, expect, it } from 'vitest';
import { ROTULO_SITUACAO, lerSituacaoDoContrato, origemDaSituacao } from './situacaoDoContrato';

const PARCELA = { id: 'p1', numero: 1, data_vencimento: '2026-07-05', valor_principal: 5950, valor_juros: 0, valor_total: 5950,
  situacao: 'paga', pago_em: '2026-07-02', valor_pago: 5950, lancamento_id: 'l1', lancamento_juros_id: null, fonte: 'lancamento', diverge: true };
const CARTOES = { valor_contrato: 35700, pago: 17850, a_vencer: 11900, vencido: 5950, pagas: 3, parcelas: 6, juros_previstos: 0,
  soma_principal: 35700, soma_total: 35700, divergentes: 3 };

describe('lerSituacaoDoContrato', () => {
  it('lê parcelas e cartões como vieram (os números do contrato que motivou o passo)', () => {
    const s = lerSituacaoDoContrato({ parcelas: [PARCELA], cartoes: CARTOES })!;
    expect(s.cartoes).toEqual({ valorContrato: 35700, pago: 17850, aVencer: 11900, vencido: 5950, pagas: 3, parcelas: 6, jurosPrevistos: 0,
      somaPrincipal: 35700, somaTotal: 35700, divergentes: 3 });
    expect(s.parcelas[0]).toEqual({ id: 'p1', numero: 1, dataVencimento: '2026-07-05', valorPrincipal: 5950, valorJuros: 0, valorTotal: 5950,
      situacao: 'paga', pagoEm: '2026-07-02', valorPago: 5950, lancamentoId: 'l1', lancamentoJurosId: null, fonte: 'lancamento', diverge: true });
  });
  it('peça torta = nulo INTEIRO (cartão faltando, situação desconhecida, valor que não é número, raiz que não é objeto)', () => {
    expect(lerSituacaoDoContrato(null)).toBeNull();
    expect(lerSituacaoDoContrato('novo-id')).toBeNull();
    expect(lerSituacaoDoContrato({ parcelas: [PARCELA], cartoes: { ...CARTOES, pago: undefined } })).toBeNull();
    expect(lerSituacaoDoContrato({ parcelas: [{ ...PARCELA, situacao: 'quitada' }], cartoes: CARTOES })).toBeNull();
    expect(lerSituacaoDoContrato({ parcelas: [{ ...PARCELA, valor_pago: '5950' }], cartoes: CARTOES })).toBeNull();
    expect(lerSituacaoDoContrato({ parcelas: 'x', cartoes: CARTOES })).toBeNull();
  });
  it('rótulos e a origem da situação', () => {
    expect(ROTULO_SITUACAO).toEqual({ paga: 'Paga', vencida: 'Vencida', pendente: 'Pendente', parcial: 'Parcial' });
    const s = lerSituacaoDoContrato({ parcelas: [PARCELA, { ...PARCELA, id: 'p2', fonte: 'parcela' }, { ...PARCELA, id: 'p3', situacao: 'parcial' }], cartoes: CARTOES })!;
    expect(s.parcelas.map(origemDaSituacao)).toEqual([
      'situação lida do lançamento desta parcela', 'parcela sem lançamento: a situação é a registrada na parcela',
      'só parte dos lançamentos desta parcela está realizada']);
  });
});
