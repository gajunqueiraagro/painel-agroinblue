/**
 * FECH-MAPA-PASTO-MODAL-01 — a regra do NOME do pasto ao editar pelo modal: nao vazio e nao repetido na mesma fazenda.
 * Puro. Repetido = o mesmo nome sem caixa, sem acento e com espacos colapsados, em outro pasto da fazenda (ativo ou nao).
 */
export const FRASE_NOME_VAZIO = 'Informe o nome do pasto.';
export const FRASE_NOME_REPETIDO = 'Já existe um pasto com este nome nesta fazenda.';
export const NOTA_NOME_DO_CADASTRO = 'nome do cadastro · vale para todos os meses';

export function normalizarNomeDoPasto(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface PastoParaNome { id: string; nome: string; fazenda_id?: string | null }

/** Nulo = o nome serve. A frase, quando nao serve. */
export function motivoDoNomeDoPasto(nome: string, pasto: PastoParaNome, pastos: readonly PastoParaNome[]): string | null {
  const alvo = normalizarNomeDoPasto(nome);
  if (!alvo) return FRASE_NOME_VAZIO;
  const repetido = pastos.some(p => p.id !== pasto.id
    && (pasto.fazenda_id == null || p.fazenda_id == null || p.fazenda_id === pasto.fazenda_id)
    && normalizarNomeDoPasto(p.nome) === alvo);
  return repetido ? FRASE_NOME_REPETIDO : null;
}
