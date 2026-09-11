/**
 * O ESCOPO QUE O PLANO DIZ SOBRE UM SUBCENTRO — e a regra que sai dele.
 * Extraído do `LancamentoV2Dialog` em MESA-SAFRA-ADM-01.
 *
 * ⚠ ELE ERA UM `useMemo` DENTRO DO MODAL, e por isso a Mesa de Enriquecimento não o tinha:
 * a regra "administrativo não tem safra" valia numa tela e não na outra, e o operador via a
 * safra 25/26 num lançamento cuja conta é "Viagens e Deslocamentos Administrativo". Regra que
 * mora dentro de um componente não é regra do sistema — é comportamento daquela tela.
 * ⚠ E A DIVERGÊNCIA ERA SÓ DE APRESENTAÇÃO, não de dado: desde o FIN-SAFRA-ADM-03 o trigger
 * `resolve_classificacao_from_plano` zera `safra_id` de qualquer lançamento administrativo na
 * gravação. A Mesa não gravava safra indevida — ela MOSTRAVA uma que o banco ia apagar, que é
 * a forma de mentira mais cara: o operador confere, aceita, e o número muda sozinho depois.
 */

/** O mínimo que se precisa de uma linha do plano para resolver o escopo. */
export interface ClassificacaoComEscopo {
  subcentro: string;
  escopo_negocio?: string | null;
}

export const ESCOPO_ADMINISTRATIVO = 'administrativo';

/**
 * @param fallback o escopo GRAVADO na linha, usado quando o subcentro não tem linha no plano
 *   (os legados). Ali o que está gravado é tudo que se sabe.
 *
 * ⚠ O PLANO MANDA, NÃO O GRAVADO. O escopo da linha é cópia do que valia quando ela foi
 * escrita, e o plano pode ter mudado desde então — foi o que aconteceu em 11/09/2026, quando
 * quatro subcentros de financiamento deixaram de ser administrativos.
 * ⚠ COMPARAÇÃO APARADA E SEM CAIXA, como no resto do repo: o subcentro vem de texto digitado
 * em algumas portas, e " Aluguel de Escritório " tem de achar a mesma linha.
 */
export function escopoDoSubcentro(
  classificacoes: readonly ClassificacaoComEscopo[] | null | undefined,
  subcentro: string | null | undefined,
  fallback?: string | null,
): string {
  const alvo = (subcentro || '').trim().toLowerCase();
  const cls = (classificacoes ?? []).find((c) => (c.subcentro || '').trim().toLowerCase() === alvo);
  return (cls?.escopo_negocio ?? fallback ?? '').trim();
}

/** A conta escolhida é administrativa? — a pergunta que desliga a safra. */
export function ehSubcentroAdministrativo(
  classificacoes: readonly ClassificacaoComEscopo[] | null | undefined,
  subcentro: string | null | undefined,
  fallback?: string | null,
): boolean {
  return escopoDoSubcentro(classificacoes, subcentro, fallback) === ESCOPO_ADMINISTRATIVO;
}

/**
 * O DIVIDENDO É ADMINISTRATIVO MESMO SEM LINHA NO PLANO — a segunda porta.
 *
 * ⚠ MEDIDO, NÃO SUPOSTO: 359 lançamentos de `macro_custo = 'Dividendos'` usam 10 subcentros
 * que NÃO existem em `financeiro_plano_contas` (medição no proto em 11/09/2026), porque o
 * dividendo é por cliente e o próprio trigger `resolve_classificacao_from_plano` abre exceção
 * para ele no bloqueio B1. Para esses, `escopoDoSubcentro` não acha nada e devolveria "" — a
 * safra ficaria editável numa linha que o banco vai zerar do mesmo jeito.
 * ⚠ E AS 23 CONTAS DE DIVIDENDO QUE ESTÃO NO PLANO SÃO TODAS ADMINISTRATIVAS (medido), então
 * a porta do macro não contradiz a do plano em caso nenhum: ela só cobre o que falta.
 * ⚠ MESMO PRECEDENTE DA FAZENDA: `ResultadoFazendaEditor` já recebe
 * `forcaAdministrativo={row.edicao.macro === 'Dividendos'}` na Mesa. A regra não é nova aqui —
 * o que era novo era a safra não a conhecer.
 */
export const MACRO_DIVIDENDOS = 'Dividendos';

export function ehLinhaAdministrativa(
  classificacoes: readonly ClassificacaoComEscopo[] | null | undefined,
  subcentro: string | null | undefined,
  macro: string | null | undefined,
  fallback?: string | null,
): boolean {
  return ehSubcentroAdministrativo(classificacoes, subcentro, fallback)
    || (macro || '').trim() === MACRO_DIVIDENDOS;
}

/**
 * A frase do campo desabilitado — uma só, para as duas telas.
 *
 * ⚠ DUAS FRASES PORQUE SÃO DOIS FATOS: com safra, o que importa é avisar que ela SAI; sem
 * safra, que o campo não se aplica. Uma frase só teria de mentir num dos dois casos.
 */
export const AVISO_ADMIN_SEM_SAFRA = 'administrativo não tem safra';
export const AVISO_ADMIN_SAFRA_SAI = 'safra será removida ao salvar — administrativo não tem safra';
