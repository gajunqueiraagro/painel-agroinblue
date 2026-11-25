/**
 * CARTAO-FATURA-GRAVAR (25/11) — a PORTA ÚNICA da leitura da fatura do cartão: as linhas do PDF → a mesma `FaturaLida`, venha do Ourocard
 * (BB) ou do Sicredi (Mastercard). O resto da prévia (casar, agrupar, gravar) não sabe de que banco veio. Pura.
 */
import { lerFaturaOurocard, type FaturaLida } from './lerFaturaOurocard';
import { lerFaturaSicredi, pareceFaturaSicredi } from './lerFaturaSicredi';

export function lerFaturaDoCartao(linhas: readonly string[]): FaturaLida {
  return pareceFaturaSicredi(linhas) ? lerFaturaSicredi(linhas) : lerFaturaOurocard(linhas);
}
