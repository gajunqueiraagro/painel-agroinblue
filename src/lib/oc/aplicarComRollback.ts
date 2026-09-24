/**
 * Aplica um estado local SÓ quando a gravação passa — OC-BOITEL-REALIZADO-01.
 *
 * ⚠ NASCE DE UMA TELA QUE MENTIU. Em `LancamentosTab.aplicarRealizadoBoitel` o
 * `setOcBoitelReal(proximo)` rodava ANTES do `try`, e o `catch` só mostrava o toast: numa
 * gravação recusada o estado local sobrevivia, e a tela passava a exibir um realizado que
 * não existia no banco. Medido na OC 6a808c4c (NJ, venda boitel, 24/09/2026): o card
 * Realizado mostrava os deltas (+0,025 · +14 · +1,00), calculados no front a partir do que
 * o operador digitou, enquanto GMD, Dias e RC saíam "—" — esses três a tela lê da LINHA, e
 * a linha `cenario = 'realizado'` nunca chegou a existir. O mesmo card dizia "deu certo" e
 * "está incompleto" ao mesmo tempo.
 *
 * ⚠ E A RECUSA TINHA MOTIVO LEGÍTIMO: `oc_salvar_boitel:32` recusa operação `fechada` de
 * propósito, e a operação ficou fechada por 48 segundos entre o `fechar` (22:38:27) e o
 * `reabrir` (22:39:15). O defeito nunca foi a recusa — foi o estado não voltar atrás.
 *
 * ⚠ FLAG DE UI É OUTRA COISA. `setSubmitting(true)` antes do `await` está certo e se desfaz
 * no `finally`; o que não pode vir antes é o estado de DADO, que descreve o que o banco tem.
 * Varrido o `LancamentosTab` inteiro: esta era a única ocorrência de dado — as outras nove
 * são `Submitting` / `Hidratando` / `AcaoOcLoading`.
 */
export async function aplicarComRollback<T>(
  anterior: T,
  proximo: T,
  setState: (v: T) => void,
  gravar: () => Promise<unknown>,
): Promise<boolean> {
  /**
   * ⚠ O ESTADO VAI ANTES, E É DE PROPÓSITO: o modal fecha no clique e o operador precisa ver
   * o que digitou enquanto a RPC corre — mostrar o valor velho por meio segundo e trocar
   * depois pisca. O que este helper garante é o CAMINHO DE VOLTA, que era o que faltava.
   */
  setState(proximo);
  try {
    await gravar();
    return true;
  } catch (e) {
    /* ⚠ RESTAURA O ANTERIOR, NÃO LIMPA. Zerar apagaria um realizado que já estava gravado
       antes desta tentativa — a recusa é da edição nova, não do que já existia. */
    setState(anterior);
    throw e;
  }
}
