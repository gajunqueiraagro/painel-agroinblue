#!/usr/bin/env node
/**
 * P134 — gera `supabase/tests/p134_busca_sem_acento_test.sql` a partir da LISTA UNICA de casos (`src/lib/texto/busca.casos.json`).
 * A mesma lista roda contra a funcao da tela (vitest `busca.test.ts`) e, por este arquivo gerado, contra `_fn_normalizar_texto` e
 * `fn_texto_casa` no banco. O vitest confere que o SQL gravado e' o que este script gera agora — mudou o arquivo de casos e nao
 * regerou, a suite cai.
 * O SQL leva tambem o P136 (o filtro Produto da lista acha o produto que e' o 5o item da nota) e a RPC das sugestoes do Produto.
 *
 *   node scripts/gerar-teste-busca-sem-acento.mjs           grava o .sql
 *   node scripts/gerar-teste-busca-sem-acento.mjs --stdout  so imprime
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CAMINHO_CASOS = resolve(raiz, 'src/lib/texto/busca.casos.json');
export const CAMINHO_SQL = resolve(raiz, 'supabase/tests/p134_busca_sem_acento_test.sql');

const lit = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

export function gerarSql(casos) {
  const L = [];
  L.push('-- P134 — GERADO por `node scripts/gerar-teste-busca-sem-acento.mjs` a partir de `src/lib/texto/busca.casos.json`');
  L.push('-- (a lista UNICA de casos; a mesma roda contra a funcao da tela no vitest). NAO EDITAR A MAO: mude o arquivo de casos e gere de novo.');
  L.push("-- Sintetico no cliente Teste; roda como `authenticated` (claims de um usuario real); termina em RAISE 'OK' (desfaz tudo).");
  L.push("set local statement_timeout = '60s';");
  L.push("set local lock_timeout = '3s';");
  L.push('-- P136: um lancamento cuja descricao tem so os 2 primeiros itens, e a nota dele com 5 itens (o 5o com acento).');
  L.push('DO $p$');
  L.push('DECLARE');
  L.push("  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';");
  L.push("  v_chave constant text := '35310112345678000199550010000001341000001349';");
  L.push('  v_faz uuid; v_plano uuid; v_lanc uuid; v_nota uuid;');
  L.push('BEGIN');
  L.push('  select id into v_faz from fazendas where cliente_id = k order by nome limit 1;');
  L.push("  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'");
  L.push("     and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;");
  L.push('  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,');
  L.push('                                         data_vencimento, cenario, descricao, plano_conta_id)');
  L.push("    values (k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-03-10', date '2031-03-10', 'realizado',");
  L.push("            'SINT P136 Arame liso, Grampo · 5 itens', v_plano) returning id into v_lanc;");
  L.push("  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,");
  L.push('                                         data_vencimento, cenario, descricao, plano_conta_id)');
  L.push("    values (k, v_faz, '2-Saídas', '-1', 10, 'previsto', date '2031-03-11', date '2031-03-11', 'realizado',");
  L.push("            'SINT P134 Manutenção Máquinas Pecuária', v_plano);");
  L.push("  insert into nota_fiscal (cliente_id, chave_acesso, origem, totais, soma_cent, nota_cent) values (k, v_chave, 'xml', '{}'::jsonb, 500, 500)");
  L.push('    returning id into v_nota;');
  L.push("  insert into nota_fiscal_itens (nota_id, cliente_id, n_item, descricao, produto_cent, liquido_cent) values");
  L.push("    (v_nota, k, 1, 'Arame liso', 100, 100), (v_nota, k, 2, 'Grampo', 100, 100), (v_nota, k, 3, 'Prego', 100, 100),");
  L.push("    (v_nota, k, 4, 'Dobradiça', 100, 100), (v_nota, k, 5, 'Mangueira Atóxica Reforçada', 100, 100);");
  L.push("  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, chave_acesso)");
  L.push("    values (k, v_lanc, 'SINT P136.xml', 'nf', v_chave);");
  L.push("  perform set_config('p134.lanc', v_lanc::text, true);");
  L.push('END $p$;');
  L.push(`select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);`);
  L.push('set local role authenticated;');
  L.push('DO $t$');
  L.push('DECLARE');
  L.push("  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';");
  L.push("  b constant jsonb := '{\"dimensao\":\"financeira\",\"modo_sem_caixa\":\"mostrar\",\"anos\":[2031],\"meses\":[3]}';");
  L.push('  r jsonb; n int;');
  L.push('BEGIN');
  L.push('  -- NORMALIZACAO (a mesma regra dos dois lados)');
  casos.normalizacao.forEach((c, i) => {
    L.push(`  if coalesce(public._fn_normalizar_texto(${lit(c.entrada)}), '') is distinct from ${lit(c.saida)} then raise exception 'N${i + 1} normalizacao de %: %', ${lit(c.entrada)}, public._fn_normalizar_texto(${lit(c.entrada)}); end if;`);
  });
  L.push('  -- CASA (o termo dentro do texto, os dois normalizados; % e _ nunca sao curinga)');
  casos.casa.forEach((c, i) => {
    L.push(`  if public.fn_texto_casa(${lit(c.texto)}, ${lit(c.termo)}) is distinct from ${c.casa ? 'true' : 'false'} then raise exception 'C${i + 1} % em %: esperado ${c.casa}', ${lit(c.termo)}, ${lit(c.texto)}; end if;`);
  });
  L.push('  -- P136: o filtro Produto da lista acha o lancamento pelo 5o item da nota (sem acento: "mangueira atoxica")');
  L.push("  r := public.fn_fin_v2_lista_pagina(k, b || '{\"produto\":\"mangueira atoxica\"}'::jsonb, '{}'::jsonb, 0, 100);");
  L.push("  if (r->>'total_linhas')::int <> 1 or (r->'linhas'->0->>'id') is distinct from current_setting('p134.lanc') then");
  L.push("    raise exception 'P136 o 5o item da nota nao achou o lancamento: total %', r->>'total_linhas'; end if;");
  L.push('  -- P134: a descricao sem acento (o termo digitado sem acento acha "Manutenção Máquinas"; com acento tambem)');
  L.push("  r := public.fn_fin_v2_lista_pagina(k, b || '{\"produto\":\"manutencao maq\"}'::jsonb, '{}'::jsonb, 0, 100);");
  L.push("  if (r->>'total_linhas')::int <> 1 then raise exception 'P134 manutencao maq: total %', r->>'total_linhas'; end if;");
  L.push("  r := public.fn_fin_v2_lista_pagina(k, b || '{\"produto\":\"MÁQUINAS PECUÁRIA\"}'::jsonb, '{}'::jsonb, 0, 100);");
  L.push("  if (r->>'total_linhas')::int <> 1 then raise exception 'P134 MAQUINAS PECUARIA com acento: total %', r->>'total_linhas'; end if;");
  L.push('  -- as sugestoes do campo Produto do lancamento (ProdutoAutocomplete)');
  L.push("  select count(*) into n from public.fn_lancamento_descricoes_buscar(k, 'maquinas pecuaria', 30) x where x like 'SINT P134 %';");
  L.push("  if n <> 1 then raise exception 'P134 sugestoes do Produto: %', n; end if;");
  L.push("  RAISE EXCEPTION 'OK';");
  L.push('END $t$;');
  return L.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sql = gerarSql(JSON.parse(readFileSync(CAMINHO_CASOS, 'utf8')));
  if (process.argv.includes('--stdout')) process.stdout.write(sql);
  else { writeFileSync(CAMINHO_SQL, sql); console.log(`gerado: ${CAMINHO_SQL}`); }
}
