/**
 * PR-FIN-LISTA-VENCIMENTO-03 — lista paginada no servidor.
 *
 * Lê a view `vw_financeiro_lancamentos_v2_doc` (security_invoker, RLS intacta) e
 * agrega os totais por RPC. A lista NUNCA baixa o conjunto inteiro, e os totais
 * também não: quem soma é o Postgres.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TIPAGEM DAS COLUNAS
 *
 * A view não está em `types.ts` (regen é frente própria), então o builder do
 * supabase-js chega aqui sem conhecer a relação. Em vez de aceitar um builder
 * `any` — que engoliria `'cenarrio'` sem reclamar —, declaramos `LinhaViewDoc`
 * e um builder cujos parâmetros de coluna são `keyof LinhaViewDoc`. O cast
 * acontece UMA vez, na fronteira, e a partir dali todo nome de coluna é
 * conferido pelo compilador.
 *
 * A restrição é uma união simples (`C extends ColunaView`), nunca um genérico
 * recursivo sobre o próprio builder — que é o que estoura o TS2589.
 */
import { filtrarListaV2NoCliente, ramoImatch, type LinhaFiltravel } from './filtrosListaV2';
import { formatDocumento } from './documentoHelper';
import {
  montarPlanoBaseV2,
  mesesDoRecorte,
  faixaMes,
  semRecorteDePeriodo,
  type FiltrosV2,
  type PlanoBaseV2,
  type DimensaoDataFinanceiro,
} from './filtrosBaseV2';

/** Nome da view. */
export const VIEW_LISTA_DOC = 'vw_financeiro_lancamentos_v2_doc';

/** Nome da RPC de agregação. */
export const RPC_TOTAIS = 'fn_lista_v2_totais';

/** Tamanho de página congelado no GO. */
export const TAMANHO_PAGINA_LISTA = 30;

/**
 * Projeção da view, NOMINAL e na mesma ordem do gate VW4 da migration.
 * As duas listas precisam bater; o script de gates do kit compara as duas
 * textualmente, para que uma não ande sem a outra.
 */
export const COLUNAS_VIEW_DOC = [
  'id', 'cliente_id', 'fazenda_id',
  'data_competencia', 'data_pagamento', 'data_vencimento', 'ano_mes',
  'valor', 'sinal', 'tipo_operacao', 'status_transacao', 'cenario',
  'descricao', 'macro_custo', 'grupo_custo', 'centro_custo', 'subcentro', 'escopo_negocio',
  'observacao', 'documento', 'historico',
  'numero_documento', 'tipo_documento',
  'favorecido_id', 'conta_bancaria_id', 'conta_destino_id',
  'origem_lancamento', 'origem_tipo', 'lote_importacao_id', 'financiamento_id',
  'movimentacao_rebanho_id', 'safra_id',
  'forma_pagamento', 'dados_pagamento',
  'cancelado', 'conciliado_em', 'editado_manual', 'created_at', 'updated_at',
  'mes_competencia', 'mes_vencimento', 'mes_pagamento', 'mes_financeira',
  'documento_formatado',
] as const;

/** Linha da view. `sinal` é TEXT no schema, apesar do contrato antigo dizer number. */
export interface LinhaViewDoc {
  id: string;
  cliente_id: string;
  fazenda_id: string | null;
  data_competencia: string | null;
  data_pagamento: string | null;
  data_vencimento: string | null;
  ano_mes: string | null;
  valor: number | null;
  sinal: string | number | null;
  tipo_operacao: string | null;
  status_transacao: string | null;
  cenario: string | null;
  descricao: string | null;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
  subcentro: string | null;
  escopo_negocio: string | null;
  observacao: string | null;
  documento: string | null;
  historico: string | null;
  numero_documento: string | null;
  tipo_documento: string | null;
  favorecido_id: string | null;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
  origem_lancamento: string | null;
  origem_tipo: string | null;
  lote_importacao_id: string | null;
  financiamento_id: string | null;
  movimentacao_rebanho_id: string | null;
  safra_id: string | null;
  forma_pagamento: string | null;
  dados_pagamento: string | null;
  cancelado: boolean | null;
  conciliado_em: string | null;
  editado_manual: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  mes_competencia: number | null;
  mes_vencimento: number | null;
  mes_pagamento: number | null;
  mes_financeira: number | null;
  documento_formatado: string;
}

export type ColunaView = keyof LinhaViewDoc & string;

export interface RespostaView {
  data: LinhaViewDoc[] | null;
  /** Preenchido só quando a consulta pede `count: 'exact'`. */
  count?: number | null;
  error: { message?: string } | null;
}

/** Opções de abertura. `head` traz o count sem trafegar linha alguma. */
export interface OpcoesAbertura {
  count?: 'exact';
  head?: boolean;
}

/**
 * Builder da view, com os nomes de coluna conferidos pelo compilador.
 * `PromiseLike` para que `await builder` funcione como no supabase-js.
 */
export interface BuilderView extends PromiseLike<RespostaView> {
  eq<C extends ColunaView>(coluna: C, valor: NonNullable<LinhaViewDoc[C]>): BuilderView;
  neq<C extends ColunaView>(coluna: C, valor: NonNullable<LinhaViewDoc[C]>): BuilderView;
  in<C extends ColunaView>(coluna: C, valores: readonly NonNullable<LinhaViewDoc[C]>[]): BuilderView;
  not<C extends ColunaView>(coluna: C, operador: 'is', valor: null): BuilderView;
  or(filtro: string): BuilderView;
  order<C extends ColunaView>(coluna: C, opcoes: { ascending: boolean; nullsFirst?: boolean }): BuilderView;
  range(de: number, ate: number): BuilderView;
}

/** Abre uma consulta sobre a view. */
export type AbrirView = (colunas: string, opcoes?: OpcoesAbertura) => BuilderView;

/** Executa a RPC de totais. */
export type ChamarRpcTotais = (params: ParamsTotais) => Promise<{
  data: LinhaTotais[] | LinhaTotais | null;
  error: { message?: string } | null;
}>;

// ─────────────────────────────────────────────────────────────────────────────
// Aplicação do plano — sequência FIXA de `if`s, jamais um laço
//
// Cada `if` é um slot nomeado do plano. Um laço sobre uma lista de predicados
// reatribuindo `query` é exatamente o que estoura a inferência do TypeScript
// (TS2589). A verbosidade aqui é o preço do gate de tipos ficar limpo.
// ─────────────────────────────────────────────────────────────────────────────

export function aplicarPlanoNaView(inicial: BuilderView, plano: PlanoBaseV2): BuilderView {
  let q = inicial
    .eq('cliente_id', plano.clienteId)
    .eq('cancelado', false)
    .neq('status_transacao', 'conciliado')
    .neq('cenario', 'meta');

  if (plano.fazendaId) q = q.eq('fazenda_id', plano.fazendaId);
  if (plano.naoNuloDimensao) q = q.not(plano.naoNuloDimensao, 'is', null);
  if (plano.orTemporal) q = q.or(plano.orTemporal);
  if (plano.mesesDimensao) {
    const col = plano.mesesDimensao.coluna as 'mes_competencia' | 'mes_vencimento' | 'mes_pagamento' | 'mes_financeira';
    q = q.in(col, plano.mesesDimensao.valores);
  }
  if (plano.transferenciaEntreContas) {
    q = q.eq('tipo_operacao', '3-Transferências');
    q = q.eq('conta_bancaria_id', plano.transferenciaEntreContas.origem);
    q = q.eq('conta_destino_id', plano.transferenciaEntreContas.destino);
  }
  if (plano.contaBancariaId) q = q.eq('conta_bancaria_id', plano.contaBancariaId);
  if (plano.contaDestinoId) q = q.eq('conta_destino_id', plano.contaDestinoId);
  if (plano.tipoOperacao) q = q.eq('tipo_operacao', plano.tipoOperacao);
  if (plano.orStatus) q = q.or(plano.orStatus);
  if (plano.statusIn) q = q.in('status_transacao', plano.statusIn);
  if (plano.conciliadoNaoNulo) q = q.not('conciliado_em', 'is', null);
  if (plano.macroCusto) q = q.eq('macro_custo', plano.macroCusto);
  if (plano.grupoCusto) q = q.eq('grupo_custo', plano.grupoCusto);
  if (plano.centroCusto) q = q.eq('centro_custo', plano.centroCusto);
  if (plano.subcentro) q = q.eq('subcentro', plano.subcentro);
  if (plano.orDirecao) q = q.or(plano.orDirecao);
  if (plano.orDescricao) q = q.or(plano.orDescricao);
  if (plano.favorecidoId) q = q.eq('favorecido_id', plano.favorecidoId);
  if (plano.listaGrupoCusto) q = q.eq('grupo_custo', plano.listaGrupoCusto);
  if (plano.escopoNegocio) q = q.eq('escopo_negocio', plano.escopoNegocio);
  if (plano.orAtividadeOutros) q = q.or(plano.orAtividadeOutros);
  if (plano.orDocumento) q = q.or(plano.orDocumento);

  return q;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lista
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcoesPagina {
  pagina?: number;
  tamanhoPagina?: number;
  /** Traz de volta, ADITIVAMENTE, as linhas sem vencimento que o período cortou. */
  incluirSemVencimento?: boolean;
}

export const RAMO_SEM_VENCIMENTO = 'data_vencimento.is.null';

/** Ordenação padrão congelada no GO. */
export function ordenarPorVencimento(q: BuilderView): BuilderView {
  return q
    .order('data_vencimento', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });
}

/** Faixa `[de, até]` inclusiva que o `range()` do PostgREST espera. */
export function faixaDaPagina(pagina: number, tamanho: number): [number, number] {
  const p = Math.max(0, Math.trunc(pagina));
  const de = p * tamanho;
  return [de, de + tamanho - 1];
}

/** Plano da lista: view + ramo aditivo de sem-vencimento quando pedido. */
export function planoDaLista(clienteId: string, filtros: FiltrosV2, opcoes: OpcoesPagina): PlanoBaseV2 {
  const ramoExtra = opcoes.incluirSemVencimento && !semRecorteDePeriodo(filtros)
    ? RAMO_SEM_VENCIMENTO
    : undefined;
  return montarPlanoBaseV2(clienteId, filtros, { relacao: 'view', ramoTemporalExtra: ramoExtra });
}

/** Uma página da lista, ordenada pelo contrato e recortada por `range`. */
export async function consultarPagina(
  abrir: AbrirView,
  clienteId: string,
  filtros: FiltrosV2,
  opcoes: OpcoesPagina = {},
): Promise<LinhaViewDoc[]> {
  const tamanho = opcoes.tamanhoPagina ?? TAMANHO_PAGINA_LISTA;
  const [de, ate] = faixaDaPagina(opcoes.pagina ?? 0, tamanho);
  const q = aplicarPlanoNaView(abrir('*'), planoDaLista(clienteId, filtros, opcoes));
  const { data, error } = await ordenarPorVencimento(q).range(de, ate);
  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 2C-3 — conjunto COMPLETO, para exportação e cancelamento em massa
//
// A lista visual pede 30 linhas e nunca mais que isso. Exportar e cancelar em
// massa, porém, precisam do conjunto inteiro do filtro. Esta função é o único
// lugar autorizado a buscá-lo, e só é chamada por ação explícita do operador —
// nunca durante a renderização.
//
// Três armadilhas, e como cada uma é fechada:
//
//   páginas que mudam durante a leitura
//     O acervo pode receber escrita entre um lote e o seguinte, e aí o `range`
//     desliza: uma linha some da página 2 porque entrou uma na 1. Por isso os
//     ids são DEDUPLICADOS num Set, e o laço para quando um lote inteiro não
//     traz nada novo — situação que, sem essa saída, giraria para sempre.
//
//   conjunto grande demais
//     Há teto de lotes. Ao bater no teto a função LEVANTA ERRO em vez de
//     devolver o que juntou: um arquivo parcial entregue como completo é pior
//     do que uma exportação que falha.
//
//   resposta obsoleta
//     O `AbortSignal` é conferido antes e depois de cada lote. Trocar de filtro
//     no meio da preparação aborta em vez de misturar dois conjuntos.
// ─────────────────────────────────────────────────────────────────────────────

/** Lote da varredura do conjunto completo. */
export const LOTE_CONJUNTO = 1000;

/** Teto de lotes. 200 × 1000 = 200 mil linhas — bem acima do maior tenant real. */
export const MAX_LOTES_CONJUNTO = 200;

/** Falha que impede entregar conjunto parcial como se fosse completo. */
export class ErroConjuntoIncompleto extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConjuntoIncompleto';
  }
}

/** Falha por obsolescência: o pedido foi abandonado antes de terminar. */
export class ErroConjuntoObsoleto extends Error {
  constructor() {
    super('A busca foi substituída por outra mais recente.');
    this.name = 'ErroConjuntoObsoleto';
  }
}

export interface OpcoesConjunto {
  tamanhoLote?: number;
  maxLotes?: number;
  /** Abortar quando o pedido deixar de ser o corrente. */
  sinal?: { readonly aborted: boolean };
  incluirSemVencimento?: boolean;
}

/**
 * Contagem EXATA do mesmo conjunto, pelo mesmo plano, sem trazer linha alguma.
 * É o oráculo contra o qual a leitura paginada é conferida.
 */
export async function contarConjunto(
  abrir: AbrirView,
  plano: PlanoBaseV2,
): Promise<number> {
  const q = aplicarPlanoNaView(abrir('id', { count: 'exact', head: true }), plano);
  const { count, error } = await q;
  if (error) throw error;
  if (count === null || count === undefined) {
    throw new ErroConjuntoIncompleto(
      'Não foi possível contar o conjunto do filtro. A operação foi interrompida '
      + 'para não trabalhar sobre um conjunto de tamanho desconhecido.',
    );
  }
  return count;
}

/**
 * Busca TODAS as linhas do filtro, na ordenação do contrato, com a mesma
 * semântica server-side da lista.
 *
 * A regra é fail-closed em toda saída: ou o conjunto devolvido tem exatamente o
 * tamanho que o servidor disse ter, ou a função levanta. Nunca há retorno
 * parcial — nem quando as páginas deslizam, nem quando o acervo encolhe, nem
 * quando um lote cheio só traz repetidos.
 *
 * O oráculo é um `count` exato tirado do MESMO plano, imediatamente antes da
 * leitura. Sem ele, a paginação por offset não tem como distinguir "acabou" de
 * "perdi linhas no caminho" — foi exatamente esse o defeito corrigido aqui.
 *
 * A paginação por cursor sobre (data_vencimento, id) resolveria o deslize na
 * raiz, em vez de detectá-lo. Fica registrada como evolução; não é esta correção.
 */
export async function buscarConjuntoCompleto(
  abrir: AbrirView,
  clienteId: string,
  filtros: FiltrosV2,
  opcoes: OpcoesConjunto = {},
): Promise<LinhaViewDoc[]> {
  const tamanho = opcoes.tamanhoLote ?? LOTE_CONJUNTO;
  const maxLotes = opcoes.maxLotes ?? MAX_LOTES_CONJUNTO;
  const teto = maxLotes * tamanho;
  const sinal = opcoes.sinal;
  const plano = planoDaLista(clienteId, filtros, {
    incluirSemVencimento: opcoes.incluirSemVencimento,
  });

  if (sinal?.aborted) throw new ErroConjuntoObsoleto();

  // Oráculo primeiro. Falha aqui propaga: sem tamanho conhecido, não se exporta
  // e não se cancela.
  const esperado = await contarConjunto(abrir, plano);
  if (sinal?.aborted) throw new ErroConjuntoObsoleto();

  // Acima do teto, falha ANTES de ler qualquer página.
  if (esperado > teto) {
    throw new ErroConjuntoIncompleto(
      `O conjunto tem ${esperado} registros e excede o limite de ${teto} desta operação. `
      + 'Nada foi gerado. Estreite o filtro e tente de novo.',
    );
  }

  const vistos = new Set<string>();
  const linhas: LinhaViewDoc[] = [];

  for (let lote = 0; lote < maxLotes; lote++) {
    if (sinal?.aborted) throw new ErroConjuntoObsoleto();

    const de = lote * tamanho;
    const q = aplicarPlanoNaView(abrir('*'), plano);
    const { data, error } = await ordenarPorVencimento(q).range(de, de + tamanho - 1);
    if (error) throw error;
    if (sinal?.aborted) throw new ErroConjuntoObsoleto();

    const recebidas = data ?? [];
    if (recebidas.length === 0) break;

    let novas = 0;
    for (const l of recebidas) {
      if (vistos.has(l.id)) continue;
      vistos.add(l.id);
      linhas.push(l);
      novas++;
    }

    // Lote CHEIO e nenhuma linha nova: o acervo está deslizando sob a leitura.
    // Antes isto devolvia o acumulado — um conjunto parcial entregue como
    // completo. Agora levanta: a exportação não gera arquivo e o cancelamento
    // não começa a mutar.
    if (novas === 0) throw new ErroConjuntoObsoleto();
    if (recebidas.length < tamanho) break;
  }

  // Gate único, aplicado a TODAS as saídas: página vazia, página incompleta,
  // esgotamento do teto e conjunto vazio passam por aqui.
  if (linhas.length !== esperado) {
    throw new ErroConjuntoObsoleto();
  }
  return linhas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancelamento em massa — preparação
//
// Vive aqui, e não dentro do hook, por um motivo prático: assim o teste exercita
// a MESMA função que roda em produção. Uma reimplementação da sequência no teste
// provaria apenas que a reimplementação está certa.
//
// A separação entre PREPARAR e MUTAR é o contrato: nenhuma escrita começa antes
// de o conjunto inteiro estar lido e validado.
// ─────────────────────────────────────────────────────────────────────────────

/** Lote de mutação. Preservado do comportamento anterior. */
export const LOTE_CANCELAMENTO = 100;

/** Elegibilidade do cancelamento em massa, preservada: realizado + importado + vivo. */
export function ehElegivelParaCancelamento(l: {
  status_transacao?: string | null;
  lote_importacao_id?: string | null;
  cancelado?: boolean | null;
}): boolean {
  return l.status_transacao === 'realizado'
    && !!l.lote_importacao_id
    && l.cancelado === false;
}

/**
 * Lê o conjunto INTEIRO do filtro e devolve os ids elegíveis, deduplicados.
 * Levanta erro se a leitura falhar ou for abandonada — e nesse caso o chamador
 * não deve mutar nada.
 */
export async function prepararCancelamentoEmLote(
  abrir: AbrirView,
  clienteId: string,
  filtros: FiltrosV2,
  opcoes: OpcoesConjunto = {},
): Promise<string[]> {
  const todos = await buscarConjuntoCompleto(abrir, clienteId, filtros, opcoes);
  const elegiveis = todos.filter(ehElegivelParaCancelamento);
  return Array.from(new Set(elegiveis.map((l) => l.id)));
}

/** Fatia os ids nos lotes de mutação. Lista vazia devolve zero lotes. */
export function lotesDeCancelamento(ids: readonly string[], tamanho = LOTE_CANCELAMENTO): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += tamanho) out.push(ids.slice(i, i + tamanho));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtros APLICADOS da lista
//
// Os seis filtros da lista moram no estado da tela e hoje são aplicados em
// memória. Exportação e cancelamento precisam deles no servidor, senão operam
// sobre um conjunto MAIOR do que o operador está vendo — no cancelamento, isso
// significa cancelar o que ele não pediu.
//
// Esta função é a tradução única desse estado, e recebe um instantâneo: quem
// chama passa o que está APLICADO, nunca um rascunho ainda em digitação.
// ─────────────────────────────────────────────────────────────────────────────

/** Sentinela de "sem filtro" usada pelos selects da tela. */
export const TODOS = '__all__';

/** Instantâneo do estado dos seis filtros, como a tela o mantém. */
export interface EstadoFiltrosLista {
  contaOrigem?: string;
  contaDestino?: string;
  produto?: string;
  documento?: string;
  fornecedor?: string;
  atividade?: string;
  grupo?: string;
}

const ativo = (v?: string): string | undefined =>
  v && v !== TODOS && v.trim() !== '' ? v : undefined;

/**
 * Funde o instantâneo dos seis filtros na base `FiltrosV2`.
 *
 * A direção de conta espelha a regra da tela: só há recorte direcional quando
 * UMA das duas contas está ativa. Com as duas, o recorte vira transferência
 * entre contas e é a base que resolve — aplicar direção junto estreitaria a mais.
 */
export function filtrosAplicadosDaLista(base: FiltrosV2, estado: EstadoFiltrosLista): FiltrosV2 {
  const origem = ativo(estado.contaOrigem);
  const destino = ativo(estado.contaDestino);
  let direcao: 'origem' | 'destino' | undefined;
  if (origem && !destino) direcao = 'origem';
  else if (destino && !origem) direcao = 'destino';

  return {
    ...base,
    lista_conta_direcao: direcao,
    lista_produto: ativo(estado.produto),
    lista_documento: ativo(estado.documento),
    lista_fornecedor_id: ativo(estado.fornecedor),
    lista_atividade: ativo(estado.atividade),
    lista_grupo_custo: ativo(estado.grupo),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Totais e contagem — uma RPC, uma passagem, zero linhas trafegadas
// ─────────────────────────────────────────────────────────────────────────────

export interface LinhaTotais {
  total: number;
  entradas: number;
  saidas: number;
  excluidos_sem_vencimento: number;
}

export interface TotaisLista {
  total: number;
  entradas: number;
  saidas: number;
  excluidosSemVencimento: number;
}

/** Argumentos da RPC. Nomeados como no SQL — o compilador confere cada um. */
export interface ParamsTotais {
  p_cliente_id: string;
  p_fazenda_id: string | null;
  p_dimensao: DimensaoDataFinanceiro;
  p_faixas: string[] | null;
  p_meses: number[] | null;
  p_exigir_data_dimensao: boolean;
  p_incluir_sem_vencimento: boolean;
  p_conta_bancaria_id: string | null;
  p_conta_destino_id: string | null;
  p_tipo_operacao: string | null;
  p_status_transacoes: string[] | null;
  p_incluir_conciliado: boolean;
  p_macro_custo: string | null;
  p_grupo_custo: string | null;
  p_centro_custo: string | null;
  p_subcentro: string | null;
  p_lista_conta_direcao: string | null;
  p_lista_produto: string | null;
  p_lista_fornecedor_id: string | null;
  p_lista_grupo_custo: string | null;
  p_lista_atividade: string | null;
  p_lista_documento: string | null;
}

/** Faixas `[ini,fim)` do recorte, no formato `daterange` do Postgres. */
export function faixasDoRecorte(filtros: FiltrosV2): string[] | null {
  const isTodosAnos = !filtros.ano || filtros.ano === '__todos__';
  const meses = mesesDoRecorte(filtros);
  if (isTodosAnos) return null;
  const ano = Number(filtros.ano);
  if (meses.length > 0) {
    return meses.map((m) => {
      const [ini, fim] = faixaMes(ano, Number(m));
      return `[${ini},${fim})`;
    });
  }
  return [`[${ano}-01-01,${ano + 1}-01-01)`];
}

/**
 * Monta os argumentos da RPC a partir dos MESMOS `FiltrosV2` da lista.
 * Função pura e exaustiva: existe teste que confere que todo campo de
 * `FiltrosV2` chega aqui, para que um filtro novo não fique fora dos totais.
 */
export function paramsDosTotais(
  clienteId: string,
  filtros: FiltrosV2,
  opcoes: OpcoesPagina = {},
): ParamsTotais {
  const dimensao: DimensaoDataFinanceiro = filtros.dimensao ?? 'financeira';
  const isTodosAnos = !filtros.ano || filtros.ano === '__todos__';
  const meses = mesesDoRecorte(filtros);
  const contaOrigem = filtros.conta_bancaria_id?.trim() || null;
  const contaDestino = filtros.conta_destino_id?.trim() || null;
  const status = filtros.status_transacoes ?? [];
  const temConciliado = status.includes('conciliado');
  const statusReais = status.filter((s) => s !== 'conciliado');

  return {
    p_cliente_id: clienteId,
    p_fazenda_id: filtros.fazenda_id || null,
    p_dimensao: dimensao,
    p_faixas: faixasDoRecorte(filtros),
    // "Mês em qualquer ano" só existe quando o ano é "todos".
    p_meses: isTodosAnos && meses.length > 0 ? meses.map((m) => Number(m)) : null,
    // Sem faixa e sem meses, a dimensão continua soberana: exige data não-nula.
    p_exigir_data_dimensao: isTodosAnos && meses.length === 0,
    p_incluir_sem_vencimento: opcoes.incluirSemVencimento === true,
    p_conta_bancaria_id: contaOrigem,
    p_conta_destino_id: contaDestino,
    // Com origem E destino o recorte vira transferência, e tipo_operacao é imposto
    // pela própria RPC — mandar o do filtro aqui seria conflitar com ele.
    p_tipo_operacao: contaOrigem && contaDestino ? null : (filtros.tipo_operacao || null),
    p_status_transacoes: statusReais.length > 0 ? statusReais : null,
    p_incluir_conciliado: temConciliado,
    p_macro_custo: filtros.macro_custo || null,
    p_grupo_custo: filtros.grupo_custo || null,
    p_centro_custo: filtros.centro_custo || null,
    p_subcentro: filtros.subcentro || null,
    p_lista_conta_direcao: filtros.lista_conta_direcao || null,
    p_lista_produto: filtros.lista_produto?.trim() || null,
    p_lista_fornecedor_id: filtros.lista_fornecedor_id || null,
    p_lista_grupo_custo: filtros.lista_grupo_custo || null,
    p_lista_atividade: filtros.lista_atividade || null,
    p_lista_documento: filtros.lista_documento?.trim() || null,
  };
}

/** Totais e contagem do conjunto filtrado inteiro. Uma chamada, nenhuma linha. */
export async function consultarTotais(
  chamar: ChamarRpcTotais,
  clienteId: string,
  filtros: FiltrosV2,
  opcoes: OpcoesPagina = {},
): Promise<TotaisLista> {
  const { data, error } = await chamar(paramsDosTotais(clienteId, filtros, opcoes));
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  return {
    total: Number(linha?.total ?? 0),
    entradas: Number(linha?.entradas ?? 0),
    saidas: Number(linha?.saidas ?? 0),
    excluidosSemVencimento: Number(linha?.excluidos_sem_vencimento ?? 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Referência em memória — o outro lado dos gates A/B
// ─────────────────────────────────────────────────────────────────────────────

export interface RegistroListaV2 extends LinhaFiltravel {
  id: string;
  valor?: number | null;
  sinal?: string | number | null;
  data_vencimento?: string | null;
  numero_documento?: string | null;
  tipo_documento?: string | null;
}

/** Filtro de Documento em memória — a cadeia exata da tela. */
export function casaDocumentoNoCliente(l: RegistroListaV2, termo?: string): boolean {
  const q = termo?.trim().toLowerCase();
  if (!q) return true;
  const cru = (l.numero_documento || '').toLowerCase();
  const formatado = formatDocumento(l.tipo_documento ?? null, l.numero_documento ?? null).toLowerCase();
  return cru.includes(q) || formatado.includes(q);
}

/** Ordenação do contrato, em memória: vencimento ASC, nulos ao fim, id ASC. */
export function ordenarPorVencimentoNoCliente<L extends RegistroListaV2>(linhas: readonly L[]): L[] {
  return [...linhas].sort((a, b) => {
    const va = a.data_vencimento ?? null;
    const vb = b.data_vencimento ?? null;
    if (va !== vb) {
      if (va === null) return 1;    // NULLS LAST
      if (vb === null) return -1;
      return va < vb ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Os seis filtros da lista, em memória. */
export function filtrarSeisNoCliente<L extends RegistroListaV2>(
  linhas: readonly L[],
  filtros: FiltrosV2,
): L[] {
  const cinco = filtrarListaV2NoCliente<L>([...linhas], filtros);
  return cinco.filter((l) => casaDocumentoNoCliente(l, filtros.lista_documento));
}

/** `sinal` é TEXT no schema. Esta é a coerção que o JS faz por acidente, explícita. */
export function sinalNumerico(sinal?: string | number | null): number {
  return Number(sinal) || 0;
}

/** Totais em memória, para o caminho com a flag desligada e para os gates A/B. */
export function totaisNoCliente(linhas: readonly RegistroListaV2[]): { entradas: number; saidas: number } {
  let entradas = 0;
  let saidas = 0;
  for (const l of linhas) {
    const v = Number(l.valor) || 0;
    const s = sinalNumerico(l.sinal);
    if (s > 0) entradas += v;
    else if (s < 0) saidas += v;
  }
  return { entradas, saidas };
}

/** Reexportado para quem monta o ramo de busca fora daqui. */
export { ramoImatch };
