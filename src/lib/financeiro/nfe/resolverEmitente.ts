/**
 * QUEM E' O EMITENTE NO CADASTRO DE FORNECEDORES? — FIN-NFE-XML-01d. Um dono so' (a tela "Importar XML" do documento vai
 * reutilizar). PURO: recebe a lista de fornecedores do cliente e, quando ja' consultado, o id que o RESOLVEDOR DO BANCO achou
 * pelo nome (`fn_classificacao_depara_resolver`, por `fornecedorPeloNome`).
 *
 * A ORDEM (decisoes do Gabriel, 05/10/2026):
 *   1. pelo DOCUMENTO — CNPJ/CPF do emitente contra `cpf_cnpj` do cadastro, SO' DIGITOS dos dois lados;
 *      · um ATIVO -> e' ele;  · dois ou mais ATIVOS -> o operador escolhe;  · so' INATIVO -> propoe e avisa "inativo";
 *   2. nao achou pelo documento -> pelo NOME, com o resolvedor do banco; cadastro achado pelo nome que NAO tem documento
 *      oferece gravar o do XML;
 *   3. nada -> oferece criar, com nome e documento do XML.
 */
import { soDigitos } from './formatos';

export interface FornecedorParaResolver {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
  ativo?: boolean | null;
}

export interface ResolucaoEmitente {
  /** Por onde o cadastro foi achado; `null` = nao achou nenhum. */
  achadoPor: 'documento' | 'nome' | null;
  /** Os cadastros candidatos: um (o caso comum), dois ou mais ativos com o mesmo documento, ou nenhum. */
  candidatos: FornecedorParaResolver[];
  /** O cadastro proposto: o unico candidato. Com dois ou mais, `null` — o operador escolhe. */
  propostoId: string | null;
  /** O proposto esta' INATIVO (so' ha' cadastro inativo com este documento). */
  inativo: boolean;
  /** Achado pelo nome, e o cadastro nao tem documento: a tela oferece gravar o do XML. */
  cadastroSemDocumento: boolean;
}

const ativo = (f: FornecedorParaResolver) => f.ativo !== false;

export function resolverEmitente(
  emitente: { documento: string; nome: string },
  fornecedores: readonly FornecedorParaResolver[],
  /** O id que o resolvedor do banco devolveu para o NOME do emitente (`null` = nao resolveu, ou ainda nao consultado). */
  idPeloNome: string | null,
): ResolucaoEmitente {
  const doc = soDigitos(emitente.documento);
  const peloDocumento = doc ? fornecedores.filter((f) => soDigitos(f.cpf_cnpj) === doc) : [];
  const ativos = peloDocumento.filter(ativo);
  if (ativos.length >= 1) {
    return { achadoPor: 'documento', candidatos: ativos, propostoId: ativos.length === 1 ? ativos[0].id : null, inativo: false, cadastroSemDocumento: false };
  }
  if (peloDocumento.length >= 1) {
    return { achadoPor: 'documento', candidatos: [peloDocumento[0]], propostoId: peloDocumento[0].id, inativo: true, cadastroSemDocumento: false };
  }
  const peloNome = idPeloNome ? fornecedores.find((f) => f.id === idPeloNome) ?? null : null;
  if (peloNome) {
    return {
      achadoPor: 'nome', candidatos: [peloNome], propostoId: peloNome.id, inativo: !ativo(peloNome),
      cadastroSemDocumento: soDigitos(peloNome.cpf_cnpj) === '',
    };
  }
  return { achadoPor: null, candidatos: [], propostoId: null, inativo: false, cadastroSemDocumento: false };
}
