/**
 * DINHEIRO DA NF-e EM CENTAVOS INTEIROS — FIN-NFE-XML-01a.
 *
 * O XML traz o valor como texto decimal com ponto ("1345.50"). Passar por `Number` e multiplicar por 100 erra no binario
 * (0.1 + 0.2 = 0.30000000000000004; 1345.5 * 100 pode nao ser inteiro). Aqui a conta e' feita SOBRE O TEXTO: parte inteira e
 * parte decimal viram inteiros, e centavos = inteiro × 100 + dois digitos. Nenhum float entra.
 *
 * ⚠ `null` = o texto nao e' um valor (vazio, letras, virgula, dois pontos). Zero e' valor: "0.00" devolve 0.
 * ⚠ MAIS DE DUAS CASAS (o leiaute permite ate' 10 em valores unitarios; os totais vem com 2): arredonda pela terceira casa,
 *   meio para cima em modulo — ainda sobre o texto.
 */
export function centavosDoTexto(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(texto.trim());
  if (!m) return null;
  const [, sinal, inteiro, decimal = ''] = m;
  const duas = (decimal + '00').slice(0, 2);
  let cent = Number.parseInt(inteiro, 10) * 100 + Number.parseInt(duas, 10);
  if (decimal.length > 2 && decimal.charCodeAt(2) >= 53 /* '5' */) cent += 1;
  if (!Number.isSafeInteger(cent)) return null;
  return sinal === '-' && cent !== 0 ? -cent : cent;
}

/** Soma de centavos: inteiros, sem float. */
export function somarCentavos(valores: readonly number[]): number {
  let total = 0;
  for (const v of valores) total += v;
  return total;
}
