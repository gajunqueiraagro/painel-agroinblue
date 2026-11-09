/**
 * MAPA-REBANHO-02 (Gabriel 08/11 08:43) — as larguras das colunas do Mapa do rebanho em PORCENTAGEM, UMA fonte para a tela e o PDF ("PDF
 * igual"): na proporção do que o conteúdo pede (medido no caso real 3M e PUR out/26, em px: Pasto 89 · Atividade 73 · Lote 124 · Programa
 * 84 · categoria ≤35 · Total 37 · Peso 39 · ✓ Peso 41 · Área 34 · UA/ha 33 · Qual 27). As categorias dividem o que sobra.
 */
export const PORCENTAGEM_DAS_COLUNAS_FIXAS: readonly number[] = [9, 8.3, 12.5, 8.7];          // Pasto, Atividade, Lote, Programa
export const PORCENTAGEM_DAS_COLUNAS_FINAIS: readonly number[] = [4.32, 4.55, 4.77, 3.98, 3.86, 3.18];  // Total, Peso, ✓ Peso, Área, UA/ha, Qual

/** as porcentagens de todas as colunas, na ordem da tabela (fixas · uma por categoria · finais); somam 100 */
export function porcentagensDoMapa(numCategorias: number): number[] {
  const fixo = [...PORCENTAGEM_DAS_COLUNAS_FIXAS, ...PORCENTAGEM_DAS_COLUNAS_FINAIS].reduce((a, b) => a + b, 0);
  const cat = numCategorias > 0 ? (100 - fixo) / numCategorias : 0;
  return [...PORCENTAGEM_DAS_COLUNAS_FIXAS, ...Array.from({ length: numCategorias }, () => cat), ...PORCENTAGEM_DAS_COLUNAS_FINAIS];
}

/** MAPA-REBANHO-02 opção B (Gabriel 08/11 10:00) — abaixo de 1060px de janela (a 1024: área de 880px; a 135%: 775px) a tabela vai em fonte menor (números
 *  e textos a 8,5px; as colunas de texto com folga de 2px) e as colunas na proporção medida nessa fonte. */
/* o limite é 1060 (não 1000): abaixo dele a área (janela − 144 do menu) fica menor que os 888px que a fonte normal pede — a 1024 cortavam
   2 textos da 3M */
export const LIMITE_ESTREITO = 1060;
/* medido a 8,5px no caso real (px): Pasto 72 · Atividade 57 · Lote 103 · Programa 69 · categoria ≤31 · Total 33 · Peso 35 · ✓ Peso 36 · Área 30 ·
   UA/ha 29 · Qual 23 = 766 px (cabe nos 775 da área a 135%); porcentagem = a medida ÷ 766 */
export const PORCENTAGEM_ESTREITA_FIXAS: readonly number[] = [9.4, 7.44, 13.45, 9.01];
export const PORCENTAGEM_ESTREITA_FINAIS: readonly number[] = [4.31, 4.57, 4.7, 3.92, 3.79, 3.0];

export function porcentagensDoMapaEstreito(numCategorias: number): number[] {
  const fixo = [...PORCENTAGEM_ESTREITA_FIXAS, ...PORCENTAGEM_ESTREITA_FINAIS].reduce((a, b) => a + b, 0);
  const cat = numCategorias > 0 ? (100 - fixo) / numCategorias : 0;
  return [...PORCENTAGEM_ESTREITA_FIXAS, ...Array.from({ length: numCategorias }, () => cat), ...PORCENTAGEM_ESTREITA_FINAIS];
}
