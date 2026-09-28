/**
 * OC-VENDA-ENTREGAS-01d (A1) — `_oc_rotulo_categoria` (SQL) e' espelho de `CATEGORIAS` (TS). A descricao da entrega da conta
 * corrente nasce no banco ("Entrega 193 cab Desmama M"); se os dois mapas divergirem, o financeiro volta a mostrar o codigo
 * ("desmama_m") ou um nome que a tela nao usa, e nenhum gate ve'. O caso le o TEXTO da migration e compara par a par.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATEGORIAS } from '@/types/cattle';

const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261027169000_oc_venda_entregas_01d.sql'), 'utf8');
const inicio = sql.indexOf('create or replace function public._oc_rotulo_categoria');
const corpo = sql.slice(inicio, sql.indexOf('$fn$;', inicio));

describe('espelho SQL x TS do nome da categoria (descricao da entrega)', () => {
  it('os pares do banco sao exatamente os de CATEGORIAS (9, nos dois sentidos)', () => {
    const doBanco: Record<string, string> = {};
    let n = 0;
    for (const m of corpo.matchAll(/WHEN '([a-z_]+)' THEN '([^']+)'/g)) { doBanco[m[1]] = m[2]; n += 1; }
    expect(n).toBe(9);
    expect(doBanco).toEqual(Object.fromEntries(CATEGORIAS.map(c => [c.value, c.label])));
  });

  it('codigo fora da lista volta como veio (nunca inventa nome) e a descricao da entrega usa o rotulo nas duas escritas', () => {
    expect(corpo).toContain('else p_categoria');
    const patch = sql.slice(sql.indexOf('do $p$'));
    expect(patch).toContain("format('Entrega %s cab %s', r.cab, public._oc_rotulo_categoria(r.categoria))");
    /* a busca sabe achar: a ancora antiga (o codigo cru) e' a que o patch substitui, e a guarda exige 2 ocorrencias */
    expect(patch).toContain("format('Entrega %s cab %s', r.cab, r.categoria)");
    expect(patch).toContain('<> 2 then');
  });
});
