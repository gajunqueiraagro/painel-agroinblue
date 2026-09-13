/**
 * AS UNIDADES DE MEDIDA DE INSUMO — PR-AGRI-BARTER-FIX-INSUMO-FORM.
 *
 * ⚠ A CASA NÃO TINHA ESTA LISTA, e procurei antes de escrever. O que existe é outra coisa:
 * `UNIDADES` em `lib/agri/colheita.ts` é a unidade da CULTURA (quilos por saca, t/ha) e
 * `DRIVER_POR_SUBCENTRO` em `lib/calculos/driverZootecnico.ts` carrega a unidade do DRIVER
 * zootécnico ("cab", "@"). Nenhuma das duas é catálogo de unidade de compra; reusá-las seria
 * emprestar o nome de um conceito para outro.
 *
 * ⚠ CÓDIGO CURTO GRAVADO, RÓTULO LONGO EXIBIDO. O banco guarda 't' e a tela escreve
 * "t — tonelada": o texto livre que estava aqui já produziu "Ton", e "Ton", "ton", "TON" e
 * "tonelada" são quatro unidades diferentes para qualquer soma futura. O estoque que vier
 * depois vai agrupar por este código.
 *
 * ⚠ SEM 'ha' E SEM '@': área não é unidade de insumo comprado, e a arroba é da pecuária. Uma
 * lista curta que cobre o que se compra vale mais do que uma longa em que o operador escolhe
 * errado por cansaço — foi a mesma razão do pré-filtro do plano de contas.
 */

export interface UnidadeInsumo {
  /** O que vai para o banco. */
  valor: string;
  /** O que a lista mostra. */
  label: string;
}

export const UNIDADES_INSUMO: readonly UnidadeInsumo[] = [
  { valor: 'kg', label: 'kg — quilo' },
  { valor: 't', label: 't — tonelada' },
  { valor: 'sc', label: 'sc — saca' },
  { valor: 'L', label: 'L — litro' },
  { valor: 'un', label: 'un — unidade' },
  { valor: 'dose', label: 'dose' },
] as const;

/**
 * O rótulo de uma unidade.
 *
 * ⚠ DEVOLVE O PRÓPRIO VALOR quando não reconhece, nunca vazio nem "—": os insumos gravados
 * antes desta lista têm "Ton" e coisas do gênero, e apagá-los da exibição faria a linha
 * parecer sem unidade quando ela tem uma, só que fora do catálogo.
 */
export function labelDaUnidade(valor: string | null | undefined): string {
  const v = (valor ?? '').trim();
  if (!v) return '—';
  return UNIDADES_INSUMO.find(u => u.valor === v)?.label ?? v;
}

/** A unidade está no catálogo? Usado para não perder o valor legado ao reabrir o form. */
export function unidadeConhecida(valor: string | null | undefined): boolean {
  const v = (valor ?? '').trim();
  return v !== '' && UNIDADES_INSUMO.some(u => u.valor === v);
}
