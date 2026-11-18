/** NOTA-ITENS-SALVAR-01 — o vincular completa o documento que existe (só o vazio; nunca troca o digitado). Sintético. */
import { describe, expect, it, vi } from 'vitest';
import { camposQueCompletamODocumento, completarODocumentoDaNota } from './completarDocumentoDaNota';

const CHAVE = '50260912345678000190550010000032401000034071';
const NOTA = { chave: CHAVE, numero: '000.003.240', emissao: '2026-09-29', totalCent: 1241700 };
const doc = (extra: Record<string, unknown> = {}) => ({ id: 'd1', lancamentoId: 'l1', versao: 3, especie: 'nf', numero: '3240', chave: null, valorCent: null, emissao: null, ...extra });

describe('NOTA-ITENS-SALVAR-01 — completar o documento da nota', () => {
  it('o PDF de antes sem chave ganha a chave (e o que estiver vazio); o nº igual pelo curto', () => {
    expect(camposQueCompletamODocumento(doc(), NOTA)).toEqual({ chave_acesso: CHAVE, data_emissao: '2026-09-29', valor_documento: '12417.00' });
    expect(camposQueCompletamODocumento(doc({ numero: null, emissao: '2026-09-28', valorCent: 1241700 }), NOTA))
      .toEqual({ chave_acesso: CHAVE, numero: '000.003.240' });
  });
  it('nunca troca: já tem chave, nº de outra nota, boleto, nota sem chave de 44', () => {
    expect([camposQueCompletamODocumento(doc({ chave: CHAVE }), NOTA), camposQueCompletamODocumento(doc({ numero: '3241' }), NOTA),
      camposQueCompletamODocumento(doc({ especie: 'boleto' }), NOTA), camposQueCompletamODocumento(doc(), { ...NOTA, chave: '123' }),
      camposQueCompletamODocumento(undefined, NOTA)]).toEqual([null, null, null, null, null]);
  });
  it('grava pela porta de sempre com a versão lida; a recusa volta em frase', async () => {
    const editarDocumento = vi.fn(async () => {});
    const gj = { documentos: vi.fn(async () => [doc()]), editarDocumento };
    expect(await completarODocumentoDaNota('cli', 'd1', 'l1', NOTA, gj)).toBeNull();
    expect(editarDocumento).toHaveBeenCalledWith('cli', 'd1', 3, { chave_acesso: CHAVE, data_emissao: '2026-09-29', valor_documento: '12417.00' });
    const recusa = { documentos: vi.fn(async () => [doc()]), editarDocumento: vi.fn(async () => { throw new Error('Conflito de versao (esperada 3, atual 4)'); }) };
    expect(await completarODocumentoDaNota('cli', 'd1', 'l1', NOTA, recusa)).toBe('Conflito de versao (esperada 3, atual 4)');
  });
});
