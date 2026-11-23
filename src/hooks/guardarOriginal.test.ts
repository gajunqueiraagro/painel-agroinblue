/**
 * CONC-PAINEL-ARQUIVOS-01 (b, lote 115620, Gabriel 23/11) — guardar o ORIGINAL da importação: sobe ao `fin-documentos` no caminho que a
 * `fn_importacao_guardar_arquivo` confere e registra; falhar NUNCA desfaz a importação (devolve a frase). Dado SINTÉTICO.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pedidos = vi.hoisted(() => ({ upload: [] as [string, string][], rpc: [] as [string, Record<string, unknown>][], erroUpload: null as string | null, erroRpc: null as string | null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: (b: string) => ({ upload: async (c: string) => { pedidos.upload.push([b, c]); return { data: pedidos.erroUpload ? null : { path: c }, error: pedidos.erroUpload ? { message: pedidos.erroUpload } : null }; } }) },
    rpc: async (fn: string, a: Record<string, unknown>) => { pedidos.rpc.push([fn, a]); return { data: pedidos.erroRpc ? null : { ok: true }, error: pedidos.erroRpc ? { message: pedidos.erroRpc } : null }; },
  },
}));
import { caminhoDoOriginal, extensaoDoOriginal, guardarOriginalDaImportacao } from './useArquivosDoMes';

const ARQ = new File(['OFXHEADER:100'], 'Extrato Exemplo SET.OFX', { type: '' });

describe('guardar o original da importação', () => {
  beforeEach(() => { pedidos.upload = []; pedidos.rpc = []; pedidos.erroUpload = null; pedidos.erroRpc = null; });

  it('o caminho é o que o banco confere: <cliente>/importacoes/<conta>/<id>.<ext minúscula>', () => {
    expect(caminhoDoOriginal({ clienteId: 'cli', contaId: 'cc1', importacaoId: 'imp1', nome: 'Extrato Exemplo SET.OFX' })).toBe('cli/importacoes/cc1/imp1.ofx');
    expect(caminhoDoOriginal({ clienteId: 'cli', contaId: null, importacaoId: 'imp1', nome: 'sem-extensao' })).toBe('cli/importacoes/sem-conta/imp1.bin');
    expect(extensaoDoOriginal('planilha.xlsx')).toBe('xlsx');
  });

  it('sobe ao fin-documentos e DEPOIS registra pela função (uma chamada de cada)', async () => {
    expect(await guardarOriginalDaImportacao({ clienteId: 'cli', contaId: 'cc1', importacaoId: 'imp1', arquivo: ARQ })).toBeNull();
    expect(pedidos.upload).toEqual([['fin-documentos', 'cli/importacoes/cc1/imp1.ofx']]);
    expect(pedidos.rpc).toEqual([['fn_importacao_guardar_arquivo', { p_importacao_id: 'imp1', p_caminho: 'cli/importacoes/cc1/imp1.ofx' }]]);
  });

  it('falhou o upload: não registra; devolve a frase (a importação fica)', async () => {
    pedidos.erroUpload = 'Network down';
    expect(await guardarOriginalDaImportacao({ clienteId: 'cli', contaId: 'cc1', importacaoId: 'imp1', arquivo: ARQ })).toBe('o arquivo original não foi guardado');
    expect(pedidos.rpc).toEqual([]);
  });

  it('o arquivo já estava no bucket (reenvio): registra mesmo assim; a recusa do banco vira a frase', async () => {
    pedidos.erroUpload = 'The resource already exists';
    expect(await guardarOriginalDaImportacao({ clienteId: 'cli', contaId: 'cc1', importacaoId: 'imp1', arquivo: ARQ })).toBeNull();
    pedidos.erroUpload = null; pedidos.erroRpc = 'ja_guardado: esta importação já tem o arquivo original.';
    expect(await guardarOriginalDaImportacao({ clienteId: 'cli', contaId: 'cc1', importacaoId: 'imp1', arquivo: ARQ })).toBe('o arquivo original não foi guardado');
  });

  it('o Importar banco guarda o original DEPOIS de gravar, só de arquivo (o Open Finance não tem), e nunca desfaz a importação', () => {
    const I = readFileSync(resolve(process.cwd(), 'src/components/conciliacao/ImportarBancoInline.tsx'), 'utf8');
    const depoisDeGravar = I.indexOf('const r = await confirmarImportacao(');
    const guardar = I.indexOf('await guardarOriginalDaImportacao(');
    expect(depoisDeGravar).toBeGreaterThan(0);
    expect(guardar).toBeGreaterThan(depoisDeGravar);
    expect(I).toContain('const original = origemBanco ? null : arquivo;');
    expect(I).toContain("if (falha) setResultado({ tipo: 'ok', texto: `${r.mensagem} · ${falha}` });");
  });
});
