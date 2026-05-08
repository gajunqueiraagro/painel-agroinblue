/**
 * fetchAllPaginated — helper para queries Supabase que devolvem muitas linhas.
 *
 * MOTIVAÇÃO
 * ─────────
 * O PostgREST (e portanto o supabase-js) corta resposta em **1.000 linhas por
 * default**. Sem paginação explícita, queries em tabelas com muitos registros
 * retornam parcial sem erro — o front recebe dados truncados silenciosamente
 * e exibe estados incompletos. Bugs típicos: anos sumidos em séries históricas,
 * lançamentos faltando em listas, contadores zoot/financeiros divergentes.
 *
 * USO
 * ───
 *   const { data } = await fetchAllPaginated<MeuTipo>({
 *     query: () => supabase
 *       .from('zoot_mensal_cache')
 *       .select('ano, mes, saldo_inicial, saldo_final')
 *       .eq('cliente_id', id)
 *       .gte('ano', 2020),
 *     context: 'historico/zoot',
 *     shouldAbort: () => cancelled,   // opcional, p/ cleanup de useEffect
 *     maxRows: 50000,                 // opcional, trava de segurança
 *   });
 *
 * REGRAS
 * ──────
 * - `query` é uma FACTORY: retorna um builder fresco a cada chamada. O builder
 *   do supabase-js é thenable e pode ser awaitado uma única vez; reaproveitar
 *   instância entre páginas dá comportamento indefinido.
 * - `pageSize` default 1000 (mesmo limite do PostgREST). Sobrescrever apenas
 *   se conhecer o limite custom da deploy/RLS.
 * - `maxRows` opcional: se o total exceder, lança erro (defesa contra runaway
 *   em filtros mal aplicados). Sem `maxRows`, busca até esgotar.
 * - `shouldAbort` opcional: avaliado entre páginas; se retornar `true`, aborta
 *   sem erro e devolve `aborted: true`. Use com a flag `cancelled` de useEffect.
 * - Em erro do supabase, **lança Error** com `context` no message — nunca
 *   retorna parcial silencioso. Caller decide como tratar (try/catch, toast,
 *   limpar estado). Sem fallback automático.
 */
export interface FetchAllPaginatedOptions {
  /** Factory que retorna um builder Supabase **sem** `.range()`/`.limit()` aplicado. */
  query: () => any;
  /** Tamanho da página (default 1000). */
  pageSize?: number;
  /** Trava de segurança contra runaway. Lança erro se total > maxRows. */
  maxRows?: number;
  /** Texto descritivo para o message do Error em caso de falha. */
  context?: string;
  /** Avaliado entre páginas; se true, aborta sem erro. */
  shouldAbort?: () => boolean;
}

export interface FetchAllPaginatedResult<T> {
  /** Linhas acumuladas. */
  data: T[];
  /** True se o loop foi interrompido por `shouldAbort` antes de esgotar. */
  aborted: boolean;
  /** Quantidade de páginas efetivamente buscadas. */
  pages: number;
}

export async function fetchAllPaginated<T = any>(
  opts: FetchAllPaginatedOptions,
): Promise<FetchAllPaginatedResult<T>> {
  const pageSize = opts.pageSize ?? 1000;
  const data: T[] = [];
  let from = 0;
  let pages = 0;

  while (true) {
    if (opts.shouldAbort?.()) {
      return { data, aborted: true, pages };
    }

    const builder = opts.query();
    const { data: page, error } = await builder.range(from, from + pageSize - 1);

    if (error) {
      const ctx = opts.context ? ` (${opts.context})` : '';
      const detail = (error && (error.message || String(error))) || 'erro desconhecido';
      throw new Error(`fetchAllPaginated falhou${ctx}: ${detail}`);
    }

    if (!page || page.length === 0) break;

    data.push(...(page as T[]));
    pages++;

    if (opts.maxRows !== undefined && data.length > opts.maxRows) {
      const ctx = opts.context ? ` (${opts.context})` : '';
      throw new Error(
        `fetchAllPaginated excedeu maxRows=${opts.maxRows}${ctx}; recebidos ${data.length}.`,
      );
    }

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return { data, aborted: false, pages };
}
