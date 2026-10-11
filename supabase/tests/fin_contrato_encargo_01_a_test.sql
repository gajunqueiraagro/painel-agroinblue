-- FIN-CONTRATO-VINCULAR-ENCARGO-01 passo 1 — parte A do teste: as leituras e o vincular (E1–E4).
-- Roda como `postgres`, DEPOIS das migrations 20261027196100/196200/196300, e TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Tudo sintetico no cliente Teste (43f32d07). Comparacoes com IS DISTINCT FROM.
-- E1 candidatas: numero do contrato na descricao primeiro, mesmo credor depois, outro credor por ultimo; cancelado fora.
-- E2 vinculaveis: parcela, juros de parcela, captacao, transferencia, entrada, cancelado e titulo de OC viva NAO entram; o avulso
--    entra com papel sugerido 'iof' e a marca do numero.
-- E3 lote de 3: a simulacao nao grava; a gravacao grava 3 e nao toca os lancamentos (md5 da linha).
-- E4 lote com um inelegivel: nada gravado, a frase cita o id.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
create function pg_temp.forn(p_nome text) returns uuid language sql as $f$
  insert into financeiro_fornecedores (cliente_id, nome) values ('43f32d07-dba8-4670-900c-bf645440c04a', p_nome) returning id $f$;
create function pg_temp.contrato(p_num text, p_credor uuid, p_status text default 'ativo', p_nat text default 'financiamento') returns uuid language sql as $f$
  insert into financiamentos (cliente_id, descricao, numero_contrato, credor_id, status, natureza, valor_total, data_contrato)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'SINT contrato ' || p_num, p_num, p_credor, p_status, p_nat, 1000, '2026-01-10') returning id $f$;
create function pg_temp.lan(p_desc text, p_fav uuid, p_tipo text default '2-Saídas', p_cancelado boolean default false) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id, data_competencia, data_vencimento, valor,
      sinal, tipo_operacao, status_transacao, descricao, favorecido_id, cenario, cancelado)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f',
      case when p_tipo like '2-%' then '131b8501-caf7-4964-b1b1-3f552ad2b75d'::uuid end,   -- transferencia: so' o destino (o Teste tem uma conta)
      case when p_tipo like '2-%' then null else '131b8501-caf7-4964-b1b1-3f552ad2b75d'::uuid end,
      '2026-09-01', '2026-09-10', 100, case when p_tipo like '1-%' then '1' else '-1' end, p_tipo, 'programado', p_desc, p_fav, 'realizado', p_cancelado)
  returning id $f$;
-- executa e devolve 'PASSOU <valor>' ou '<sqlstate> <mensagem>'; com p_comum, roda no papel `authenticated`
create function pg_temp.rec(p_sql text, p_comum boolean default false) returns text language plpgsql as $f$
declare v text;
begin
  if p_comum then execute 'set local role authenticated'; end if;
  execute p_sql into v;
  if p_comum then execute 'reset role'; end if;
  return 'PASSOU ' || coalesce(v, '');
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $f$;
create function pg_temp.itens(variadic p_ids uuid[]) returns jsonb language sql as $f$
  select jsonb_agg(jsonb_build_object('lancamento_id', x, 'papel', 'iof') order by o) from unnest(p_ids) with ordinality u(x, o) $f$;

do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  fa uuid := pg_temp.forn('SINT ENC credor A'); fb uuid := pg_temp.forn('SINT ENC credor B');
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid; lp uuid; lj uuid; lc uuid; lt uuid; le uuid; lx uuid; lo uuid;
  v_op uuid := gen_random_uuid(); r jsonb; v_ids uuid[]; v_md5 text; t text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  c1 := pg_temp.contrato('C_123456', fa); c2 := pg_temp.contrato('99', fa); c3 := pg_temp.contrato('777001', fb);
  c4 := pg_temp.contrato('C_123456', fa, 'cancelado');
  l1 := pg_temp.lan('IOF C_123456', fa);

  -- ── E1 ──
  r := fn_contrato_encargo_candidatas(l1);
  select array_agg((c->>'financiamento_id')::uuid order by o) into v_ids
    from jsonb_array_elements(r->'candidatas') with ordinality u(c, o) where (c->>'financiamento_id')::uuid in (c1, c2, c3, c4);
  if v_ids is distinct from array[c1, c2, c3] then raise exception 'E1 ordem: % (esperado %)', v_ids, array[c1, c2, c3]; end if;
  if (r->'elegivel'->>'ok') is distinct from 'true' or (r->'lancamento'->>'papel_sugerido') is distinct from 'iof' then raise exception 'E1 cabecalho: %', r - 'candidatas'; end if;
  if (select (c->>'numero_na_descricao') || (c->>'mesmo_credor') || (c->>'ja_vinculado') from jsonb_array_elements(r->'candidatas') c where (c->>'financiamento_id')::uuid = c1)
     is distinct from 'truetruefalse' then raise exception 'E1 marcas do c1'; end if;
  if (select (c->>'numero_na_descricao') || (c->>'mesmo_credor') from jsonb_array_elements(r->'candidatas') c where (c->>'financiamento_id')::uuid = c3)
     is distinct from 'falsefalse' then raise exception 'E1 marcas do c3'; end if;

  -- ── E2 ──
  lp := pg_temp.lan('SINT parcela', fa); lj := pg_temp.lan('SINT juros da parcela', fa);
  insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, status, lancamento_id, lancamento_juros_id)
  values (c1, c_cli, 1, '2026-09-10', 100, 'pendente', lp, lj);
  lc := pg_temp.lan('SINT captacao', fa); update financiamentos set lancamento_captacao_id = lc where id = c2;
  lt := pg_temp.lan('SINT transferencia', fa, '3-Transferências'); le := pg_temp.lan('SINT entrada', fa, '1-Entradas');
  lx := pg_temp.lan('SINT cancelado', fa, '2-Saídas', true); lo := pg_temp.lan('SINT titulo de OC', fa);
  insert into zoo_operacoes_comerciais select x.* from (select o.* from zoo_operacoes_comerciais o where o.rascunho is not true order by o.created_at limit 1) o,
    lateral jsonb_populate_record(null::zoo_operacoes_comerciais, to_jsonb(o) || jsonb_build_object('id', v_op, 'cliente_id', c_cli,
      'fazenda_id', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'contraparte_id', null, 'versao', 1, 'is_teste', true)) x;
  insert into zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, data_vencimento, descricao, financeiro_lancamento_id)
  values (c_cli, v_op, 'manual', 'principal', 'principal', 1, 1, 100, '2026-09-10', 'SINT enc', lo);
  r := fn_contrato_encargos_vinculaveis(c1);
  select array_agg((x->>'lancamento_id')::uuid) into v_ids from jsonb_array_elements(r->'linhas') x;
  if v_ids is distinct from array[l1] or (r->>'total') is distinct from '1' then raise exception 'E2 linhas: % total %', v_ids, r->>'total'; end if;
  if (r->'linhas'->0->>'papel_sugerido') is distinct from 'iof' or (r->'linhas'->0->>'numero_na_descricao') is distinct from 'true' then raise exception 'E2 marcas: %', r->'linhas'->0; end if;
  select string_agg(e.motivo, ',' order by o) into t from unnest(array[lp, lj, lc, lt, le, lx, lo]) with ordinality u(x, o), lateral _fn_lancamento_elegivel_a_encargo(x) e;
  if t is distinct from 'parcela_ou_captacao,parcela_ou_captacao,parcela_ou_captacao,nao_e_saida,nao_e_saida,cancelado,titulo_de_oc' then raise exception 'E2 motivos: %', t; end if;

  -- ── E3 ──
  l2 := pg_temp.lan('Juros C_123456', fa); l3 := pg_temp.lan('Tarifa de manutencao', fb);
  select md5(string_agg(l::text, '|' order by l.id)) into v_md5 from financeiro_lancamentos_v2 l where l.id in (l1, l2, l3);
  r := fn_contrato_encargo_vincular(c1, pg_temp.itens(l1, l2, l3), true);
  if (r->>'ok') is distinct from 'true' or (r->>'vinculados') is distinct from '3' or (select count(*) from financiamento_encargos where financiamento_id = c1) is distinct from 0
     then raise exception 'E3 simulacao: % / gravados %', r, (select count(*) from financiamento_encargos where financiamento_id = c1); end if;
  r := fn_contrato_encargo_vincular(c1, pg_temp.itens(l1, l2, l3));
  if (r->>'vinculados') is distinct from '3' or (select count(*) from financiamento_encargos where financiamento_id = c1 and desfeito_em is null and vinculado_por = c_adm) is distinct from 3
     then raise exception 'E3 gravacao: %', r; end if;
  if (select md5(string_agg(l::text, '|' order by l.id)) from financeiro_lancamentos_v2 l where l.id in (l1, l2, l3)) is distinct from v_md5 then raise exception 'E3: lancamento mudou'; end if;
  if (select count(*) from jsonb_array_elements(r->'avisos') a where a->>'codigo' = 'lancamento_nao_realizado') is distinct from 3
     or (select string_agg(a->>'lancamento_id', ',') from jsonb_array_elements(r->'avisos') a where a->>'codigo' = 'favorecido_diferente_do_credor') is distinct from l3::text
     then raise exception 'E3 avisos: %', r->'avisos'; end if;
  if (select count(*) from jsonb_array_elements(fn_contrato_encargos_vinculaveis(c1)->'linhas')) is distinct from 0 then raise exception 'E3: vinculado ainda e'' oferecido'; end if;

  -- ── E4 ──
  l4 := pg_temp.lan('SINT avulso 4', fa);
  t := pg_temp.rec(format('select fn_contrato_encargo_vincular(%L, %L)::text', c1, pg_temp.itens(l4, lp)));
  if t is distinct from format('P0001 Este lançamento já é parcela ou captação de um contrato. (lançamento %s) Nada foi gravado.', lp) then raise exception 'E4 frase: %', t; end if;
  if (select count(*) from financiamento_encargos where financiamento_id = c1) is distinct from 3 then raise exception 'E4: gravou com inelegivel'; end if;
  r := fn_contrato_encargo_vincular(c1, pg_temp.itens(l4, lp), true);
  if (r->'recusa'->>'motivo') is distinct from 'parcela_ou_captacao' or (r->>'vinculados') is distinct from '0' then raise exception 'E4 simulacao: %', r; end if;
  t := pg_temp.rec(format('select fn_contrato_encargo_vincular(%L, %L)::text', c1, '[]'))
    || pg_temp.rec(format('select fn_contrato_encargo_vincular(%L, %L)::text', c1, jsonb_build_array(jsonb_build_object('lancamento_id', l4, 'papel', 'x'))))
    || pg_temp.rec(format('select fn_contrato_encargo_vincular(%L, %L)::text', c1, pg_temp.itens(l4, l4)))
    || pg_temp.rec(format('select fn_contrato_encargo_vincular(%L, %L)::text', c4, pg_temp.itens(l4)));
  if t is distinct from 'P0001 Escolha ao menos um lançamento. Nada foi gravado.'
     || 'P0001 Informe o tipo de cada encargo: juros, IOF, tarifa, seguro, multa ou outro. Nada foi gravado.'
     || 'P0001 O mesmo lançamento aparece duas vezes na lista. Nada foi gravado.'
     || 'P0001 Este contrato está cancelado e não recebe encargo. Nada foi gravado.' then raise exception 'E4 recusas: %', t; end if;

  raise exception 'OK — FIN-CONTRATO-VINCULAR-ENCARGO-01 parte A (E1–E4)';
end $teste$;
rollback;
