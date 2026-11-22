/**
 * A LEITURA DO DRE DA PECUÁRIA — DRE-PAINEL-01 + DRE-MENSAL-01, PR-A (briefing de 19/11, FASES 0 aprovadas).
 *
 * UM MÓDULO SÓ PARA AS DUAS TELAS (o painel do DRE e o DRE mês a mês): "O que mudou", a média de N
 * chamadas, o desvio-padrão e o contorno, a ponte do lucro operacional, a leitura do mês e do ano, o selo
 * de confiança (P9) e as razões por @ e por hectare. Puro: entra coluna da `fn_dre_pecuaria`, sai número
 * e frase. Nada aqui chama o banco nem a tela.
 *
 * ⚠ NENHUM NÚMERO NOVO NASCE AQUI. Tudo é Δ, ÷ha, ÷@, média de chamadas, limiar e ordem sobre o que a
 *   RPC devolveu (ENCAIXE (c)). O Acumulado do mês a mês é a chamada do PERÍODO, nunca a soma dos meses
 *   — por isso não há função de somar meses neste arquivo.
 * ⚠ AUSÊNCIA É TRAÇO, NUNCA ZERO (Art. 19, item 8): toda conta com um termo `null` devolve `null`, e
 *   nenhuma regra dispara sobre `null` — a Meta sem Variação por produção, juros por fazenda, mês futuro.
 * ⚠ MESMOS FATOS, MESMA RESPOSTA (Art. 5º): as frases saem de modelos fixos com números; empate de
 *   efeito se desempata pela ordem fixa dos candidatos, nunca pela ordem de chegada.
 */
import { formatNum } from '@/lib/calculos/formatters';
import { indicadoresDoAno, razao, variacaoNoAno } from '@/components/agri/pecLeituraAnos';
import { type CentroPec, type ChaveLinhaPec, type DrePecLinhas, type RateioGrupoPec } from '@/hooks/useDrePecuaria';

/* ══════════════ LIMIARES (aprovados no briefing; um lugar só) ══════════════ */

/** "O que mudou": a sublinha abre com |Δ| ≥ 20% E ≥ R$ 10 mil contra a comparação ativa. */
export const LIMIAR_PCT = 0.2;
export const LIMIAR_RS = 10_000;
/** Contorno laranja do mês a mês: ≥ 2 desvios-padrão E ≥ 60% da média dos OUTROS meses E o mínimo. */
export const CONTORNO_DESVIOS = 2;
export const CONTORNO_PCT = 0.6;
export const CONTORNO_MIN_LINHA = 150_000;
export const CONTORNO_MIN_SUBLINHA = 60_000;
export const TOP_LEITURA_MES = 5;
export const TOP_LEITURA_ANO = 6;
/** A Média 12 meses é a média de 12 chamadas mensais (D1 a): os 12 meses ANTES do mês lido. */
export const MESES_DA_MEDIA = 12;

/* Comparar em centavos: 0,1 + 0,2 não pode decidir se uma linha abre. */
const cent = (v: number) => Math.round(v * 100);
const EPS = 1e-9;

export type Comparacao = 'ano_anterior' | 'meta' | 'media12';

/* ══════════════ DESVIO E "O QUE MUDOU" ══════════════ */

export interface Desvio {
  /** atual − base. `null` se um dos dois é ausência. */
  delta: number | null;
  /** Δ ÷ |base|. `null` também com base zero (não há percentual de nada). */
  pct: number | null;
  comDesvio: boolean;
}

/**
 * ⚠ BASE ZERO COM |Δ| ≥ R$ 10 mil É DESVIO: a linha que nasceu no mês (Vera out/25 sem vendas, out/26
 * com R$ 220 mil) é a primeira que o operador precisa ver, e o "%" dela é "—", não infinito.
 */
export function desvio(base: number | null | undefined, atual: number | null | undefined): Desvio {
  if (base == null || atual == null) return { delta: null, pct: null, comDesvio: false };
  const delta = atual - base;
  const pct = variacaoNoAno(atual, base);
  const passaRs = Math.abs(cent(delta)) >= cent(LIMIAR_RS);
  const passaPct = pct == null ? true : Math.abs(pct) >= LIMIAR_PCT - EPS;
  return { delta, pct, comDesvio: passaRs && passaPct };
}

export interface SublinhaComDesvio {
  centro: string;
  base: number;
  atual: number;
  delta: number;
  pct: number | null;
}

export interface GrupoOQueMudou {
  /** Na ordem dos centros da coluna do mês (a ordem da grade); os que só existem na base, depois. */
  comDesvio: SublinhaComDesvio[];
  /** "+ N itens sem desvio", com a soma das duas colunas. `null` quando não sobra nenhum. */
  semDesvio: { n: number; base: number; atual: number } | null;
}

const centrosDe = (l: DrePecLinhas, bloco: string): readonly CentroPec[] =>
  (bloco === 'juros' ? l.centros_juros : l.centros.filter(c => c.bloco === bloco));

/**
 * AS SUBLINHAS DE UM GRUPO NO MODO "O QUE MUDOU".
 *
 * ⚠ CENTRO QUE FALTA NUMA COLUNA VALE ZERO, e aqui zero é dado: a RPC só lista centro com lançamento.
 * ⚠ SEM COMPARAÇÃO (`base` nula) NADA TEM DESVIO: tudo vai para "+ N itens", e a soma bate com a linha.
 * ⚠ A SOMA DAS ABERTAS + A DO "+ N" É A LINHA DO GRUPO, ao centavo — o teste prova contra a grade.
 */
export function oQueMudou(base: DrePecLinhas | null, atual: DrePecLinhas, bloco: string): GrupoOQueMudou {
  const nomes: string[] = [];
  const vAtual = new Map<string, number>();
  const vBase = new Map<string, number>();
  for (const c of centrosDe(atual, bloco)) {
    if (!vAtual.has(c.centro)) nomes.push(c.centro);
    vAtual.set(c.centro, (vAtual.get(c.centro) ?? 0) + c.valor);
  }
  for (const c of base ? centrosDe(base, bloco) : []) {
    if (!vAtual.has(c.centro) && !vBase.has(c.centro)) nomes.push(c.centro);
    vBase.set(c.centro, (vBase.get(c.centro) ?? 0) + c.valor);
  }
  const comDesvio: SublinhaComDesvio[] = [];
  let n = 0, somaBase = 0, somaAtual = 0;
  for (const centro of nomes) {
    const a = vAtual.get(centro) ?? 0;
    const b = vBase.get(centro) ?? 0;
    const d = base ? desvio(b, a) : null;
    if (d && d.comDesvio && d.delta != null) comDesvio.push({ centro, base: b, atual: a, delta: d.delta, pct: d.pct });
    else { n += 1; somaBase += b; somaAtual += a; }
  }
  return {
    comDesvio,
    semDesvio: n === 0 ? null : { n, base: cent(somaBase) / 100, atual: cent(somaAtual) / 100 },
  };
}

/* ══════════════ MÉDIA, DESVIO-PADRÃO E CONTORNO ══════════════ */

/** ⚠ UM TERMO AUSENTE FAZ A MÉDIA AUSENTE — o N do cabeçalho ("Média/mês (10)") tem de ser o N de toda linha. */
export function media(valores: readonly (number | null | undefined)[]): { valor: number | null; n: number } {
  const n = valores.length;
  if (n === 0) return { valor: null, n };
  let s = 0;
  for (const v of valores) {
    if (v == null) return { valor: null, n };
    s += v;
  }
  return { valor: s / n, n };
}

/** Desvio-padrão POPULACIONAL (÷ N): os meses lidos são o conjunto inteiro, não amostra de outro. */
export function desvioPadrao(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const m = valores.reduce((s, v) => s + v, 0) / valores.length;
  return Math.sqrt(valores.reduce((s, v) => s + (v - m) ** 2, 0) / valores.length);
}

export interface Contorno {
  foraDoPadrao: boolean;
  /** A média dos OUTROS meses — o número que a leitura cita. */
  mediaOutros: number | null;
  desvio: number | null;
}

/**
 * A CÉLULA `i` FOGE DOS OUTROS MESES? |x − média dos outros| ≥ 2 desvios-padrão E ≥ 60% E ≥ o mínimo
 * (R$ 150 mil na linha, R$ 60 mil na sublinha).
 * ⚠ OS OUTROS, NÃO TODOS: com o próprio mês dentro da média, o mês fora do padrão puxa a média para
 *   si e esconde o próprio desvio. ⚠ Menos de 2 outros meses, ou um "—" na conta: não dispara.
 */
export function contorno(valores: readonly (number | null | undefined)[], i: number, minimo: number): Contorno {
  const x = valores[i];
  const outros: number[] = [];
  for (let k = 0; k < valores.length; k += 1) {
    if (k === i) continue;
    const v = valores[k];
    if (v == null) return { foraDoPadrao: false, mediaOutros: null, desvio: null };
    outros.push(v);
  }
  if (x == null || outros.length < 2) return { foraDoPadrao: false, mediaOutros: null, desvio: null };
  const m = outros.reduce((s, v) => s + v, 0) / outros.length;
  const sd = desvioPadrao(outros) ?? 0;
  const d = Math.abs(x - m);
  const fora = d >= CONTORNO_DESVIOS * sd - EPS && d >= CONTORNO_PCT * Math.abs(m) - EPS && cent(d) >= cent(minimo);
  return { foraDoPadrao: fora, mediaOutros: m, desvio: x - m };
}

/** Os 12 meses que entram na "Média 12 meses" de um mês 'AAAA-MM' — do mais antigo ao mais recente. */
export function mesesDaMedia12(anoMes: string): string[] {
  const saida: string[] = [];
  for (let k = MESES_DA_MEDIA; k >= 1; k -= 1) saida.push(mesesAntes(anoMes, k));
  return saida;
}

/** 'AAAA-MM' recuado k MESES. ⚠ Não é o `anoMesAntes` do hook, que recua k ANOS (a coluna "Ano anterior"). */
export function mesesAntes(anoMes: string, k: number): string {
  const total = Number(anoMes.slice(0, 4)) * 12 + Number(anoMes.slice(5, 7)) - 1 - k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * A COLUNA "MÉDIA" DE N CHAMADAS MENSAIS (D1 a): cada linha ÷ N, centros e grupos do rateio também.
 *
 * ⚠ LINHA QUE PODE SER "—" E É "—" EM QUALQUER MÊS FICA "—" NA MÉDIA (`media`): a ponte só fecha se
 *   as seis parcelas e o lucro operacional saírem dos MESMOS N meses.
 * ⚠ AS FONTES DO PATRIMÔNIO E O "FORA DO DRE" NÃO SE MEDEIAM: saem `null` ("—"); são do mês, não da média.
 */
/** A @ (ou cabeça) vendida do mês: a da RPC; nula com vendas = 0, zero (D-B3). */
const vendidoOuZero = (l: DrePecLinhas, v: number | null | undefined): number | null | undefined => (v == null && l.vendas === 0 ? 0 : v);

export function colunaMedia(colunas: readonly DrePecLinhas[]): { linhas: DrePecLinhas; n: number } | null {
  const n = colunas.length;
  if (n === 0) return null;
  const m = (f: (l: DrePecLinhas) => number) => colunas.reduce((s, l) => s + f(l), 0) / n;
  const mn = (f: (l: DrePecLinhas) => number | null | undefined) => media(colunas.map(f)).valor;
  const centros = (f: (l: DrePecLinhas) => readonly CentroPec[]): CentroPec[] => {
    const ordem: string[] = [];
    const soma = new Map<string, { bloco: string; centro: string; valor: number; a_pagar: number }>();
    for (const l of colunas) for (const c of f(l)) {
      const k = `${c.bloco}\u0000${c.centro}`;
      const atual = soma.get(k);
      if (atual) { atual.valor += c.valor; atual.a_pagar += c.a_pagar; } else {
        ordem.push(k);
        soma.set(k, { bloco: c.bloco, centro: c.centro, valor: c.valor, a_pagar: c.a_pagar });
      }
    }
    return ordem.flatMap(k => {
      const c = soma.get(k);
      return c ? [{ bloco: c.bloco, centro: c.centro, valor: c.valor / n, a_pagar: c.a_pagar / n }] : [];
    });
  };
  const grupos: RateioGrupoPec[] = [];
  const somaGrupo = new Map<string, number>();
  for (const l of colunas) for (const g of l.rateio_adm_grupos ?? []) {
    if (!somaGrupo.has(g.grupo)) grupos.push({ grupo: g.grupo, valor: 0 });
    somaGrupo.set(g.grupo, (somaGrupo.get(g.grupo) ?? 0) + g.valor);
  }
  return {
    n,
    linhas: {
      vendas: m(l => l.vendas), outras_receitas: m(l => l.outras_receitas), receita_bruta: m(l => l.receita_bruta),
      deducoes: m(l => l.deducoes), receita_liquida: m(l => l.receita_liquida),
      vpb_operacional: mn(l => l.vpb_operacional), reposicao: m(l => l.reposicao), vbp: mn(l => l.vbp),
      custo_variavel: m(l => l.custo_variavel), margem: mn(l => l.margem), custo_fixo: m(l => l.custo_fixo),
      rateio_adm: m(l => l.rateio_adm),
      rateio_adm_grupos: grupos.map(g => ({ grupo: g.grupo, valor: (somaGrupo.get(g.grupo) ?? 0) / n })),
      resultado_operacional: mn(l => l.resultado_operacional), juros: mn(l => l.juros),
      resultado_periodo: mn(l => l.resultado_periodo), efeito_mercado: mn(l => l.efeito_mercado),
      resultado_com_mercado: mn(l => l.resultado_com_mercado), investimento: m(l => l.investimento),
      lucro_liquido: mn(l => l.lucro_liquido), juros_proprio: m(l => l.juros_proprio),
      juros_rateado: m(l => l.juros_rateado), a_pagar: m(l => l.a_pagar),
      patrimonio: {
        v_ini_p0: m(l => l.patrimonio.v_ini_p0), v_fim_p0: m(l => l.patrimonio.v_fim_p0),
        v_fim_p1: m(l => l.patrimonio.v_fim_p1), cab_ini: m(l => l.patrimonio.cab_ini),
        cab_fim: m(l => l.patrimonio.cab_fim), cab_media: m(l => l.patrimonio.cab_media),
      },
      producao: {
        ha_medio: mn(l => l.producao.ha_medio), at_produzida: mn(l => l.producao.at_produzida),
        at_desfrutada: mn(l => l.producao.at_desfrutada), cab_desfrutada: mn(l => l.producao.cab_desfrutada),
        at_comprada: mn(l => l.producao.at_comprada), cab_comprada: mn(l => l.producao.cab_comprada),
        /* D-B3 (Gabriel 21/11): mês SEM VENDA (vendas = 0) vem da RPC com a @ vendida nula — é zero vendido, não dado ausente; só a
           @ nula COM venda continua derrubando a média estrita para "—" */
        at_vendida: mn(l => vendidoOuZero(l, l.producao.at_vendida)), cab_vendida: mn(l => vendidoOuZero(l, l.producao.cab_vendida)),
      },
      p0_fonte: null, p1_fonte: null,
      centros: centros(l => l.centros), centros_juros: centros(l => l.centros_juros),
      fora_do_dre: null,
    },
  };
}

/* ══════════════ A PONTE DO LUCRO OPERACIONAL ══════════════ */

export type ChaveDegrau = 'receita_liquida' | 'vpb_operacional' | 'reposicao' | 'custo_variavel' | 'custo_fixo' | 'rateio_adm';

/**
 * ⚠ A ORDEM E OS SINAIS SÃO OS DA CASCATA DA RPC: lucro operacional = receita líquida + variação por
 *   produção − reposição − custo variável − custo fixo − rateio. O teste prova a identidade em todo
 *   recorte do fixture, ao centavo.
 */
export const DEGRAUS: ReadonlyArray<{ chave: ChaveDegrau; rotulo: string; sinal: 1 | -1 }> = [
  { chave: 'receita_liquida', rotulo: 'Receita', sinal: 1 },
  { chave: 'vpb_operacional', rotulo: 'Var. produção', sinal: 1 },
  { chave: 'reposicao', rotulo: 'Reposição', sinal: -1 },
  { chave: 'custo_variavel', rotulo: 'C. variável', sinal: -1 },
  { chave: 'custo_fixo', rotulo: 'C. fixo', sinal: -1 },
  { chave: 'rateio_adm', rotulo: 'Rateio', sinal: -1 },
];

export interface DegrauPonte {
  chave: ChaveDegrau;
  rotulo: string;
  /** Efeito no lucro operacional, em R$ (centavos exatos). `null` = "—" (a Meta sem Variação por produção). */
  efeito: number | null;
}

export interface Ponte {
  inicio: number;
  fim: number;
  degraus: DegrauPonte[];
  /** Os degraus somam fim − início ao centavo. */
  fecha: boolean;
  /**
   * O que os degraus conhecidos NÃO explicam: 0 quando fecha; com um degrau "—" (D2, Meta), é o degrau
   * "sem meta" — a tela decide como mostrá-lo, nunca como zero nem como Variação por produção.
   */
  semExplicacao: number;
}

/**
 * DA COMPARAÇÃO AO MÊS PELOS SEIS Δ.
 *
 * ⚠ O ARREDONDAMENTO NÃO PODE ABRIR A PONTE: cada degrau vai a centavos, e o resto (no máximo meio
 *   centavo por degrau — os valores de 3 casas da Vera, VALOR-3-CASAS) vai para o MAIOR degrau, a mesma
 *   regra do resíduo do rateio na RPC. Resto maior que isso não é arredondamento: `fecha` = false.
 * ⚠ SEM LUCRO OPERACIONAL NUMA DAS PONTAS NÃO HÁ PONTE (`null`): não se inventa o início.
 */
export function ponteDoLucroOperacional(base: DrePecLinhas | null, atual: DrePecLinhas | null): Ponte | null {
  if (!base || !atual || base.resultado_operacional == null || atual.resultado_operacional == null) return null;
  const inicio = cent(base.resultado_operacional);
  const fim = cent(atual.resultado_operacional);
  const efeitos = DEGRAUS.map(d => {
    const b = valorDaChave(base, d.chave);
    const a = valorDaChave(atual, d.chave);
    return b == null || a == null ? null : cent(d.sinal * (a - b));
  });
  const conhecidos = efeitos.filter((e): e is number => e != null);
  const resto = fim - inicio - conhecidos.reduce((s, e) => s + e, 0);
  const todos = conhecidos.length === efeitos.length;
  let fecha = false;
  let semExplicacao = resto;
  if (todos && Math.abs(resto) <= DEGRAUS.length) {
    let maior = 0;
    efeitos.forEach((e, k) => { if (e != null && Math.abs(e) > Math.abs(efeitos[maior] ?? 0)) maior = k; });
    const e = efeitos[maior];
    if (e != null) efeitos[maior] = e + resto;
    fecha = true;
    semExplicacao = 0;
  }
  return {
    inicio: inicio / 100, fim: fim / 100, fecha, semExplicacao: semExplicacao / 100 + 0,
    degraus: DEGRAUS.map((d, k) => {
      const e = efeitos[k];
      return { chave: d.chave, rotulo: d.rotulo, efeito: e == null ? null : e / 100 + 0 }; // + 0: nunca −0
    }),
  };
}

function valorDaChave(l: DrePecLinhas, c: ChaveDegrau): number | null {
  switch (c) {
    case 'receita_liquida': return l.receita_liquida;
    case 'vpb_operacional': return l.vpb_operacional;
    case 'reposicao': return l.reposicao;
    case 'custo_variavel': return l.custo_variavel;
    case 'custo_fixo': return l.custo_fixo;
    case 'rateio_adm': return l.rateio_adm;
  }
}

/* ══════════════ RAZÕES (presentation: ÷ha, ÷@) ══════════════ */

/** R$/@ das vendas = vendas ÷ @ vendidas (sem consumo, `at_vendida` do lote 115610). Sem @, "—". */
export const rsPorArrobaVendida = (l: DrePecLinhas | null): number | null => {
  const at = l?.producao.at_vendida;
  return at != null && at > 0 ? razao(l?.vendas, at) : null;
};

/** Custo total (c/ rateio, sem juros) — o custeio do Resumido, lido de `indicadoresDoAno`. */
export const custoTotal = (l: DrePecLinhas | null): number | null => indicadoresDoAno(l).custeio;

/** Custo por @ produzida (Art. 15) — o mesmo `custoAt` da Leitura dos anos. Meta sem @ produzida: "—". */
export const custoPorArrobaProduzida = (l: DrePecLinhas | null): number | null => indicadoresDoAno(l).custoAt;

const porHa = (v: number | null | undefined, l: DrePecLinhas | null): number | null => {
  const ha = l?.producao.ha_medio;
  return v == null || ha == null || !(ha > 0) ? null : v / ha;
};

export interface IndicadorNoMes { valor: number | null; delta: number | null }
export interface NoMes { lucroOpHa: IndicadorNoMes; resEconHa: IndicadorNoMes; custoTotalHa: IndicadorNoMes }

/** O bloco "No mês" do painel: cada um ÷ a área DA PRÓPRIA coluna, e o Δ/ha é a diferença dos dois por ha. */
export function noMes(base: DrePecLinhas | null, atual: DrePecLinhas): NoMes {
  const par = (f: (l: DrePecLinhas) => number | null): IndicadorNoMes => {
    const a = porHa(f(atual), atual);
    const b = base ? porHa(f(base), base) : null;
    return { valor: a, delta: a == null || b == null ? null : a - b };
  };
  return {
    lucroOpHa: par(l => l.resultado_operacional),
    resEconHa: par(l => l.resultado_com_mercado),
    custoTotalHa: par(l => custoTotal(l)),
  };
}

/** Composição e mercado do mês (D3): pela fonte, (v_fim_p0 − v_ini_p0) ÷ v_ini_p0 e (v_fim_p1 − v_fim_p0) ÷ v_fim_p0. */
export function composicaoEMercado(l: DrePecLinhas): { composicao: number | null; mercado: number | null } {
  const p = l.patrimonio;
  return {
    composicao: p.v_ini_p0 > 0 ? (p.v_fim_p0 - p.v_ini_p0) / p.v_ini_p0 : null,
    mercado: p.v_fim_p0 > 0 ? (p.v_fim_p1 - p.v_fim_p0) / p.v_fim_p0 : null,
  };
}

/* ══════════════ FORMATO DAS FRASES (modelos fixos) ══════════════ */

const MENOS = '−';
const sinal = (v: number) => (v < 0 ? MENOS : '+');

/** "1,16 mi" · "450 mil" · "980" — o valor absoluto, sem "R$" e sem sinal. */
export function curto(v: number): string {
  const a = Math.abs(v);
  if (a >= 999_995) return `${formatNum(a / 1_000_000, 2)} mi`;
  if (a >= 999.5) return `${formatNum(a / 1000, 0)} mil`;
  return formatNum(a, 0);
}
/** "R$ 450 mil" (absoluto) e "R$ −450 mil" (com sinal só quando negativo). */
export const rsCurto = (v: number) => `R$ ${v < 0 ? MENOS : ''}${curto(v)}`;
/** "−284 mil" / "+37 mil" — a variação de uma sublinha. */
export const deltaCurto = (v: number) => `${sinal(v)}${curto(v)}`;
/** "25%" · "23,5%" — sem o ",0". */
export function pctCurto(p: number): string {
  const t = formatNum(Math.abs(p) * 100, 1);
  return `${t.endsWith(',0') ? t.slice(0, -2) : t}%`;
}
const pctComSinal = (p: number | null) => (p == null ? '—' : `${p < 0 ? MENOS : '+'}${pctCurto(p)}`);
const arrobas = (v: number | null | undefined) => (v == null ? '—' : `${formatNum(v, 0)} @`);
const rsArroba = (v: number | null) => (v == null ? 'R$ —/@' : `R$ ${formatNum(v, 2)}/@`);

/* ══════════════ LEITURA DO MÊS (o painel) ══════════════ */

export type DestinoLeitura =
  | { tipo: 'valor_rebanho' }
  | { tipo: 'notas_a_lancar' }
  | { tipo: 'abates' }
  | { tipo: 'conciliacao' }
  | { tipo: 'linha_dre'; chave: ChaveLinhaPec; mes?: string };

export interface ItemLeitura {
  /** Chave estável (linha ou linha@mês) — a tela usa como `key` e o teste como identidade. */
  id: string;
  titulo: string;
  frase: string;
  /** Efeito no lucro operacional (R$). A ordem da leitura é por |efeito|. */
  efeito: number;
  /** "!" — sinal trocado ou zerado contra a comparação. */
  anomalia: boolean;
  destino: DestinoLeitura;
}

export interface EntradaLeituraDoMes {
  base: DrePecLinhas | null;
  atual: DrePecLinhas;
  comparacao: Comparacao;
  /** Como a base aparece na frase: "out/25", "a Meta", "a média de 12 meses". */
  rotuloBase: string;
  /** Notas da Receita em "A lançar" emitidas no mês (D5) — fonte própria, citada na frase. */
  notasALancar?: number | null;
}

/** ⚠ ANOMALIA só com |Δ| ≥ R$ 10 mil: um centavo que troca de sinal não é "!". */
function anomaliaDe(base: number, atual: number): 'zerado' | 'sinal' | null {
  if (Math.abs(cent(atual - base)) < cent(LIMIAR_RS)) return null;
  if (cent(atual) === 0 && cent(base) !== 0) return 'zerado';
  if (cent(atual) !== 0 && cent(base) !== 0 && Math.sign(atual) !== Math.sign(base)) return 'sinal';
  return null;
}

const maiorOuMenor = (delta: number, custo: boolean) =>
  (custo ? (delta > 0 ? 'maior' : 'menor') : (delta > 0 ? 'maiores' : 'menores'));

function topCentros(base: DrePecLinhas | null, atual: DrePecLinhas, bloco: string, k: number): string {
  const lista = oQueMudou(base, atual, bloco).comDesvio
    .slice().sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.centro.localeCompare(y.centro, 'pt-BR'))
    .slice(0, k)
    .map(c => `${c.centro} ${deltaCurto(c.delta)}`);
  if (lista.length === 0) return '';
  if (lista.length === 1) return `${lista[0]}.`;
  return `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}.`;
}

/**
 * AS CINCO QUE MAIS PESARAM NO LUCRO OPERACIONAL, cada uma com título, frase e o link que resolve.
 *
 * ⚠ ENTRA SÓ LINHA COM DESVIO (o limiar do "O que mudou") OU COM ANOMALIA; o "!" tem lugar garantido
 *   entre as cinco (é a que o operador precisa corrigir), e as vagas que sobram vão pelo |efeito|.
 * ⚠ CONTRA A META (D2): a Variação por produção e os juros ficam fora — a Meta não tem uma e zera a outra.
 * ⚠ "—" NÃO DISPARA: linha com um lado `null` não vira item.
 */
export function leituraDoMes(e: EntradaLeituraDoMes): ItemLeitura[] {
  const { base, atual, rotuloBase } = e;
  if (!base) return [];
  const contraMeta = e.comparacao === 'meta';
  const itens: ItemLeitura[] = [];

  /* Vendas — com as @ vendidas e o R$/@ (Art. 15), "—" quando a fonte não tem. */
  {
    const d = desvio(base.vendas, atual.vendas);
    const an = anomaliaDe(base.vendas, atual.vendas);
    if (d.delta != null && (d.comDesvio || an)) {
      const titulo = an === 'zerado' ? 'Vendas zeradas'
        : d.pct == null ? `Vendas ${deltaCurto(d.delta).replace(/^([+−])/, '$1R$ ')}`
          : `Vendas ${pctCurto(d.pct)} ${maiorOuMenor(d.delta, false)}`;
      const frase = `${rsCurto(atual.vendas)} contra ${rsCurto(base.vendas)} em ${rotuloBase}. `
        /* D-B3: o lado sem venda diz "sem venda", nunca "— a R$ —/@" */
        + (atual.vendas === 0 ? 'Nenhuma venda no mês' : `${arrobas(atual.producao.at_vendida)} vendidas a ${rsArroba(rsPorArrobaVendida(atual))}`)
        + (base.vendas === 0 ? `; ${rotuloBase} sem venda.` : `, contra ${arrobas(base.producao.at_vendida)} a ${rsArroba(rsPorArrobaVendida(base))}.`);
      itens.push({ id: 'vendas', titulo, frase, efeito: d.delta, anomalia: an != null, destino: { tipo: 'abates' } });
    }
  }

  /* Variação por produção — composição e mercado pela fonte (D3). Fora contra a Meta (D2). */
  if (!contraMeta && base.vpb_operacional != null && atual.vpb_operacional != null) {
    const d = desvio(base.vpb_operacional, atual.vpb_operacional);
    const an = anomaliaDe(base.vpb_operacional, atual.vpb_operacional);
    if (d.delta != null && (d.comDesvio || an)) {
      const cm = composicaoEMercado(atual);
      itens.push({
        id: 'vpb_operacional',
        titulo: `Variação por produção ${d.delta > 0 ? 'subiu' : 'caiu'} R$ ${curto(d.delta)}`,
        frase: `${rsCurto(atual.vpb_operacional)} contra ${rsCurto(base.vpb_operacional)} em ${rotuloBase}. `
          + `Composição ${pctComSinal(cm.composicao)} e mercado ${pctComSinal(cm.mercado)} no mês.`,
        efeito: d.delta, anomalia: an != null, destino: { tipo: 'valor_rebanho' },
      });
    }
  }

  /* Os custos: efeito no lucro = −Δ. */
  const custos: ReadonlyArray<{ chave: 'reposicao' | 'custo_variavel' | 'custo_fixo' | 'rateio_adm'; rotulo: string; bloco: string | null; k: number }> = [
    { chave: 'reposicao', rotulo: 'Reposição', bloco: 'reposicao', k: 2 },
    { chave: 'custo_variavel', rotulo: 'Custo variável', bloco: 'variavel', k: 2 },
    { chave: 'custo_fixo', rotulo: 'Custo fixo', bloco: 'fixo', k: 3 },
    { chave: 'rateio_adm', rotulo: 'Rateio administrativo', bloco: null, k: 0 },
  ];
  for (const c of custos) {
    const b = base[c.chave];
    const a = atual[c.chave];
    const d = desvio(b, a);
    const an = anomaliaDe(b, a);
    if (d.delta == null || !(d.comDesvio || an)) continue;
    const titulo = an === 'zerado' ? `${c.rotulo} zerado`
      : d.pct == null || c.chave === 'custo_variavel' || c.chave === 'reposicao'
        ? `${c.rotulo} R$ ${curto(d.delta)} ${maiorOuMenor(d.delta, true)}`
        : `${c.rotulo} ${pctCurto(d.pct)} ${maiorOuMenor(d.delta, true)}`;
    let frase = c.bloco ? topCentros(base, atual, c.bloco, c.k) : '';
    if (!frase) frase = `${rsCurto(a)} contra ${rsCurto(b)} em ${rotuloBase}.`;
    let destino: DestinoLeitura = { tipo: 'linha_dre', chave: c.chave };
    if (c.chave === 'custo_variavel' && e.notasALancar != null) {
      frase += ` ${formatNum(e.notasALancar, 0)} ${e.notasALancar === 1 ? 'nota' : 'notas'} em A lançar (das Notas da Receita).`;
      if (e.notasALancar > 0) destino = { tipo: 'notas_a_lancar' };
    }
    itens.push({ id: c.chave, titulo, frase, efeito: -d.delta, anomalia: an != null, destino });
  }

  /* Despesas financeiras — fora do lucro operacional (efeito 0): só entram como anomalia. Fora contra a Meta. */
  if (!contraMeta && base.juros != null && atual.juros != null) {
    const an = anomaliaDe(base.juros, atual.juros);
    if (an) {
      itens.push({
        id: 'juros',
        titulo: an === 'zerado' ? 'Despesas financeiras zeradas' : 'Despesas financeiras com sinal trocado',
        frase: `Era ${rsCurto(base.juros)} em ${rotuloBase}. Estimativa sem base neste mês?`,
        efeito: 0, anomalia: true, destino: { tipo: 'linha_dre', chave: 'juros' },
      });
    }
  }

  return escolher(itens, TOP_LEITURA_MES);
}

/** As anomalias primeiro garantem a vaga; o resto pelo |efeito|; a lista final sai pelo |efeito| (desempate: ordem fixa). */
function escolher(itens: readonly ItemLeitura[], top: number): ItemLeitura[] {
  const ordem = new Map(itens.map((x, k) => [x.id, k]));
  const porEfeito = (x: ItemLeitura, y: ItemLeitura) =>
    Math.abs(cent(y.efeito)) - Math.abs(cent(x.efeito)) || (ordem.get(x.id) ?? 0) - (ordem.get(y.id) ?? 0);
  const anomalias = itens.filter(x => x.anomalia).sort(porEfeito).slice(0, top);
  const resto = itens.filter(x => !x.anomalia).sort(porEfeito).slice(0, top - anomalias.length);
  return [...anomalias, ...resto].sort(porEfeito);
}

/* ══════════════ LEITURA DO ANO (o mês a mês) ══════════════ */

export interface MesDoAno {
  /** 'AAAA-MM' */
  anoMes: string;
  /** "Jan", "Fev"… — como a frase o cita. */
  rotulo: string;
  /** `null` = mês futuro ou sem leitura: fica fora de toda conta. */
  linhas: DrePecLinhas | null;
  /** `fn_conciliacao_status_ano` do mês: `null` = sem status. */
  conciliado?: boolean | null;
}

const LINHAS_DO_ANO: ReadonlyArray<{ chave: 'receita_liquida' | 'vpb_operacional' | 'reposicao' | 'custo_variavel' | 'custo_fixo' | 'efeito_mercado'; rotulo: string; custo: boolean }> = [
  { chave: 'vpb_operacional', rotulo: 'Variação por produção', custo: false },
  { chave: 'efeito_mercado', rotulo: 'Efeito de mercado', custo: false },
  { chave: 'custo_variavel', rotulo: 'Custo variável', custo: true },
  { chave: 'custo_fixo', rotulo: 'Custo fixo', custo: true },
  { chave: 'receita_liquida', rotulo: 'Receita líquida', custo: false },
  { chave: 'reposicao', rotulo: 'Reposição', custo: true },
];

const juntar = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/**
 * AS SEIS DO ANO: as células fora do padrão (a regra do contorno, linha a R$ 150 mil), pelo |x − média
 * dos outros meses|; e, quando houver, duas notas do ano — os meses em que o mercado apareceu (se
 * não apareceu em todos) e os meses não conciliados. As notas têm vaga garantida, no fim.
 * ⚠ SÓ OS MESES COM LEITURA ENTRAM NA CONTA (o futuro é "—" e fica fora, não vale zero).
 */
export function leituraDoAno(meses: readonly MesDoAno[]): ItemLeitura[] {
  const lidos = meses.filter((m): m is MesDoAno & { linhas: DrePecLinhas } => m.linhas != null);
  const celulas: ItemLeitura[] = [];
  for (const def of LINHAS_DO_ANO) {
    const valores = lidos.map(m => m.linhas[def.chave]);
    lidos.forEach((m, i) => {
      const c = contorno(valores, i, CONTORNO_MIN_LINHA);
      const x = valores[i];
      if (!c.foraDoPadrao || x == null || c.mediaOutros == null || c.desvio == null) return;
      celulas.push({
        id: `${def.chave}@${m.anoMes}`,
        titulo: `${m.rotulo} · ${def.rotulo} ${rsCurto(x)}`,
        frase: `Média dos outros meses: ${rsCurto(c.mediaOutros)}.`,
        efeito: def.custo ? -c.desvio : c.desvio,
        anomalia: false,
        destino: def.chave === 'vpb_operacional' || def.chave === 'efeito_mercado'
          ? { tipo: 'valor_rebanho' } : { tipo: 'linha_dre', chave: def.chave, mes: m.anoMes },
      });
    });
  }
  const notas: ItemLeitura[] = [];
  const comMercado = lidos.filter(m => m.linhas.efeito_mercado != null && cent(m.linhas.efeito_mercado) !== 0);
  const mercadoConhecido = lidos.every(m => m.linhas.efeito_mercado != null);
  if (mercadoConhecido && comMercado.length > 0 && comMercado.length < lidos.length) {
    notas.push({
      id: 'mercado-meses',
      titulo: `Mercado só aparece em ${juntar(comMercado.map(m => m.rotulo.toLowerCase()))}`,
      frase: 'Os preços do rebanho só mudaram nesses meses. Nos outros, a alta ou queda de preço fica dentro da produção.',
      efeito: 0, anomalia: false, destino: { tipo: 'valor_rebanho' },
    });
  }
  const pendentes = lidos.filter(m => m.conciliado === false);
  if (pendentes.length > 0) {
    notas.push({
      id: 'nao-conciliados',
      titulo: `${juntar(pendentes.map(m => m.rotulo))} ainda ${pendentes.length === 1 ? 'não conciliado' : 'não conciliados'}`,
      frase: 'Os números desses meses podem mudar até o extrato fechar.',
      efeito: 0, anomalia: false, destino: { tipo: 'conciliacao' },
    });
  }
  const ordem = new Map(celulas.map((x, k) => [x.id, k]));
  const top = celulas
    .slice().sort((x, y) => Math.abs(cent(y.efeito)) - Math.abs(cent(x.efeito)) || (ordem.get(x.id) ?? 0) - (ordem.get(y.id) ?? 0))
    .slice(0, Math.max(0, TOP_LEITURA_ANO - notas.length));
  return [...top, ...notas];
}

/* ══════════════ SELO DE CONFIANÇA (P9) ══════════════ */

export type GrauConfianca = 'alta' | 'media' | 'baixa';
export type DestinoFalta = 'conciliacao' | 'fechamento_pastos' | 'valor_rebanho';

export interface EntradaSelo {
  /** Todas as contas do mês conciliadas (`fn_conciliacao_status_ano`, nível total). `null` = sem status. */
  conciliado: boolean | null;
  /** Fechamento de pastos do mês fechado (P1). */
  pastosFechados: boolean | null;
  /** Valor do rebanho do mês fechado (P2). */
  valorRebanhoFechado: boolean | null;
  /** O preço do rebanho mudou no mês (`patrimonio.meses`). */
  precoMudou: boolean | null;
  p1_fonte: DrePecLinhas['p1_fonte'];
}

export interface Selo {
  /** `null` = não dá para dizer ("—"): sem status de conciliação. */
  grau: GrauConfianca | null;
  /** O que falta para subir de grau, com o lugar que resolve. */
  falta: { motivo: string; destino: DestinoFalta }[];
}

/**
 * ALTA: conciliado, pastos e Valor do rebanho fechados, preço do mês e P1 do fechamento.
 * MÉDIA: conciliado, mas falta alguma das outras (o preço não mudou ou `p1_fonte` ≠ 'fechamento').
 * BAIXA: mês não conciliado.
 * ⚠ O QUE NÃO SE CONSEGUE VERIFICAR (`null`) NÃO SOBE O GRAU: entra na lista como "não consegui verificar".
 */
export function seloDeConfianca(e: EntradaSelo): Selo {
  const falta: Selo['falta'] = [];
  const conferir = (v: boolean | null, motivoFalso: string, motivoNulo: string, destino: DestinoFalta) => {
    if (v === true) return;
    falta.push({ motivo: v === false ? motivoFalso : motivoNulo, destino });
  };
  conferir(e.conciliado, 'Mês não conciliado', 'Não consegui verificar a conciliação', 'conciliacao');
  conferir(e.pastosFechados, 'Fechamento de pastos aberto', 'Não consegui verificar o fechamento de pastos', 'fechamento_pastos');
  conferir(e.valorRebanhoFechado, 'Valor do rebanho aberto', 'Não consegui verificar o Valor do rebanho', 'valor_rebanho');
  conferir(e.precoMudou, 'O preço do rebanho não mudou no mês', 'Não consegui verificar o preço do rebanho', 'valor_rebanho');
  if (e.p1_fonte !== 'fechamento') {
    falta.push({
      motivo: e.p1_fonte == null ? 'Não consegui verificar a fonte do rebanho no fim do mês'
        : `Rebanho do fim do mês pelo ${e.p1_fonte === 'zero' ? 'zero (sem gado)' : 'cadastro'}, não pelo fechamento`,
      destino: 'valor_rebanho',
    });
  }
  const grau: GrauConfianca | null = e.conciliado == null ? null
    : e.conciliado === false ? 'baixa'
      : falta.length === 0 ? 'alta' : 'media';
  return { grau, falta };
}
