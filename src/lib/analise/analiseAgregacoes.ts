/**
 * analiseAgregacoes — fonte ÚNICA das agregações da Análise Financeira Executiva.
 * PR-FIN-V2-PDF-EXECUTIVO-01 (FASE 2A).
 *
 * Helpers PUROS extraídos verbatim das 4 telas (Evolução, Organização, Distribuição,
 * Maiores Compromissos) para que TELA e PDF consumam exatamente a MESMA regra. Sem
 * apresentação (cores/labels de UI ficam nos componentes). Sem novo cálculo/fonte.
 *
 * Regras compartilhadas: só saídas (mov < 0); exclusão de tesouraria (tipo '3-%');
 * classificação SOMENTE por campos persistidos (macro_custo/escopo_negocio/centro_custo).
 */

export const isTransferencia = (tipo: string) => tipo.startsWith('3-');
const pad2 = (n: number) => String(n).padStart(2, '0');

/* ───────────────────────── 1) Evolução do caixa ───────────────────────── */
export interface LinhaFluxoIn { data: string; mov: number; saldo: number | null; }
export interface PontoEvolucao { dia: string; mov: number; saldo: number; }

export function serieEvolucao(linhas: LinhaFluxoIn[], saldoIni: number | null, ano: number, mes: number): PontoEvolucao[] {
  if (saldoIni === null) return [];
  const movPorDia = new Map<number, number>();
  for (const p of linhas) {
    const dd = Number(p.data.slice(8, 10));
    if (dd) movPorDia.set(dd, (movPorDia.get(dd) ?? 0) + p.mov);
  }
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const pontos: PontoEvolucao[] = [{ dia: 'Início', mov: 0, saldo: saldoIni }];
  let acc = saldoIni;
  for (let d = 1; d <= diasNoMes; d++) { const mv = movPorDia.get(d) ?? 0; acc += mv; pontos.push({ dia: pad2(d), mov: mv, saldo: acc }); }
  return pontos;
}

/* ─────────────────────── 2) Organização (etapas) ─────────────────────── */
export type EtapaId = 'j1' | 'j2' | 'j3';
export type EtapaBucketId = EtapaId | 'fora';
// Janelas móveis de 4 dias (não se sobrepõem). Fonte única das faixas.
export const ETAPAS: { id: EtapaId; ini: number; fim: number }[] = [
  { id: 'j1', ini: 3, fim: 6 },
  { id: 'j2', ini: 8, fim: 11 },
  { id: 'j3', ini: 20, fim: 23 },
];
export const etapaDoDia = (d: number): EtapaId | null => ETAPAS.find((j) => d >= j.ini && d <= j.fim)?.id ?? null;

interface ItemEtapa { mov: number; tipo: string; data: string; }
export function etapasPagamento<T extends ItemEtapa>(itens: T[]): {
  buckets: Record<EtapaBucketId, { total: number; count: number; itens: T[] }>;
  totalGeral: number;
} {
  const buckets: Record<EtapaBucketId, { total: number; count: number; itens: T[] }> = {
    j1: { total: 0, count: 0, itens: [] },
    j2: { total: 0, count: 0, itens: [] },
    j3: { total: 0, count: 0, itens: [] },
    fora: { total: 0, count: 0, itens: [] },
  };
  let totalGeral = 0;
  for (const it of itens) {
    if (it.mov >= 0) continue; // só saídas de caixa (pagamentos)
    if (isTransferencia(it.tipo)) continue; // exclui tesouraria (transferência interna, tipo '3-%')
    const valor = Math.abs(it.mov);
    totalGeral += valor;
    const dd = Number(it.data.slice(8, 10));
    const key: EtapaBucketId = etapaDoDia(dd) ?? 'fora';
    buckets[key].total += valor;
    buckets[key].count += 1;
    buckets[key].itens.push(it);
  }
  return { buckets, totalGeral };
}

/* ────────────────────── 3) Distribuição econômica ────────────────────── */
export type DimensaoEcon = 'macro' | 'negocio';
export const NEGOCIO_LABEL: Record<string, string> = {
  pecuaria: 'Pecuária', agricultura: 'Agricultura', administrativo: 'Administrativo', financeiro: 'Financeiro/Outros',
};
export const semLabelEcon = (dim: DimensaoEcon) => (dim === 'macro' ? 'Sem classificação no plano' : 'Sem classificação');

interface ItemEconAgg { mov: number; tipo: string; macro: string | null; escopo: string | null; centroPlano: string | null; }
export function distribuicaoEconomica<T extends ItemEconAgg>(itens: T[], dimensao: DimensaoEcon): {
  ranking: { chave: string; total: number; count: number; itens: T[] }[];
  totalGeral: number;
  totalClass: number;
  folhaCusteio: number;
} {
  const SEM = semLabelEcon(dimensao);
  const rotulo = (it: T): string | null => {
    if (dimensao === 'macro') return it.macro;
    if (!it.escopo) return null;
    return NEGOCIO_LABEL[it.escopo] ?? (it.escopo.charAt(0).toUpperCase() + it.escopo.slice(1));
  };
  const map = new Map<string, { chave: string; total: number; count: number; itens: T[] }>();
  let totalGeral = 0, totalClass = 0, folhaCusteio = 0;
  for (const it of itens) {
    if (it.mov >= 0) continue; // só saídas de caixa
    if (isTransferencia(it.tipo)) continue; // exclui tesouraria (tipo '3-%')
    const valor = Math.abs(it.mov);
    totalGeral += valor;
    const classif = rotulo(it);
    if (classif) totalClass += valor;
    if (dimensao === 'macro' && it.macro === 'Custeio Produção' && it.centroPlano === 'Mão de Obra') folhaCusteio += valor;
    const chave = classif ?? SEM;
    const e = map.get(chave) ?? { chave, total: 0, count: 0, itens: [] };
    e.total += valor; e.count += 1; e.itens.push(it);
    map.set(chave, e);
  }
  // "Sem classificação" sempre por último; demais por valor desc.
  const ranking = [...map.values()].sort((a, b) =>
    a.chave === SEM ? 1 : b.chave === SEM ? -1 : b.total - a.total);
  return { ranking, totalGeral, totalClass, folhaCusteio };
}

/* ─────────────────── 4) Maiores compromissos (centro) ─────────────────── */
export const TOP_N = 10;
export const SEM_CENTRO = 'Sem centro';

interface ItemCentro { mov: number; tipo: string; centroPlano: string | null; }
export interface BucketCompromisso<T> { chave: string; total: number; count: number; itens: T[]; ehDemais?: boolean; }
export function maioresCompromissos<T extends ItemCentro>(itens: T[]): {
  linhas: BucketCompromisso<T>[];
  top: BucketCompromisso<T>[];
  demais: BucketCompromisso<T> | null;
  totalGeral: number;
} {
  const map = new Map<string, BucketCompromisso<T>>();
  let totalGeral = 0;
  for (const it of itens) {
    if (it.mov >= 0) continue; // só saídas de caixa
    if (isTransferencia(it.tipo)) continue; // exclui tesouraria (tipo '3-%')
    const v = Math.abs(it.mov);
    totalGeral += v;
    const chave = it.centroPlano || SEM_CENTRO;
    const e = map.get(chave) ?? { chave, total: 0, count: 0, itens: [] };
    e.total += v; e.count += 1; e.itens.push(it);
    map.set(chave, e);
  }
  const ordenado = [...map.values()].sort((a, b) => b.total - a.total);
  const top = ordenado.slice(0, TOP_N);
  const cauda = ordenado.slice(TOP_N);
  const demais: BucketCompromisso<T> | null = cauda.length
    ? {
        chave: `Demais (${cauda.length} centro${cauda.length !== 1 ? 's' : ''})`,
        total: cauda.reduce((s, x) => s + x.total, 0),
        count: cauda.reduce((s, x) => s + x.count, 0),
        itens: cauda.flatMap((x) => x.itens),
        ehDemais: true,
      }
    : null;
  const linhas = demais ? [...top, demais] : top;
  return { linhas, top, demais, totalGeral };
}
