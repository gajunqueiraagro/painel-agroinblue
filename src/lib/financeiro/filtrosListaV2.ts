/**
 * PR-FIN-LISTA-VENCIMENTO-03 · 2C-1 — filtros da lista traduzidos para o servidor.
 *
 * A tela financeira aplica seis filtros em memória, depois de baixar o conjunto
 * inteiro. Este módulo move para o servidor os que podem ser traduzidos **sem
 * mudar a semântica**, e deixa explícito quais não podem — e por quê.
 *
 * Princípio que rege o módulo: o predicado server-side é aplicado ANTES e a
 * cadeia client-side continua rodando DEPOIS. Portanto o servidor só pode
 * estreitar o conjunto de forma exatamente equivalente; qualquer filtro cuja
 * tradução não seja demonstravelmente idêntica fica de fora, porque estreitar
 * a mais some com linhas sem erro.
 */
import { TIPO_OPERACAO_TRANSFERENCIA } from './v2Transferencia';

/** Os dois valores aceitos como transferência, incluindo a variante legada de importação. */
export const TIPOS_TRANSFERENCIA = [TIPO_OPERACAO_TRANSFERENCIA, '3-Transferência'] as const;

export type DirecaoConta = 'origem' | 'destino';

/** Filtros da lista que este módulo sabe aplicar no servidor. */
export interface FiltrosListaV2 {
  /** 'origem' = saídas e transferências; 'destino' = entradas e transferências. */
  lista_conta_direcao?: DirecaoConta;
  /** Substring, case-insensitive, sobre descricao. */
  lista_produto?: string;
  /** Igualdade sobre favorecido_id. */
  lista_fornecedor_id?: string;
  /** Igualdade sobre grupo_custo. */
  lista_grupo_custo?: string;
  /** Atividade normalizada: 'pecuaria' | 'agricultura' | 'administrativo' | 'outros'. */
  lista_atividade?: string;
}

/** Os escopos que a normalização reconhece como atividade própria. */
export const ESCOPOS_CANONICOS = ['pecuaria', 'agricultura', 'administrativo'] as const;

/**
 * Escapa os metacaracteres de expressao regular POSIX, para que o termo digitado
 * seja tratado como texto literal — do mesmo modo que `String.includes` no cliente.
 *
 * POR QUE REGEX E NAO LIKE. O PostgREST traduz `*` para `%` no valor dos
 * operadores `like`/`ilike`, e NAO oferece escape para um `*` literal. Um termo
 * como `1*2` virava curinga e o servidor devolvia MAIS linhas que o cliente —
 * divergencia silenciosa. Com `imatch` (`~*`) nao ha traducao alguma: todo
 * caractere e literal desde que escapado aqui. Medido contra o PostgREST real
 * para `*`, `%`, `_`, `\`, virgula, parenteses e aspas.
 */
export function escaparRegex(termo: string): string {
  return termo.replace(/[.^$*+?()[\]{}|\\]/g, (c) => `\\${c}`);
}

/**
 * Cita um valor dentro de `or()`. Sem aspas, uma virgula ou um parentese no
 * termo quebraria o parser do PostgREST e o filtro mudaria de sentido. Dentro
 * das aspas, `"` e `\` sao escapados com `\`.
 *
 * A ordem importa e nao e negociavel: escapar para REGEX primeiro, citar depois.
 * O PostgREST desfaz uma camada de `\` ao ler o valor citado; se a ordem
 * inverter, o `\*` do regex chega como `*` e volta a ser curinga.
 */
export function citarValorOr(valor: string): string {
  return `"${valor.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

/**
 * Ramo `or()` de UM `imatch` sobre uma coluna. `null` quando o termo e vazio.
 * Usado ate para filtro de coluna unica: o formato citado do `or()` e o unico
 * que sobrevive a virgula e parentese no termo digitado.
 */
export function ramoImatch(coluna: string, termo?: string | null): string | null {
  const t = termo?.trim();
  if (!t) return null;
  return `${coluna}.imatch.${citarValorOr(escaparRegex(t))}`;
}

/** Normaliza a atividade a partir de escopo_negocio. Fonte única para tela e testes. */
export function normalizarAtividade(escopoNegocio?: string | null): string {
  const escopo = (escopoNegocio || '').toLowerCase().trim();
  if (escopo === 'pecuaria' || escopo === 'pecuária') return 'pecuaria';
  if (escopo === 'agricultura' || escopo === 'agri') return 'agricultura';
  if (escopo === 'administrativo') return 'administrativo';
  return 'outros';
}

/** Verdadeiro para os tipos de operação considerados transferência. */
export function ehTransferencia(tipoOperacao?: string | null): boolean {
  const t = (tipoOperacao || '').trim();
  return (TIPOS_TRANSFERENCIA as readonly string[]).includes(t);
}

/**
 * Ramo OR do filtro direcional de conta. `null` quando não há direção.
 * Espelha exatamente `sinal < 0 || isTransferenciaTipo(tipo)` (e o simétrico).
 */
export function ramoContaDirecao(direcao?: DirecaoConta): string | null {
  if (!direcao) return null;
  const tipos = TIPOS_TRANSFERENCIA.map((t) => `"${t}"`).join(',');
  const cmp = direcao === 'origem' ? 'sinal.lt.0' : 'sinal.gt.0';
  return `${cmp},tipo_operacao.in.(${tipos})`;
}

/**
 * Escopo canônico correspondente à atividade, ou `null` quando não há filtro ou
 * quando a atividade é 'outros' (que não é igualdade, e sim negação).
 */
export function escopoCanonicoAtividade(atividade?: string): string | null {
  if (!atividade) return null;
  const alvo = normalizarAtividade(atividade);
  return alvo === 'outros' ? null : alvo;
}

/**
 * Ramo OR de 'outros': escopo nulo ou fora do conjunto canônico.
 * `null` quando não há filtro ou quando a atividade é canônica.
 */
export function ramoAtividadeOutros(atividade?: string): string | null {
  if (!atividade) return null;
  if (normalizarAtividade(atividade) !== 'outros') return null;
  return `escopo_negocio.is.null,escopo_negocio.not.in.(${ESCOPOS_CANONICOS.join(',')})`;
}

/** Ramo `imatch` do filtro de produto, sobre `descricao`. `null` se o termo é vazio. */
export function padraoProduto(termo?: string): string | null {
  return ramoImatch('descricao', termo);
}

/** Forma da linha que os filtros deste módulo inspecionam. */
export interface LinhaFiltravel {
  /** TEXT no schema ('-1' | '0' | '1' | NULL), apesar do contrato antigo dizer number. */
  sinal?: string | number | null;
  tipo_operacao?: string | null;
  descricao?: string | null;
  favorecido_id?: string | null;
  grupo_custo?: string | null;
  escopo_negocio?: string | null;
}

/**
 * A mesma semântica dos predicados acima, em memória.
 * Existe para o gate E6 provar equivalência entre servidor e cliente.
 */
export function filtrarListaV2NoCliente<L extends LinhaFiltravel>(
  linhas: L[],
  filtros: FiltrosListaV2,
): L[] {
  let itens = linhas;

  if (filtros.lista_conta_direcao === 'origem') {
    itens = itens.filter((l) => (Number(l.sinal) || 0) < 0 || ehTransferencia(l.tipo_operacao));
  } else if (filtros.lista_conta_direcao === 'destino') {
    itens = itens.filter((l) => (Number(l.sinal) || 0) > 0 || ehTransferencia(l.tipo_operacao));
  }

  const produto = filtros.lista_produto?.trim();
  if (produto) {
    const q = produto.toLowerCase();
    itens = itens.filter((l) => (l.descricao || '').toLowerCase().includes(q));
  }

  if (filtros.lista_fornecedor_id) {
    itens = itens.filter((l) => l.favorecido_id === filtros.lista_fornecedor_id);
  }

  if (filtros.lista_grupo_custo) {
    itens = itens.filter((l) => l.grupo_custo === filtros.lista_grupo_custo);
  }

  if (filtros.lista_atividade) {
    const alvo = normalizarAtividade(filtros.lista_atividade);
    itens = itens.filter((l) => normalizarAtividade(l.escopo_negocio) === alvo);
  }

  return itens;
}

/**
 * NOTA DE PROJETO — o que já foi traduzido, e o que ainda depende de dados.
 *
 * documento — RESOLVIDO. A view `vw_financeiro_lancamentos_v2_doc` materializa
 *   `documento_formatado`, e o filtro casa contra ele e contra `numero_documento`
 *   por `imatch`. Ver filtrosBaseV2.montarPlanoBaseV2.
 *
 * DÍVIDA REMANESCENTE — atividade depende de uma premissa de dados
 *   O predicado usa igualdade e `not.in` sobre os valores canônicos, porque
 *   PostgREST não expõe `lower`/`btrim` em filtro. Isso é fiel enquanto os dados
 *   estiverem normalizados — medição no proto: cinco valores distintos, todos já
 *   em minúsculas e sem espaços ('pecuaria' 66.238, 'administrativo' 13.340,
 *   'agricultura' 1.137, 'financeiro' 368, NULL 519).
 *
 *   O gate de dados desta frente confirma a premissa antes do uso. A correção
 *   definitiva é uma CHECK constraint ou normalização na escrita, de modo que
 *   'Pecuária' com maiúscula não possa entrar. Frente própria; nenhum dado foi
 *   alterado aqui.
 */
