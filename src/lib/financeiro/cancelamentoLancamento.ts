/**
 * QUEM PODE CANCELAR UM LANÇAMENTO PELO FINANCEIRO — PR-CPR-2A.4.
 *
 * ⚠ ESTE MÓDULO É ESPELHO DE UM TRIGGER, e é assim que ele deve ser lido. A regra vive no
 * banco, em `guard_zoo_financeiro_cancelamento_realizado`, que levanta P0001 ("Altere pelo
 * Financeiro Oficial") quando alguém tenta cancelar um lançamento de origem zootécnica que já
 * é realidade de caixa. O banco é o dono; o que este arquivo faz é permitir que a TELA não
 * ofereça um botão que o servidor vai recusar.
 *
 * ⚠ E ESPELHO PODE DIVERGIR — é a dívida conhecida desta forma (a mesma de
 * `PR-PASTO-VIGENCIA-02`). Por isso o chamador NUNCA confia só nisto: a RPC continua sendo a
 * autoridade, e o erro dela é mostrado ao operador se a corrida acontecer. Esconder o botão é
 * cortesia, não controle de acesso.
 *
 * O guard, verbatim do `pg_get_functiondef` em 19/09/2026:
 *
 *   NEW.cancelado IS TRUE AND OLD.cancelado IS DISTINCT FROM TRUE
 *   AND OLD.movimentacao_rebanho_id IS NOT NULL
 *   AND ( OLD.conciliado_em IS NOT NULL
 *         OR (OLD.status_transacao IN ('realizado','agendado')
 *             AND OLD.sem_movimentacao_caixa IS NOT TRUE) )
 */

/** O mínimo que a decisão olha. Qualquer linha de lançamento serve. */
export interface LinhaCancelavel {
  movimentacao_rebanho_id: string | null;
  conciliado_em: string | null;
  status_transacao: string | null;
  sem_movimentacao_caixa?: boolean | null;
}

/** A frase que a tela põe no lugar do botão. Uma só, para não haver duas redações. */
export const MOTIVO_BLOQUEIO_REBANHO = 'Cancele pela movimentação de rebanho';

/**
 * ⚠ `IS NOT TRUE`, E NÃO `=== false`: no SQL, `NULL IS NOT TRUE` é VERDADEIRO, então uma linha
 * com `sem_movimentacao_caixa` nulo É bloqueada. Traduzir para `=== false` deixaria justamente
 * as linhas de coluna nula passarem pela tela e baterem no servidor — que é o defeito que
 * espelhar um guard costuma introduzir.
 */
export function bloqueiaCancelamentoPeloFinanceiro(l: LinhaCancelavel): boolean {
  if (!l.movimentacao_rebanho_id) return false;
  if (l.conciliado_em) return true;
  const status = (l.status_transacao ?? '').toLowerCase();
  const ehCaixa = l.sem_movimentacao_caixa !== true;
  return (status === 'realizado' || status === 'agendado') && ehCaixa;
}

/* ─── FIN-V2-CANCEL-MOTIVO-01 ─────────────────────────────────────────────────────────── */

/**
 * O MOTIVO E' OBRIGATORIO NO HOOK, nao so' no botao. Ate' aqui a obrigatoriedade morava na tela
 * (`LancamentoV2Dialog`, botao desabilitado sem texto) e o `excluirLancamento` gravava o motivo
 * "so' se viesse": outro chamador cancelava sem nada. Uma frase so', para nao haver duas redacoes.
 */
export const MOTIVO_OBRIGATORIO = 'Informe o motivo do cancelamento.';

/** Texto aparado, ou `null` quando nao ha' motivo de verdade (vazio ou so' espacos). */
export function motivoInformado(m: string | null | undefined): string | null {
  const t = (m ?? '').trim();
  return t === '' ? null : t;
}

/**
 * TITULO COM PARTE VIVA DE OC NAO SE CANCELA PELO FINANCEIRO. O caminho e' o "Desfazer
 * compromisso" da OC, que desfaz titulo, programacao e compromisso juntos e RECUSA titulo
 * realizado ou conciliado. Pelo Financeiro, o titulo morria e a parte ficava viva apontando
 * para ele — foi o que produziu e8032b0d (7f7de76f, 02/09) e f489abd9 (c80ebe9e, 18/09).
 * ⚠ "PARTE VIVA", NAO `origem_lancamento`: um lancamento manual vinculado a OC
 * (VINCULAR-LANC-OC-01, ou o 91e6a216 a mao) tem parte viva e origem 'manual'.
 */
export const MOTIVO_BLOQUEIO_TITULO_OC = 'Título de operação comercial — desfaça pelo Desfazer compromisso';

/** O lote separa o que cancela do que pula, sem perder a ordem pedida. */
export function separarTitulosOC(ids: readonly string[], comParteViva: ReadonlySet<string>): {
  cancelaveis: string[]; puladosOC: string[];
} {
  return {
    cancelaveis: ids.filter(id => !comParteViva.has(id)),
    puladosOC: ids.filter(id => comParteViva.has(id)),
  };
}
