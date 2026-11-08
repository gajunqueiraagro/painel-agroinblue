-- MAPA-PIQUETE-SUBAREA-01 item 8 · decisão A (a) (Gabriel 08/11/2026): a área do CADASTRO do pasto que tem piquetes = a soma dos piquetes.
-- A área do mês (`fn_pasto_area_no_mes`) já é a soma desde a FECH-PASTO-UNIDADE-01; o número do cadastro (`pastos.area_produtiva_ha`) é a
-- cópia que o `_fn_pasto_area_sincronizar` tira da área do mês de hoje — e ficou velha nos pais (Modulo 05: 125,00 no cadastro, 133,58 a soma).
-- Aqui: o MESMO sincronizador, em cada pai que difere (nada de vigência nova; os meses fechados não mudam). Guarda: a lista lida em 08/11
-- (37 pais, a área de antes de cada um); qualquer diferença recusa. Trilha: `audit_log` (ação 'pai_area_cadastro_soma', o antes e o depois).
do $m$
declare
  v_mes text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM');
  v_lista jsonb; v_n int; r record; v_rodada uuid := gen_random_uuid();
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'cliente_id', p.cliente_id, 'fazenda_id', p.fazenda_id,
                                               'antes', p.area_produtiva_ha, 'depois', public.fn_pasto_area_no_mes(p.id, v_mes)) order by p.id), '[]'::jsonb)
    into v_lista
    from public.pastos p
   where p.ativo
     and exists (select 1 from public.pasto_grupos g where g.pasto_origem_id = p.id and g.ativo)
     and exists (select 1 from public.pastos q where public._fn_pai_do_piquete(q.id) = p.id and q.ativo
                   and public.fn_pasto_vigente_no_mes(q.ativo, q.data_inicio, q.data_fim, v_mes))
     and p.area_produtiva_ha is distinct from public.fn_pasto_area_no_mes(p.id, v_mes);
  v_n := jsonb_array_length(v_lista);
  if v_n <> 37 or md5((select string_agg((x->>'id') || ':' || (x->>'antes') || '>' || (x->>'depois'), ',' order by x->>'id') from jsonb_array_elements(v_lista) x))
                 <> 'fa383364ad3f6a2609a48ffc2cd0d9ca' then
    raise exception 'pai_area_cadastro_soma: a lista não é a da prévia de 08/11 (% pais). Nada foi gravado.', v_n;
  end if;
  for r in select x from jsonb_array_elements(v_lista) x loop
    perform public._fn_pasto_area_sincronizar((r.x->>'id')::uuid);
  end loop;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  select (x->>'cliente_id')::uuid, (x->>'fazenda_id')::uuid, null, 'cadastros', 'pai_area_cadastro_soma', 'pastos', (x->>'id')::uuid,
         format('%s: área do cadastro %s → %s ha (a soma dos piquetes)', x->>'nome', x->>'antes', x->>'depois'),
         jsonb_build_object('area_produtiva_ha', (x->>'antes')::numeric, 'rodada', v_rodada),
         jsonb_build_object('area_produtiva_ha', (x->>'depois')::numeric, 'rodada', v_rodada),
         'sistema:MAPA-PIQUETE-SUBAREA-01'
    from jsonb_array_elements(v_lista) x;
  if exists (select 1 from jsonb_array_elements(v_lista) x join public.pastos p on p.id = (x->>'id')::uuid
              where p.area_produtiva_ha is distinct from (x->>'depois')::numeric) then
    raise exception 'pai_area_cadastro_soma: algum pai não ficou com a soma. Nada foi gravado.';
  end if;
end $m$;
