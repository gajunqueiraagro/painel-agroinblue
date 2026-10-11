-- FIN-CONTRATO-VINCULAR-ENCARGO-01 passo 1 — parte B do teste: unicidade, desvincular, a trava do contrato, tenant e ACL (E5–E9).
-- Roda como `postgres`, DEPOIS das migrations 20261027196100/196200/196300, e TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Tudo sintetico no cliente Teste (43f32d07). Comparacoes com IS DISTINCT FROM.
-- E5 segundo vinculo vivo do mesmo lancamento: a funcao recusa dizendo o contrato, e o indice recusa a escrita direta; depois de
--    desvincular, aceita.   E6 desvincular marca e nao apaga; de novo recusa; motivo vazio recusa; a simulacao nao grava.
-- E7 a trava: (a) com encargo vivo, cancelar = P0001 com a contagem e apagar = P0001 "historico de encargos"; (b) sem encargo
--    nenhum passa; (c) so' trilha DESFEITA: apagar = a frase do historico (nunca o 23503 cru da FK), cancelar passa.
-- E8 tenant: usuario comum de outro cliente e sem usuario = 42501 nas quatro; authenticated nao escreve na tabela.
-- E9 ACL das quatro publicas, das internas e da funcao do gatilho.
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
  fa uuid := pg_temp.forn('SINT ENC credor A');
  c1 uuid; c2 uuid; c5 uuid; l1 uuid; e1 uuid; e2 uuid; r jsonb; t text; v_ux uuid; v_md5 text;
begin
  select cm.user_id into v_ux from cliente_membros cm join auth.users u on u.id = cm.user_id
   where cm.ativo and cm.perfil = 'gestor_cliente' and cm.cliente_id is distinct from c_cli
     and not exists (select 1 from cliente_membros x where x.user_id = cm.user_id and (x.perfil = 'admin_agroinblue' or x.cliente_id = c_cli))
   order by cm.user_id limit 1;
  if v_ux is null then raise exception 'E0: sem usuario comum para a prova'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  c1 := pg_temp.contrato('C_123456', fa); c2 := pg_temp.contrato('C_555000', fa, 'ativo', 'parcelamento'); c5 := pg_temp.contrato('C_900900', fa, 'ativo', 'emprestimo');
  l1 := pg_temp.lan('IOF C_123456', fa);
  select md5(l::text) into v_md5 from financeiro_lancamentos_v2 l where l.id = l1;

  -- ── E5 ──
  e1 := (fn_contrato_encargo_vincular(c1, pg_temp.itens(l1))->'itens'->0->>'encargo_id')::uuid;
  t := pg_temp.rec(format('select fn_contrato_encargo_vincular(%L, %L)::text', c2, pg_temp.itens(l1)));
  if t is distinct from format('P0001 Este lançamento já é encargo do contrato «SINT contrato C_123456». (lançamento %s) Nada foi gravado.', l1) then raise exception 'E5 frase: %', t; end if;
  t := pg_temp.rec(format('insert into financiamento_encargos (cliente_id, financiamento_id, lancamento_id, papel) values (%L, %L, %L, %L) returning 1', c_cli, c2, l1, 'iof'));
  if t not like '23505 %uq_fin_encargo_vivo_por_lancamento%' then raise exception 'E5 indice: %', t; end if;
  if (fn_contrato_encargo_candidatas(l1)->'elegivel'->>'motivo') is distinct from 'ja_e_encargo' then raise exception 'E5 candidatas'; end if;

  -- ── E6 ──
  r := fn_contrato_encargo_desvincular(e1, null, true);
  if (r->>'ok') is distinct from 'true' or (select desfeito_em from financiamento_encargos where id = e1) is not null then raise exception 'E6 simulacao gravou: %', r; end if;
  t := pg_temp.rec(format('select fn_contrato_encargo_desvincular(%L, %L)::text', e1, '  '));
  if t is distinct from 'P0001 Informe o motivo para desvincular. Nada foi gravado.' then raise exception 'E6 motivo: %', t; end if;
  r := fn_contrato_encargo_desvincular(e1, 'vinculado ao contrato errado');
  if (r->>'lancamento_id')::uuid is distinct from l1 or (select count(*) || '/' || count(*) filter (where desfeito_em is null) || '/' || max(desfeito_motivo) || '/' || max(desfeito_por::text)
        from financiamento_encargos where lancamento_id = l1) is distinct from '1/0/vinculado ao contrato errado/' || c_adm then raise exception 'E6 desvincular: %', r; end if;
  t := pg_temp.rec(format('select fn_contrato_encargo_desvincular(%L, %L)::text', e1, 'de novo'));
  if t is distinct from 'P0001 Este encargo já foi desvinculado. Nada foi gravado.' then raise exception 'E6 de novo: %', t; end if;
  e2 := (fn_contrato_encargo_vincular(c2, pg_temp.itens(l1))->'itens'->0->>'encargo_id')::uuid;   -- E5: depois de desvincular, aceita
  if e2 is null or (select count(*) || '/' || count(*) filter (where desfeito_em is null) from financiamento_encargos where lancamento_id = l1) is distinct from '2/1' then raise exception 'E5/E6: revinculo'; end if;
  if (select md5(l::text) from financeiro_lancamentos_v2 l where l.id = l1) is distinct from v_md5 then raise exception 'E6: lancamento mudou'; end if;

  -- ── E7 ──
  -- E7a com encargo VIVO (c2): cancelar recusa com a contagem; apagar recusa com a frase do historico
  t := pg_temp.rec(format('update financiamentos set status = %L where id = %L returning 1', 'cancelado', c2))
    || ' / ' || pg_temp.rec(format('delete from financiamentos where id = %L returning 1', c2));
  if t is distinct from 'P0001 Este contrato tem 1 encargo(s) vinculado(s). Desvincule-os no bloco Encargos antes de cancelar.'
     || ' / P0001 Este contrato tem histórico de encargos e não pode ser apagado. Cancele o contrato em vez de excluir.' then raise exception 'E7 trava: %', t; end if;
  -- E7b outro status nao e' da trava; contrato SEM encargo nenhum (c5) cancela e apaga
  t := pg_temp.rec(format('update financiamentos set status = %L where id = %L returning 1', 'quitado', c2))
    || pg_temp.rec(format('update financiamentos set status = %L where id = %L returning 1', 'cancelado', c5))
    || pg_temp.rec(format('delete from financiamentos where id = %L returning 1', c5));
  if t is distinct from repeat('PASSOU 1', 3) then raise exception 'E7 passa: %', t; end if;
  -- E7c so' trilha DESFEITA (c1): apagar recusa com a frase (nunca o 23503 cru); cancelar passa; e cancelado continua sem apagar
  t := pg_temp.rec(format('delete from financiamentos where id = %L returning 1', c1));
  if t is distinct from 'P0001 Este contrato tem histórico de encargos e não pode ser apagado. Cancele o contrato em vez de excluir.' then raise exception 'E7c apagar: %', t; end if;
  t := pg_temp.rec(format('update financiamentos set status = %L where id = %L returning 1', 'cancelado', c1));
  if t is distinct from 'PASSOU 1' then raise exception 'E7c cancelar: %', t; end if;
  t := pg_temp.rec(format('delete from financiamentos where id = %L returning 1', c1));
  if t not like 'P0001 Este contrato tem histórico%' then raise exception 'E7c apagar cancelado: %', t; end if;

  -- ── E8 ──
  t := pg_temp.rec('select count(*) from financiamento_encargos', true);
  if t is distinct from 'PASSOU 2' then raise exception 'E8 leitura do admin: %', t; end if;
  t := pg_temp.rec(format('insert into financiamento_encargos (cliente_id, financiamento_id, lancamento_id, papel) values (%L, %L, %L, %L) returning 1', c_cli, c5, l1, 'iof'), true)
    || pg_temp.rec(format('update financiamento_encargos set papel = %L where id = %L returning 1', 'juros', e2), true)
    || pg_temp.rec(format('delete from financiamento_encargos where id = %L returning 1', e2), true);
  if t is distinct from repeat('42501 permission denied for table financiamento_encargos', 3) then raise exception 'E8 escrita direta: %', t; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ux, 'role', 'authenticated')::text, true);
  t := pg_temp.rec(format('select fn_contrato_encargo_candidatas(%L)::text', l1), true)
    || pg_temp.rec(format('select fn_contrato_encargos_vinculaveis(%L)::text', c2), true)
    || pg_temp.rec(format('select fn_contrato_encargo_vincular(%L, %L, true)::text', c2, pg_temp.itens(l1)), true)
    || pg_temp.rec(format('select fn_contrato_encargo_desvincular(%L, %L, true)::text', e2, 'x'), true)
    || pg_temp.rec('select count(*) from financiamento_encargos', true);
  if t is distinct from repeat('42501 sem acesso a este registro', 4) || 'PASSOU 0' then raise exception 'E8 outro cliente: %', t; end if;
  perform set_config('request.jwt.claims', '', true);
  t := pg_temp.rec(format('select fn_contrato_encargo_candidatas(%L)::text', l1))
    || pg_temp.rec(format('select fn_contrato_encargos_vinculaveis(%L)::text', c2))
    || pg_temp.rec(format('select fn_contrato_encargo_vincular(%L, %L, true)::text', c2, pg_temp.itens(l1)))
    || pg_temp.rec(format('select fn_contrato_encargo_desvincular(%L, %L, true)::text', e2, 'x'));
  if t is distinct from repeat('42501 sem acesso a este registro', 4) then raise exception 'E8 sem usuario: %', t; end if;

  -- ── E9 ──
  select string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'execute') || has_function_privilege('authenticated', p.oid, 'execute')
           || exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0), ' ' order by p.proname) into t
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('fn_contrato_encargo_candidatas', 'fn_contrato_encargos_vinculaveis', 'fn_contrato_encargo_vincular', 'fn_contrato_encargo_desvincular',
                       '_fn_financiamento_vivo', '_fn_numero_na_descricao', '_fn_encargo_papel_sugerido', '_fn_lancamento_elegivel_a_encargo', 'guard_financiamento_com_encargo');
  if t is distinct from '_fn_encargo_papel_sugerido:falsefalsefalse _fn_financiamento_vivo:falsefalsefalse _fn_lancamento_elegivel_a_encargo:falsefalsefalse '
     || '_fn_numero_na_descricao:falsefalsefalse fn_contrato_encargo_candidatas:falsetruefalse fn_contrato_encargo_desvincular:falsetruefalse '
     || 'fn_contrato_encargo_vincular:falsetruefalse fn_contrato_encargos_vinculaveis:falsetruefalse guard_financiamento_com_encargo:falsefalsefalse'
     then raise exception 'E9 ACL: %', t; end if;

  raise exception 'OK — FIN-CONTRATO-VINCULAR-ENCARGO-01 parte B (E5–E9)';
end $teste$;
rollback;
