/**
 * FINANC-VINCULO-OBRIGATORIO-01 FASE 1 — a leitura da pendência (a regra é do banco, lote 114540) e a escolha do gravador que já existe (V1).
 * Dados SINTÉTICOS.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { comoVincular, filtrarContratos, lerPendenciasDeVinculo, lerVinculoPendente, proximaParcelaAberta, type ContratoParaVincular, type ParcelaExata } from './vinculoPendente';

const EXATA: ParcelaExata = { parcelaId: 'q3', financiamentoId: 'f2', numeroContrato: '197006191819500', numeroParcela: 3, vencimento: '2027-04-30', papel: 'juros' };

describe('lerVinculoPendente', () => {
  it('pendente com a parcela exata; não pendente; peça torta = nula', () => {
    expect(lerVinculoPendente({ pendente: true, tipo: 'juros', subcentro: 'Juros de Financiamento Pecuária', parcela_exata: {
      parcela_id: 'q3', financiamento_id: 'f2', numero_contrato: '197006191819500', numero_parcela: 3, data_vencimento: '2027-04-30', papel: 'juros' } }))
      .toEqual({ pendente: true, tipo: 'juros', subcentro: 'Juros de Financiamento Pecuária', parcelaExata: EXATA });
    expect(lerVinculoPendente({ pendente: true, tipo: 'amortizacao', subcentro: null, parcela_exata: null })).toEqual({ pendente: true, tipo: 'amortizacao', subcentro: null, parcelaExata: null });
    expect(lerVinculoPendente({ pendente: false })).toEqual({ pendente: false });
    expect(lerVinculoPendente({ pendente: true, tipo: 'outro' })).toBeNull();
    expect(lerVinculoPendente(null)).toBeNull();
  });
  it('a lista com os anos', () => {
    expect(lerPendenciasDeVinculo({ ok: true, anos: [{ ano: 2026, n: 2, valor: 10 }], itens: [
      { lancamento_id: 'l1', data: '2026-10-02', valor: 7.5, tipo: 'juros', subcentro: 'Juros', fornecedor: 'Banco X', descricao: 'juros out' }] }))
      .toEqual({ anos: [{ ano: 2026, n: 2, valor: 10 }], itens: [{ lancamentoId: 'l1', data: '2026-10-02', valor: 7.5, tipo: 'juros', subcentro: 'Juros', fornecedor: 'Banco X', descricao: 'juros out' }] });
    expect(lerPendenciasDeVinculo({ anos: [], itens: [{ lancamento_id: 'l1', tipo: 'x', valor: 1 }] })).toBeNull();
  });
});

describe('comoVincular (V1) — o gravador que já existe', () => {
  const PROX = { id: 'q9', numero: 9, vencimento: '2027-01-08' };
  it('captação = liberação; parcela exata NESTE contrato = a parcela; juros sem exata = encargo; amortização sem exata = a próxima parcela em aberto', () => {
    expect(comoVincular({ tipo: 'captacao', contratoId: 'f2', exata: null, proxima: PROX })).toEqual({ via: 'liberacao' });
    expect(comoVincular({ tipo: 'juros', contratoId: 'f2', exata: EXATA, proxima: PROX })).toEqual({ via: 'parcela', parcelaId: 'q3', papel: 'juros' });
    expect(comoVincular({ tipo: 'juros', contratoId: 'f1', exata: EXATA, proxima: PROX })).toEqual({ via: 'encargo', papel: 'juros' });
    expect(comoVincular({ tipo: 'amortizacao', contratoId: 'f1', exata: null, proxima: PROX })).toEqual({ via: 'parcela', parcelaId: 'q9', papel: 'principal' });
    expect(comoVincular({ tipo: 'amortizacao', contratoId: 'f1', exata: null, proxima: null }).via).toBe('nenhum');
  });
  it('a próxima parcela em aberto é a de vencimento mais cedo que não está paga', () => {
    expect(proximaParcelaAberta([
      { id: 'a', numero: 1, dataVencimento: '2026-01-08', situacao: 'paga' }, { id: 'b', numero: 3, dataVencimento: '2027-01-08', situacao: 'pendente' },
      { id: 'c', numero: 2, dataVencimento: '2026-07-08', situacao: 'vencida' }])).toEqual({ id: 'c', numero: 2, vencimento: '2026-07-08' });
    expect(proximaParcelaAberta([])).toBeNull();
  });
});

describe('filtrarContratos', () => {
  const C = (id: string, numero: string, credor: string, status = 'ativo'): ContratoParaVincular => ({ id, numero, credor, descricao: `Custeio ${id}`, dataContrato: null, valorContratado: null, status });
  const L = [C('a', '667.001.023-007', 'Banco Itaú'), C('b', '27.669', 'Banco Bradesco'), C('c', '541.203.246', 'Banco Sicredi', 'quitado')];
  it('o texto acha nº (com ou sem os pontos), credor sem acento; Ativos tira o quitado; o credor filtra', () => {
    expect(filtrarContratos(L, { busca: '6670010', credor: null, soAtivos: true }).map((c) => c.id)).toEqual(['a']);
    expect(filtrarContratos(L, { busca: 'itau', credor: null, soAtivos: true }).map((c) => c.id)).toEqual(['a']);
    expect(filtrarContratos(L, { busca: '', credor: null, soAtivos: true }).map((c) => c.id)).toEqual(['a', 'b']);
    expect(filtrarContratos(L, { busca: '', credor: null, soAtivos: false }).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(filtrarContratos(L, { busca: '', credor: 'Banco Bradesco', soAtivos: false }).map((c) => c.id)).toEqual(['b']);
  });
});
