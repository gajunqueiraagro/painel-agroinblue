/**
 * O SENTIDO DE UM LANÇAMENTO VISTO DE UMA CONTA — PR-V2-TRANSF-DESTINO-01.
 *
 * ⚠ TRANSFERÊNCIA NÃO TEM UM SINAL, TEM DOIS. Ela é saída na conta de origem e entrada na
 * de destino — o mesmo dinheiro, dois lados. A coluna `sinal` do lançamento guarda apenas o
 * lado da ORIGEM (-1), e quem lê a lista pela conta de DESTINO recebe o sinal errado: era
 * por isso que os cinco resgates de LCA/CDB do Agnaldo apareciam em −R$ 1.180.941,36 numa
 * lista filtrada por "Conta Destino = Bradesco", que é justamente a conta onde o dinheiro
 * ENTROU.
 *
 * ⚠ A REGRA JÁ EXISTIA, SEM NOME E EM DUPLICATA. O Extrato Gerencial a escrevia inline duas
 * vezes no mesmo arquivo (`ExtratoGerencialTab` :233 no cálculo do saldo e :284 na tabela de
 * transferências do PDF) — e as duas cópias já divergiam entre si no caso da transferência
 * de uma conta para ela mesma: a primeira exigia `bancaria !== foco`, a segunda não. Zero
 * ocorrências desse caso na base hoje (medido), mas duas cópias de uma regra são duas
 * respostas esperando a pergunta. Aqui ela tem um nome e um lugar.
 *
 * ⚠ SEM CONTA EM FOCO, TRANSFERÊNCIA NÃO É NEM ENTRADA NEM SAÍDA. Somá-la a qualquer um dos
 * dois lados infla o total com dinheiro que só mudou de bolso: os R$ 2 milhões de um resgate
 * apareceriam como receita do mês. Ela ganha eixo próprio — quem exibe decide se mostra.
 */
import { isTransferenciaTipo } from './v2Transferencia';
import { formatMoeda } from '@/lib/calculos/formatters';

export type SentidoNaConta = 'entrada' | 'saida' | 'transferencia';

/** O mínimo que se precisa saber de um lançamento para lhe dar sentido. */
export interface LancamentoDirecional {
  tipo_operacao?: string | null;
  conta_bancaria_id?: string | null;
  conta_destino_id?: string | null;
}

/**
 * @param contaFoco a conta pela qual se está olhando; `null` quando não há recorte de conta
 *                  (ou quando origem E destino estão filtrados, que é olhar dos dois lados
 *                  ao mesmo tempo — e aí nenhum é "o" ponto de vista).
 */
export function sentidoNaConta(
  l: LancamentoDirecional,
  contaFoco: string | null,
): SentidoNaConta {
  const transferencia = isTransferenciaTipo(l.tipo_operacao);
  if (contaFoco) {
    /* ⚠ `bancaria !== foco` NÃO É REDUNDANTE: sem ele, uma transferência de uma conta para
       ela mesma seria lida como entrada, e o saldo dela subiria sozinho. É a cláusula que
       a cópia do PDF não tinha. */
    if (l.conta_destino_id === contaFoco && l.conta_bancaria_id !== contaFoco) return 'entrada';
    if (transferencia) return 'saida';
  }
  if (transferencia) return 'transferencia';
  return (l.tipo_operacao ?? '').startsWith('1') ? 'entrada' : 'saida';
}

/**
 * O multiplicador do valor em CÁLCULO — soma, saldo corrido, série.
 *
 * ⚠ ELE NÃO É MAIS O DA EXIBIÇÃO, e a distinção nasceu do FIN-LISTA-TRANSF-SINAL-01. A
 * assinatura obriga a escolher um dos dois lados, então transferência sem foco cai em −1:
 * serve a quem SOMA num contexto que já tem ponto de vista (o Extrato Gerencial soma sempre
 * de dentro de uma conta), e mente para quem EXIBE numa lista sem recorte de conta. Quem
 * exibe usa `formatarValorLinha`, que tem um terceiro caso porque não precisa devolver
 * número.
 * ⚠ O COMENTÁRIO ANTERIOR DIZIA "decisão de produto: fora de um recorte de conta, o ponto de
 * vista padrão é o de quem paga". A decisão foi REVERTIDA para a exibição em 11/09/2026: o
 * operador lia "−R$" em vermelho num movimento que não saiu do negócio, e concluía prejuízo
 * onde houve mudança de bolso. Para o cálculo, o −1 continua — e continua correto, porque
 * quem chama já filtrou a transferência fora ou já tem conta em foco.
 */
export function sinalDoSentido(s: SentidoNaConta): 1 | -1 {
  return s === 'entrada' ? 1 : -1;
}

/**
 * A COR DO VALOR NA LISTA — FIN-LISTA-VISUAL-IGUAL-FINANCAS-01 (12/09/2026).
 *
 * ⚠ ELA VOLTOU A SER POR TIPO, e o cinza único do FIN-LISTA-VISUAL-06 foi um mal-entendido:
 * o pedido era fundo cinza na coluna, e a cor do VALOR foi para cinza por engano. Aqui as
 * classes são LITERALMENTE as do app Finanças, que é a referência aprovada
 * (`LancamentosTabela.tsx:365-369`): transferência `text-foreground`, negativo
 * `text-destructive`, o resto `text-success`.
 * ⚠ TRANSFERÊNCIA EM COR NEUTRA continua sendo a decisão de sempre (FIN-LISTA-TRANSF-SINAL-01,
 * e o Finanças diz o mesmo no comentário dele): verde ou vermelho afirmariam que o patrimônio
 * mudou, e numa transferência ele não mudou — o dinheiro trocou de bolso.
 */
const COR_TRANSFERENCIA = 'text-foreground';
const COR_SAIDA = 'text-destructive';
const COR_ENTRADA = 'text-success';

/** O valor de uma linha de lista: o texto e a cor, decididos juntos. */
export interface ValorDaLinha {
  texto: string;
  /** Classe Tailwind de cor. `text-foreground` é o "sem sinal" — nem ganho, nem perda. */
  classe: string;
  sentido: SentidoNaConta;
}

/**
 * COMO UMA LINHA DE LISTA MOSTRA O VALOR — FIN-LISTA-TRANSF-SINAL-01.
 *
 * ⚠ TEXTO E COR SAEM JUNTOS PORQUE SÃO A MESMA DECISÃO. Enquanto eram duas expressões no
 * JSX, a lista conseguia o estado impossível de um valor sem sinal pintado de vermelho —
 * e foi exatamente o que o operador viu: a transferência já vinha em módulo em algumas
 * telas e em vermelho em todas.
 * ⚠ TRANSFERÊNCIA SEM FOCO NÃO É ENTRADA NEM SAÍDA DO NEGÓCIO: o dinheiro mudou de bolso,
 * não de dono. Módulo e cor padrão são a única leitura honesta — "−R$ 1,1 mi" em vermelho
 * diz que o mês foi pior, e não foi.
 * ⚠ COM CONTA EM FOCO ELA VOLTA A TER LADO, e deve ter: filtrando por "Conta Destino =
 * Bradesco", o resgate ENTROU ali, e some-se em verde com sinal. É `sentidoNaConta` quem
 * resolve isso — aqui só se obedece.
 */
export function formatarValorLinha(
  l: LancamentoDirecional & { valor: number },
  contaFoco: string | null,
): ValorDaLinha {
  const sentido = sentidoNaConta(l, contaFoco);
  const absoluto = Math.abs(l.valor);
  if (sentido === 'transferencia') {
    return { texto: formatMoeda(absoluto), classe: COR_TRANSFERENCIA, sentido };
  }
  const entrada = sentido === 'entrada';
  return {
    texto: formatMoeda(entrada ? absoluto : -absoluto),
    classe: entrada ? COR_ENTRADA : COR_SAIDA,
    sentido,
  };
}

/**
 * A conta pela qual a lista está olhando, a partir dos dois filtros.
 *
 * ⚠ OS DOIS FILTROS ATIVOS NÃO SOMAM UM PONTO DE VISTA, ANULAM-NO: quem filtra origem E
 * destino está pedindo o movimento entre duas contas suas, e aí a transferência é o próprio
 * assunto — não uma entrada nem uma saída de nenhuma das duas.
 */
export function contaEmFoco(
  contaOrigem: string | null | undefined,
  contaDestino: string | null | undefined,
  semFiltro = '__all__',
): string | null {
  const origem = contaOrigem && contaOrigem !== semFiltro ? contaOrigem : null;
  const destino = contaDestino && contaDestino !== semFiltro ? contaDestino : null;
  if (destino && !origem) return destino;
  if (origem && !destino) return origem;
  return null;
}
