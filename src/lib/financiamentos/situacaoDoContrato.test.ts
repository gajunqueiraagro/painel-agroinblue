/** O leitor da situação do contrato — PARC-LIVRES-01 passo 4: lê sem inventar; peça torta = nulo inteiro. */
import { describe, expect, it } from 'vitest';
import { ROTULO_SITUACAO, TOM_DO_PRAZO, lerSituacaoDoContrato, origemDaSituacao, textoDasNotas, textoDoPrazo } from './situacaoDoContrato';

const PARCELA = { id: 'p1', numero: 1, data_vencimento: '2026-07-05', valor_principal: 5950, valor_juros: 0, valor_total: 5950,
  situacao: 'paga', pago_em: '2026-07-02', valor_pago: 5950, lancamento_id: 'l1', lancamento_juros_id: null, fonte: 'lancamento', diverge: true };
const CARTOES = { valor_contrato: 35700, pago: 17850, a_vencer: 11900, vencido: 5950, pagas: 3, parcelas: 6, juros_previstos: 0,
  soma_principal: 35700, soma_total: 35700, divergentes: 3 };

describe('lerSituacaoDoContrato', () => {
  it('lê parcelas e cartões como vieram (os números do contrato que motivou o passo)', () => {
    const s = lerSituacaoDoContrato({ parcelas: [PARCELA], cartoes: CARTOES })!;
    expect(s.cartoes).toEqual({ valorContrato: 35700, pago: 17850, aVencer: 11900, vencido: 5950, pagas: 3, parcelas: 6, jurosPrevistos: 0,
      somaPrincipal: 35700, somaTotal: 35700, divergentes: 3, detalhe: null });
    expect(s.parcelas[0]).toEqual({ id: 'p1', numero: 1, dataVencimento: '2026-07-05', valorPrincipal: 5950, valorJuros: 0, valorTotal: 5950,
      situacao: 'paga', pagoEm: '2026-07-02', valorPago: 5950, lancamentoId: 'l1', lancamentoJurosId: null, fonte: 'lancamento', diverge: true, detalhe: null });
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
    expect(ROTULO_SITUACAO).toEqual({ paga: 'Paga', vencida: 'Vencida', pendente: 'A vencer', parcial: 'Parcial' });
    const s = lerSituacaoDoContrato({ parcelas: [PARCELA, { ...PARCELA, id: 'p2', fonte: 'parcela' }, { ...PARCELA, id: 'p3', situacao: 'parcial' }], cartoes: CARTOES })!;
    expect(s.parcelas.map(origemDaSituacao)).toEqual([
      'situação lida do lançamento desta parcela', 'parcela sem lançamento: a situação é a registrada na parcela',
      'só parte dos lançamentos desta parcela está realizada']);
  });
});

/* ── PARC-CONTRATO-01 item 1 — o detalhe (p_detalhe): o que a tela do contrato mostra ao lado da situação ─────────────── */
const DETALHE = { competencia: '2026-06-02', conta_id: 'c1', conta_nome: 'Banco do Brasil', tipo_documento: null, numero_documento: null,
  prazo: { tipo: 'antes', dias: 3 }, documentos: [{ id: 'd1', especie: 'nf', numero: '5510', valor: 35700 }], boletos: 0 };
const CONTAGENS = { a_vencer_qtde: 2, vencido_qtde: 1, notas_qtde: 1, notas_valor: 35700, notas_diferenca: 0, boletos: 0 };

describe('o detalhe do contrato', () => {
  it('lê o detalhe da parcela e dos cartões como vieram', () => {
    const s = lerSituacaoDoContrato({ parcelas: [{ ...PARCELA, ...DETALHE }], cartoes: { ...CARTOES, ...CONTAGENS } })!;
    expect(s.parcelas[0].detalhe).toEqual({ competencia: '2026-06-02', contaNome: 'Banco do Brasil', tipoDocumento: null, numeroDocumento: null,
      prazo: { tipo: 'antes', dias: 3 }, documentos: [{ especie: 'nf', numero: '5510', cancelado: false }], boletos: 0 });
    expect(s.cartoes.detalhe).toEqual({ aVencerQtde: 2, vencidoQtde: 1, notasQtde: 1, notasValor: 35700, notasDiferenca: 0, boletos: 0 });
  });
  it('prazo nulo é nulo (paga sem data); nota sem valor fica nula, nunca zero', () => {
    const s = lerSituacaoDoContrato({ parcelas: [{ ...PARCELA, ...DETALHE, prazo: null }], cartoes: { ...CARTOES, ...CONTAGENS, notas_valor: null, notas_diferenca: null } })!;
    expect(s.parcelas[0].detalhe?.prazo).toBeNull();
    expect([s.cartoes.detalhe?.notasValor, s.cartoes.detalhe?.notasDiferenca]).toEqual([null, null]);
  });
  it('detalhe torto invalida a leitura INTEIRA (prazo desconhecido, boletos que não é número, contagem faltando)', () => {
    expect(lerSituacaoDoContrato({ parcelas: [{ ...PARCELA, ...DETALHE, prazo: { tipo: 'amanha', dias: 1 } }], cartoes: CARTOES })).toBeNull();
    expect(lerSituacaoDoContrato({ parcelas: [{ ...PARCELA, ...DETALHE, boletos: 'um' }], cartoes: CARTOES })).toBeNull();
    expect(lerSituacaoDoContrato({ parcelas: [{ ...PARCELA, ...DETALHE, documentos: 'x' }], cartoes: CARTOES })).toBeNull();
    expect(lerSituacaoDoContrato({ parcelas: [PARCELA], cartoes: { ...CARTOES, ...CONTAGENS, vencido_qtde: undefined } })).toBeNull();
  });
  it('o prazo por extenso, com singular, "vence hoje" e a cor', () => {
    expect([
      textoDoPrazo({ tipo: 'antes', dias: 3 }), textoDoPrazo({ tipo: 'antes', dias: 1 }), textoDoPrazo({ tipo: 'no_dia', dias: 0 }),
      textoDoPrazo({ tipo: 'atraso', dias: 2 }), textoDoPrazo({ tipo: 'vencida', dias: 2 }), textoDoPrazo({ tipo: 'vencida', dias: 1 }),
      textoDoPrazo({ tipo: 'a_vencer', dias: 29 }), textoDoPrazo({ tipo: 'a_vencer', dias: 0 }), textoDoPrazo(null),
    ]).toEqual(['3 dias antes', '1 dia antes', 'no dia', '2 dias de atraso', 'vencida há 2 dias', 'vencida há 1 dia', 'vence em 29 dias', 'vence hoje', '—']);
    expect(TOM_DO_PRAZO).toEqual({ antes: 'verde', no_dia: 'verde', atraso: 'vermelho', vencida: 'vermelho', a_vencer: 'cinza' });
  });
  it('o rodapé das notas: confere, a diferença escrita com o sinal, sem valor e sem nota', () => {
    const c = { aVencerQtde: 0, vencidoQtde: 0, notasQtde: 1, notasValor: 100, notasDiferenca: 0, boletos: 0 };
    expect(textoDasNotas(c)).toMatchObject({ texto: '1 nota · confere', tom: 'verde' });
    expect(textoDasNotas({ ...c, notasQtde: 2, notasDiferenca: 0.01 })).toMatchObject({ texto: '2 notas · +0,01', tom: 'vermelho' });
    expect(textoDasNotas({ ...c, notasDiferenca: -77000 })).toMatchObject({ texto: '1 nota · −77.000,00', tom: 'vermelho' });
    expect(textoDasNotas({ ...c, notasValor: null, notasDiferenca: null })).toMatchObject({ texto: '1 nota · sem valor', tom: 'cinza' });
    expect(textoDasNotas({ ...c, notasQtde: 0 }).texto).toBe('—');
    expect(textoDasNotas(null).texto).toBe('—');
  });
});
