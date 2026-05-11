/**
 * fechamentoPeriodo.ts — DTO oficial da tela Fechamento do Período (Marco 2.2).
 *
 * Tipos puros. Sem queries, sem hooks. Consumidores fetcham os dados
 * brutos com hooks existentes e passam ao builder buildFechamentoPeriodoData,
 * que retorna o DTO único que a tela renderiza.
 */

import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';
import type { Lancamento } from '@/types/cattle';

// ─────────────────────────────────────────────────────────────
// PRIMITIVOS
// ─────────────────────────────────────────────────────────────

/** Valor com comparativo meta e ano anterior */
export type Comparativo = {
  realizado: number | null;
  meta: number | null;
  anoAnterior: number | null;
  /** realizado - meta */
  desvioMeta: number | null;
  /** (realizado - meta) / |meta| * 100 — null se meta for 0 ou null */
  desvioMetaPct: number | null;
  /** realizado - anoAnterior */
  desvioAnoAnt: number | null;
  /** (realizado - anoAnterior) / |anoAnterior| * 100 */
  desvioAnoAntPct: number | null;
};

/** Série mensal para gráficos */
export type SerieMensal = {
  ano_mes: string;
  realizado: number | null;
  meta: number | null;
  anoAnterior: number | null;
};

// ─────────────────────────────────────────────────────────────
// BLOCO 1 — CABEÇALHO EXECUTIVO
// ─────────────────────────────────────────────────────────────

export type CabecalhoExecutivo = {
  /** Receita Operacional - desembolsoPecuaria */
  resultadoPeriodo: Comparativo;
  /** Entradas caixa - Saídas caixa totais (exclui transferências) */
  geracaoCaixa: Comparativo;
  /** financeiro_saldos_bancarios_v2.saldo_final do último mês, soma todas as contas */
  caixaFinal: Comparativo;
  receitaPecuaria: Comparativo;
  /** Custo Fixo Pecuária + Custo Variável Pecuária — sem juros */
  custeioPecuaria: Comparativo;
  jurosFinanciamentoPec: Comparativo;
  /** custeioPecuaria + jurosFinanciamentoPec */
  desembolsoPecuaria: Comparativo;
  /** desembolsoPecuaria / arrobasDesfrutadas — null se denominador 0/null */
  custoRsArroba: Comparativo;
  /** precoMedioArroba - custoRsArroba — null se qualquer um for null */
  margemRsArroba: Comparativo;
  /** soma producaoBiologicaKg do período / 30 */
  arrobasProduzidas: Comparativo;
  /** soma arroba dos lancamentosZoot tipo in ('abate','venda') */
  arrobasDesfrutadas: Comparativo;
  cabecasMedias: Comparativo;
  /** null nesta versão — cálculo complexo fica para marco futuro */
  gmd: Comparativo;
  /** UA total / área produtiva pecuária — null se área indisponível */
  lotacaoUaHa: Comparativo;
};

// ─────────────────────────────────────────────────────────────
// BLOCO 2 — RESUMO MACRO
// Árvore: tipo (entradas/saidas) > macro_custo > grupo_custo
// ─────────────────────────────────────────────────────────────

export type MacroNode = {
  label: string;
  nivel: 'tipo' | 'macro' | 'grupo';
  realizado: number | null;
  meta: number | null;
  anoAnterior: number | null;
  desvioMeta: number | null;
  desvioMetaPct: number | null;
  desvioAnoAnt: number | null;
  desvioAnoAntPct: number | null;
  filhos: MacroNode[];
};

export type ResumoMacro = {
  entradas: MacroNode[];
  saidas: MacroNode[];
  totalEntradas: Comparativo;
  totalSaidas: Comparativo;
  /** totalEntradas - totalSaidas */
  resultadoLiquido: Comparativo;
};

// ─────────────────────────────────────────────────────────────
// BLOCO 3 — ANÁLISE PECUÁRIA
// ─────────────────────────────────────────────────────────────

export type IndicadorPecuaria = {
  label: string;
  unidade: string;
  comparativo: Comparativo;
  serie: SerieMensal[];
};

export type AnalisePecuaria = {
  receitaPecuaria: IndicadorPecuaria;
  custeioPecuaria: IndicadorPecuaria;
  jurosFinanciamentoPec: IndicadorPecuaria;
  desembolsoPecuaria: IndicadorPecuaria;
  custoRsArroba: IndicadorPecuaria;
  precoMedioArroba: IndicadorPecuaria;
  margemRsArroba: IndicadorPecuaria;
  custoCabecaMes: IndicadorPecuaria;
  receitaCabeca: IndicadorPecuaria;
  arrobasProduzidas: IndicadorPecuaria;
  arrobasDesfrutadas: IndicadorPecuaria;
  cabecasMedias: IndicadorPecuaria;
  pesoMedioKg: IndicadorPecuaria;
  /** null nesta versão */
  gmd: IndicadorPecuaria;
  lotacaoUaHa: IndicadorPecuaria;
  areaProdutivaPec: IndicadorPecuaria;
};

// ─────────────────────────────────────────────────────────────
// BLOCO 4 — ESTRUTURA DE CUSTOS
// Árvore: grupo_custo > centro_custo > subcentro (somente saídas)
// Drill-down lazy: lançamentos individuais NÃO entram no DTO
// ─────────────────────────────────────────────────────────────

export type SubcentroNode = {
  subcentro: string;
  realizado: number | null;
  meta: number | null;
  anoAnterior: number | null;
  desvioMeta: number | null;
  desvioMetaPct: number | null;
  desvioAnoAnt: number | null;
  desvioAnoAntPct: number | null;
};

export type CentroNode = {
  centro_custo: string;
  realizado: number | null;
  meta: number | null;
  anoAnterior: number | null;
  desvioMeta: number | null;
  desvioMetaPct: number | null;
  desvioAnoAnt: number | null;
  desvioAnoAntPct: number | null;
  subcentros: SubcentroNode[];
};

export type GrupoNode = {
  grupo_custo: string;
  macro_custo: string;
  realizado: number | null;
  meta: number | null;
  anoAnterior: number | null;
  desvioMeta: number | null;
  desvioMetaPct: number | null;
  desvioAnoAnt: number | null;
  desvioAnoAntPct: number | null;
  centros: CentroNode[];
};

export type EstruturaCustos = {
  grupos: GrupoNode[];
  totalGeral: Comparativo;
};

// ─────────────────────────────────────────────────────────────
// BLOCO 5 — MOVIMENTAÇÃO DE REBANHO
// RebanhoMensal é AGREGADO MENSAL, não por categoria.
// Dados por categoria vêm SOMENTE de lancamentosZoot no Marco 2.2.
// Saldos por categoria, peso por categoria, @ por categoria = null.
// ─────────────────────────────────────────────────────────────

export type MovCategoriaLinha = {
  categoria: string;
  /** null no Marco 2.2 — RebanhoMensal não tem dado por categoria */
  saldoInicial: number | null;
  /** sum(quantidade) lancamentosZoot tipo='compra' por categoria */
  compras: number | null;
  /** sum(quantidade) lancamentosZoot tipo='nascimento' por categoria */
  nascimentos: number | null;
  /** sum(quantidade) lancamentosZoot tipo='transferencia_entrada' por categoria */
  transferenciasEntrada: number | null;
  /** soma de compras + nascimentos + transferenciasEntrada */
  totalEntradas: number | null;
  vendas: number | null;
  abates: number | null;
  mortes: number | null;
  consumos: number | null;
  transferenciasSaida: number | null;
  totalSaidas: number | null;
  /** null no Marco 2.2 */
  saldoFinal: number | null;
  /** null no Marco 2.2 */
  pesoMedioFinalKg: number | null;
  /** null no Marco 2.2 */
  pesoTotalKg: number | null;
  /** null no Marco 2.2 */
  pesoTotalArroba: number | null;
};

export type MovRebanho = {
  /** Resumo geral — vem do RebanhoMensal agregado, não soma de categorias */
  resumo: {
    cabecasInicial: number | null;
    cabecasFinal: number | null;
    totalEntradas: number | null;
    totalSaidas: number | null;
    pesoTotalFinalKg: number | null;
    pesoTotalFinalArroba: number | null;
    uaMedia: number | null;
  };
  porCategoria: MovCategoriaLinha[];
  serieCabecas: Array<{
    ano_mes: string;
    cabecas: number | null;
    ua: number | null;
    meta: number | null;
  }>;
};

// ─────────────────────────────────────────────────────────────
// DTO RAIZ
// ─────────────────────────────────────────────────────────────

export type FechamentoPeriodoDTO = {
  clienteId: string;
  fazendaId: string | 'global';
  periodoInicio: string;
  periodoFim: string;
  meses: string[];
  geradoEm: string;

  flags: {
    p1Oficial: boolean;
    p2Oficial: boolean;
    metaDisponivel: boolean;
    anoAnteriorDisponivel: boolean;
    caixaDisponivel: boolean;
  };

  cabecalho: CabecalhoExecutivo;
  resumoMacro: ResumoMacro;
  analisePecuaria: AnalisePecuaria;
  estruturaCustos: EstruturaCustos;
  movRebanho: MovRebanho;
};

// ─────────────────────────────────────────────────────────────
// META — shape de SubcentroGrid de usePlanejamentoFinanceiro
// NÃO tem ano, mes, valor_planejado, fazenda_id, tipo_operacao.
// meses[0..11] = valores Jan a Dez.
// ─────────────────────────────────────────────────────────────

export type MetaGridRow = {
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string;
  subcentro: string;
  escopo_negocio: string | null;
  ordem_exibicao: number;
  /** índices 0-11 = Jan-Dez */
  meses: number[];
};

/**
 * Classificação de macro_custo para entradas/saídas — usada porque
 * MetaGridRow NÃO tem tipo_operacao. Constantes exportadas para uso
 * no builder e para futuras extensões.
 */
export const MACROS_ENTRADA = [
  'Receita Operacional',
  'Entrada Financeira',
] as const;

export const MACROS_SAIDA = [
  'Deduções de Receitas',
  'Custeio Produção',
  'Investimento na Fazenda',
  'Investimento em Bovinos',
  'Saída Financeira',
  'Dividendos',
] as const;

// ─────────────────────────────────────────────────────────────
// DEMAIS TIPOS DE INPUT
// ─────────────────────────────────────────────────────────────

export type ValorRebanhoValidado = {
  fazenda_id: string;
  ano_mes: string;
  preco_arroba: number | null;
  valor_total: number | null;
  arrobas_total: number | null;
  cabecas: number | null;
  peso_medio_kg: number | null;
};

export type SaldoBancario = {
  ano_mes: string;
  saldo_final: number | null;
  conta_bancaria_id: string;
};

export type StatusPilar = {
  fazenda_id: string;
  ano_mes: string;
  p1_oficial: boolean;
  p2_oficial: boolean;
};

export type RebanhoMensal = {
  fazenda_id: string;
  ano_mes: string;
  cabecas: number | null;
  ua: number | null;
  pesoMedioKg: number | null;
  gmd: number | null;
  areaProdutivaPec: number | null;
  producaoBiologicaKg: number | null;
};

export type BuildFechamentoPeriodoInput = {
  clienteId: string;
  fazendaId: string | null;

  periodoInicio: string;
  periodoFim: string;

  lancamentosRealizados: FinanceiroLancamento[];
  lancamentosAnoAnterior: FinanceiroLancamento[];
  /** output de usePlanejamentoFinanceiro buildGrid() */
  metaGrid: MetaGridRow[];

  rebanhoMensal: RebanhoMensal[];
  rebanhoMensalAnoAnterior: RebanhoMensal[];
  rebanhoMensalMeta: RebanhoMensal[];

  lancamentosZoot: Lancamento[];
  lancamentosZootAnoAnterior: Lancamento[];

  valorRebanho: ValorRebanhoValidado[];
  valorRebanhoAnoAnterior: ValorRebanhoValidado[];

  saldosBancarios: SaldoBancario[];
  saldosBancariosAnoAnterior: SaldoBancario[];

  statusPilares: StatusPilar[];
};
