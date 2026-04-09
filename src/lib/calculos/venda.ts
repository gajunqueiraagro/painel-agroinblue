/**
 * Motor de cálculo unificado — Venda em Pé
 *
 * Padrão arquitetural idêntico ao Abate:
 * - Fonte única de verdade para todas as telas
 * - Sem arredondamento intermediário
 * - Arredondamento apenas no output final
 * - Snapshot persistido no lançamento (detalhes_snapshot)
 *
 * Escopo: operacional + financeiro (gera lançamento financeiro).
 */

import { parseNumericValue } from './abate';

function roundValue(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(decimals));
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type TipoPrecoVenda = 'por_arroba' | 'por_kg' | 'por_cab';

export interface VendaParcela {
  data: string;
  valor: number;
}

export interface VendaCalculationInput {
  quantidade: number | string;
  pesoKg: number | string;
  categoria: string;
  fazendaOrigem: string;
  compradorNome: string;
  data: string;
  statusOperacional: 'programado' | 'agendado' | 'realizado';
  observacao?: string;

  // Preço — prioridade: por_arroba > por_kg > por_cab
  tipoPreco: TipoPrecoVenda;
  precoInput: number | string;

  // Tipo de venda
  tipoVenda?: 'desmama' | 'gado_adulto';

  // Despesas comerciais
  frete?: number | string | null;
  comissaoPct?: number | string | null;
  outrosCustos?: number | string | null;

  // Deduções / encargos
  funruralPct?: number | string | null;
  funruralReais?: number | string | null;

  // Pagamento
  notaFiscal?: string;
  formaReceb?: 'avista' | 'prazo';
  qtdParcelas?: number | string | null;
  parcelas?: VendaParcela[];
}

export interface VendaCalculation {
  // Operacional
  quantidade: number;
  pesoKg: number;
  pesoTotalKg: number;
  arrobasCab: number;       // pesoKg / 30
  totalArrobas: number;     // arrobasCab × quantidade
  categoria: string;
  fazendaOrigem: string;
  compradorNome: string;
  data: string;
  statusOperacional: 'programado' | 'agendado' | 'realizado';
  observacao: string;
  tipoVenda: string;
  tipoPreco: TipoPrecoVenda;

  // Preço base
  precoInput: number;
  valorBase: number;        // depende do tipoPreco
  rKg: number;              // R$/kg derivado
  rCab: number;             // R$/cab derivado
  rArroba: number;          // R$/@ derivado

  // Despesas comerciais
  freteVal: number;
  comissaoPct: number;
  comissaoVal: number;
  outrosCustosVal: number;
  totalDespesas: number;

  // Deduções
  funruralPct: number;
  funruralTotal: number;
  totalDeducoes: number;

  // Resultado
  valorBruto: number;       // = valorBase (antes de despesas e deduções)
  valorLiquido: number;     // valorBruto - despesas - deduções

  // Indicadores líquidos
  liqArroba: number;
  liqCabeca: number;
  liqKg: number;

  // Pagamento
  notaFiscal: string;
  formaReceb: 'avista' | 'prazo';
  qtdParcelas: string;
  parcelas: VendaParcela[];
  somaParcelas: number;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export function buildVendaCalculation(
  input: VendaCalculationInput,
): VendaCalculation {
  const quantidade = Math.max(0, Math.round(parseNumericValue(input.quantidade)));
  const pesoKg = Math.max(0, parseNumericValue(input.pesoKg));
  const precoInputRaw = parseNumericValue(input.precoInput);

  // Intermediários SEM arredondamento
  const pesoTotalKgRaw = pesoKg * quantidade;
  const arrobasCabRaw = pesoKg / 30;
  const totalArrobasRaw = arrobasCabRaw * quantidade;

  // Valor Base — depende do tipo de preço
  let valorBaseRaw = 0;
  if (input.tipoPreco === 'por_arroba') {
    valorBaseRaw = totalArrobasRaw * precoInputRaw;
  } else if (input.tipoPreco === 'por_kg') {
    valorBaseRaw = pesoTotalKgRaw * precoInputRaw;
  } else if (input.tipoPreco === 'por_cab') {
    valorBaseRaw = quantidade * precoInputRaw;
  }

  // R$/kg, R$/cab, R$/@ derivados
  const rKgRaw = pesoTotalKgRaw > 0 ? valorBaseRaw / pesoTotalKgRaw : 0;
  const rCabRaw = quantidade > 0 ? valorBaseRaw / quantidade : 0;
  const rArrobaRaw = totalArrobasRaw > 0 ? valorBaseRaw / totalArrobasRaw : 0;

  // Despesas comerciais
  const freteRaw = parseNumericValue(input.frete);
  const comissaoPctRaw = parseNumericValue(input.comissaoPct);
  const comissaoValRaw = valorBaseRaw * (comissaoPctRaw / 100);
  const outrosCustosRaw = parseNumericValue(input.outrosCustos);
  const totalDespesasRaw = freteRaw + comissaoValRaw + outrosCustosRaw;

  // Deduções — Funrural: R$ tem prioridade sobre %
  const funruralReaisInput = parseNumericValue(input.funruralReais);
  const funruralPctInput = parseNumericValue(input.funruralPct);
  const funruralTotalRaw = funruralReaisInput > 0
    ? funruralReaisInput
    : (valorBaseRaw * funruralPctInput / 100);
  const funruralPctCalc = funruralReaisInput > 0 && valorBaseRaw > 0
    ? (funruralReaisInput / valorBaseRaw) * 100
    : funruralPctInput;

  const totalDeducoesRaw = funruralTotalRaw;

  // Resultado
  const valorBrutoRaw = valorBaseRaw;
  const valorLiquidoRaw = valorBrutoRaw - totalDespesasRaw - totalDeducoesRaw;

  // Indicadores líquidos
  const liqArrobaRaw = totalArrobasRaw > 0 ? valorLiquidoRaw / totalArrobasRaw : 0;
  const liqCabecaRaw = quantidade > 0 ? valorLiquidoRaw / quantidade : 0;
  const liqKgRaw = pesoTotalKgRaw > 0 ? valorLiquidoRaw / pesoTotalKgRaw : 0;

  // Parcelas
  const parcelas = (input.parcelas || []).map(p => ({
    data: p.data,
    valor: roundValue(parseNumericValue(p.valor)),
  }));
  const somaParcelasRaw = parcelas.reduce((s, p) => s + p.valor, 0);

  // ── Output final — arredondamento apenas aqui ──────────────────────────────
  return {
    quantidade,
    pesoKg: roundValue(pesoKg, 2),
    pesoTotalKg: roundValue(pesoTotalKgRaw, 2),
    arrobasCab: roundValue(arrobasCabRaw, 4),
    totalArrobas: roundValue(totalArrobasRaw, 4),
    categoria: input.categoria || '',
    fazendaOrigem: input.fazendaOrigem || '',
    compradorNome: input.compradorNome || '',
    data: input.data || '',
    statusOperacional: input.statusOperacional,
    observacao: input.observacao || '',
    tipoVenda: input.tipoVenda || 'gado_adulto',
    tipoPreco: input.tipoPreco,

    precoInput: roundValue(precoInputRaw, 4),
    valorBase: roundValue(valorBaseRaw),
    rKg: roundValue(rKgRaw),
    rCab: roundValue(rCabRaw),
    rArroba: roundValue(rArrobaRaw),

    freteVal: roundValue(freteRaw),
    comissaoPct: roundValue(comissaoPctRaw, 4),
    comissaoVal: roundValue(comissaoValRaw),
    outrosCustosVal: roundValue(outrosCustosRaw),
    totalDespesas: roundValue(totalDespesasRaw),

    funruralPct: roundValue(funruralPctCalc, 4),
    funruralTotal: roundValue(funruralTotalRaw),
    totalDeducoes: roundValue(totalDeducoesRaw),

    valorBruto: roundValue(valorBrutoRaw),
    valorLiquido: roundValue(valorLiquidoRaw),

    liqArroba: roundValue(liqArrobaRaw),
    liqCabeca: roundValue(liqCabecaRaw),
    liqKg: roundValue(liqKgRaw),

    notaFiscal: input.notaFiscal || '',
    formaReceb: input.formaReceb === 'prazo' ? 'prazo' : 'avista',
    qtdParcelas: String(input.qtdParcelas || (parcelas.length > 0 ? parcelas.length : 1)),
    parcelas,
    somaParcelas: roundValue(somaParcelasRaw),
  };
}

// ─── Snapshot helpers ────────────────────────────────────────────────────────

export function buildVendaSnapshot(
  calc: VendaCalculation,
): Record<string, any> {
  return {
    _tipo: 'venda',
    _versao: 1,
    ...calc,
  };
}

export function restoreVendaFromSnapshot(
  snapshot: Record<string, any>,
): VendaCalculation | null {
  if (!snapshot || snapshot._tipo !== 'venda') return null;
  return snapshot as unknown as VendaCalculation;
}
