/**
 * FORN-EDITAR-01 — A CONFERÊNCIA DE REPETIDO DO CADASTRO COMPLETO (`FornecedorFormDialog`), ao criar e ao editar.
 *
 * Dentro do MESMO cliente, ativos E inativos, fora o próprio registro (na edição): (a) outro fornecedor com o mesmo CPF/CNPJ —
 * comparado pela chave do validador único (`chaveDoDocumento`: dígitos e letras, sem pontuação), nunca pelo texto gravado;
 * (b) na edição, outro fornecedor com o mesmo nome normalizado (a regra de sempre, `normalizeFornecedorNome`).
 * O SISTEMA NÃO BLOQUEIA: a tela escreve o aviso e o operador decide ("Salvar mesmo assim").
 * A decisão é pura; a leitura do banco é injetável (a do banco mora em `lerCadastroParaConferir`, abaixo).
 */
import { supabase } from '@/integrations/supabase/client';
import { normalizeFornecedorNome } from '@/lib/financeiro/normalizeFornecedorNome';
import { lerTodasAsPaginas } from '@/v2/lib/importLanc/lerTodasAsPaginas';
import { chaveDoDocumento } from './documentoFiscal';

export interface FornecedorParaConferir { id: string; nome: string; cpf_cnpj: string | null; ativo: boolean }

export interface Repetidos {
  porDocumento: FornecedorParaConferir[];
  porNome: FornecedorParaConferir[];
}

/** Quem repete o documento e (se pedido) o nome — fora o próprio registro. Vazio não repete nada. */
export function acharRepetidos(
  entrada: { proprioId?: string | null; nome: string; cpfCnpj: string | null; conferirNome: boolean },
  doCliente: readonly FornecedorParaConferir[],
): Repetidos {
  const outros = doCliente.filter((f) => f.id !== entrada.proprioId);
  const doc = chaveDoDocumento(entrada.cpfCnpj);
  const nome = normalizeFornecedorNome(entrada.nome);
  return {
    porDocumento: doc === '' ? [] : outros.filter((f) => chaveDoDocumento(f.cpf_cnpj) === doc),
    porNome: !entrada.conferirNome || nome === '' ? [] : outros.filter((f) => normalizeFornecedorNome(f.nome) === nome),
  };
}

export const temRepetido = (r: Repetidos): boolean => r.porDocumento.length > 0 || r.porNome.length > 0;

const quem = (f: FornecedorParaConferir): string => `${f.nome} (${f.ativo ? 'ativo' : 'inativo'})`;

/** A frase do aviso, escrita no formulário (nunca em toast). */
export function fraseDosRepetidos(r: Repetidos): string {
  const partes: string[] = [];
  if (r.porDocumento.length > 0) partes.push(`Este CPF/CNPJ já está em: ${r.porDocumento.map(quem).join(', ')}.`);
  if (r.porNome.length > 0) partes.push(`Já existe fornecedor com este nome: ${r.porNome.map(quem).join(', ')}.`);
  return partes.join(' ');
}

export const FRASE_FALHA_AO_CONFERIR_REPETIDO = 'Não foi possível conferir se o CPF/CNPJ ou o nome já existem. Nada foi gravado.';

/**
 * Os fornecedores do cliente que interessam: os com documento (todos, paginado até o fim — o gravado tem formatos misturados e
 * só se compara pela chave) e os de mesmo nome normalizado. Ativos e inativos. Falha = exceção.
 */
export async function lerCadastroParaConferir(clienteId: string, nome: string): Promise<FornecedorParaConferir[]> {
  const comDocumento = await lerTodasAsPaginas<{ id: string; nome: string; cpf_cnpj: string | null; ativo: boolean | null }>(
    async (de, ate, contar) => {
      const { data, error, count } = await supabase.from('financeiro_fornecedores')
        .select('id, nome, cpf_cnpj, ativo', contar ? { count: 'exact' } : undefined)
        .eq('cliente_id', clienteId).not('cpf_cnpj', 'is', null).neq('cpf_cnpj', '')
        .order('id').range(de, ate);
      if (error) throw new Error(error.message);
      return { data: data ?? [], count: typeof count === 'number' ? count : null };
    });
  const { data: mesmoNome, error } = await supabase.from('financeiro_fornecedores')
    .select('id, nome, cpf_cnpj, ativo')
    .eq('cliente_id', clienteId).eq('nome_normalizado', normalizeFornecedorNome(nome));
  if (error) throw new Error(error.message);
  const porId = new Map<string, FornecedorParaConferir>();
  for (const f of [...comDocumento, ...(mesmoNome ?? [])]) porId.set(f.id, { id: f.id, nome: f.nome, cpf_cnpj: f.cpf_cnpj, ativo: f.ativo !== false });
  return Array.from(porId.values());
}
