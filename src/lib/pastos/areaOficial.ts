/**
 * PASTO-AREA-OFICIAL-01 · tela — a ÁREA OFICIAL do pasto × a área do MAPA, e o "Usar área do mapa" (regra 1 do plano de 01/11).
 *
 * A área oficial é a do cadastro (lotação, fechamento, DRE); a do mapa é MEDIÇÃO — o banco mede o polígono gravado (a fórmula do turf
 * em `_fn_area_geodesica_ha`), a tela não manda área nenhuma. Tudo passa pelas funções da 116120:
 *  · `fn_pastos_area_comparar(fazenda, 'AAAA-MM')` — oficial do mês × mapa × diferença, a última mudança (para desfazer) e a trava do mês;
 *  · `fn_pasto_area_usar_mapa(pastos[], mês, motivo, p_simular)` — um ou um lote, tudo ou nada; a PRÉVIA traz, pasto a pasto, antes ×
 *    mapa e a lotação (UA/ha) antes × depois; a tela só grava o que a prévia mostrou;
 *  · `fn_pasto_area_desfazer(vigências[], motivo, p_simular)` — a área volta à de antes (a linha fica na trilha, marcada).
 * ⚠ Vale de UM MÊS EM DIANTE (o escolhido, aberto, até o atual), nunca para trás; o mês travado o banco recusa com a frase pronta.
 */
import { supabase } from '@/integrations/supabase/client';
import { fraseDoErro } from '@/lib/patrimonio/patrimonio';
import type { Resultado } from '@/lib/pastos/gruposDePastejo';

export interface LinhaDeArea {
  pastoId: string;
  nome: string;
  ativo: boolean;
  oficial: number | null;
  mapa: number | null;
  nPoligonos: number;
  difHa: number | null;
  difPct: number | null;
  ultimaId: string | null;
  ultimaOrigem: 'mapa' | 'manual' | 'cadastro' | null;
  ultimaDesde: string | null;
  ultimaAnterior: number | null;
  trava: string | null;
}

export interface ItemDaPrevia {
  pastoId: string;
  nome: string;
  situacao: 'muda' | 'igual' | 'recusa';
  motivo: string | null;
  antes: number | null;
  mapa: number | null;
  difHa: number | null;
  difPct: number | null;
  lotacaoMes: string | null;
  uaHaAntes: number | null;
  uaHaDepois: number | null;
}

export interface PreviaDoMapa { ok: boolean; nMuda: number; nIgual: number; nRecusa: number; itens: ItemDaPrevia[] }

export interface ItemDoDesfazer { vigenciaId: string; nome: string; area: number | null; voltaPara: number | null; recusa: string | null }
export interface PreviaDoDesfazer { ok: boolean; itens: ItemDoDesfazer[] }

/* ── leitura da resposta (jsonb), sem `as` ──────────────────────────────────────────────────────────────────────────────────────── */
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const ORIGENS: readonly NonNullable<LinhaDeArea['ultimaOrigem']>[] = ['mapa', 'manual', 'cadastro'];
const origem = (v: unknown): LinhaDeArea['ultimaOrigem'] => ORIGENS.find((o) => o === v) ?? null;
const SITUACOES: readonly ItemDaPrevia['situacao'][] = ['muda', 'igual', 'recusa'];
const situacao = (v: unknown): ItemDaPrevia['situacao'] => SITUACOES.find((s) => s === v) ?? 'recusa';

export function lerLinhas(v: unknown): LinhaDeArea[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((e) => {
    if (!ehObjeto(e)) return [];
    const id = texto(e.pasto_id); const nome = texto(e.nome);
    if (!id || nome === null) return [];
    return [{
      pastoId: id, nome, ativo: e.ativo !== false, oficial: numero(e.area_oficial_ha), mapa: numero(e.area_mapa_ha),
      nPoligonos: numero(e.n_poligonos) ?? 0, difHa: numero(e.dif_ha), difPct: numero(e.dif_pct), ultimaId: texto(e.ultima_vigencia_id),
      ultimaOrigem: origem(e.ultima_origem), ultimaDesde: texto(e.ultima_desde), ultimaAnterior: numero(e.ultima_anterior_ha), trava: texto(e.trava),
    }];
  });
}

export function lerPreviaDoMapa(v: unknown): Resultado<PreviaDoMapa> {
  if (!ehObjeto(v) || !Array.isArray(v.itens)) return { ok: false, erro: 'Não consegui ler a resposta do banco. Nada foi gravado.' };
  const itens = v.itens.flatMap((i): ItemDaPrevia[] => {
    if (!ehObjeto(i)) return [];
    const id = texto(i.pasto_id);
    return id ? [{
      pastoId: id, nome: texto(i.nome) ?? '', situacao: situacao(i.situacao), motivo: texto(i.motivo), antes: numero(i.area_antes),
      mapa: numero(i.area_mapa), difHa: numero(i.dif_ha), difPct: numero(i.dif_pct), lotacaoMes: texto(i.lotacao_mes),
      uaHaAntes: numero(i.ua_ha_antes), uaHaDepois: numero(i.ua_ha_depois),
    }] : [];
  });
  return { ok: true, dados: { ok: v.ok === true, nMuda: numero(v.n_muda) ?? 0, nIgual: numero(v.n_igual) ?? 0, nRecusa: numero(v.n_recusa) ?? 0, itens } };
}

export function lerPreviaDoDesfazer(v: unknown): Resultado<PreviaDoDesfazer> {
  if (!ehObjeto(v) || !Array.isArray(v.itens)) return { ok: false, erro: 'Não consegui ler a resposta do banco. Nada foi gravado.' };
  const itens = v.itens.flatMap((i): ItemDoDesfazer[] => {
    if (!ehObjeto(i)) return [];
    const id = texto(i.vigencia_id);
    return id ? [{ vigenciaId: id, nome: texto(i.nome) ?? '', area: numero(i.area_ha), voltaPara: numero(i.volta_para), recusa: texto(i.recusa) }] : [];
  });
  return { ok: true, dados: { ok: v.ok === true, itens } };
}

/* ── as contas da tela (puras) ───────────────────────────────────────────────────────────────────────────────────────────────── */

/** Pode ir para o "Usar área do mapa": tem área do mapa, não está travado e a oficial é outra. */
export const podeUsarMapa = (l: LinhaDeArea): boolean => l.mapa != null && l.mapa > 0 && !l.trava && l.oficial !== l.mapa;

/** O que a linha diz quando NÃO pode ser marcada (o `title` da caixa). */
export function porQueNaoMarca(l: LinhaDeArea): string | null {
  if (l.trava) return `A área não muda: ${l.trava}.`;
  if (l.nPoligonos === 0) return 'O pasto não tem polígono no mapa.';
  if (l.mapa == null || l.mapa <= 0) return 'O polígono do mapa não tem área.';
  if (l.oficial === l.mapa) return 'A área oficial já é a do mapa.';
  return null;
}

/** Os dois meses que a tela oferece: o atual e o anterior ('AAAA-MM'); o banco recusa o que estiver travado. */
export function mesesOferecidos(hoje: string): [string, string] {
  const [a, m] = hoje.slice(0, 7).split('-').map(Number);
  const ant = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  return [ant, hoje.slice(0, 7)];
}

/** Σ de uma coluna; nenhum com número = sem número. */
export function soma(linhas: readonly LinhaDeArea[], campo: 'oficial' | 'mapa'): number | null {
  const vs = linhas.map((l) => l[campo]).filter((x): x is number => x != null);
  return vs.length ? Math.round(vs.reduce((s, x) => s + x, 0) * 100) / 100 : null;
}

/* ── o banco ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

export interface ApiAreaOficial {
  comparar(fazendaId: string, anoMes: string): Promise<Resultado<LinhaDeArea[]>>;
  usarMapa(pastoIds: string[], anoMes: string, motivo: string, simular: boolean): Promise<Resultado<PreviaDoMapa>>;
  desfazer(vigenciaIds: string[], motivo: string, simular: boolean): Promise<Resultado<PreviaDoDesfazer>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs novas fora do `types.ts` (a exceção do zero-cast, como `patrimonioApi`)
const semTipo: any = supabase;

export const API_AREA_OFICIAL: ApiAreaOficial = {
  async comparar(fazendaId, anoMes) {
    const { data, error } = await semTipo.rpc('fn_pastos_area_comparar', { p_fazenda: fazendaId, p_ano_mes: anoMes });
    if (error) return { ok: false, erro: fraseDoErro(error, 'Não consegui ler as áreas. Tente de novo.') };
    return { ok: true, dados: lerLinhas(data) };
  },
  async usarMapa(pastoIds, anoMes, motivo, simular) {
    const { data, error } = await semTipo.rpc('fn_pasto_area_usar_mapa', { p_pastos: pastoIds, p_vigente_desde: `${anoMes}-01`, p_motivo: motivo, p_simular: simular });
    if (error) return { ok: false, erro: fraseDoErro(error) };
    return lerPreviaDoMapa(data);
  },
  async desfazer(vigenciaIds, motivo, simular) {
    const { data, error } = await semTipo.rpc('fn_pasto_area_desfazer', { p_vigencias: vigenciaIds, p_motivo: motivo, p_simular: simular });
    if (error) return { ok: false, erro: fraseDoErro(error) };
    return lerPreviaDoDesfazer(data);
  },
};
