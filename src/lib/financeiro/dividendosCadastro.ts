/**
 * DIVIDENDO-ESCRITOR-UNICO-01 — o que a tela de Dividendos precisa para falar com o ESCRITOR ÚNICO do banco.
 *
 * O cadastro (`financeiro_dividendos`) e a conta do plano mudam juntos, numa transação, pelas cinco funções
 * `fn_dividendo_*`. A tela NÃO escreve na tabela (o banco recusa) e não decide nada: lê a resposta e escreve a frase.
 * Puro: nenhum acesso a banco aqui.
 */

export const FN_DIVIDENDO = {
  criar: 'fn_dividendo_criar',
  renomear: 'fn_dividendo_renomear',
  inativar: 'fn_dividendo_inativar',
  reativar: 'fn_dividendo_reativar',
  reordenar: 'fn_dividendo_reordenar',
} as const;

export const FRASE_RESPOSTA_INESPERADA = 'Resposta inesperada do banco. Recarregue a tela e confira antes de repetir.';
export const FRASE_FALHA_SEM_MOTIVO = 'Não foi possível gravar. Nada foi gravado.';

export type RespostaDoDividendo =
  | {
      ok: true;
      /** Renomear: quantos lançamentos receberam o nome novo. */
      lancamentosTocados: number;
      /** Inativar: o que aconteceu (ou aconteceria) com a conta do plano. */
      contaAcao: string | null;
      /** Inativar: quantos lançamentos vivos seguram a conta no plano. */
      lancamentosQueSeguram: number;
    }
  | { ok: false; frase: string };

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function inteiro(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Lê o par (data, error) de uma chamada `fn_dividendo_*`.
 * Erro do banco: a mensagem JÁ é a frase ("… Nada foi gravado."). Recusa na simulação: vem em `recusa.frase`.
 * Peça torta nunca vira sucesso.
 */
export function lerRespostaDoDividendo(data: unknown, error: { message?: string | null } | null | undefined): RespostaDoDividendo {
  if (error) {
    const frase = typeof error.message === 'string' && error.message.trim() !== '' ? error.message.trim() : FRASE_FALHA_SEM_MOTIVO;
    return { ok: false, frase };
  }
  if (!ehObjeto(data) || !('recusa' in data)) return { ok: false, frase: FRASE_RESPOSTA_INESPERADA };
  const recusa = data.recusa;
  if (recusa !== null) {
    if (ehObjeto(recusa) && typeof recusa.frase === 'string' && recusa.frase.trim() !== '') return { ok: false, frase: recusa.frase };
    return { ok: false, frase: FRASE_RESPOSTA_INESPERADA };
  }
  return {
    ok: true,
    lancamentosTocados: inteiro(data.lancamentos_tocados),
    contaAcao: typeof data.conta_acao === 'string' ? data.conta_acao : null,
    lancamentosQueSeguram: inteiro(data.lancamentos_que_seguram),
  };
}

/** A frase da confirmação de inativar quando há lançamentos que seguram a conta. O número é o do banco. */
export function fraseDoQueSegura(n: number): string {
  const quem = n === 1 ? '1 lançamento usa este dividendo.' : `${n} lançamentos usam este dividendo.`;
  return `${quem} Ele deixa de ser oferecido em lançamentos novos; a conta continua no plano e os lançamentos ficam como estão.`;
}

/**
 * A lista COMPLETA de ids do cliente depois de arrastar na lista VISÍVEL (que pode esconder os inativos):
 * as posições que os visíveis ocupavam recebem a sequência nova; quem está escondido fica onde estava.
 * É o que `fn_dividendo_reordenar` exige: exatamente os dividendos do cliente, uma vez cada.
 */
export function ordemCompleta(todos: readonly { id: string }[], visiveisNaOrdemNova: readonly { id: string }[]): string[] {
  const visiveis = new Set(visiveisNaOrdemNova.map((v) => v.id));
  let i = 0;
  return todos.map((t) => {
    if (!visiveis.has(t.id)) return t.id;
    const proximo = visiveisNaOrdemNova[i];
    i += 1;
    return proximo.id;
  });
}
