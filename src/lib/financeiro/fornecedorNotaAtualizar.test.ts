/**
 * FORN-NOTA-ATUALIZAR-01 (Gabriel 28/11 07:00) — (3) completar o CNPJ pela comparação NUNCA duplica o de outro cadastro vivo (a trava do banco é
 * adiada: a `fn_fornecedor_atualizar_campos` grava); (4) depois de completar, a nota seguinte acha o cadastro PELO CNPJ. Dados SINTÉTICOS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
const banco = vi.hoisted(() => ({ achados: [] as unknown[], erro: null as unknown, rpc: vi.fn(async (..._a: unknown[]) => ({ data: { alteracao_id: 'alt-1' }, error: null })) }));
vi.mock('@/hooks/useFornecedoresDoCliente', () => ({ notificarFornecedoresMudaram: () => undefined }));
vi.mock('@/integrations/supabase/client', () => {
  const lista = () => { const b: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b;
    b.then = (ok: (x: { data: unknown; error: unknown }) => unknown) => Promise.resolve({ data: banco.erro ? null : banco.achados, error: banco.erro }).then(ok); return b; };
  return { supabase: { rpc: (...a: unknown[]) => banco.rpc(...a), from: () => lista() } };
});
import { atualizarCamposDoCadastro } from './nfeConsultas';
import { resolverEmitente } from './nfe/resolverEmitente';

beforeEach(() => { banco.achados = []; banco.erro = null; banco.rpc.mockClear(); });
describe('FORN-NOTA-ATUALIZAR-01 — completar o CNPJ', () => {
  it('o CNPJ já é de OUTRO cadastro vivo: recusa com a frase, nada vai ao banco', async () => {
    banco.achados = [{ id: 'outro', nome: 'Materiais Exemplo (antigo)', ativo: true, fundido_em_id: null }];
    const r = await atualizarCamposDoCadastro('este', { cpf_cnpj: '11.222.333/0001-81' }, 'nota', 'NF 1', 'cli');
    expect(r).toEqual({ ok: false, frase: 'Este CNPJ já é do cadastro "Materiais Exemplo (antigo)". Nada foi gravado — escolha esse cadastro.' });
    expect(banco.rpc).not.toHaveBeenCalled();
  });
  it('a conferência falhou: não grava (P146 — falha nunca vira "não há")', async () => {
    banco.erro = { message: 'timeout' };
    const r = await atualizarCamposDoCadastro('este', { cpf_cnpj: '11.222.333/0001-81' }, 'nota', 'NF 1', 'cli');
    expect(r.ok).toBe(false);
    expect(banco.rpc).not.toHaveBeenCalled();
  });
  it('ninguém tem o CNPJ (ou é o próprio cadastro): grava pela função de sempre', async () => {
    expect((await atualizarCamposDoCadastro('este', { cpf_cnpj: '11.222.333/0001-81' }, 'nota', 'NF 1', 'cli')).ok).toBe(true);
    banco.achados = [{ id: 'este', nome: 'Silva e Souza Ltda', ativo: true, fundido_em_id: null }];
    expect((await atualizarCamposDoCadastro('este', { cpf_cnpj: '11.222.333/0001-81' }, 'nota', 'NF 1', 'cli')).ok).toBe(true);
    expect(banco.rpc).toHaveBeenCalledTimes(2);
  });
  it('sem CNPJ entre os campos: nem confere (o resto grava como sempre)', async () => {
    banco.achados = [{ id: 'outro', nome: 'Qualquer', ativo: true, fundido_em_id: null }];
    expect((await atualizarCamposDoCadastro('este', { nome_fantasia: 'Materiais Exemplo' }, 'nota', 'NF 1', 'cli')).ok).toBe(true);
  });
  it('(4) depois de completar, a nota seguinte acha o cadastro PELO CNPJ (o nome escrito diferente não importa mais)', () => {
    const emitente = { documento: '11222333000181', nome: 'SILVA SOUZA LTDA - ME', fantasia: 'MATERIAIS EXEMPLO' };
    const antes = resolverEmitente(emitente, [{ id: 'este', nome: 'Silva e Souza Ltda', cpf_cnpj: null, ativo: true }], null);
    expect(antes.achadoPor).not.toBe('documento');
    const depois = resolverEmitente(emitente, [{ id: 'este', nome: 'Silva e Souza Ltda', cpf_cnpj: '11.222.333/0001-81', ativo: true }], null);
    expect([depois.achadoPor, depois.propostoId]).toEqual(['documento', 'este']);
  });
});
