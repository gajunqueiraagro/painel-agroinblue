/**
 * FAZENDA-CADASTRO-01 · F1a — a LISTA DE FAZENDAS (mock fazenda-cadastro.html, tela 1, aprovado 12/11 14:43; FASE 0 13/11 12:15).
 * Só leitura e só o que já existe: cadastro (`fazenda_cadastros`), pastos (`usePastos`), desenhos (`fazenda_geometrias`),
 * rebanho do último fechamento (`zoot_mensal_cache`, REBANHO-LEITURA-01: nunca a view) e lotação (`fn_lotacao_do_mes`, área própria — D7).
 * Nenhuma conta nova: a área dos pastos é a mesma `agruparPastosPorFamilia` do cadastro, só que SEM piquete (FECH-PASTO-UNIDADE-01).
 */
import { agruparPastosPorFamilia } from '@/lib/pastos/agruparPorFamilia';
import { isPastoAtivoNoMes, type Pasto } from '@/hooks/usePastos';
import { areaNoMesOuHoje } from '@/lib/pastos/areaDoPastoNoMes';

/** o que o cadastro da fazenda tem (as colunas lidas de `fazenda_cadastros`) */
export interface CadastroDaFazenda {
  fazenda_id: string;
  municipio: string | null;
  estado: string | null;
  car: string | null;
  nirf: string | null;
  ie: string | null;
  roteiro: string | null;
  area_total_ha: number | null;
}
export interface FazendaDaLista { id: string; nome: string; codigo: string | null; status: string | null }
/** o último mês FECHADO da fazenda (todas as categorias com fonte 'fechamento') e a lotação dele */
export interface FechamentoDaFazenda {
  anoMes: string; cabecas: number; lotacao: number | null; areaDaLotacao: number | null;
  /** o SALDO INICIAL do ano do fechamento (o de janeiro = a foto de dezembro do ano anterior); null = sem janeiro no cache */
  inicioDoAno: number | null;
}

export interface LinhaDaFazenda {
  id: string;
  codigo: string | null;
  nome: string;
  /** "Município · UF", "—" sem nenhum dos dois */
  local: string | null;
  situacao: string;
  ativa: boolean;
  atividades: string[];
  matriculaHa: number | null;
  /** null = a fazenda não tem pasto vigente (ausência, nunca "0 ha") */
  pastosHa: number | null;
  diferencaHa: number | null;
  nPastos: number;
  noMapa: number;
  rebanho: number | null;
  rebanhoInicioDoAno: number | null;
  lotacao: number | null;
  areaDaLotacao: number | null;
  mesDoFechamento: string | null;
  /** os itens do "cadastro completo" (P5) que faltam; vazio = completo */
  pendencias: string[];
}

const SITUACAO: Record<string, string> = { ativa: 'Ativa', inativa: 'Inativa', arrendada: 'Arrendada', suspensa: 'Suspensa' };
export const rotuloDaSituacao = (s: string | null | undefined): string => (s ? SITUACAO[s] ?? s : '—');

/**
 * Os pastos que contam na ÁREA: ativos e que NÃO são piquete. O piquete é subárea do pai (FECH-PASTO-UNIDADE-01, o espelho de
 * `fn_pastos_aplicaveis_mes`); somar os dois contava a mesma terra duas vezes (Pureza: 6.471,92 ha × 4.650,61 ha sem piquetes, medido 13/11).
 */
export const pastosDaArea = <T extends Pick<Pasto, 'ativo' | 'pai_id'>>(pastos: readonly T[]): T[] =>
  pastos.filter(p => p.ativo !== false && !p.pai_id);

/** atividade = destino de pecuária com área (Cria · Recria · Engorda) e as famílias de produção com área (Agricultura · Silvicultura) — Q2 */
const ATIVIDADES_PECUARIA: [string, string][] = [['cria', 'Cria'], ['recria', 'Recria'], ['engorda', 'Engorda']];
const ATIVIDADES_FAMILIA: [string, string][] = [['agricultura', 'Agricultura'], ['silvicultura', 'Silvicultura']];

export function atividadesDaFazenda(ag: ReturnType<typeof agruparPastosPorFamilia>): string[] {
  const out: string[] = [];
  const pec = ag.familias.find(f => f.grupo === 'pecuaria');
  for (const [tipo, rotulo] of ATIVIDADES_PECUARIA) {
    const t = pec?.tipos.find(x => x.tipo === tipo);
    if (t && t.pastos.reduce((s, p) => s + areaNoMesOuHoje(p, undefined), 0) > 0) out.push(rotulo);
  }
  for (const [grupo, rotulo] of ATIVIDADES_FAMILIA) {
    if ((ag.familias.find(f => f.grupo === grupo)?.somaHa ?? 0) > 0) out.push(rotulo);
  }
  return out;
}

const vazio = (s: string | null | undefined) => !s || !s.trim();

/** P5 — "cadastro completo": avisa, nunca bloqueia. A ordem é a do mock. */
export function pendenciasDoCadastro(f: FazendaDaLista, c: CadastroDaFazenda | undefined, temRebanhoInicial: boolean): string[] {
  const p: string[] = [];
  if (vazio(f.nome)) p.push('nome');
  if (vazio(f.codigo)) p.push('código');
  if (vazio(c?.municipio)) p.push('município');
  if (c?.area_total_ha == null || c.area_total_ha <= 0) p.push('matrícula');
  if (vazio(c?.car)) p.push('CAR');
  if (vazio(c?.nirf)) p.push('NIRF');
  if (vazio(c?.ie)) p.push('inscrição estadual');
  if (vazio(c?.roteiro)) p.push('roteiro');
  if (!temRebanhoInicial) p.push('rebanho inicial');
  return p;
}

export interface EntradaDaLista {
  fazendas: readonly FazendaDaLista[];
  cadastros: ReadonlyMap<string, CadastroDaFazenda>;
  pastos: readonly Pasto[];
  /** ids dos pastos com desenho no mapa */
  desenhados: ReadonlySet<string>;
  fechamentos: ReadonlyMap<string, FechamentoDaFazenda>;
  comRebanhoInicial: ReadonlySet<string>;
  /** o mês da área (o mesmo do cadastro: o corrente) */
  mesRef: string;
}

export function linhasDaLista(e: EntradaDaLista): LinhaDaFazenda[] {
  return e.fazendas.map(f => {
    const c = e.cadastros.get(f.id);
    const daFazenda = pastosDaArea(e.pastos.filter(p => p.fazenda_id === f.id));
    const ag = agruparPastosPorFamilia(daFazenda, e.mesRef);
    const vigentes = daFazenda.filter(p => isPastoAtivoNoMes(p, e.mesRef) && p.tipo_uso !== 'divergencia');
    const pastosHa = vigentes.length > 0 ? ag.familias.reduce((s, x) => s + x.somaHa, 0) : null;
    const matriculaHa = c?.area_total_ha ?? null;
    const fech = e.fechamentos.get(f.id) ?? null;
    const local = [c?.municipio?.trim(), c?.estado?.trim()].filter(Boolean).join(' · ') || null;
    const ativa = (f.status ?? 'ativa') === 'ativa';
    return {
      id: f.id, codigo: f.codigo, nome: f.nome, local,
      situacao: rotuloDaSituacao(f.status), ativa,
      atividades: atividadesDaFazenda(ag),
      matriculaHa, pastosHa,
      diferencaHa: matriculaHa != null && pastosHa != null ? Math.round((pastosHa - matriculaHa) * 100) / 100 : null,
      nPastos: vigentes.length,
      noMapa: vigentes.filter(p => e.desenhados.has(p.id)).length,
      rebanho: fech?.cabecas ?? null,
      rebanhoInicioDoAno: fech?.inicioDoAno ?? null,
      lotacao: fech?.lotacao ?? null,
      areaDaLotacao: fech?.areaDaLotacao ?? null,
      mesDoFechamento: fech?.anoMes ?? null,
      pendencias: pendenciasDoCadastro(f, c, e.comRebanhoInicial.has(f.id)),
    };
  });
}

const soma = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null);
  return v.length > 0 ? v.reduce((s, x) => s + x, 0) : null;
};

export interface TotaisDaLista {
  fazendas: number;
  ativas: number;
  matriculaHa: number | null;
  pastosHa: number | null;
  diferencaHa: number | null;
  fazendasComDiferenca: number;
  pecuariaHa: number | null;
  nPastos: number;
  noMapa: number;
  rebanho: number | null;
  /** o saldo inicial do ano SÓ das fazendas que têm rebanho e início (a variação compara o mesmo conjunto) */
  rebanhoComInicio: number | null;
  rebanhoInicioDoAno: number | null;
  /** média ponderada pela área de cada lotação */
  lotacao: number | null;
  ultimoFechamento: string | null;
  comPendencia: number;
}

export function totaisDaLista(linhas: readonly LinhaDaFazenda[], pecuariaHa: number | null): TotaisDaLista {
  const comLot = linhas.filter(l => l.lotacao != null && l.areaDaLotacao != null && l.areaDaLotacao > 0);
  const area = comLot.reduce((s, l) => s + (l.areaDaLotacao ?? 0), 0);
  const meses = linhas.map(l => l.mesDoFechamento).filter((m): m is string => !!m).sort();
  return {
    fazendas: linhas.length,
    ativas: linhas.filter(l => l.ativa).length,
    matriculaHa: soma(linhas.map(l => l.matriculaHa)),
    pastosHa: soma(linhas.map(l => l.pastosHa)),
    diferencaHa: soma(linhas.map(l => l.diferencaHa)),
    fazendasComDiferenca: linhas.filter(l => l.diferencaHa != null && Math.abs(l.diferencaHa) >= 0.01).length,
    pecuariaHa,
    nPastos: linhas.reduce((s, l) => s + l.nPastos, 0),
    noMapa: linhas.reduce((s, l) => s + l.noMapa, 0),
    rebanho: soma(linhas.map(l => l.rebanho)),
    rebanhoComInicio: soma(linhas.map(l => (l.rebanhoInicioDoAno != null ? l.rebanho : null))),
    rebanhoInicioDoAno: soma(linhas.map(l => (l.rebanho != null ? l.rebanhoInicioDoAno : null))),
    lotacao: area > 0 ? comLot.reduce((s, l) => s + (l.lotacao ?? 0) * (l.areaDaLotacao ?? 0), 0) / area : null,
    ultimoFechamento: meses.length > 0 ? meses[meses.length - 1] : null,
    comPendencia: linhas.filter(l => l.ativa && l.pendencias.length > 0).length,
  };
}

/** as linhas do `zoot_mensal_cache` (por categoria) → o último mês em que TODAS as categorias da fazenda vêm do fechamento */
export interface LinhaDoCache { fazenda_id: string; ano_mes: string; saldo_inicial?: number | null; saldo_final: number; fonte_oficial_mes: string | null }
export function ultimoFechamentoPorFazenda(linhas: readonly LinhaDoCache[]): Map<string, { anoMes: string; cabecas: number; inicioDoAno: number | null }> {
  const porMes = new Map<string, { fazenda: string; anoMes: string; cab: number; todas: boolean }>();
  for (const l of linhas) {
    const k = `${l.fazenda_id}|${l.ano_mes}`;
    const a = porMes.get(k) ?? { fazenda: l.fazenda_id, anoMes: l.ano_mes, cab: 0, todas: true };
    a.cab += Number(l.saldo_final) || 0;
    a.todas = a.todas && l.fonte_oficial_mes === 'fechamento';
    porMes.set(k, a);
  }
  /* o saldo inicial de janeiro de cada ano, por fazenda (qualquer fonte: é a abertura do ano) */
  const janeiro = new Map<string, number>();
  for (const l of linhas) {
    if (l.ano_mes.slice(5, 7) !== '01' || l.saldo_inicial == null) continue;
    const k = `${l.fazenda_id}|${l.ano_mes.slice(0, 4)}`;
    janeiro.set(k, (janeiro.get(k) ?? 0) + (Number(l.saldo_inicial) || 0));
  }
  const out = new Map<string, { anoMes: string; cabecas: number; inicioDoAno: number | null }>();
  for (const m of porMes.values()) {
    if (!m.todas) continue;
    const atual = out.get(m.fazenda);
    if (!atual || m.anoMes > atual.anoMes) {
      out.set(m.fazenda, { anoMes: m.anoMes, cabecas: m.cab, inicioDoAno: janeiro.get(`${m.fazenda}|${m.anoMes.slice(0, 4)}`) ?? null });
    }
  }
  return out;
}

/** lotação do mês sobre a ÁREA PRÓPRIA (D7): Σ UA ÷ Σ área dos pastos próprios com lotação; arrendado fica fora */
export function lotacaoPropria(
  linhas: readonly { pasto_id: string; area_ha: number | null; ua: number | null }[],
  arrendados: ReadonlySet<string>,
): { lotacao: number | null; area: number | null } {
  let ua = 0; let area = 0;
  for (const l of linhas) {
    if (arrendados.has(l.pasto_id) || l.ua == null || !l.area_ha || l.area_ha <= 0) continue;
    ua += Number(l.ua); area += Number(l.area_ha);
  }
  return area > 0 ? { lotacao: ua / area, area } : { lotacao: null, area: null };
}

/** "2026-10" → "out/26" */
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const mesCurtoDe = (anoMes: string | null): string =>
  anoMes ? `${MESES[Number(anoMes.slice(5, 7)) - 1]}/${anoMes.slice(2, 4)}` : '—';

/**
 * O REBANHO NO ANO (regra geral do Gabriel 12/11 20:27, a mesma da VISAO-GERAL-CARDS-01 `variacaoNoAno`): o número de agora contra o SALDO
 * INICIAL do ano — delta em cabeças e % —, "▲ 310 cab. · ▲ 4,3% no ano (saldo inicial 7.140)", verde/vermelho. Sem início, ou início ≤ 0,
 * não há % (nunca Infinity, nunca zero no lugar). ⚠ Quando a do Code 2 estiver na origin, esta passa a importá-la (uma regra só).
 */
export interface VariacaoNoAno { delta: number; pct: number | null; inicio: number }
export function variacaoNoAno(atual: number | null | undefined, inicio: number | null | undefined): VariacaoNoAno | null {
  if (atual == null || !Number.isFinite(atual) || inicio == null) return null;
  const delta = atual - inicio;
  return { delta, pct: inicio > 0 ? (delta / inicio) * 100 : null, inicio };
}
const seta = (n: number) => (n > 0 ? '▲' : n < 0 ? '▼' : '=');
const br0 = (n: number) => Math.abs(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const br1 = (n: number) => Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** os textos da variação: o curto (célula da tabela), o da nota (cartão) e o inteiro (title) */
export function textosDaVariacao(v: VariacaoNoAno | null): { curto: string; nota: string; inteiro: string; sinal: -1 | 0 | 1 } | null {
  if (!v) return null;
  const cab = `${seta(v.delta)} ${br0(v.delta)} cab.`;
  const pct = v.pct == null ? null : `${seta(v.pct)} ${br1(v.pct)}%`;
  return {
    curto: pct ? `${seta(v.delta)} ${br0(v.delta)} · ${br1(v.pct ?? 0)}%` : `${seta(v.delta)} ${br0(v.delta)}`,
    nota: pct ? `${cab} · ${pct} no ano` : `${cab} no ano`,
    inteiro: `${pct ? `${cab} · ${pct} no ano` : `${cab} no ano`} (saldo inicial ${br0(v.inicio)})`,
    sinal: v.delta > 0 ? 1 : v.delta < 0 ? -1 : 0,
  };
}
