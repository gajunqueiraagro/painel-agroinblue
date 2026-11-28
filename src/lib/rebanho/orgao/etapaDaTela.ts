/**
 * REBANHO-ORGAO-01 F3 v3 (mock v3 aprovado 27/11) — a ESCOLHA da etapa e o STATUS de cada fazenda, puros.
 *   · a etapa: Ano + mês da etapa (maio/novembro em MS; o mês sai do início da etapa no calendário da UF), INDEPENDENTE da fazenda;
 *   · etapa encerrada (prazo < hoje) ou fazenda já declarada = SÓ LEITURA (os números congelados da declaração e o comprovante);
 *   · status da fazenda na etapa: declarada · a declarar · sem rebanho (nem o comprovante nem o sistema têm bovino).
 * A conta congelada (`rebanho_declaracoes.proposta`) vem do banco: lida campo a campo, sem cast (forma errada = null, a tela diz "—").
 */
import { FAIXAS, type Faixa, type PorSexo, type Sexo } from './tipos';
import { prazoDaEtapa, type EtapaDoOrgao } from './montarDeclaracao';
import type { GrupoDoSistema, LinhaDaProposta } from './propostaDaDeclaracao';

export const MESES: readonly string[] = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEXOS: readonly Sexo[] = ['F', 'M'];
/** 'maio' · 'novembro' (o mês do início da etapa). */
export const mesDaEtapa = (e: EtapaDoOrgao): string => MESES[Number(e.inicio.slice(5, 7)) - 1];
export const anoDaEtapa = (e: EtapaDoOrgao): string => e.inicio.slice(0, 4);

/** As etapas de DECLARAÇÃO da UF, em ordem; os anos (mais novo primeiro) e os meses que existem no calendário. */
export function etapasDeDeclaracao(etapas: readonly EtapaDoOrgao[], uf: string | null): EtapaDoOrgao[] {
  return uf ? etapas.filter((e) => e.uf === uf && e.tipo === 'declaracao').sort((a, b) => a.inicio.localeCompare(b.inicio)) : [];
}
export const anosDasEtapas = (es: readonly EtapaDoOrgao[]): string[] => [...new Set(es.map(anoDaEtapa))].sort().reverse();
export const mesesDasEtapas = (es: readonly EtapaDoOrgao[]): string[] =>
  [...new Set(es.map(mesDaEtapa))].sort((a, b) => MESES.indexOf(a) - MESES.indexOf(b));
/** A etapa de um ano e mês (null = não há no calendário). */
export const etapaDe = (es: readonly EtapaDoOrgao[], ano: string, mes: string): EtapaDoOrgao | null =>
  es.find((e) => anoDaEtapa(e) === ano && mesDaEtapa(e) === mes) ?? null;
/** Encerrada = o prazo (com a prorrogação) já passou: abre só para ler. */
export const etapaEncerrada = (e: EtapaDoOrgao, hoje: string): boolean => prazoDaEtapa(e) < hoje;

export type StatusDaFazenda = 'declarada' | 'a_declarar' | 'sem_rebanho';
export const ROTULO_DO_STATUS: Record<StatusDaFazenda, string> = { declarada: 'declarada', a_declarar: 'a declarar', sem_rebanho: 'sem rebanho' };
/** declarada > sem rebanho (comprovante sem bovino E sistema sem bovino; sem comprovante conta só o sistema) > a declarar. */
export function statusDaFazenda(p: { declarada: boolean; bovinosNoComprovante: number | null; bovinosNoSistema: number }): StatusDaFazenda {
  if (p.declarada) return 'declarada';
  return (p.bovinosNoComprovante ?? 0) === 0 && p.bovinosNoSistema === 0 ? 'sem_rebanho' : 'a_declarar';
}

/* ═══ a conta congelada (o que foi declarado) ═══ */
const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const faixa = (v: unknown): Faixa | null => FAIXAS.find((f) => f === v) ?? null;

function linha(v: unknown): LinhaDaProposta | null {
  if (!ehObj(v) || !ehObj(v.sugerido)) return null;
  const f = faixa(v.faixa); const mc = n(v.mortesConsumo); const entra = n(v.entra); const smc = n(v.sugerido.mortesConsumo);
  if (f === null || mc === null || entra === null || smc === null) return null;
  return { faixa: f, iagro: n(v.iagro), nascimentos: n(v.nascimentos), mortesConsumo: mc, passa: n(v.passa), entra, proposto: n(v.proposto),
    sugerido: { nascimentos: n(v.sugerido.nascimentos), mortesConsumo: smc, passa: n(v.sugerido.passa) } };
}
function grupo(v: unknown): GrupoDoSistema | null {
  if (!ehObj(v)) return null;
  const de = faixa(v.de); const ate = faixa(v.ate); const cab = n(v.cab);
  return de === null || ate === null || cab === null ? null : { de, ate, cab, proposto: n(v.proposto), dif: n(v.dif) };
}
function porSexo<T>(v: unknown, ler: (x: unknown) => T | null): PorSexo<T[]> | null {
  if (!ehObj(v)) return null;
  const out: Partial<PorSexo<T[]>> = {};
  for (const s of SEXOS) {
    const xs = v[s];
    if (!Array.isArray(xs)) return null;
    const lidos = xs.map(ler);
    if (lidos.some((x) => x === null)) return null;
    out[s] = lidos.filter((x): x is T => x !== null);
  }
  return out.F && out.M ? { F: out.F, M: out.M } : null;
}
/** A proposta gravada ao marcar como declarado: { referencia, desde, linhas, sistema }. Forma errada = null. */
export function propostaCongelada(v: unknown): { referencia: string | null; linhas: PorSexo<LinhaDaProposta[]>; sistema: PorSexo<GrupoDoSistema[]> } | null {
  if (!ehObj(v)) return null;
  const linhas = porSexo(v.linhas, linha); const sistema = porSexo(v.sistema, grupo);
  if (!linhas || !sistema || linhas.F.length !== 4 || linhas.M.length !== 4) return null;
  return { referencia: typeof v.referencia === 'string' ? v.referencia : null, linhas, sistema };
}
