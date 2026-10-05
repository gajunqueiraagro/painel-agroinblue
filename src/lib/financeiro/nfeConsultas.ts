/**
 * AS CONSULTAS DO "NOVO A PARTIR DE XML" — FIN-NFE-XML-01d. O que a tela precisa do BANCO para propor o lancamento de uma
 * nota. Um lugar so': nenhuma tela faz estas consultas por conta propria. (O leitor e a proposta sao puros e moram em
 * `src/lib/financeiro/nfe/`; isto aqui fala com o supabase e por isso fica fora daquela pasta.)
 */
import { supabase } from '@/integrations/supabase/client';
import { lerResolucoesDoBanco } from '@/v2/lib/importLanc/importLancamentosView';
import { documentoFormatado, soDigitos } from '@/lib/financeiro/nfe/formatos';
import type { UltimaClassificacao } from '@/lib/financeiro/nfe/proporLancamento';

/** Onde uma nota ja' esta' registrada — uma linha de `fn_documento_chave_ja_registrada`. */
export interface OcorrenciaDaNota {
  origem: 'lancamento' | 'oc';
  documentoId: string;
  lancamentoId: string | null;
  operacaoId: string | null;
  operacaoTipo: string | null;
  numero: string | null;
  descricao: string | null;
  data: string | null;
  valor: number | null;
}

const texto = (o: object, chave: string): string | null => {
  const v: unknown = Reflect.get(o, chave);
  return typeof v === 'string' && v ? v : null;
};

/** "Esta chave ja' esta' registrada neste cliente?" — o dono e' o banco (FIN-NFE-XML-01b1). Falha de leitura = lista vazia. */
export async function notaJaRegistrada(clienteId: string, chave: string): Promise<OcorrenciaDaNota[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_documento_chave_ja_registrada', { p_cliente: clienteId, p_chave: chave });
  if (error || !Array.isArray(data)) return [];
  const saida: OcorrenciaDaNota[] = [];
  for (const linha of data) {
    if (!linha || typeof linha !== 'object') continue;
    const origem = texto(linha, 'origem');
    const documentoId = texto(linha, 'documento_id');
    if ((origem !== 'lancamento' && origem !== 'oc') || !documentoId) continue;
    const valor: unknown = Reflect.get(linha, 'valor');
    saida.push({
      origem, documentoId, lancamentoId: texto(linha, 'lancamento_id'), operacaoId: texto(linha, 'operacao_id'),
      operacaoTipo: texto(linha, 'operacao_tipo'), numero: texto(linha, 'numero'), descricao: texto(linha, 'descricao'),
      data: texto(linha, 'data'), valor: typeof valor === 'number' ? valor : null,
    });
  }
  return saida;
}

/** O fornecedor que o RESOLVEDOR DO BANCO acha para este nome (nome normalizado e apelidos) — o mesmo do de-para. */
export async function fornecedorPeloNome(clienteId: string, nome: string): Promise<string | null> {
  if (!nome.trim()) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_classificacao_depara_resolver', {
    p_cliente_id: clienteId, p_textos: { fornecedor: [nome], fazenda: [], safra: [], subcentro: [] },
  });
  if (error) return null;
  return lerResolucoesDoBanco(data).fornecedor?.[nome]?.valor ?? null;
}

/** A classificacao do ULTIMO lancamento vivo e classificado deste fornecedor (pela competencia). */
export async function ultimaClassificacaoDoFornecedor(clienteId: string, fornecedorId: string): Promise<UltimaClassificacao | null> {
  const { data, error } = await supabase
    .from('financeiro_lancamentos_v2')
    .select('plano_conta_id, subcentro, macro_custo, grupo_custo, centro_custo, escopo_negocio, data_competencia')
    .eq('cliente_id', clienteId).eq('favorecido_id', fornecedorId).eq('cancelado', false)
    .not('plano_conta_id', 'is', null)
    .order('data_competencia', { ascending: false }).order('created_at', { ascending: false })
    .limit(1);
  const l = error ? null : data?.[0];
  if (!l || !l.plano_conta_id || !l.subcentro || !l.data_competencia) return null;
  return {
    plano_conta_id: l.plano_conta_id, subcentro: l.subcentro, macro_custo: l.macro_custo ?? null, grupo_custo: l.grupo_custo ?? null,
    centro_custo: l.centro_custo ?? null, escopo_negocio: l.escopo_negocio ?? null, data: l.data_competencia,
  };
}

/** A inscricao estadual de cada fazenda do cliente (`fazenda_cadastros.ie`): fazenda_id -> ie. */
export async function iePorFazenda(clienteId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('fazenda_cadastros').select('fazenda_id, ie').eq('cliente_id', clienteId);
  const mapa: Record<string, string> = {};
  if (error || !data) return mapa;
  for (const l of data) if (l.fazenda_id && l.ie && soDigitos(l.ie)) mapa[l.fazenda_id] = l.ie;
  return mapa;
}

/**
 * Grava o CNPJ/CPF do XML no cadastro do fornecedor — o MESMO update da edicao de fornecedor (`FornecedorFormDialog`), no
 * formato dos demais cadastros (com mascara). ⚠ SO' EM CADASTRO SEM DOCUMENTO: o filtro vai no proprio update, para nunca
 * sobrescrever um documento que alguem digitou entre a leitura e o salvar. Devolve a mensagem de erro, ou `null`.
 */
export async function gravarDocumentoNoCadastro(clienteId: string, fornecedorId: string, documento: string): Promise<string | null> {
  const formatado = documentoFormatado(documento);
  if (!formatado) return null;
  const { error } = await supabase.from('financeiro_fornecedores').update({ cpf_cnpj: formatado })
    .eq('id', fornecedorId).eq('cliente_id', clienteId).or('cpf_cnpj.is.null,cpf_cnpj.eq.');
  return error ? error.message : null;
}
