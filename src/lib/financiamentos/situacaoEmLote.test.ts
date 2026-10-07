/**
 * PARC-FECHA-02 item 2 — a lista de contratos e os painéis leem a situação do MESMO dono do contrato, em lote.
 * O defeito: liam `financiamento_parcelas.status` ("Reboque Agrícola" com saldo 110.000,00 e 25.666,66 a vencer no contrato).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { lerSituacaoEmLote, parcelasDoLote, resumoDoContratoNaLista, totaisDaLista } from './situacaoEmLote';

const parcela = (n: number, situacao: string, extra: Record<string, unknown> = {}) => ({
  id: `p${n}`, numero: n, data_vencimento: `2026-${String(4 + n).padStart(2, '0')}-23`, valor_principal: 12833.33, valor_juros: 0, valor_total: 12833.33,
  situacao, pago_em: situacao === 'paga' ? '2026-05-11' : null, valor_pago: situacao === 'paga' ? 12833.33 : 0,
  lancamento_id: `l${n}`, lancamento_juros_id: null, fonte: 'lancamento', diverge: false, ...extra,
});
/* o "Reboque Agrícola" do NJ, na forma do dono: 110.000,00, 84.333,34 pagos, 25.666,66 a vencer (duas parcelas) */
const REBOQUE = {
  parcelas: [parcela(1, 'paga', { valor_principal: 33000, valor_total: 33000, valor_pago: 33000 }), parcela(2, 'paga'), parcela(3, 'paga'), parcela(4, 'paga'), parcela(5, 'paga'),
    parcela(6, 'pendente'), parcela(7, 'pendente')],
  cartoes: { valor_contrato: 110000, pago: 84333.34, a_vencer: 25666.66, vencido: 0, pagas: 5, parcelas: 7, juros_previstos: 0, soma_principal: 110000, soma_total: 110000, divergentes: 5 },
};
const COM_JUROS = {
  parcelas: [parcela(1, 'vencida', { valor_principal: 1000, valor_juros: 100.1, valor_total: 1100.1 }), parcela(2, 'parcial', { valor_principal: 1000, valor_juros: 100.2, valor_total: 1100.2, valor_pago: 1000 })],
  cartoes: { valor_contrato: 2000, pago: 1000, a_vencer: 100.2, vencido: 1100.1, pagas: 0, parcelas: 2, juros_previstos: 200.3, soma_principal: 2000, soma_total: 2200.3, divergentes: 0 },
};

describe('lerSituacaoEmLote', () => {
  it('lê `{ id: situação }` com o leitor do contrato; uma peça torta invalida o lote inteiro', () => {
    const m = lerSituacaoEmLote({ reboque: REBOQUE, juros: COM_JUROS });
    expect(m?.size).toBe(2);
    expect(m?.get('reboque')?.cartoes.aVencer).toBe(25666.66);
    expect(lerSituacaoEmLote({ reboque: REBOQUE, torto: { parcelas: [] } })).toBeNull();
    expect(lerSituacaoEmLote(null)).toBeNull();
    expect(lerSituacaoEmLote([])).toBeNull();
    expect(lerSituacaoEmLote({})?.size).toBe(0);
  });
});

describe('resumoDoContratoNaLista — o "em aberto" é o do contrato', () => {
  const lote = lerSituacaoEmLote({ reboque: REBOQUE, juros: COM_JUROS })!;
  it('Reboque Agrícola: 5 pagas, 25.666,66 em aberto (não os 110.000,00 da coluna antiga), próxima em 23/10', () => {
    expect(resumoDoContratoNaLista(lote.get('reboque'))).toEqual({ parcelasPagas: 5, totalPendente: 25666.66, jurosPendente: 0, proxVencimento: '2026-10-23', valorDaProxParcela: 12833.33 });
  });
  it('em aberto = a vencer + vencido do dono, em centavos (a parcial entra só pelo que falta); juros das não pagas', () => {
    const r = resumoDoContratoNaLista(lote.get('juros'));
    expect(r.totalPendente).toBe(1200.3);
    expect(r.jurosPendente).toBe(200.3);      // 100,10 + 100,20 sem erro de ponto flutuante
    expect(r.proxVencimento).toBe('2026-05-23');
  });
  it('contrato sem leitura: zeros e nulos (a linha existe, sem inventar parcela)', () => {
    expect(resumoDoContratoNaLista(undefined)).toEqual({ parcelasPagas: 0, totalPendente: 0, jurosPendente: 0, proxVencimento: null, valorDaProxParcela: null });
  });
});

describe('parcelasDoLote — a forma que os painéis liam, com a situação do dono', () => {
  const linhas = parcelasDoLote(lerSituacaoEmLote({ reboque: REBOQUE, juros: COM_JUROS })!);
  it("'pago' só a PAGA, com a data do lançamento; vencida, pendente e parcial são 'pendente' sem data", () => {
    expect(linhas.filter((l) => l.financiamento_id === 'reboque').map((l) => l.status)).toEqual(['pago', 'pago', 'pago', 'pago', 'pago', 'pendente', 'pendente']);
    expect(linhas.find((l) => l.id === 'p1' && l.financiamento_id === 'reboque')?.data_pagamento).toBe('2026-05-11');
    expect(linhas.filter((l) => l.financiamento_id === 'juros').map((l) => [l.status, l.data_pagamento])).toEqual([['pendente', null], ['pendente', null]]);
  });
});

describe('totaisDaLista — os cartões do topo, em centavos', () => {
  it('a soma das linhas é o cartão; principal = a pagar − juros', () => {
    expect(totaisDaLista([{ total_pendente: 25666.66, juros_pendente: 0 }, { total_pendente: 1200.3, juros_pendente: 200.3 }, { total_pendente: 0.1, juros_pendente: 0 }, { total_pendente: 0.2, juros_pendente: 0 }]))
      .toEqual({ aPagar: 26867.26, jurosAVencer: 200.3, principalAberto: 26666.96 });
  });
});

describe('quem lê (da fonte): lista e painéis não leem mais a coluna antiga', () => {
  const ler = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');
  const lista = ler('pages/FinanciamentosListaPage.tsx');
  const painel = ler('hooks/useFinanciamentosPainel.ts');
  const endiv = ler('hooks/useEndividamentoAtual.ts');
  it("nenhum dos três consulta `financiamento_parcelas` (a busca sabe achar: o editor antigo consulta)", () => {
    for (const fonte of [lista, painel, endiv]) expect(fonte).not.toContain(".from('financiamento_parcelas')");
    expect(ler('components/financiamentos/ModalBaixaParcela.tsx')).toContain(".from('financiamento_parcelas')");
  });
  it('os três leem o lote do dono; a lista não soma na tela', () => {
    for (const fonte of [lista, painel, endiv]) expect(fonte).toContain('lerSituacaoEmLoteDoBanco(');
    expect(lista).toContain('const r = resumoDoContratoNaLista(lote.get(f.id));');
    expect(lista).toContain('aPagar: totaisDaLista(filtered).aPagar,');
    expect(lista).not.toContain('f.total_pendente, 0)');
  });
});
