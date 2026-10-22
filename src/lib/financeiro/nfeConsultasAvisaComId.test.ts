/**
 * NOTA-FORNECEDOR-CNPJ-ACHADO-01 — quem grava o cadastro PELA NOTA avisa com o ID do fornecedor: a tela de Lancamentos rele^ so' os
 * avisados (sem id, so' os da pagina) — e a previa da nota seguinte ficava com o cadastro velho ("sem CNPJ"). O caso da Elos (22/10).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
const avisos = vi.hoisted(() => ({ notificar: vi.fn() }));
vi.mock('@/hooks/useFornecedoresDoCliente', () => ({ notificarFornecedoresMudaram: (...a: unknown[]) => avisos.notificar(...a) }));
vi.mock('@/integrations/supabase/client', () => {
  const linha = (data: unknown) => { const b: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'or', 'update', 'in']) b[m] = () => b;
    b.maybeSingle = async () => ({ data, error: null }); b.then = (ok: (x: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok); return b; };
  return { supabase: {
    rpc: async () => ({ data: { alteracao_id: 'alt-1' }, error: null }),
    from: (t: string) => linha(t === 'fornecedor_campos_alteracoes' ? { fornecedor_id: 'elos' } : { nome_fantasia: null, inscricao_estadual: null }),
  } };
});
import { atualizarCamposDoCadastro, completarCadastroPeloXml, desfazerCamposDoCadastro, gravarDocumentoNoCadastro } from './nfeConsultas';

beforeEach(() => avisos.notificar.mockClear());
describe('os gravadores do cadastro pela nota avisam COM o id', () => {
  it('atualizar pela comparacao', async () => {
    await atualizarCamposDoCadastro('elos', { cpf_cnpj: '11.222.333/0004-24' }, 'nota', 'NF 1', 'cli');
    expect(avisos.notificar).toHaveBeenCalledWith('cli', ['elos']);
  });
  it('desfazer (o fornecedor sai da trilha)', async () => {
    await desfazerCamposDoCadastro('alt-1', 'cli');
    expect(avisos.notificar).toHaveBeenCalledWith('cli', ['elos']);
  });
  it('gravar o documento e completar pelo XML', async () => {
    await gravarDocumentoNoCadastro('cli', 'elos', '11.222.333/0004-24');
    expect(avisos.notificar).toHaveBeenLastCalledWith('cli', ['elos']);
    await completarCadastroPeloXml('cli', 'elos', { documento: '11222333000424', nome: 'X', fantasia: 'Fantasia', ie: '123' });
    expect(avisos.notificar).toHaveBeenLastCalledWith('cli', ['elos']);
  });
});
