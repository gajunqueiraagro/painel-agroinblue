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
 * - `getKey` opcional: paginação por OFFSET só é correta sob ordenação total e
 *   determinística. Se a mesma chave voltar em páginas diferentes, a premissa
 *   foi violada (ordenação não-total ou escrita concorrente) e o resultado é
 *   inconfiável. Nesse caso **lança Error** — nunca deduplica em silêncio, para
 *   não mascarar o problema nem eventual duplicidade real de dado.
 */
/**
 * Teto anti-runaway. NÃO é limite funcional: fica ordens de grandeza acima de
 * qualquer volume real (fechamento_pastos inteiro ~20k linhas). Só existe para
 * que um filtro mal aplicado falhe alto em vez de paginar indefinidamente.
 */
export const MAX_ROWS = 200_000;

/**
 * Valores por lote em filtros `.in(...)`. Cada UUID custa ~37 chars na URL;
 * 150 => ~5,5 KB, ~30% de folga sobre o `urlLengthLimit` de 8000 do
 * postgrest-js (que não faz fallback para POST — a request simplesmente falha).
 */
export const ID_LOTE_SIZE = 150;

export interface FetchAllPaginatedOptions<T = any> {
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
  /** Extrai a chave única da linha. Chave repetida entre páginas => Error. */
  getKey?: (row: T) => string | null | undefined;
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
  opts: FetchAllPaginatedOptions<T>,
): Promise<FetchAllPaginatedResult<T>> {
  const pageSize = opts.pageSize ?? 1000;
  const data: T[] = [];
  const seen = opts.getKey ? new Set<string>() : null;
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

    if (seen && opts.getKey) {
      for (const row of page as T[]) {
        const key = opts.getKey(row);
        if (key == null) continue;
        if (seen.has(key)) {
          const ctx = opts.context ? ` (${opts.context})` : '';
          throw new Error(
            `fetchAllPaginated recebeu a chave "${key}" em mais de uma página${ctx}: ordenação não é total/determinística ou houve escrita concorrente; resultado descartado.`,
          );
        }
        seen.add(key);
      }
    }

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

/**
 * fetchAllPaginatedEmLotes — mesmo contrato de `fetchAllPaginated`, aplicado uma
 * vez por lote de `valores`.
 *
 * MOTIVAÇÃO
 * ─────────
 * Filtros do tipo `.in('col', valores)` colocam cada valor na URL. O
 * postgrest-js corta em `urlLengthLimit` (default 8000 chars) e proxies também
 * limitam — lista grande vira request abortado/414. Quebrar em lotes resolve a
 * URL, mas **cada lote continua sujeito ao corte de 1.000 linhas**: N valores
 * podem devolver muito mais que N linhas. Por isso cada lote é paginado.
 *
 * Genérico por design: não conhece tabela, coluna nem regra de negócio — recebe
 * uma lista opaca de valores e uma factory que monta a query daquele lote.
 * Erro em qualquer lote/página aborta tudo (o Error sobe) — nunca parcial.
 */
export async function fetchAllPaginatedEmLotes<T = any>(
  valores: readonly string[],
  loteSize: number,
  opts: Omit<FetchAllPaginatedOptions<T>, 'query'> & { query: (lote: string[]) => any },
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < valores.length; i += loteSize) {
    const lote = valores.slice(i, i + loteSize);
    const res = await fetchAllPaginated<T>({ ...opts, query: () => opts.query(lote) });
    if (res.aborted) return out;
    out.push(...res.data);
  }
  return out;
}
