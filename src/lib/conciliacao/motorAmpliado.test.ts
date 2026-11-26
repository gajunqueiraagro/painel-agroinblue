/** CONC-SUGESTOES-V2 — as regras das 3 telas sobre o motor ampliado (nomes e documentos SINTÉTICOS). */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const M = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: M.rpc } }));

import { exatasDoMotor, possiveisDoMotor, estadoDaLinhaSemPar, apelidoDaConta, semCaixaAlta, nomeDoExtratoSemCaixa,
  motorAmpliadoDoMovimento, parcelasDoMotor, parcelaDifere, prazoDaParcela, type RespostaDoAmpliado } from './motorAmpliado';
import type { CandidatoConciliacao } from '@/hooks/useConciliacaoDoMes';

const c = (id: string, x: Partial<CandidatoConciliacao> = {}): CandidatoConciliacao => ({
  id, descricao: 'x', favorecido: 'F', numeroDocumento: null, dataReferencia: '2026-11-20', valor: 100, status: 'programado',
  jaConciliado: 0, saldo: 100, deltaValor: 0, deltaDias: 3, score: 70, preMarcado: false, ambiguo: false, indisponivel: false,
  motivoIndisponivel: null, vencimento: '2026-12-10', outraConta: false, documentoCasa: null, exata: false, origem: 'lancamento', ...x,
});
const ok = (cs: CandidatoConciliacao[]): RespostaDoAmpliado => ({ ok: true, candidatos: cs });
const leitura = { temNome: true, temDocumento: true };

beforeEach(() => { M.rpc.mockReset(); });

describe('o motor ampliado (a chamada)', () => {
  it('manda p_ampliado e lê as colunas novas; a recusa é { ok: false } (nunca lista vazia)', async () => {
    M.rpc.mockResolvedValueOnce({ data: [{ id: 'l1', valor: '100.00', saldo: '100.00', delta_valor: '0.00', exata: true, documento_casa: 'raiz',
      outra_conta: true, conta_nome: 'Banco do Brasil', origem: 'lancamento' }], error: null });
    const r = await motorAmpliadoDoMovimento('cli', 'e1');
    expect(M.rpc).toHaveBeenCalledWith('fn_candidatos_conciliacao', { p_cliente_id: 'cli', p_extrato_id: 'e1', p_limite: 10, p_ampliado: true });
    expect(r.ok && r.candidatos[0]).toMatchObject({ exata: true, documentoCasa: 'raiz', outraConta: true, contaNome: 'Banco do Brasil', origem: 'lancamento' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    M.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    expect(await motorAmpliadoDoMovimento('cli', 'e1')).toEqual({ ok: false, erro: 'o banco recusou a consulta' });
  });
});

describe('exatas e possíveis', () => {
  it('exata = a marca do motor, viva; possíveis = só o que a lista de hoje não tem e que só o ampliado acha', () => {
    const cs = [c('a', { exata: true }), c('b', { exata: true, indisponivel: true }), c('c', { outraConta: true }), c('d', { documentoCasa: 'cnpj' }),
      c('n', { origem: 'nota' }), c('e')];
    expect(exatasDoMotor(cs).map((x) => x.id)).toEqual(['a']);
    expect(possiveisDoMotor(cs, new Set(['d'])).map((x) => x.id)).toEqual(['c', 'n']);
  });
});

describe('REGRA DE FINANCIAMENTO — a parcela é UMA linha', () => {
  const am = c('am', { parcelaId: 'p1', parcelaRotulo: 'FCO – Curral · 1/12 · venc. 01/11', valor: 9000, diasUteis: -2, outraConta: true, contaNome: 'Sicredi' });
  const ju = c('ju', { parcelaId: 'p1', parcelaRotulo: 'FCO – Curral · 1/12 · venc. 01/11', valor: 8484.93, diasUteis: -2 });
  it('amortização + juros da mesma parcela juntos (soma); fora das exatas e das possíveis soltas', () => {
    const g = parcelasDoMotor([am, ju, c('x')]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ parcelaId: 'p1', rotulo: 'FCO – Curral · 1/12 · venc. 01/11', valor: 17484.93, diasUteis: -2, outraConta: true });
    expect(g[0].candidatos.map((x) => x.id)).toEqual(['am', 'ju']);
    expect(exatasDoMotor([{ ...am, exata: true }])).toEqual([]);
    expect(possiveisDoMotor([am, ju], new Set())).toEqual([]);
    expect(estadoDaLinhaSemPar(ok([am, ju]), [], leitura)).toEqual({ tipo: 'possiveis', n: 1 });
  });
  it('valor diferente do banco (meio centavo) e o prazo: no prazo · adiantado · atraso (úteis; corridos quando longe)', () => {
    expect(parcelaDifere({ valor: 17484.93 }, -16831.69)).toBe(true);
    expect(parcelaDifere({ valor: 16831.69 }, -16831.694)).toBe(false);
    expect(prazoDaParcela({ vencimento: '2026-11-01', diasUteis: 0 }, '2026-11-03')).toEqual({ texto: 'no prazo', adiantado: false });
    expect(prazoDaParcela({ vencimento: '2026-11-10', diasUteis: -5 }, '2026-11-03')).toEqual({ texto: 'adiantado 5 dias úteis', adiantado: true });
    expect(prazoDaParcela({ vencimento: '2026-10-30', diasUteis: 1 }, '2026-11-03')).toEqual({ texto: '1 dia útil de atraso', adiantado: false });
    expect(prazoDaParcela({ vencimento: '2028-11-01', diasUteis: null }, '2026-11-26')).toEqual({ texto: 'adiantado 706 dias', adiantado: true });
    expect(prazoDaParcela({ vencimento: null, diasUteis: null }, '2026-11-26')).toBeNull();
  });
});

describe('B · o estado da linha sem par', () => {
  it('exata > possíveis > nenhuma (com o motivo); procurando e falhou nunca viram "nenhuma"', () => {
    expect(estadoDaLinhaSemPar(ok([c('a', { exata: true })]), ['x'], leitura)).toMatchObject({ tipo: 'exata', n: 1 });
    expect(estadoDaLinhaSemPar(ok([c('c', { outraConta: true })]), ['x', 'y'], leitura)).toEqual({ tipo: 'possiveis', n: 3 });
    expect(estadoDaLinhaSemPar(ok([]), [], leitura)).toEqual({ tipo: 'nenhuma', motivo: 'achado pelo CNPJ · nada em aberto' });
    expect(estadoDaLinhaSemPar(ok([]), [], { temNome: false, temDocumento: false })).toEqual({ tipo: 'nenhuma', motivo: 'sem nome no banco' });
    expect(estadoDaLinhaSemPar(undefined, [], leitura)).toEqual({ tipo: 'procurando' });
    expect(estadoDaLinhaSemPar({ ok: false, erro: 'x' }, [], leitura)).toEqual({ tipo: 'falhou' });
    expect(estadoDaLinhaSemPar({ ok: false, erro: 'x' }, ['x'], leitura)).toEqual({ tipo: 'possiveis', n: 1 });
  });
});

describe('os textos', () => {
  it('o apelido do banco', () => {
    expect(apelidoDaConta('Banco do Brasil Agro')).toBe('BB');
    expect(apelidoDaConta('Itaú Personalite')).toBe('Itaú');
    expect(apelidoDaConta(null)).toBe('outra conta');
  });
  it('o nome do extrato sem caixa alta, com o tipo da operação', () => {
    expect(semCaixaAlta('Z R SINTETICA DE MAQUINAS LTDA')).toBe('Z R Sintetica de Maquinas Ltda');
    expect(semCaixaAlta('AZULAO PARAFUSOS E FERRAM')).toBe('Azulao Parafusos e Ferram'); /* o "e" do meio é conectivo; letra solta (T R) fica */
    expect(nomeDoExtratoSemCaixa('PAGAMENTO PIX 11222333000181 Z R SINTETICA LTDA', 'Z R SINTETICA LTDA')).toBe('Pix · Z R Sintetica Ltda');
    expect(nomeDoExtratoSemCaixa('LIQUIDACAO BOLETO SICREDI 11222333000181 POSTO X LTDA', 'POSTO X LTDA')).toBe('Liquidação boleto · Posto X Ltda');
    expect(nomeDoExtratoSemCaixa('INTEGR.CAPITAL SUBSCRITO', '')).toBe('Integr.capital Subscrito');
  });
});
