/**
 * RATEIO-HIGINO-01 — o que a conferência lê e grava: separa os itens desta relação; grava na ordem (prévia → completar → novos → documento);
 * recusa na prévia = nada grava; linha nova que falha = cancela as criadas e desfaz o completar (nada fica pela metade).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  completar: vi.fn(), desfazer: vi.fn(), cancelar: vi.fn(), registrar: vi.fn(), docs: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('@/lib/financeiro/nfeConsultas', () => ({
  completarComANota: (...a: unknown[]) => m.completar(...a), desfazerCompletar: (...a: unknown[]) => m.desfazer(...a),
  cancelarCriados: (...a: unknown[]) => m.cancelar(...a), registrarNaOperacao: (...a: unknown[]) => m.registrar(...a),
}));
vi.mock('@/lib/financeiro/documentosPendentes', () => ({
  novoPendente: (payload: unknown, arquivo: unknown) => ({ chave: 'p', payload, arquivo, gravado: false }),
  gravarDocumentosDoParcelamento: (...a: unknown[]) => m.docs(...a),
}));

import { gravarConferencia, mesDoPagamento, separarItens } from './rateioNoBanco';
import type { ItemDoRateio, ItemNovoDoRateio } from './conferirRateio';

const it8 = (id: string, numeroDocumento: string | null): ItemDoRateio => ({
  id, descricao: 'x', fazendaId: 'f', planoContaId: 'p', valorCent: 100, vencimento: '2026-11-05', competencia: '2026-11-01', numeroDocumento, tipoDocumento: null, pago: false,
});
const novo: ItemNovoDoRateio = { chave: 'n1', valorCent: 729262, fazendaId: 'f', planoContaId: 'p', descricao: 'ITR', vencimento: '2026-11-30', competencia: '2026-01-01', nf: null };
const ok = (operacao: string | null) => ({ ok: true, valor: { ok: true, recusas: [], linhas: [], efeitoDre: [], operacao, financiamentoId: null } });

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.completar.mockImplementation(async (_c: string, _p: unknown, o: { simular: boolean }) => ok(o.simular ? null : 'op-1'));
  m.cancelar.mockResolvedValue(0); m.desfazer.mockResolvedValue(null); m.registrar.mockResolvedValue(null);
  m.docs.mockResolvedValue([{ gravado: true, documentoId: 'doc-1' }]);
});

describe('RATEIO-HIGINO-01 — os itens desta relação', () => {
  it('o mês do pagamento (fevereiro e dezembro)', () => {
    expect([mesDoPagamento('2026-11-16'), mesDoPagamento('2028-02-03'), mesDoPagamento('2026-12-31')]).toEqual([
      { de: '2026-11-01', ate: '2026-11-30' }, { de: '2028-02-01', ate: '2028-02-29' }, { de: '2026-12-01', ate: '2026-12-31' }]);
  });
  it('desta = o rótulo do pagamento OU ligado a um documento dele; o resto vai para os outros', () => {
    const r = separarItens([it8('a', 'R_D05'), it8('b', '34756'), it8('c', 'R_Folha'), it8('d', null)], 'R_D05', new Set(['b']));
    expect([r.desta.map((x) => x.id), r.outros.map((x) => x.id)]).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('sem rótulo, só os ligados', () => {
    expect(separarItens([it8('a', 'R_D05')], null, new Set()).desta).toEqual([]);
  });
});

describe('RATEIO-HIGINO-01 — gravar a conferência', () => {
  const arquivo = new File(['%PDF'], 'relacao.pdf', { type: 'application/pdf' });

  it('na ordem: prévia → completar → novos → documento (no pagamento, ligado a todos) → registra na operação', async () => {
    const criar = vi.fn(async () => 'novo-1');
    const r = await gravarConferencia('cli', 'pag', [{ id: 'a', valor: 18 }], [novo], ['a', 'b'], arquivo, criar);
    expect(r).toEqual({ ok: true, valor: { mudaram: 1, criados: ['novo-1'], operacao: 'op-1', documentoGravado: true } });
    expect(m.completar.mock.calls.map((c) => c[2].simular)).toEqual([true, false]);
    expect(m.docs.mock.calls[0][1]).toEqual([{ numero: 1, lancamentoId: 'pag' }, { numero: 2, lancamentoId: 'a' }, { numero: 3, lancamentoId: 'b' }, { numero: 4, lancamentoId: 'novo-1' }]);
    expect(m.registrar).toHaveBeenCalledWith('op-1', ['novo-1'], ['doc-1']);
  });

  it('recusa na prévia: nada grava (nem o completar de verdade, nem os novos)', async () => {
    m.completar.mockResolvedValueOnce({ ok: true, valor: { ok: false, recusas: ['«X» já é da NF 111566: para trocar, cancele aquela antes.'], linhas: [], efeitoDre: [], operacao: null, financiamentoId: null } });
    const criar = vi.fn(async () => 'novo-1');
    const r = await gravarConferencia('cli', 'pag', [{ id: 'a', numero_documento: '111436' }], [novo], [], null, criar);
    expect(r).toEqual({ ok: false, motivo: '«X» já é da NF 111566: para trocar, cancele aquela antes.' });
    expect([m.completar.mock.calls.length, criar.mock.calls.length]).toEqual([1, 0]);
  });

  it('linha nova que falha: cancela as já criadas e desfaz o completar', async () => {
    const criar = vi.fn().mockResolvedValueOnce('novo-1').mockResolvedValueOnce(null);
    const r = await gravarConferencia('cli', 'pag', [{ id: 'a', valor: 18 }], [novo, { ...novo, chave: 'n2' }], [], arquivo, criar);
    expect(r.ok).toBe(false);
    expect(m.cancelar).toHaveBeenCalledWith(['novo-1'], expect.any(String));
    expect(m.desfazer).toHaveBeenCalledWith('op-1');
    expect(m.docs).not.toHaveBeenCalled();
  });

  it('sem mudança nos itens: não chama o completar; cria e anexa', async () => {
    const r = await gravarConferencia('cli', 'pag', [], [novo], [], null, vi.fn(async () => 'novo-1'));
    expect([r.ok, m.completar.mock.calls.length, m.registrar.mock.calls.length]).toEqual([true, 0, 0]);
  });
});
