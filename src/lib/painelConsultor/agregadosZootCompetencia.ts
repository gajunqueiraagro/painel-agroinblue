/**
 * Camada oficial de competência zootécnica para DRE.
 *
 * Usada agora no Planejamento Visão Geral (Bloco 3 Análise Econômica).
 * Futuramente será usada no Fechamento Realizado.
 *
 * Princípio: cada função puxa por DATA DE COMPETÊNCIA ZOOT (campo `data`
 * da tabela lancamentos), nunca por data_pagamento.
 *
 * Cada função é pura: recebe params (clienteId, ano, cenario) + supabase client,
 * retorna { meses[12], qtdeLancMensal[12], breakdown?: Record<string, number[12]> } | null.
 *
 * Soberania = mensal. Anual = somaAnualMeses(result.meses) — derivado, nunca armazenado.
 *
 * Convenção de retorno:
 *   null                                                  = sem dados na competência (GAP de cadastro)
 *   { meses: [0×12], qtdeLancMensal: [0×12], breakdown }  = competência válida mas zerada (dado real)
 *
 * Fase 1: bônus NÃO tratado. Receita Bruta = valor_total. Deduções = soma dos 4
 * campos de desconto. Bônus fica para Fase 2, após investigar se valor_total
 * já inclui bonus_precoce/bonus_qualidade/bonus_lista_trace.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type CenarioZoot = 'realizado' | 'meta';

export interface AgregadoZootCompResult {
  meses: number[];                              // [12] valores mensais (0=Jan, 11=Dez)
  qtdeLancMensal: number[];                     // [12] contagens mensais
  breakdown?: Record<string, number[]>;         // [12] valores por categoria/tipo
}

/** Helper: anual derivado, NUNCA armazenado na interface. */
export function somaAnualMeses(meses: number[]): number {
  return meses.reduce((s, v) => s + v, 0);
}

interface ParamsAgregadorZootComp {
  clienteId: string;
  ano: number;
  cenario: CenarioZoot;
}

type TipoReceita = 'abate' | 'venda' | 'venda_pe';

interface RowReceita {
  tipo: TipoReceita;
  valor_total: number | null;
  data: string | null;
}

interface RowDeducao {
  tipo: TipoReceita;
  data: string | null;
  deducoes: number | null;
  desconto_funrural: number | null;
  desconto_qualidade: number | null;
  outros_descontos: number | null;
}

interface RowCompra {
  valor_total: number | null;
  data: string | null;
}

function inicioAno(ano: number): string {
  return `${ano}-01-01`;
}

function inicioAnoSeguinte(ano: number): string {
  return `${ano + 1}-01-01`;
}

/**
 * Receita Bruta Pecuária por COMPETÊNCIA ZOOT.
 *
 * Fonte: tabela `lancamentos`. Tipos: 'abate', 'venda', 'venda_pe'.
 * Campo de competência: `data` (data principal da movimentação zootécnica).
 * Campo de valor: `valor_total` (sem ajuste de bônus/dedução nesta camada).
 *
 * Agrupamento: data ∈ [ano-01-01, (ano+1)-01-01).
 * NÃO usar data_pagamento. NÃO usar fluxo de caixa. NÃO usar competência financeira.
 *
 * @returns null quando não há nenhuma linha no ano (GAP de cadastro zootécnico).
 *          { meses: [0×12], qtdeLancMensal: [0×12], breakdown } quando há linhas
 *          mas todas zeradas (dado real).
 */
export async function agregaReceitaPecZootComp(
  params: ParamsAgregadorZootComp,
  supabase: SupabaseClient,
): Promise<AgregadoZootCompResult | null> {
  const { clienteId, ano, cenario } = params;

  const { data, error } = await supabase
    .from('lancamentos')
    .select('tipo, valor_total, data')
    .eq('cliente_id', clienteId)
    .eq('cancelado', false)
    .eq('cenario', cenario)
    .in('tipo', ['abate', 'venda', 'venda_pe'])
    .gte('data', inicioAno(ano))
    .lt('data', inicioAnoSeguinte(ano));

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RowReceita[];

  if (rows.length === 0) return null;

  const meses = new Array(12).fill(0);
  const qtdeLancMensal = new Array(12).fill(0);
  const breakdown: Record<string, number[]> = {
    abate: new Array(12).fill(0),
    venda: new Array(12).fill(0),
    venda_pe: new Array(12).fill(0),
  };

  for (const row of rows) {
    const v = Number(row.valor_total ?? 0);
    const mes = Number((row.data as string).substring(5, 7)) - 1;
    if (mes < 0 || mes > 11) continue;
    meses[mes] += v;
    qtdeLancMensal[mes] += 1;
    breakdown[row.tipo][mes] += v;
  }

  return { meses, qtdeLancMensal, breakdown };
}

/**
 * Deduções sobre Vendas por COMPETÊNCIA ZOOT.
 *
 * Fonte: tabela `lancamentos`, soma dos 4 campos:
 *   deducoes + desconto_funrural + desconto_qualidade + outros_descontos
 *
 * Mesmos tipos e mesmo agrupamento da Receita Bruta (abate/venda/venda_pe,
 * data ∈ [ano, ano+1)).
 *
 * Fase 1: bônus (bonus_precoce, bonus_qualidade, bonus_lista_trace) NÃO é tratado
 * nesta função. Fica para investigação da Fase 2.
 *
 * @returns null se não há venda/abate cadastrado no ano (GAP — não há base de venda).
 *          { meses: [0×12], qtdeLancMensal: [N×12], breakdown } quando há venda/abate
 *          mas sem dedução preenchida (dado real: cliente vende sem registrar Funrural/descontos).
 */
export async function agregaDeducoesZootComp(
  params: ParamsAgregadorZootComp,
  supabase: SupabaseClient,
): Promise<AgregadoZootCompResult | null> {
  const { clienteId, ano, cenario } = params;

  const { data, error } = await supabase
    .from('lancamentos')
    .select('tipo, data, deducoes, desconto_funrural, desconto_qualidade, outros_descontos')
    .eq('cliente_id', clienteId)
    .eq('cancelado', false)
    .eq('cenario', cenario)
    .in('tipo', ['abate', 'venda', 'venda_pe'])
    .gte('data', inicioAno(ano))
    .lt('data', inicioAnoSeguinte(ano));

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RowDeducao[];

  if (rows.length === 0) return null;

  const meses = new Array(12).fill(0);
  const qtdeLancMensal = new Array(12).fill(0);
  const breakdown: Record<string, number[]> = {
    deducoes_gerais: new Array(12).fill(0),
    funrural: new Array(12).fill(0),
    desconto_qualidade: new Array(12).fill(0),
    outros_descontos: new Array(12).fill(0),
  };

  for (const row of rows) {
    const d  = Number(row.deducoes ?? 0);
    const f  = Number(row.desconto_funrural ?? 0);
    const dq = Number(row.desconto_qualidade ?? 0);
    const o  = Number(row.outros_descontos ?? 0);
    const mes = Number((row.data as string).substring(5, 7)) - 1;
    if (mes < 0 || mes > 11) continue;
    breakdown.deducoes_gerais[mes]     += d;
    breakdown.funrural[mes]            += f;
    breakdown.desconto_qualidade[mes]  += dq;
    breakdown.outros_descontos[mes]    += o;
    meses[mes] += d + f + dq + o;
    qtdeLancMensal[mes] += 1;
  }

  return { meses, qtdeLancMensal, breakdown };
}

/**
 * Reposição de Bovinos por COMPETÊNCIA ZOOT.
 *
 * Fonte: tabela `lancamentos`, tipo='compra'.
 * Campo de competência: `data`. Campo de valor: `valor_total`.
 *
 * Diferente das outras: retorna estrutura mensal zerada (arrays de 12 zeros)
 * quando não há compra no ano, porque ausência de reposição planejada é estado
 * válido (cliente pode estar em ciclo de venda sem reposição) — NÃO é GAP de cadastro.
 */
export async function agregaReposicaoBovinosZootComp(
  params: ParamsAgregadorZootComp,
  supabase: SupabaseClient,
): Promise<AgregadoZootCompResult> {
  const { clienteId, ano, cenario } = params;

  const { data, error } = await supabase
    .from('lancamentos')
    .select('valor_total, data')
    .eq('cliente_id', clienteId)
    .eq('cancelado', false)
    .eq('cenario', cenario)
    .eq('tipo', 'compra')
    .gte('data', inicioAno(ano))
    .lt('data', inicioAnoSeguinte(ano));

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RowCompra[];

  const meses = new Array(12).fill(0);
  const qtdeLancMensal = new Array(12).fill(0);
  for (const row of rows) {
    const v = Number(row.valor_total ?? 0);
    const mes = Number((row.data as string).substring(5, 7)) - 1;
    if (mes < 0 || mes > 11) continue;
    meses[mes] += v;
    qtdeLancMensal[mes] += 1;
  }

  return { meses, qtdeLancMensal };
}
