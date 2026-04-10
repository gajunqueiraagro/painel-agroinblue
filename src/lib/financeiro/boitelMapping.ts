/**
 * Mapeamento explícito de subcentros para operações de Boitel.
 * Cada origem_tipo do boitel aponta para subcentros específicos e previsíveis.
 * 
 * REGRA: nunca usar busca genérica por texto (%adiantamento%, %boitel%).
 * Sempre usar esta lista de candidatos em ordem de prioridade.
 */

export interface BoitelClassificacao {
  tipo_operacao: string;
  sinal: number;
  subcentroCandidatos: string[];
}

/**
 * Mapeamento rígido: origem_tipo → classificação financeira.
 * Os subcentros são buscados em ordem de prioridade.
 */
export const BOITEL_CLASSIFICACAO: Record<string, BoitelClassificacao> = {
  'boitel:receita': {
    tipo_operacao: '1-Entradas',
    sinal: 1,
    subcentroCandidatos: [
      'PEC/RECEITA/VENDAS/BOITEL',
      'PEC/RECEITA/VENDAS/MACHOS ADULTOS',
      'PEC/RECEITA/VENDAS/MACHOS',
    ],
  },
  'boitel:adiantamento_pago': {
    tipo_operacao: '2-Saídas',
    sinal: -1,
    subcentroCandidatos: [
      'PEC/ADIANTAMENTOS/ADIANTAMENTO BOITEL',
      'PEC/BOITEL/ADIANTAMENTO OPERACIONAL',
      'PEC/ADIANTAMENTOS/BOITEL',
    ],
  },
  'boitel:adiantamento_recebido': {
    tipo_operacao: '1-Entradas',
    sinal: 1,
    subcentroCandidatos: [
      'PEC/RECEITA/VENDAS/BOITEL',
      'PEC/RECEITA/VENDAS/MACHOS ADULTOS',
    ],
  },
  'boitel:custo_frete': {
    tipo_operacao: '2-Saídas',
    sinal: -1,
    subcentroCandidatos: [
      'COMPRAS ANIMAIS/FRETES',
      'FRETE COMPRA ANIMAIS',
      'PEC/FRETE/BOITEL',
    ],
  },
  'boitel:custo_sanidade': {
    tipo_operacao: '2-Saídas',
    sinal: -1,
    subcentroCandidatos: [
      'PEC/SANIDADE OUTROS',
      'PEC/SANIDADE/BOITEL',
    ],
  },
  'boitel:custo_outros': {
    tipo_operacao: '2-Saídas',
    sinal: -1,
    subcentroCandidatos: [
      'PEC/OUTROS CUSTOS/BOITEL',
      'PEC/CUSTEIO/OUTROS',
    ],
  },
  // Legacy compatibility
  'boitel:adiantamento': {
    tipo_operacao: '2-Saídas',
    sinal: -1,
    subcentroCandidatos: [
      'PEC/ADIANTAMENTOS/ADIANTAMENTO BOITEL',
      'PEC/BOITEL/ADIANTAMENTO OPERACIONAL',
      'PEC/ADIANTAMENTOS/BOITEL',
    ],
  },
  'boitel:custo': {
    tipo_operacao: '2-Saídas',
    sinal: -1,
    subcentroCandidatos: [
      'PEC/CUSTEIO/BOITEL',
      'PEC/OUTROS CUSTOS/BOITEL',
    ],
  },
};

/**
 * Busca o plano de contas para um determinado origem_tipo de boitel.
 * Usa mapeamento explícito, sem busca genérica.
 */
export async function buscarPlanoContasBoitel(
  supabaseClient: any,
  clienteId: string,
  origemTipo: string,
): Promise<{ id: string; macro_custo: string; centro_custo: string; subcentro: string } | null> {
  const config = BOITEL_CLASSIFICACAO[origemTipo];
  if (!config) {
    console.error(`[Boitel Mapping] origem_tipo desconhecido: ${origemTipo}`);
    return null;
  }

  // Busca explícita por subcentros candidatos (em ordem de prioridade)
  const { data } = await supabaseClient
    .from('financeiro_plano_contas')
    .select('id, macro_custo, centro_custo, subcentro')
    .eq('ativo', true)
    .eq('tipo_operacao', config.tipo_operacao)
    .in('subcentro', config.subcentroCandidatos);

  if (!data || data.length === 0) return null;

  // Retornar na ordem de prioridade dos candidatos
  for (const sub of config.subcentroCandidatos) {
    const found = data.find((d: any) => d.subcentro === sub);
    if (found) return found;
  }

  return data[0];
}
