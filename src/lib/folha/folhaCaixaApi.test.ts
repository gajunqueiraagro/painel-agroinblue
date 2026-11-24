/** FOLHA-NA-CAIXA-01 — o banco da folha: as recusas são as frases do banco; o "já aplicado" do simular vira a prévia `jaAplicado`. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const upload = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), storage: { from: () => ({ upload: (...a: unknown[]) => upload(...a) }) } } }));

import { folhaCaixaApiDoBanco, FRASE_SEM_BANCO, fraseDoErroDaFolha } from './folhaCaixaApi';

const DOC = { md5: 'a'.repeat(32), nome: 'r.pdf', tipo: '13_1' as const, competencia: '2026-11', total: 1, empregador: '1' };
const JA = { code: 'P0001', message: 'Este documento do contador já foi aplicado (desfaça antes de aplicar de novo).' };
beforeEach(() => { rpc.mockReset(); upload.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('folhaCaixaApiDoBanco', () => {
  it('o simular do já aplicado = prévia com jaAplicado; no aplicar, a frase do banco', async () => {
    rpc.mockResolvedValue({ data: null, error: JA });
    const s = await folhaCaixaApiDoBanco.aplicar('cli', null, DOC, [], true);
    expect(s.ok === true && s.dados.jaAplicado).toBe(true);
    const a = await folhaCaixaApiDoBanco.aplicar('cli', null, DOC, [], false);
    expect(a).toEqual({ ok: false, erro: JA.message });
    expect(rpc.mock.calls[0]).toEqual(['fn_folha_recibos_aplicar', { p_cliente: 'cli', p_entrada: null, p_documento: DOC, p_itens: [], p_simular: true }]);
  });
  it('frase pronta só nas recusas da regra; o resto é a genérica (o texto cru só no console)', () => {
    expect(fraseDoErroDaFolha({ code: '22023', message: 'Recibos: pedido inválido.' })).toBe('Recibos: pedido inválido.');
    /* fora das recusas da regra: a genérica COM o código (o erro do NJ 14:13 veio calado) */
    expect(fraseDoErroDaFolha({ code: 'PGRST202', message: 'Could not find the function' })).toMatch(/código PGRST202/);
    expect(fraseDoErroDaFolha(null)).toBe(FRASE_SEM_BANCO);
  });
  it('o ja_aplicado do banco (contrato 118570) também vira jaAplicado; resposta estranha = erro, nunca prévia vazia', async () => {
    rpc.mockResolvedValue({ data: { ok: true, simulado: true, ja_aplicado: true, documentos: [] }, error: null });
    const r = await folhaCaixaApiDoBanco.aplicar('cli', null, DOC, [], true);
    expect(r.ok === true && r.dados.jaAplicado).toBe(true);
    rpc.mockResolvedValue({ data: 'x', error: null });
    expect((await folhaCaixaApiDoBanco.aplicar('cli', null, DOC, [], true)).ok).toBe(false);
  });
  it('desfazer leva o motivo; o upload vai ao bucket da folha sem sobrescrever', async () => {
    rpc.mockResolvedValue({ data: { ok: true, valores: 2, criados: 1, documentos: 3 }, error: null });
    expect(await folhaCaixaApiDoBanco.desfazer('cli', 'a'.repeat(32), 'motivo', true)).toEqual({ ok: true, dados: { valores: 2, criados: 1, documentos: 3 } });
    expect(rpc.mock.calls[0]).toEqual(['fn_folha_recibos_desfazer', { p_cliente: 'cli', p_md5: 'a'.repeat(32), p_motivo: 'motivo', p_simular: true }]);
    upload.mockResolvedValue({ error: { message: 'Duplicate' } });
    expect(await folhaCaixaApiDoBanco.subir('cli/x-p1.pdf', new Uint8Array([1]))).toEqual({ ok: false, erro: 'O PDF não subiu.' });
    expect(upload.mock.calls[0][0]).toBe('cli/x-p1.pdf');
    expect(upload.mock.calls[0][2]).toEqual({ contentType: 'application/pdf', upsert: false });
  });
});
