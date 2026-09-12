/**
 * O DRE POR CULTURA, DO JEITO QUE A TELA PRECISA — PR-AGRI-DRE-01.
 *
 * ⚠ AQUI NÃO SE CALCULA RESULTADO. A `fn_dre_agricola_por_safra` é a fonte única e está
 * congelada; este módulo PIVOTA o conjunto plano que ela devolve (uma linha por
 * cultura × ordem) e deriva só o que é apresentação: resultado por hectare, percentual de
 * custo apropriado, montante rateado. Somar culturas para obter total seria refazer a conta
 * do banco com outro arredondamento — e no dia em que o rateio mudar, a tela mentiria sem
 * ninguém perceber.
 * ⚠ O TOTAL VEM DA COLUNA `__total__`, SEMPRE. Ela já resolve a dupla contagem do
 * compartilhado (que é distribuído entre as culturas e por isso não se soma de novo).
 */

/** Uma célula do conjunto plano, como a RPC devolve. */
export interface CelulaDre {
  cultura: string;
  area_ha: number | null;
  area_cadastrada: boolean | null;
  ordem: number;
  linha: string;
  rotulo: string;
  valor: number | null;
  rateio_admin_declarado: boolean | null;
}

export const COL_TOTAL = '__total__';
export const COL_COMPARTILHADO = '__compartilhado__';

/** As onze linhas, na ordem em que a RPC as numera. */
export const LINHA = {
  receitaBruta: 1,
  deducoes: 2,
  receitaLiquida: 3,
  custoVariavel: 4,
  custoFixo: 5,
  juros: 6,
  rateioCompartilhado: 7,
  rateioAdmin: 8,
  resultadoCaixa: 9,
  investimento: 10,
  depreciacao: 11,
} as const;

/** As nove primeiras formam a cascata; 10 e 11 ficam abaixo da linha de caixa. */
export const ORDENS_CASCATA = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const ORDENS_ABAIXO_DA_LINHA = [10, 11];

/**
 * ⚠ SUBTOTAIS MOSTRAM ZERO; COMPONENTES MOSTRAM TRAÇO. Um "R$ 0,00" em Deduções diz "não
 * houve dedução", o que é ruído numa coluna de doze linhas; um "R$ 0,00" em Receita líquida
 * diz "a conta fechou em zero", que é informação. A regra está aqui, e não espalhada no JSX,
 * porque é decisão de produto — e foi marcada para confirmação na homologação.
 */
export const ORDENS_SUBTOTAL = [3, 9];

export interface MatrizDre {
  /** As culturas reais, em ordem alfabética — sem `__total__` nem `__compartilhado__`. */
  culturas: string[];
  /** `celula[cultura][ordem]`. */
  celula: Map<string, Map<number, CelulaDre>>;
  /** O rótulo de cada ordem, vindo da RPC (já com "= " e "(-) "). */
  rotulos: Map<number, string>;
  areaPorCultura: Map<string, number | null>;
  areaCadastrada: Map<string, boolean>;
  areaTotal: number | null;
  /** `false` quando algum ano da safra não tem percentual declarado. */
  rateioAdminDeclarado: boolean;
  vazio: boolean;
}

export function montarMatriz(linhas: readonly CelulaDre[] | null | undefined): MatrizDre {
  const celula = new Map<string, Map<number, CelulaDre>>();
  const rotulos = new Map<number, string>();
  const areaPorCultura = new Map<string, number | null>();
  const areaCadastrada = new Map<string, boolean>();
  let rateioAdminDeclarado = true;

  for (const c of linhas ?? []) {
    if (!celula.has(c.cultura)) celula.set(c.cultura, new Map());
    celula.get(c.cultura)!.set(c.ordem, c);
    if (!rotulos.has(c.ordem)) rotulos.set(c.ordem, c.rotulo);
    if (c.cultura !== COL_COMPARTILHADO) {
      areaPorCultura.set(c.cultura, c.area_ha != null ? Number(c.area_ha) : null);
      if (c.area_cadastrada != null) areaCadastrada.set(c.cultura, c.area_cadastrada);
    }
    if (c.rateio_admin_declarado === false) rateioAdminDeclarado = false;
  }

  const culturas = [...celula.keys()]
    .filter((k) => k !== COL_TOTAL && k !== COL_COMPARTILHADO)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return {
    culturas,
    celula,
    rotulos,
    areaPorCultura,
    areaCadastrada,
    areaTotal: areaPorCultura.get(COL_TOTAL) ?? null,
    rateioAdminDeclarado,
    vazio: (linhas ?? []).length === 0,
  };
}

/** O valor de uma célula, ou `null` quando a RPC não a devolveu. */
export function valorDe(m: MatrizDre, cultura: string, ordem: number): number | null {
  const v = m.celula.get(cultura)?.get(ordem)?.valor;
  return v == null ? null : Number(v);
}

/**
 * ⚠ DIVIDIR POR ÁREA AUSENTE É INVENTAR PRODUTIVIDADE. Sem hectare — nulo, zero ou negativo —
 * o indicador não existe, e a tela mostra "—". Zero no denominador daria Infinity, e um
 * Infinity formatado vira "R$ ∞" na frente do produtor.
 */
export function resultadoPorHa(m: MatrizDre, cultura: string): number | null {
  const resultado = valorDe(m, cultura, LINHA.resultadoCaixa);
  const area = cultura === COL_TOTAL ? m.areaTotal : (m.areaPorCultura.get(cultura) ?? null);
  if (resultado == null || area == null || area <= 0) return null;
  return resultado / area;
}

/**
 * Quanto do custo daquela cultura é DIRETO — o selo do card.
 *
 * ⚠ É SOBRE CUSTO, NUNCA SOBRE RECEITA. A RPC não decompõe receita por cultura: ela também
 * entra rateada por área, e um "% de receita apropriada" seria um número inventado sobre um
 * dado que não existe. O card diz isso por escrito, ao lado do selo.
 * ⚠ SEM CUSTO NENHUM, O SELO SOME. 0/0 não é 0% nem 100% — é ausência de base, e um "0%"
 * ali acusaria a cultura de não ter custo direto quando ela não tem custo algum.
 */
export function percentualCustoDireto(m: MatrizDre, cultura: string): number | null {
  const direto = (valorDe(m, cultura, LINHA.custoVariavel) ?? 0)
    + (valorDe(m, cultura, LINHA.custoFixo) ?? 0)
    + (valorDe(m, cultura, LINHA.juros) ?? 0);
  const rateado = (valorDe(m, cultura, LINHA.rateioCompartilhado) ?? 0)
    + (valorDe(m, cultura, LINHA.rateioAdmin) ?? 0);
  const total = direto + rateado;
  if (total <= 0) return null;
  return Math.round((direto / total) * 100);
}

/** O montante que a faixa âmbar anuncia: o que foi rateado no total da safra. */
export function montanteRateado(m: MatrizDre): number {
  return (valorDe(m, COL_TOTAL, LINHA.rateioCompartilhado) ?? 0)
    + (valorDe(m, COL_TOTAL, LINHA.rateioAdmin) ?? 0);
}

/** A faixa só aparece quando houve rateio — sem ele, não há o que explicar. */
export function houveRateio(m: MatrizDre): boolean {
  return montanteRateado(m) !== 0;
}

/**
 * O que a célula exibe.
 *
 * ⚠ TRAÇO É AUSÊNCIA, E ZERO EM COMPONENTE É AUSÊNCIA NA PRÁTICA: numa coluna de nove linhas,
 * seis "R$ 0,00" empurram para fora da vista os três números que importam. Subtotal e Total
 * escapam da regra porque ali o zero é o resultado, não a falta dele.
 */
export function exibeTraco(ordem: number, valor: number | null, cultura: string): boolean {
  if (valor == null) return true;
  if (cultura === COL_TOTAL) return false;
  if (ORDENS_SUBTOTAL.includes(ordem)) return false;
  return valor === 0;
}
