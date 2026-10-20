/**
 * CONC-CRIAR-CENTAVO-01 — A TOLERÂNCIA DA CONCILIAÇÃO É UMA SÓ: meio centavo, a mesma do banco (`c_tol constant numeric := 0.005`
 * em `fn_conciliar_bloco` e `fn_classificacao_conferir_bloco`; `> 0.005` em `fn_vincular_grupo_conciliacao`, `fn_espelho_casar` e
 * `fn_espelho_casar_n1`). Diferença de R$ 0,01 é diferença de verdade: pode virar lançamento, nunca "confere". Abaixo de meio centavo
 * é arredondamento de valor com 3 casas. Quem decide conciliar ou criar na tela lê daqui — nunca um 0.01 solto.
 */
export const TOLERANCIA_CONCILIACAO = 0.005;

/** A diferença fecha (é só arredondamento)? Espelho de `abs(dif) > c_tol` do banco, negado. */
export function fechaAoCentavo(diferenca: number): boolean {
  return Math.abs(diferenca) <= TOLERANCIA_CONCILIACAO;
}

/**
 * "Criar lançamento pela diferença" do Casar com o banco. Sem lançamento levado, o extrato INTEIRO precisa de explicação: libera
 * sempre que o extrato ≠ 0 (o caso dos rendimentos de R$ 0,01 da Vera). Com levados, libera quando a simulação do banco não fechou
 * e a diferença passa da tolerância.
 */
export function podeCriarPelaDiferenca(
  sim: { ok: boolean; diferenca: number; noExtrato: number } | null,
  semItens: boolean,
): boolean {
  if (!sim) return false;
  if (semItens) return !fechaAoCentavo(sim.noExtrato);
  return !sim.ok && !fechaAoCentavo(sim.diferenca);
}
