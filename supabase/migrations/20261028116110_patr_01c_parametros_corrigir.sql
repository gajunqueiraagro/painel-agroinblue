-- PATR-01c · 116110 — vida util / residual: CORRIGIR O CADASTRO desde o inicio x MUDANCA DE ESTIMATIVA (SALVAR-TRAVA item 2,
-- Gabriel 01/11/2026).
-- Dois gestos diferentes, cada um com a sua trilha:
--   * CORRIGIR O CADASTRO (`fn_patrimonio_parametros_corrigir`, nova): o cadastro estava errado desde o "em uso". A linha inicial
--     passa a ter a vida/residual certos e as linhas posteriores saem (a trilha guarda a copia de todas). A serie inteira se refaz,
--     inclusive os meses passados. Hoje NADA fora da Patrimonio le a depreciacao (o AGRI-05 depende do PATR-02, que nao existe): por
--     isso nao ha' trava de "mes consumido" — quando o PATR-02/AGRI-05 nascer, o briefing dele decide a trava.
--   * MUDANCA DE ESTIMATIVA (`fn_patrimonio_parametros_mudar`, o D4): vale do mes escolhido em diante, a acumulada ate' la' fica. Agora
--     confere a versao do bem (P0001, nunca 40001: ver 116100), devolve a versao nova, grava a trilha e RECUSA a mudanca que nao altera
--     nenhum mes ("Ja' esta' todo depreciado; ..."): a previa diz `sem_efeito` com a mesma frase.
-- As duas devolvem a previa ano a ano (antes x depois) e a posicao no mes atual (acumulada e contabil) pela `_fn_patrimonio_resumo_serie`.
-- A `fn_patrimonio_parametros_mudar` ganha `p_versao` (ultimo parametro, default null = nao confere: a tela de hoje ainda nao o
-- manda; a tela do PR 2 manda sempre). A assinatura muda, entao a antiga sai (DROP guardado pelo md5 do corpo conferido em 116060).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. a trilha aceita as duas acoes novas ------------------------------------------------------------------------------------------
alter table public.patrimonio_bem_trilha drop constraint patrimonio_bem_trilha_acao_check;
alter table public.patrimonio_bem_trilha add constraint patrimonio_bem_trilha_acao_check
  check (acao in ('correcao_em_uso', 'correcao_cadastro', 'mudanca_estimativa'));

-- 2. interna: a serie do bem resumida (ano a ano, o mes atual, o fim da vida, a impressao digital da serie) -----------------------
-- O horizonte vai ate' o fim da MAIOR vida cadastrada (contada do "em uso") ou o mes atual, o que vier depois.
create or replace function public._fn_patrimonio_resumo_serie(p_cliente uuid, p_bem uuid)
returns jsonb
language sql stable set search_path = pg_catalog, public
as $$
  with lim as (
    select date_trunc('month', public._fn_patrimonio_hoje())::date as hoje,
           greatest(date_trunc('month', public._fn_patrimonio_hoje())::date,
                    (date_trunc('month', b.em_uso_desde)
                     + make_interval(months => coalesce((select max(q.vida_util_meses) from public.patrimonio_bem_parametros q
                                                          where q.bem_id = b.id), 0)))::date) as ate
      from public.patrimonio_bens b where b.id = p_bem and b.cliente_id = p_cliente
  ), s as (
    select x.* from lim cross join lateral public._fn_patrimonio_serie(p_cliente, p_bem, lim.ate) x
  )
  select jsonb_build_object(
    'anos', coalesce((select jsonb_agg(jsonb_build_object('ano', a.ano, 'quota', a.quota, 'acumulada', a.acumulada) order by a.ano)
                        from (select extract(year from s.mes)::int as ano, sum(s.quota) as quota,
                                     (array_agg(s.acumulada order by s.mes desc))[1] as acumulada
                                from s group by 1) a), '[]'::jsonb),
    'hoje', (select jsonb_build_object('mes', s.mes, 'base', s.base, 'depreciavel', s.depreciavel, 'acumulada', s.acumulada,
                                       'contabil', s.base - s.acumulada, 'vida_util_meses', s.vida_util_meses, 'residual_pct', s.residual_pct)
               from s join lim on s.mes = lim.hoje),
    'fim_da_vida', (select max(s.mes) from s where s.quota > 0),
    'serie_md5', (select md5(coalesce(string_agg(s.mes::text || ':' || s.quota::text, ',' order by s.mes), '')) from s))
$$;
revoke all on function public._fn_patrimonio_resumo_serie(uuid, uuid) from public, anon, authenticated;
grant execute on function public._fn_patrimonio_resumo_serie(uuid, uuid) to service_role;

-- as linhas de vida util do bem, como ficam guardadas na trilha
create or replace function public._fn_patrimonio_parametros_copia(p_bem uuid)
returns jsonb
language sql stable set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('vigente_desde', q.vigente_desde, 'vida_util_meses', q.vida_util_meses,
           'residual_pct', q.residual_pct, 'motivo', q.motivo, 'criado_em', q.criado_em, 'criado_por', q.criado_por)
           order by q.vigente_desde), '[]'::jsonb)
    from public.patrimonio_bem_parametros q where q.bem_id = p_bem
$$;
revoke all on function public._fn_patrimonio_parametros_copia(uuid) from public, anon, authenticated;
grant execute on function public._fn_patrimonio_parametros_copia(uuid) to service_role;

-- 3. CORRIGIR O CADASTRO desde o inicio ------------------------------------------------------------------------------------------
create or replace function public.fn_patrimonio_parametros_corrigir(p_bem uuid, p_versao integer, p_vida_util_meses integer,
                                                                    p_residual_pct numeric, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
  v_ini public.patrimonio_bem_parametros%rowtype;
  v_n_post int; v_copia jsonb; v_antes jsonb; v_depois jsonb; v_ok boolean := false;
begin
  if not (select c.deprecia from public.patrimonio_categorias c where c.id = b.categoria_id) then
    raise exception using errcode = 'P0001', message = 'Esta categoria não deprecia.';
  end if;
  if b.situacao <> 'em_uso' or b.em_uso_desde is null then
    raise exception using errcode = 'P0001', message = 'Só o bem em uso corrige o cadastro da vida útil por aqui (em formação: edite o bem).';
  end if;
  if p_vida_util_meses is null or p_vida_util_meses <= 0 then raise exception using errcode = 'P0001', message = 'Informe a vida útil em meses.'; end if;
  if p_residual_pct is null or p_residual_pct < 0 or p_residual_pct >= 100 then
    raise exception using errcode = 'P0001', message = 'O residual vai de 0 a 99,99 %.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo da correção.'; end if;
  perform 1 from public.patrimonio_bens x where x.id = b.id and x.versao = p_versao for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Este bem foi alterado por outra pessoa. Feche e abra de novo.';
  end if;

  select * into v_ini from public.patrimonio_bem_parametros q where q.bem_id = b.id order by q.vigente_desde limit 1;
  if v_ini.id is null then raise exception using errcode = 'P0001', message = 'Este bem não tem vida útil cadastrada.'; end if;
  select count(*) into v_n_post from public.patrimonio_bem_parametros q where q.bem_id = b.id and q.id <> v_ini.id;
  if v_n_post = 0 and v_ini.vida_util_meses is not distinct from p_vida_util_meses and v_ini.residual_pct = p_residual_pct then
    raise exception using errcode = 'P0001', message = 'Nada a corrigir: o cadastro já tem esta vida útil e este residual desde o início.';
  end if;
  v_copia := public._fn_patrimonio_parametros_copia(b.id);
  v_antes := public._fn_patrimonio_resumo_serie(b.cliente_id, b.id);

  if p_simular then
    begin
      delete from public.patrimonio_bem_parametros q where q.bem_id = b.id and q.id <> v_ini.id;
      update public.patrimonio_bem_parametros q set vida_util_meses = p_vida_util_meses, residual_pct = p_residual_pct,
             vigente_desde = date_trunc('month', b.em_uso_desde)::date
       where q.id = v_ini.id;
      v_depois := public._fn_patrimonio_resumo_serie(b.cliente_id, b.id);
      v_ok := true;
      raise exception using errcode = 'P0001', message = 'desfaz a previa';
    exception when others then
      if not v_ok then raise; end if;
    end;
    return jsonb_build_object('ok', true, 'simulado', true, 'versao', b.versao, 'linhas_removidas', v_n_post,
      'parametros_antes', v_copia, 'antes', v_antes - 'serie_md5', 'depois', v_depois - 'serie_md5');
  end if;

  delete from public.patrimonio_bem_parametros q where q.bem_id = b.id and q.id <> v_ini.id;
  update public.patrimonio_bem_parametros q set vida_util_meses = p_vida_util_meses, residual_pct = p_residual_pct,
         vigente_desde = date_trunc('month', b.em_uso_desde)::date, motivo = btrim(p_motivo), criado_por = auth.uid(), criado_em = now()
   where q.id = v_ini.id;
  v_depois := public._fn_patrimonio_resumo_serie(b.cliente_id, b.id);
  insert into public.patrimonio_bem_trilha (cliente_id, bem_id, acao, antes, depois, motivo, por)
  values (b.cliente_id, b.id, 'correcao_cadastro',
          jsonb_build_object('parametros', v_copia, 'hoje', v_antes->'hoje', 'fim_da_vida', v_antes->'fim_da_vida'),
          jsonb_build_object('parametros', public._fn_patrimonio_parametros_copia(b.id), 'hoje', v_depois->'hoje',
                             'fim_da_vida', v_depois->'fim_da_vida'),
          btrim(p_motivo), auth.uid());
  update public.patrimonio_bens x set versao = x.versao + 1, alterado_em = now(), alterado_por = auth.uid() where x.id = b.id;
  return jsonb_build_object('ok', true, 'simulado', false, 'versao', b.versao + 1, 'linhas_removidas', v_n_post,
    'antes', v_antes - 'serie_md5', 'depois', v_depois - 'serie_md5');
end $$;
revoke all on function public.fn_patrimonio_parametros_corrigir(uuid, integer, integer, numeric, text, boolean) from public, anon;
grant execute on function public.fn_patrimonio_parametros_corrigir(uuid, integer, integer, numeric, text, boolean) to authenticated, service_role;

-- 4. MUDANCA DE ESTIMATIVA (o D4): troca de assinatura (+ p_versao), guardada pelo corpo conferido ----------------------------------
do $guarda$
begin
  if (select md5(p.prosrc) from pg_proc p
       where p.oid = 'public.fn_patrimonio_parametros_mudar(uuid,date,integer,numeric,text,boolean)'::regprocedure)
     is distinct from 'd2aea1d649b8b0fe65df34af39c01686' then
    raise exception '116110: o corpo da fn_patrimonio_parametros_mudar nao e'' o conferido (116060)';
  end if;
end $guarda$;
drop function public.fn_patrimonio_parametros_mudar(uuid, date, integer, numeric, text, boolean);

-- So' deste mes em diante (o mes informado e' arredondado para o 1o dia; antes do mes atual = recusa). A previa devolve a quota do
-- mes da vigencia antes e depois, a serie ano a ano antes e depois e `sem_efeito` (calculada num bloco que se desfaz).
create or replace function public.fn_patrimonio_parametros_mudar(p_bem uuid, p_vigente_desde date, p_vida_util_meses integer,
                                                                 p_residual_pct numeric, p_motivo text, p_simular boolean default true,
                                                                 p_versao integer default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
  v_m date := date_trunc('month', p_vigente_desde)::date;
  v_mes_atual date := date_trunc('month', public._fn_patrimonio_hoje())::date;
  v_antes numeric; v_depois numeric; v_acum_antes numeric; v_acum_depois numeric; v_ok boolean := false;
  v_copia jsonb; v_res_antes jsonb; v_res_depois jsonb; v_sem_efeito boolean; v_aviso text;
begin
  if not (select c.deprecia from public.patrimonio_categorias c where c.id = b.categoria_id) then
    raise exception using errcode = 'P0001', message = 'Esta categoria não deprecia.';
  end if;
  if b.situacao <> 'em_uso' then
    raise exception using errcode = 'P0001', message = 'Só o bem em uso muda a vida útil por aqui (em formação: edite o bem).';
  end if;
  if v_m is null or v_m < v_mes_atual then
    raise exception using errcode = 'P0001', message = 'A mudança vale deste mês em diante: escolha o mês atual ou um mês futuro.';
  end if;
  if p_vida_util_meses is null or p_vida_util_meses <= 0 then raise exception using errcode = 'P0001', message = 'Informe a vida útil em meses.'; end if;
  if p_residual_pct is null or p_residual_pct < 0 or p_residual_pct >= 100 then
    raise exception using errcode = 'P0001', message = 'O residual vai de 0 a 99,99 %.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo da mudança.'; end if;
  perform 1 from public.patrimonio_bens x where x.id = b.id and (p_versao is null or x.versao = p_versao) for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Este bem foi alterado por outra pessoa. Feche e abra de novo.';
  end if;
  select x.versao into b.versao from public.patrimonio_bens x where x.id = b.id;

  select s.quota, s.acumulada into v_antes, v_acum_antes from public._fn_patrimonio_serie(b.cliente_id, b.id, v_m) s where s.mes = v_m;
  v_copia := public._fn_patrimonio_parametros_copia(b.id);
  v_res_antes := public._fn_patrimonio_resumo_serie(b.cliente_id, b.id);

  begin
    insert into public.patrimonio_bem_parametros (cliente_id, bem_id, vigente_desde, vida_util_meses, residual_pct, motivo, criado_por)
    values (b.cliente_id, b.id, v_m, p_vida_util_meses, p_residual_pct, p_motivo, auth.uid())
    on conflict (bem_id, vigente_desde) do update set vida_util_meses = excluded.vida_util_meses, residual_pct = excluded.residual_pct;
    select s.quota, s.acumulada into v_depois, v_acum_depois from public._fn_patrimonio_serie(b.cliente_id, b.id, v_m) s where s.mes = v_m;
    v_res_depois := public._fn_patrimonio_resumo_serie(b.cliente_id, b.id);
    v_ok := true;
    raise exception using errcode = 'P0001', message = 'desfaz a previa';
  exception when others then
    if not v_ok then raise; end if;
  end;
  v_sem_efeito := (v_res_antes->>'serie_md5') is not distinct from (v_res_depois->>'serie_md5');
  if v_sem_efeito then
    v_aviso := case when (v_res_antes->>'fim_da_vida')::date < v_m or v_res_antes->>'fim_da_vida' is null
                    then 'Já está todo depreciado; esta mudança não altera nada. Quer corrigir o cadastro desde o início?'
                    else 'Esta mudança não altera nenhum mês da depreciação.' end;
  end if;

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'vigente_desde', v_m, 'quota_antes', v_antes, 'quota_depois', v_depois,
      'acumulada_antes', v_acum_antes, 'acumulada_depois', v_acum_depois, 'versao', b.versao,
      'sem_efeito', v_sem_efeito, 'aviso', v_aviso, 'antes', v_res_antes - 'serie_md5', 'depois', v_res_depois - 'serie_md5');
  end if;
  if v_sem_efeito then raise exception using errcode = 'P0001', message = v_aviso; end if;

  insert into public.patrimonio_bem_parametros (cliente_id, bem_id, vigente_desde, vida_util_meses, residual_pct, motivo, criado_por)
  values (b.cliente_id, b.id, v_m, p_vida_util_meses, p_residual_pct, btrim(p_motivo), auth.uid())
  on conflict (bem_id, vigente_desde) do update set vida_util_meses = excluded.vida_util_meses, residual_pct = excluded.residual_pct,
     motivo = excluded.motivo, criado_por = excluded.criado_por, criado_em = now();
  insert into public.patrimonio_bem_trilha (cliente_id, bem_id, acao, antes, depois, motivo, por)
  values (b.cliente_id, b.id, 'mudanca_estimativa',
          jsonb_build_object('parametros', v_copia, 'hoje', v_res_antes->'hoje', 'fim_da_vida', v_res_antes->'fim_da_vida'),
          jsonb_build_object('parametros', public._fn_patrimonio_parametros_copia(b.id), 'hoje', v_res_depois->'hoje',
                             'fim_da_vida', v_res_depois->'fim_da_vida', 'vigente_desde', v_m),
          btrim(p_motivo), auth.uid());
  update public.patrimonio_bens x set versao = x.versao + 1, alterado_em = now(), alterado_por = auth.uid() where x.id = b.id;
  return jsonb_build_object('ok', true, 'simulado', false, 'vigente_desde', v_m, 'versao', b.versao + 1,
    'antes', v_res_antes - 'serie_md5', 'depois', v_res_depois - 'serie_md5');
end $$;
revoke all on function public.fn_patrimonio_parametros_mudar(uuid, date, integer, numeric, text, boolean, integer) from public, anon;
grant execute on function public.fn_patrimonio_parametros_mudar(uuid, date, integer, numeric, text, boolean, integer) to authenticated, service_role;
