/**
 * AUDIT-DELETE-01a — a tela não apaga nada na conciliação, no extrato, nos documentos, nos fornecedores e no plano de contas: o
 * vínculo do extrato se desfaz por `fn_conciliacao_item_desfazer` e o fornecedor sai de uso por `fn_fornecedor_excluir`, os dois
 * com motivo e trilha no banco. A fonte não tem `.delete()` nessas seis tabelas (com auto-teste do detector).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RPC = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => RPC(...a) } }));
const RECOMPUTAR = vi.fn(async (_extratoId: string) => undefined);
vi.mock('@/lib/financeiro/conciliacaoSync', async (orig) => ({
  ...(await orig<Record<string, unknown>>()), recomputarStatusExtrato: (extratoId: string) => RECOMPUTAR(extratoId),
}));

import { useConciliacaoBancariaItens } from './useConciliacaoBancariaItens';

const TABELAS = ['conciliacao_bancaria_itens', 'extrato_bancario_v2', 'financeiro_lancamento_documentos',
  'financeiro_documento_vinculos', 'financeiro_fornecedores', 'financeiro_plano_contas'];
/** `.from('<tabela>')` seguido de `.delete(` no mesmo encadeamento (até 300 caracteres, quebra de linha inclusive). */
const deletesDiretos = (fonte: string) => TABELAS.flatMap((t) =>
  [...fonte.matchAll(new RegExp(`from\\(\\s*['"\`]${t}['"\`][^;]{0,300}?\\.delete\\(`, 'g'))].map(() => t));

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) && n !== 'types.ts' ? [p] : [];
  });
}

beforeEach(() => { RPC.mockReset(); RECOMPUTAR.mockClear(); });

describe('a fonte não apaga nas seis tabelas', () => {
  it('o detector acha o padrão (uma linha e várias)', () => {
    expect(deletesDiretos("await supabase.from('financeiro_fornecedores').delete().eq('id', x);")).toEqual(['financeiro_fornecedores']);
    expect(deletesDiretos("supabase\n  .from('conciliacao_bancaria_itens' as any)\n  .delete()\n  .eq('id', id);")).toEqual(['conciliacao_bancaria_itens']);
    expect(deletesDiretos("supabase.from('financeiro_fornecedores').update({ ativo: false });")).toEqual([]);
  });
  it('nenhum arquivo de src faz DELETE direto nelas', () => {
    const achados = arquivos(resolve(__dirname, '..')).flatMap((f) => deletesDiretos(readFileSync(f, 'utf8')).map((t) => `${f}: ${t}`));
    expect(achados).toEqual([]);
  });
  it('o cadastro do fornecedor exclui pelo gesto, com o motivo', () => {
    const fonte = readFileSync(resolve(__dirname, '../components/financeiro-v2/FornecedorFormDialog.tsx'), 'utf8');
    expect(fonte).toMatch(/rpc\('fn_fornecedor_excluir', \{\s*p_fornecedor_id: editing\.id, p_motivo: MOTIVO_EXCLUIR_FORNECEDOR, p_simular: false,/);
  });
});

describe('desfazer um vínculo do extrato (o hook)', () => {
  it('chama o gesto com o motivo e recomputa o extrato que o banco devolveu', async () => {
    RPC.mockResolvedValue({ data: { ok: true, extrato_id: 'e1' }, error: null });
    await useConciliacaoBancariaItens().remover('i1', 'vínculo errado');
    expect(RPC).toHaveBeenCalledWith('fn_conciliacao_item_desfazer', { p_item_id: 'i1', p_motivo: 'vínculo errado', p_simular: false });
    expect(RECOMPUTAR).toHaveBeenCalledWith('e1');
  });
  it('a recusa do banco vira erro com a frase', async () => {
    RPC.mockResolvedValue({ data: { ok: false, recusa: { frase: 'Este vínculo com o extrato já foi desfeito.' } }, error: null });
    await expect(useConciliacaoBancariaItens().remover('i1', 'x')).rejects.toThrow('Este vínculo com o extrato já foi desfeito.');
    expect(RECOMPUTAR).not.toHaveBeenCalled();
  });
});
