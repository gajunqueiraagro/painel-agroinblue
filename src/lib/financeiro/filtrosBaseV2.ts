/**
 * PR-FIN-LISTA-VENCIMENTO-03 — filtros de base da grade financeira.
 *
 * Este módulo NÃO toca no query builder. Ele traduz `FiltrosV2` num PLANO: um
 * registro de campos opcionais nomeados, cada um correspondendo a uma chamada.
 * Quem aplica o plano é o consumidor, sobre o seu próprio builder tipado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE PLANO, E NÃO UMA FUNÇÃO QUE RECEBE O BUILDER
 *
 * Duas razões, e as duas doem quando ignoradas:
 *
 * 1. TIPAGEM. Uma função genérica sobre o builder do PostgREST precisa ou de um
 *    genérico recursivo (estoura a inferência — TS2589) ou de uma interface
 *    própria com `coluna: string` (compila, e cala os nomes de coluna: um
 *    `'cenarrio'` passaria batido). O plano não tem esse dilema — cada lado
 *    aplica no SEU builder, com a SUA tipagem de colunas intacta.
 *
 * 2. DUAS RELAÇÕES. O caminho antigo lê a TABELA; o paginado lê a VIEW, que tem
 *    colunas a mais (`documento_formatado`, `mes_*`). São dois tipos de linha
 *    diferentes. O plano é comum; a aplicação é específica.
 *
 * O plano é um registro de slots NOMEADOS, nunca uma lista. Uma lista obrigaria
 * um laço sobre o builder, e reatribuir o builder dentro de laço é justamente o
 * que estoura o TS2589.
 */
import type { StatusFiltroFinanceiro } from './statusFinanceiro';
import {
  ramoContaDirecao,
  escopoCanonicoAtividade,
  ehTransferencia,
  ramoAtividadeOutros,
  ramoImatch,
  TIPOS_TRANSFERENCIA,
  type FiltrosListaV2,
} from './filtrosListaV2';

// PR-FIN-GRADE-DATAS-03 — dimensão temporal soberana da grade. 'financeira' = COALESCE(data_pagamento,
//   data_vencimento) (contrato de PR-FIN-OC-CONTRATO-01); as demais recortam pela coluna homônima.
//   Ausência do campo em FiltrosV2 é tratada como 'financeira' (default preserva o comportamento atual).
export type DimensaoDataFinanceiro = 'financeira' | 'competencia' | 'vencimento' | 'pagamento';

export interface FiltrosV2 extends FiltrosListaV2 {
  fazenda_id?: string;
  ano?: string;
  /**
   * Multisseleção de anos — FIN-LISTA-MULTIANO-01.
   *
   * ⚠ CONVIVE COM `ano` E TEM PRECEDÊNCIA, em vez de substituí-lo: `ano` é lido por outros
   * chamadores do plano (a exportação, a grade do fluxo), e trocá-lo por um array obrigaria
   * todos a mudar num PR que é de filtro de lista. Quando `anos` vem preenchido, ele manda;
   * quando não vem, nada muda para quem já usava.
   * ⚠ E A CONSULTA NÃO GANHA FORMA NOVA: cada ano vira o MESMO ramo de faixa que um ano só
   * gerava, e os ramos se somam no `or` que já existia. Dois anos com três meses são seis
   * faixas — a mesma expressão, mais termos.
   */
  anos?: string[];
  mes?: string;           // single month or 'todos'
  meses?: string[];       // multi-month select
  conta_bancaria_id?: string;
  conta_destino_id?: string;
  tipo_operacao?: string;
  status_transacoes?: StatusFiltroFinanceiro[];   // PR-FIN-STATUS-UX-03A-1 — multisseleção; vazio/ausente = Todos
  macro_custo?: string;
  grupo_custo?: string;
  centro_custo?: string;
  subcentro?: string;
  /**
   * A safra do lançamento — FIN-LISTA-PERF-01.
   *
   * ⚠ ELA NÃO IA AO SERVIDOR, e essa era a razão de "Safra 23/24 + Ano = Todos" ser tão lenta
   * quanto não filtrar nada: as 30 mil linhas vinham para a memória peneirar ~200. A safra é o
   * recorte principal do produtor e atravessa dois anos civis de propósito — exigir um ano
   * junto seria pedir que ele desfizesse a própria pergunta.
   * ⚠ SÓ O ID. "Sem safra" (`safra_id IS NULL`) continua peneirado em memória: ele é a maioria
   * da base e não limita nada, então mandá-lo ao servidor não pouparia uma linha sequer.
   */
  safra_id?: string;
  /**
   * A CULTURA DO LANÇAMENTO — FIN-AUDITORIA-CULTURA-01.
   *
   * ⚠ VAI AO SERVIDOR PELA MESMA RAZÃO DA SAFRA: a pergunta "quais lançamentos são de
   * mandioca" atravessa o ano inteiro, e peneirar 30 mil linhas em memória para mostrar
   * cinquenta é o que fazia o filtro parecer rápido enquanto o custo estava todo na ida.
   * ⚠ SÓ O VALOR, NUNCA O "SEM CULTURA": `cultura IS NULL` é hoje a base inteira (a coluna
   * nasceu no AGRI-04A e só o modal a preenche), então mandá-lo ao servidor não pouparia uma
   * linha. É a mesma decisão, escrita no mesmo lugar, que a de "Sem safra".
   */
  cultura?: string;
  dimensao?: DimensaoDataFinanceiro;   // PR-FIN-GRADE-DATAS-03 — default 'financeira'
  /** Sexto filtro da lista. Só é expressável sobre a view (documento_formatado). */
  lista_documento?: string;
}

/** Colunas de data por dimensão — usadas para `not is null` e para o mês. */
const COLUNA_DATA: Record<DimensaoDataFinanceiro, 'data_competencia' | 'data_vencimento' | 'data_pagamento' | null> = {
  competencia: 'data_competencia',
  vencimento: 'data_vencimento',
  pagamento: 'data_pagamento',
  financeira: null,   // é COALESCE de duas colunas: vira ramo OR, não `not is null`
};

const COLUNA_MES: Record<DimensaoDataFinanceiro, 'mes_competencia' | 'mes_vencimento' | 'mes_pagamento' | 'mes_financeira'> = {
  competencia: 'mes_competencia',
  vencimento: 'mes_vencimento',
  pagamento: 'mes_pagamento',
  financeira: 'mes_financeira',
};

/**
 * O plano. Cada campo ausente é uma chamada que NÃO acontece.
 * Slots nomeados de propósito — ver o cabeçalho.
 */
export interface PlanoBaseV2 {
  readonly clienteId: string;
  readonly fazendaId?: string;
  /** `.not(coluna,'is',null)` — dimensão soberana sem faixa. */
  readonly naoNuloDimensao?: 'data_competencia' | 'data_vencimento' | 'data_pagamento';
  readonly orTemporal?: string;
  /** Só no plano da VIEW: recorte "mês em qualquer ano". */
  readonly mesesDimensao?: { readonly coluna: string; readonly valores: readonly number[] };
  readonly transferenciaEntreContas?: { readonly origem: string; readonly destino: string };
  readonly contaBancariaId?: string;
  readonly contaDestinoId?: string;
  readonly tipoOperacao?: string;
  /**
   * Transferência: as DUAS grafias — FIN-LISTA-FILTRO-TIPO-01.
   *
   * ⚠ `tipoOperacao` É IGUALDADE, e igualdade não cobre o legado: o banco tem 822 linhas em
   * `'3-Transferências'` e 7 em `'3-Transferência'` (singular, medido no proto). Filtrar por
   * "Transferências" escondia as sete — poucas, e por isso invisíveis: ninguém confere um
   * total contra outro que não sabe que existe.
   * ⚠ E É A MESMA LISTA QUE O RESTO DO SISTEMA JÁ USA (`TIPOS_TRANSFERENCIA`), a mesma de
   * `ramoContaDirecao` e de `isTransferenciaTipo`. Reconhecer o legado não é perpetuá-lo: a
   * escrita continua sendo só o plural.
   */
  readonly orTipoOperacao?: string;
  readonly orStatus?: string;
  readonly statusIn?: readonly string[];
  readonly conciliadoNaoNulo?: boolean;
  readonly macroCusto?: string;
  readonly grupoCusto?: string;
  readonly centroCusto?: string;
  readonly subcentro?: string;
  readonly safraId?: string;
  /**
   * ⚠ RAMO `or`, NÃO `eq`, E ISSO É SOBRE O TIPO GERADO — FIN-AUDITORIA-CULTURA-01. A coluna
   * `cultura` existe no banco desde o AGRI-04A, mas `types.ts` é anterior a ela: o builder
   * tipado de `buildLancamentosQuery` recusa `.eq('cultura', …)` em tempo de compilação.
   * O `.or()` recebe string e é a porta que o repo JÁ usa para predicados que o tipo não
   * expressa (`orDirecao`, `orDescricao`, `orAtividadeOutros` são os vizinhos). Um termo só
   * dentro de um `or` é exatamente um `eq` para o PostgREST.
   * ⚠ ISSO EVITA O CAST. A alternativa seria `(query as any).eq(...)`, que apagaria a
   * conferência de TODAS as outras colunas naquele builder — o comentário dele diz, com
   * razão, que é isso que um cast amplo custa. A correção de raiz é regenerar o `types.ts`,
   * e é frente própria.
   */
  readonly orCultura?: string;
  readonly orDirecao?: string;
  readonly orDescricao?: string;
  readonly favorecidoId?: string;
  readonly listaGrupoCusto?: string;
  readonly escopoNegocio?: string;
  readonly orAtividadeOutros?: string;
  /** Só no plano da VIEW: casa contra `documento_formatado`. */
  readonly orDocumento?: string;
}

export interface OpcoesPlano {
  /**
   * 'tabela' omite os slots que só existem na view (`mesesDimensao`,
   * `orDocumento`). Omitir é deliberado e verificável — melhor do que o
   * consumidor ignorar um campo em silêncio.
   */
  readonly relacao: 'tabela' | 'view';
  /** Ramo OR extra somado ao recorte temporal. ADITIVO: amplia, nunca estreita. */
  readonly ramoTemporalExtra?: string;
  /** Ignora o recorte temporal. Usado para medir o que o período cortou. */
  readonly semRecorteTemporal?: boolean;
}

// PR-FIN-FILTRO-PGTO-01 — faixa [1º dia do mês, 1º dia do mês seguinte) sobre a coluna date:
//   vira o ano corretamente e sem comparação textual de datas.
export function faixaMes(ano: number, mes: number): [string, string] {
  const mm = String(mes).padStart(2, '0');
  const ini = `${ano}-${mm}-01`;
  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const fim = `${proxAno}-${String(proxMes).padStart(2, '0')}-01`;
  return [ini, fim];
}

/** Meses normalizados do recorte (multi ou único); [] quando "Todos os meses". */
export function mesesDoRecorte(filtros: FiltrosV2): string[] {
  if (filtros.meses && filtros.meses.length > 0 && !filtros.meses.includes('todos')) return filtros.meses;
  if (filtros.mes && filtros.mes !== 'todos') return [filtros.mes];
  return [];
}

/**
 * Os anos do recorte, em número. Vazio = "todos os anos".
 *
 * ⚠ UMA DEFINIÇÃO SÓ, e ela existe porque a pergunta "que anos?" passou a ter duas fontes.
 * Três lugares decidiam isso com a mesma expressão copiada (`!filtros.ano || filtros.ano ===
 * '__todos__'`); com `anos` no meio, três cópias seriam três respostas.
 */
export function anosDoRecorte(filtros: FiltrosV2): number[] {
  const lista = (filtros.anos ?? [])
    .map((a) => Number(a))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (lista.length > 0) return lista;
  if (!filtros.ano || filtros.ano === '__todos__') return [];
  const n = Number(filtros.ano);
  return Number.isFinite(n) && n > 0 ? [n] : [];
}

/** Verdadeiro quando NENHUMA faixa temporal é aplicada (todos os anos + todos os meses). */
export function semRecorteDePeriodo(filtros: FiltrosV2): boolean {
  return anosDoRecorte(filtros).length === 0 && mesesDoRecorte(filtros).length === 0;
}

// PR-FIN-OC-CONTRATO-01 — data financeira DERIVADA = COALESCE(data_pagamento, data_vencimento):
//   (pago na faixa) OU (não pago E vencimento na faixa). O pagamento é soberano — se há pagamento
//   fora da faixa, a linha NÃO entra pelo vencimento.
function ramoDerivado(ini: string, fim: string): string {
  return `and(data_pagamento.gte.${ini},data_pagamento.lt.${fim}),`
       + `and(data_pagamento.is.null,data_vencimento.gte.${ini},data_vencimento.lt.${fim})`;
}

/** Segmento OR de UMA faixa [ini,fim) para a dimensão selecionada. */
export function ramoDimensao(dimensao: DimensaoDataFinanceiro, ini: string, fim: string): string {
  const coluna = COLUNA_DATA[dimensao];
  if (!coluna) return ramoDerivado(ini, fim);
  return `and(${coluna}.gte.${ini},${coluna}.lt.${fim})`;
}

/** Forma-string do "a data da dimensão não é nula", para poder compor com OR. */
export function ramoNaoNuloDimensao(dimensao: DimensaoDataFinanceiro): string {
  const coluna = COLUNA_DATA[dimensao];
  if (!coluna) return 'data_pagamento.not.is.null,data_vencimento.not.is.null';
  return `${coluna}.not.is.null`;
}

/**
 * Traduz os filtros num plano. Fonte ÚNICA de decisão: tabela e view chamam
 * esta mesma função e só divergem em `relacao`.
 */
export function montarPlanoBaseV2(
  clienteId: string,
  filtros: FiltrosV2,
  opcoes: OpcoesPlano,
): PlanoBaseV2 {
  const plano: {
    -readonly [K in keyof PlanoBaseV2]: PlanoBaseV2[K]
  } = { clienteId };

  if (filtros.fazenda_id) plano.fazendaId = filtros.fazenda_id;

  // ── recorte temporal ──────────────────────────────────────────────────────
  const dimensao: DimensaoDataFinanceiro = filtros.dimensao ?? 'financeira';
  const anosRecorte = anosDoRecorte(filtros);
  const isTodosAnos = anosRecorte.length === 0;
  const mesesRecorte = mesesDoRecorte(filtros);
  const extra = opcoes.ramoTemporalExtra;

  if (opcoes.semRecorteTemporal) {
    // Universo sem período: usado só para medir quanto o período cortou.
  } else if (isTodosAnos) {
    if (mesesRecorte.length === 0) {
      // Todos os anos + todos os meses: sem faixa, mas a dimensão continua soberana.
      const coluna = COLUNA_DATA[dimensao];
      if (extra || !coluna) plano.orTemporal = extra
        ? `${ramoNaoNuloDimensao(dimensao)},${extra}`
        : ramoNaoNuloDimensao(dimensao);
      else plano.naoNuloDimensao = coluna;
    } else if (opcoes.relacao === 'view') {
      // "Mês em qualquer ano" NÃO é faixa contínua. Na view existe `mes_<dimensão>`
      // e o recorte é exato no servidor. Na tabela essa coluna não existe, e o
      // caminho antigo resolve em memória (residualDimensaoTodosAnos).
      plano.mesesDimensao = {
        coluna: COLUNA_MES[dimensao],
        valores: mesesRecorte.map((m) => Number(m)).filter((n) => Number.isFinite(n)),
      };
      if (extra) plano.orTemporal = extra;
    }
  } else if (mesesRecorte.length > 0) {
    /* ⚠ O PRODUTO CARTESIANO É A REGRA: dois anos com três meses são SEIS faixas, não duas
       nem três. "Agosto e setembro de 2025 e 2026" é literalmente ago/25, set/25, ago/26 e
       set/26 — qualquer atalho aqui devolveria um recorte que o operador não pediu. */
    const ramos = anosRecorte
      .flatMap((anoNum) => mesesRecorte.map((m) => faixaMes(anoNum, Number(m))))
      .map(([ini, fim]) => ramoDimensao(dimensao, ini, fim))
      .join(',');
    plano.orTemporal = extra ? `${ramos},${extra}` : ramos;
  } else {
    /* Anos inteiros: um ramo por ano. Anos não contíguos (2022 e 2026) continuam sendo dois
       ramos — juntá-los numa faixa só arrastaria 2023, 2024 e 2025 de brinde. */
    const ramos = anosRecorte
      .map((anoNum) => ramoDimensao(dimensao, `${anoNum}-01-01`, `${anoNum + 1}-01-01`))
      .join(',');
    plano.orTemporal = extra ? `${ramos},${extra}` : ramos;
  }

  // ── contas ────────────────────────────────────────────────────────────────
  const contaOrigemId = filtros.conta_bancaria_id?.trim();
  const contaDestinoId = filtros.conta_destino_id?.trim();

  if (contaOrigemId && contaDestinoId) {
    plano.transferenciaEntreContas = { origem: contaOrigemId, destino: contaDestinoId };
  } else {
    if (contaOrigemId) plano.contaBancariaId = contaOrigemId;
    if (contaDestinoId) plano.contaDestinoId = contaDestinoId;
    if (filtros.tipo_operacao) {
      if (ehTransferencia(filtros.tipo_operacao)) {
        const tipos = TIPOS_TRANSFERENCIA.map((t) => `"${t}"`).join(',');
        plano.orTipoOperacao = `tipo_operacao.in.(${tipos})`;
      } else {
        plano.tipoOperacao = filtros.tipo_operacao;
      }
    }
  }

  // ── status ────────────────────────────────────────────────────────────────
  // PR-FIN-V2-STATUS-01 — 'conciliado' é DERIVADO (conciliado_em != null), não um status_transacao.
  if (filtros.status_transacoes && filtros.status_transacoes.length > 0) {
    const temConciliado = filtros.status_transacoes.includes('conciliado');
    const statusReais = filtros.status_transacoes.filter((s) => s !== 'conciliado');
    if (temConciliado && statusReais.length > 0) {
      plano.orStatus = `status_transacao.in.(${statusReais.join(',')}),conciliado_em.not.is.null`;
    } else if (temConciliado) {
      plano.conciliadoNaoNulo = true;
    } else {
      plano.statusIn = statusReais;
    }
  }

  if (filtros.macro_custo) plano.macroCusto = filtros.macro_custo;
  if (filtros.grupo_custo) plano.grupoCusto = filtros.grupo_custo;
  if (filtros.centro_custo) plano.centroCusto = filtros.centro_custo;
  if (filtros.subcentro) plano.subcentro = filtros.subcentro;

  // ── os seis filtros da lista ──────────────────────────────────────────────
  const ramoDirecao = ramoContaDirecao(filtros.lista_conta_direcao);
  if (ramoDirecao) plano.orDirecao = ramoDirecao;

  const ramoDescricao = ramoImatch('descricao', filtros.lista_produto);
  if (ramoDescricao) plano.orDescricao = ramoDescricao;

  if (filtros.lista_fornecedor_id) plano.favorecidoId = filtros.lista_fornecedor_id;
  if (filtros.lista_grupo_custo) plano.listaGrupoCusto = filtros.lista_grupo_custo;

  if (filtros.safra_id) plano.safraId = filtros.safra_id;
  /**
   * ⚠ SÓ NO PLANO DA TABELA — FIN-AUDITORIA-CULTURA-01, e a exceção é medida, não preferência:
   * `vw_financeiro_lancamentos_v2_doc` NÃO tem a coluna `cultura` (conferido no
   * `information_schema` em 12/09/2026 — ela tem `safra_id` e não tem `cultura` nem `fase`).
   * Mandar o predicado pelo caminho da view seria pedir uma coluna que não existe.
   * ⚠ E O CAMINHO DA VIEW NÃO FICA MENTINDO: sem o predicado, ele traz a mais e a TELA peneira
   * em memória, que é o que ela já faz com todos os filtros. Lista maior é lentidão; lista
   * filtrada pela metade seria erro.
   * ⚠ QUANDO A VIEW GANHAR A COLUNA (frente do arquiteto), esta condição sai e o `if` volta a
   * ser como o da safra, duas linhas acima.
   */
  if (filtros.cultura && opcoes.relacao !== 'view') plano.orCultura = `cultura.eq.${filtros.cultura}`;

  const escopoAtividade = escopoCanonicoAtividade(filtros.lista_atividade);
  if (escopoAtividade) plano.escopoNegocio = escopoAtividade;
  const ramoOutros = ramoAtividadeOutros(filtros.lista_atividade);
  if (ramoOutros) plano.orAtividadeOutros = ramoOutros;

  if (opcoes.relacao === 'view') {
    const doc = filtros.lista_documento?.trim();
    if (doc) {
      const cru = ramoImatch('numero_documento', doc);
      const fmt = ramoImatch('documento_formatado', doc);
      if (cru && fmt) plano.orDocumento = `${cru},${fmt}`;
    }
  }

  return plano;
}
