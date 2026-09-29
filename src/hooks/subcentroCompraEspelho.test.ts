/**
 * OC-CONTA-CORRENTE-TODOS-01a — `_oc_subcentro_compra` (SQL) e' espelho de `subcentroCompraPorCategoria` (TS). A ENTRADA do gado da
 * compra em conta corrente nasce no banco (`oc_sincronizar_entregas`), e o principal do modelo titulo nasce no front
 * (`classificarLotesCompra`). Se as duas contas divergirem, a mesma categoria cai em Fêmeas num modelo e em Machos no outro, e nenhum
 * gate ve'. O caso le o TEXTO da migration e compara categoria a categoria, nos dois sentidos.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORIAS } from '@/types/cattle';
import { subcentroCompraPorCategoria } from './useOperacaoLiquidacao';

const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261027172000_oc_conta_corrente_todos_01a.sql'), 'utf8');
const inicio = sql.indexOf('create or replace function public._oc_subcentro_compra');
const corpo = sql.slice(inicio, sql.indexOf('$fn$;', inicio));

function doBanco(): Record<string, string> {
  const r: Record<string, string> = {};
  for (const m of corpo.matchAll(/when p_categoria in \(([^)]+)\) then '([^']+)'/g)) {
    for (const c of m[1].matchAll(/'([a-z_]+)'/g)) r[c[1]] = m[2];
  }
  return r;
}

describe('espelho SQL x TS da conta da compra', () => {
  it('as 9 categorias caem na MESMA conta nos dois lados, e so elas', () => {
    const banco = doBanco();
    expect(Object.keys(banco)).toHaveLength(9);
    expect(banco).toEqual(Object.fromEntries(CATEGORIAS.map(c => [c.value, subcentroCompraPorCategoria(c.value)])));
  });

  it('femeas em Fêmeas e machos em Machos — e fora do enum nenhum dos dois devolve palpite', () => {
    expect(subcentroCompraPorCategoria('novilhas')).toBe('Investimento Compra Bovinos Fêmeas');
    expect(subcentroCompraPorCategoria('desmama_m')).toBe('Investimento Compra Bovinos Machos');
    expect(subcentroCompraPorCategoria('vacas_descarte')).toBeNull();
    /* no banco, categoria fora das listas cai no `end` do case: null (a busca sabe achar as duas listas acima) */
    expect(corpo).not.toMatch(/\belse\b/);
  });

  it('a entrada nasce com o verbo da compra e a direcao de saida, pelas regras por tipo', () => {
    expect(sql).toContain("when 'compra' then 'Compra'");
    expect(sql).toContain("when 'compra' then '2-Saídas'");
    expect(sql).toContain("when 'compra' then 'Adiantamento a Fornecedores'");
    expect(sql).toContain("when 'compra' then public._oc_subcentro_compra(p_categoria)");
  });
});
