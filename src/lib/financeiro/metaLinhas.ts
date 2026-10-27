/**
 * P109 (FIN-META-01) — a META tem UM dono no banco: `fn_meta_linhas(cliente, ano, regime)`. Este módulo só LÊ as linhas que ela
 * devolve e as entrega no formato que as telas já consomem (subcentro → 12 meses). NÃO há cálculo de meta aqui: nutrição, frete,
 * comercial, receita/reposição do rebanho, adiantamento de boitel, parcelas de financiamento e consórcio e projetos vêm prontos do
 * banco (nunca um lançamento META gravado no financeiro — P120). Quem voltar a calcular meta no front recria a meta paralela que o P109 matou (o teste
 * `metaLinhas.test.ts` derruba isso).
 *
 * O casamento é pela CONTA DO PLANO (`plano_conta_id` → subcentro), nunca pelo texto digitado.
 */

export type RegimeMeta = 'caixa' | 'competencia';

export interface MetaLinha {
  fazenda_id: string | null;
  plano_conta_id: string | null;
  mes: number;
  valor: number;
  origem: string;
  origem_detalhe: string;
  origem_id: string | null;
}

/** Os quatro mapas auto que as telas de meta já somam ao digitado (subcentro → Jan..Dez). */
export interface MapasDaMeta {
  rebanho: Map<string, number[]>;
  financiamento: Map<string, number[]>;
  nutricao: Map<string, number[]>;
  projetos: Map<string, number[]>;
}

/** O rótulo do regime, para o espaço reservado de cada tela. */
export const ROTULO_REGIME: Record<RegimeMeta, string> = {
  caixa: 'Meta em regime de caixa',
  competencia: 'Meta em regime de competência',
};

/** O PC-100 mostra os dois (achado c): as linhas de DRE em competência e as de caixa em caixa. */
export const ROTULO_REGIME_PC100 = 'Meta: DRE em competência · caixa em regime de caixa';

const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** As linhas da RPC, conferidas campo a campo (sem cast); linha sem mês ou valor válido é recusada, nunca vira zero. */
export function lerMetaLinhas(rows: unknown): MetaLinha[] {
  if (!Array.isArray(rows)) return [];
  const out: MetaLinha[] = [];
  for (const r of rows) {
    if (typeof r !== 'object' || r === null) continue;
    const mes = numero('mes' in r ? r.mes : null);
    const valor = numero('valor' in r ? r.valor : null);
    const origem = texto('origem' in r ? r.origem : null);
    if (mes === null || mes < 1 || mes > 12 || valor === null || origem === null) continue;
    out.push({
      fazenda_id: texto('fazenda_id' in r ? r.fazenda_id : null),
      plano_conta_id: texto('plano_conta_id' in r ? r.plano_conta_id : null),
      mes,
      valor,
      origem,
      origem_detalhe: texto('origem_detalhe' in r ? r.origem_detalhe : null) ?? '',
      origem_id: texto('origem_id' in r ? r.origem_id : null),
    });
  }
  return out;
}

/** Em que mapa auto a linha entra (o digitado do planejamento não entra: a tela o lê como ajuste editável). */
export function mapaDaOrigem(l: Pick<MetaLinha, 'origem' | 'origem_detalhe'>): keyof MapasDaMeta | null {
  if (l.origem === 'digitada') return l.origem_detalhe.startsWith('projeto de investimento') ? 'projetos' : null;
  if (l.origem === 'calculada:financiamento') return 'financiamento';
  if (l.origem === 'calculada:receita' || l.origem === 'calculada:reposicao') return 'rebanho';
  /* P109/P120: o 'espelho' (lancamento META gravado no financeiro) nao existe mais — a deducao da meta e' so' a calculada (comercial) */
  if (l.origem === 'calculada:nutricao' || l.origem === 'calculada:comercial' || l.origem === 'calculada:frete') return 'nutricao';
  return null;
}

/**
 * Os mapas auto de uma fazenda (ou de todas, com `fazendaId` nulo), no subcentro da conta do plano. Linha cuja conta não está no
 * plano carregado fica de fora e é devolvida em `semConta` (nunca some calada).
 */
export function mapasDaMeta(linhas: MetaLinha[], subcentroDaConta: Map<string, string>, fazendaId: string | null): MapasDaMeta & { semConta: MetaLinha[] } {
  const mapas: MapasDaMeta = { rebanho: new Map(), financiamento: new Map(), nutricao: new Map(), projetos: new Map() };
  const semConta: MetaLinha[] = [];
  for (const l of linhas) {
    if (fazendaId && l.fazenda_id !== fazendaId) continue;
    const alvo = mapaDaOrigem(l);
    if (!alvo) continue;
    const sub = l.plano_conta_id ? subcentroDaConta.get(l.plano_conta_id) : undefined;
    if (!sub) { semConta.push(l); continue; }
    const m = mapas[alvo];
    if (!m.has(sub)) m.set(sub, new Array(12).fill(0));
    m.get(sub)![l.mes - 1] += Math.abs(l.valor);
  }
  for (const m of Object.values(mapas)) {
    for (const [, arr] of m) for (let i = 0; i < 12; i++) arr[i] = Math.round(arr[i] * 100) / 100;
  }
  return { ...mapas, semConta };
}

/**
 * A REGRA ÚNICA DE JUNTAR (P109, achado b): no mesmo subcentro e mês, TUDO SOMA — o auto de todas as origens + o digitado (ajuste). É
 * a regra do DRE (UNION ALL) e a que o `composeGridMetaConsolidado` e a prioridade própria do PC-100 aplicavam por listas de NOMES
 * de subcentro; as listas morreram com elas. Sem nenhum auto no subcentro: `null` (a linha é só digitada).
 */
export function autoDoSubcentro(sub: string, mapas: MapasDaMeta): number[] | null {
  let soma: number[] | null = null;
  for (const m of [mapas.rebanho, mapas.financiamento, mapas.nutricao, mapas.projetos]) {
    const arr = m.get(sub);
    if (!arr) continue;
    if (!soma) soma = new Array(12).fill(0);
    for (let i = 0; i < 12; i++) soma[i] = Math.round((soma[i] + (arr[i] || 0)) * 100) / 100;
  }
  return soma;
}

/**
 * O grid de meta consolidado (auto + digitado por subcentro/mês) que toda tela de meta consome. Subcentro com auto que não está no
 * grid (conta fora do plano semeado) entra por `orfao`, para o valor nunca ficar sem linha.
 */
export function gridMetaConsolidado<G extends { subcentro: string; meses: number[] }>(
  grid: G[], mapas: MapasDaMeta, orfao: (sub: string, meses: number[]) => G,
): G[] {
  const vistos = new Set<string>();
  const out: G[] = grid.map((g) => {
    vistos.add(g.subcentro);
    const auto = autoDoSubcentro(g.subcentro, mapas);
    return { ...g, meses: auto ? g.meses.map((v, i) => (v || 0) + auto[i]) : [...g.meses] };
  });
  for (const m of [mapas.rebanho, mapas.financiamento, mapas.nutricao, mapas.projetos]) {
    for (const sub of m.keys()) {
      if (vistos.has(sub)) continue;
      vistos.add(sub);
      const auto = autoDoSubcentro(sub, mapas);
      if (auto) out.push(orfao(sub, auto));
    }
  }
  return out;
}
