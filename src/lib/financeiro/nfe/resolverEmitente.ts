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
 * NOTA-FORNECEDOR-DUPLICA-01 (Gabriel, 21/10/2026 — NF 7.655 do NJ: o cadastro antigo SEM CNPJ nao foi achado, "Cadastrar" criou um
 *   duplicado e o segundo clique deu conflito) — nada pelo documento e nada pelo resolvedor do banco (que exige o nome normalizado
 *   IGUAL) -> procura pelo NOME, com a REGRA DA BUSCA DO CADASTRO (`buscarFornecedores`, a mesma das telas), entre os cadastros ATIVOS
 *   SEM DOCUMENTO: o nome da nota, o mesmo sem o prefixo/sufixo de CNPJ ou CPF (o MEI escreve "22.522.463 NOME"), a fantasia e os
 *   `outrosNomes` (a razao social da Receita). Um so' -> proposto, `cadastroSemDocumento` (a tela oferece completar com o CNPJ);
 *   dois ou mais -> o operador escolhe. Criar outro e' escolha do operador, nunca o padrao.
 */
import { soDigitos } from './formatos';
import { buscarFornecedores } from '@/lib/fornecedores/buscaDeFornecedor';

export interface FornecedorParaResolver {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
  ativo?: boolean | null;
  /** NOTA-FORNECEDOR-DUPLICA-01 — o que a busca do cadastro tambem le^ (opcionais: sem eles, so' a razao social). */
  nome_fantasia?: string | null;
  aliases_norm?: readonly string[] | null;
  fundido_em_id?: string | null;
}

/** O nome sem o CNPJ/CPF grudado no comeco ou no fim (o MEI: "22.522.463 FULANO DE TAL", "FULANO DE TAL 12345678900"). */
export function nomeSemDocumento(nome: string): string {
  return nome
    .replace(/^\s*(\d{2}\.?\d{3}\.?\d{3}(\/?\d{4}-?\d{2})?|\d{3}\.?\d{3}\.?\d{3}-?\d{2})\s*[-–]?\s+/, '')
    .replace(/\s+[-–]?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}(\/?\d{4}-?\d{2})?)\s*$/, '')
    .trim();
}

/** Os cadastros ATIVOS e SEM DOCUMENTO que a busca do cadastro acha por algum dos nomes (termo de 5 letras ou mais). */
export function semDocumentoPeloNome(nomes: readonly (string | null | undefined)[], fornecedores: readonly FornecedorParaResolver[]): FornecedorParaResolver[] {
  const semDoc = fornecedores.filter((f) => soDigitos(f.cpf_cnpj) === '');
  const termos = [...new Set(nomes.flatMap((n) => (n ? [n, nomeSemDocumento(n)] : [])).map((t) => t.trim()).filter((t) => t.replace(/\W/g, '').length >= 5))];
  const achados = new Map<string, FornecedorParaResolver>();
  for (const t of termos) for (const f of buscarFornecedores(semDoc, t, 'ativos')) achados.set(f.id, f);
  return [...achados.values()];
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
  emitente: { documento: string; nome: string; fantasia?: string | null },
  fornecedores: readonly FornecedorParaResolver[],
  /** O id que o resolvedor do banco devolveu para o NOME do emitente (`null` = nao resolveu, ou ainda nao consultado). */
  idPeloNome: string | null,
  /** NOTA-FORNECEDOR-DUPLICA-01 — outros nomes do emitente para a busca (a razao social da Receita). */
  outrosNomes: readonly (string | null | undefined)[] = [],
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
  /* NOTA-FORNECEDOR-DUPLICA-01 — o cadastro SEM documento, pela regra da busca do cadastro */
  const porBusca = semDocumentoPeloNome([emitente.nome, emitente.fantasia, ...outrosNomes], fornecedores);
  if (porBusca.length >= 1) {
    return { achadoPor: 'nome', candidatos: porBusca, propostoId: porBusca.length === 1 ? porBusca[0].id : null, inativo: false,
      cadastroSemDocumento: true, filialDiferente: false };
  }
  return { achadoPor: null, candidatos: [], propostoId: null, inativo: false, cadastroSemDocumento: false, filialDiferente: false };
}
