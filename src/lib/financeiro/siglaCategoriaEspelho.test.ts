/**
 * FIN-V2-SEM-CAIXA-01 (item 8) — `_oc_sigla_categoria` (SQL) e' espelho de `siglaCategoria` / `SIGLA_POR_SLUG` (TS). A descricao
 * da entrega nasce no banco ("Venda 183 DM"); o titulo das OCs nasce no front ("Compra 029 DF"). Se as siglas divergirem, a mesma
 * categoria sai com duas siglas no Financeiro, e nenhum gate ve'. O caso le o TEXTO da migration e compara par a par.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORIAS } from '@/types/cattle';
import { siglaCategoria, categoriaTemSigla } from './produtoOC';

const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261027170000_fin_v2_sem_caixa_01.sql'), 'utf8');
const inicio = sql.indexOf('create or replace function public._oc_sigla_categoria');
const corpo = sql.slice(inicio, sql.indexOf('$fn$;', inicio));

describe('espelho SQL x TS da sigla da categoria', () => {
  it('as 9 siglas do banco sao exatamente as do front, nos dois sentidos', () => {
    const doBanco: Record<string, string> = {};
    let n = 0;
    for (const m of corpo.matchAll(/WHEN '([a-z_]+)' THEN '([^']+)'/g)) { doBanco[m[1]] = m[2]; n += 1; }
    expect(n).toBe(9);
    expect(CATEGORIAS.every(c => categoriaTemSigla(c.value))).toBe(true);
    expect(doBanco).toEqual(Object.fromEntries(CATEGORIAS.map(c => [c.value, siglaCategoria(c.value)])));
  });

  it('fora do mapa, o mesmo fallback nos dois: o rotulo sem espacos em maiusculas, ou o codigo', () => {
    expect(corpo).toContain("else upper(replace(public._oc_rotulo_categoria(p_categoria), ' ', ''))");
    /* `_oc_rotulo_categoria` devolve o proprio codigo fora da lista (01d), como o front */
    expect(siglaCategoria('vacas_descarte')).toBe('VACAS_DESCARTE');
  });

  it('a descricao da entrega e "Venda <cab:3> <sigla>", sem truncar acima de 999, nas duas escritas', () => {
    const patch = sql.slice(sql.indexOf('do $p$'));
    expect(patch).toContain("format('Venda %s %s', lpad(r.cab::text, greatest(3, length(r.cab::text)), '0'), public._oc_sigla_categoria(r.categoria))");
    /* a busca sabe achar: a ancora substituida (a do 01d) e a guarda das DUAS ocorrencias */
    expect(patch).toContain("format('Entrega %s cab %s', r.cab, public._oc_rotulo_categoria(r.categoria))");
    expect(patch).toContain('<> 2 then');
  });
});
