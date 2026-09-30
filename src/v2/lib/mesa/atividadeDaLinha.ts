/**
 * A ATIVIDADE da linha da Mesa — PR-CONC-MESA-PAINEL-V1 item 3.
 *
 * ⚠ NÃO É CAMPO GRAVADO: o lançamento não tem coluna de atividade, e o escopo que ele guarda (`escopo_negocio`) é
 *   CÓPIA do plano, reescrita pelo gatilho `resolve_classificacao_from_plano`. A atividade é o FILTRO da conta do plano,
 *   como no Novo Lançamento (`ClassificacaoLancamento`): escolhe-se a atividade, e a lista de contas encolhe para ela.
 * ⚠ A PROPOSTA É O ESCOPO DA CONTA DO PLANO RESOLVIDA, pela porta soberana (`escopoDoSubcentro`) — nunca uma lista
 *   local. Conta sem linha no plano não tem escopo, e a atividade fica vazia para o operador escolher.
 * ⚠ PLANO INCOERENTE NÃO SE GRAVA: se a conta do plano é de outra atividade, ela vira PENDENTE — o operador trocou a
 *   atividade e a conta que estava ali deixou de servir. Gravar a conta velha seria gravar o que ele acabou de desdizer.
 */
import { ATIVIDADES } from '@/lib/financeiro/ultimaAtividade';
import { escopoDoSubcentro, type ClassificacaoComEscopo } from '@/lib/financeiro/escopoDoSubcentro';

/** O rótulo de operador ("Lavoura" para `agricultura`); `null` para vazio ou escopo que não é atividade. */
export function rotuloAtividade(valor: string | null | undefined): string | null {
  return ATIVIDADES.find((a) => a.valor === valor)?.rotulo ?? null;
}

/** O escopo da conta do plano, se ele for uma das quatro atividades; senão `null`. */
export function atividadeDoSubcentro(
  classificacoes: readonly ClassificacaoComEscopo[] | null | undefined,
  subcentro: string | null | undefined,
): string | null {
  if (!classificacoes || !subcentro) return null;
  const e = escopoDoSubcentro(classificacoes, subcentro);
  return rotuloAtividade(e) ? e : null;
}

/**
 * A conta do plano não pertence à atividade escolhida.
 *
 * ⚠ SÓ HÁ INCOERÊNCIA QUANDO HÁ AS DUAS: sem atividade não há filtro, e sem conta o que falta é a conta (o obrigatório
 *   já a acusa). Conta sem escopo no plano diante de uma atividade escolhida É incoerente — o filtro do Novo Lançamento
 *   com `escopoObrigatorio` também não a oferece.
 */
export function planoIncoerente(
  classificacoes: readonly ClassificacaoComEscopo[] | null | undefined,
  subcentro: string | null | undefined,
  atividade: string | null | undefined,
): boolean {
  if (!classificacoes || !subcentro || !atividade) return false;
  return escopoDoSubcentro(classificacoes, subcentro) !== atividade;
}
