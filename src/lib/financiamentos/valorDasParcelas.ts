/**
 * O QUE AS PARCELAS DIZEM DE UM CAMPO QUE É DELAS — PARC-OBRIGACAO-EDICAO-01a (05/10/2026).
 *
 * Safra, cultura, fase e forma de pagamento não são colunas do contrato (`financiamentos`): moram no lançamento de cada
 * parcela. Ao editar um parcelamento, a tela MOSTRA o que as parcelas têm — o valor quando todas concordam, "varia entre as
 * parcelas" quando não — e não aceita edição que o Salvar do contrato descartaria.
 * ⚠ PURO: não lê banco, não conhece React. Quem busca os lançamentos é o diálogo.
 */
export const VARIA_ENTRE_AS_PARCELAS = 'varia entre as parcelas';
export const MOTIVO_VALE_POR_PARCELA = 'Vale por parcela. A alteração em todas as parcelas chega na próxima etapa.';

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
