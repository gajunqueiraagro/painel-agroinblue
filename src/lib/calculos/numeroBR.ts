/**
 * O NÚMERO EM pt-BR: ler o que o operador digitou e escrever de volta — AGRI-COLHEITA-FIX-05.
 *
 * ⚠ MOVIDO DE `components/ui/campo-moeda.tsx`, BYTE A BYTE. Nada aqui foi redigitado: o
 * `parseMoeda` continua com a mesma regra de separadores e o mesmo arredondamento. O campo
 * segue importando daqui e REEXPORTANDO, então nenhum dos doze consumidores muda.
 * ⚠ SAIU DE LÁ PORQUE REGRA PURA NÃO PODE MORAR NUM COMPONENTE. `lib/agri/colheita.ts` declara
 * no topo que não importa React, e precisa deste parser: importá-lo do arquivo do campo
 * arrastaria React para dentro da camada de regra — e para dentro do teste dela.
 * ⚠ CONTINUA SENDO O ÚNICO PARSER DE NÚMERO DIGITADO. A proibição de escrever um segundo, que
 * está no campo, vale igual aqui: quem precisa ler "26.560" chama esta função.
 */

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * ARREDONDA COM N CASAS — o irmão do `round2` para quem precisa de mais de duas.
 *
 * ⚠ ELE NASCEU DA VENDA DE GRÃO (F3, 15/09/2026): saca e R$/saca passam a aceitar até QUATRO
 * casas na entrada, porque 1.942,986 sacas a R$ 97,8532 é o que o romaneio da cooperativa traz —
 * arredondar na digitação joga fora centavos que o comprador cobrou. O DINHEIRO continua em duas:
 * o valor de cada linha é `round2(sacas * preço)`, e é a soma desses que vira o lançamento.
 * ⚠ `round2` NÃO FOI TROCADO POR ELE. Doze consumidores chamam `round2`, e um deles com casas
 * erradas seria um centavo em lugar nenhum; `roundCasas(n, 2)` dá o mesmo número, mas a mudança
 * seria gratuita. Quem precisa de duas casas continua no `round2`.
 * ⚠ O `Number.EPSILON` VEM JUNTO pelo mesmo motivo de lá: sem ele `Math.round(1.005 * 100)` dá
 * 100, não 101 — o erro clássico de ponto flutuante que faz o total fechar um centavo abaixo.
 */
export const roundCasas = (n: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/**
 * ESCREVE EM pt-BR MOSTRANDO ATÉ N CASAS, com o piso de duas.
 *
 * ⚠ O PISO DE DUAS É O A19: dinheiro e quantidade se leem com centavos, sempre — "1.943" ao lado
 * de "1.942,99" faria o operador procurar a diferença. O TETO é que passa a variar: quem digitou
 * 1.942,986 vê as três casas que digitou, e quem digitou 10 vê "10,00".
 * ⚠ `maximumFractionDigits` NUNCA ABAIXO DO MÍNIMO — o `Intl` lança `RangeError` se o teto for
 * menor que o piso, e `casas < 2` acontece de verdade (um campo de inteiro chamaria com 0).
 */
export const formatCasas = (n: number, casas: number) =>
  n.toLocaleString('pt-BR', {
    minimumFractionDigits: Math.min(2, casas),
    maximumFractionDigits: Math.max(casas, Math.min(2, casas)),
  });

// FIX-01b — parser monetário NATURAL: não força centavos durante a digitação. Retorna null p/ vazio/inválido
//   (nunca NaN). Regra de separadores: último separador = decimal quando há '.' e ','; só ',' = decimal;
//   só '.' = decimal se 1-2 dígitos após, senão milhar (ex.: 10.000). Arredonda só na normalização final.
export function parseMoeda(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.replace(/[^\d.,]/g, '');           // remove R$, espaços, letras — mantém dígitos . ,
  if (s === '') return null;
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  let intRaw = '', decRaw = '';
  if (hasDot && hasComma) {
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    intRaw = s.slice(0, last).replace(/[.,]/g, '');
    decRaw = s.slice(last + 1).replace(/[.,]/g, '');
  } else if (hasComma) {
    const i = s.lastIndexOf(',');
    intRaw = s.slice(0, i).replace(/,/g, '');
    decRaw = s.slice(i + 1).replace(/,/g, '');
  } else if (hasDot) {
    const i = s.lastIndexOf('.');
    const dec = s.slice(i + 1);
    if (dec.length === 1 || dec.length === 2) { intRaw = s.slice(0, i).replace(/\./g, ''); decRaw = dec; }
    else { intRaw = s.replace(/\./g, ''); decRaw = ''; }
  } else {
    intRaw = s;
  }
  if (intRaw === '' && decRaw === '') return null;
  const n = Number(`${intRaw === '' ? '0' : intRaw}.${decRaw === '' ? '0' : decRaw}`);
  return Number.isFinite(n) ? n : null;
}
