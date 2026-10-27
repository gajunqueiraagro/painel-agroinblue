/**
 * P53b (Gabriel 25/10/2026) — A TRAVA MASTER DO FORMULÁRIO SÓ PERGUNTA O MÊS DEPOIS QUE A OC CHEGOU.
 *
 * ⚠ NASCE DE MEDIÇÃO (P53, 23/10): abrir uma OC pedia a trava master DUAS vezes, para meses diferentes — 10/2026 (a data padrão do
 *   formulário, "hoje", antes de hidratar) e 09/2026 (o mês da OC). A primeira pergunta é desperdício: a resposta nunca é usada.
 * ⚠ A REGRA: com uma OC na URL (`oc_id`) que ainda não foi hidratada nesta montagem — ou cuja hidratação está em voo —, o formulário
 *   ainda não tem a data dela: não há mês a perguntar (`undefined`, e o `useMasterLock` não consulta). Hidratada (ou com a hidratação
 *   falhada e solta), vale o mês do formulário. Sem OC na URL, nada muda.
 * ⚠ SÓ A CONSULTA DO FORMULÁRIO: o gate do salvar (`checkLockNow`, sempre direto) não passa por aqui.
 */
export function mesDaTravaDoForm(
  mesDoForm: string | undefined,
  oc: { idNaUrl: string | null; hidratando: boolean; idHidratado: string | null },
): string | undefined {
  if (oc.idNaUrl && (oc.hidratando || oc.idHidratado !== oc.idNaUrl)) return undefined;
  return mesDoForm;
}
