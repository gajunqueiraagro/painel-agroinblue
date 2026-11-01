/**
 * REBANHO-LEITURA-01 (Gabriel 01/11/2026) — D1 e D4 no `useRebanhoOficial`.
 *  D1: UMA fazenda lê o `zoot_mensal_cache` só dela (o mesmo caminho do Global) e a linha do mês é MONTADA das categorias; a view
 *      `vw_zoot_fazenda_mensal` e a `fn_zoot_categoria_mensal` não são mais pedidas. A área é a dos pastos ativos e vigentes DA fazenda.
 *  D4: a leitura que falha nunca vira lista vazia — o hook devolve `error` e o `tentarDeNovo` relê.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type Leitura = { tipo: 'from' | 'rpc'; nome: string; eq: Record<string, unknown>; in: Record<string, unknown[]> };
const estado = vi.hoisted(() => ({ leituras: [] as Leitura[], falhasDoCache: 0, cache: [] as Record<string, unknown>[] }));

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (tabela: string) => {
    const f: Leitura = { tipo: 'from', nome: tabela, eq: {}, in: {} };
    const p: any = new Proxy(() => undefined, {
      get: (_a, nome: string) => {
        if (nome === 'then') return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
          estado.leituras.push(f);
          let data: unknown = [];
          let error: unknown = null;
          if (tabela === 'zoot_mensal_cache') {
            if (estado.falhasDoCache > 0) { estado.falhasDoCache--; data = null; error = { code: '57014', message: 'canceling statement due to statement timeout' }; }
            else data = estado.cache.filter((r) => (f.in.fazenda_id ?? []).includes(r.fazenda_id) && r.ano === f.eq.ano && r.cenario === f.eq.cenario);
          } else if (tabela === 'saldos_iniciais') data = [{ fazenda_id: 'f1', quantidade: 150 }, { fazenda_id: 'f2', quantidade: 80 }];
          return Promise.resolve({ data, error }).then(ok, ko);
        };
        return (...a: unknown[]) => {
          if (nome === 'eq') f.eq[String(a[0])] = a[1];
          if (nome === 'in') f.in[String(a[0])] = a[1] as unknown[];
          return p;
        };
      },
    });
    return p;
  };
  return {
    supabase: {
      from: (t: string) => cadeia(t),
      rpc: (fn: string) => { estado.leituras.push({ tipo: 'rpc', nome: fn, eq: {}, in: {} }); return Promise.resolve({ data: null, error: null }); },
    },
  };
});
vi.mock('@/contexts/FazendaContext', () => ({
  useFazenda: () => ({ fazendaAtual: { id: 'f1', nome: 'Faz. Um' }, isGlobal: false, fazendas: [{ id: 'f1' }, { id: 'f2' }] }),
}));
vi.mock('@/contexts/ClienteContext', () => ({ useCliente: () => ({ clienteAtual: { id: 'cli' } }) }));
vi.mock('@/hooks/useMetaGmd', () => ({ useMetaGmd: () => ({ rows: [] }) }));
/* f1: 100 ha ativos e vigentes + 50 ha inativos; f2: 500 ha (outra fazenda — não pode entrar no denominador de f1) */
const PASTOS = [
  { id: 'p1', fazenda_id: 'f1', ativo: true, area_produtiva_ha: 100, data_inicio: null, data_fim: null },
  { id: 'p2', fazenda_id: 'f1', ativo: false, area_produtiva_ha: 50, data_inicio: null, data_fim: null },
  { id: 'p3', fazenda_id: 'f2', ativo: true, area_produtiva_ha: 500, data_inicio: null, data_fim: null },
];
vi.mock('@/hooks/usePastos', async (original) => ({ ...(await original<typeof import('@/hooks/usePastos')>()), usePastos: () => ({ pastos: PASTOS }) }));

import { useRebanhoOficial, ERRO_LEITURA_REBANHO } from '@/hooks/useRebanhoOficial';

const linha = (fazenda: string, codigo: string, cenario: 'realizado' | 'meta', o: Record<string, unknown>) => ({
  fazenda_id: fazenda, cliente_id: 'cli', ano: 2026, mes: 9, cenario, ano_mes: '2026-09', categoria_id: codigo, categoria_codigo: codigo,
  categoria_nome: codigo, ordem_exibicao: 1, entradas_externas: 0, saidas_externas: 0, evol_cat_entrada: 0, evol_cat_saida: 0,
  saldo_sistema: null, saldo_p1: null, peso_entradas_externas: 0, peso_saidas_externas: 0, peso_evol_cat_entrada: 0, peso_evol_cat_saida: 0,
  dias_mes: 30, gmd: null, fonte_oficial_mes: cenario === 'realizado' ? 'fechamento' : 'projecao', peso_medio_inicial: null, peso_medio_final: null, ...o,
});
/* f1 em set/26: bois 100 → 90 cab (30.000 → 27.900 kg, +900 kg de produção); vacas 50 → 50 (19.500 → 20.000 kg, +500).
   f2 (a outra fazenda) tem 1.000 cab: se entrar, a conta muda inteira. Saídas de 1.000 kg em bois fecham a conta do peso. */
const CACHE = (cenario: 'realizado' | 'meta') => [
  linha('f1', 'bois', cenario, { saldo_inicial: 100, saldo_final: 90, saidas_externas: 10, peso_saidas_externas: 3000, peso_total_inicial: 30_000, peso_total_final: 27_900, producao_biologica: 900 }),
  linha('f1', 'vacas', cenario, { ordem_exibicao: 2, saldo_inicial: 50, saldo_final: 50, peso_total_inicial: 19_500, peso_total_final: 20_000, producao_biologica: 500 }),
  linha('f2', 'bois', cenario, { saldo_inicial: 1000, saldo_final: 1000, peso_total_inicial: 400_000, peso_total_final: 410_000, producao_biologica: 10_000 }),
];

const embrulho = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

beforeEach(() => { estado.leituras = []; estado.falhasDoCache = 0; });

describe('D1 — uma fazenda lê o cache dela e a linha do mês é montada das categorias', () => {
  it('realizado: só o cache de f1; nada da view nem da função; os totais, o GMD, a área e a lotação de f1', async () => {
    estado.cache = CACHE('realizado');
    const { result } = renderHook(() => useRebanhoOficial({ ano: 2026, cenario: 'realizado' }), { wrapper: embrulho() });
    await waitFor(() => expect(result.current.fazendaByMes['09']).toBeDefined());

    const nomes = estado.leituras.map((l) => `${l.tipo}:${l.nome}`);
    expect(nomes).not.toContain('from:vw_zoot_fazenda_mensal');
    expect(nomes).not.toContain('rpc:fn_zoot_categoria_mensal');
    const doCache = estado.leituras.filter((l) => l.nome === 'zoot_mensal_cache');
    expect(doCache.length).toBeGreaterThan(0);
    for (const l of doCache) expect(l.in.fazenda_id).toEqual(['f1']);

    const set = result.current.fazendaByMes['09'];
    expect(set.cabecas_inicio).toBe(150);
    expect(set.cabecas_final).toBe(140);
    expect(set.peso_total_final_kg).toBe(47_900);
    expect(set.peso_medio_final_kg).toBe(342.14);
    expect(set.gmd_kg_cab_dia).toBe(0.3218);          // 1.400 kg ÷ 145 cab médias ÷ 30 dias
    expect(set.ua_media).toBe(110.25);
    expect(set.area_produtiva_ha).toBe(100);          // só os pastos de f1, ativos e vigentes (nem o inativo, nem os 500 ha de f2)
    expect(set.lotacao_ua_ha).toBe(1.1);
    expect(set.fonte_oficial_mes).toBe('fechamento');
    expect(result.current.error).toBeNull();
  });

  it('meta: também do cache de f1, com a área dos pastos de f1 (a meta deixou de pegar a área da view)', async () => {
    estado.cache = CACHE('meta');
    const { result } = renderHook(() => useRebanhoOficial({ ano: 2026, cenario: 'meta' }), { wrapper: embrulho() });
    await waitFor(() => expect(result.current.fazendaByMes['09']).toBeDefined());
    expect(estado.leituras.map((l) => l.nome)).not.toContain('vw_zoot_fazenda_mensal');
    const set = result.current.fazendaByMes['09'];
    expect(set.cabecas_final).toBe(140);
    expect(set.area_produtiva_ha).toBe(100);
    expect(set.lotacao_ua_ha).not.toBeNull();
    expect(set.fonte_oficial_mes).toBe('projecao');
  });
});

describe('D4 — a leitura que falha nunca vira lista vazia', () => {
  it('o cache falha: o hook devolve o erro (não um rebanho vazio sem aviso); "Tentar de novo" relê e o número aparece', async () => {
    estado.cache = CACHE('realizado');
    estado.falhasDoCache = 2;                         // a leitura e a 1 nova tentativa automática
    const { result } = renderHook(() => useRebanhoOficial({ ano: 2026, cenario: 'realizado' }), { wrapper: embrulho() });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe(ERRO_LEITURA_REBANHO);
    expect(result.current.rawCategorias).toEqual([]);

    await act(async () => { await result.current.tentarDeNovo(); });
    await waitFor(() => expect(result.current.fazendaByMes['09']?.cabecas_final).toBe(140));
    expect(result.current.error).toBeNull();
  });
});
