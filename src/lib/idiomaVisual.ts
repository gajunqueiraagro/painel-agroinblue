/**
 * Idioma visual — o que significa cada cor.
 *
 * POR QUE ESTE MODULO EXISTE. `COR_FAZENDA` nasceu dentro do
 * `IndicadorHistoricoModal` (PR-26) e ganhou consumidores em outro arquivo.
 * Paleta declarada dentro de uma tela e paleta que o proximo consumidor
 * copia — e cor copiada e cor que diverge. O A13 do repo registra a regra
 * geral: correcao que nao vira lugar comum se paga de novo.
 *
 * ESCOPO: so a paleta de fazenda, por enquanto. Tooltip, formatadores e
 * marcadores ainda vivem duplicados nos dois modais e pedem o mesmo
 * tratamento — um concern por vez.
 */

/* Identidade de FAZENDA. Uso exclusivo: series onde cada linha e um
   LUGAR, nao um cenario. O azul #185FA5 NAO esta aqui — ele e a cor do
   REALIZADO e do GLOBAL, e a mesma cor nao pode significar "o total"
   numa aba e "a primeira fazenda" na outra.
   A ordem segue o CADASTRO, nao o volume: assim a mesma fazenda tem a
   mesma cor em todo grafico e em toda sessao. */
export const COR_FAZENDA = [
  '#BA7517', // amarelo escuro
  '#1D9E75', // verde
  '#7C3AED', // roxo
  '#DB2777', // rosa
  '#0891B2', // ciano
  '#D85A30', // coral
] as const;
