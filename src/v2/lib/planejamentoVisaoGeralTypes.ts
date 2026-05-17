/**
 * planejamentoVisaoGeralTypes.ts
 *
 * Contrato arquitetural do cockpit anual da Visão Geral Planejamento.
 *
 * Este DTO é fonte única para:
 *   - Tela V2PlanejamentoVisaoGeral (renderização)
 *   - Futura DRE Pecuária
 *   - Futuras exportações PDF executivo
 *   - Futuro benchmark / IA copiloto
 *   - Futuro app mobile executivo
 *
 * REGRA SOBERANA: nada de cálculo no JSX. A tela apenas renderiza o DTO.
 * Toda agregação/derivação/comparação vive em buildPlanejamentoVisaoGeralData.ts.
 */

// ─── Constantes oficiais do plano de contas (validadas no banco proto) ────────

export const MACRO_RECEITAS = 'Receita Operacional';
export const MACRO_ENTRADA_FINANCEIRA = 'Entrada Financeira';
export const MACRO_CUSTEIO_PRODUCAO = 'Custeio Produção';
export const MACRO_INVESTIMENTO_FAZENDA = 'Investimento na Fazenda';
export const MACRO_INVESTIMENTO_BOVINOS = 'Investimento em Bovinos';
export const MACRO_SAIDA_FINANCEIRA = 'Saída Financeira';
export const MACRO_DIVIDENDOS = 'Dividendos';
export const MACRO_DEDUCOES_RECEITAS = 'Deduções de Receitas';
export const MACRO_TRANSFERENCIAS = 'Transferências';

export const GRUPO_RECEITA_PECUARIA = 'Receita Pecuária';

export const GRUPOS_CUSTO_PEC = ['Custo Variável Pecuária', 'Custo Fixo Pecuária'] as const;
export const GRUPO_CUSTO_VARIAVEL_PEC = 'Custo Variável Pecuária';
export const GRUPO_CUSTO_FIXO_PEC = 'Custo Fixo Pecuária';
export const GRUPO_JUROS_PEC = 'Juros de Financiamento Pecuária';
export const GRUPO_INVESTIMENTO_PEC = 'Investimento Pecuária';

// Ordem oficial dos centros pecuária (validada no banco após renumeração)
export const ORDEM_CENTROS_CUSTO_VAR_PEC = [
  'Nutrição',           // 8010-8030
  'Sanidade',           // 8040-8050
  'Reprodução',         // 8060-8080
  'Pastagem',           // 8090-8100
  'Identificação',      // 8110-8120
  'Comercial',          // 8130
  'Transferências',     // 8140
] as const;

export const ORDEM_CENTROS_CUSTO_FIXO_PEC = [
  'Administração',      // 6010
  'Mão de Obra',        // 6020
  'Máquinas',           // 6030
  'Outros',             // 6060
  'Manutenção Fazenda', // 6080
  'Impostos',           // 6250
] as const;

// ─── Tipos primitivos do DTO ──────────────────────────────────────────────────

/**
 * Origem do valor — metadado para auditoria, IA, tooltips, debug.
 */
export type OrigemMetric =
  | 'pc100'                    // valor vem direto de PainelConsultorDataResult
  | 'planejamento_financeiro'  // valor vem do buildGrid() de usePlanejamentoFinanceiro
  | 'derivado'                 // valor é computado a partir de outros (ex: receitaPec/precoArr)
  | 'misto';                   // combinação de fontes (ex: caixa = saldoInicial + entradas − saídas)

/**
 * Semântica do indicador — fundamental para visualização correta
 * (labels, tooltips, comparações, agregações futuras).
 *
 * - estoque:    posição em um momento (ex: cabeças final, peso médio final, saldo bancário)
 * - acumulado:  soma no período (ex: arrobas produzidas no ano, custeio total)
 * - media:      média ponderada ou simples no período (ex: desfrute %, lotação média, peso médio)
 * - taxa:       razão derivada (ex: margem/@, custo/cab, receita/@)
 */
export type TipoSemantica = 'estoque' | 'acumulado' | 'media' | 'taxa';

/**
 * Formato de exibição.
 */
export type FormatoExibicao = 'moeda' | 'numero' | 'percentual' | 'arrobas' | 'kg' | 'cabecas' | 'hectares' | 'ua_ha';

/**
 * Comparativo duplo: META vs ano-1 anual + META acum Jan→mêsAtual vs ano-1 mesmo período.
 *
 * Estrutura única para todo indicador do cockpit. Permite renderização padronizada
 * via CardComparativo.
 */
export interface ComparativoDuplo {
  /** Valor META anual (acumulado/média/posição conforme tipoSemantica). */
  valor: number | null;

  /** Metadados de domínio. */
  origem: OrigemMetric;
  tipoSemantica: TipoSemantica;
  formato: FormatoExibicao;

  /**
   * Comparativo 1: META anual completa vs Realizado ano fechado (ano-1) anual completo.
   * Responde: "O planejamento está mais agressivo ou conservador que o ano passado?"
   */
  vsAnoFechado: {
    valor: number | null;        // realizado ano-1 anual completo
    delta: number | null;        // (META - ano-1) / ano-1 × 100, em pontos percentuais
  };

  /**
   * Comparativo 2: META acumulada Jan→mêsAtual vs Realizado ano-1 mesmo período Jan→mêsAtual.
   * Responde: "Estamos performando melhor que no mesmo momento do ano passado?"
   */
  vsMesmoPeriodo: {
    valor: number | null;        // realizado ano-1 acumulado Jan→mêsAtual
    delta: number | null;
  };
}

/**
 * Subcentro do BLOCO 3 — estrutura detalhada de custos.
 * valorAnoAnt deixado opcional para Marco 1.2 (sem comparativo agora; arquitetura preparada).
 */
export interface SubcentroLinha {
  subcentro: string;
  valorMeta: number;              // anual META
  valorAnoAnt: number | null;     // anual ano-1 realizado (null no Marco 1.1; preenchido no 1.2)
}

/**
 * Centro de custo do BLOCO 3 — agrupa subcentros, oferece total comparativo.
 */
export interface CentroCustoBloco {
  centro: string;                 // ex: 'Nutrição', 'Sanidade'
  ordemOficial: number;           // do ordem_exibicao mínimo do centro no plano global
  total: ComparativoDuplo;        // total do centro (META + comparativos)
  subcentros: SubcentroLinha[];   // detalhes (ordenados por subcentro.ordem_exibicao)
}

/**
 * Grupo de custo do BLOCO 3 — Custo Variável Pec, Custo Fixo Pec.
 */
export interface GrupoCustoBloco {
  grupo: typeof GRUPO_CUSTO_VARIAVEL_PEC | typeof GRUPO_CUSTO_FIXO_PEC;
  total: ComparativoDuplo;
  centros: CentroCustoBloco[];
}

/**
 * Cards executivos da movimentação rebanho (BLOCO 5).
 */
export interface MovRebanhoCards {
  entradasAnimais: ComparativoDuplo;    // total qtd (compras + transferências entrada + nascimentos)
  saidasAnimais: ComparativoDuplo;      // total qtd (vendas + abates + mortes + transferências saída + consumo)
  compras: ComparativoDuplo;
  vendas: ComparativoDuplo;
  mortes: ComparativoDuplo;
  transferencias: ComparativoDuplo;     // saída + entrada combinadas para visão global
}

/**
 * Séries mensais para mini-gráfico do BLOCO 5 (Jan-Dez).
 */
export interface MovRebanhoSeries {
  cabecas: { meta: number[]; anoAnt: number[] };      // estoque final por mês
  pesoMedio: { meta: number[]; anoAnt: number[] };
  pesoTotalKg: { meta: number[]; anoAnt: number[] };
  pesoTotalArr: { meta: number[]; anoAnt: number[] };
}

// ─── BLOCO 1 — Resumo Macro Executivo ─────────────────────────────────────────

export interface Bloco1Macro {
  // Entradas
  receitasPecuaria: ComparativoDuplo;       // macro='Receita Operacional' grupo='Receita Pecuária'
  outrasReceitas: ComparativoDuplo;         // macro='Receita Operacional' grupo != 'Receita Pecuária'
  entradasFinanceiras: ComparativoDuplo;    // macro='Entrada Financeira'
  totalEntradas: ComparativoDuplo;          // receita_operacional + entrada_financeira (SEM dividendos)

  // Saídas
  custeioPecuaria: ComparativoDuplo;        // grupos: Custo Var Pec + Custo Fixo Pec (SEM juros pec)
  custeioAgricultura: ComparativoDuplo;     // análogo agri
  investimentosPecuaria: ComparativoDuplo;  // Investimento na Fazenda → Investimento Pecuária
  investimentosAgricultura: ComparativoDuplo;
  reposicaoBovinos: ComparativoDuplo;       // macro='Investimento em Bovinos'
  amortizacoes: ComparativoDuplo;           // macro='Saída Financeira'
  dividendos: ComparativoDuplo;             // macro='Dividendos'
  totalSaidas: ComparativoDuplo;

  // Resultados executivos (3 semânticas distintas — preservar para DRE futura)
  geracaoOperacional: ComparativoDuplo;     // Receita Operacional − Custeio Produção (puro, sem juros)
  geracaoCaixa: ComparativoDuplo;           // totalEntradas − totalSaidas
  saldoInicial: number;                      // só META, sem comparativo (snapshot de fechamento Dez ano-1)
  caixaFinal: ComparativoDuplo;             // saldoInicial + geracaoCaixa META vs ano-1
}

// ─── BLOCO 2 — Produção Pecuária ──────────────────────────────────────────────

export interface Bloco2Producao {
  // Posições (estoque + médias estruturais)
  cabecasFinal: ComparativoDuplo;           // tipoSemantica: 'estoque' — "Rebanho Final META"
  rebanhoMedio: ComparativoDuplo;           // tipoSemantica: 'media'   — média acumulada Jan→mêsAtual (cabMediaAcumMeta)
  pesoMedioFinal: ComparativoDuplo;         // tipoSemantica: 'estoque'
  valorRebanhoFinal: ComparativoDuplo;      // tipoSemantica: 'estoque' — patrimônio Dez META; — em Global (fonte META só Fazenda)

  // Produção (acumulado)
  arrobasProduzidas: ComparativoDuplo;      // tipoSemantica: 'acumulado'
  arrobasDesfrutadas: ComparativoDuplo;     // tipoSemantica: 'acumulado' — derivado: receitaPec / precoArr

  // Taxas/Médias
  desfrutePct: ComparativoDuplo;            // tipoSemantica: 'acumulado' — DESFRUTE (CAB.), espelha PC-100 desfruteIndicador (contagem acumulada de animais)
  lotacaoMedia: ComparativoDuplo;           // tipoSemantica: 'media'
  areaProdutivaMedia: ComparativoDuplo;     // tipoSemantica: 'media'

  // Indicadores econômicos
  custoArr: ComparativoDuplo;               // tipoSemantica: 'taxa'
  precoArr: ComparativoDuplo;               // tipoSemantica: 'taxa'
  margemArr: ComparativoDuplo;              // tipoSemantica: 'taxa'
  gmdMedio: ComparativoDuplo;               // tipoSemantica: 'estoque' — foto Dez META (gmdIndicador.serieMeta[12])
  custoCab: ComparativoDuplo;               // tipoSemantica: 'taxa'
}

// ─── BLOCO 3 — Estrutura Completa de Custos ───────────────────────────────────

export interface Bloco3Custos {
  custoVariavelPecuaria: GrupoCustoBloco;
  custoFixoPecuaria: GrupoCustoBloco;
}

// ─── BLOCO 4 — Financeiro / Capital ───────────────────────────────────────────

export interface Bloco4Financeiro {
  juros: ComparativoDuplo;                  // Juros de Financiamento Pecuária
  amortizacoes: ComparativoDuplo;
  investimentosPecuaria: ComparativoDuplo;
  investimentosAgricultura: ComparativoDuplo;
  reposicaoBovinos: ComparativoDuplo;
  dividendos: ComparativoDuplo;
  desembolsoTotal: ComparativoDuplo;        // soma de tudo do bloco 4 + investBovinos
}

// ─── BLOCO 5 — Movimentação Rebanho ───────────────────────────────────────────

export interface Bloco5Rebanho {
  cards: MovRebanhoCards;
  seriesMensais: MovRebanhoSeries;
}

// ─── DTO oficial do cockpit ────────────────────────────────────────────────────

export interface PlanejamentoVisaoGeralDTO {
  // Contexto
  ano: number;
  mesAtual: number;                          // 1..12 — usado nos comparativos "mesmo período"
  escopo: 'global' | 'fazenda';
  fazendaId?: string;
  fazendaNome?: string;

  // Blocos
  bloco1_macroExecutivo: Bloco1Macro;
  bloco2_producaoPecuaria: Bloco2Producao;
  bloco3_estruturaCustos: Bloco3Custos;
  bloco4_financeiroCapital: Bloco4Financeiro;
  bloco5_movimentacaoRebanho: Bloco5Rebanho;

  // Diagnóstico
  loading: boolean;
  warnings: string[];                        // ex: "caixaFinal derivado (PC-100 não fornece direto)"
}

// ─── Helpers de criação (factory) — para evitar repetição em buildPlanejamentoVisaoGeralData ──

/**
 * ComparativoDuplo zerado (todos os campos null/0) — usado quando dado não está disponível.
 */
export function emptyComparativo(
  origem: OrigemMetric,
  tipoSemantica: TipoSemantica,
  formato: FormatoExibicao,
): ComparativoDuplo {
  return {
    valor: null,
    origem,
    tipoSemantica,
    formato,
    vsAnoFechado: { valor: null, delta: null },
    vsMesmoPeriodo: { valor: null, delta: null },
  };
}
