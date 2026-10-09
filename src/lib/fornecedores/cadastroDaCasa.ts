/**
 * FORN-SELETOR-PADRAO-01 fatia 2c, commit 1a — O CADASTRO DA CASA NÃO DUPLICA FORNECEDOR.
 *
 * A regra do "+" de todo seletor de fornecedor, num lugar só: antes de criar, o `NovoFornecedorDialog` pergunta aqui o que fazer.
 *   1. já existe ATIVO com o mesmo nome (normalizado, dentro do cliente): não cria — seleciona o existente e avisa;
 *   2. existe só INATIVO com o nome: oferece reativar (ou não reativar e voltar); reativado, é o selecionado;
 *   3. o CPF/CNPJ informado já é de OUTRO fornecedor ativo do cliente (nome diferente): não cria — mostra de quem é e oferece
 *      selecioná-lo; nunca decide sozinho entre os dois;
 *   4. nada disso: cria como sempre (quem grava é o hospedeiro, com a fazenda que a tela passar).
 * Puro: a decisão não vai ao banco; quem lê é a `FonteDoCadastro` (a do banco mora em `cadastroDaCasaBanco.ts`).
 * ⚠ DÍVIDA FORN-NOME-UNICO-BANCO-01: não há índice único de nome no banco. A checagem é da tela: duas pessoas criando o mesmo
 *   nome ao mesmo tempo ainda duplicam.
 */
import { normalizeFornecedorNome } from '@/lib/financeiro/normalizeFornecedorNome';
import { formatarDocumento, soDigitos } from './fornecedorTexto';

export interface FornecedorDoCadastro {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string | null;
  ativo: boolean;
  /** só para o desempate entre homônimos: o mais antigo primeiro */
  created_at?: string | null;
}

export type DecisaoDoCadastro =
  | { tipo: 'criar' }
  | { tipo: 'ja_existe'; fornecedor: FornecedorDoCadastro }
  | { tipo: 'inativo'; fornecedor: FornecedorDoCadastro }
  | { tipo: 'documento_de_outro'; fornecedor: FornecedorDoCadastro };

export const FRASE_JA_EXISTE = 'Já existe um fornecedor com este nome. Ele foi selecionado.';
export const FRASE_FALHA_AO_CONFERIR = 'Não foi possível conferir o cadastro. Nada foi gravado.';
export const FRASE_FALHA_AO_REATIVAR = 'Não foi possível reativar. Nada foi gravado.';
export const fraseDoInativo = (f: FornecedorDoCadastro): string => `Existe um fornecedor inativo com este nome: ${f.nome}.`;
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
  const mesmoNome = doCliente.filter((f) => normalizeFornecedorNome(f.nome) === alvo).sort(maisAntigoPrimeiro);
  const ativo = mesmoNome.find((f) => f.ativo);
  if (ativo) return { tipo: 'ja_existe', fornecedor: ativo };
  const inativo = mesmoNome.find((f) => !f.ativo);
  if (inativo) return { tipo: 'inativo', fornecedor: inativo };
  const doc = soDigitos(entrada.cpfCnpj);
  if (doc !== '') {
    const dono = doCliente.filter((f) => f.ativo && soDigitos(f.cpf_cnpj) === doc).sort(maisAntigoPrimeiro)[0];
    if (dono) return { tipo: 'documento_de_outro', fornecedor: dono };
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
