/**
 * composeGridMetaConsolidado
 * --------------------------
 * Função pura que produz o "Grid META Consolidado" idêntico ao que a tela
 * Fluxo de Caixa META (PlanejamentoFinanceiroTab) renderiza visualmente.
 *
 * Combina:
 *   - ajuste manual     (gridMeta2026, vem de planejamento_financeiro)
 *   - auto rebanho      (Maps de lancamentos cenario=meta abate/venda/compra)
 *   - auto nutrição     (calculado de vw_zoot_categoria_mensal cenario=meta)
 *   - auto financiamento (parcelas META)
 *   - auto projetos     (meta_projetos_investimento)
 *
 * Saída: SubcentroGrid[] com `meses` = auto + ajuste por subcentro/mês,
 * para que qualquer agregador (Bloco 1 Executivo, etc.) consuma a mesma
 * fonte que a tela oficial já mostra.
 *
 * Fonte da regra: PlanejamentoFinanceiroTab.tsx linhas ~480-525
 * (composição inline replicada literalmente).
 *
 * IMPORTANTE: replica o comportamento atual da tela 1:1, incluindo
 * eventuais duplicações entre linhas origem='rebanho_auto' / 'parcela_auto'
 * em planejamento_financeiro e os Maps auto correspondentes. A tela atual
 * também duplica nesses casos; corrigir essa duplicação é decisão separada
 * deste refactor.
 */
import type { SubcentroGrid } from '@/hooks/usePlanejamentoFinanceiro';

// Sets idênticos aos definidos em PlanejamentoFinanceiroTab.tsx linhas 40-58.
// Mantidos DUPLICADOS aqui deliberadamente nesta iteração — a próxima
// iteração pode mover esses sets para um módulo compartilhado e importar
// dos dois lados. Para esse refactor cirúrgico, manter local para não
// expandir escopo.
const SUBCENTROS_REBANHO = new Set([
  'Abates de Machos', 'Abates de Fêmeas',
  'Venda de Desmama Machos', 'Venda de Desmama Fêmeas',
  'Venda de Machos Adultos', 'Venda de Fêmeas Adultas',
  'Venda em Boitel',
  'Adiantamento de Boitel',
  'Investimento Compra Bovinos Machos', 'Investimento Compra Bovinos Fêmeas',
]);

const SUBCENTROS_FINANCIAMENTO = new Set([
  'Amortização Financiamento Pecuária', 'Amortização Financiamento Agricultura',
  'Juros de Financiamento Pecuária', 'Juros de Financiamento Agricultura',
]);

const SUBCENTROS_NUTRICAO = new Set([
  'Nutrição Cria', 'Nutrição Recria', 'Nutrição Engorda',
  'Despesas Comerciais Pecuária',
  'Impostos e Despesas de Abates e Vendas',
  'Transferência de Gado entre Fazendas',
]);

export interface ExtrasGridMeta {
  lancamentosRebanho: Map<string, number[]>;
  lancamentosFinanciamento: Map<string, number[]>;
  lancamentosNutricao: Map<string, number[]>;
  lancamentosProjetos: Map<string, number[]>;
}

/**
 * Recebe o grid de ajustes manuais (gridMeta2026) e os 4 Maps auto.
 * Retorna o grid consolidado, pronto para ser passado aos agregadores
 * oficiais (agregaReceitaPecMeta, agregaCusteioPecMeta, etc.).
 *
 * Função pura: não lê banco, não faz I/O, sem efeitos colaterais.
 */
export function composeGridMetaConsolidado(
  grid: SubcentroGrid[],
  extras: ExtrasGridMeta,
): SubcentroGrid[] {
  const result: SubcentroGrid[] = [];
  const subcentrosNoGrid = new Set<string>();

  for (const g of grid) {
    const sub = g.subcentro;
    subcentrosNoGrid.add(sub);

    const isRebanho = SUBCENTROS_REBANHO.has(sub);
    const isFinanciamento = SUBCENTROS_FINANCIAMENTO.has(sub);
    const isNutricao = SUBCENTROS_NUTRICAO.has(sub);
    const isProjeto = extras.lancamentosProjetos.has(sub);
    const isAuto = isRebanho || isFinanciamento || isNutricao || isProjeto;

    if (isAuto) {
      const autoMeses =
        (isRebanho       ? extras.lancamentosRebanho.get(sub) :
         isNutricao      ? extras.lancamentosNutricao.get(sub) :
         isProjeto       ? extras.lancamentosProjetos.get(sub) :
                           extras.lancamentosFinanciamento.get(sub))
        || new Array(12).fill(0);
      const ajuste = g.meses;
      const total = new Array(12).fill(0).map((_, i) => (autoMeses[i] || 0) + (ajuste[i] || 0));
      result.push({ ...g, meses: total });
    } else {
      // Não-auto: ajuste manual puro (cópia defensiva do array meses).
      result.push({ ...g, meses: [...g.meses] });
    }
  }

  // Defesa: subcentros que existem APENAS em lancamentosProjetos e que
  // não estão no plano de contas (raro, mas possível com projetos
  // customizados). Sem isso, valores ficariam órfãos.
  // Rebanho/Nutrição/Financiamento sempre estão no plano de contas global,
  // então não entram aqui.
  for (const [sub, meses] of extras.lancamentosProjetos) {
    if (subcentrosNoGrid.has(sub)) continue;
    result.push({
      macro_custo: 'Investimento na Fazenda',
      grupo_custo: null,
      centro_custo: 'Investimentos',
      subcentro: sub,
      escopo_negocio: 'pecuaria',
      ordem_exibicao: 9999,
      meses: [...meses],
    });
  }

  return result;
}
