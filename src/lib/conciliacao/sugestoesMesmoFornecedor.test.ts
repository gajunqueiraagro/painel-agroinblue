/**
 * P153b (Gabriel 29/10) — a SUGESTÃO INTELIGENTE do "Sugestões para casar": o lançamento EM ABERTO do mesmo fornecedor (o nome do
 * extrato no fornecedor OU na descrição), vencendo a ±5 dias, com valor diferente → âmbar, "mesmo fornecedor · valor difere: previsto X".
 * O caso que abriu a frente, SINTÉTICO: BB 07/10, "PAGAMENTO FATURA DE ÁGUA - AGUAS GUARIROBA SA", −142,72; o recorrente "Agua e Esgoto"
 * da Águas Guariroba, R$ 500, previsto para 09/10. D1: a janela de ±5 dias é SÓ do selo novo; a E3 ("nome · valor diferente") segue.
 */
import { describe, it, expect } from 'vitest';
import { sugerirCasamentos, JANELA_MESMO_FORNECEDOR_DIAS, type CandidatoSugestao } from './sugestoesCasamento';

const EXTRATO = { data: '2031-10-07', historico: 'PAGAMENTO FATURA DE ÁGUA - AGUAS GUARIROBA SA', valor: -142.72 };
const agua = (o: Partial<CandidatoSugestao> = {}): CandidatoSugestao => ({
  lancamento_id: 'agua', data_vencimento: '2031-10-09', competencia: '2031-10-01', valor_assinado: -500,
  descricao: 'Agua e Esgoto - Escritorio', fornecedor: 'Aguas Guariroba SA', favorecido_id: 'gua', status_transacao: 'previsto',
  ja_conciliado: false, ...o,
});

describe('P153b — "mesmo fornecedor · valor difere"', () => {
  it('o caso da Guariroba: o previsto de 500,00 a 2 dias vira a sugestão âmbar, uma vez só', () => {
    const r = sugerirCasamentos(EXTRATO, [agua()]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'mesmo_fornecedor', motivo: 'mesmo fornecedor · valor difere: previsto 500,00', valorDiferente: true });
    expect(r[0].lancamentos.map((c) => c.lancamento_id)).toEqual(['agua']);
  });

  it('a janela é de ±5 dias pelo vencimento: a 5 dias entra; a 6 dias sai do selo novo e fica a E3 de antes', () => {
    expect(JANELA_MESMO_FORNECEDOR_DIAS).toBe(5);
    expect(sugerirCasamentos(EXTRATO, [agua({ data_vencimento: '2031-10-12' })])[0].tipo).toBe('mesmo_fornecedor');
    expect(sugerirCasamentos(EXTRATO, [agua({ data_vencimento: '2031-10-02' })])[0].tipo).toBe('mesmo_fornecedor');
    const longe = sugerirCasamentos(EXTRATO, [agua({ data_vencimento: '2031-10-13' })]);
    expect(longe).toHaveLength(1);
    expect(longe[0]).toMatchObject({ tipo: 'nome_valor', motivo: 'nome · valor diferente' });
  });

  it('o nome do extrato na DESCRIÇÃO também conta (sem fornecedor no lançamento)', () => {
    const r = sugerirCasamentos(EXTRATO, [agua({ fornecedor: null, favorecido_id: null, descricao: 'Conta de agua Guariroba - escritorio' })]);
    expect(r.map((s) => s.tipo)).toEqual(['mesmo_fornecedor']);
  });

  it('só o EM ABERTO: o realizado (já pago) não vira o selo novo', () => {
    const r = sugerirCasamentos(EXTRATO, [agua({ status_transacao: 'realizado' })]);
    expect(r.some((s) => s.tipo === 'mesmo_fornecedor')).toBe(false);
  });

  it('programado e agendado também são em aberto; outro fornecedor não entra', () => {
    expect(sugerirCasamentos(EXTRATO, [agua({ status_transacao: 'programado' })])[0].tipo).toBe('mesmo_fornecedor');
    expect(sugerirCasamentos(EXTRATO, [agua({ status_transacao: 'agendado' })])[0].tipo).toBe('mesmo_fornecedor');
    expect(sugerirCasamentos(EXTRATO, [agua({ fornecedor: 'Energisa Mato Grosso do Sul', descricao: 'Energia elétrica - Escritório' })])).toEqual([]);
  });

  it('o mesmo valor continua acima (azul); o selo novo vem depois dele', () => {
    const r = sugerirCasamentos(EXTRATO, [agua(), agua({ lancamento_id: 'certo', valor_assinado: -142.72 })]);
    expect(r.map((s) => s.tipo)).toEqual(['mesmo_valor_nome', 'mesmo_fornecedor']);
  });
});
