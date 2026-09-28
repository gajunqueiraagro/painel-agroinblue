/**
 * AS DUAS LEITURAS DA "LEITURA DOS ANOS" QUE NÃO SAEM DO DRE — DRE-CASCATA-MODAL-01.
 *
 * ⚠ O GMD NÃO EXISTE EM RPC NENHUMA DO DRE, e não foi criado (decisão 4, opção a): a fórmula é a
 * oficial do PC-100, `computePeriodGmd`, sobre o `zoot_mensal_cache` — a MESMA que o Painel do
 * Consultor e o histórico do zootécnico usam. Nenhuma cópia dela em SQL.
 * ⚠ O R$ DA "VENDA GERAL" POR SUBCENTRO (tropa, consumo, hedge) sai da lista de lançamentos que o
 * modal de valor do DRE já lê (`fn_dre_pecuaria_lancamentos`, bloco venda, centro "Venda Geral"): o
 * `centros` do DRE para no centro, e a decisão 7 pede os três em linhas separadas.
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { computePeriodGmd } from '@/lib/calculos/painelConsultorIndicadores';

const PAGINA = 1000;

/** Os meses de um período, em ordem — '2025-07'..'2026-06'. */
export function mesesDoPeriodo(de: string, ate: string): string[] {
  const fora: string[] = [];
  let a = Number(de.slice(0, 4)), m = Number(de.slice(5, 7));
  const aF = Number(ate.slice(0, 4)), mF = Number(ate.slice(5, 7));
  while (a < aF || (a === aF && m <= mF)) {
    fora.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1; if (m > 12) { m = 1; a += 1; }
  }
  return fora;
}

/** O que o GMD precisa de um mês do cache, já somado sobre fazendas e categorias. */
export interface MesGmd { prodKg: number; cabMedia: number }

/**
 * O GMD DE UM PERÍODO — `computePeriodGmd` sobre os meses DELE, em ordem.
 *
 * ⚠ A FUNÇÃO OFICIAL RECEBE ATÉ DOZE POSIÇÕES a partir da primeira: um período de safra (jul→jun) ou
 * um ano parcial (jan→ago) é a mesma conta com o mês inicial trocado. Lê-se a posição do ÚLTIMO mês.
 * ⚠ SEM NENHUM MÊS NO CACHE, AUSÊNCIA — o RRCC de 2021 (CACHE-RRCC-2021-01) sai em "—", não em zero.
 */
export function gmdDoPeriodo(porMes: ReadonlyMap<string, MesGmd>, de: string, ate: string): number | null {
  const meses = mesesDoPeriodo(de, ate).slice(0, 12);
  if (!meses.some(m => porMes.has(m))) return null;
  const prod = meses.map(m => porMes.get(m)?.prodKg ?? NaN);
  const cab = meses.map(m => porMes.get(m)?.cabMedia ?? NaN);
  const dias = meses.map(m => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate());
  const v = computePeriodGmd(prod, cab, dias)[meses.length - 1];
  return v != null && Number.isFinite(v) ? v : null;
}

interface LinhaCacheGmd {
  ano_mes: string | null; producao_biologica: number | null;
  saldo_inicial: number | null; saldo_final: number | null;
}

/**
 * O GMD DE CADA PERÍODO DA LEITURA — uma consulta ao cache para todos os anos.
 *
 * ⚠ PAGINAÇÃO PARALELA COM `count` (regra PERF-VALOR-REBANHO-01): o cache de um cliente em seis anos
 * passa das mil linhas, e o PostgREST corta em mil calado. Sem `count`, serial — nunca a primeira
 * página fingindo ser tudo.
 */
export function useGmdPeriodos(
  clienteId: string | null | undefined, periodos: readonly { de: string; ate: string }[], ativo: boolean,
) {
  const de = periodos.reduce<string | null>((a, p) => (a == null || p.de < a ? p.de : a), null);
  const ate = periodos.reduce<string | null>((a, p) => (a == null || p.ate > a ? p.ate : a), null);
  const { data, isLoading } = useQuery({
    queryKey: ['dre-pec-gmd-cache', clienteId ?? '', de ?? '', ate ?? ''],
    enabled: !!clienteId && !!de && !!ate && ativo,
    queryFn: async (): Promise<Map<string, MesGmd>> => {
      const montar = () => supabase.from('zoot_mensal_cache')
        .select('ano_mes, producao_biologica, saldo_inicial, saldo_final', { count: 'exact' })
        .eq('cliente_id', clienteId ?? '')
        .eq('cenario', 'realizado')
        .gte('ano_mes', de ?? '')
        .lte('ano_mes', ate ?? '')
        .order('ano_mes').order('fazenda_id').order('categoria_codigo');
      const primeira = await montar().range(0, PAGINA - 1);
      if (primeira.error) throw primeira.error;
      const linhas: LinhaCacheGmd[] = [...(primeira.data ?? [])];
      if (linhas.length >= PAGINA) {
        if (primeira.count == null) {
          for (let from = PAGINA; ; from += PAGINA) {
            const { data: pg, error } = await montar().range(from, from + PAGINA - 1);
            if (error) throw error;
            linhas.push(...(pg ?? []));
            if ((pg ?? []).length < PAGINA) break;
          }
        } else {
          const faixas: [number, number][] = [];
          for (let from = PAGINA; from < primeira.count; from += PAGINA) {
            faixas.push([from, Math.min(from + PAGINA, primeira.count) - 1]);
          }
          const paginas = await Promise.all(faixas.map(([a, b]) => montar().range(a, b)));
          for (const pg of paginas) {
            if (pg.error) throw pg.error;
            linhas.push(...(pg.data ?? []));
          }
        }
      }
      /* ⚠ A CABEÇA MÉDIA DO MÊS É (início + fim) ÷ 2 SOBRE A SOMA DAS FAZENDAS — a mesma de
         `useHistoricoZootCache`, que alimenta o histórico do GMD. */
      const acc = new Map<string, { pb: number; ini: number; fim: number }>();
      for (const l of linhas) {
        if (!l.ano_mes) continue;
        const a = acc.get(l.ano_mes) ?? { pb: 0, ini: 0, fim: 0 };
        a.pb += Number(l.producao_biologica) || 0;
        a.ini += Number(l.saldo_inicial) || 0;
        a.fim += Number(l.saldo_final) || 0;
        acc.set(l.ano_mes, a);
      }
      const fora = new Map<string, MesGmd>();
      for (const [m, a] of acc) fora.set(m, { prodKg: a.pb, cabMedia: (a.ini + a.fim) / 2 });
      return fora;
    },
  });
  return {
    gmds: periodos.map(p => (data ? gmdDoPeriodo(data, p.de, p.ate) : null)),
    carregando: isLoading && ativo,
  };
}

/**
 * O R$ DA "VENDA GERAL" POR SUBCENTRO, POR PERÍODO — só com a aba Desfrute aberta.
 *
 * ⚠ É A LISTA DO MODAL DE VALOR (`fn_dre_pecuaria_lancamentos`), a mesma que abre ao clicar na célula
 * de vendas, agrupada pelo subcentro — nenhuma regra nova de soma.
 */
export function useVendaGeralPorSubcentro(
  clienteId: string | null | undefined, periodos: readonly { de: string; ate: string }[], ativo: boolean,
) {
  const resultados = useQueries({
    queries: periodos.map(p => ({
      queryKey: ['dre-pec-venda-geral', clienteId ?? '', p.de, p.ate],
      enabled: !!clienteId && ativo,
      queryFn: async (): Promise<Map<string, number>> => {
        const { data: r, error } = await (supabase as any).rpc('fn_dre_pecuaria_lancamentos', {
          p_cliente: clienteId, p_fazenda: null, p_bloco: 'venda', p_centro: 'Venda Geral',
          p_de: p.de, p_ate: p.ate, p_cenario: 'realizado',
        });
        if (error) throw error;
        const fora = new Map<string, number>();
        const lista: unknown[] = Array.isArray(r) ? r : [];
        for (const item of lista) {
          const x: Record<string, unknown> = item && typeof item === 'object' ? Object.fromEntries(Object.entries(item)) : {};
          const sub = x.subcentro == null ? '(sem subcentro)' : String(x.subcentro);
          fora.set(sub, (fora.get(sub) ?? 0) + (Number(x.valor) || 0));
        }
        return fora;
      },
    })),
  });
  return resultados.map(r => ({ porSubcentro: r.data ?? null, carregando: r.isLoading && ativo }));
}
