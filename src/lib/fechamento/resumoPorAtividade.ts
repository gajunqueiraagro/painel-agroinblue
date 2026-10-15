/**
 * RESUMO-ATIVIDADE-01a — a agregacao da tela "Resumo por Atividade", PURA (sem React, sem banco).
 *
 * FONTE UNICA (decisao D4 do Gabriel, 15/10/2026) — nenhuma conta paralela:
 *   · atividade do pasto no mes = `fechamento_pastos.tipo_uso_mes`; card sem tipo -> o cadastro (`pastos.tipo_uso`);
 *     pasto SEM card no mes -> balde "sem fechamento", fora de toda atividade (a regra que a tela antiga ja' tinha);
 *   · area por pasto = `pastos.area_produtiva_ha` (limitacao conhecida: e' a area do cadastro ATUAL);
 *   · cabecas / peso por fase = `fechamento_pasto_itens` agrupados pela atividade do pasto;
 *   · total da pecuaria (cab, peso medio, @ em estoque, @ produzidas, GMD) = `zoot_mensal_cache` do mes, SEM o overlay
 *     de fechamento, pelas funcoes canonicas do painel (`pesoMedioPonderadoFromRows`, `cabecasMediaPeriodoFromRows`,
 *     `computePeriodGmd`); lotacao do total = peso total / 450 / `fechamento_area_snapshot.area_pecuaria_ha`.
 * Se a soma das fases nao bater com o total do cache, NADA E' AJUSTADO: a diferenca sai em `divergencia` e a tela a
 * escreve numa linha discreta (regra da casa: nunca fazer bater).
 */
import { isPastoAtivoNoMes } from '@/hooks/usePastos';
import { grupoDoTipoUso } from '@/lib/pastos/tiposUso';
import { calcUA } from '@/lib/calculos/zootecnicos';
import {
  cabecasMediaPeriodoFromRows, computePeriodGmd, pesoMedioPonderadoFromRows,
} from '@/lib/calculos/painelConsultorIndicadores';

export type GrupoAtividade = 'pecuaria' | 'agricultura' | 'silvicultura' | 'cana' | 'nao_produtiva';
export const GRUPOS_ATIVIDADE: ReadonlyArray<GrupoAtividade> = ['pecuaria', 'agricultura', 'silvicultura', 'cana', 'nao_produtiva'];
export const ROTULO_GRUPO: Record<GrupoAtividade, string> = {
  pecuaria: 'Pecuária', agricultura: 'Agricultura', silvicultura: 'Silvicultura', cana: 'Cana-de-açúcar', nao_produtiva: 'Não produtiva',
};
/** Base cria, topo vedado (a ordem das colunas empilhadas e da legenda). */
export type FasePecuaria = 'cria' | 'recria' | 'engorda' | 'reforma_pecuaria' | 'vedado';
export const FASES_PECUARIA: ReadonlyArray<FasePecuaria> = ['cria', 'recria', 'engorda', 'reforma_pecuaria', 'vedado'];
export const ROTULO_FASE: Record<string, string> = {
  cria: 'Cria', recria: 'Recria', engorda: 'Engorda', reforma_pecuaria: 'Reforma', vedado: 'Vedado',
};
/** Nao produtiva: reserva, APP, benfeitorias — sempre nesta ordem, por ultimo. */
export const TIPOS_NAO_PRODUTIVA: ReadonlyArray<string> = ['reserva', 'app', 'benfeitorias'];
export const ROTULO_NAO_PRODUTIVA: Record<string, string> = { reserva: 'Reserva', app: 'APP', benfeitorias: 'Benfeitorias' };

export const SEM_FECHAMENTO = 'sem_fechamento';
export const SEM_CULTURA = 'sem cultura';
const KG_POR_ARROBA = 30;

export interface PastoDoResumo {
  id: string; nome: string; tipo_uso: string | null; area_produtiva_ha: number | null;
  ativo: boolean; data_inicio?: string | null; data_fim?: string | null;
}
export interface CardDoResumo { id: string; pasto_id: string; ano_mes: string; status: string; tipo_uso_mes: string | null }
export interface ItemDoResumo { fechamento_id: string; quantidade: number; peso_medio_kg: number | null }
export interface LinhaCacheDoResumo {
  ano: number; mes: number; saldo_inicial: number | null; saldo_final: number | null;
  peso_total_final: number | null; producao_biologica: number | null; dias_mes: number | null;
}

/** Os nomes antigos ("reserva legal", "reforma pecuaria") viram os da lista oficial (`tiposUso.ts`). */
export function normalizarTipoUso(t: string | null | undefined): string {
  if (!t) return '';
  const n = t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '_');
  if (n === 'reserva_legal') return 'reserva';
  return n;
}

/** O grupo de uma atividade. Divergencia (e tipo desconhecido) = nenhum grupo. */
export function grupoDaAtividade(tipo: string): GrupoAtividade | null {
  const g = grupoDoTipoUso(tipo);
  if (g === 'pecuaria' || g === 'agricultura' || g === 'silvicultura') return g;
  if (g === 'ambiental' || g === 'infraestrutura') return 'nao_produtiva';
  return null;
}

/** A atividade do pasto NAQUELE mes: o tipo do card; card sem tipo -> o cadastro; sem card -> sem fechamento. */
export function atividadeNoMes(pasto: PastoDoResumo, card: CardDoResumo | undefined): string {
  if (!card) return SEM_FECHAMENTO;
  return normalizarTipoUso(card.tipo_uso_mes) || normalizarTipoUso(pasto.tipo_uso) || SEM_FECHAMENTO;
}

/** Os pastos que contam no mes: ativos, vigentes e fora do pasto de divergencia (ele nao tem area nem atividade). */
export function pastosDoMes(pastos: readonly PastoDoResumo[], anoMes: string): PastoDoResumo[] {
  return pastos.filter(p => p.ativo && normalizarTipoUso(p.tipo_uso) !== 'divergencia' && isPastoAtivoNoMes(p, anoMes));
}

export interface ParteDoResumo {
  chave: string; rotulo: string; areas: number; areaHa: number; cab: number; pesoTotalKg: number;
}
export interface GrupoDoResumo extends ParteDoResumo { grupo: GrupoAtividade; filhas: ParteDoResumo[] }
export interface ResumoDoMes {
  anoMes: string;
  grupos: Record<GrupoAtividade, GrupoDoResumo>;
  /** Pastos vigentes sem card no mes: area fora de toda atividade (nunca entra em denominador). */
  semFechamento: { areas: number; areaHa: number };
  /** Gado em card cujo pasto nao tem atividade (o pasto de divergencia, que tem 0 ha). */
  foraDasAtividades: { cab: number; pesoTotalKg: number };
  totalAreas: number;
  totalAreaHa: number;
}

const parteVazia = (chave: string, rotulo: string): ParteDoResumo => ({ chave, rotulo, areas: 0, areaHa: 0, cab: 0, pesoTotalKg: 0 });

/** A chave da cultura de um pasto de agricultura: as culturas da safra que cobre o mes, ou "sem cultura". */
export function culturaDoPasto(culturas: readonly string[] | undefined): string {
  const lista = [...new Set((culturas ?? []).map(c => c.trim().toLowerCase()).filter(Boolean))].sort();
  return lista.length ? lista.join(' + ') : SEM_CULTURA;
}

const rotuloCultura = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);

export function montarResumoDoMes(entrada: {
  anoMes: string;
  pastos: readonly PastoDoResumo[];
  cards: readonly CardDoResumo[];
  itens: readonly ItemDoResumo[];
  culturasPorPasto?: ReadonlyMap<string, readonly string[]>;
}): ResumoDoMes {
  const { anoMes } = entrada;
  const cardDoPasto = new Map(entrada.cards.filter(c => c.ano_mes === anoMes).map(c => [c.pasto_id, c]));
  const novoGrupo = (g: GrupoAtividade): GrupoDoResumo => ({ ...parteVazia(g, ROTULO_GRUPO[g]), grupo: g, filhas: [] });
  const grupos: Record<GrupoAtividade, GrupoDoResumo> = {
    pecuaria: novoGrupo('pecuaria'), agricultura: novoGrupo('agricultura'), silvicultura: novoGrupo('silvicultura'),
    cana: novoGrupo('cana'), nao_produtiva: novoGrupo('nao_produtiva'),
  };
  for (const f of FASES_PECUARIA) grupos.pecuaria.filhas.push(parteVazia(f, ROTULO_FASE[f]));
  for (const t of TIPOS_NAO_PRODUTIVA) grupos.nao_produtiva.filhas.push(parteVazia(t, ROTULO_NAO_PRODUTIVA[t]));
  const filha = (g: GrupoDoResumo, chave: string, rotulo: string) => {
    let f = g.filhas.find(x => x.chave === chave);
    if (!f) { f = parteVazia(chave, rotulo); g.filhas.push(f); }
    return f;
  };
  const semFechamento = { areas: 0, areaHa: 0 };
  /* pasto -> onde ele caiu (para somar o gado depois) */
  const destino = new Map<string, { g: GrupoDoResumo; f: ParteDoResumo }>();

  for (const p of pastosDoMes(entrada.pastos, anoMes)) {
    const area = Number(p.area_produtiva_ha) || 0;
    const atv = atividadeNoMes(p, cardDoPasto.get(p.id));
    const grupo = atv === SEM_FECHAMENTO ? null : grupoDaAtividade(atv);
    if (!grupo) { semFechamento.areas += 1; semFechamento.areaHa += area; continue; }
    const g = grupos[grupo];
    const f = grupo === 'agricultura'
      ? (() => { const c = culturaDoPasto(entrada.culturasPorPasto?.get(p.id)); return filha(g, c, c === SEM_CULTURA ? 'Sem cultura' : rotuloCultura(c)); })()
      : filha(g, atv, grupo === 'pecuaria' ? (ROTULO_FASE[atv] ?? atv) : (ROTULO_NAO_PRODUTIVA[atv] ?? rotuloCultura(atv)));
    g.areas += 1; g.areaHa += area; f.areas += 1; f.areaHa += area;
    destino.set(p.id, { g, f });
  }

  const foraDasAtividades = { cab: 0, pesoTotalKg: 0 };
  const cardPorId = new Map(entrada.cards.filter(c => c.ano_mes === anoMes).map(c => [c.id, c]));
  for (const it of entrada.itens) {
    const card = cardPorId.get(it.fechamento_id);
    if (!card) continue;
    const q = Number(it.quantidade) || 0;
    const kg = q * (Number(it.peso_medio_kg) || 0);
    const d = destino.get(card.pasto_id);
    if (!d) { foraDasAtividades.cab += q; foraDasAtividades.pesoTotalKg += kg; continue; }
    d.g.cab += q; d.g.pesoTotalKg += kg; d.f.cab += q; d.f.pesoTotalKg += kg;
  }

  const totalAreas = GRUPOS_ATIVIDADE.reduce((s, g) => s + grupos[g].areas, 0);
  const totalAreaHa = GRUPOS_ATIVIDADE.reduce((s, g) => s + grupos[g].areaHa, 0);
  return { anoMes, grupos, semFechamento, foraDasAtividades, totalAreas, totalAreaHa };
}

/** Peso medio, lotacao (UA/ha) e @ em estoque de uma parte, a partir do gado e da area dela. "—" = nulo. */
export function indicadoresDaParte(p: Pick<ParteDoResumo, 'cab' | 'pesoTotalKg' | 'areaHa'>) {
  const pesoMedio = p.cab > 0 ? p.pesoTotalKg / p.cab : null;
  const lotacao = p.areaHa > 0 && p.cab > 0 && pesoMedio != null ? calcUA(p.cab, pesoMedio) / p.areaHa : null;
  const arrobasEstoque = p.cab > 0 ? p.pesoTotalKg / KG_POR_ARROBA : null;
  return { pesoMedio, lotacao, arrobasEstoque };
}

export interface TotalDaPecuaria {
  cab: number | null; pesoMedio: number | null; pesoTotalKg: number | null;
  arrobasEstoque: number | null; arrobasProduzidas: number | null; gmd: number | null; lotacao: number | null;
}

/** O total da pecuaria no mes, do `zoot_mensal_cache` (sem overlay), pelas funcoes canonicas do painel. */
export function totalDaPecuariaDoCache(linhasDoMes: readonly LinhaCacheDoResumo[], areaPecuariaHa: number | null): TotalDaPecuaria {
  if (linhasDoMes.length === 0) {
    return { cab: null, pesoMedio: null, pesoTotalKg: null, arrobasEstoque: null, arrobasProduzidas: null, gmd: null, lotacao: null };
  }
  const mes = linhasDoMes[0].mes;
  const rows = linhasDoMes.map(r => ({ ...r, mes }));
  const cab = rows.reduce((s, r) => s + (Number(r.saldo_final) || 0), 0);
  const pesoTotalKg = rows.reduce((s, r) => s + (Number(r.peso_total_final) || 0), 0);
  const pesoMedio = pesoMedioPonderadoFromRows(rows);
  const prodBio = rows.reduce((s, r) => s + (Number(r.producao_biologica) || 0), 0);
  const cabMedia = cabecasMediaPeriodoFromRows(rows, mes);
  const dias = Number(rows[0].dias_mes) || 0;
  /* o mes sozinho na posicao 0; as outras posicoes nao somam nada (dias 0, producao NaN) */
  const vazio = (v: number) => Array.from({ length: 12 }, (_x, i) => (i === 0 ? v : NaN));
  const gmd = cabMedia != null ? computePeriodGmd(vazio(prodBio), vazio(cabMedia), Array.from({ length: 12 }, (_x, i) => (i === 0 ? dias : 0)))[0] : NaN;
  const lotacao = areaPecuariaHa && areaPecuariaHa > 0 && pesoMedio != null ? calcUA(cab, pesoMedio) / areaPecuariaHa : null;
  return {
    cab, pesoMedio, pesoTotalKg,
    arrobasEstoque: pesoTotalKg / KG_POR_ARROBA,
    arrobasProduzidas: prodBio / KG_POR_ARROBA,
    gmd: Number.isFinite(gmd) ? gmd : null,
    lotacao,
  };
}

/** Cabecas do total do cache menos a soma das fases (nunca ajustada). Nulo sem cache. */
export function divergenciaDasFases(total: TotalDaPecuaria, resumo: ResumoDoMes): number | null {
  if (total.cab == null) return null;
  return total.cab - resumo.grupos.pecuaria.cab;
}

/* ── O grafico de colunas: a % da area em cada mes ───────────────────────────────────────────────── */

/** Ini (dez do ano anterior) + os 12 meses do ano civil. */
export function mesesDoAnoCivil(ano: number): string[] {
  return [`${ano - 1}-12`, ...Array.from({ length: 12 }, (_x, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)];
}

export interface ColunaDoMes {
  anoMes: string;
  /** O mes nao tem card nenhum: coluna tracejada vazia. */
  semFechamento: boolean;
  totalHa: number;
  partes: Array<{ chave: string; rotulo: string; areaHa: number; pct: number }>;
}

/** A composicao da area de cada mes. modo 'fazenda': os grupos; modo 'pecuaria': as fases (so' a area pecuaria). */
export function colunasDaArea(entrada: {
  meses: readonly string[];
  modo: 'fazenda' | 'pecuaria';
  pastos: readonly PastoDoResumo[];
  cards: readonly CardDoResumo[];
}): ColunaDoMes[] {
  return entrada.meses.map(anoMes => {
    const doMes = entrada.cards.filter(c => c.ano_mes === anoMes);
    if (doMes.length === 0) return { anoMes, semFechamento: true, totalHa: 0, partes: [] };
    const r = montarResumoDoMes({ anoMes, pastos: entrada.pastos, cards: doMes, itens: [] });
    const partes = entrada.modo === 'fazenda'
      ? GRUPOS_ATIVIDADE.map(g => ({ chave: g, rotulo: ROTULO_GRUPO[g], areaHa: r.grupos[g].areaHa }))
      : FASES_PECUARIA.map(f => ({ chave: f, rotulo: ROTULO_FASE[f], areaHa: r.grupos.pecuaria.filhas.find(x => x.chave === f)?.areaHa ?? 0 }));
    const totalHa = partes.reduce((s, p) => s + p.areaHa, 0);
    return {
      anoMes, semFechamento: false, totalHa,
      partes: partes.map(p => ({ ...p, pct: totalHa > 0 ? (p.areaHa / totalHa) * 100 : 0 })),
    };
  });
}
