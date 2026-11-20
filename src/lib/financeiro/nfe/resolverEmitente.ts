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
 * FORN-ACHAR-CNPJ-01 (URGENTE, Gabriel 19/11 08:11 — NF 210.789 COAMO, Sidrolândia: o "+ Da nota" achou "pelo nome" o AUTO POSTO … SIDROLANDIA
 *   pela FANTASIA da nota ("SIDROLANDIA", a cidade da unidade) contida no nome do posto, e o "atualizar cadastro" gravaria a COAMO nele):
 *   · com CNPJ/CPF no XML o documento MANDA: exato; senão a RAIZ (outra filial: não propõe, cadastrar esta filial); cadastro com OUTRO
 *     documento nunca é proposto (nem pelo resolvedor do banco);
 *   · pelo nome, SÓ a RAZÃO SOCIAL INTEIRA normalizada IGUAL (sem acento/caixa, sem o CNPJ grudado do MEI, sem o "Ltda/ME/EPP/S.A." do fim),
 *     entre os cadastros ativos SEM documento — nunca palavra solta, cidade, fantasia ou "contém";
 *   · nada disso: "cadastrar com os dados da nota" (nunca casar com outro).
 */
import { soDigitos } from './formatos';
import { normalizarParaBusca } from '@/lib/texto/busca';

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

/** FORN-ACHAR-CNPJ-01 — a razão social para comparar: sem acento/caixa/pontuação, sem o CNPJ/CPF grudado (MEI) e sem o tipo da empresa no
 *  fim ("ltda", o "ltd" cortado do DANFE, "me", "epp", "eireli", "s a"). '' se sobrar menos de 5 letras (nunca casa). */
export function razaoParaComparar(nome: string | null | undefined): string {
  let t = normalizarParaBusca(nomeSemDocumento(nome ?? '')).replace(/[^a-z0-9]+/g, ' ').trim();
  for (let antes = ''; antes !== t;) { antes = t; t = t.replace(/\s+(ltda|ltd|me|epp|eireli|mei|s a|sa)$/, '').trim(); }
  return t.replace(/\s/g, '').length >= 5 ? t : '';
}
const ativoDeVerdade = (f: FornecedorParaResolver) => f.ativo !== false && !f.fundido_em_id;
/** Os cadastros ATIVOS e SEM DOCUMENTO cuja RAZÃO SOCIAL (ou um apelido gravado) é IGUAL a um dos nomes — `razaoParaComparar` dos dois lados.
 *  A fantasia da nota NÃO entra (é a cidade da unidade, o nome da loja: o caso COAMO × Auto Posto). */
export function semDocumentoPeloNome(nomes: readonly (string | null | undefined)[], fornecedores: readonly FornecedorParaResolver[]): FornecedorParaResolver[] {
  const procurados = new Set(nomes.map(razaoParaComparar).filter(Boolean));
  if (!procurados.size) return [];
  return fornecedores.filter((f) => soDigitos(f.cpf_cnpj) === '' && ativoDeVerdade(f)
    && [f.nome, ...(f.aliases_norm ?? [])].some((x) => { const r = razaoParaComparar(x); return r !== '' && procurados.has(r); }));
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
  /* FORN-FILIAL-01 / FORN-ACHAR-CNPJ-01 — sem o documento exato, a RAIZ: outra filial da mesma empresa no cadastro → não propõe (o lançamento
     iria para a filial errada); a tela oferece cadastrar esta filial */
  const raiz = raizDoCnpj(emitente.documento);
  const filiais = raiz ? fornecedores.filter((f) => ativo(f) && raizDoCnpj(f.cpf_cnpj) === raiz) : [];
  const peloNome = idPeloNome ? fornecedores.find((f) => f.id === idPeloNome) ?? null : null;
  /* o resolvedor do banco (nome normalizado igual): só vale para o cadastro SEM documento — o de OUTRO documento nunca é proposto */
  if (peloNome && soDigitos(peloNome.cpf_cnpj) === '') {
    return { achadoPor: 'nome', candidatos: [peloNome], propostoId: peloNome.id, inativo: !ativo(peloNome), cadastroSemDocumento: true, filialDiferente: false };
  }
  if (filiais.length) {
    return { achadoPor: 'nome', candidatos: filiais.slice(0, 1), propostoId: null, inativo: false, cadastroSemDocumento: false, filialDiferente: true };
  }
  /* NOTA-FORNECEDOR-DUPLICA-01 — o cadastro SEM documento, pela RAZÃO SOCIAL inteira igual (FORN-ACHAR-CNPJ-01: nunca a fantasia) */
  const porBusca = semDocumentoPeloNome([emitente.nome, ...outrosNomes], fornecedores);
  if (porBusca.length >= 1) {
    return { achadoPor: 'nome', candidatos: porBusca, propostoId: porBusca.length === 1 ? porBusca[0].id : null, inativo: false,
      cadastroSemDocumento: true, filialDiferente: false };
  }
  return { achadoPor: null, candidatos: [], propostoId: null, inativo: false, cadastroSemDocumento: false, filialDiferente: false };
}
