/**
 * MAPA-GLOBAL-01 — o Geo Pastos em Global: o resumo de todas as fazendas do cliente no MESMO mês (D1).
 * D2 (fonte única): cada fazenda sai da MESMA fonte e da MESMA regra do Gestor dela — `useMapaDoMes` (agora para N fazendas) +
 * `resumoDosPastos` (só os pastos COM polígono, vigentes no mês; Q2 de 31/10). O total do cliente é a mesma regra sobre todos os pastos
 * (lotação = kg total ÷ área total, nunca média das médias). Nada some em silêncio: as cabeças em pastos vigentes SEM polígono viram o
 * aviso "N cab em pastos sem mapa" (Q2), por fazenda e no total.
 * D4: "pedem atenção" = carga alta (> 500), sem fechamento no mês ou vazio.
 */
import { dozeMesesAte, resumoDosPastos, type DadosDoPastoNoMes } from '@/lib/mapa/mapaDoMes';
import { uaPorHa, type FaixaLotacao } from '@/lib/mapa/faixasLotacao';

export type Situacao = FaixaLotacao | 'sem_fechamento';
export const SITUACOES: Situacao[] = ['carga_alta', 'sublotado', 'ideal', 'vazio', 'sem_fechamento'];
export const ATENCAO: ReadonlySet<Situacao> = new Set<Situacao>(['carga_alta', 'sem_fechamento', 'vazio']);

export interface FazendaDoGlobal { id: string; codigo: string; nome: string }
export interface PastoDoGlobal { id: string; fazenda_id: string; nome: string; area_produtiva_ha: number | null }

export interface EntradaGlobal {
  anoMes: string;
  fazendas: readonly FazendaDoGlobal[];
  /** Os pastos VIGENTES no mês (os do `useMapaDoMes`). */
  vigentes: readonly PastoDoGlobal[];
  /** Os pastos que têm polígono no mapa (`fazenda_geometrias` tipo pasto). */
  comPoligono: ReadonlySet<string>;
  /** As fazendas com algum polígono (sem nenhum = "sem mapa · Importar"). */
  fazendasComMapa: ReadonlySet<string>;
  dados: ReadonlyMap<string, DadosDoPastoNoMes>;
}

export interface PontoDaSerie { anoMes: string; kgHa: number | null }

export interface LinhaDaFazenda {
  fazenda: FazendaDoGlobal;
  temMapa: boolean;
  /** Pastos com polígono, vigentes no mês. */
  pastos: number;
  area: number | null;
  cabecas: number | null;
  pesoMedio: number | null;
  kgHa: number | null;
  uaHa: number | null;
  /** Pastos (com polígono) sem fechamento no mês. */
  semFechamento: number;
  contagem: Record<Situacao, number>;
  areaPorSituacao: Record<Situacao, number>;
  serie: PontoDaSerie[];
  cabecasPorAtividade: Map<string, number>;
  /** Cabeças do mês em pastos vigentes SEM polígono (o aviso "N cab em pastos sem mapa"). */
  cabecasSemMapa: number;
}

export interface LinhaDoPasto {
  pastoId: string;
  fazenda: FazendaDoGlobal;
  nome: string;
  atividade: string | null;
  area: number | null;
  cabecas: number | null;
  pesoMedio: number | null;
  kgHa: number | null;
  situacao: Situacao;
}

export function situacaoDoPasto(d: DadosDoPastoNoMes | undefined): Situacao {
  if (!d || !d.temFechamento) return 'sem_fechamento';
  return d.faixa ?? 'sem_fechamento';
}

const zeros = (): Record<Situacao, number> => ({ carga_alta: 0, sublotado: 0, ideal: 0, vazio: 0, sem_fechamento: 0 });

/** A série de 12 meses (D2): kg/ha do mês m = Σ kg dos pastos com fechamento em m ÷ Σ área desses pastos (a do histórico do painel). */
export function serieDosPastos(anoMes: string, pastoIds: readonly string[], dados: ReadonlyMap<string, DadosDoPastoNoMes>,
  areaDe: (id: string) => number | null | undefined): PontoDaSerie[] {
  return dozeMesesAte(anoMes).map((m, i) => {
    let kg = 0; let area = 0; let algum = false;
    for (const id of pastoIds) {
      const h = dados.get(id)?.historico[i];
      if (!h || h.anoMes !== m || h.pesoTotalKg == null) continue;
      const a = areaDe(id) ?? 0;
      if (a <= 0) continue;
      algum = true; kg += h.pesoTotalKg; area += a;
    }
    return { anoMes: m, kgHa: algum && area > 0 ? kg / area : null };
  });
}

function linhaDe(fazenda: FazendaDoGlobal | null, e: EntradaGlobal, vigentes: readonly PastoDoGlobal[], temMapa: boolean): LinhaDaFazenda {
  const areaPorId = new Map(vigentes.map(p => [p.id, p.area_produtiva_ha]));
  const areaDe = (id: string) => areaPorId.get(id);
  const ids = vigentes.filter(p => e.comPoligono.has(p.id)).map(p => p.id);
  const r = resumoDosPastos(ids, e.dados, areaDe);
  const contagem = zeros(); const areaPorSituacao = zeros();
  const cabecasPorAtividade = new Map<string, number>();
  for (const id of ids) {
    const d = e.dados.get(id);
    const s = situacaoDoPasto(d);
    contagem[s]++;
    areaPorSituacao[s] += areaDe(id) ?? 0;
    if (d?.temFechamento && (d.cabecas ?? 0) > 0) {
      const a = d.atividade ?? 'sem_atividade';
      cabecasPorAtividade.set(a, (cabecasPorAtividade.get(a) ?? 0) + (d.cabecas ?? 0));
    }
  }
  let cabecasSemMapa = 0;
  for (const p of vigentes) {
    if (e.comPoligono.has(p.id)) continue;
    const d = e.dados.get(p.id);
    if (d?.temFechamento) cabecasSemMapa += d.cabecas ?? 0;
  }
  return {
    fazenda: fazenda ?? { id: '', codigo: '', nome: '' },
    temMapa,
    pastos: ids.length,
    area: r.area,
    cabecas: r.cabecas,
    pesoMedio: r.pesoMedio,
    kgHa: r.lotacao,
    uaHa: r.cabecas == null ? null : uaPorHa(r.cabecas, r.pesoMedio, r.area),
    semFechamento: contagem.sem_fechamento,
    contagem,
    areaPorSituacao,
    serie: serieDosPastos(e.anoMes, ids, e.dados, areaDe),
    cabecasPorAtividade,
    cabecasSemMapa,
  };
}

/** Uma linha por fazenda (na ordem recebida) e o total do cliente pela MESMA regra (D2). */
export function resumoGlobal(e: EntradaGlobal): { fazendas: LinhaDaFazenda[]; total: LinhaDaFazenda } {
  const fazendas = e.fazendas.map(f => linhaDe(f, e, e.vigentes.filter(p => p.fazenda_id === f.id), e.fazendasComMapa.has(f.id)));
  const ids = new Set(e.fazendas.map(f => f.id));
  const total = linhaDe(null, e, e.vigentes.filter(p => ids.has(p.fazenda_id)), e.fazendasComMapa.size > 0);
  return { fazendas, total };
}

/** Todos os pastos (com polígono) do cliente, para a visão "Pastos" e para "Pedem atenção". */
export function pastosDoGlobal(e: EntradaGlobal): LinhaDoPasto[] {
  const fz = new Map(e.fazendas.map(f => [f.id, f]));
  const out: LinhaDoPasto[] = [];
  for (const p of e.vigentes) {
    const fazenda = fz.get(p.fazenda_id);
    if (!fazenda || !e.comPoligono.has(p.id)) continue;
    const d = e.dados.get(p.id);
    out.push({
      pastoId: p.id, fazenda, nome: p.nome, atividade: d?.temFechamento ? d.atividade : null,
      area: p.area_produtiva_ha, cabecas: d?.temFechamento ? d.cabecas : null, pesoMedio: d?.temFechamento ? d.pesoMedioKg : null,
      kgHa: d?.temFechamento ? d.kgHa : null, situacao: situacaoDoPasto(d),
    });
  }
  return out;
}

/** D4: carga alta, sem fechamento ou vazio; kg/ha decrescente (sem kg/ha por último), depois fazenda e nome. */
export function pedemAtencao(pastos: readonly LinhaDoPasto[]): LinhaDoPasto[] {
  return ordenarLinhas(pastos.filter(p => ATENCAO.has(p.situacao)), p => p.kgHa, 'desc',
    (a, b) => a.fazenda.codigo.localeCompare(b.fazenda.codigo, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
}

export type Direcao = 'asc' | 'desc';

/** Ordena por um valor (número ou texto); "—" (null) sempre por último, nos dois sentidos; empate pelo desempate. */
export function ordenarLinhas<T>(linhas: readonly T[], valor: (l: T) => number | string | null | undefined, dir: Direcao,
  desempate?: (a: T, b: T) => number): T[] {
  const s = dir === 'asc' ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const va = valor(a); const vb = valor(b);
    const na = va == null; const nb = vb == null;
    if (na || nb) return na === nb ? (desempate?.(a, b) ?? 0) : na ? 1 : -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true });
    return c !== 0 ? c * s : (desempate?.(a, b) ?? 0);
  });
}

/** Os filtros da visão "Pastos" (chips) com a contagem. */
export type FiltroDePastos = 'todos' | Situacao;
export function contagemDosFiltros(pastos: readonly LinhaDoPasto[]): Record<FiltroDePastos, number> {
  const c: Record<FiltroDePastos, number> = { todos: pastos.length, ...zeros() };
  for (const p of pastos) c[p.situacao]++;
  return c;
}
