/* OC-DOC-ESPECIE-ABATE-01 passo 4 — O TEXTO DO PDF EM LINHAS, COMO NO PAPEL (a parte pura).
   ⚠ POR QUE NAO O `extractPdfText`: ele junta os itens de cada pagina com espaco, na ORDEM DO FLUXO do PDF, e a posicao se
     perde. No Romaneio da Minerva os rotulos saem todos antes ("Lote: Fornecedor: … Data Abate:") e os valores depois; na NF da
     JBS o "VALOR TOTAL DA NOTA" sai longe do numero. Ler por rotulo nesse texto e' adivinhar pela ordem. `extractPdfText` fica
     INTOCADO (o extrato bancario depende dele).
   A REGRA: itens agrupados pela altura (`y`, tolerancia de 2pt), cada linha da de cima para baixo, os itens da esquerda para a
   direita, as CELULAS juntas por " | ". Pagina por pagina, na ordem. `montarLinhas` e' pura (testada com itens falsos). */
export interface ItemDoPdf { str: string; x: number; y: number }
export const TOLERANCIA_DA_LINHA = 2;
export const SEPARADOR_DE_CELULA = ' | ';

export function montarLinhas(paginas: ItemDoPdf[][]): string[] {
  const out: string[] = [];
  for (const itens of paginas) {
    const linhas: { y: number; itens: ItemDoPdf[] }[] = [];
    for (const it of itens) {
      if (!it.str.trim()) continue;
      const l = linhas.find(x => Math.abs(x.y - it.y) <= TOLERANCIA_DA_LINHA);
      if (l) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
    }
    linhas.sort((a, b) => b.y - a.y);
    for (const l of linhas) out.push([...l.itens].sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(SEPARADOR_DE_CELULA));
  }
  return out;
}
