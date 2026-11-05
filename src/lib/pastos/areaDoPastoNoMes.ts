/**
 * PASTO-AREA-OFICIAL-02a — a ÁREA de cada pasto em cada MÊS, para os leitores do front que mostram mês passado ou série de meses.
 *
 * A área de HOJE do cadastro (`pastos.area_produtiva_ha`) não serve para mês passado: desde a 116120 a área muda "de um mês em diante".
 * Quem decide é o banco (`fn_pastos_area_do_mes`, 116140): mês com P1 vigente = a área CONGELADA do membro; senão `fn_pasto_area_no_mes`.
 * Uma leitura por fazenda(s) × intervalo de meses (até 36) — o histórico de 12 meses não faz 12 idas.
 *
 * ⚠ A tela nunca refaz a conta da vigência: recebe o mapa pronto e pergunta `areaDe(pastoId, 'AAAA-MM')`. `undefined` = ainda não
 * leu (ou o pasto/mês não veio): o helper cai na área de hoje, como antes — nunca mostra zero no lugar de "não sei".
 * Os helpers que somam área (`areaDoMes.ts`, `calcAreaProdutivaPecuaria`) aceitam o `areaDe` como último parâmetro, opcional.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fraseDoErro } from '@/lib/patrimonio/patrimonio';

/** A área do pasto no mês, ou `undefined` quando não se sabe (o chamador usa a área de hoje). */
export type AreaDoPastoNoMes = (pastoId: string, anoMes: string) => number | null | undefined;

export interface AreaDoMesLida { pastoId: string; anoMes: string; area: number | null; fonte: 'fechado' | 'vigencia' }

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export function lerAreasDoMes(v: unknown): AreaDoMesLida[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((e) => {
    if (!ehObjeto(e) || typeof e.pasto_id !== 'string' || typeof e.ano_mes !== 'string') return [];
    return [{ pastoId: e.pasto_id, anoMes: e.ano_mes, area: numero(e.area_ha), fonte: e.fonte === 'fechado' ? 'fechado' : 'vigencia' }];
  });
}

/** O `areaDe` de uma lista lida: chave `pasto|AAAA-MM`. */
export function areaDeDaLista(linhas: readonly AreaDoMesLida[]): AreaDoPastoNoMes {
  const mapa = new Map(linhas.map((l) => [`${l.pastoId}|${l.anoMes}`, l.area]));
  return (pastoId, anoMes) => (mapa.has(`${pastoId}|${anoMes}`) ? mapa.get(`${pastoId}|${anoMes}`) : undefined);
}

/** A área de um pasto pelo `areaDe` (se ele souber) ou a de hoje (se não). */
export function areaNoMesOuHoje(p: { id?: string; area_produtiva_ha?: number | null }, anoMes: string | undefined, areaDe?: AreaDoPastoNoMes): number {
  if (areaDe && anoMes && p.id) {
    const a = areaDe(p.id, anoMes);
    if (a !== undefined) return a ?? 0;
  }
  return p.area_produtiva_ha ?? 0;
}

/** MAPA-IMPRESSAO-01 — como `areaNoMesOuHoje`, mas SEM área é `null` (nunca 0): a folha impressa escreve "—" (zero é valor real). */
export function areaNoMesOuNada(p: { id?: string; area_produtiva_ha?: number | null }, anoMes: string | undefined, areaDe?: AreaDoPastoNoMes): number | null {
  if (areaDe && anoMes && p.id) {
    const a = areaDe(p.id, anoMes);
    if (a !== undefined) return a;
  }
  return p.area_produtiva_ha ?? null;
}

/** PASTO-AREA-OFICIAL-02b — os pastos com a área DO MÊS no lugar da de hoje (o que o `areaDe` não sabe fica como está). Para telas de um
 *  mês que passam o pasto adiante (o card e o modal do Fechamento): uma troca na entrada, nenhuma conta mudada lá dentro. */
export function comAreaDoMes<P extends { id: string; area_produtiva_ha: number | null }>(pastos: readonly P[], anoMes: string, areaDe: AreaDoPastoNoMes): P[] {
  return pastos.map((p) => {
    const a = areaDe(p.id, anoMes);
    return a === undefined ? p : { ...p, area_produtiva_ha: a };
  });
}

export async function lerAreaDosPastosNoMes(fazendaIds: readonly string[], de: string, ate: string): Promise<AreaDoMesLida[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova fora do `types.ts` (a exceção do zero-cast)
  const { data, error } = await (supabase as any).rpc('fn_pastos_area_do_mes', { p_fazendas: fazendaIds, p_de: de, p_ate: ate });
  if (error) throw new Error(fraseDoErro(error, 'Não consegui ler a área dos pastos por mês.'));
  return lerAreasDoMes(data);
}

/** As áreas das fazendas no intervalo; enquanto não lê (ou se falhar), `areaDe` devolve `undefined` e o chamador usa a de hoje. */
export function useAreaDosPastosNoMes(fazendaIds: readonly string[], de: string | null, ate: string | null) {
  const ids = useMemo(() => [...fazendaIds].filter((x) => x && x !== '__global__').sort(), [fazendaIds]);
  const q = useQuery({
    queryKey: ['pastos-area-do-mes', ids.join(','), de, ate],
    enabled: ids.length > 0 && !!de && !!ate,
    staleTime: 60_000,
    queryFn: () => lerAreaDosPastosNoMes(ids, de ?? '', ate ?? ''),
  });
  const areaDe = useMemo(() => areaDeDaLista(q.data ?? []), [q.data]);
  return { areaDe, carregando: q.isLoading, erro: q.error ? q.error.message : null };
}
