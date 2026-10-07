/**
 * O QUE AS PARCELAS DIZEM DE UM CAMPO QUE É DELAS — PARC-OBRIGACAO-EDICAO-01a (05/10/2026).
 *
 * Safra, cultura, fase e forma de pagamento não são colunas do contrato (`financiamentos`): moram no lançamento de cada
 * parcela. Ao editar um parcelamento, a tela MOSTRA o que as parcelas têm — o valor quando todas concordam, "varia entre as
 * parcelas" quando não — e não aceita edição que o Salvar do contrato descartaria.
 * ⚠ PURO: não lê banco, não conhece React. Quem busca os lançamentos é o diálogo.
 */
export const VARIA_ENTRE_AS_PARCELAS = 'varia entre as parcelas';
/**
 * PARC-LIVRES-01 passo 2A — a parcela de PARCELAMENTO não passa pelo editor de parcela do financiamento: ele chamava o motor
 * do financiamento, que cancelava o lançamento da parcela e criava outro (sem safra, forma e documento).
 */
export const MOTIVO_PARCELA_DE_PARCELAMENTO = 'Parcela de parcelamento: o pagamento é pelo lançamento, no Financeiro; data e valor se editam na grade de parcelas.';
/** A 1ª parcela do parcelamento é a da lista de parcelas — mudar a data aqui deslocava só as parcelas, não os lançamentos. */
export const MOTIVO_PRIMEIRA_PARCELA_DO_PARCELAMENTO = 'No parcelamento a data de cada parcela se edita na grade de parcelas.';

/* PARC-CONTRATO-01 item 2: a "próxima etapa" chegou — o campo é editável e o Salvar pergunta até onde a alteração vai. */
export const MOTIVO_VALE_POR_PARCELA = 'Vale por parcela. Ao salvar você escolhe quais parcelas a alteração alcança.';

export type ValorDasParcelas =
  /** Nenhuma parcela com lançamento vivo: não há de onde ler. */
  | { tipo: 'sem_parcelas' }
  /** Todas concordam; `valor` vazio = todas SEM o dado (sem safra, sem forma). */
  | { tipo: 'igual'; valor: string }
  | { tipo: 'varia' };

/** `null`, `undefined` e vazio são o MESMO valor: ausência. */
export function valorComumDasParcelas(valores: ReadonlyArray<string | null | undefined>): ValorDasParcelas {
  if (valores.length === 0) return { tipo: 'sem_parcelas' };
  const distintos = new Set(valores.map((v) => (v ?? '').trim()));
  if (distintos.size > 1) return { tipo: 'varia' };
  return { tipo: 'igual', valor: [...distintos][0] ?? '' };
}

/**
 * O texto que o campo em leitura mostra. `vazio` é a palavra da casa para "todas sem o dado" (Sem safra, Nenhuma,
 * Todas (rateia)); `rotulo` traduz o valor gravado para o nome que a tela usa.
 * ⚠ "—" SÓ PARA DADO AUSENTE (nenhuma parcela lida) — nunca para "todas sem safra", que é um fato.
 */
export function textoDasParcelas(r: ValorDasParcelas, vazio: string, rotulo: (valor: string) => string = (v) => v): string {
  if (r.tipo === 'sem_parcelas') return '—';
  if (r.tipo === 'varia') return VARIA_ENTRE_AS_PARCELAS;
  return r.valor ? rotulo(r.valor) : vazio;
}
