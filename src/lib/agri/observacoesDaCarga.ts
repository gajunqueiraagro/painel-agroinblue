/**
 * O que o OPERADOR escreveu nas observações de uma carga, separado do que a migração escreveu.
 *
 * ⚠ NASCE DE UM CAMPO SEQUESTRADO, não de zelo. Medido no proto em 21/09/2026: as 21 cargas
 * ativas de mandioca têm observações, as 21 falam de backfill e rateio por área, e NENHUMA tem
 * uma palavra de operador. O campo "Observações" do modal mostra, em todas elas:
 *
 *   "Carga de 40,34 t dividida por area entre IND.05 e IND.06 (sem cerca);
 *    backfill 16/09/2026 das planilhas T Cortez"
 *
 * e numa delas ainda " - cancelada: metade substituída pela carga corrigida", resíduo da reversão
 * da manhã de 21/09 — texto que sobreviveu numa linha que voltou a ficar ATIVA.
 *
 * ⚠ E O TEXTO DE RATEIO VIROU MENTIRA, o que é pior que ruído: as metades foram fundidas
 * (migrations 20261027124300 e 20261027124400) e a carga é UMA. Dizer "dividida por área entre
 * IND.05 e IND.06" descreve um estado que não existe mais.
 *
 * ⚠ ISTO NÃO LIMPA O BANCO, E A DIFERENÇA IMPORTA. A coluna continua com o texto; o que muda é o
 * que a tela mostra. Limpar de verdade é um UPDATE, e ele é decisão do Gabriel — o histórico de
 * como o dado entrou tem valor para quem for auditar o backfill depois. Esconder na leitura
 * devolve o campo ao operador sem apagar a procedência.
 */

/** Os separadores que a migração e o backfill usaram entre as sentenças. */
const SEPARADORES = /\s*(?:;|·|\s-\s)\s*/;

/**
 * As marcas de metadado. Uma sentença que case com QUALQUER uma delas não é do operador.
 * ⚠ Ancoradas em palavras que o backfill escreveu, não no texto inteiro: os números e os nomes de
 * talhão mudam de carga para carga, e casar a frase completa deixaria 20 das 21 passarem.
 */
const MARCAS: readonly RegExp[] = [
  /\bbackfill\b/i,
  /dividida por [áa]rea/i,
  /\bcancelada\b/i,
  /\bfundida na colheita\b/i,
];

/**
 * Devolve só o que o operador escreveu. Sem nada dele, string vazia — e vazio aqui é ausência
 * real, não dado escondido: o que foi removido é metadado, nunca observação de gente.
 */
export function observacoesDoOperador(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .split(SEPARADORES)
    .map(p => p.trim())
    .filter(p => p.length > 0 && !MARCAS.some(m => m.test(p)))
    .join('; ');
}

/** Se a tela está escondendo alguma coisa — para explicar a diferença em vez de sumir com ela. */
export function temMetadadoDeMigracao(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return MARCAS.some(m => m.test(texto));
}
