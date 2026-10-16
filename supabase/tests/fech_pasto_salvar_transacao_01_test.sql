-- FECH-PASTO-SALVAR-TRANSACAO-01 — o card do pasto pelos dois escritores do banco. Termina em RAISE 'OK'; transacao revertida, sem sobra.
-- Sintetico no cliente Teste (pastos e cards em 2031). Compara com `is distinct from`. Exige as DUAS partes aplicadas (199400 e 199500).
--   S1 salvar: campos do mes + itens trocados numa chamada; a marca peso_atualizado preservada; quantidade 0 nao entra
--   S2 salvar em card fechado: recusado
--   S3 reabrir: so' aquele card volta a rascunho, o outro do mes segue fechado; uma linha no log com o pasto no motivo
--   S4 salvar com P2 validado: recusado com a frase do P2, campos e itens intactos (md5)
--   S5 DELETE / INSERT direto em item de mes com P2: recusados pela trava (parte 2)
--   S6 reabrir com P2: recusado, card segue fechado, nenhum log
--   S7 outro cliente (gestor so' do NJ) e sem usuario: 42501 nas duas
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_admin constant text := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'; c_user_nj constant text := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';
  m1 constant text := '2031-01'; m2 constant text := '2031-02';
  pa uuid; pb uuid; pc uuid; fa uuid; fb uuid; fc uuid; fa2 uuid; fb2 uuid; cat uuid[]; r record; v jsonb;
  antes text; depois text; n_log int; ok boolean; claims text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  select array_agg(id order by id) into cat from (select id from public.categorias order by id limit 3) x;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo, entra_conciliacao)
    values (f, k, 'SINT PASTO A', 10, 'cria', true, true) returning id into pa;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo, entra_conciliacao)
    values (f, k, 'SINT PASTO B', 10, 'cria', true, true) returning id into pb;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo, entra_conciliacao)
    values (f, k, 'SINT PASTO C', 10, 'cria', true, true) returning id into pc;
  insert into public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) values (pa, f, k, m1, 'rascunho') returning id into fa;
  insert into public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) values (pb, f, k, m1, 'rascunho') returning id into fb;
  insert into public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) values (pc, f, k, m1, 'fechado') returning id into fc;
  insert into public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) values (pa, f, k, m2, 'fechado') returning id into fa2;
  insert into public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) values (pb, f, k, m2, 'fechado') returning id into fb2;
  insert into public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_medio_kg, origem_dado, peso_atualizado)
    values (fa, cat[1], 10, 300, 'manual', true);

  /* S1 */
  v := public.fn_fechamento_pasto_salvar(fa, '{"lote_mes":"L1","tipo_uso_mes":"recria","qualidade_mes":"7","observacao_mes":""}'::jsonb,
    jsonb_build_array(jsonb_build_object('categoria_id', cat[1], 'quantidade', 12, 'peso_medio_kg', 310),
                      jsonb_build_object('categoria_id', cat[2], 'quantidade', 5, 'peso_medio_kg', 200),
                      jsonb_build_object('categoria_id', cat[3], 'quantidade', 0)));
  if (v->>'itens')::int is distinct from 2 then raise exception 'S1 retorno %', v; end if;
  select * into r from public.fechamento_pastos where id = fa;
  if r.lote_mes is distinct from 'L1' or r.tipo_uso_mes is distinct from 'recria' or r.qualidade_mes is distinct from 7::numeric
     or r.observacao_mes is not null then raise exception 'S1 campos %', r; end if;
  if (select peso_atualizado from public.fechamento_pasto_itens where fechamento_id = fa and categoria_id = cat[1]) is distinct from true
     or (select peso_atualizado from public.fechamento_pasto_itens where fechamento_id = fa and categoria_id = cat[2]) is distinct from false
     or (select quantidade from public.fechamento_pasto_itens where fechamento_id = fa and categoria_id = cat[1]) is distinct from 12
     or (select count(*) from public.fechamento_pasto_itens where fechamento_id = fa) is distinct from 2::bigint then
    raise exception 'S1 itens'; end if;

  /* S2 */
  ok := false;
  begin perform public.fn_fechamento_pasto_salvar(fc, '{}'::jsonb, '[]'::jsonb);
  exception when others then ok := sqlerrm like '%está fechado%'; end;
  if not ok then raise exception 'S2 card fechado aceito'; end if;

  /* S3 */
  select count(*) into n_log from public.fechamento_reaberturas_log where fazenda_id = f and ano_mes = m2;
  v := public.fn_fechamento_pasto_reabrir(fa2, 'Reabertura individual via modal de pasto');
  if (select status from public.fechamento_pastos where id = fa2) is distinct from 'rascunho'
     or (select status from public.fechamento_pastos where id = fb2) is distinct from 'fechado' then raise exception 'S3 status'; end if;
  if (select count(*) from public.fechamento_reaberturas_log where fazenda_id = f and ano_mes = m2) is distinct from (n_log + 1)::bigint
     or not exists (select 1 from public.fechamento_reaberturas_log where fazenda_id = f and ano_mes = m2
                    and motivo = 'Reabertura individual via modal de pasto · pasto SINT PASTO A' and pilar = 'p1_mapa_pastos'
                    and reaberto_por = c_admin::uuid and cliente_id = k) then raise exception 'S3 log'; end if;

  /* P2 validado em m1 */
  insert into public.valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, status) values (f, k, m1, 'validado');

  /* S4 */
  select md5(row(x.*)::text) into antes from public.fechamento_pastos x where id = fa;
  antes := antes || (select string_agg(md5(row(i.*)::text), ',' order by i.id) from public.fechamento_pasto_itens i where fechamento_id = fa);
  ok := false;
  begin perform public.fn_fechamento_pasto_salvar(fa, '{"lote_mes":"OUTRO"}'::jsonb,
    jsonb_build_array(jsonb_build_object('categoria_id', cat[1], 'quantidade', 99)));
  exception when others then ok := sqlerrm like '%Valor do Rebanho validado ou P2 fechado%'; end;
  select md5(row(x.*)::text) into depois from public.fechamento_pastos x where id = fa;
  depois := depois || (select string_agg(md5(row(i.*)::text), ',' order by i.id) from public.fechamento_pasto_itens i where fechamento_id = fa);
  if not ok or antes is distinct from depois then raise exception 'S4 P2 (recusou=%)', ok; end if;

  /* S5 */
  ok := false;
  begin delete from public.fechamento_pasto_itens where fechamento_id = fa;
  exception when others then ok := sqlerrm like '%P2 fechado%'; end;
  if not ok then raise exception 'S5 DELETE com P2 aceito'; end if;
  ok := false;
  begin insert into public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade) values (fb, cat[1], 1);
  exception when others then ok := sqlerrm like '%P2 fechado%'; end;
  if not ok then raise exception 'S5 INSERT com P2 aceito'; end if;

  /* S6 */
  select count(*) into n_log from public.fechamento_reaberturas_log where fazenda_id = f and ano_mes = m1;
  ok := false;
  begin perform public.fn_fechamento_pasto_reabrir(fc, 'Reabertura individual via modal de pasto');
  exception when others then ok := sqlerrm like '%P2 fechado%'; end;
  if not ok or (select status from public.fechamento_pastos where id = fc) is distinct from 'fechado'
     or (select count(*) from public.fechamento_reaberturas_log where fazenda_id = f and ano_mes = m1) is distinct from n_log::bigint then
    raise exception 'S6 reabrir com P2 (recusou=%)', ok; end if;

  /* S7 */
  foreach claims in array array[json_build_object('sub', c_user_nj, 'role', 'authenticated')::text, '{}'] loop
    perform set_config('request.jwt.claims', claims, true);
    ok := false;
    begin perform public.fn_fechamento_pasto_salvar(fb, '{}'::jsonb, '[]'::jsonb);
    exception when others then ok := sqlstate = '42501'; end;
    if not ok then raise exception 'S7 salvar aceito para %', claims; end if;
    ok := false;
    begin perform public.fn_fechamento_pasto_reabrir(fb2, 'x');
    exception when others then ok := sqlstate = '42501'; end;
    if not ok then raise exception 'S7 reabrir aceito para %', claims; end if;
  end loop;

  raise exception 'FECH-PASTO-SALVAR-TRANSACAO-01: OK';
end
$teste$;
ROLLBACK;
