/**
 * O QUE É CAIXA E O QUE NÃO É — PR-AGRI-BARTER-PERMUTA-SEPARADA.
 *
 * ⚠ A CONTA DE PERMUTA NÃO É DINHEIRO. Ela registra o que o produtor DEVE e o que TEM A
 * RECEBER em grão com a cooperativa (o barter), e some no caixa ela inflaria o saldo do banco
 * com valor que não está em banco nenhum. O tipo `permuta` existe no `CHECK` desde o
 * AGRI-BARTER-03A justamente para esta separação — e é aqui que ela vira regra de front.
 *
 * ⚠ UMA RÉGUA SÓ, e por isso este arquivo existe. Seis telas leem `tipo_conta` hoje
 * (Mesa de classificação, Mesa de enriquecimento e seu modal, catálogo do cliente, Mesa
 * operacional e os saldos da Home); cada uma decidindo por conta própria o que é banco seria o
 * mesmo que ter seis definições de caixa — e a que esquecer a permuta é a que infla o número.
 *
 * ⚠ LISTA BRANCA, NUNCA LISTA NEGRA: caixa é `cc`, `inv` e `cartao`, não "tudo menos permuta".
 * No dia em que entrar um tipo novo — consignado, adiantamento, o que for — ele fica FORA do
 * caixa até alguém decidir que entra. Errar para menos num saldo é conservador; errar para
 * mais é o produtor achar que tem dinheiro que não tem.
 * ⚠ `null` NÃO É CAIXA pelo mesmo motivo: 0 das 69 contas do Proto têm tipo nulo hoje (medido
 * em 13/09/2026), mas o `CHECK` admite nulo, e uma conta sem tipo declarado é justamente a que
 * ninguém classificou.
 */

/** O tipo da conta que registra o barter. */
export const TIPO_PERMUTA = 'permuta';

/** Os tipos que somam no caixa do produtor — dinheiro de verdade. */
export const TIPOS_DE_CAIXA: readonly string[] = ['cc', 'inv', 'cartao'];

export function ehPermuta(tipo: string | null | undefined): boolean {
  return (tipo ?? '').trim().toLowerCase() === TIPO_PERMUTA;
}

/**
 * A conta entra na soma de saldo de caixa?
 *
 * ⚠ É ESTA FUNÇÃO QUE PROTEGE O SALDO. Quem somar contas sem passar por ela está somando
 * permuta com banco.
 */
export function ehContaDeCaixa(tipo: string | null | undefined): boolean {
  const t = (tipo ?? '').trim().toLowerCase();
  return TIPOS_DE_CAIXA.includes(t);
}

/*
 * ⚠ RÓTULO NÃO MORA AQUI. `lib/financeiro/gruposDeConta` já é a régua de ordem e nome dos
 * grupos de conta, e serve os 35 consumidores do `ContaBancariaSelect` — escrever um segundo
 * mapa de rótulos neste arquivo seria criar a divergência que aquele arquivo nasceu para
 * acabar. Este módulo responde UMA pergunta que lá não existe: o que soma no caixa.
 */
