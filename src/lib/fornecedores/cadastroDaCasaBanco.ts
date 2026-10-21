/**
 * A fonte do banco do cadastro da casa (FORN-SELETOR-PADRAO-01 fatia 2c, commit 1a). Só leitura por nome e a reativação;
 * os ativos vêm do LEITOR ÚNICO. Depois de reativar, avisa o leitor (quem mostra relê).
 */
import { supabase } from '@/integrations/supabase/client';
import { leitorDeFornecedores, notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import type { FonteDoCadastro, FornecedorDoCadastro } from './cadastroDaCasa';
import { validarDocumento } from './documentoFiscal';

export const fonteDoCadastroNoBanco: FonteDoCadastro = {
  lerPorNome: async (clienteId, nomeNormalizado) => {
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .select('id, nome, cpf_cnpj, fazenda_id, ativo, created_at, fundido_em_id')
      .eq('cliente_id', clienteId)
      .eq('nome_normalizado', nomeNormalizado);
    if (error) throw new Error(error.message);
    /* FORN-MESCLAR-02d — o homônimo MESCLADO não é oferecido para reativar (o banco recusa): ele leva junto o cadastro em que foi
       mesclado (o fim da cadeia), e a regra o seleciona como "já existe". Foi por aqui que um absorvido voltou a ativo. */
    type Linha = NonNullable<typeof data>[number];
    const conhecidos = new Map<string, Linha>();
    for (const r of data ?? []) conhecidos.set(r.id, r);
    for (let volta = 0; volta < 5; volta++) {
      const faltam = [...new Set([...conhecidos.values()].map((r) => r.fundido_em_id).filter((x): x is string => !!x && !conhecidos.has(x)))];
      if (!faltam.length) break;
      const { data: donos, error: e2 } = await supabase.from('financeiro_fornecedores')
        .select('id, nome, cpf_cnpj, fazenda_id, ativo, created_at, fundido_em_id').eq('cliente_id', clienteId).in('id', faltam);
      if (e2) throw new Error(e2.message);
      for (const d of donos ?? []) conhecidos.set(d.id, d);
    }
    const fim = (r: Linha): Linha | null => { let x: Linha | undefined = r; for (let k = 0; k < 6 && x?.fundido_em_id; k++) x = conhecidos.get(x.fundido_em_id); return x && !x.fundido_em_id ? x : null; };
    const paraCadastro = (r: Linha) => ({ id: r.id, nome: r.nome, cpf_cnpj: r.cpf_cnpj, fazenda_id: r.fazenda_id, ativo: r.ativo !== false, created_at: r.created_at });
    return (data ?? []).map((r) => {
      const dono = r.fundido_em_id ? fim(r) : null;
      return { ...paraCadastro(r), mescladoEm: r.fundido_em_id ? (dono ? paraCadastro(dono) : null) : null };
    });
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
  /* FORN-FILIAL-01 — "preencher o CNPJ naquele cadastro": só no cadastro DESTE cliente que está SEM documento (o banco ainda trava o
     CNPJ de outro ativo, no fim da transação) */
  preencherDocumento: async (clienteId, id, documento) => {
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .update({ cpf_cnpj: documento })
      .eq('cliente_id', clienteId)
      .eq('id', id)
      .or('cpf_cnpj.is.null,cpf_cnpj.eq.')
      .select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('o cadastro já tem documento');
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
  /* FORN-EDITAR-01 — o documento passa pelo validador único: inválido não grava (a frase vai ao lado do botão) */
  const documento = validarDocumento(dados.cpfCnpj);
  if (!documento.valido) throw new Error(documento.motivo ?? 'CPF/CNPJ inválido.');
  const { data, error } = await supabase
    .from('financeiro_fornecedores')
    .insert({ cliente_id: clienteId, fazenda_id: dados.fazendaId || null, nome: dados.nome, cpf_cnpj: documento.formatado || null })
    .select('id, nome, cpf_cnpj, fazenda_id, ativo')
    .single();
  if (error) throw new Error(error.message);
  notificarFornecedoresMudaram(clienteId);
  return { id: data.id, nome: data.nome, cpf_cnpj: data.cpf_cnpj, fazenda_id: data.fazenda_id, ativo: data.ativo !== false };
}
