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
 * FORN-FILIAL-01 (Gabriel, 21/10/2026) — matriz e filiais tem a MESMA razao social: o cadastro achado pelo NOME que tem um CNPJ da MESMA
 *   RAIZ (8 digitos) e de OUTRA filial NAO e' proposto (o lancamento iria para a filial errada) e nunca recebe o CNPJ do XML: a tela
 *   oferece criar o cadastro desta filial (`filialDiferente`).
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
  /** FORN-FILIAL-01 — achado pelo nome, e o cadastro e' OUTRA filial (mesma raiz, CNPJ diferente): nao e' proposto; criar esta filial */
  filialDiferente: boolean;
}

/** FORN-FILIAL-01 — os 8 primeiros digitos do CNPJ (a raiz: a empresa); '' se nao e' CNPJ de 14 digitos */
export const raizDoCnpj = (doc: string | null | undefined): string => { const d = soDigitos(doc); return d.length === 14 ? d.slice(0, 8) : ''; };

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
    return { achadoPor: 'documento', candidatos: ativos, propostoId: ativos.length === 1 ? ativos[0].id : null, inativo: false, cadastroSemDocumento: false, filialDiferente: false };
  }
  if (peloDocumento.length >= 1) {
    return { achadoPor: 'documento', candidatos: [peloDocumento[0]], propostoId: peloDocumento[0].id, inativo: true, cadastroSemDocumento: false, filialDiferente: false };
  }
  const peloNome = idPeloNome ? fornecedores.find((f) => f.id === idPeloNome) ?? null : null;
  if (peloNome) {
    const raiz = raizDoCnpj(emitente.documento);
    const filialDiferente = raiz !== '' && raizDoCnpj(peloNome.cpf_cnpj) === raiz && soDigitos(peloNome.cpf_cnpj) !== doc;
    return {
      achadoPor: 'nome', candidatos: [peloNome], propostoId: filialDiferente ? null : peloNome.id, inativo: !ativo(peloNome),
      cadastroSemDocumento: soDigitos(peloNome.cpf_cnpj) === '', filialDiferente,
    };
  }
  return { achadoPor: null, candidatos: [], propostoId: null, inativo: false, cadastroSemDocumento: false, filialDiferente: false };
}
