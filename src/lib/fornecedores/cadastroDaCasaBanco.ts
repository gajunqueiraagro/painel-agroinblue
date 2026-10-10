/**
 * A fonte do banco do cadastro da casa (FORN-SELETOR-PADRAO-01 fatia 2c, commit 1a). Só leitura por nome e a reativação;
 * os ativos vêm do LEITOR ÚNICO. Depois de reativar, avisa o leitor (quem mostra relê).
 */
import { supabase } from '@/integrations/supabase/client';
import { leitorDeFornecedores, notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import type { FonteDoCadastro, FornecedorDoCadastro } from './cadastroDaCasa';

export const fonteDoCadastroNoBanco: FonteDoCadastro = {
  lerPorNome: async (clienteId, nomeNormalizado) => {
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .select('id, nome, cpf_cnpj, fazenda_id, ativo, created_at')
      .eq('cliente_id', clienteId)
      .eq('nome_normalizado', nomeNormalizado);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ id: r.id, nome: r.nome, cpf_cnpj: r.cpf_cnpj, fazenda_id: r.fazenda_id, ativo: r.ativo !== false, created_at: r.created_at }));
  },
  lerAtivos: async (clienteId) => {
    const lista = await leitorDeFornecedores.ler(clienteId);
    return lista.map((f) => ({ id: f.id, nome: f.nome, cpf_cnpj: f.cpf_cnpj, fazenda_id: f.fazenda_id, ativo: f.ativo }));
  },
  reativar: async (clienteId, id) => {
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .update({ ativo: true })
      .eq('cliente_id', clienteId)
      .eq('id', id)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('nenhuma linha reativada');
    notificarFornecedoresMudaram(clienteId);
  },
};

/**
 * O CRIAR da casa para o hospedeiro que não tem um criar próprio (fatia 2c, commit 1b — o credor do contrato): grava nome,
 * documento e a fazenda que a tela passar, e avisa o leitor único. Falha = exceção com o motivo; o diálogo a escreve ao lado
 * do botão. Só é chamado DEPOIS de a regra do cadastro da casa dizer que pode criar.
 */
export async function criarFornecedorDaCasa(
  clienteId: string, dados: { nome: string; cpfCnpj?: string | null; fazendaId?: string | null },
): Promise<FornecedorDoCadastro> {
  const { data, error } = await supabase
    .from('financeiro_fornecedores')
    .insert({ cliente_id: clienteId, fazenda_id: dados.fazendaId || null, nome: dados.nome, cpf_cnpj: dados.cpfCnpj || null })
    .select('id, nome, cpf_cnpj, fazenda_id, ativo')
    .single();
  if (error) throw new Error(error.message);
  notificarFornecedoresMudaram(clienteId);
  return { id: data.id, nome: data.nome, cpf_cnpj: data.cpf_cnpj, fazenda_id: data.fazenda_id, ativo: data.ativo !== false };
}
