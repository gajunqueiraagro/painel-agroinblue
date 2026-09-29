/**
 * Linha digitável de boleto bancário — FIN-NFE-PARCELAS-01 PR 2b.
 *
 * O boleto em PDF traz a linha digitável (47 dígitos) na camada de texto. Dela sai o VENCIMENTO e o
 * VALOR sem adivinhar nada do layout do banco:
 *   campo 5 = fator de vencimento (4 dígitos) + valor (10 dígitos, em centavos).
 *
 * ⚠ O FATOR REINICIOU EM 22/02/2025: o fator 1000 passou a ser 22/02/2025 (antes, a base era
 *   07/10/1997 e o fator 9999 caía em 21/02/2025). Medido nos 8 boletos reais da Vera (29/09/2026):
 *   a regra nova dá exatamente o vencimento impresso nos 8; a antiga daria 2002.
 * ⚠ SEM LINHA, NULL — nunca um vencimento inventado. Fator 0000 ("sem vencimento") dá vencimento nulo.
 */

export interface LeituraBoleto {
  /** Os 47 dígitos, sem separador. */
  linha: string;
  /** `YYYY-MM-DD`, ou null quando o boleto não traz vencimento (fator 0000). */
  vencimento: string | null;
  /** Em reais, ou null quando o valor vem zerado (boleto de valor livre). */
  valor: number | null;
}

/** Os cinco campos da linha, com os separadores que os bancos imprimem (ponto e espaço). */
const COM_SEPARADOR = /(\d{5})[.\s]?(\d{5})\s+(\d{5})[.\s]?(\d{6})\s+(\d{5})[.\s]?(\d{6})\s+(\d)\s+(\d{14})/;

const BASE_FATOR = Date.UTC(2025, 1, 22); // fator 1000
const DIA = 86_400_000;

/** Fator de vencimento -> data, pela regra vigente desde 22/02/2025. */
export function vencimentoDoFator(fator: number): string | null {
  if (!Number.isInteger(fator) || fator <= 0) return null;
  const d = new Date(BASE_FATOR + (fator - 1000) * DIA);
  return d.toISOString().slice(0, 10);
}

/** Lê a linha digitável de 47 dígitos (com ou sem separadores). Devolve null se não houver. */
export function lerLinhaDigitavel(texto: string): LeituraBoleto | null {
  const m = COM_SEPARADOR.exec(texto);
  let linha: string | null = m ? m.slice(1).join('') : null;
  if (!linha) {
    const corrido = /(?:^|\D)(\d{47})(?!\d)/.exec(texto);
    linha = corrido ? corrido[1] : null;
  }
  if (!linha || linha.length !== 47) return null;
  const fator = Number(linha.slice(33, 37));
  const centavos = Number(linha.slice(37));
  return {
    linha,
    vencimento: fator === 0 ? null : vencimentoDoFator(fator),
    valor: centavos > 0 ? centavos / 100 : null,
  };
}
