-- PASTO-FICHA-01 · teste do adendo do PR B (20261028117240: sistema do pasto + potencial de lotação). Roda DEPOIS da migration (no ensaio, na
-- mesma transação). Fixture sintético no cliente Teste (43f32d07 · Fazenda Teste Cana c2498ace); admin = 7bd0b6ad; "de fora" = a91962cd.
-- As chamadas rodam como `authenticated` com as claims do usuário. TERMINA EM RAISE: nada fica no banco.
--   P0  objetos: a leitura pública fechada (anon sem EXECUTE), as internas sem EXECUTE para authenticated; a lista `sistema_pasto` na trava
--       do catálogo e semeada (Pasto · intensivo · confinamento, a classe no grupo, com trilha); a época mês a mês (águas nov–abr, seca mai–out)
--   P1  o sistema pela ficha: criar com o sistema, a ficha mostra o nome; item de outra lista recusa; a gravação direta não passa
--   P2  o potencial: avaliador = o nome de quem digitou; a época do mês escolhe o valor; a avaliação mais recente SEM o valor da época não
--       apaga o potencial (vale a anterior que tem); kg/ha = UA/ha × 450; a leitura única = a ficha = a lotação × suporte
--   P3  confinamento: a gravação do potencial recusa; a avaliação sem potencial passa; a leitura dá nulo com a marca
--   P4  acesso: o de fora leva 42501; a fazenda de outro cliente leva 42501; mês inválido recusa
set local lock_timeout = '2s';
set local statement_timeout = '25s';

do $p0$
declare n int; f text; v_ep text := '';
begin
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_pastos_potencial_no_mes' and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 1 then raise exception 'P0: fn_pastos_potencial_no_mes não está fechada como devia'; end if;
  foreach f in array array['_fn_pasto_epoca', '_fn_pasto_potencial_no_mes'] loop
    select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f
       and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
    if n <> 1 then raise exception 'P0: a interna % está aberta', f; end if;
  end loop;
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'catalogo_itens_lista_check')) not like '%sistema_pasto%' then
    raise exception 'P0: a trava do catálogo não aceita sistema_pasto';
  end if;
  select string_agg(i.grupo, ',' order by i.ordem) into f from public.catalogo_itens i
   where i.lista = 'sistema_pasto' and i.cliente_id is null and i.ativo
     and exists (select 1 from public.catalogo_itens_trilha t where t.item_id = i.id and t.acao = 'criar');
  if f is distinct from 'pasto,intensivo,confinamento' then raise exception 'P0: semeadura do sistema = %', f; end if;
  for n in 1..12 loop v_ep := v_ep || left(public._fn_pasto_epoca(make_date(2026, n, 1)), 1); end loop;
  if v_ep <> 'aaaassssssaa' then raise exception 'P0: a época mês a mês = % (esperado aaaassssssaa)', v_ep; end if;
  perform set_config('teste.nome_admin', (select pr.nome from public.profiles pr where pr.user_id = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'), true);
  perform set_config('teste.outra', (select f.id::text from public.fazendas f where f.cliente_id <> '43f32d07-dba8-4670-900c-bf645440c04a'
                                       order by f.id limit 1), true);
end $p0$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;

do $p1$
declare r jsonb; v_id uuid; v_int uuid; v_conf uuid; v_forr uuid;
  v_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_am_ant text := to_char((date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '1 month')::date, 'YYYY-MM');
begin
  select id into v_int from public.catalogo_itens where lista = 'sistema_pasto' and cliente_id is null and grupo = 'intensivo';
  select id into v_conf from public.catalogo_itens where lista = 'sistema_pasto' and cliente_id is null and grupo = 'confinamento';
  select id into v_forr from public.catalogo_itens where lista = 'forrageira' and cliente_id is null and nome = 'Mombaça';
  perform set_config('teste.conf', v_conf::text, true);
  r := public.fn_pasto_criar(v_faz, jsonb_build_object('nome', 'Pasto Potencial Teste', 'tipo_uso', 'recria', 'mes_inicio', v_am_ant,
         'sistema_id', v_int), 40, false);
  v_id := (r->>'pasto_id')::uuid;
  perform set_config('teste.pasto', v_id::text, true);
  if (select sistema_id from public.pastos where id = v_id) is distinct from v_int then raise exception 'P1: o criar não gravou o sistema'; end if;
  r := public.fn_pasto_ficha(v_id);
  if (r->'nomes'->>'sistema') is distinct from 'Pasto intensivo / irrigado' or (r->'nomes'->>'sistema_grupo') is distinct from 'intensivo' then
    raise exception 'P1: a ficha não mostra o sistema %', r->'nomes';
  end if;
  begin perform public.fn_pasto_ficha_salvar(v_id, 1, jsonb_build_object('sistema_id', v_forr), null, true);
        raise exception 'P1: aceitou item de outra lista no sistema';
  exception when sqlstate 'P0001' then if sqlerrm <> 'O sistema escolhido não está na lista. Escolha de novo.' then raise; end if; end;
  begin update public.pastos set sistema_id = v_conf where id = v_id; raise exception 'P1: a gravação direta do sistema passou';
  exception when sqlstate 'P0001' then if sqlerrm <> 'Os dados da ficha do pasto gravam só pela ficha. Nada foi gravado.' then raise; end if; end;
end $p1$;

do $p2$
declare r jsonb; v_id uuid := current_setting('teste.pasto')::uuid; v_a1 uuid; v_sup numeric; v_ep text; x record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_am text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM');
begin
  -- A1 (mar/26): águas 2,0 · seca 1,0, sem avaliador → o nome de quem digitou
  r := public.fn_pasto_avaliacao_salvar(v_id, '{"data": "2026-03-10", "suporte_aguas_ua_ha": 2.0, "suporte_seca_ua_ha": 1.0}', null, null, false);
  v_a1 := (r->>'id')::uuid;
  if (select avaliador from public.pasto_condicoes where id = v_a1) is distinct from current_setting('teste.nome_admin') then
    raise exception 'P2: avaliador = % (esperado o nome de quem digitou)', (select avaliador from public.pasto_condicoes where id = v_a1);
  end if;
  -- A2 (set/26): só águas 1,5 (a seca em branco)
  perform public.fn_pasto_avaliacao_salvar(v_id, '{"data": "2026-09-20", "suporte_aguas_ua_ha": 1.5, "avaliador": "Fulano"}', null, null, false);
  -- a época escolhe o valor; a A2 sem seca não apaga a seca da A1
  for x in select * from (values ('2026-04', 'aguas', 2.0), ('2026-05', 'seca', 1.0), ('2026-10', 'seca', 1.0), ('2026-11', 'aguas', 1.5))
                    v(am, ep, sup) loop
    select l.epoca, l.suporte_ua_ha into v_ep, v_sup from public.fn_pasto_lotacao_meses(v_id, x.am, 1) l;
    if v_ep is distinct from x.ep or v_sup is distinct from x.sup then
      raise exception 'P2: % deu % %, esperado % %', x.am, v_ep, v_sup, x.ep, x.sup;
    end if;
  end loop;
  -- a leitura única (mês atual) = a ficha = a lotação × suporte; kg/ha = × 450
  select * into x from public.fn_pastos_potencial_no_mes('43f32d07-dba8-4670-900c-bf645440c04a', v_am, 'c2498ace-8478-410c-a697-d3f2e2934d1f') p
   where p.pasto_id = v_id;
  v_sup := case when extract(month from v_hoje) between 5 and 10 then 1.0 else 1.5 end;
  if x.potencial_ua_ha is distinct from v_sup or x.potencial_kg_ha is distinct from round(v_sup * 450) or x.confinamento then
    raise exception 'P2: leitura única do mês = % (esperado % UA/ha, % kg/ha)', row_to_json(x), v_sup, round(v_sup * 450);
  end if;
  r := public.fn_pasto_ficha(v_id);
  if (r->'potencial'->>'potencial_ua_ha')::numeric is distinct from v_sup or (r->'potencial'->>'epoca') is distinct from x.epoca then
    raise exception 'P2: a ficha não é a leitura única %', r->'potencial';
  end if;
  if (select l.suporte_ua_ha from public.fn_pasto_lotacao_meses(v_id, v_am, 1) l) is distinct from v_sup then
    raise exception 'P2: a lotação × suporte não é a leitura única';
  end if;
  -- todos os pastos vigentes da fazenda vêm (sem avaliação = nulo, nunca zero)
  if exists (select 1 from public.fn_pastos_potencial_no_mes('43f32d07-dba8-4670-900c-bf645440c04a', v_am, null) p
              where p.pasto_id <> v_id and p.potencial_ua_ha = 0) then
    raise exception 'P2: pasto sem avaliação veio com zero';
  end if;
end $p2$;

do $p3$
declare r jsonb; v_id uuid := current_setting('teste.pasto')::uuid; x record; v_v int;
  v_am text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM');
begin
  select ficha_versao into v_v from public.pastos where id = v_id;
  perform public.fn_pasto_ficha_salvar(v_id, v_v, jsonb_build_object('sistema_id', current_setting('teste.conf')), 'virou confinamento', false);
  begin perform public.fn_pasto_avaliacao_salvar(v_id, '{"data": "2026-10-01", "suporte_seca_ua_ha": 3}', null, null, true);
        raise exception 'P3: o confinamento aceitou potencial';
  exception when sqlstate 'P0001' then if sqlerrm <> 'Confinamento não tem potencial de lotação em UA/ha: deixe em branco.' then raise; end if; end;
  r := public.fn_pasto_avaliacao_salvar(v_id, '{"data": "2026-10-01", "cochos": "bom"}', null, null, true);
  if not (r->>'ok')::boolean then raise exception 'P3: a avaliação sem potencial não passou'; end if;
  select * into x from public.fn_pastos_potencial_no_mes('43f32d07-dba8-4670-900c-bf645440c04a', v_am, null) p where p.pasto_id = v_id;
  if not x.confinamento or x.potencial_ua_ha is not null or x.potencial_kg_ha is not null or x.sistema is distinct from 'Confinamento' then
    raise exception 'P3: o confinamento leu potencial %', row_to_json(x);
  end if;
  if (select l.suporte_ua_ha from public.fn_pasto_lotacao_meses(v_id, '2026-10', 1) l) is not null then
    raise exception 'P3: a lotação × suporte deu suporte ao confinamento';
  end if;
end $p3$;

do $p4$
declare v_outra uuid := current_setting('teste.outra')::uuid; v_ok int := 0; c text;
begin
  begin perform * from public.fn_pastos_potencial_no_mes('43f32d07-dba8-4670-900c-bf645440c04a', 'xx', null); raise exception 'P4: aceitou mês inválido';
  exception when sqlstate 'P0001' then if sqlerrm <> 'Mês: escolha o mês e o ano.' then raise; end if; end;
  foreach c in array array[
    format('select * from public.fn_pastos_potencial_no_mes(%L, %L, %L)', '43f32d07-dba8-4670-900c-bf645440c04a', '2026-11', v_outra)] loop
    begin execute c; raise exception 'P4: a fazenda de outro cliente passou';
    exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  end loop;
  perform set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
  foreach c in array array[
    format('select * from public.fn_pastos_potencial_no_mes(%L, %L, null)', '43f32d07-dba8-4670-900c-bf645440c04a', '2026-11'),
    format('select * from public.fn_pastos_potencial_no_mes(%L, %L, %L)', '43f32d07-dba8-4670-900c-bf645440c04a', '2026-11',
           'c2498ace-8478-410c-a697-d3f2e2934d1f')] loop
    begin execute c; raise exception 'P4: o de fora passou em %', c;
    exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  end loop;
  if v_ok <> 3 then raise exception 'P4: % de 3 barradas', v_ok; end if;
end $p4$;

reset role;
do $fim$ begin raise exception 'OK PASTO-FICHA-01 (117240): P0–P4 passaram (nada fica no banco)'; end $fim$;
