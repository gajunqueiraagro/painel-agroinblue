/**
 * P92/P113 (Gabriel 26/10/2026) — O INTERRUPTOR DA REGRA `numero-vaza`, POR CENÁRIO. A regra (número fora da caixa de CONTEÚDO da célula;
 * tabela maior que a caixa) vale em todo cenário com `folgaCelulas`; aqui fica a lista dos cenários em que ela está DESLIGADA, cada um com
 * a frente que vai religá-la. Desligar NUNCA é silencioso: o gate imprime o aviso toda vez que pula.
 * - `visao-geral-analise-regua-saidas` (P113): o "+999,9%" da régua de saídas come 4,8px do recuo direito da célula (não corta e a folga
 *   de 6px passa); a coluna é do Code Visão Geral.
 */
export const CENARIOS_SEM_NUMERO_VAZA = Object.freeze({ 'visao-geral-analise-regua-saidas': 'P113' });

/** Os achados da folga de um cenário, com a `numero-vaza` tirada SÓ se o cenário estiver na lista; o aviso diz que pulou. */
export function aplicarInterruptorNumeroVaza(nome, achados) {
  const frente = Object.prototype.hasOwnProperty.call(CENARIOS_SEM_NUMERO_VAZA, nome) ? CENARIOS_SEM_NUMERO_VAZA[nome] : null;
  if (!frente) return { achados, aviso: null };
  return { achados: achados.filter((a) => a.regra !== 'numero-vaza'), aviso: `numero-vaza desligada neste cenário (${frente})` };
}
