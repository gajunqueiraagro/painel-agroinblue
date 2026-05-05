/**
 * Módulo determinístico de cálculo de status mensal.
 * Fonte única de verdade para:
 *   1. Conciliação do Financeiro
 *   2. Fechamento de Pastos
 *   3. Conciliação de Categorias
 *   4. Valor do Rebanho
 *
 * REGRAS DE COERÊNCIA:
 * - Pastos só pode ser 'fechado' se Categorias também for 'fechado'
 * - Nenhum status pode ser 'fechado' com divergência relevante
 */

export type StatusCor = 'aberto' | 'parcial' | 'fechado';

export interface StatusFinanceiroInput {
  /** Registros de fechamento financeiro para o mês/fazenda(s) */
  fechamentos: { status_fechamento: string }[];
  /** Total de fazendas esperadas (para modo global) */
  totalFazendasEsperadas: number;
}

export interface StatusCategoriasInput {
  /** Categorias com saldo > 0 no sistema oficial: Map<codigo, quantidade> */
  saldoOficial: Map<string, number>;
  /** Categorias alocadas nos pastos: Map<codigo, quantidade> */
  alocadoPastos: Map<string, number>;
  /** Se há itens de fechamento de pastos no período */
  temItensPastos: boolean;
  /** Total de pastos ativos (para distinguir "nada a conciliar" de "dados não carregados") */
  pastosAtivos?: number;
}

export interface StatusPastosInput {
  /** Total de pastos ativos obrigatórios */
  totalPastos: number;
  /** Pastos com status 'fechado' */
  pastosFechados: number;
  /** Pastos com algum registro (rascunho ou fechado) */
  pastosComRegistro: number;
  /** Status de categorias já calculado */
  statusCategorias: StatusCor;
}

export interface StatusValorInput {
  /** Quantidade de categorias com preço definido */
  precosDefinidos: number;
  /** Quantidade de categorias com saldo > 0 */
  categoriasComSaldo: number;
}

// ─── 1. Conciliação do Financeiro ───

export function statusFinanceiro(input: StatusFinanceiroInput): StatusCor {
  const { fechamentos, totalFazendasEsperadas } = input;

  if (fechamentos.length === 0) return 'aberto';

  const allFechado = fechamentos.every(f => f.status_fechamento === 'fechado');
  const someFechado = fechamentos.some(f => f.status_fechamento === 'fechado');

  if (allFechado && fechamentos.length >= totalFazendasEsperadas) return 'fechado';
  if (someFechado) return 'parcial';
  return 'aberto';
}

// ─── 3. Conciliação de Categorias ───
// (calculada antes de Pastos pois Pastos depende dela)
//
// REGRA OFICIAL (atualizada):
// Verde: TODAS as categorias com dif = 0 E dif total = 0
// Amarelo: dif total = 0 mas alguma categoria ≠ 0 (compensação cruzada)
// Vermelho: dif total ≠ 0 OU sem dados de pastos com rebanho existente

export interface StatusCategoriasResult {
  status: StatusCor;
  catsDivergentes: number;
  difTotalCabecas: number;
  difTotalLiquida: number;
  saldoTotalOficial: number;
  totalAlocadoPastos: number;
}

export function statusCategorias(input: StatusCategoriasInput): StatusCategoriasResult {
  const { saldoOficial, alocadoPastos, temItensPastos, pastosAtivos = 0 } = input;
  const catsComSaldo = Array.from(saldoOficial.entries()).filter(([, q]) => q > 0);
  const saldoTotalOficial = catsComSaldo.reduce((s, [, q]) => s + q, 0);

  // Total alocado nos pastos
  const totalAlocado = Array.from(alocadoPastos.values()).reduce((s, q) => s + q, 0);

  // Sem itens de pastos e sem saldo:
  // - Se há pastos ativos → aberto (falta preencher)
  // - Se não há pastos → fechado (nada a conciliar)
  if (!temItensPastos && catsComSaldo.length === 0) {
    if (pastosAtivos > 0) {
      return { status: 'aberto', catsDivergentes: 0, difTotalCabecas: 0, difTotalLiquida: 0, saldoTotalOficial: 0, totalAlocadoPastos: 0 };
    }
    return { status: 'fechado', catsDivergentes: 0, difTotalCabecas: 0, difTotalLiquida: 0, saldoTotalOficial: 0, totalAlocadoPastos: 0 };
  }

  // Sem itens de pastos mas com saldo → aberto (pastos não preenchidos)
  if (!temItensPastos && catsComSaldo.length > 0) {
    return {
      status: 'aberto',
      catsDivergentes: catsComSaldo.length,
      difTotalCabecas: saldoTotalOficial,
      difTotalLiquida: -saldoTotalOficial,
      saldoTotalOficial,
      totalAlocadoPastos: 0,
    };
  }

  // Com itens de pastos → comparar CADA categoria
  let catsDivergentes = 0;
  let difAbsTotal = 0;

  catsComSaldo.forEach(([cat, qtdSist]) => {
    const qtdPastos = alocadoPastos.get(cat) || 0;
    const dif = Math.abs(qtdPastos - qtdSist);
    if (dif > 0) { catsDivergentes++; difAbsTotal += dif; }
  });

  // Categorias nos pastos que não existem no saldo oficial
  alocadoPastos.forEach((qtdP, cat) => {
    if (!saldoOficial.has(cat) || (saldoOficial.get(cat) || 0) <= 0) {
      if (qtdP > 0) { catsDivergentes++; difAbsTotal += qtdP; }
    }
  });

  const difTotalLiquida = totalAlocado - saldoTotalOficial;

  // Verde: ZERO divergência em TODAS as categorias
  if (catsDivergentes === 0) {
    return { status: 'fechado', catsDivergentes: 0, difTotalCabecas: 0, difTotalLiquida: 0, saldoTotalOficial, totalAlocadoPastos: totalAlocado };
  }

  // Amarelo: total líquido bate (dif = 0) mas categorias individuais divergem
  // Vermelho: total líquido não bate OU divergência real
  const status: StatusCor = difTotalLiquida === 0 ? 'parcial' : 'aberto';

  return { status, catsDivergentes, difTotalCabecas: difAbsTotal, difTotalLiquida, saldoTotalOficial, totalAlocadoPastos: totalAlocado };
}

// ─── 2. Fechamento de Pastos ───

export function statusPastos(input: StatusPastosInput): StatusCor {
  const { totalPastos, pastosFechados, pastosComRegistro, statusCategorias: stCats } = input;

  if (totalPastos === 0) return 'aberto';

  if (pastosFechados >= totalPastos) {
    // 'parcial' = total fecha mas distribuição interna diverge → não contamina status global
    // Só retorna 'parcial' se categorias estão abertas (total não fecha)
    if (stCats === 'fechado' || stCats === 'parcial') return 'fechado';
    return 'parcial';
  }

  if (pastosFechados > 0 || pastosComRegistro > 0) return 'parcial';
  return 'aberto';
}

// ─── 4. Valor do Rebanho ───

export function statusValor(input: StatusValorInput): StatusCor {
  const { precosDefinidos, categoriasComSaldo } = input;

  if (precosDefinidos === 0) return 'aberto';
  if (categoriasComSaldo > 0 && precosDefinidos < categoriasComSaldo) return 'parcial';
  return 'fechado';
}

// ─── Resultado completo do mês ───

export interface StatusMesCompleto {
  financeiro: StatusCor;
  pastos: StatusCor;
  categorias: StatusCor;
  valor: StatusCor;
}

/**
 * Calcula os 4 status do mês de forma determinística.
 * Aplica regras de coerência automaticamente.
 */
export function calcularStatusMes(
  fin: StatusFinanceiroInput,
  cats: StatusCategoriasInput,
  past: Omit<StatusPastosInput, 'statusCategorias'>,
  val: StatusValorInput,
): StatusMesCompleto {
  const stFin = statusFinanceiro(fin);
  const stCatsResult = statusCategorias(cats);
  const stPastos = statusPastos({ ...past, statusCategorias: stCatsResult.status });
  const stValor = statusValor(val);

  return {
    financeiro: stFin,
    pastos: stPastos,
    categorias: stCatsResult.status,
    valor: stValor,
  };
}
