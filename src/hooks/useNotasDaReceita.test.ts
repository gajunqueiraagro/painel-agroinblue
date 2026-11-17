/**
 * F34-SITUACAO-01 (Gabriel 17/11) — a lista "Notas da Receita" acha a nota JÁ LANÇADA à mão pelo critério do "+ Da nota", na hora (dados SINTÉTICOS).
 *   Caso: as NF 118.480 e 118.481 do NJ tinham 3 lançamentos "NF 000.118.48x" com anexo, sem a chave numa nota_fiscal → a lista dizia "Nova".
 *   S1 achada pelo nº (emitente) = Já no sistema · S2 sem achado = Nova · S3 a consulta que falha NÃO vira "Nova" (erro) · S4 a ligada pela chave não pergunta
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tabelas: Record<string, unknown[]> = {};
vi.mock('@/integrations/supabase/client', () => {
  const consulta = (nome: string) => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, in: () => q,
      then: (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: tabelas[nome] ?? [], error: null }).then(ok) };
    return q;
  };
  return { supabase: { from: (nome: string) => consulta(nome) } };
});
const notaJaLancada = vi.fn();
vi.mock('@/lib/financeiro/nfeConsultas', () => ({ notaJaLancada: (...a: unknown[]) => notaJaLancada(...a) }));

import { lerNotasDaReceita } from './useNotasDaReceita';

const chave = (n: number) => `502611${'12345678000190'}55001${String(n).padStart(9, '0')}1123456780`;
const recebida = (n: number) => ({ id: `id-${n}`, titular_id: 't1', chave: chave(n), situacao: 'xml', emitente_documento: '12345678000190',
  emitente_nome: 'Uniao Sintetica', emissao: '2026-11-10', valor_cent: 652500, nota_id: null, recebido_em: null, resumo: {} });

describe('F34-SITUACAO-01 — a leitura da lista', () => {
  beforeEach(() => {
    notaJaLancada.mockReset();
    tabelas.fiscal_dfe_recebidos = [recebida(118480), recebida(118481), recebida(999)];
    tabelas.fiscal_titulares = [{ id: 't1', nome: 'Produtor Exemplo' }];
    tabelas.fiscal_dfe_controle = [];
    tabelas.nota_fiscal = [];
  });
  it('S1/S2 118.480 e 118.481 achadas pelo nº com o emitente = Já no sistema; a 999 sem achado = Nova; pergunta como o "+ Da nota"', async () => {
    notaJaLancada.mockImplementation(async (_c: string, e: { numero: string }) => ({ ok: true,
      valor: e.numero.endsWith('118480') || e.numero.endsWith('118481') ? [{ cancelado: false, por: ['numero', 'documento'] }] : [] }));
    const d = await lerNotasDaReceita('cli');
    const sit = Object.fromEntries(d.lista.map((n) => [n.numero, n.sit]));
    expect(sit).toEqual({ '118.480': 'no_sistema', '118.481': 'no_sistema', '999': 'nova' });
    expect(notaJaLancada).toHaveBeenCalledWith('cli', expect.objectContaining({ numero: '000118481', chave: chave(118481), emitenteDocumento: '12345678000190',
      nomes: ['Uniao Sintetica'] }));
  });
  it('S3 a consulta que falha não deixa a nota como "Nova": a leitura falha com a frase', async () => {
    notaJaLancada.mockResolvedValue({ ok: false, motivo: 'rede' });
    await expect(lerNotasDaReceita('cli')).rejects.toThrow('Não consegui conferir quais notas já estão no sistema.');
  });
  it('S4 a chave já numa nota_fiscal não pergunta de novo', async () => {
    tabelas.nota_fiscal = [{ chave_acesso: chave(118480) }];
    notaJaLancada.mockResolvedValue({ ok: true, valor: [] });
    const d = await lerNotasDaReceita('cli');
    expect(d.lista.find((n) => n.numero === '118.480')?.sit).toBe('no_sistema');
    expect(notaJaLancada).toHaveBeenCalledTimes(2);
  });
});
