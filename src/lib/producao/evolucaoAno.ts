/**
 * PROD-EVOLUCAO-01a — os números da Evolução no Ano (nível 1), numa função pura.
 *
 * ⚠ O QUE JÁ ESTAVA CERTO NÃO MUDA (Gabriel 30/10 17:16): saldo início, saldo final, os 8 movimentos, peso médio final e o GMD de CADA mês vêm
 *   das MESMAS fontes da tela antiga (`totaisPorMes`, `useMovimentacoesMensais`, `fazendaByMes`) — esta função só os arruma em blocos.
 * ⚠ OS DOIS QUE MUDAM, com o OK do Gabriel (30/10 18:45, "ok lotacao, gmd", prévia antes × depois):
 *   - LOTAÇÃO = UA média do mês ÷ ÁREA DE PECUÁRIA DO MÊS (a do Fechamento, `useSnapshotAreaAnual` = `areaPecuariaRealPorMes` do PC-100), nunca a
 *     área do cadastro de hoje. O acumulado é Σ UA ÷ Σ área (a média ponderada pela área de cada mês).
 *   - GMD do acumulado = Σ produção biológica ÷ Σ (cabeças médias × dias) — o ponderado; era a média simples dos meses.
 * Os números NOVOS (kg e @ por movimento, @ produzidas, desfrute) saem do cache por tipo (`peso_<tipo>`, `peso_carcaca_abate`), a regra do banco.
 */
import type { FluxoTipo } from '@/lib/calculos/zootecnicos';

export type Unidade = 'cab' | 'arroba' | 'kg';
export type Periodo = 'mes' | 'acum' | 'ano';
export type Destino = 'lanc' | 'oc' | 'fech';

/** Um mês, como as fontes de hoje o entregam (todos os números já existem; nada é recalculado aqui além da arrumação). */
export interface MesDaEvolucao {
  /** 1..12 */
  mes: number;
  /** o mês tem o Fechamento (a mesma regra da tela antiga: `fonte_oficial_mes === 'fechamento'`); no cenário Meta, sempre true */
  fechado: boolean;
  /** Saldo início do mês (jan = saldo inicial; depois o `saldo_sistema` do mês anterior — a regra de hoje) */
  saldoInicio: number | null;
  saldoFinal: number | null;
  /** peso total do rebanho no início e no fim do mês (kg) */
  pesoInicioKg: number | null;
  pesoFinalKg: number | null;
  /** cabeças por tipo (lançamentos — `useMovimentacoesMensais`) */
  cab: Partial<Record<FluxoTipo, number>>;
  /** kg vivo por tipo (cache `peso_<tipo>`) */
  kg: Partial<Record<FluxoTipo, number>>;
  /** kg de carcaça do abate (cache `peso_carcaca_abate`) — a base da @ do abate */
  kgCarcacaAbate: number;
  /** evolução de categoria (reclassificação): cabeças e kg que entraram/saíram de categoria */
  evolEntrou: number;
  evolSaiu: number;
  kgEvolEntrou: number;
  kgEvolSaiu: number;
  /** indicadores do mês (`fazendaByMes`) */
  pesoMedioFinal: number | null;
  gmd: number | null;
  /** produção biológica do mês (kg) — o numerador do GMD */
  producaoBio: number | null;
  cabInicio: number | null;
  cabFinal: number | null;
  dias: number | null;
  uaMedia: number | null;
  /** área de pecuária do mês (Fechamento); null = sem Fechamento */
  areaPecuaria: number | null;
}

export interface LinhaDaEvolucao {
  id: string;
  rotulo: string;
  nivel: 'saldo' | 'bloco-entrada' | 'entrada' | 'bloco-saida' | 'saida' | 'bloco-interna' | 'interna' | 'final' | 'indicador';
  /** para onde o número leva */
  destino?: Destino;
  /** o tipo do lançamento (o filtro do "Lanç." e do "OC") */
  tipo?: FluxoTipo;
  /** valor de cada mês (índice 0 = jan); null = sem dado ("—") */
  meses: (number | null)[];
  acum: number | null;
  meta: number | null;
  /** casas decimais do número */
  casas: number;
  /** o número leva sinal (+/−) na exibição */
  comSinal?: boolean;
  /** Δ % é em pontos? (desfrute já é %) */
  deltaEmPontos?: boolean;
  /** a explicação do rótulo curto (fix1, item 6): o nome cabe inteiro e o resto vai no `title` */
  title?: string;
}

const TIPOS_ENTRADA: FluxoTipo[] = ['nascimento', 'compra'];
const TIPOS_SAIDA: FluxoTipo[] = ['abate', 'venda', 'consumo', 'morte'];
/** desfrute = (abates + vendas + consumo) ÷ rebanho inicial (Gabriel 30/10; `TIPOS_DESFRUTE_OFICIAL`) */
export const TIPOS_DESFRUTE: FluxoTipo[] = ['abate', 'venda', 'consumo'];

/* fix1 (Gabriel 31/10, item 6): nomes curtos que cabem INTEIROS; a explicação no `title` (`TITLE`) */
const ROTULO: Record<FluxoTipo, string> = {
  nascimento: 'Nascimentos', compra: 'Compras', transferencia_entrada: 'Transf. entrada',
  abate: 'Abates', venda: 'Vendas em pé', consumo: 'Consumo', morte: 'Mortes', transferencia_saida: 'Transf. saída',
};
const TITLE: Partial<Record<FluxoTipo, string>> = {
  transferencia_entrada: 'Transferência de outra fazenda (entrou nesta)', transferencia_saida: 'Transferência para outra fazenda (saiu desta)',
};
/** compra, abate e venda têm OC; o resto só lançamento */
const DESTINO_DO_TIPO: Record<FluxoTipo, Destino> = {
  nascimento: 'lanc', compra: 'oc', transferencia_entrada: 'lanc', abate: 'oc', venda: 'oc', consumo: 'lanc', morte: 'lanc', transferencia_saida: 'lanc',
};

const soma = (xs: (number | null | undefined)[]): number => xs.reduce<number>((s, x) => s + (x ?? 0), 0);

/** kg → unidade. Abate em @ = carcaça ÷ 15; o resto ÷ 30 (`calcArrobas`, `economicos.ts`; a mesma regra do cache). */
function naUnidade(m: MesDaEvolucao, tipo: FluxoTipo, unidade: Unidade): number {
  const cab = m.cab[tipo] ?? 0;
  if (unidade === 'cab') return cab;
  if (unidade === 'kg') return m.kg[tipo] ?? 0;
  return tipo === 'abate' ? m.kgCarcacaAbate / 15 : (m.kg[tipo] ?? 0) / 30;
}

/** Os meses do acumulado: Mês = só o último fechado; Acum. = jan até o último fechado; Ano = os 12. */
export function mesesDoPeriodo(periodo: Periodo, ultimoFechado: number | null): number[] {
  const ate = ultimoFechado ?? 0;
  if (periodo === 'ano') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (ate < 1) return [];
  if (periodo === 'mes') return [ate];
  return Array.from({ length: ate }, (_, i) => i + 1);
}

/** O último mês fechado (o "até" do acumulado); null = nenhum. */
export function ultimoMesFechado(meses: MesDaEvolucao[]): number | null {
  let u: number | null = null;
  for (const m of meses) if (m.fechado) u = Math.max(u ?? 0, m.mes);
  return u;
}

/** GMD ponderado do período = Σ PB ÷ Σ (cab médias × dias). Só meses com o número inteiro (fechados). */
export function gmdPonderado(meses: MesDaEvolucao[]): number | null {
  let pb = 0; let cabDias = 0;
  for (const m of meses) {
    if (m.producaoBio == null || m.cabInicio == null || m.cabFinal == null || !m.dias) continue;
    pb += m.producaoBio; cabDias += ((m.cabInicio + m.cabFinal) / 2) * m.dias;
  }
  return cabDias > 0 ? pb / cabDias : null;
}

/** Lotação do mês = UA média ÷ área de pecuária do mês. */
export function lotacaoDoMes(m: MesDaEvolucao): number | null {
  return m.uaMedia != null && m.areaPecuaria != null && m.areaPecuaria > 0 ? m.uaMedia / m.areaPecuaria : null;
}

/** Lotação do período = Σ UA ÷ Σ área (média ponderada pela área de cada mês). */
export function lotacaoDoPeriodo(meses: MesDaEvolucao[]): number | null {
  let ua = 0; let area = 0;
  for (const m of meses) {
    if (m.uaMedia == null || m.areaPecuaria == null || m.areaPecuaria <= 0) continue;
    ua += m.uaMedia; area += m.areaPecuaria;
  }
  return area > 0 ? ua / area : null;
}

export interface EntradaDaEvolucao {
  real: MesDaEvolucao[];
  /** cenário Meta, os mesmos 12 meses (vazio = sem meta) */
  meta: MesDaEvolucao[];
  unidade: Unidade;
  periodo: Periodo;
  /** Global: a transferência entre fazendas é INTERNA (entrou = saiu); com uma fazenda, ela é entrada/saída externa da fazenda */
  global: boolean;
}

export interface Evolucao {
  linhas: LinhaDaEvolucao[];
  ultimoFechado: number | null;
  mesesDoAcum: number[];
  /** saldo inicial do ano (o denominador do desfrute) */
  rebanhoInicialAno: number | null;
}

const porMes = (lista: MesDaEvolucao[]): Map<number, MesDaEvolucao> => new Map(lista.map((m) => [m.mes, m]));

/**
 * A tabela do ano: Saldo início · Entradas externas (Σ) · Saídas externas (Σ) · Internas (não mudam o total do Global) · Saldo final · indicadores.
 * Cada linha traz os 12 meses, o acumulado do período e a meta do MESMO período (a régua do Δ).
 */
export function montarEvolucao({ real, meta, unidade, periodo, global }: EntradaDaEvolucao): Evolucao {
  const R = porMes(real); const M = porMes(meta);
  const ultimoFechado = ultimoMesFechado(real);
  const mesesDoAcum = mesesDoPeriodo(periodo, ultimoFechado);
  const temMeta = meta.length > 0;
  const doze = Array.from({ length: 12 }, (_, i) => i + 1);

  const tiposEntrada: FluxoTipo[] = global ? TIPOS_ENTRADA : [...TIPOS_ENTRADA, 'transferencia_entrada'];
  const tiposSaida: FluxoTipo[] = global ? TIPOS_SAIDA : [...TIPOS_SAIDA, 'transferencia_saida'];

  /** valor de um fluxo por mês, na unidade; mês sem dado do cenário = null */
  const fluxo = (fonte: Map<number, MesDaEvolucao>, mes: number, tipos: FluxoTipo[]): number | null => {
    const m = fonte.get(mes); if (!m) return null;
    return soma(tipos.map((t) => naUnidade(m, t, unidade)));
  };
  const somaFluxo = (fonte: Map<number, MesDaEvolucao>, tipos: FluxoTipo[]): number | null => {
    if (mesesDoAcum.length === 0 || (fonte === M && !temMeta)) return null;
    return soma(mesesDoAcum.map((mes) => fluxo(fonte, mes, tipos)));
  };
  const linhaDeFluxo = (id: string, rotulo: string, nivel: LinhaDaEvolucao['nivel'], tipos: FluxoTipo[], sinal: 1 | -1, extra?: Partial<LinhaDaEvolucao>): LinhaDaEvolucao => {
    const assinar = (v: number | null) => (v == null ? null : v === 0 ? 0 : sinal * v);
    return {
      id, rotulo, nivel, casas: unidade === 'cab' ? 0 : unidade === 'kg' ? 0 : 0,
      meses: doze.map((mes) => assinar(fluxo(R, mes, tipos))),
      acum: assinar(somaFluxo(R, tipos)), meta: assinar(somaFluxo(M, tipos)),
      comSinal: nivel.startsWith('bloco'), ...extra,
    };
  };

  /* saldos: na unidade cab, as cabeças; em kg/@, o peso do rebanho */
  const saldoInicio = (m: MesDaEvolucao | undefined): number | null => {
    if (!m) return null;
    if (unidade === 'cab') return m.saldoInicio;
    return m.pesoInicioKg == null ? null : unidade === 'kg' ? m.pesoInicioKg : m.pesoInicioKg / 30;
  };
  const saldoFinal = (m: MesDaEvolucao | undefined): number | null => {
    if (!m) return null;
    if (unidade === 'cab') return m.saldoFinal;
    return m.pesoFinalKg == null ? null : unidade === 'kg' ? m.pesoFinalKg : m.pesoFinalKg / 30;
  };
  const primeiro = mesesDoAcum[0]; const ultimo = mesesDoAcum[mesesDoAcum.length - 1];

  const linhas: LinhaDaEvolucao[] = [];
  linhas.push({
    id: 'saldo-inicio', rotulo: 'Saldo início', nivel: 'saldo', casas: 0,
    meses: doze.map((mes) => saldoInicio(R.get(mes))),
    acum: primeiro ? saldoInicio(R.get(primeiro)) : null,
    meta: temMeta && primeiro ? saldoInicio(M.get(primeiro)) : null,
  });

  linhas.push(linhaDeFluxo('entradas', 'Entradas externas', 'bloco-entrada', tiposEntrada, 1));
  for (const t of tiposEntrada) linhas.push(linhaDeFluxo(t, ROTULO[t], 'entrada', [t], 1, { destino: DESTINO_DO_TIPO[t], tipo: t, title: TITLE[t] }));
  linhas.push(linhaDeFluxo('saidas', 'Saídas externas', 'bloco-saida', tiposSaida, -1));
  for (const t of tiposSaida) linhas.push(linhaDeFluxo(t, ROTULO[t], 'saida', [t], 1, { destino: DESTINO_DO_TIPO[t], tipo: t, title: TITLE[t] }));

  /* INTERNAS — não mudam o total do Global: a transferência entre fazendas (só no Global) e a evolução de categoria (entrou = saiu) */
  linhas.push({ id: 'internas', rotulo: 'Internas', title: 'Internas: não mudam o total do rebanho (a transferência entre fazendas e a evolução de categoria)',
    nivel: 'bloco-interna', casas: 0, meses: doze.map(() => null), acum: null, meta: null });
  if (global) {
    linhas.push(linhaDeFluxo('transferencia', 'Transf. entre fazendas', 'interna', ['transferencia_saida'], 1, { destino: 'lanc', tipo: 'transferencia_saida' }));
  }
  const evol = (fonte: Map<number, MesDaEvolucao>, mes: number): number | null => {
    const m = fonte.get(mes); if (!m) return null;
    return unidade === 'cab' ? m.evolSaiu : unidade === 'kg' ? m.kgEvolSaiu : m.kgEvolSaiu / 30;
  };
  linhas.push({
    id: 'evolucao', rotulo: 'Evolução de categoria', nivel: 'interna', casas: 0, destino: 'lanc',
    meses: doze.map((mes) => evol(R, mes)),
    acum: mesesDoAcum.length ? soma(mesesDoAcum.map((mes) => evol(R, mes))) : null,
    meta: temMeta && mesesDoAcum.length ? soma(mesesDoAcum.map((mes) => evol(M, mes))) : null,
  });

  linhas.push({
    id: 'saldo-final', rotulo: 'Saldo final', nivel: 'final', casas: 0, destino: 'fech',
    meses: doze.map((mes) => saldoFinal(R.get(mes))),
    acum: ultimo ? saldoFinal(R.get(ultimo)) : null,
    meta: temMeta && ultimo ? saldoFinal(M.get(ultimo)) : null,
  });

  /* INDICADORES — só em mês fechado (a regra de hoje: `temDado`); no Meta, todos os meses */
  const ind = (m: MesDaEvolucao | undefined, f: (m: MesDaEvolucao) => number | null): number | null => (m && m.fechado ? f(m) : null);
  const acumDe = (fonte: Map<number, MesDaEvolucao>) => mesesDoAcum.map((mes) => fonte.get(mes)).filter((m): m is MesDaEvolucao => !!m && m.fechado);
  linhas.push({
    id: 'peso-final', rotulo: 'Peso final kg', nivel: 'indicador', casas: 1, destino: 'fech',
    meses: doze.map((mes) => ind(R.get(mes), (m) => m.pesoMedioFinal)),
    acum: ultimo ? ind(R.get(ultimo), (m) => m.pesoMedioFinal) : null,
    meta: temMeta && ultimo ? ind(M.get(ultimo), (m) => m.pesoMedioFinal) : null,
  });
  linhas.push({
    id: 'gmd', rotulo: 'GMD kg/cab/dia', nivel: 'indicador', casas: 3, destino: 'fech',
    meses: doze.map((mes) => ind(R.get(mes), (m) => m.gmd)),
    acum: mesesDoAcum.length ? gmdPonderado(acumDe(R)) : null,
    meta: temMeta && mesesDoAcum.length ? gmdPonderado(acumDe(M)) : null,
  });
  linhas.push({
    id: 'lotacao', rotulo: 'Lotação UA/ha', nivel: 'indicador', casas: 2, destino: 'fech',
    meses: doze.map((mes) => ind(R.get(mes), lotacaoDoMes)),
    acum: mesesDoAcum.length ? lotacaoDoPeriodo(acumDe(R)) : null,
    meta: temMeta && mesesDoAcum.length ? lotacaoDoPeriodo(acumDe(M)) : null,
  });
  const arrobasProd = (m: MesDaEvolucao) => (m.producaoBio == null ? null : m.producaoBio / 30);
  linhas.push({
    id: 'arrobas-produzidas', rotulo: '@ produzidas', nivel: 'indicador', casas: 0, destino: 'fech',
    meses: doze.map((mes) => ind(R.get(mes), arrobasProd)),
    acum: mesesDoAcum.length ? soma(acumDe(R).map(arrobasProd)) : null,
    meta: temMeta && mesesDoAcum.length ? soma(acumDe(M).map(arrobasProd)) : null,
  });

  /* DESFRUTE % = (abates + vendas + consumo) ÷ rebanho inicial do ANO × 100; cada mês é a parte dele, o acumulado é a soma */
  const rebanhoInicialAno = R.get(1)?.saldoInicio ?? null;
  const rebanhoInicialMeta = M.get(1)?.saldoInicio ?? null;
  const desfrute = (m: MesDaEvolucao | undefined, base: number | null): number | null => {
    if (!m || !base) return null;
    const cab = soma(TIPOS_DESFRUTE.map((t) => m.cab[t]));
    return cab === 0 ? null : (cab / base) * 100;
  };
  linhas.push({
    id: 'desfrute', rotulo: 'Desfrute %', nivel: 'indicador', casas: 1, deltaEmPontos: true,
    meses: doze.map((mes) => desfrute(R.get(mes), rebanhoInicialAno)),
    acum: mesesDoAcum.length && rebanhoInicialAno ? (soma(mesesDoAcum.map((mes) => soma(TIPOS_DESFRUTE.map((t) => R.get(mes)?.cab[t])))) / rebanhoInicialAno) * 100 : null,
    meta: temMeta && mesesDoAcum.length && rebanhoInicialMeta ? (soma(mesesDoAcum.map((mes) => soma(TIPOS_DESFRUTE.map((t) => M.get(mes)?.cab[t])))) / rebanhoInicialMeta) * 100 : null,
  });

  return { linhas, ultimoFechado, mesesDoAcum, rebanhoInicialAno };
}

/** Δ % do acumulado sobre a meta; em pontos para o que já é % (desfrute). Sem meta (ou meta 0) = null ("—"). */
export function deltaSobreMeta(l: LinhaDaEvolucao): number | null {
  if (l.acum == null || l.meta == null) return null;
  if (l.deltaEmPontos) return l.acum - l.meta;
  if (l.meta === 0) return null;
  /* as SAÍDAS vêm negativas: o Δ compara o tamanho (−220 × −59 = +273%, como no mock), não o sinal */
  if (l.acum <= 0 && l.meta < 0) return ((Math.abs(l.acum) - Math.abs(l.meta)) / Math.abs(l.meta)) * 100;
  return ((l.acum - l.meta) / Math.abs(l.meta)) * 100;
}

/** "Conferir" (Gabriel 30/10): o mês fechado cujo GMD salta, e por quê (o peso médio final do mês anterior → o deste). */
export interface AvisoDaEvolucao { mes: number; texto: string }
export const GMD_ALTO = 1.5;
export const GMD_BAIXO = -0.5;
export function avisosDaEvolucao(real: MesDaEvolucao[], fmt: (v: number, casas: number) => string, rotuloDoMes: (mes: number) => string): AvisoDaEvolucao[] {
  const R = porMes(real); const avisos: AvisoDaEvolucao[] = [];
  for (const m of [...real].sort((a, b) => a.mes - b.mes)) {
    if (!m.fechado || m.gmd == null || (m.gmd < GMD_ALTO && m.gmd > GMD_BAIXO)) continue;
    const antes = R.get(m.mes - 1)?.pesoMedioFinal;
    const peso = antes != null && m.pesoMedioFinal != null
      ? ` — o peso médio final vai de ${fmt(antes, 1)} kg para ${fmt(m.pesoMedioFinal, 1)} kg`
      : '';
    avisos.push({ mes: m.mes, texto: `${rotuloDoMes(m.mes)}: GMD ${fmt(m.gmd, 3)}${peso}. Conferir o Fechamento Área do mês.` });
  }
  return avisos;
}
