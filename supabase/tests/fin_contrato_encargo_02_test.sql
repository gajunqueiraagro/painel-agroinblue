-- FIN-CONTRATO-VINCULAR-ENCARGO-01 passo 2 — a situacao do contrato enxerga os encargos; a leitura por cliente (S1–S5).
-- Roda como `postgres`, DEPOIS da migration 20261027196400, e TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Tudo sintetico no cliente Teste (43f32d07). Comparacoes com IS DISTINCT FROM.
-- S1 sem detalhe: o retorno do contrato e' IDENTICO (md5) antes e depois de ganhar encargos, e nao tem chave nova.
-- S2 com detalhe: 3 encargos vivos (1 pago, 1 em aberto, 1 ORFAO — lancamento cancelado depois de vinculado): lista de 2 em
--    ordem de data desc, qtde 2, pagos 100, a pagar 50, orfaos 1; juros_pagos 30 (o lancamento de juros realizado da parcela);
--    custo_total = pagos + juros pagos = 130.
-- S3 o encargo DESFEITO nao entra na lista nem nas somas.
-- S4 fn_encargos_dos_lancamentos: so' vinculo vivo de contrato vivo; cliente de fora, sem usuario e cliente nulo = 42501.
-- S5 ACL das duas funcoes.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
create function pg_temp.lan(p_desc text, p_valor numeric, p_status text default 'programado', p_venc date default '2026-09-10') returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, data_pagamento, valor,
      sinal, tipo_operacao, status_transacao, descricao, cenario)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '131b8501-caf7-4964-b1b1-3f552ad2b75d',
      '2026-09-01', p_venc, case when p_status = 'realizado' then p_venc end, p_valor, '-1', '2-Saídas', p_status, p_desc, 'realizado')
  returning id $f$;
create function pg_temp.contrato(p_num text, p_status text default 'ativo') returns uuid language sql as $f$
  insert into financiamentos (cliente_id, descricao, numero_contrato, status, natureza, valor_total, data_contrato)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'SINT contrato ' || p_num, p_num, p_status, 'financiamento', 1000, '2026-01-10') returning id $f$;
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

do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c1 uuid; c2 uuid; c3 uuid; lp uuid; lj uuid; ep uuid; ea uuid; eo uuid; ed uuid; ec uuid;
  r jsonb; m jsonb; t text; v_s1 text; v_s2 text; v_ux uuid; v_enc uuid;
begin
  select cm.user_id into v_ux from cliente_membros cm join auth.users u on u.id = cm.user_id
   where cm.ativo and cm.perfil = 'gestor_cliente' and cm.cliente_id is distinct from c_cli
     and not exists (select 1 from cliente_membros x where x.user_id = cm.user_id and (x.perfil = 'admin_agroinblue' or x.cliente_id = c_cli))
   order by cm.user_id limit 1;
  if v_ux is null then raise exception 'S0: sem usuario comum para a prova'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  c1 := pg_temp.contrato('C_700001'); c2 := pg_temp.contrato('C_700002'); c3 := pg_temp.contrato('C_700003', 'cancelado');
  lp := pg_temp.lan('SINT principal', 200, 'realizado'); lj := pg_temp.lan('SINT juros da parcela', 30, 'realizado');
  insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, status, lancamento_id, lancamento_juros_id)
  values (c1, c_cli, 1, '2026-09-10', 200, 30, 'pendente', lp, lj);
  ep := pg_temp.lan('SINT IOF pago', 100, 'realizado', '2026-09-20'); ea := pg_temp.lan('SINT tarifa em aberto', 50, 'programado', '2026-09-25');
  eo := pg_temp.lan('SINT juros orfao', 40, 'realizado', '2026-09-22'); ed := pg_temp.lan('SINT multa desfeita', 70, 'realizado', '2026-09-23');
  ec := pg_temp.lan('SINT encargo de contrato cancelado', 10);
  v_s1 := md5(fn_financiamento_situacao(c1, '2026-10-11', false)::text);
  v_s2 := md5(fn_financiamento_situacao(c2, '2026-10-11', false)::text);

  r := fn_contrato_encargo_vincular(c1, jsonb_build_array(
         jsonb_build_object('lancamento_id', ep, 'papel', 'iof'), jsonb_build_object('lancamento_id', ea, 'papel', 'tarifa'),
         jsonb_build_object('lancamento_id', eo, 'papel', 'juros'), jsonb_build_object('lancamento_id', ed, 'papel', 'multa')));
  select (i->>'encargo_id')::uuid into v_enc from jsonb_array_elements(r->'itens') i where (i->>'lancamento_id')::uuid = ed;
  perform fn_contrato_encargo_desvincular(v_enc, 'sintetico: desfeito');
  update financeiro_lancamentos_v2 set cancelado = true where id = eo;                       -- o orfao: cancelado depois de vinculado
  insert into financiamento_encargos (cliente_id, financiamento_id, lancamento_id, papel) values (c_cli, c3, ec, 'outro');   -- vivo em contrato cancelado

  -- ── S1 ──
  r := fn_financiamento_situacao(c1, '2026-10-11', false);
  if md5(r::text) is distinct from v_s1 or md5(fn_financiamento_situacao(c2, '2026-10-11', false)::text) is distinct from v_s2 then raise exception 'S1: sem detalhe mudou'; end if;
  if r ? 'encargos' or (r->'cartoes') ?| array['encargos_qtde', 'encargos_pagos', 'encargos_a_pagar', 'encargos_orfaos', 'juros_pagos', 'custo_total'] then raise exception 'S1: chave nova sem detalhe: %', r; end if;

  -- ── S2 ──
  r := fn_financiamento_situacao(c1, '2026-10-11', true); m := r->'cartoes';
  if (select string_agg(e->>'lancamento_id', ',' order by o) from jsonb_array_elements(r->'encargos') with ordinality u(e, o)) is distinct from ea::text || ',' || ep::text
     then raise exception 'S2 lista: %', r->'encargos'; end if;
  if (m->>'encargos_qtde') is distinct from '2' or (m->>'encargos_pagos')::numeric is distinct from 100 or (m->>'encargos_a_pagar')::numeric is distinct from 50
     or (m->>'encargos_orfaos') is distinct from '1' then raise exception 'S2 cartoes: %', m; end if;
  if (m->>'juros_pagos')::numeric is distinct from 30 or (m->>'custo_total')::numeric is distinct from 130 then raise exception 'S2 custo: %', m; end if;
  if (r->'encargos'->1) - 'encargo_id' - 'vinculado_em' is distinct from jsonb_build_object('lancamento_id', ep, 'papel', 'iof', 'data', '2026-09-20',
       'descricao', 'SINT IOF pago', 'valor', 100.00, 'status_transacao', 'realizado', 'paga', true, 'conciliado', false,
       'conta_id', '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'conta_nome', r->'encargos'->1->'conta_nome', 'subcentro', null)
     or (r->'encargos'->1->>'conta_nome') is null or (r->'encargos'->0->>'paga') is distinct from 'false' or (r->'encargos'->0->>'data') is distinct from '2026-09-25'
     then raise exception 'S2 linha: %', r->'encargos'; end if;
  m := fn_financiamento_situacao(c2, '2026-10-11', true);
  if (m->'encargos') is distinct from '[]'::jsonb or (m->'cartoes'->>'encargos_qtde') is distinct from '0' or (m->'cartoes'->>'custo_total')::numeric is distinct from 0 then raise exception 'S2 sem encargo: %', m; end if;

  -- ── S3 ──
  if exists (select 1 from jsonb_array_elements(r->'encargos') e where (e->>'lancamento_id')::uuid in (ed, eo)) then raise exception 'S3: desfeito ou orfao na lista'; end if;
  if (select count(*) || '/' || count(*) filter (where desfeito_em is null) from financiamento_encargos where financiamento_id = c1) is distinct from '4/3' then raise exception 'S3 base'; end if;

  -- ── S4 ──
  m := fn_encargos_dos_lancamentos(c_cli);
  if (select string_agg(k, ',' order by k) from jsonb_object_keys(m) k where k::uuid in (ep, ea, eo, ed, ec))
       is distinct from (select string_agg(x::text, ',' order by x::text) from unnest(array[ep, ea, eo]) x) then raise exception 'S4 chaves: %', m; end if;
  if (m->(ep::text)) is distinct from jsonb_build_object('financiamento_id', c1, 'papel', 'iof', 'contrato', 'SINT contrato C_700001') then raise exception 'S4 valor: %', m->(ep::text); end if;
  t := pg_temp.rec(format('select fn_encargos_dos_lancamentos(%L)::text', c_cli), true);
  if t not like 'PASSOU {%' then raise exception 'S4 admin como authenticated: %', t; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ux, 'role', 'authenticated')::text, true);
  t := pg_temp.rec(format('select fn_encargos_dos_lancamentos(%L)::text', c_cli), true);
  if t is distinct from '42501 sem acesso a este registro' then raise exception 'S4 outro cliente: %', t; end if;
  perform set_config('request.jwt.claims', '', true);
  t := pg_temp.rec(format('select fn_encargos_dos_lancamentos(%L)::text', c_cli)) || pg_temp.rec('select fn_encargos_dos_lancamentos(null)::text');
  if t is distinct from repeat('42501 sem acesso a este registro', 2) then raise exception 'S4 sem usuario: %', t; end if;

  -- ── S5 ──
  select string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'execute') || has_function_privilege('authenticated', p.oid, 'execute')
           || exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0), ' ' order by p.proname) into t
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('fn_encargos_dos_lancamentos', 'fn_financiamento_situacao');
  if t is distinct from 'fn_encargos_dos_lancamentos:falsetruefalse fn_financiamento_situacao:falsetruefalse' then raise exception 'S5 ACL: %', t; end if;

  raise exception 'OK — FIN-CONTRATO-VINCULAR-ENCARGO-01 passo 2 (S1–S5)';
end $teste$;
rollback;
