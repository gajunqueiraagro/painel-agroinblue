/**
 * SAFRA E SUBCENTRO TÊM DE FALAR DA MESMA ATIVIDADE — PR-FIN-SAFRA-ESCOPO-01.
 *
 * ⚠ O ERRO É SILENCIOSO E CARO. Um custo de lavoura carimbado com a safra da pecuária não
 * quebra nada na hora: grava, aparece na lista, soma no fluxo de caixa. Só no fechamento —
 * meses depois — alguém procura por que o custo por hectare da 25/26 não fecha, e a linha
 * está lá, na safra errada, sem nada que a distinga. É o tipo de defeito que a tela tem de
 * impedir, porque o relatório não consegue.
 *
 * ⚠ ADMINISTRATIVO NÃO RECEBE SAFRA — PR-FIN-SAFRA-ADM-01 (decisão do Gabriel, 11/09/2026),
 * e esta linha REVERTE o que estava escrito aqui. A regra anterior dizia que administrativo
 * aceitava qualquer safra, porque rateio, energia e escritório servem a todas as atividades.
 * O raciocínio era certo e a conclusão, errada: justamente por servir a todas, a despesa
 * administrativa não pertence a NENHUMA — carimbá-la com a safra de uma inflaciona o custo
 * daquela atividade e sonega o das outras. O rateio é conta do resultado por atividade, com
 * percentual declarado, não um campo de safra escolhido linha a linha.
 * ⚠ E A REGRA NÃO PRECISA DE LISTA DE EXCEÇÃO. Os quatro subcentros de financiamento, que
 * eram o caso difícil, deixaram de ser administrativo no plano: passaram para a atividade a
 * que o financiamento serve. Quem tem safra legítima não é mais administrativo.
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
  /* ⚠ ADMINISTRATIVO EXIGE SAFRA VAZIA, e por isso vem ANTES da igualdade: não existe safra
     de escopo administrativo no cadastro (medido no proto: 19 de pecuária, 4 de lavoura,
     zero administrativas), então qualquer safra aqui é de outra atividade. */
  if (plano === 'administrativo') return { escopoPlano: plano, escopoSafra: safra };
  if (plano === safra) return null;
  return { escopoPlano: plano, escopoSafra: safra };
}

/** A frase do toast. Rótulos de atividade, nunca identificadores. */
export function mensagemConflitoSafraEscopo(c: ConflitoSafraEscopo): string {
  /* ⚠ ADMINISTRATIVO TEM FRASE PRÓPRIA, e não é capricho: "troque um dos dois" mandaria o
     operador procurar uma safra administrativa que não existe no cadastro. A saída ali é
     uma só — esvaziar a safra —, e a frase tem de dizer qual é. */
  if (c.escopoPlano === 'administrativo') {
    return 'Lançamento administrativo não recebe safra — deixe a safra vazia.';
  }
  return `Subcentro de ${rotuloAtividade(c.escopoPlano)} com safra de ${rotuloAtividade(c.escopoSafra)}. `
    + 'Troque um dos dois.';
}
