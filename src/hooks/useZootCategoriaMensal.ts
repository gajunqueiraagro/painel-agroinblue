/**
 * Hook: useZootCategoriaMensal
 *
 * ⚠️ USO INTERNO — NÃO IMPORTAR DIRETAMENTE EM TELAS/COMPONENTES.
 * Consumir EXCLUSIVAMENTE via useRebanhoOficial.
 *
 * Exceções permitidas (somente auditoria/conciliação):
 *   - FechamentoTab.tsx
 *   - ConciliacaoTab.tsx
 *
 * Qualquer import fora das exceções acima é uma VIOLAÇÃO arquitetural.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';

export interface ZootCategoriaMensal {
  fazenda_id: string;
  cliente_id: string;
  ano: number;
  mes: number;
  cenario: 'realizado' | 'meta';
  ano_mes: string;        // '2025-03'
  categoria_id: string;
  categoria_codigo: string;
  categoria_nome: string;
  ordem_exibicao: number;
  saldo_inicial: number;
  entradas_externas: number;
  saidas_externas: number;
  evol_cat_entrada: number;
  evol_cat_saida: number;
  saldo_final: number;
  saldo_sistema: number | null;  // cadeia pura de lançamentos, sem override de P1
  saldo_p1: number | null;       // snapshot do fechamento de pastos, null se ausente
  peso_total_inicial: number;
  peso_total_final: number;
  peso_medio_inicial: number | null;
  peso_medio_final: number | null;
  peso_entradas_externas: number;
  peso_saidas_externas: number;
  peso_evol_cat_entrada: number;
  peso_evol_cat_saida: number;
  dias_mes: number;
  gmd: number | null;
  producao_biologica: number;
  /* Quebra por tipo — migration 20260913120000. Chegam pelo `select('*')`
     da query, sem alteracao de consulta. `entradas_externas` continua
     sendo a soma das tres de entrada, e `saidas_externas` das seis de
     saida: as colunas novas detalham, nao substituem.
     OPCIONAL e anulavel: linha de cache anterior ao rebuild traz NULL, e o
     tipo tem de admitir isso — declarar `number` seria mentir sobre o dado e
     obrigaria todo fixture de teste a inventar 18 zeros. */
  cab_nascimento?: number | null;
  cab_compra?: number | null;
  cab_transf_entrada?: number | null;
  cab_abate?: number | null;
  cab_venda?: number | null;
  cab_venda_pe?: number | null;
  cab_transf_saida?: number | null;
  cab_consumo?: number | null;
  cab_morte?: number | null;
  peso_nascimento?: number | null;
  peso_compra?: number | null;
  peso_transf_entrada?: number | null;
  peso_abate?: number | null;
  peso_venda?: number | null;
  peso_venda_pe?: number | null;
  peso_transf_saida?: number | null;
  peso_consumo?: number | null;
  peso_morte?: number | null;
  fonte_oficial_mes: 'fechamento' | 'fallback_movimentacao' | 'projecao' | 'parcial';
}

interface UseZootCategoriaMensalParams {
  ano: number;
  cenario: 'realizado' | 'meta';
  /** Se true, busca todas as fazendas do cliente (visão global) */
  global?: boolean;
  /** Gate do caller (default true). Composto com o guard interno — nunca substitui. */
  enabled?: boolean;
}

export function useZootCategoriaMensal({ ano, cenario, global = false, enabled = true }: UseZootCategoriaMensalParams) {
  const { fazendaAtual, fazendas } = useFazenda();
  const { clienteAtual } = useCliente();
  const fazendaId = fazendaAtual?.id;
  const clienteId = clienteAtual?.id;

  // Se a fazenda selecionada é o sentinel '__global__', tratar como global
  // automaticamente — jamais enviar fazenda_id=eq.__global__ para o banco (retorna 400).
  const effectiveGlobal = global || fazendaId === '__global__';

  // Em global, lista das fazendas reais (sem o sentinel) — usada como filtro explícito
  // .in('fazenda_id', ...) para evitar cache vazio quando a coluna cliente_id estiver
  // ausente/divergente em zoot_mensal_cache.
  const fazendaIdsReais = fazendas
    .map(f => f.id)
    .filter(id => id && id !== '__global__');
  const fazendaIdsKey = fazendaIdsReais.slice().sort().join(',');

  return useQuery({
    queryKey: ['zoot-categoria-mensal', effectiveGlobal ? `global-${clienteId}-${fazendaIdsKey}` : fazendaId, ano, cenario],
    queryFn: async (): Promise<ZootCategoriaMensal[]> => {
      if (!effectiveGlobal && !fazendaId) return [];
      if (effectiveGlobal && !clienteId) return [];
      if (effectiveGlobal && fazendaIdsReais.length === 0) return [];

      if (!effectiveGlobal) {
        const { data, error } = await supabase.rpc('fn_zoot_categoria_mensal' as any, {
          p_fazenda_id: fazendaId,
          p_ano: ano,
        });

        if (error) {
          console.error('useZootCategoriaMensal RPC error:', error);
          return [];
        }

        const rows = (data as unknown as ZootCategoriaMensal[]) || [];
        return rows.filter(r => r.cenario === cenario);
      }

      // ───────────────────────────────────────────────────────────────────────
      // Global: pagina o cache oficial (PostgREST default = 1000) e filtra
      // explicitamente por fazenda_id IN (lista de fazendas do cliente) —
      // não confia em cliente_id da cache.
      //
      // Ensure-on-partial: cache pode estar vazio OU parcialmente populado
      // (ex: tem fazenda A mas não fazenda B após import/migration). Em ambos
      // os casos, disparamos UMA ÚNICA VEZ fn_zoot_cache_rebuild e re-paginamos.
      // Isto NÃO é fallback — a fonte oficial continua sendo zoot_mensal_cache.
      // É ensure operacional: garantir que o cache esteja completo antes de
      // entregar ao consumidor.
      //
      // Critério "fazendas esperadas": fazendas pec ativas com saldo_inicial > 0
      // em Jan(ano). Vem de saldos_iniciais (custo ~10ms). Fazendas esvaziadas
      // (saldo=0) são naturalmente excluídas — não esperamos cache para elas.
      //
      // Por que NÃO usamos fn_zoot_cache_has_gap aqui: ela depende de
      // vw_zoot_categoria_mensal (CTE recursiva ~30s) — inviável em UI.
      // O rebuild direto leva ~2-3s para clientes típicos (1-3 fazendas).
      // ───────────────────────────────────────────────────────────────────────

      const { data: siRows, error: siError } = await supabase
        .from('saldos_iniciais')
        .select('fazenda_id, quantidade')
        .eq('cliente_id', clienteId)
        .eq('ano', ano)
        .eq('mes', 1)
        .in('fazenda_id', fazendaIdsReais);

      if (siError) {
        console.warn('[zoot-cache] saldos_iniciais lookup failed, falling back to legacy guard:', siError);
      }

      const fazendaTotais = new Map<string, number>();
      const siRowsTyped = (siRows ?? []) as Array<{ fazenda_id: string; quantidade: number | null }>;
      for (const r of siRowsTyped) {
        const id = r.fazenda_id;
        const qtd = Number(r.quantidade ?? 0);
        fazendaTotais.set(id, (fazendaTotais.get(id) ?? 0) + qtd);
      }
      const fazendasEsperadas = new Set<string>(
        Array.from(fazendaTotais.entries())
          .filter(([, qtd]) => qtd > 0)
          .map(([id]) => id),
      );

      const PAGE_SIZE = 1000;
      const MAX_ENSURE_ATTEMPTS = 2;
      let attempt = 0;
      while (attempt < MAX_ENSURE_ATTEMPTS) {
        const all: any[] = [];
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from('zoot_mensal_cache' as any)
            .select('*')
            .eq('ano', ano)
            .eq('cenario', cenario)
            .in('fazenda_id', fazendaIdsReais)
            .order('mes')
            .order('ordem_exibicao')
            .range(from, from + PAGE_SIZE - 1);

          if (error) {
            console.error('useZootCategoriaMensal error:', error);
            return [];
          }
          const page = data || [];
          all.push(...page);
          if (page.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }

        const fazendasNoCache = new Set<string>(all.map(r => r.fazenda_id as string));
        const cacheCobreEsperadas = siError
          ? all.length > 0
          : Array.from(fazendasEsperadas).every(id => fazendasNoCache.has(id));

        if (cacheCobreEsperadas || attempt > 0) {
          return all as unknown as ZootCategoriaMensal[];
        }

        const ausentes = Array.from(fazendasEsperadas).filter(id => !fazendasNoCache.has(id));
        if (all.length === 0) {
          console.info('[zoot-cache] empty for', { clienteId, ano, cenario }, '— rebuilding…');
        } else {
          console.warn('[zoot-cache-partial]', {
            clienteId,
            ano,
            cenario,
            esperadas: Array.from(fazendasEsperadas),
            presentes: Array.from(fazendasNoCache),
            ausentes,
          });
        }
        const tRebuild = Date.now();
        const { error: rebuildError } = await supabase.rpc('fn_zoot_cache_rebuild' as any, {
          p_cliente_id: clienteId,
          p_ano: ano,
        });
        if (rebuildError) {
          console.warn('[zoot-cache] fn_zoot_cache_rebuild failed:', rebuildError);
          return [];
        }
        console.info('[zoot-cache] rebuild ok in', Date.now() - tRebuild, 'ms');
        attempt++;
      }
      return [] as unknown as ZootCategoriaMensal[];
    },
    // Guard: se NÃO é global e fazendaId é o sentinel, desliga a query.
    enabled: enabled && (effectiveGlobal ? (!!clienteId && fazendaIdsReais.length > 0) : (!!fazendaId && fazendaId !== '__global__')),
    // staleTime alinhado ao padrão do useZootMensal (30s): a RPC recursiva
    // fn_zoot_categoria_mensal não deve refazer a cada remontagem. Invalidações
    // explícitas (fn_zoot_cache_rebuild / troca de fazenda·ano·cenario na key) seguem valendo.
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Helpers de agregação
// ---------------------------------------------------------------------------

/**
 * Agrupa por mês: retorna Record<mes (1-12), ZootCategoriaMensal[]>
 */
export function groupByMes(rows: ZootCategoriaMensal[]): Record<number, ZootCategoriaMensal[]> {
  const map: Record<number, ZootCategoriaMensal[]> = {};
  for (const r of rows) {
    if (!map[r.mes]) map[r.mes] = [];
    map[r.mes].push(r);
  }
  return map;
}

/**
 * Agrupa por categoria: retorna Record<categoria_id, ZootCategoriaMensal[]>
 */
export function groupByCategoria(rows: ZootCategoriaMensal[]): Record<string, ZootCategoriaMensal[]> {
  const map: Record<string, ZootCategoriaMensal[]> = {};
  for (const r of rows) {
    if (!map[r.categoria_id]) map[r.categoria_id] = [];
    map[r.categoria_id].push(r);
  }
  return map;
}

/**
 * Retorna totais consolidados por mês (soma de todas as categorias).
 * Útil para telas que mostram o rebanho total por mês.
 */
export function totalizarPorMes(rows: ZootCategoriaMensal[]): Record<number, {
  saldo_inicial: number;
  saldo_final: number;
  saldo_sistema: number | null;
  saldo_p1: number | null;
  entradas_externas: number;
  saidas_externas: number;
  evol_cat_entrada: number;
  evol_cat_saida: number;
  peso_total_inicial: number;
  peso_total_final: number;
  /* peso_entradas_externas / peso_saidas_externas NUNCA foram agregados aqui,
     apesar de existirem na linha desde sempre — nenhum consumidor pedia. O
     bloco PESOS TOTAIS — kg e o primeiro. */
  peso_entradas_externas: number;
  peso_saidas_externas: number;
  producao_biologica: number;
  cab_nascimento: number;
  cab_compra: number;
  cab_transf_entrada: number;
  cab_abate: number;
  cab_venda: number;
  cab_venda_pe: number;
  cab_transf_saida: number;
  cab_consumo: number;
  cab_morte: number;
  peso_nascimento: number;
  peso_compra: number;
  peso_transf_entrada: number;
  peso_abate: number;
  peso_venda: number;
  peso_venda_pe: number;
  peso_transf_saida: number;
  peso_consumo: number;
  peso_morte: number;
}> {
  const byMes = groupByMes(rows);
  const result: Record<number, any> = {};

  for (const [mes, cats] of Object.entries(byMes)) {
    // saldo_sistema: null se qualquer categoria do mês tiver null — sem soma parcial
    const todosSistemaValidos = cats.every(c => c.saldo_sistema != null);
    const todosp1Validos = cats.every(c => c.saldo_p1 != null);
    result[Number(mes)] = {
      saldo_inicial: cats.reduce((s, c) => s + c.saldo_inicial, 0),
      saldo_final: cats.reduce((s, c) => s + c.saldo_final, 0),
      saldo_sistema: todosSistemaValidos
        ? cats.reduce((s, c) => s + c.saldo_sistema!, 0)
        : null,
      saldo_p1: todosp1Validos
        ? cats.reduce((s, c) => s + c.saldo_p1!, 0)
        : null,
      entradas_externas: cats.reduce((s, c) => s + c.entradas_externas, 0),
      saidas_externas: cats.reduce((s, c) => s + c.saidas_externas, 0),
      evol_cat_entrada: cats.reduce((s, c) => s + c.evol_cat_entrada, 0),
      evol_cat_saida: cats.reduce((s, c) => s + c.evol_cat_saida, 0),
      peso_total_inicial: cats.reduce((s, c) => s + c.peso_total_inicial, 0),
      peso_total_final: cats.reduce((s, c) => s + c.peso_total_final, 0),
      peso_entradas_externas: cats.reduce((s, c) => s + c.peso_entradas_externas, 0),
      peso_saidas_externas: cats.reduce((s, c) => s + c.peso_saidas_externas, 0),
      producao_biologica: cats.reduce((s, c) => s + c.producao_biologica, 0),
      /* As 18 somam por categoria igual as irmas. `?? 0` porque linha de cache
         anterior ao rebuild traz NULL — e ali zero e a leitura correta: a
         categoria nao movimentou naquele tipo. */
      cab_nascimento: cats.reduce((s, c2) => s + (c2.cab_nascimento ?? 0), 0),
      cab_compra: cats.reduce((s, c2) => s + (c2.cab_compra ?? 0), 0),
      cab_transf_entrada: cats.reduce((s, c2) => s + (c2.cab_transf_entrada ?? 0), 0),
      cab_abate: cats.reduce((s, c2) => s + (c2.cab_abate ?? 0), 0),
      cab_venda: cats.reduce((s, c2) => s + (c2.cab_venda ?? 0), 0),
      cab_venda_pe: cats.reduce((s, c2) => s + (c2.cab_venda_pe ?? 0), 0),
      cab_transf_saida: cats.reduce((s, c2) => s + (c2.cab_transf_saida ?? 0), 0),
      cab_consumo: cats.reduce((s, c2) => s + (c2.cab_consumo ?? 0), 0),
      cab_morte: cats.reduce((s, c2) => s + (c2.cab_morte ?? 0), 0),
      peso_nascimento: cats.reduce((s, c2) => s + (c2.peso_nascimento ?? 0), 0),
      peso_compra: cats.reduce((s, c2) => s + (c2.peso_compra ?? 0), 0),
      peso_transf_entrada: cats.reduce((s, c2) => s + (c2.peso_transf_entrada ?? 0), 0),
      peso_abate: cats.reduce((s, c2) => s + (c2.peso_abate ?? 0), 0),
      peso_venda: cats.reduce((s, c2) => s + (c2.peso_venda ?? 0), 0),
      peso_venda_pe: cats.reduce((s, c2) => s + (c2.peso_venda_pe ?? 0), 0),
      peso_transf_saida: cats.reduce((s, c2) => s + (c2.peso_transf_saida ?? 0), 0),
      peso_consumo: cats.reduce((s, c2) => s + (c2.peso_consumo ?? 0), 0),
      peso_morte: cats.reduce((s, c2) => s + (c2.peso_morte ?? 0), 0),
    };
  }

  return result;
}

/**
 * Retorna lista de categorias únicas presentes nos dados, ordenadas.
 */
export function categoriasUnicas(rows: ZootCategoriaMensal[]): { id: string; codigo: string; nome: string; ordem: number }[] {
  const seen = new Map<string, { id: string; codigo: string; nome: string; ordem: number }>();
  for (const r of rows) {
    if (!seen.has(r.categoria_id)) {
      seen.set(r.categoria_id, {
        id: r.categoria_id,
        codigo: r.categoria_codigo,
        nome: r.categoria_nome,
        ordem: r.ordem_exibicao,
      });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.ordem - b.ordem);
}
