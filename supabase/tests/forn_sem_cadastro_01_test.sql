-- FORN-SEM-CADASTRO-01 — a aba "Sem cadastro": leitura, ligar, desfazer.
-- Roda como `postgres`, DEPOIS da migration 20261027204700, e TERMINA EM RAISE: nada fica no banco. Sucesso = a excecao final
-- comeca com "OK". Tudo sintetico no cliente Teste (43f32d07).
-- S1 leitura: o texto junta so' os vivos sem fornecedor (cancelado e transferencia fora) e sugere o cadastro de nome igual.
-- S2 simular nao grava nada (lancamentos, cadastro e operacoes por md5).
-- S3 ligar: todos os lancamentos do texto ligados; descricao e "editado manualmente" intactos; o texto vira apelido de busca e a
--    busca unica acha o cadastro por ele.
-- S4 desfazer: os lancamentos voltam identicos (fora os carimbos), o apelido sai, a operacao fica desfeita; desfazer de novo recusa.
-- S5 "Pec.3M-": texto de rateio nao se liga a cadastro sem o prefixo (simulacao e gravacao).
-- S6 criar + ligar + desfazer: o cadastro criado e sem uso pode sair de uso junto, pelo dono do excluir.
-- S7 as internas nao sao executaveis pela tela.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create function pg_temp.forn(p_nome text) returns uuid language sql as $f$
  insert into financeiro_fornecedores (cliente_id, nome) values ('43f32d07-dba8-4670-900c-bf645440c04a', p_nome) returning id $f$;
create function pg_temp.lan(p_desc text, p_tipo text default '2-Saídas', p_cancelado boolean default false) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id, data_competencia, data_vencimento, valor,
      sinal, tipo_operacao, status_transacao, descricao, favorecido_id, cenario, cancelado)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f',
      case when p_tipo like '2-%' then '131b8501-caf7-4964-b1b1-3f552ad2b75d'::uuid end,
      case when p_tipo like '2-%' then null else '131b8501-caf7-4964-b1b1-3f552ad2b75d'::uuid end,
      '2026-09-01', '2026-09-10', 100, case when p_tipo like '1-%' then '1' else '-1' end, p_tipo, 'programado', p_desc, null, 'realizado', p_cancelado)
  returning id $f$;
create function pg_temp.foto(p_ids uuid[]) returns text language sql as $f$
  select md5(string_agg((to_jsonb(l) - 'updated_at' - 'updated_by')::text, '|' order by l.id))
    from financeiro_lancamentos_v2 l where l.id = any (p_ids) $f$;
create function pg_temp.rec(p_sql text) returns text language plpgsql as $f$
declare v text;
begin execute p_sql into v; return 'PASSOU ' || coalesce(v, '');
exception when others then return sqlstate || ' ' || sqlerrm; end $f$;

do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_txt constant text := 'SINT FSC Texto Um';
  c_ch text := public._fn_normalizar_texto('SINT FSC Texto Um');
  f_igual uuid := pg_temp.forn('SINT FSC Texto Um');
  f_dest uuid := pg_temp.forn('SINT FSC Destino Ltda');
  f_pec uuid; f_novo uuid;
  l1 uuid := pg_temp.lan('SINT FSC Texto Um'); l2 uuid := pg_temp.lan('SINT FSC  texto um'); l3 uuid := pg_temp.lan('sint fsc texto um');
  lc uuid := pg_temp.lan('SINT FSC Texto Um', '2-Saídas', true);
  lt uuid := pg_temp.lan('SINT FSC Texto Um', '3-Transferências');
  lp uuid; ln uuid;
  v jsonb; r jsonb; v_antes text; v_forn text; v_ops bigint; v_op uuid; t text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);

  -- S1
  v := public.fn_fornecedor_sem_cadastro(c_cli);
  select x into r from jsonb_array_elements(v->'textos') x where x->>'chave' = c_ch;
  if (r->>'qtd')::int is distinct from 3 then raise exception 'S1 qtd: %', r->>'qtd'; end if;
  if r->'sugestao'->>'fornecedor_id' is distinct from f_igual::text or r->'sugestao'->>'motivo' is distinct from 'nome_igual' then
    raise exception 'S1 sugestao: %', r->'sugestao'; end if;
  if r->>'origem' is distinct from 'descricao' then raise exception 'S1 origem: %', r->>'origem'; end if;

  -- S2
  v_antes := pg_temp.foto(array[l1, l2, l3, lc, lt]);
  select md5(aliases::text) into v_forn from financeiro_fornecedores where id = f_dest;
  select count(*) into v_ops from fornecedor_sem_cadastro_operacoes;
  r := public.fn_fornecedor_sem_cadastro_ligar(c_cli, c_ch, false, f_dest);
  if not coalesce((r->>'ok')::boolean, false) or (r->>'lancamentos')::int is distinct from 3 then raise exception 'S2 simular: %', r; end if;
  if pg_temp.foto(array[l1, l2, l3, lc, lt]) is distinct from v_antes then raise exception 'S2 lancamentos mudaram'; end if;
  if (select md5(aliases::text) from financeiro_fornecedores where id = f_dest) is distinct from v_forn then raise exception 'S2 apelido gravado'; end if;
  if (select count(*) from fornecedor_sem_cadastro_operacoes) <> v_ops then raise exception 'S2 operacao gravada'; end if;

  -- S3
  r := public.fn_fornecedor_sem_cadastro_ligar(c_cli, c_ch, false, f_dest, false, false);
  v_op := (r->>'operacao_id')::uuid;
  if v_op is null then raise exception 'S3 sem operacao: %', r; end if;
  if (select count(*) from financeiro_lancamentos_v2 where id in (l1, l2, l3) and favorecido_id = f_dest) <> 3 then raise exception 'S3 ligados'; end if;
  if (select count(*) from financeiro_lancamentos_v2 where id in (lc, lt) and favorecido_id is not null) <> 0 then raise exception 'S3 ligou cancelado/transferencia'; end if;
  if (select descricao from financeiro_lancamentos_v2 where id = l2) is distinct from 'SINT FSC  texto um' then raise exception 'S3 descricao mudou'; end if;
  if exists (select 1 from financeiro_lancamentos_v2 where id in (l1, l2, l3) and editado_manual is true) then raise exception 'S3 editado manual'; end if;
  if not exists (select 1 from financeiro_fornecedores where id = f_dest and c_ch = any (aliases_norm)) then raise exception 'S3 apelido ausente'; end if;
  v := public.fn_fornecedor_buscar(c_cli, c_txt, 'ativos', 50, 0);
  if not exists (select 1 from jsonb_array_elements(v->'itens') i where i->>'id' = f_dest::text) then raise exception 'S3 busca nao acha pelo texto'; end if;

  -- S4
  r := public.fn_fornecedor_sem_cadastro_desfazer(v_op, 'teste S4', false, false);
  if (r->>'voltaram')::int is distinct from 3 then raise exception 'S4 voltaram: %', r; end if;
  if pg_temp.foto(array[l1, l2, l3, lc, lt]) is distinct from v_antes then raise exception 'S4 lancamentos nao voltaram identicos'; end if;
  if (select md5(aliases::text) from financeiro_fornecedores where id = f_dest) is distinct from v_forn then raise exception 'S4 apelido ficou'; end if;
  if (select desfeita_em from fornecedor_sem_cadastro_operacoes where id = v_op) is null then raise exception 'S4 operacao viva'; end if;
  t := pg_temp.rec(format('select public.fn_fornecedor_sem_cadastro_desfazer(%L, %L, false, false)::text', v_op, 'de novo'));
  if t not like 'P0001%ja foi desfeita%' and t not like 'P0001%já foi desfeita%' then raise exception 'S4 desfazer de novo: %', t; end if;

  -- S5
  lp := pg_temp.lan('Pec.3M-SINT FSC Rateio');
  r := public.fn_fornecedor_sem_cadastro_ligar(c_cli, public._fn_normalizar_texto('Pec.3M-SINT FSC Rateio'), true, f_dest);
  if r->'recusa'->>'motivo' is distinct from 'rateio_misto' then raise exception 'S5 simulacao: %', r; end if;
  t := pg_temp.rec(format('select public.fn_fornecedor_sem_cadastro_ligar(%L, %L, true, %L, false, false)::text', c_cli,
                          public._fn_normalizar_texto('Pec.3M-SINT FSC Rateio'), f_dest));
  if t not like 'P0001%Pec.3M-%Nada foi gravado.' then raise exception 'S5 gravacao: %', t; end if;
  if (select favorecido_id from financeiro_lancamentos_v2 where id = lp) is not null then raise exception 'S5 ligou'; end if;
  f_pec := pg_temp.forn('Pec.3M-SINT FSC Rateio Dono');
  r := public.fn_fornecedor_sem_cadastro_ligar(c_cli, public._fn_normalizar_texto('Pec.3M-SINT FSC Rateio'), true, f_pec);
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'S5 mesmo lado: %', r; end if;

  -- S6
  ln := pg_temp.lan('SINT FSC Novo Cadastro');
  f_novo := pg_temp.forn('SINT FSC Novo Cadastro');
  r := public.fn_fornecedor_sem_cadastro_ligar(c_cli, public._fn_normalizar_texto('SINT FSC Novo Cadastro'), false, f_novo, true, false);
  v_op := (r->>'operacao_id')::uuid;
  r := public.fn_fornecedor_sem_cadastro_desfazer(v_op, 'teste S6');
  if not coalesce((r->>'pode_inativar')::boolean, false) then raise exception 'S6 nao oferece inativar: %', r; end if;
  if (select ativo from financeiro_fornecedores where id = f_novo) is not true then raise exception 'S6 simulacao inativou'; end if;
  r := public.fn_fornecedor_sem_cadastro_desfazer(v_op, 'teste S6', true, false);
  if not coalesce((r->>'inativou')::boolean, false) or (select ativo from financeiro_fornecedores where id = f_novo) is not false then
    raise exception 'S6 nao inativou: %', r; end if;
  if (select favorecido_id from financeiro_lancamentos_v2 where id = ln) is not null then raise exception 'S6 lancamento ficou ligado'; end if;

  -- S7
  if has_function_privilege('authenticated', 'public._fn_sem_cadastro_base(uuid)', 'execute') then raise exception 'S7 base aberta'; end if;
  if has_function_privilege('anon', 'public.fn_fornecedor_sem_cadastro_ligar(uuid, text, boolean, uuid, boolean, boolean)', 'execute') then
    raise exception 'S7 ligar aberto ao anon'; end if;

  raise exception 'OK forn_sem_cadastro_01 (S1–S7)';
end $teste$;
rollback;
