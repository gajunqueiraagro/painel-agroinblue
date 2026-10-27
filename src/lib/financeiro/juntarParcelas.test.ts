/**
 * P96a — juntar as parcelas soltas (PURO + gravadores falsos). Os números do caso da NF 46.994 (sintéticos no nome).
 *   U1 as seis achadas pela nota = juntar (na ordem k), a soma real · U2 faltando uma (5 de 6) ou uma já parcela = nada a juntar
 *   U3 a frase do efeito no DRE ("abril +R$ 1.862,48; maio, junho e outubro −1 parcela cada"); outro ano diz o ano
 *   U4 a resposta do banco (ok e recusa) · U5 a NF digitada divergente (mesma chave) e a frase; a que bate com a nota não diverge
 *   U6 "Usar a nota lida" manda só valor e emissão, com a versão do documento
 */
import { describe, it, expect, vi } from 'vitest';
import {
  fraseDaNfDigitada, fraseDaSafra, fraseDoEfeito, lerJuncao, nfDigitadaDivergente, soltasParaJuntar, usarANotaLida,
  type DocumentoDaParcela, type GravadoresDaJuncao,
} from './juntarParcelas';
import type { LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useFinanceiroV2', () => ({ notificarLancamentosMudaram: vi.fn() }));

const lanc = (k: number, valorCent: number, extra: Partial<LancamentoJaLancado> = {}): LancamentoJaLancado => ({
  id: `l${k}`, vencimento: null, pagamento: null, competencia: null, descricao: `Tinta sintetica - ${k}/6`, valorCent, status: 'realizado',
  conciliado: false, financiamentoId: null, numeroDocumento: null, fornecedorId: 'f1', fornecedorNome: 'Fornecedor', fornecedorPor: 'cnpj',
  parcelas: [], por: ['fracao'], fracaoN: 6, cancelado: false, ...extra,
});
const VALORES = [62085, 62080, 62083, 62083, 62083, 62083];
const seis = () => [4, 1, 6, 2, 5, 3].map((k) => lanc(k, VALORES[k - 1] ?? 0));
const comFracoes = (ls: LancamentoJaLancado[]) => ({ pelaNota: ls, fracoes: new Map(ls.map((l) => [l.id, 6])) });

describe('P96a — juntar as parcelas soltas', () => {
  it('U1 as seis achadas pela nota: os ids na ordem k e a soma real', () => {
    expect(soltasParaJuntar(comFracoes(seis()))).toEqual({ n: 6, ids: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'], somaCent: 372497 });
  });
  it('U2 faltando uma, ou uma já parcela: nada a juntar', () => {
    expect(soltasParaJuntar(comFracoes(seis().filter((l) => l.id !== 'l6')))).toBeNull();
    expect(soltasParaJuntar(comFracoes(seis().map((l) => (l.id === 'l2' ? { ...l, financiamentoId: 'fin' } : l))))).toBeNull();
    expect(soltasParaJuntar(null)).toBeNull();
  });
  it('U3 a frase do efeito no DRE', () => {
    expect(fraseDoEfeito([
      { mes: '2026-04', valorCent: 186248, parcelas: 3 }, { mes: '2026-05', valorCent: -62085, parcelas: -1 },
      { mes: '2026-06', valorCent: -62080, parcelas: -1 }, { mes: '2026-10', valorCent: -62083, parcelas: -1 },
    ])).toBe('abril +R$ 1.862,48; maio, junho e outubro −1 parcela cada');
    expect(fraseDoEfeito([{ mes: '2026-12', valorCent: 1000, parcelas: 1 }, { mes: '2027-01', valorCent: -1000, parcelas: -1 }]))
      .toBe('dezembro +R$ 10,00; janeiro de 2027 −1 parcela');
    expect(fraseDoEfeito([])).toBe('');
  });
  it('U4 a resposta do banco: ok e recusa', () => {
    const ok = lerJuncao({ ok: true, parcelas: 6, soma: 3724.97, descricao: 'Tinta sintetica', safra_nova_codigo: '25/26-Pec',
      lista: [{ numero: 1, lancamento_id: 'l1', valor: 620.85, safra_antes_codigo: '26/27-Pec', safra_depois_codigo: '25/26-Pec' },
              { numero: 2, lancamento_id: 'l2', valor: 620.8, safra_antes_codigo: '25/26-Pec', safra_depois_codigo: '25/26-Pec' }],
      efeito_por_mes: [{ mes: '2026-04', valor: 1862.48, parcelas: 3 }] });
    expect(ok && ok.ok && [ok.somaCent, ok.lista[1]?.valorCent, ok.efeito[0]?.valorCent]).toEqual([372497, 62080, 186248]);
    expect(ok && ok.ok ? fraseDaSafra(ok.lista) : null).toBe('a safra de 1 passa de 26/27-Pec para 25/26-Pec');
    expect(lerJuncao({ ok: false, recusa: { motivo: 'mes_fechado', frase: 'O mês 03/2033 está fechado.' } }))
      .toEqual({ ok: false, motivo: 'mes_fechado', frase: 'O mês 03/2033 está fechado.' });
    expect(lerJuncao(null)).toBeNull();
  });
  it('U5 a NF digitada divergente e a frase; a que bate com a nota não diverge', () => {
    const doc: DocumentoDaParcela = { id: 'd1', lancamentoId: 'l6', versao: 2, especie: 'nf', numero: '46994', chave: '5126 0000',
      valorCent: 62084, emissao: '2026-10-10' };
    const nota = { chave: '51260000', numero: '000046994', totalCent: 372500, emissao: '2026-04-06' };
    const d = nfDigitadaDivergente([doc], () => '6/6', nota);
    expect(d?.id).toBe('d1');
    expect(d && fraseDaNfDigitada(d, nota)).toBe('A 6/6 tem uma NF digitada à mão: R$ 620,84, emissão 10/10/2026 — a nota lida é R$ 3.725,00, emissão 06/04/2026');
    expect(nfDigitadaDivergente([{ ...doc, valorCent: 372500, emissao: '2026-04-06' }], () => '6/6', nota)).toBeNull();
    expect(nfDigitadaDivergente([{ ...doc, chave: null, numero: '111' }], () => '6/6', nota)).toBeNull();
  });
  it('U6 "Usar a nota lida": só valor e emissão, com a versão do documento', async () => {
    const editar = vi.fn(async () => {});
    const gj: GravadoresDaJuncao = { juntar: vi.fn(), documentos: vi.fn(), editarDocumento: editar };
    const d = { id: 'd1', lancamentoId: 'l6', versao: 2, especie: 'nf', numero: '46994', chave: null, valorCent: 62084, emissao: '2026-10-10', rotulo: '6/6' };
    expect(await usarANotaLida('c1', d, { totalCent: 372500, emissao: '2026-04-06' }, gj)).toBeNull();
    expect(editar).toHaveBeenCalledWith('c1', 'd1', 2, { valor_documento: '3725.00', data_emissao: '2026-04-06' });
  });
});
