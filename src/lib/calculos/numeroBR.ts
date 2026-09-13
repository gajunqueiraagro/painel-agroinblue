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
