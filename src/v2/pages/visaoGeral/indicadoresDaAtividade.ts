/**
 * VISAO-GERAL-05 (Gabriel 04/11 07:29) — os indicadores de cada atividade na Visão Geral, em UMA linha, com a comparação pequena embaixo
 * de cada valor: "▲ x% meta · ▼ y% ano ant." (verde quando é bom, vermelho quando não). Sem meta ou sem ano anterior, aquele pedaço não
 * aparece; o indicador sem dado não aparece (nunca "em breve").
 *
 * NENHUMA CONTA NASCE AQUI: cada número sai pronto da fonte da tela dona, e a divisão segue a régua de lá.
 *   · Pecuária — @ produzidas no ano, @/ha, custo/@ e margem/@: `fn_dre_pecuaria` (jan → mês; meta = cenário meta; ano anterior = os
 *     mesmos meses do ano anterior), com a base do R$/@ e do /ha da tela DRE (`arrobaDaBase` + `BASE_DO_ARROBA`; `producao.ha_medio`).
 *     GMD: o indicador do PC-100 (rebanho do Fechamento), com o `deltaMeta` e o `deltaAno` que ele já traz. A Lotação (UA/ha) saiu na
 *     VISAO-GERAL-04 (mock aprovado 08/11, V7): ela já é um cartão da faixa de cima.
 *   · Agricultura — produtividade, custo/ha e margem/ha: `fn_dre_lavoura` da safra do mês (ano anterior = a safra anterior), linhas
 *     `custo_variavel` e `margem_contribuicao` com o `por_ha` da RPC; área plantada: os talhões da safra; colhido: o Estoque de grãos.
 *   · Silvicultura — a área (a foto de área do mês). Idade e volume não têm cadastro: não aparecem.
 * A variação é a do PC-100: (valor − referência) ÷ referência, com o módulo da referência (margem negativa não inverte o sinal).
 */
import { formatNum } from '@/lib/calculos/formatters';
import { BASE_DO_ARROBA } from '@/components/agri/drePecRegua';

/** o que esta peça lê de UMA coluna da DRE pecuária (`DrePecLinhas` cabe aqui) */
export interface DrePecLida {
  custo_variavel: number | null;
  margem: number | null;
  producao: { at_produzida: number | null; ha_medio: number | null };
}
/** o que esta peça lê da DRE agrícola (`DreLavoura` cabe aqui) */
export interface DreLavouraLida {
  culturas: readonly { cultura: string; producao: number; produtividade: number }[];
  total: { linhas: { custo_variavel: { por_ha?: number }; margem_contribuicao: { por_ha?: number } } };
}
import { simboloDaUnidade } from '@/lib/agri/colheita';

export interface IndicadorAtividade {
  id: string;
  rotulo: string;
  /** o número pronto ("32.775"); `null` = sem dado → o indicador não aparece */
  valor: string | null;
  /** a unidade, menor, ao lado do número ("@", "kg", "UA/ha", "ha") — VISAO-GERAL-05, a hierarquia do número */
  unidade?: string;
  /** variação % contra a meta e contra o ano anterior; `null` = sem referência → o pedaço não aparece */
  meta: number | null;
  anoAnt: number | null;
  /** custo: subir é ruim (a seta continua dizendo o sentido; a COR diz se é bom) */
  menorMelhor?: boolean;
  /** de onde vem (o `title` do indicador e a página de validação) */
  fonte: string;
}

export const variacao = (atual: number | null | undefined, ref: number | null | undefined): number | null =>
  atual == null || ref == null || !Number.isFinite(atual) || !Number.isFinite(ref) || ref === 0 ? null : ((atual - ref) / Math.abs(ref)) * 100;

/** R$/@ pela base da linha (a régua da tela DRE: `BASE_DO_ARROBA` — custo variável e margem se leem pela @ PRODUZIDA); base nula ou zero
 *  = sem número; se a régua mudar a base destas linhas, aqui dá "sem número" em vez de dividir pela @ errada */
export function porArrobaNum(v: number | null | undefined, l: DrePecLida | null | undefined, chave: 'custo_variavel' | 'margem'): number | null {
  if (!l || v == null) return null;
  const base = BASE_DO_ARROBA[chave] === 'produzida' ? l.producao.at_produzida : null;
  return base == null || !(base > 0) ? null : v / base;
}

/** @ produzidas por hectare: a @ produzida ÷ a área média da coluna (`producao.ha_medio`, o divisor do "por hectare" da tela DRE) */
export function arrobaPorHa(l: DrePecLida | null | undefined): number | null {
  const at = l?.producao.at_produzida; const ha = l?.producao.ha_medio;
  return at == null || ha == null || !(ha > 0) ? null : at / ha;
}

/* o negativo com o sinal de menos ANTES do R$ ("−R$ 1.107,00"), nunca "R$ -1.107,00" */
const reais = (v: number | null) => (v == null ? null : `${v < 0 ? '−' : ''}R$ ${formatNum(Math.abs(v), 2)}`);
const num = (v: number | null, d: number) => (v == null ? null : formatNum(v, d));

export function indicadoresPecuaria(e: {
  real: DrePecLida | null; meta: DrePecLida | null; anoAnt: DrePecLida | null;
  gmd: { valor: number | null; deltaMeta: number | null; deltaAno: number | null } | null;
  /** VISAO-GERAL-04 V8 (Gabriel 08/11, opção A) — o rótulo diz o período do número: "GMD no ano" (No ano: jan → mês, computePeriodGmd)
   *  ou "GMD de set" (No mês) — os outros números da linha são do ano, e o GMD do mês ao lado deles enganava */
  rotuloGmd?: string;
  podeVerMeta: boolean;
}): IndicadorAtividade[] {
  const m = (v: number | null) => (e.podeVerMeta ? v : null);
  const at = (l: DrePecLida | null) => l?.producao.at_produzida ?? null;
  const custo = (l: DrePecLida | null) => porArrobaNum(l?.custo_variavel, l, 'custo_variavel');
  const margem = (l: DrePecLida | null) => porArrobaNum(l?.margem, l, 'margem');
  const DRE = 'DRE pecuária (fn_dre_pecuaria), jan → mês';
  return [
    { id: 'arrobas', rotulo: '@ produzidas no ano', valor: num(at(e.real), 0), unidade: '@',
      meta: m(variacao(at(e.real), at(e.meta))), anoAnt: variacao(at(e.real), at(e.anoAnt)), fonte: `${DRE}: producao.at_produzida` },
    { id: 'arrobaHa', rotulo: '@ por hectare', valor: num(arrobaPorHa(e.real), 2), unidade: '@/ha',
      meta: m(variacao(arrobaPorHa(e.real), arrobaPorHa(e.meta))), anoAnt: variacao(arrobaPorHa(e.real), arrobaPorHa(e.anoAnt)),
      fonte: `${DRE}: at_produzida ÷ producao.ha_medio (o "por hectare" da DRE)` },
    { id: 'gmd', rotulo: e.rotuloGmd ?? 'GMD', valor: num(e.gmd?.valor ?? null, 3), unidade: 'kg/dia',
      meta: m(e.gmd?.deltaMeta ?? null), anoAnt: e.gmd?.deltaAno ?? null, fonte: 'PC-100 (rebanho do Fechamento): GMD do mês (No mês) ou de jan → mês (No ano), deltaMeta e deltaAno' },
    { id: 'custoArroba', rotulo: 'Custo variável', valor: reais(custo(e.real)), unidade: '/@', menorMelhor: true,
      meta: m(variacao(custo(e.real), custo(e.meta))), anoAnt: variacao(custo(e.real), custo(e.anoAnt)),
      fonte: `${DRE}: custo_variavel ÷ @ produzida (a base do R$/@ da DRE)` },
    { id: 'margemArroba', rotulo: 'Margem', valor: reais(margem(e.real)), unidade: '/@',
      meta: m(variacao(margem(e.real), margem(e.meta))), anoAnt: variacao(margem(e.real), margem(e.anoAnt)),
      fonte: `${DRE}: margem ÷ @ produzida (a base do R$/@ da DRE)` },
  ];
}

export function indicadoresAgricultura(e: {
  dre: DreLavouraLida | null; dreAnt: DreLavouraLida | null;
  areaPlantada: number | null; areaPlantadaAnt: number | null;
  colhido: { cultura: string; v: number }[];
}): IndicadorAtividade[] {
  /* a produtividade é por cultura (saca e tonelada não se somam): com uma cultura só, o número; com mais, um por cultura, sem comparação */
  const prod = (d: DreLavouraLida | null) => (d?.culturas ?? []).filter((c) => c.producao > 0);
  const atual = prod(e.dre);
  const ant = prod(e.dreAnt);
  const uma = atual.length === 1 ? atual[0] : null;
  const antDaMesma = uma ? ant.find((c) => c.cultura === uma.cultura) ?? null : null;
  const valorProd = atual.length === 0 ? null : uma ? formatNum(uma.produtividade, 1)
    : atual.map((c) => `${formatNum(c.produtividade, 1)} ${simboloDaUnidade(c.cultura)}/ha`).join(' · ');
  const unidadeProd = uma ? `${simboloDaUnidade(uma.cultura)}/ha` : undefined;
  const porHa = (d: DreLavouraLida | null, k: 'custo_variavel' | 'margem_contribuicao') => d?.total.linhas[k].por_ha ?? null;
  const colhido = e.colhido.filter((c) => c.v > 0);
  const DRE = 'DRE agrícola (fn_dre_lavoura) da safra do mês; ano anterior = a safra anterior';
  return [
    { id: 'produtividade', rotulo: 'Produtividade', valor: valorProd, unidade: unidadeProd, meta: null,
      anoAnt: uma && antDaMesma ? variacao(uma.produtividade, antDaMesma.produtividade) : null, fonte: `${DRE}: culturas[].produtividade` },
    { id: 'areaPlantada', rotulo: 'Área plantada', valor: num(e.areaPlantada, 0), unidade: 'ha', meta: null,
      anoAnt: variacao(e.areaPlantada, e.areaPlantadaAnt), fonte: 'Área plantada (talhões da safra, agri_safra_area); ano anterior = a safra anterior' },
    { id: 'colhido', rotulo: 'Colhido', valor: colhido.length === 1 ? formatNum(colhido[0].v, 0) : colhido.length ? colhido.map((c) => `${formatNum(c.v, 0)} ${simboloDaUnidade(c.cultura)}`).join(' · ') : null,
      unidade: colhido.length === 1 ? simboloDaUnidade(colhido[0].cultura) : undefined,
      meta: null, anoAnt: null, fonte: 'Estoque de grãos (fn_estoque_graos_resumo): colhido por cultura' },
    { id: 'custoHa', rotulo: 'Custo variável', valor: reais(porHa(e.dre, 'custo_variavel')), unidade: '/ha', menorMelhor: true, meta: null,
      anoAnt: variacao(porHa(e.dre, 'custo_variavel'), porHa(e.dreAnt, 'custo_variavel')), fonte: `${DRE}: total.custo_variavel.por_ha` },
    { id: 'margemHa', rotulo: 'Margem', valor: reais(porHa(e.dre, 'margem_contribuicao')), unidade: '/ha', meta: null,
      anoAnt: variacao(porHa(e.dre, 'margem_contribuicao'), porHa(e.dreAnt, 'margem_contribuicao')), fonte: `${DRE}: total.margem_contribuicao.por_ha` },
  ];
}

export function indicadoresSilvicultura(ha: number | null): IndicadorAtividade[] {
  return [{ id: 'area', rotulo: 'Área', valor: num(ha, 0), unidade: 'ha', meta: null, anoAnt: null,
    fonte: 'Foto de área do mês (fechamento_area_snapshot): area_silvicultura_ha' }];
}

/**
 * VG-RESULTADO-RS-01 (Gabriel 05/11/2026, do bilhete do Code 5) — o % sobre um PREJUÍZO confunde ("R$ −300,5K · ▲ 68,2% meta"): com o valor
 * ou a meta ≤ 0, a comparação com a meta é a DIFERENÇA em R$ ("+R$ 645 mil vs meta"). Valor e meta positivos: null (segue o %).
 */
export function diferencaEmReais(valor: number | null | undefined, meta: number | null | undefined): number | null {
  if (valor == null || meta == null || !Number.isFinite(valor) || !Number.isFinite(meta)) return null;
  return valor <= 0 || meta <= 0 ? valor - meta : null;
}
/** "R$ 645 mil", "R$ 1,2 mi", "R$ 950" — o tamanho, sem sinal (o sinal vai na frente do "R$") */
export function reaisCurtos(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${formatNum(a / 1e6, 1)} mi`;
  if (a >= 1e3) return `R$ ${formatNum(a / 1e3, 0)} mil`;
  return `R$ ${formatNum(a, 0)}`;
}

/** A linha pequena embaixo do valor: os pedaços que existem, cada um com a seta do sentido e a cor do bom/ruim. `metaEmReais` e
 *  `anoAntEmReais` (a diferença em R$ do Resultado com valor ou base ≤ 0; Gabriel 05/11 08:22: "mesma regra" no ano ant.) tomam o lugar
 *  do % da meta e do ano anterior. */
export function comparacoes(i: Pick<IndicadorAtividade, 'meta' | 'anoAnt' | 'menorMelhor'> & { metaEmReais?: number | null; anoAntEmReais?: number | null }): { texto: string; bom: boolean }[] {
  const pedaco = (v: number | null, onde: string) => {
    if (v == null) return [];
    const subiu = v >= 0;
    return [{ texto: `${subiu ? '▲' : '▼'} ${formatNum(Math.abs(v), 1)}% ${onde}`, bom: i.menorMelhor ? !subiu : subiu }];
  };
  const emReais = (d: number, onde: string) => [{ texto: `${d >= 0 ? '+' : '−'}${reaisCurtos(d)} vs ${onde}`, bom: i.menorMelhor ? d <= 0 : d >= 0 }];
  const daMeta = i.metaEmReais == null ? pedaco(i.meta, 'meta') : emReais(i.metaEmReais, 'meta');
  const doAnoAnt = i.anoAntEmReais == null ? pedaco(i.anoAnt, 'ano ant.') : emReais(i.anoAntEmReais, 'ano ant.');
  return [...daMeta, ...doAnoAnt];
}

/** Só os indicadores com dado (nunca "em breve") */
export const comDado = (lista: readonly IndicadorAtividade[]) => lista.filter((i) => i.valor != null);
