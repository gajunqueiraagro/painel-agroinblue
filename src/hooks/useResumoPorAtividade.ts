/**
 * RESUMO-ATIVIDADE-01a — o que a tela Resumo por Atividade le^ ALEM do que o Fechamento Area ja' tem carregado.
 *
 * O Fechamento ja' entrega os pastos, os cards e itens do mes, a fita de status, as culturas da safra que cobre o mes.
 * Faltam tres leituras, todas por fazenda:
 *   1. os cards de Ini (dez do ano anterior) a dez do ano — so' `pasto_id`, `ano_mes`, `status`, `tipo_uso_mes` — para as
 *      colunas da % da area mes a mes (~85 pastos x 13 meses: passa de 1.000 linhas, entao PAGINA);
 *   2. as linhas do `zoot_mensal_cache` do ano (cenario realizado), CRUAS — sem `aplicarOverlayFechamento` (decisao D4: a
 *      mesma fonte do DRE). Todos os leitores do cache que ja' existem aplicam o overlay, por isso esta leitura e' propria;
 *   3. a `area_pecuaria_ha` do `fechamento_area_snapshot` do mes (a lotacao do total).
 * Leitura com `(supabase as any)` (as tres tabelas estao fora do `types.ts` ou com tipo divergente) e leitor sem cast.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { lerTodasAsPaginas } from '@/v2/lib/importLanc/lerTodasAsPaginas';
import { mesesDoAnoCivil, type CardDoResumo, type LinhaCacheDoResumo } from '@/lib/fechamento/resumoPorAtividade';

const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numero = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null;

export function lerCardDoResumo(v: unknown): CardDoResumo | null {
  const o = objeto(v);
  if (!o) return null;
  const id = texto(o.id), pasto = texto(o.pasto_id), anoMes = texto(o.ano_mes), status = texto(o.status);
  if (!id || !pasto || !anoMes || !status) return null;
  return { id, pasto_id: pasto, ano_mes: anoMes, status, tipo_uso_mes: texto(o.tipo_uso_mes) };
}

export function lerLinhaDoCache(v: unknown): LinhaCacheDoResumo | null {
  const o = objeto(v);
  const ano = o ? numero(o.ano) : null, mes = o ? numero(o.mes) : null;
  if (!o || ano == null || mes == null) return null;
  return {
    ano, mes,
    saldo_inicial: numero(o.saldo_inicial), saldo_final: numero(o.saldo_final),
    peso_total_final: numero(o.peso_total_final), producao_biologica: numero(o.producao_biologica),
    dias_mes: numero(o.dias_mes),
  };
}

export function useResumoPorAtividade(fazendaId: string | null | undefined, ano: number, anoMes: string) {
  const ativo = !!fazendaId && fazendaId !== '__global__';
  const meses = mesesDoAnoCivil(ano);

  const cards = useQuery({
    queryKey: ['resumo-atividade-cards', fazendaId, ano],
    enabled: ativo,
    queryFn: async (): Promise<CardDoResumo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `(supabase as any)` do repo
      const db = supabase as any;
      const linhas = await lerTodasAsPaginas<unknown>(async (de, ate, contar) => {
        const { data, error, count } = await db.from('fechamento_pastos')
          .select('id, pasto_id, ano_mes, status, tipo_uso_mes', contar ? { count: 'exact' } : undefined)
          .eq('fazenda_id', fazendaId)
          .gte('ano_mes', meses[0]).lte('ano_mes', meses[meses.length - 1])
          .order('ano_mes').order('id')
          .range(de, ate);
        if (error) throw error;
        return { data: Array.isArray(data) ? data : [], count: typeof count === 'number' ? count : null };
      });
      return linhas.map(lerCardDoResumo).filter((c): c is CardDoResumo => c !== null);
    },
  });

  const cache = useQuery({
    queryKey: ['resumo-atividade-cache', fazendaId, ano],
    enabled: ativo,
    queryFn: async (): Promise<LinhaCacheDoResumo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `(supabase as any)` do repo
      const { data, error } = await (supabase as any).from('zoot_mensal_cache')
        .select('ano, mes, saldo_inicial, saldo_final, peso_total_final, producao_biologica, dias_mes')
        .eq('fazenda_id', fazendaId).eq('ano', ano).eq('cenario', 'realizado');
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map(lerLinhaDoCache).filter((l): l is LinhaCacheDoResumo => l !== null);
    },
  });

  const area = useQuery({
    queryKey: ['resumo-atividade-area', fazendaId, anoMes],
    enabled: ativo,
    queryFn: async (): Promise<number | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `(supabase as any)` do repo
      const { data, error } = await (supabase as any).from('fechamento_area_snapshot')
        .select('area_pecuaria_ha').eq('fazenda_id', fazendaId).eq('ano_mes', `${anoMes}-01`).maybeSingle();
      if (error) throw error;
      const o = objeto(data);
      return o ? numero(o.area_pecuaria_ha) : null;
    },
  });

  return {
    meses,
    cardsDoAno: cards.data ?? [],
    cacheDoAno: cache.data ?? [],
    areaPecuariaHa: area.data ?? null,
    lendo: cards.isLoading || cache.isLoading || area.isLoading,
    erro: cards.error || cache.error || area.error ? 'Não foi possível ler os dados do resumo.' : null,
  };
}
