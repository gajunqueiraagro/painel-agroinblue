/**
 * O SUBCENTRO DE UMA VENDA DE REBANHO — fonte única (OC-BOITEL-VALOR-01, 24/09/2026).
 *
 * ⚠ NASCE DE DUAS FONTES QUE DISCORDAVAM. A regra vivia duas vezes: em
 * `useOperacaoLiquidacao` (que ESCREVE a classificação da OC) e dentro de
 * `usePlanejamentoFinanceiro.mapRebanhoSubcentro` (que AGREGA a meta para a tela). O
 * Planejamento já sabia do boitel; a OC não. Resultado medido em 24/09: das cinco OCs de
 * boitel do banco, quatro gravaram a principal em 1140 "Venda de Machos Adultos" e
 * nenhuma em 1150 "Venda em Boitel" — o subcentro existia no plano e nenhum escritor o
 * usava.
 *
 * ⚠ O EIXO DO BOITEL VEM ANTES DA CATEGORIA, e a ordem é a regra: um garrote vendido por
 * boitel é receita de boitel, não de macho adulto. A categoria só decide quando não há
 * boitel.
 *
 * ⚠ `mamotes_*` CAI EM DESMAMA, e esta é a escolha que a unificação teve de fazer: a OC
 * mandava mamote para Desmama (decisão do Gabriel, registrada: "mamote não é desmama, mas
 * o plano não tem faixa mais nova") e o Planejamento, para Adulto. Venceu a da OC, que
 * tinha o porquê escrito. Medido antes de decidir: `mamotes_*` em venda existe em 2
 * linhas do banco, ambas `cenario = 'realizado'` — e o Planejamento só lê `meta`. A
 * divergência valia ZERO linha no dia da troca; ela voltaria a valer na primeira venda de
 * mamote planejada.
 */

/** `1-Entradas` · centro `Venda Peso Vivo` · ordem_exibicao 1150. */
export const SUBCENTRO_VENDA_BOITEL = 'Venda em Boitel';

/**
 * As categorias e os quatro subcentros do par sexo × faixa etária.
 *
 * ⚠ OS APELIDOS NÃO SÃO ENFEITE. `bezerros_m`, `machos_adultos` e as irmãs vinham só do
 * Planejamento; deixá-las de fora faria a unificação devolver `null` onde antes havia
 * classificação, e uma linha da meta sumiria da grade sem erro nenhum.
 */
const POR_CATEGORIA: Record<string, string> = {
  mamotes_m: 'Venda de Desmama Machos',
  desmama_m: 'Venda de Desmama Machos',
  bezerros_m: 'Venda de Desmama Machos',
  mamotes_f: 'Venda de Desmama Fêmeas',
  desmama_f: 'Venda de Desmama Fêmeas',
  bezerras_f: 'Venda de Desmama Fêmeas',
  garrotes: 'Venda de Machos Adultos',
  bois: 'Venda de Machos Adultos',
  touros: 'Venda de Machos Adultos',
  machos_adultos: 'Venda de Machos Adultos',
  novilhas: 'Venda de Fêmeas Adultas',
  vacas: 'Venda de Fêmeas Adultas',
  femeas_adultas: 'Venda de Fêmeas Adultas',
};

/**
 * O subcentro de ENTRADA de uma venda.
 *
 * ⚠ CATEGORIA FORA DO MAPA DEVOLVE `null`, NUNCA UM PALPITE: `oc_criar_compromisso` recusa
 * subcentro que não exista no plano, e inventar um só trocaria o erro de lugar. Quem chama
 * decide se recusa a operação ou deixa o campo em branco para o operador escolher.
 */
export function subcentroDaVenda(categoria: string, temBoitel: boolean): string | null {
  if (temBoitel) return SUBCENTRO_VENDA_BOITEL;
  return POR_CATEGORIA[categoria] ?? null;
}
