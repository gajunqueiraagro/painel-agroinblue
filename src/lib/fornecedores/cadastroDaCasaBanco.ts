/**
 * A fonte do banco do cadastro da casa (FORN-SELETOR-PADRAO-01 fatia 2c, commit 1a). Só leitura por nome e a reativação;
 * os ativos vêm do LEITOR ÚNICO. Depois de reativar, avisa o leitor (quem mostra relê).
 */
import { supabase } from '@/integrations/supabase/client';
import { leitorDeFornecedores, notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import type { FonteDoCadastro } from './cadastroDaCasa';

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
