/* OC-DOC-ESPECIE-ABATE-01 passo 4 — O NUMERO COMO O FRIGORIFICO O ESCREVE.
   Medido nos PDFs reais: "98.135,31", "1 295,39" e "69 677,28" (milhar com ESPACO, Minerva), "2850,79" (sem milhar, JBS),
   "9.512,600" e "203.705,330" (3 casas), "36,0", "273,0000". Regra unica: tira espaco e ponto de milhar, a virgula e' o decimal.
   Texto que nao e' numero devolve nulo — nunca zero. */
export function numeroDoPdf(texto: string | null | undefined): number | null {
  if (texto == null) return null;
  const t = texto.replace(/R\$/g, '').replace(/\s+/g, '').trim();
  if (!/^-?[\d.]+(,\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "dd/mm/aaaa" -> "aaaa-mm-dd"; outro formato, nulo. */
export function dataDoPdf(texto: string | null | undefined): string | null {
  const m = texto?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Centavos inteiros (a comparacao interna do PDF e' ao centavo, como a conferencia). */
export const centavos = (n: number) => Math.round(n * 100);
