/**
 * FIN-CLASSIF-DIVIDIDA-01a-2 — a classificacao do lancamento em N partes (contas), lida pela tela.
 *
 * Quem SOMA por classificacao le a visao unica `vw_fin_classificacao_por_parte` (1 linha por parte, com o valor e a classificacao da
 * parte; lancamento sem divisao = ele mesmo, uma linha). Quem mostra MOVIMENTOS (extrato da conta, painel por periodo: uma linha por
 * lancamento, saldo corrido, editar) continua no lancamento e, so' para a distribuicao economica, abre os divididos em partes
 * (`carregarPartes` + `porParte`): o mesmo movimento, repartido pelo valor de cada parte.
 *
 * ⚠ REGRA DO ID (para os blocos de tela 01b/01c): na visao, a parte 2+ chega com a chave "id#2", "id#3"…; abrir/editar o lancamento e'
 * SEMPRE por `lancamento_id` (nunca pelo `id` da linha da parte).
 */
import { supabase } from '@/integrations/supabase/client';

export const FONTE_POR_PARTE = 'vw_fin_classificacao_por_parte';

/** A chave da linha: o lancamento na parte 1 (e sem divisao); "id#n" nas demais, para nada se repetir (dedup, chave da lista). */
export function chaveDaParte(r: { id?: string; parte_ordem?: number | null }): string {
  return r.parte_ordem && r.parte_ordem > 1 ? `${r.id}#${r.parte_ordem}` : String(r.id);
}

export interface ParteDaClassificacao {
  lancamento_id: string; ordem: number; valor: number;
  macro_custo: string | null; grupo_custo: string | null; centro_custo: string | null; subcentro: string | null; escopo_negocio: string | null;
}

/** As partes dos lancamentos DIVIDIDOS (so' os ids marcados; sem nenhum, nenhuma consulta). */
export async function carregarPartes(idsDivididos: readonly string[]): Promise<Map<string, ParteDaClassificacao[]>> {
  const m = new Map<string, ParteDaClassificacao[]>();
  const ids = Array.from(new Set(idsDivididos));
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await (supabase as any).from('financeiro_lancamento_partes')
      .select('lancamento_id, ordem, valor, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio')
      .in('lancamento_id', ids.slice(i, i + 200)).order('ordem', { ascending: true });
    if (error) throw error;
    for (const p of (data ?? []) as ParteDaClassificacao[]) {
      const lista = m.get(p.lancamento_id) ?? [];
      lista.push(p);
      m.set(p.lancamento_id, lista);
    }
  }
  return m;
}

/**
 * Um item (movimento de valor `mov`) repartido pelas partes do lancamento: cada parte leva `mov × parte/total`, a ultima fecha o
 * centavo. Sem partes, o proprio item.
 */
export function porParte<T>(item: T, partes: readonly ParteDaClassificacao[] | undefined, mov: number,
                            comParte: (p: ParteDaClassificacao, movDaParte: number) => T): T[] {
  if (!partes || partes.length === 0) return [item];
  const total = partes.reduce((s, p) => s + Number(p.valor), 0);
  if (!(total > 0)) return [item];
  let acum = 0;
  return partes.map((p, i) => {
    const m = i < partes.length - 1 ? Math.round((mov * Number(p.valor) / total) * 100) / 100 : Math.round((mov - acum) * 100) / 100;
    acum += m;
    return comParte(p, m);
  });
}
