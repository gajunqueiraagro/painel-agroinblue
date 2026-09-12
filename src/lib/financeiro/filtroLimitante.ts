/**
 * O QUE IMPEDE A CONSULTA QUE NINGUÉM QUER — FIN-LISTA-PERF-01.
 *
 * ⚠ O NÚMERO QUE MOTIVOU: "Todos os anos" sem mais nada são 30.065 lançamentos do NJ, lidos em
 * 31 requisições EM SÉRIE (levas de mil). O recorte de um ano são 4.146, em cinco. Não é um
 * filtro lento — é a ausência de filtro, e o operador nunca pede isso de propósito: ele cai
 * nisso ao limpar o Ano para procurar outra coisa.
 *
 * ⚠ "LIMITANTE" NÃO É "ATIVO". Atividade corta 30 mil para 15 mil e tipo corta para 3,7 mil —
 * ativos, e inúteis como defesa. Só conta o que leva a centenas: um período, uma safra, uma
 * entidade (fornecedor, produto, conta) ou um nó fundo do plano (centro, subcentro).
 *
 * ⚠ E SÓ CONTA O QUE VAI AO SERVIDOR. Documento é filtrado em memória — contá-lo faria
 * "Documento 123 + Todos os anos" puxar as 30 mil para mostrar uma. A regra aqui e o `WHERE`
 * lá têm de falar da mesma coisa, ou a defesa vira teatro.
 * ⚠ E "SEM SAFRA" NÃO LIMITA: `safra_id IS NULL` é a maioria da base.
 */
export interface FiltrosDaTela {
  anos: string[];
  meses: string[];
  /** O id da safra, ou a sentinela de "sem safra" — que não limita. */
  safra: string;
  /**
   * A cultura escolhida, ou a sentinela de "sem cultura" — que não limita.
   * ⚠ HOJE ELA LIMITA MUITO: a coluna nasceu no AGRI-04A e quase toda linha ainda é nula,
   * então "mandioca" devolve dezenas. É exatamente por isso que ela precisa ir ao `WHERE` —
   * peneirar 30 mil em memória para mostrar dezenas é o custo que este filtro existe para
   * evitar.
   */
  cultura?: string;
  fornecedor: string;
  produto: string;
  contaOrigem: string;
  contaDestino: string;
  centro: string;
  subcentro: string;
}

export const TODOS = '__all__';
export const SEM_SAFRA = '__sem_safra__';
/** "Sem cultura (rateia)" — a pergunta oposta, e a que acha o que ainda não foi classificado. */
export const SEM_CULTURA = '__sem_cultura__';

/** Um campo de seleção está escolhido? (`''` e a sentinela de "todos" não contam.) */
const escolhido = (v: string | undefined): boolean => !!v && v.trim() !== '' && v !== TODOS;

/**
 * Há algum filtro que corte o suficiente para a consulta valer a pena?
 *
 * ⚠ PRODUTO CONTA porque vai ao banco: `lista_produto` vira `descricao.imatch.…` no `WHERE`
 * (conferido em `montarPlanoBaseV2` e nos dois builders). Se um dia deixar de ir, ele tem de
 * sair desta lista no mesmo PR — senão vira a permissão para puxar tudo.
 */
export function temFiltroLimitante(f: FiltrosDaTela): boolean {
  if (f.anos.length > 0) return true;
  if (f.meses.length > 0) return true;
  /* A safra atravessa dois anos civis de propósito — exigir um ano junto seria pedir ao
     produtor que desfizesse a própria pergunta. */
  if (escolhido(f.safra) && f.safra !== SEM_SAFRA) return true;
  /* ⚠ "SEM CULTURA" NÃO LIMITA, pelo mesmo motivo de "sem safra": `cultura IS NULL` é a base
     inteira hoje, e o predicado não vai ao servidor (a decisão está em `filtrosBaseV2`). */
  if (escolhido(f.cultura) && f.cultura !== SEM_CULTURA) return true;
  if (escolhido(f.fornecedor)) return true;
  if (escolhido(f.produto)) return true;
  if (escolhido(f.contaOrigem)) return true;
  if (escolhido(f.contaDestino)) return true;
  if (escolhido(f.centro)) return true;
  if (escolhido(f.subcentro)) return true;
  return false;
}

/**
 * A frase do estado vazio.
 *
 * ⚠ ELA NOMEIA QUATRO DOS NOVE CAMINHOS, e é escolha: listar os nove viraria um parágrafo que
 * ninguém lê. Período, safra, fornecedor e conta são os que o operador de fato usa para
 * chegar ao que procura; produto, centro e subcentro também destravam, e quem os usa não
 * precisa da frase para saber disso.
 */
export const FRASE_SEM_FILTRO =
  'Escolha um período, uma safra, um fornecedor ou uma conta para ver os lançamentos.';
