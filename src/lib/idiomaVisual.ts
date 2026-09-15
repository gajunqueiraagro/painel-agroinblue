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

/* O CINZA DO CABEÇALHO DE TABELA — #3a4864, o azul-ardósia das listas de grão.

   ⚠ ELE É MAIS CLARO QUE O `bg-primary`, não mais escuro, e vale repetir porque o briefing que o
   criou pedia "cinza escuro, não o cinza claro atual": o atual NÃO era cinza claro — era o navy
   `--primary` (#1d3a5d). Este é um passo ACIMA dele. A mudança é de tom, não de claro para
   escuro.
   ⚠ CABEÇALHO E TOTAL ANDAM JUNTOS: o total fecha a tabela e tem de ter a cor do cabeçalho,
   senão as duas bordas da lista se leem como blocos diferentes.
   ⚠ POR QUE SUBIU PARA CÁ: o hex estava escrito em QUATRO arquivos — `AgriEstoqueGraosTab`,
   `AgriBarterTab`, `CotacaoGraosModal` e `VendaAvulsaModal` — em cinco lugares, mais dois `<tr>`
   inline. É exatamente o caso que o cabeçalho deste módulo descreve: cor copiada é cor que
   diverge. Agora o hex existe UMA vez. */
export const CINZA_CABECALHO = 'bg-[#3a4864]';

/* A RÉGUA COMPLETA DO `<th>` cinza, e ela já era IDÊNTICA byte a byte em três arquivos
   (`AgriEstoqueGraosTab`, `CotacaoGraosModal`, `VendaAvulsaModal`) — por isso sobe inteira, não
   só a cor.

   ⚠ A LISTA DE INSUMOS DO BARTER NÃO USA ESTA: o `TH_INSUMO` de lá é `sticky`, tem `px-1.5` e
   NÃO tem `uppercase tracking-wide`. Ele monta a sua régua com o `CINZA_CABECALHO` acima, e
   continua sendo outra — unificar as duas mudaria a aparência daquela lista, que é o que uma
   extração não pode fazer. */
export const TH_CINZA =
  `${CINZA_CABECALHO} px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white`;
