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
/**
 * A coluna do que ainda não foi classificado — AGRI-DRE-RPC-02.
 *
 * ⚠ ELA NÃO É UMA CULTURA, e também não é o compartilhado: aqui cai a receita SEM cultura e o
 * lançamento marcado com uma cultura que não foi plantada na safra. Enquanto quase toda a
 * receita mora nesta coluna, o resultado das culturas é negativo e o dela é positivo — e isso
 * está CERTO: elas carregam o custo que já foi apropriado, e a receita ainda não chegou.
 * ⚠ MEDIDO NO PROTO EM 13/09/2026: a RPC deixou de devolver `__compartilhado__` como coluna;
 * o retorno traz as culturas, `__nao_apropriado__` e `__total__`. A constante do compartilhado
 * fica porque o pivô não deve quebrar se ela voltar.
 */
export const COL_NAO_APROPRIADO = '__nao_apropriado__';

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
  /**
   * A coluna "Não apropriado" carrega algum valor?
   *
   * ⚠ NÃO É PARA ESCONDER A COLUNA — ela fica sempre no mesmo lugar (A23: nada aparece ou some
   * conforme o dado). A flag governa a OBSERVAÇÃO abaixo da tabela: quando há valor, a frase
   * explica que aquilo aguarda classificação; quando não há, não há o que explicar.
   */
  temNaoApropriado: boolean;
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
    if (c.cultura !== COL_COMPARTILHADO && c.cultura !== COL_NAO_APROPRIADO) {
      areaPorCultura.set(c.cultura, c.area_ha != null ? Number(c.area_ha) : null);
      if (c.area_cadastrada != null) areaCadastrada.set(c.cultura, c.area_cadastrada);
    }
    if (c.rateio_admin_declarado === false) rateioAdminDeclarado = false;
  }

  const culturas = [...celula.keys()]
    .filter((k) => k !== COL_TOTAL && k !== COL_COMPARTILHADO && k !== COL_NAO_APROPRIADO)
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
    /* Zero aqui é a leitura boa: a safra inteira está apropriada. */
    temNaoApropriado: [...(celula.get(COL_NAO_APROPRIADO)?.values() ?? [])]
      .some((c) => c.valor != null && Number(c.valor) !== 0),
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

/**
 * DE QUAL GRUPO DO PLANO CADA LINHA DO DRE VEM — PR-AGRI-DRE-UX-03 (drill).
 *
 * ⚠ OS NOMES TEM ACENTO, e sao os do banco (conferidos em `financeiro_plano_contas`): e' por
 * eles que o drill filtra. Um "Deducoes" sem cedilha devolveria lista vazia com cara de
 * "nao ha lancamento".
 * ⚠ AS DUAS LINHAS DE RATEIO NAO TEM GRUPO, e e' o ponto: elas sao ESTIMADAS — o valor chegou
 * na cultura por peso de area, nao por lancamento. Nao ha o que abrir, e por isso `null`.
 */
export const GRUPO_DA_LINHA: Record<number, string | null> = {
  [LINHA.receitaBruta]: 'Receita Agrícola',
  [LINHA.deducoes]: 'Deduções Agricultura',
  [LINHA.custoVariavel]: 'Custo Variável Agricultura',
  [LINHA.custoFixo]: 'Custo Fixo Agricultura',
  [LINHA.juros]: 'Juros de Financiamento Agricultura',
  [LINHA.rateioCompartilhado]: null,
  [LINHA.rateioAdmin]: null,
  [LINHA.investimento]: 'Investimento Agricultura',
  [LINHA.receitaLiquida]: null,
  [LINHA.resultadoCaixa]: null,
  [LINHA.depreciacao]: null,
};

/** A célula abre drill? Só as que têm grupo, e só nas colunas que têm lançamento por trás. */
export function celulaTemDrill(ordem: number, cultura: string): boolean {
  if (cultura === COL_TOTAL || cultura === COL_COMPARTILHADO) return false;
  return GRUPO_DA_LINHA[ordem] != null;
}

/** A linha é um rateio — o valor é estimado, e o rótulo diz isso. */
export function ehLinhaRateio(ordem: number): boolean {
  return ordem === LINHA.rateioCompartilhado || ordem === LINHA.rateioAdmin;
}

/**
 * A linha é saída? O critério é o RÓTULO da RPC começar com "(-)" — a fonte é a mesma que
 * desenha o texto, então nunca diverge dele.
 */
export function ehLinhaSaida(rotulo: string | undefined): boolean {
  return (rotulo ?? '').trim().startsWith('(-)');
}

/**
 * ⚠ O `tipo_operacao` FAZ PARTE DA LINHA. A RPC soma receita só de `1-Entradas` e todo o resto
 * só de `2-Saídas`; um drill que ignorasse o tipo traria o estorno junto e mostraria uma lista
 * que não fecha com a célula clicada.
 */
export const TIPO_DA_LINHA: Record<number, string> = {
  [LINHA.receitaBruta]: '1-Entradas',
  [LINHA.deducoes]: '2-Saídas',
  [LINHA.custoVariavel]: '2-Saídas',
  [LINHA.custoFixo]: '2-Saídas',
  [LINHA.juros]: '2-Saídas',
  [LINHA.investimento]: '2-Saídas',
};

/**
 * EM QUE COLUNA O LANÇAMENTO CAI — espelho fiel do `case` da RPC (medido em pg_proc,
 * 13/09/2026).
 *
 * ⚠ ELE EXISTE PORQUE O DRILL TEM DE FECHAR COM A CÉLULA. Se a tela agrupasse por `cultura` do
 * lançamento, a mandioca-não-plantada apareceria como coluna própria e a soma do drill não
 * bateria com o número clicado — que é a maneira mais rápida de perder a confiança do
 * operador num relatório.
 * ⚠ "NÃO APROPRIADO" TEM DUAS ENTRADAS, e elas são diferentes: receita/dedução SEM cultura
 * (ninguém marcou) e lançamento COM cultura que não foi plantada nesta safra (marcaram
 * errado, ou a área não foi cadastrada). As duas precisam de decisão humana; custo comum sem
 * cultura, não — esse rateia.
 */
export function bucketDaLinha(
  cultura: string | null | undefined,
  grupo: string | null | undefined,
  plantadas: readonly string[],
): string {
  if (cultura && plantadas.includes(cultura)) return cultura;
  const receitaOuDeducao = grupo === 'Receita Agrícola' || grupo === 'Deduções Agricultura';
  if (cultura == null || cultura === '') {
    return receitaOuDeducao ? COL_NAO_APROPRIADO : COL_COMPARTILHADO;
  }
  return COL_NAO_APROPRIADO;
}
