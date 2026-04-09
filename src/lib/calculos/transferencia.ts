/**
 * Motor de cálculo unificado — Transferência Saída
 *
 * Segue o padrão arquitetural do Abate:
 * - Fonte única de verdade para todas as telas
 * - Sem arredondamento intermediário
 * - Arredondamento apenas no output final
 * - Snapshot persistido no lançamento (detalhes_snapshot)
 *
 * Escopo: operacional + econômico (gerencial).
 * NÃO gera lançamento financeiro.
 */

// ─── helpers (reutiliza parseNumericValue do abate) ──────────────────────────
import { parseNumericValue } from './abate';

function roundValue(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(decimals));
}

// ─── Input ───────────────────────────────────────────────────────────────────
export interface TransferenciaCalculationInput {
  quantidade: number | string;
  pesoKg: number | string;            // peso médio vivo por cabeça (kg)
  categoria: string;
  fazendaOrigem: string;
  fazendaDestino: string;
  data: string;
  statusOperacional: 'programado' | 'agendado' | 'realizado';
  observacao?: string;
  // Econômico / gerencial (opcional)
  precoReferenciaArroba?: number | string | null;   // R$/@
  precoReferenciaCabeca?: number | string | null;    // R$/cab (alternativo)
}

// ─── Output ──────────────────────────────────────────────────────────────────
export interface TransferenciaCalculation {
  // Operacional
  quantidade: number;
  pesoKg: number;                      // peso médio vivo / cab
  pesoTotalKg: number;                 // quantidade × pesoKg
  arrobasCab: number;                  // pesoKg / 30
  totalArrobas: number;                // arrobasCab × quantidade
  categoria: string;
  fazendaOrigem: string;
  fazendaDestino: string;
  data: string;
  statusOperacional: 'programado' | 'agendado' | 'realizado';
  observacao: string;

  // Econômico (gerencial — não gera financeiro)
  precoReferenciaArroba: number;       // R$/@ informado
  precoReferenciaCabeca: number;       // R$/cab (derivado ou informado)
  precoReferenciaKg: number;           // R$/kg (derivado)
  valorEconomicoLote: number;          // valor de referência total do lote
  valorEconomicoCab: number;           // valor por cabeça
  valorEconomicoArroba: number;        // R$/@ final (= precoReferenciaArroba se informado)

  // Meta
  temPrecoReferencia: boolean;
}

// ─── Builder ─────────────────────────────────────────────────────────────────
export function buildTransferenciaCalculation(
  input: TransferenciaCalculationInput,
): TransferenciaCalculation {
  const quantidade = Math.max(0, Math.round(parseNumericValue(input.quantidade)));
  const pesoKg = Math.max(0, parseNumericValue(input.pesoKg));

  // Cálculos intermediários SEM arredondamento
  const pesoTotalKgRaw = pesoKg * quantidade;
  const arrobasCabRaw = pesoKg / 30;
  const totalArrobasRaw = arrobasCabRaw * quantidade;

  // Econômico — aceita R$/@ OU R$/cab (prioridade para @)
  const precoRefArroba = parseNumericValue(input.precoReferenciaArroba);
  const precoRefCabeca = parseNumericValue(input.precoReferenciaCabeca);

  let valorLoteRaw = 0;
  let precoArrobaFinal = 0;
  let precoCabecaFinal = 0;
  let precoKgFinal = 0;
  const temPreco = precoRefArroba > 0 || precoRefCabeca > 0;

  if (precoRefArroba > 0) {
    precoArrobaFinal = precoRefArroba;
    valorLoteRaw = totalArrobasRaw * precoRefArroba;
    precoCabecaFinal = quantidade > 0 ? valorLoteRaw / quantidade : 0;
    precoKgFinal = pesoKg > 0 ? precoCabecaFinal / pesoKg : 0;
  } else if (precoRefCabeca > 0) {
    precoCabecaFinal = precoRefCabeca;
    valorLoteRaw = precoRefCabeca * quantidade;
    precoArrobaFinal = totalArrobasRaw > 0 ? valorLoteRaw / totalArrobasRaw : 0;
    precoKgFinal = pesoKg > 0 ? precoRefCabeca / pesoKg : 0;
  }

  // ── Output final — arredondamento apenas aqui ──────────────────────────────
  return {
    quantidade,
    pesoKg: roundValue(pesoKg, 2),
    pesoTotalKg: roundValue(pesoTotalKgRaw, 2),
    arrobasCab: roundValue(arrobasCabRaw, 4),
    totalArrobas: roundValue(totalArrobasRaw, 4),
    categoria: input.categoria || '',
    fazendaOrigem: input.fazendaOrigem || '',
    fazendaDestino: input.fazendaDestino || '',
    data: input.data || '',
    statusOperacional: input.statusOperacional,
    observacao: input.observacao || '',

    precoReferenciaArroba: roundValue(precoArrobaFinal, 2),
    precoReferenciaCabeca: roundValue(precoCabecaFinal, 2),
    precoReferenciaKg: roundValue(precoKgFinal, 2),
    valorEconomicoLote: roundValue(valorLoteRaw, 2),
    valorEconomicoCab: roundValue(precoCabecaFinal, 2),
    valorEconomicoArroba: roundValue(precoArrobaFinal, 2),

    temPrecoReferencia: temPreco,
  };
}

// ─── Snapshot helpers ────────────────────────────────────────────────────────
/** Gera o objeto snapshot para persistir em detalhes_snapshot */
export function buildTransferenciaSnapshot(
  calc: TransferenciaCalculation,
): Record<string, any> {
  return {
    _tipo: 'transferencia_saida',
    _versao: 1,
    ...calc,
  };
}

/** Reconstrói o cálculo a partir de um snapshot salvo */
export function restoreTransferenciaFromSnapshot(
  snapshot: Record<string, any>,
): TransferenciaCalculation | null {
  if (!snapshot || snapshot._tipo !== 'transferencia_saida') return null;
  return snapshot as unknown as TransferenciaCalculation;
}
