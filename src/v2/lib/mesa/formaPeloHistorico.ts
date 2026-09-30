/**
 * A forma de pagamento que o HISTÓRICO DO BANCO diz — PR-CONC-MESA-PAINEL-V1 item 4.
 *
 * ⚠ SÓ PARA O CRU, e só como SUGESTÃO: o lançamento que veio do extrato e ninguém classificou não tem forma de
 *   pagamento, mas o histórico do OFX quase sempre a diz ("Pix - Enviado", "Pagamento de Boleto - UNIPETRO", "Compra
 *   com Cartão - FRADELLI"). No classificado o sistema prevalece e esta função nem é chamada.
 * ⚠ O MAPA É O DO GABRIEL (30/09), e é fechado: Pix -> PIX; Pagamento de Boleto / Boleto -> Boleto; Compra com Cartão
 *   -> Cartão; TED / Transferência -> Transferência. Fora disso, `null` — chutar "Outro" gravaria um palpite com cara
 *   de dado. Os quatro destinos são valores de `FORMAS_PAGAMENTO_V2`, a lista do Novo Lançamento.
 * ⚠ O HISTÓRICO CHEGA COM ACENTO QUEBRADO: medido no NJ, "Compra com Cart�o" (o caractere de substituição no lugar
 *   do "ã"). Por isso "cart.o" aceita qualquer letra no meio, e o texto se normaliza antes.
 * ⚠ VENCE O QUE APARECE PRIMEIRO no texto: o prefixo é o banco falando da forma, o resto é o favorecido — e
 *   "Pagamento de Boleto - PIX COMERCIO" é boleto.
 */
import type { FORMAS_PAGAMENTO_V2 } from '@/lib/financeiro/formasPagamentoV2';

type FormaPagamentoV2 = typeof FORMAS_PAGAMENTO_V2[number];

const REGRAS: ReadonlyArray<{ re: RegExp; forma: FormaPagamentoV2 }> = [
  { re: /\bpix\b/, forma: 'PIX' },
  { re: /\bboleto\b/, forma: 'Boleto' },
  { re: /\bcompra com cart.o\b/, forma: 'Cartão' },
  { re: /\bted\b/, forma: 'Transferência' },
  { re: /\btransferencia\b/, forma: 'Transferência' },
];

export function formaPagamentoPeloHistorico(historico: string | null | undefined): FormaPagamentoV2 | null {
  if (!historico) return null;
  const t = historico.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let melhor: { pos: number; forma: FormaPagamentoV2 } | null = null;
  for (const { re, forma } of REGRAS) {
    const m = re.exec(t);
    if (m && (melhor === null || m.index < melhor.pos)) melhor = { pos: m.index, forma };
  }
  return melhor?.forma ?? null;
}
