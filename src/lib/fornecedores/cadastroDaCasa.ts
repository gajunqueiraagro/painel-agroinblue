/**
 * FORN-SELETOR-PADRAO-01 fatia 2c, commit 1a — O CADASTRO DA CASA NÃO DUPLICA FORNECEDOR.
 *
 * A regra do "+" de todo seletor de fornecedor, num lugar só: antes de criar, o `NovoFornecedorDialog` pergunta aqui o que fazer.
 *   1. já existe ATIVO com o mesmo nome (normalizado, dentro do cliente): não cria — seleciona o existente e avisa;
 *   2. existe só INATIVO com o nome: oferece reativar (ou não reativar e voltar); reativado, é o selecionado;
 *   3. o CPF/CNPJ informado já é de OUTRO fornecedor ativo do cliente (nome diferente): não cria — mostra de quem é e oferece
 *      selecioná-lo; nunca decide sozinho entre os dois;
 *   4. nada disso: cria como sempre (quem grava é o hospedeiro, com a fazenda que a tela passar).
 * FORN-FILIAL-01 (Gabriel, 21/10/2026 08h17) — MATRIZ E FILIAIS TÊM A MESMA RAZÃO SOCIAL; o CNPJ (e a cidade) as distinguem:
 *   · mesmo nome + CNPJ válido DIFERENTE do homônimo: CRIA (outra filial), com o aviso "Já existe <nome> com CNPJ <completo>; este fica
 *     como outro cadastro" (`filial`);
 *   · homônimo SEM documento (vazio ou fora do padrão) e o novo COM CNPJ: PERGUNTA — preencher o CNPJ naquele cadastro, ou criar outro
 *     (`homonimo_sem_documento`);
 *   · o novo SEM documento: seleciona o existente (como antes);
 *   · CNPJ de outro ATIVO: não cria (como antes); o mesmo CNPJ E o mesmo nome é o próprio cadastro (seleciona). INATIVO não bloqueia
 *     pelo documento (FORN-01b). O banco trava o mesmo (`trg_fornecedor_documento_ativo_unico`).
 * Puro: a decisão não vai ao banco; quem lê é a `FonteDoCadastro` (a do banco mora em `cadastroDaCasaBanco.ts`).
 * ⚠ DÍVIDA FORN-NOME-UNICO-BANCO-01: não há índice único de nome no banco. A checagem é da tela: duas pessoas criando o mesmo
 *   nome ao mesmo tempo ainda duplicam.
 */
import { normalizeFornecedorNome } from '@/lib/financeiro/normalizeFornecedorNome';
import { formatarDocumento } from './fornecedorTexto';
import { chaveDoDocumento, situacaoDoGravado } from './documentoFiscal';

export interface FornecedorDoCadastro {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string | null;
  ativo: boolean;
  /** só para o desempate entre homônimos: o mais antigo primeiro */
  created_at?: string | null;
  /** FORN-MESCLAR-02d — absorvido por mesclagem viva: o cadastro que ficou (o fim da cadeia) */
  mescladoEm?: FornecedorDoCadastro | null;
}

export type DecisaoDoCadastro =
  | { tipo: 'criar' }
  /** FORN-FILIAL-01 — outra filial: cria, e o aviso diz qual homônimo já existe */
  | { tipo: 'filial'; fornecedor: FornecedorDoCadastro }
  /** FORN-FILIAL-01 — o homônimo não tem documento: preencher o CNPJ nele, ou criar outro */
  | { tipo: 'homonimo_sem_documento'; fornecedor: FornecedorDoCadastro }
  | { tipo: 'ja_existe'; fornecedor: FornecedorDoCadastro }
  | { tipo: 'inativo'; fornecedor: FornecedorDoCadastro }
  | { tipo: 'documento_de_outro'; fornecedor: FornecedorDoCadastro };

export const FRASE_JA_EXISTE = 'Já existe um fornecedor com este nome. Ele foi selecionado.';
export const FRASE_FALHA_AO_CONFERIR = 'Não foi possível conferir o cadastro. Nada foi gravado.';
export const FRASE_FALHA_AO_REATIVAR = 'Não foi possível reativar. Nada foi gravado.';
export const fraseDoInativo = (f: FornecedorDoCadastro): string => `Existe um fornecedor inativo com este nome: ${f.nome}.`;
/** FORN-FILIAL-01 — o aviso de quem cria outra filial */
export const fraseDaFilial = (f: FornecedorDoCadastro): string =>
  `Já existe ${f.nome} com CNPJ ${formatarDocumento(f.cpf_cnpj)}; este fica como outro cadastro.`;
/** FORN-FILIAL-01 — a pergunta do homônimo sem documento */
export const fraseDoHomonimoSemDocumento = (f: FornecedorDoCadastro, documento: string): string =>
  `Já existe ${f.nome} sem CNPJ. Preencher o CNPJ ${formatarDocumento(documento)} naquele cadastro, ou criar outro?`;
export const fraseDoDocumento = (f: FornecedorDoCadastro): string =>
  `Este CPF/CNPJ já é de ${f.nome}${f.cpf_cnpj ? ` (${formatarDocumento(f.cpf_cnpj)})` : ''}.`;

/** o mais antigo primeiro; sem data, pelo id — entre homônimos a escolha é sempre a mesma */
const maisAntigoPrimeiro = (a: FornecedorDoCadastro, b: FornecedorDoCadastro): number =>
  (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id);

/**
 * `doCliente`: os fornecedores DESTE cliente que interessam à pergunta — os de mesmo nome normalizado (ativos e inativos) e os
 * ativos (para o documento). Pode vir a lista inteira: a função filtra.
 */
export function decidirCadastro(
  entrada: { nome: string; cpfCnpj?: string | null },
  doCliente: readonly FornecedorDoCadastro[],
): DecisaoDoCadastro {
  const alvo = normalizeFornecedorNome(entrada.nome);
  if (alvo === '') return { tipo: 'criar' };
  /* FORN-EDITAR-01: a chave do validador único (dígitos E letras — o CNPJ alfanumérico não perde as letras) */
  const doc = chaveDoDocumento(entrada.cpfCnpj);
  const mesmoNome = doCliente.filter((f) => normalizeFornecedorNome(f.nome) === alvo).sort(maisAntigoPrimeiro);
  /* o CNPJ de outro ATIVO: com o mesmo nome é o próprio cadastro (seleciona); com outro nome, não cria */
  if (doc !== '') {
    const dono = doCliente.filter((f) => f.ativo && !f.mescladoEm && chaveDoDocumento(f.cpf_cnpj) === doc).sort(maisAntigoPrimeiro)[0];
    if (dono) return normalizeFornecedorNome(dono.nome) === alvo ? { tipo: 'ja_existe', fornecedor: dono } : { tipo: 'documento_de_outro', fornecedor: dono };
  }
  /* FORN-MESCLAR-02d — o homônimo MESCLADO não se reativa (o banco recusa): vale o cadastro em que ele foi mesclado */
  const ativos = [...mesmoNome.filter((f) => f.ativo && !f.mescladoEm),
    ...mesmoNome.map((f) => f.mescladoEm).filter((d): d is FornecedorDoCadastro => !!d && d.ativo)];
  const temDocumento = (f: FornecedorDoCadastro) => situacaoDoGravado(f.cpf_cnpj).situacao === 'ok';
  if (ativos.length) {
    /* o novo SEM documento: o homônimo é ele (como antes) */
    if (doc === '') return { tipo: 'ja_existe', fornecedor: ativos[0] };
    /* FORN-FILIAL-01 — o homônimo sem documento: pergunta; todos com CNPJ diferente: outra filial */
    const semDoc = ativos.find((f) => !temDocumento(f));
    if (semDoc) return { tipo: 'homonimo_sem_documento', fornecedor: semDoc };
    return { tipo: 'filial', fornecedor: ativos[0] };
  }
  const inativo = mesmoNome.find((f) => !f.ativo && !f.mescladoEm);
  if (inativo) {
    /* FORN-FILIAL-01 — o inativo com OUTRO CNPJ é outra filial: cria (com o aviso); sem documento, oferece reativar (como antes) */
    if (doc !== '' && temDocumento(inativo)) return { tipo: 'filial', fornecedor: inativo };
    return { tipo: 'inativo', fornecedor: inativo };
  }
  return { tipo: 'criar' };
}

export interface FonteDoCadastro {
  /** Todos os fornecedores do cliente com este nome normalizado, ATIVOS E INATIVOS. Falha = exceção. */
  lerPorNome: (clienteId: string, nomeNormalizado: string) => Promise<FornecedorDoCadastro[]>;
  /** Os ATIVOS do cliente (o leitor único). Falha = exceção. */
  lerAtivos: (clienteId: string) => Promise<FornecedorDoCadastro[]>;
  /** Reativa um fornecedor DESTE cliente. Falha = exceção. */
  reativar: (clienteId: string, id: string) => Promise<void>;
  /** FORN-FILIAL-01 — grava o CPF/CNPJ num cadastro DESTE cliente que está SEM documento. Falha = exceção. */
  preencherDocumento: (clienteId: string, id: string, documento: string) => Promise<void>;
}

export type RespostaDoCadastro = DecisaoDoCadastro | { tipo: 'erro'; frase: string };

/** Lê o que precisa e decide. Nunca grava. Falha de leitura vira frase — e NÃO vira "pode criar". */
export async function conferirCadastro(
  fonte: FonteDoCadastro, clienteId: string, entrada: { nome: string; cpfCnpj?: string | null },
): Promise<RespostaDoCadastro> {
  try {
    const [mesmoNome, ativos] = await Promise.all([
      fonte.lerPorNome(clienteId, normalizeFornecedorNome(entrada.nome)),
      fonte.lerAtivos(clienteId),
    ]);
    const porId = new Map<string, FornecedorDoCadastro>();
    for (const f of [...ativos, ...mesmoNome]) porId.set(f.id, f);   // o de `lerPorNome` (lido agora) vence o do cache
    return decidirCadastro(entrada, Array.from(porId.values()));
  } catch {
    return { tipo: 'erro', frase: FRASE_FALHA_AO_CONFERIR };
  }
}

/** FORN-FILIAL-01 — "preencher o CNPJ naquele cadastro": grava e devolve o cadastro já com o documento. */
export async function preencherDocumentoDoCadastro(
  fonte: FonteDoCadastro, clienteId: string, f: FornecedorDoCadastro, documento: string,
): Promise<{ ok: true; fornecedor: FornecedorDoCadastro } | { ok: false; frase: string }> {
  try {
    await fonte.preencherDocumento(clienteId, f.id, documento);
    return { ok: true, fornecedor: { ...f, cpf_cnpj: documento } };
  } catch (e) {
    return { ok: false, frase: `Não foi possível gravar o CNPJ naquele cadastro. Nada foi gravado. (${e instanceof Error ? e.message : String(e)})` };
  }
}

export async function reativarDoCadastro(
  fonte: FonteDoCadastro, clienteId: string, f: FornecedorDoCadastro,
): Promise<{ ok: true; fornecedor: FornecedorDoCadastro } | { ok: false; frase: string }> {
  try {
    await fonte.reativar(clienteId, f.id);
    return { ok: true, fornecedor: { ...f, ativo: true } };
  } catch {
    return { ok: false, frase: FRASE_FALHA_AO_REATIVAR };
  }
}
