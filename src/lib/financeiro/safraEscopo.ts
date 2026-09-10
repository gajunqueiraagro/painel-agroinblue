/**
 * SAFRA E SUBCENTRO TÊM DE FALAR DA MESMA ATIVIDADE — PR-FIN-SAFRA-ESCOPO-01.
 *
 * ⚠ O ERRO É SILENCIOSO E CARO. Um custo de lavoura carimbado com a safra da pecuária não
 * quebra nada na hora: grava, aparece na lista, soma no fluxo de caixa. Só no fechamento —
 * meses depois — alguém procura por que o custo por hectare da 25/26 não fecha, e a linha
 * está lá, na safra errada, sem nada que a distinga. É o tipo de defeito que a tela tem de
 * impedir, porque o relatório não consegue.
 *
 * ⚠ ADMINISTRATIVO ACEITA QUALQUER SAFRA, e não é exceção arbitrária: rateio, energia,
 * escritório e contabilidade servem a todas as atividades, e é o plano que aponta para onde
 * vão. Recusar ali obrigaria a criar uma conta administrativa por atividade, que é o oposto
 * do que o plano de contas faz.
 *
 * ⚠ SAFRA VAZIA É SEMPRE VÁLIDA. Safra não é obrigatória em lançamento nenhum, e transformar
 * uma validação de coerência em obrigatoriedade seria mudar a regra por baixo.
 */
import { ATIVIDADES } from './ultimaAtividade';

/** O rótulo que o operador lê. Nunca o identificador — ele diz "Lavoura", não "agricultura". */
export function rotuloAtividade(escopo: string | null | undefined): string {
  const achado = ATIVIDADES.find((a) => a.valor === escopo);
  return achado?.rotulo ?? (escopo || '—');
}

export interface ConflitoSafraEscopo {
  escopoPlano: string;
  escopoSafra: string;
}

/**
 * `null` quando está tudo bem. Devolve os dois escopos quando divergem, para quem chama
 * montar a frase — a mensagem é da tela, a regra é daqui.
 */
export function conflitoSafraEscopo(
  escopoPlano: string | null | undefined,
  escopoSafra: string | null | undefined,
): ConflitoSafraEscopo | null {
  const plano = (escopoPlano || '').trim();
  const safra = (escopoSafra || '').trim();
  if (!safra) return null;                    // sem safra, nada a conferir
  if (!plano) return null;                    // plano sem escopo serve a qualquer safra
  if (plano === 'administrativo') return null; // administrativo serve a todas
  if (plano === safra) return null;
  return { escopoPlano: plano, escopoSafra: safra };
}

/** A frase do toast. Rótulos de atividade, nunca identificadores. */
export function mensagemConflitoSafraEscopo(c: ConflitoSafraEscopo): string {
  return `Subcentro de ${rotuloAtividade(c.escopoPlano)} com safra de ${rotuloAtividade(c.escopoSafra)}. `
    + 'Troque um dos dois.';
}
