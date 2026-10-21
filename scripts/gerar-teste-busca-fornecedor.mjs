#!/usr/bin/env node
/**
 * FORN-BUSCA-UNICA-01 — gera `supabase/tests/forn_busca_unica_01_test.sql` a partir da LISTA UNICA de casos
 * (`src/lib/fornecedores/buscaDeFornecedor.casos.json`). A mesma lista roda contra a funcao da tela (vitest) e, por este arquivo
 * gerado, contra a RPC `fn_fornecedor_buscar`. O vitest `buscaDeFornecedor.test.ts` confere que o SQL gravado e' o que este script
 * gera agora — mudou o arquivo de casos e nao regerou, a suite cai.
 *
 *   node scripts/gerar-teste-busca-fornecedor.mjs           grava o .sql
 *   node scripts/gerar-teste-busca-fornecedor.mjs --stdout  so imprime
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CAMINHO_CASOS = resolve(raiz, 'src/lib/fornecedores/buscaDeFornecedor.casos.json');
export const CAMINHO_SQL = resolve(raiz, 'supabase/tests/forn_busca_unica_01_test.sql');

const lit = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

export function gerarSql(casos) {
  const L = [];
  L.push('-- FORN-BUSCA-UNICA-01 — GERADO por `node scripts/gerar-teste-busca-fornecedor.mjs` a partir de');
  L.push('-- `src/lib/fornecedores/buscaDeFornecedor.casos.json` (a lista UNICA de casos; a mesma roda contra a funcao da tela no vitest).');
  L.push('-- NAO EDITAR A MAO: mude o arquivo de casos e gere de novo. Sintetico no cliente Teste; termina em RAISE \'OK\' (desfaz tudo).');
  L.push("set local statement_timeout = '60s';");
  L.push("set local lock_timeout = '3s';");
  L.push(`select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);`);
  L.push('DO $t$');
  L.push('DECLARE');
  L.push("  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';");
  L.push('  v_faz uuid; v_plano uuid; v uuid; ids jsonb := \'{}\'::jsonb; r jsonb; got text[];');
  L.push('BEGIN');
  L.push('  select id into v_faz from fazendas where cliente_id = k order by nome limit 1;');
  L.push("  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'");
  L.push("     and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;");
  L.push('  -- NORMALIZACAO (a mesma regra dos dois lados)');
  casos.normalizacao.forEach((c, i) => {
    L.push(`  if coalesce(public._fn_normalizar_texto(${lit(c.entrada)}), '') is distinct from ${lit(c.saida)} then raise exception 'N${i + 1} normalizacao de %: %', ${lit(c.entrada)}, public._fn_normalizar_texto(${lit(c.entrada)}); end if;`);
  });
  casos.digitosDaBusca.forEach((c, i) => {
    L.push(`  if public._fn_fornecedor_busca_digitos(${lit(c.entrada)}) is distinct from ${lit(c.saida)}::text then raise exception 'D${i + 1} digitos da busca de %: %', ${lit(c.entrada)}, public._fn_fornecedor_busca_digitos(${lit(c.entrada)}); end if;`);
  });
  casos.digitosDoDocumento.forEach((c, i) => {
    L.push(`  if public._fn_fornecedor_busca_doc(${lit(c.entrada)}) is distinct from ${lit(c.saida)} then raise exception 'C${i + 1} digitos do documento de %: %', ${lit(c.entrada)}, public._fn_fornecedor_busca_doc(${lit(c.entrada)}); end if;`);
  });
  L.push('  -- FORNECEDORES (e o uso: N lancamentos vivos de cada um)');
  for (const f of casos.fornecedores) {
    const aliases = f.aliases ? `${lit(JSON.stringify(f.aliases))}::jsonb` : "'[]'::jsonb";
    const dono = f.fundido_em ? `(ids->>${lit(f.fundido_em)})::uuid` : 'null';
    const quando = f.fundido_em ? 'now()' : 'null';
    L.push(`  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo, aliases, fundido_em_id, fundido_em, municipio, uf)`);
    L.push(`    values (k, ${lit(f.nome)}, ${lit(f.nome_fantasia)}, ${lit(f.cpf_cnpj)}, ${f.ativo === false ? 'false' : 'true'}, ${aliases}, ${dono}, ${quando}, ${lit(f.municipio)}, ${lit(f.uf)}) returning id into v;`);
    L.push(`  ids := ids || jsonb_build_object(${lit(f.chave)}, v);`);
    if (f.uso) {
      L.push('  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,');
      L.push('                                         data_vencimento, cenario, descricao, plano_conta_id, favorecido_id)');
      L.push(`    select k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT busca unica', v_plano, v`);
      L.push(`      from generate_series(1, ${Number(f.uso)});`);
    }
  }
  L.push('  -- BUSCAS (a ordem exata, so entre os fornecedores deste arquivo)');
  casos.buscas.forEach((b, i) => {
    const esperado = b.esperado.length ? `ARRAY[${b.esperado.map(lit).join(', ')}]::text[]` : "'{}'::text[]";
    L.push(`  r := public.fn_fornecedor_buscar(k, ${lit(b.busca)}, ${lit(b.situacao)}, null, 0);`);
    L.push('  select coalesce(array_agg(m.chave order by e.o), \'{}\'::text[]) into got');
    L.push("    from jsonb_array_elements(r->'itens') with ordinality e(x, o)");
    L.push("    join (select key as chave, value #>> '{}' as id from jsonb_each(ids)) m on m.id = e.x->>'id';");
    L.push(`  if got is distinct from ${esperado} then raise exception 'B${i + 1} % (%): %', ${lit(b.caso)}, ${lit(b.busca)}, got; end if;`);
  });
  L.push("  RAISE EXCEPTION 'OK';");
  L.push('END $t$;');
  return L.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sql = gerarSql(JSON.parse(readFileSync(CAMINHO_CASOS, 'utf8')));
  if (process.argv.includes('--stdout')) process.stdout.write(sql);
  else { writeFileSync(CAMINHO_SQL, sql); console.log(`gerado: ${CAMINHO_SQL}`); }
}
