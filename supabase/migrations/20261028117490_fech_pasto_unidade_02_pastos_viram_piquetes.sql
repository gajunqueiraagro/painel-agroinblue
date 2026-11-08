-- FECH-PASTO-UNIDADE-01 F2b (Gabriel 08/11/2026: D1 a · D2 a · D3 a · D4 a) — "É piquete de outro pasto…": pastos que hoje são pastos soltos
-- (o P5A e o P5B de antes) passam a ser os PIQUETES de um pasto novo, a partir de um mês. A versão genérica do que a 117480 fez à mão no P5.
--   · D2: o pasto de hoje TERMINA no dia anterior ao início (o histórico fechado fica como está) e nasce um piquete NOVO com a área, a ficha
--     e o polígono dele; o nome de cada piquete vem da tela (sugestão: o mesmo nome de hoje). O pasto pai nasce no início, com a área somada.
--   · D3: os cards desde o início — por mês, o card com mais cabeças passa ao pai (o MESMO card) e as linhas dos outros vão para ele marcadas
--     com o piquete (o mês fica "por piquetes"); os cards que esvaziam saem, com o antes inteiro na trilha. Mês fechado ou Valor do Rebanho
--     validado recusa.
--   · D4: só o admin (`_fn_mapa_so_admin`, a mesma porta do "Concluir piquetes").
--   · o contorno do pai é a união feita na tela (`unirVarios`, a lib do mapa) e o banco confere a área (1% da soma). Sem desenho: sem contorno.
--   · prévia = o gesto inteiro numa subtransação desfeita (ZP001, o padrão do `fn_piquetes_desfazer`): a prévia diz exatamente o que grava.
--   · desfazer pela rodada (`fn_pastos_viram_piquetes_desfazer`): o antes volta (cards recriados com os mesmos ids, linhas de volta, fins e
--     polígonos); o pai e os piquetes ficam INATIVOS (nunca apagados); o grupo sai pelo escritor dele. Recusa se algo mudou no pai depois.
-- Funções novas nascem fechadas: REVOKE de PUBLIC/anon; `authenticated` executa e a guarda de admin + tenant está no corpo.

create or replace function public.fn_pastos_viram_piquetes(p_pastos uuid[], p_nome_pai text, p_inicio date, p_nomes text[],
                                                           p_contorno jsonb default null, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  v_n int := coalesce(cardinality(p_pastos), 0);
  v_pai_nome text := nullif(btrim(coalesce(p_nome_pai, '')), '');
  v_nomes text[]; v_mes text; v_fim date; v_faz uuid; v_cli uuid;
  p public.pastos; v_primeiro public.pastos; v_recusas text[] := '{}'; v_achados int := 0; v_frase text;
  v_area numeric := 0; v_area_total numeric := 0; v_ordem int;
  v_geos int; v_soma_geo numeric; v_area_contorno numeric;
  v_pai uuid; v_piq uuid; v_mapa jsonb := '{}'::jsonb; v_piquetes jsonb := '[]'::jsonb; v_grupo uuid; v_contorno_id uuid;
  v_rodada uuid := gen_random_uuid(); v_i int := 0;
  v_antigos jsonb := '[]'::jsonb; v_cards_antes jsonb; v_itens_antes jsonb; v_geos_antes jsonb;
  m record; v_fica uuid; v_mantidos jsonb := '[]'::jsonb; v_saem jsonb := '[]'::jsonb; v_cab int;
  v_itens_md5 text; v_res jsonb; v_log uuid;
begin
  perform public._fn_mapa_so_admin();
  if v_n < 2 or v_n <> (select count(distinct x) from unnest(p_pastos) x) then
    raise exception using errcode = 'P0001', message = 'Escolha pelo menos dois pastos diferentes para virarem piquetes. Nada foi gravado.';
  end if;
  if p_nomes is null or cardinality(p_nomes) <> v_n then
    raise exception using errcode = 'P0001', message = 'Diga o nome de cada piquete. Nada foi gravado.';
  end if;
  if p_inicio is null or p_inicio <> date_trunc('month', p_inicio)::date then
    raise exception using errcode = 'P0001', message = 'O início é o primeiro dia de um mês. Nada foi gravado.';
  end if;
  if v_pai_nome is null then
    raise exception using errcode = 'P0001', message = 'Diga o nome do pasto. Nada foi gravado.';
  end if;
  v_mes := to_char(p_inicio, 'YYYY-MM'); v_fim := p_inicio - 1;
  select fazenda_id, cliente_id into v_faz, v_cli from public.pastos where id = p_pastos[1];
  if v_faz is null or not coalesce(public.tenant_ok(v_cli), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;

  -- cada pasto: solto, sem fim, desta fazenda, já valendo antes do início, sem mês fechado nem uso que prenda ao pasto desde o início
  for p in select * from public.pastos x where x.id = any (p_pastos) order by array_position(p_pastos, x.id) for update loop
    v_achados := v_achados + 1;
    if v_primeiro.id is null then v_primeiro := p; end if;
    if p.fazenda_id <> v_faz then v_recusas := v_recusas || format('%s é de outra fazenda', p.nome); continue; end if;
    if not p.ativo then v_recusas := v_recusas || format('%s está inativo', p.nome); end if;
    if p.data_fim is not null then v_recusas := v_recusas || format('%s já termina em %s', p.nome, to_char(p.data_fim, 'DD/MM/YYYY')); end if;
    if p.grupo_id is not null then
      v_recusas := v_recusas || format('%s está no grupo %s (tire-o do grupo antes)', p.nome, (select g.nome from public.pasto_grupos g where g.id = p.grupo_id));
    end if;
    if exists (select 1 from public.pasto_grupos g where g.pasto_origem_id = p.id and g.ativo) then
      v_recusas := v_recusas || format('%s já tem piquetes', p.nome);
    end if;
    if p.data_inicio is not null and p.data_inicio > v_fim then
      v_recusas := v_recusas || format('%s começa em %s (precisa valer antes de %s)', p.nome, to_char(p.data_inicio, 'MM/YYYY'), to_char(p_inicio, 'MM/YYYY'));
    end if;
    select string_agg(to_char(to_date(fp.ano_mes || '-01', 'YYYY-MM-DD'), 'MM/YYYY'), ', ' order by fp.ano_mes) into v_frase
      from public.fechamento_pastos fp where fp.pasto_id = p.id and fp.ano_mes >= v_mes and fp.status = 'fechado';
    if v_frase is not null then v_recusas := v_recusas || format('%s tem o mês fechado (%s)', p.nome, v_frase); end if;
    if exists (select 1 from public.fechamento_alocacoes a where a.ano_mes >= v_mes
                and (a.pasto_id = p.id or a.fechamento_id in (select fp.id from public.fechamento_pastos fp where fp.pasto_id = p.id))) then
      v_recusas := v_recusas || format('%s tem lote em grupo de pastejo desde %s', p.nome, to_char(p_inicio, 'MM/YYYY'));
    end if;
    if exists (select 1 from public.fechamento_pastos_membros mm where mm.ano_mes >= v_mes
                and (mm.pasto_id = p.id or mm.fechamento_pasto_id in (select fp.id from public.fechamento_pastos fp where fp.pasto_id = p.id))) then
      v_recusas := v_recusas || format('%s está no P1 fechado de um mês desde %s', p.nome, to_char(p_inicio, 'MM/YYYY'));
    end if;
    if exists (select 1 from public.pasto_movimentacoes v where p.id in (v.pasto_id, v.pasto_origem_id, v.pasto_destino_id) and v.data >= p_inicio) then
      v_recusas := v_recusas || format('%s tem movimentação de gado desde %s', p.nome, to_char(p_inicio, 'MM/YYYY'));
    end if;
    if exists (select 1 from public.pasto_condicoes c where c.pasto_id = p.id and c.data_avaliacao >= p_inicio) then
      v_recusas := v_recusas || format('%s tem avaliação de condição desde %s', p.nome, to_char(p_inicio, 'MM/YYYY'));
    end if;
    v_area := v_area + coalesce(p.area_produtiva_ha, 0);
    v_area_total := v_area_total + coalesce(p.area, p.area_produtiva_ha, 0);
    v_ordem := least(coalesce(v_ordem, p.ordem_exibicao), p.ordem_exibicao);
    v_antigos := v_antigos || to_jsonb(p);
  end loop;
  if v_achados <> v_n then
    raise exception using errcode = 'P0001', message = 'Algum dos pastos não foi encontrado. Nada foi gravado.';
  end if;
  for m in select distinct fp.ano_mes from public.fechamento_pastos fp where fp.pasto_id = any (p_pastos) and fp.ano_mes >= v_mes order by 1 loop
    if public._fn_fechamento_p2_travado(v_faz, m.ano_mes) then
      v_recusas := v_recusas || format('o Valor do Rebanho de %s está validado ou o P2 fechado', to_char(to_date(m.ano_mes || '-01', 'YYYY-MM-DD'), 'MM/YYYY'));
    end if;
  end loop;

  -- os nomes: o do pasto e os dos piquetes, sem repetir entre si nem com outro pasto que vale desde o início (os de hoje terminam: podem repetir)
  v_nomes := array(select btrim(coalesce(x, '')) from unnest(p_nomes) x);
  if exists (select 1 from unnest(v_nomes) x where x = '') then v_recusas := v_recusas || 'falta o nome de um piquete'::text; end if;
  if (select count(distinct lower(x)) from unnest(v_nomes || v_pai_nome) x) <> v_n + 1 then
    v_recusas := v_recusas || 'o nome do pasto e os dos piquetes se repetem'::text;
  end if;
  select string_agg(distinct q.nome, ', ') into v_frase from public.pastos q
   where q.fazenda_id = v_faz and q.ativo and (q.data_fim is null or q.data_fim >= p_inicio) and not q.id = any (p_pastos)
     and lower(btrim(q.nome)) in (select lower(x) from unnest(v_nomes || v_pai_nome) x);
  if v_frase is not null then v_recusas := v_recusas || format('já existe pasto com o nome %s nesta fazenda', v_frase); end if;
  if exists (select 1 from public.pasto_grupos g where g.fazenda_id = v_faz and lower(btrim(g.nome)) = lower(v_pai_nome)) then
    v_recusas := v_recusas || format('já existe um grupo chamado %s', v_pai_nome);
  end if;

  -- os desenhos: todos com polígono (o contorno é a união, conferida pela área) ou nenhum
  select count(*), sum(public._fn_area_geodesica_ha(g.geojson)) into v_geos, v_soma_geo from public.fazenda_geometrias g where g.pasto_id = any (p_pastos);
  if v_geos > 0 and v_geos < v_n then
    v_recusas := v_recusas || 'só parte dos pastos tem desenho no mapa (desenhe todos ou nenhum)'::text;
  elsif v_geos = v_n then
    v_area_contorno := case when p_contorno is null then null else public._fn_area_geodesica_ha(p_contorno) end;
    if v_area_contorno is null then
      v_recusas := v_recusas || 'falta o contorno do pasto (a união dos desenhos)'::text;
    elsif abs(v_area_contorno - v_soma_geo) > greatest(v_soma_geo * 0.01, 0.1) then
      v_recusas := v_recusas || format('o contorno (%s ha) não bate com a soma dos desenhos (%s ha)', round(v_area_contorno, 2), round(v_soma_geo, 2));
    end if;
  elsif p_contorno is not null then
    v_recusas := v_recusas || 'os pastos não têm desenho no mapa: o contorno não entra'::text;
  end if;

  if cardinality(v_recusas) > 0 then
    raise exception using errcode = 'P0001', message = format('Os pastos não viram piquetes: %s. Nada foi gravado.', array_to_string(v_recusas, '; '));
  end if;

  select coalesce(jsonb_agg(to_jsonb(fp) order by fp.ano_mes, array_position(p_pastos, fp.pasto_id)), '[]'::jsonb) into v_cards_antes
    from public.fechamento_pastos fp where fp.pasto_id = any (p_pastos) and fp.ano_mes >= v_mes;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb) into v_itens_antes
    from public.fechamento_pasto_itens i where i.fechamento_id in (select (c->>'id')::uuid from jsonb_array_elements(v_cards_antes) c);
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'pasto_id', g.pasto_id) order by g.id), '[]'::jsonb) into v_geos_antes
    from public.fazenda_geometrias g where g.pasto_id = any (p_pastos);

  begin
    perform set_config('app.via', 'FECH-PASTO-UNIDADE-01 F2b', true);
    -- 1) o pasto pai, desde o início, com a área somada (o cadastro do mês herda do 1º pasto)
    perform set_config('app.pasto_estrutura_escritor', '1', true);
    insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso, qualidade,
                               lote_padrao, referencia_rebanho, situacao, estrutura, observacoes, ordem_exibicao)
    values (v_faz, v_cli, v_pai_nome, v_area_total, v_area, true, v_primeiro.entra_conciliacao, p_inicio, v_primeiro.tipo_uso, v_primeiro.qualidade,
            v_primeiro.lote_padrao, v_primeiro.referencia_rebanho, v_primeiro.situacao, v_primeiro.estrutura,
            format('nasceu em %s: %s viram piquetes dele', to_char(p_inicio, 'MM/YYYY'), (select string_agg(x->>'nome', ', ') from jsonb_array_elements(v_antigos) x)),
            v_ordem)
    returning id into v_pai;
    -- 2) um piquete novo por pasto, com a área, o cadastro e a ficha dele (a ficha pela chave do escritor da ficha)
    perform set_config('app.pasto_ficha_escritor', '1', true);
    for p in select * from public.pastos x where x.id = any (p_pastos) order by array_position(p_pastos, x.id) loop
      v_i := v_i + 1;
      insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso, qualidade,
                                 lote_padrao, referencia_rebanho, situacao, estrutura, observacoes, ordem_exibicao, posse, forrageira_principal_id,
                                 forrageira_secundaria_id, forrageira_implantada_em, relevo_id, textura_id, drenagem_id, sombra_id, sombra_cobertura,
                                 manejo, sistema_id)
      values (v_faz, v_cli, v_nomes[v_i], p.area, p.area_produtiva_ha, true, p.entra_conciliacao, p_inicio, p.tipo_uso, p.qualidade, p.lote_padrao,
              p.referencia_rebanho, p.situacao, p.estrutura, format('piquete de %s (era o pasto %s até %s)', v_pai_nome, p.nome, to_char(v_fim, 'MM/YYYY')),
              p.ordem_exibicao, p.posse, p.forrageira_principal_id, p.forrageira_secundaria_id, p.forrageira_implantada_em, p.relevo_id, p.textura_id,
              p.drenagem_id, p.sombra_id, p.sombra_cobertura, p.manejo, p.sistema_id)
      returning id into v_piq;
      v_mapa := v_mapa || jsonb_build_object(p.id::text, v_piq);
      v_piquetes := v_piquetes || jsonb_build_object('antigo', p.id, 'antigo_nome', p.nome, 'piquete', v_piq, 'nome', v_nomes[v_i], 'area_ha', p.area_produtiva_ha);
    end loop;
    perform set_config('app.pasto_ficha_escritor', '', true);
    perform set_config('app.pasto_estrutura_escritor', '', true);
    -- 3) o grupo nascido do pai: é ele que faz dos novos os piquetes do pai
    insert into public.pasto_grupos (cliente_id, fazenda_id, nome, ativo, pasto_origem_id) values (v_cli, v_faz, v_pai_nome, true, v_pai) returning id into v_grupo;
    perform set_config('app.pasto_grupo_escritor', '1', true);
    update public.pastos set grupo_id = v_grupo where id in (select (x->>'piquete')::uuid from jsonb_array_elements(v_piquetes) x);
    perform set_config('app.pasto_grupo_escritor', '', true);
    -- 4) os cards desde o início: por mês, o de mais cabeças passa ao pai; as linhas de todos vão para ele marcadas com o piquete; os vazios saem
    for m in select distinct fp.ano_mes from public.fechamento_pastos fp where fp.pasto_id = any (p_pastos) and fp.ano_mes >= v_mes order by 1 loop
      select fp.id into v_fica from public.fechamento_pastos fp
       where fp.pasto_id = any (p_pastos) and fp.ano_mes = m.ano_mes
       order by (select coalesce(sum(i.quantidade), 0) from public.fechamento_pasto_itens i where i.fechamento_id = fp.id) desc,
                array_position(p_pastos, fp.pasto_id)
       limit 1;
      update public.fechamento_pastos set pasto_id = v_pai where id = v_fica;
      update public.fechamento_pasto_itens i set fechamento_id = v_fica, piquete_id = (v_mapa->>fp.pasto_id::text)::uuid
        from public.fechamento_pastos fp
       where fp.id = i.fechamento_id and fp.ano_mes = m.ano_mes and (fp.id = v_fica or fp.pasto_id = any (p_pastos));
      -- o card que fica era de um pasto antigo: as linhas dele também levam o piquete daquele pasto
      update public.fechamento_pasto_itens i set piquete_id = (v_mapa->>(c->>'pasto_id'))::uuid
        from jsonb_array_elements(v_cards_antes) c
       where (c->>'id')::uuid = v_fica and i.fechamento_id = v_fica and i.id in (select (x->>'id')::uuid from jsonb_array_elements(v_itens_antes) x where (x->>'fechamento_id')::uuid = v_fica);
      select coalesce(sum(quantidade), 0) into v_cab from public.fechamento_pasto_itens where fechamento_id = v_fica;
      v_mantidos := v_mantidos || jsonb_build_object('card', v_fica, 'ano_mes', m.ano_mes, 'cabecas', v_cab);
      with saiu as (
        delete from public.fechamento_pastos fp where fp.pasto_id = any (p_pastos) and fp.ano_mes = m.ano_mes
           and not exists (select 1 from public.fechamento_pasto_itens i where i.fechamento_id = fp.id)
        returning fp.id, fp.ano_mes, fp.pasto_id)
      select v_saem || coalesce(jsonb_agg(jsonb_build_object('card', id, 'ano_mes', ano_mes, 'pasto', pasto_id)), '[]'::jsonb) into v_saem from saiu;
    end loop;
    -- 5) os pastos de hoje terminam no dia anterior ao início (o histórico fica como está)
    update public.pastos x set data_fim = v_fim,
           observacoes = concat_ws(' · ', nullif(btrim(coalesce(x.observacoes, '')), ''),
                                   format('até %s; desde %s é o piquete %s do %s', to_char(v_fim, 'MM/YYYY'), to_char(p_inicio, 'MM/YYYY'),
                                          (select y->>'nome' from jsonb_array_elements(v_piquetes) y where (y->>'antigo')::uuid = x.id), v_pai_nome))
     where x.id = any (p_pastos);
    -- 6) os desenhos passam aos piquetes; o contorno do pai é a união
    update public.fazenda_geometrias g set pasto_id = (v_mapa->>g.pasto_id::text)::uuid where g.pasto_id = any (p_pastos);
    if v_area_contorno is not null then
      insert into public.fazenda_geometrias (pasto_id, geojson, fazenda_id, cliente_id, tipo, nome_original)
      values (v_pai, p_contorno, v_faz, v_cli, 'pasto', v_pai_nome) returning id into v_contorno_id;
    end if;
    -- 7) a trilha (o antes inteiro; o "depois" com a assinatura das linhas dos cards do pai, que o desfazer confere)
    select md5(coalesce(string_agg(concat_ws('|', i.id, i.fechamento_id, i.categoria_id, i.quantidade, i.peso_medio_kg, i.lote_id, i.piquete_id), ';' order by i.id), ''))
      into v_itens_md5 from public.fechamento_pasto_itens i where i.fechamento_id in (select (x->>'card')::uuid from jsonb_array_elements(v_mantidos) x);
    insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    values (v_cli, v_faz, auth.uid(), 'cadastros', 'pastos_viram_piquetes', 'pasto_unidade', v_rodada,
            format('%s viram os piquetes %s do %s (%s ha) desde %s', (select string_agg(x->>'nome', ', ') from jsonb_array_elements(v_antigos) x),
                   array_to_string(v_nomes, ', '), v_pai_nome, round(v_area, 2), to_char(p_inicio, 'MM/YYYY')),
            jsonb_build_object('pastos', v_antigos, 'cards', v_cards_antes, 'itens', v_itens_antes, 'geometrias', v_geos_antes),
            jsonb_build_object('inicio', p_inicio, 'pai', v_pai, 'pai_nome', v_pai_nome, 'grupo', v_grupo, 'piquetes', v_piquetes, 'contorno_id', v_contorno_id,
                               'mantidos', v_mantidos, 'saem', v_saem, 'itens_md5', v_itens_md5))
    returning id into v_log;

    v_res := jsonb_build_object('ok', true, 'simulado', p_simular, 'rodada', v_rodada, 'trilha_id', v_log,
      'pai', jsonb_build_object('id', v_pai, 'nome', v_pai_nome, 'area_ha', v_area, 'inicio', p_inicio),
      'piquetes', v_piquetes, 'mantidos', v_mantidos,
      'saem', v_saem,
      'contorno_ha', round(v_area_contorno, 2), 'desenhos_ha', round(v_soma_geo, 2),
      'frase', format('%s nasce com %s ha em %s; %s viram os piquetes %s e terminam em %s; %s card(s) passam ao %s e %s card(s) vazio(s) saem (o antes fica na trilha). Os meses antes de %s ficam como estão.',
                      v_pai_nome, replace(round(v_area, 1)::text, '.', ','), to_char(p_inicio, 'MM/YYYY'),
                      (select string_agg(x->>'nome', ', ') from jsonb_array_elements(v_antigos) x), array_to_string(v_nomes, ', '), to_char(v_fim, 'DD/MM/YYYY'),
                      jsonb_array_length(v_mantidos), v_pai_nome,
                      jsonb_array_length(v_saem),
                      to_char(p_inicio, 'MM/YYYY')));
    if p_simular then
      raise exception using errcode = 'ZP001', message = v_res::text;
    end if;
  exception when sqlstate 'ZP001' then
    return sqlerrm::jsonb;
  end;
  return v_res;
end $$;
revoke all on function public.fn_pastos_viram_piquetes(uuid[], text, date, text[], jsonb, boolean) from public, anon;
grant execute on function public.fn_pastos_viram_piquetes(uuid[], text, date, text[], jsonb, boolean) to authenticated;

create or replace function public.fn_pastos_viram_piquetes_desfazer(p_rodada uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public' as $$
declare
  a public.audit_log; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_pai public.pastos; v_grupo public.pasto_grupos; v_inicio date; v_recusas text[] := '{}'; v_frase text; v_usos text[];
  v_md5 text; e jsonb; v_versao int; v_r jsonb; v_res jsonb; v_log uuid; v_sufixo text;
  v_mantidos uuid[]; v_piquetes uuid[]; v_antigos uuid[];
begin
  perform public._fn_mapa_so_admin();
  select * into a from public.audit_log x where x.acao = 'pastos_viram_piquetes' and x.tabela_origem = 'pasto_unidade' and x.registro_id = p_rodada
   order by x.created_at desc limit 1;
  if a.id is null or not coalesce(public.tenant_ok(a.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if exists (select 1 from public.audit_log x where x.acao = 'pastos_viram_piquetes_desfeito' and x.registro_id = p_rodada) then
    raise exception using errcode = 'P0001', message = 'Esta mudança já foi desfeita. Nada foi gravado.';
  end if;
  if v_motivo is null then
    raise exception using errcode = 'P0001', message = 'Informe o motivo. Nada foi gravado.';
  end if;
  v_inicio := (a.dados_novos->>'inicio')::date;
  select * into v_pai from public.pastos where id = (a.dados_novos->>'pai')::uuid for update;
  select * into v_grupo from public.pasto_grupos where id = (a.dados_novos->>'grupo')::uuid for update;
  v_mantidos := array(select (x->>'card')::uuid from jsonb_array_elements(a.dados_novos->'mantidos') x);
  v_piquetes := array(select (x->>'piquete')::uuid from jsonb_array_elements(a.dados_novos->'piquetes') x);
  v_antigos := array(select (x->>'id')::uuid from jsonb_array_elements(a.dados_anteriores->'pastos') x);

  -- nada mudou desde a rodada
  if v_pai.id is null or not v_pai.ativo then v_recusas := v_recusas || 'o pasto novo não está mais ativo'::text; end if;
  if v_grupo.id is null or not v_grupo.ativo or v_grupo.pasto_origem_id is distinct from v_pai.id then
    v_recusas := v_recusas || 'o grupo dos piquetes mudou'::text;
  end if;
  select string_agg(to_char(to_date(fp.ano_mes || '-01', 'YYYY-MM-DD'), 'MM/YYYY'), ', ' order by fp.ano_mes) into v_frase
    from public.fechamento_pastos fp where fp.pasto_id = v_pai.id and not fp.id = any (v_mantidos);
  if v_frase is not null then v_recusas := v_recusas || format('o %s tem card lançado depois (%s)', v_pai.nome, v_frase); end if;
  select md5(coalesce(string_agg(concat_ws('|', i.id, i.fechamento_id, i.categoria_id, i.quantidade, i.peso_medio_kg, i.lote_id, i.piquete_id), ';' order by i.id), ''))
    into v_md5 from public.fechamento_pasto_itens i where i.fechamento_id = any (v_mantidos);
  if v_md5 is distinct from a.dados_novos->>'itens_md5' then
    v_recusas := v_recusas || format('os animais lançados no %s mudaram depois', v_pai.nome);
  end if;
  select string_agg(to_char(to_date(fp.ano_mes || '-01', 'YYYY-MM-DD'), 'MM/YYYY'), ', ' order by fp.ano_mes) into v_frase
    from public.fechamento_pastos fp where fp.id = any (v_mantidos) and (fp.status = 'fechado' or public._fn_fechamento_p2_travado(fp.fazenda_id, fp.ano_mes));
  if v_frase is not null then v_recusas := v_recusas || format('o mês está fechado ou com o Valor do Rebanho validado (%s)', v_frase); end if;
  for e in select to_jsonb(q) from public.pastos q where q.id = any (v_piquetes) or q.id = v_pai.id loop
    v_usos := array(select u from unnest(public._fn_piquete_usos((e->>'id')::uuid, '0001-01-01'::date)) u where u not like 'fechamento de %');
    if cardinality(v_usos) > 0 then v_recusas := v_recusas || format('%s tem %s', e->>'nome', array_to_string(v_usos, ', ')); end if;
  end loop;
  select string_agg(q.nome, ', ') into v_frase from public.pastos q
   where q.id = any (v_antigos) and q.data_fim is distinct from v_inicio - 1;
  if v_frase is not null then v_recusas := v_recusas || format('o fim de %s mudou depois', v_frase); end if;
  if cardinality(v_recusas) > 0 then
    raise exception using errcode = 'P0001', message = format('A mudança não se desfaz: %s. Nada foi gravado.', array_to_string(v_recusas, '; '));
  end if;

  begin
    perform set_config('app.via', 'FECH-PASTO-UNIDADE-01 F2b desfazer', true);
    -- 1) os pastos de hoje voltam a valer (o fim e a observação de antes)
    update public.pastos x set data_fim = (y->>'data_fim')::date, observacoes = y->>'observacoes'
      from jsonb_array_elements(a.dados_anteriores->'pastos') y where x.id = (y->>'id')::uuid;
    -- 2) os cards que saíram voltam, com os mesmos ids e campos
    insert into public.fechamento_pastos
    select (jsonb_populate_record(null::public.fechamento_pastos, c)).*
      from jsonb_array_elements(a.dados_anteriores->'cards') c
     where not exists (select 1 from public.fechamento_pastos fp where fp.id = (c->>'id')::uuid);
    -- 3) as linhas voltam ao card e ao "sem piquete" de antes
    update public.fechamento_pasto_itens i set fechamento_id = (y->>'fechamento_id')::uuid, piquete_id = nullif(y->>'piquete_id', '')::uuid
      from jsonb_array_elements(a.dados_anteriores->'itens') y where i.id = (y->>'id')::uuid;
    -- 4) os cards que ficaram no pai voltam ao pasto de antes
    update public.fechamento_pastos fp set pasto_id = (c->>'pasto_id')::uuid
      from jsonb_array_elements(a.dados_anteriores->'cards') c where fp.id = (c->>'id')::uuid and fp.pasto_id = v_pai.id;
    -- 5) os desenhos voltam aos pastos de hoje; o contorno do pai sai pelo escritor do mapa
    update public.fazenda_geometrias g set pasto_id = (y->>'pasto_id')::uuid
      from jsonb_array_elements(a.dados_anteriores->'geometrias') y where g.id = (y->>'id')::uuid;
    if a.dados_novos->>'contorno_id' is not null and exists (select 1 from public.fazenda_geometrias where id = (a.dados_novos->>'contorno_id')::uuid) then
      -- solto do pai antes (o escritor do mapa não apaga polígono ligado a pasto), como no "Desfazer piquetes"
      perform public.fn_mapa_geometria_classificar((a.dados_novos->>'contorno_id')::uuid, 'outra', NULL,
                format('desfazer: %s volta a ser pastos soltos (%s)', v_pai.nome, v_motivo), false);
      select versao into v_versao from public.fazenda_geometrias where id = (a.dados_novos->>'contorno_id')::uuid;
      if v_versao is not null then
        v_r := public.fn_geometria_gravar(v_pai.fazenda_id, jsonb_build_object('acao', 'apagar', 'motivo', format('desfazer: %s volta a ser pastos soltos (%s)', v_pai.nome, v_motivo),
                 'remover', jsonb_build_array(jsonb_build_object('id', a.dados_novos->>'contorno_id', 'versao', v_versao))), false);
      end if;
    end if;
    -- 6) o grupo sai pelo escritor dele (nome e elo liberados: são únicos; o antigo fica na trilha)
    perform public.fn_pasto_grupo_desativar(v_grupo.id, false);
    v_sufixo := format(' (desfeito em %s)', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'));
    perform set_config('app.pasto_grupo_escritor', '1', true);
    update public.pasto_grupos set nome = left(v_grupo.nome, 200) || v_sufixo, pasto_origem_id = null, updated_at = now() where id = v_grupo.id;
    perform set_config('app.pasto_grupo_escritor', '', true);
    -- 7) o pai e os piquetes ficam inativos (nunca apagados)
    update public.pastos set ativo = false,
           observacoes = concat_ws(' · ', nullif(btrim(coalesce(observacoes, '')), ''),
                                   format('desfeito em %s: %s', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), v_motivo))
     where id = v_pai.id or id = any (v_piquetes);
    insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    values (a.cliente_id, a.fazenda_id, auth.uid(), 'cadastros', 'pastos_viram_piquetes_desfeito', 'pasto_unidade', p_rodada,
            format('desfeito: %s voltam a ser pastos; %s e os piquetes ficam inativos', (select string_agg(y->>'nome', ', ') from jsonb_array_elements(a.dados_anteriores->'pastos') y), v_pai.nome),
            jsonb_build_object('trilha', a.id), jsonb_build_object('motivo', v_motivo))
    returning id into v_log;
    v_res := jsonb_build_object('ok', true, 'simulado', p_simular, 'trilha_id', v_log,
      'frase', format('%s voltam a ser pastos a partir de %s, com os cards e os desenhos de antes; %s e os piquetes ficam inativos (o cadastro não se apaga).',
                      (select string_agg(y->>'nome', ', ') from jsonb_array_elements(a.dados_anteriores->'pastos') y), to_char(v_inicio, 'MM/YYYY'), v_pai.nome));
    if p_simular then
      raise exception using errcode = 'ZP001', message = v_res::text;
    end if;
  exception when sqlstate 'ZP001' then
    return sqlerrm::jsonb;
  end;
  return v_res;
end $$;
revoke all on function public.fn_pastos_viram_piquetes_desfazer(uuid, text, boolean) from public, anon;
grant execute on function public.fn_pastos_viram_piquetes_desfazer(uuid, text, boolean) to authenticated;
