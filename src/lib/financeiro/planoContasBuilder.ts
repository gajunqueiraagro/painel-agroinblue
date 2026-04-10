/**
 * Dynamic Plano de Contas Builder
 * 
 * Merges the global plano de contas with client-specific dividendos
 * at runtime. Dividendos are injected under:
 *   Tipo: 2-Saídas > Macro: Distribuição > Grupo: Dividendos > Centro: Pessoas
 *   Subcentro: "Distribuição de Dividendos {nome}"
 */

import { supabase } from '@/integrations/supabase/client';

export interface PlanoContasItem {
  id: string;
  tipo_operacao: string;
  macro_custo: string;
  grupo_custo: string | null;
  centro_custo: string;
  subcentro: string | null;
  escopo_negocio?: string | null;
  ativo: boolean;
  ordem_exibicao: number;
  is_dividendo?: boolean;
}

export interface Dividendo {
  id: string;
  cliente_id: string;
  nome: string;
  ativo: boolean;
  ordem_exibicao: number;
}

/**
 * Load dividendos for a specific client
 */
export async function loadDividendos(clienteId: string): Promise<Dividendo[]> {
  const { data } = await supabase
    .from('financeiro_dividendos')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('ativo', true)
    .order('ordem_exibicao');
  return (data as Dividendo[]) || [];
}

/**
 * Generate dynamic subcentro entries for dividendos
 */
export function buildDividendoEntries(dividendos: Dividendo[], baseOrdem: number = 9000): PlanoContasItem[] {
  return dividendos.map((d, i) => ({
    id: `dividendo-${d.id}`,
    tipo_operacao: '2-Saídas',
    macro_custo: 'Distribuição',
    grupo_custo: 'Dividendos',
    centro_custo: 'Pessoas',
    subcentro: `Distribuição de Dividendos ${d.nome}`,
    escopo_negocio: 'Administrativo',
    ativo: true,
    ordem_exibicao: baseOrdem + i,
    is_dividendo: true,
  }));
}

/**
 * Load the full plano de contas (global) merged with client dividendos
 */
export async function loadPlanoContasCompleto(clienteId: string): Promise<PlanoContasItem[]> {
  const [planoRes, dividendos] = await Promise.all([
    supabase
      .from('financeiro_plano_contas')
      .select('id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao')
      .eq('ativo', true)
      .order('ordem_exibicao'),
    loadDividendos(clienteId),
  ]);

  const items: PlanoContasItem[] = (planoRes.data as PlanoContasItem[]) || [];

  if (dividendos.length > 0) {
    const maxOrdem = items.reduce((max, i) => Math.max(max, i.ordem_exibicao), 0);
    const divEntries = buildDividendoEntries(dividendos, maxOrdem + 100);
    items.push(...divEntries);
  }

  return items;
}

/**
 * Build ClassificacaoItem[] compatible with useFinanceiroV2 from the merged plano
 */
export function planoToClassificacoes(items: PlanoContasItem[]) {
  return items
    .filter(i => i.subcentro)
    .map(i => ({
      subcentro: i.subcentro!,
      centro_custo: i.centro_custo,
      grupo_custo: i.grupo_custo || '',
      macro_custo: i.macro_custo,
      tipo_operacao: i.tipo_operacao,
      escopo_negocio: i.escopo_negocio || '',
    }));
}
