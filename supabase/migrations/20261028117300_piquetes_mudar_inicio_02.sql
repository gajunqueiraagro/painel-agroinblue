-- PIQUETE-VIGENCIA-01 (Gabriel 05/11, noite: D1 a partir de hoje · D2 recusar quando há uso · D3 só recusar, com o link) — o gesto
-- "Mudar mês de início" da tela, em cima da `fn_piquetes_mudar_inicio` (117210), com as 3 faltas da FASE 0 (valores-20261105-1815):
--   (a) ADIAR: o mês novo pode ser DEPOIS do início de hoje. O pai volta a valer até a véspera do mês novo; os piquetes começam no mês novo
--       (a área oficial deles também). Recusa se algum piquete tem card, alocação ou movimentação nos meses que saem (D2: nada volta sozinho
--       ao pai) ou se a área oficial de um piquete muda dentro desses meses.
--   (b) MÊS FECHADO sem card do pai: todo mês que muda é conferido na autoridade do P1 (`_fn_status_pilares_fechamento`, a interna da
--       `get_status_pilares_fechamento`); 'oficial' = recusa "o fechamento de MM/AAAA está fechado". O 1º mês fechado vai no HINT
--       ('fechamento:AAAA-MM') para a tela pôr o link do Reabrir ao lado da frase (D3: nunca reabre sozinho).
--   (c) DESFAZER o próprio gesto: `fn_piquetes_mudar_inicio_desfazer(grupo, motivo, simular)` desfaz a ÚLTIMA mudança ainda não desfeita,
--       pela trilha que a 117210 já grava (`audit_log` 'piquetes_mudar_inicio', valores anteriores): os piquetes voltam ao início de antes,
--       o pai ao fim e às observações de antes, a área oficial ao mês de antes (a do gesto fica desfeita, com motivo; a de antes volta como
--       vigência nova com os MESMOS valores: nada se apaga) e, se o gesto antecipou, os cards que ele passou ao 1º piquete voltam ao pai (com a
--       alocação do `p_alocar` limpa pela `fn_fechamento_alocacoes_salvar`). Recusa se qualquer coisa mudou depois do gesto. Trilha própria
--       ('piquetes_mudar_inicio_desfeito', com o id da trilha desfeita). O caminho de volta do desfazer é o próprio "Mudar mês de início".
-- A 117210 segue o registro do que ela fez; o corpo abaixo é o dela com as mudanças (a)(b) e a saída da prévia mais completa para a tela
-- ('direcao', 'meses', 'pastos', 'area_pai_ha'). O teste 01 (T3 "tem de ser antes") é substituído pelo 02.
set lock_timeout = '2s';

create or replace function public.fn_piquetes_mudar_inicio(p_grupo uuid, p_mes date, p_motivo text, p_simular boolean default true,
  p_alocar boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  gr public.pasto_grupos; pai public.pastos; p public.pastos; c public.fechamento_pastos; vg public.pasto_area_vigencias;
  v_conc public.audit_log;
  v_mes date := date_trunc('month', p_mes)::date;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_pastos uuid[]; v_antes date; v_n_inicios int; v_destino uuid; v_destino_nome text;
  v_adiar boolean; v_ini date; v_fim date; v_m date; v_fechado text; v_meses jsonb := '[]'::jsonb; v_nomes jsonb;
  v_de text; v_ate text;  -- os meses que mudam: [v_de, v_ate)
  v_frase text; v_recusas text[] := '{}';
  v_cards jsonb := '[]'::jsonb; v_vigs jsonb := '[]'::jsonb;
  v_cab_antes int := 0; v_cab_depois int; v_lote uuid := gen_random_uuid(); v_novo uuid; v_log uuid; v_r jsonb;
  v_kg numeric := 0; v_ua numeric := 0; v_area_grupo numeric; v_area_destino numeric; v_lotacao jsonb;
begin
  perform public._fn_mapa_so_admin();
  select * into gr from public.pasto_grupos where id = p_grupo;
  if gr.id is null or not coalesce(public.tenant_ok(gr.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if not gr.ativo then
    raise exception using errcode = 'P0001', message = format('O grupo %s está desativado. Nada foi gravado.', gr.nome);
  end if;
  select * into pai from public.pastos where id = gr.pasto_origem_id;
  if pai.id is null then
    raise exception using errcode = 'P0001', message = format('O grupo %s não nasceu de um pasto. Nada foi gravado.', gr.nome);
  end if;
  if v_motivo is null then
    raise exception using errcode = 'P0001', message = 'Informe o motivo. Nada foi gravado.';
  end if;
  select * into v_conc from public.audit_log a
   where a.acao = 'piquetes' and a.tabela_origem = 'pastos' and a.registro_id = pai.id and a.dados_novos->>'grupo_id' = gr.id::text
   order by a.created_at desc limit 1;
  if v_conc.id is null then
    raise exception using errcode = 'P0001',
      message = format('O grupo %s não nasceu do "Concluir piquetes": o início dele muda no cadastro. Nada foi gravado.', gr.nome);
  end if;

  -- os piquetes do Concluir que seguem no grupo e ativos; todos começam no mesmo mês
  v_pastos := array(select x.id from public.pastos x
                     where x.id in (select (e->>'pasto_id')::uuid from jsonb_array_elements(v_conc.dados_novos->'piquetes') e)
                       and x.grupo_id = gr.id and coalesce(x.ativo, false) order by x.nome);
  if cardinality(v_pastos) < 2 then
    raise exception using errcode = 'P0001', message = format('O grupo %s não tem os piquetes do Concluir. Nada foi gravado.', gr.nome);
  end if;
  select min(x.data_inicio), count(distinct x.data_inicio) into v_antes, v_n_inicios from public.pastos x where x.id = any (v_pastos);
  if v_n_inicios <> 1 or v_antes is null then
    raise exception using errcode = 'P0001', message = format('Os piquetes de %s não começam todos no mesmo mês. Nada foi gravado.', gr.nome);
  end if;
  if v_mes is null or v_mes = v_antes then
    raise exception using errcode = 'P0001',
      message = format('Os piquetes de %s já começam em %s: escolha outro mês. Nada foi gravado.', gr.nome, to_char(v_antes, 'MM/YYYY'));
  end if;
  v_adiar := v_mes > v_antes;
  v_ini := least(v_mes, v_antes);
  v_fim := greatest(v_mes, v_antes);
  if pai.data_inicio is not null and pai.data_inicio >= v_mes then
    raise exception using errcode = 'P0001',
      message = format('O pasto %s começou em %s: os piquetes começam num mês depois. Nada foi gravado.', pai.nome, to_char(pai.data_inicio, 'MM/YYYY'));
  end if;
  if pai.data_fim is distinct from (v_antes - 1) then
    v_recusas := v_recusas || format('o fim de %s mudou depois dos piquetes (era %s, está %s)', pai.nome,
      to_char(v_antes - 1, 'DD/MM/YYYY'), coalesce(to_char(pai.data_fim, 'DD/MM/YYYY'), 'sem fim'));
  end if;
  if v_adiar and not coalesce(pai.ativo, false) then
    v_recusas := v_recusas || format('%s está inativo e não volta a valer', pai.nome);
  end if;
  v_de := to_char(v_ini, 'YYYY-MM');
  v_ate := to_char(v_fim, 'YYYY-MM');
  v_destino := v_pastos[1];
  select x.nome into v_destino_nome from public.pastos x where x.id = v_destino;
  select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome) order by x.nome) into v_nomes from public.pastos x where x.id = any (v_pastos);

  v_frase := public._fn_pasto_area_trava(pai.id, pai.fazenda_id, v_ini);
  if v_frase is not null then v_recusas := v_recusas || v_frase; end if;
  -- (b) todo mês que muda, na autoridade do P1: mês oficial não muda (D3: a tela põe o link do Reabrir; aqui nunca se reabre)
  for v_m in select g::date from generate_series(v_ini, v_fim - interval '1 month', interval '1 month') g loop
    v_meses := v_meses || to_jsonb(to_char(v_m, 'YYYY-MM'));
    if (public._fn_status_pilares_fechamento(pai.fazenda_id, to_char(v_m, 'YYYY-MM'))->'p1_mapa_pastos'->>'status') = 'oficial' then
      v_recusas := v_recusas || format('o fechamento de %s está fechado (reabra o mês no Fechamento antes)', to_char(v_m, 'MM/YYYY'));
      v_fechado := coalesce(v_fechado, to_char(v_m, 'YYYY-MM'));
    end if;
  end loop;
  if v_adiar then
    -- (a) os meses que saem dos piquetes voltam ao pai: o pai não pode ter card neles (seria de antes do Concluir, fora da vigência)
    if exists (select 1 from public.fechamento_pastos f where f.pasto_id = pai.id and f.ano_mes >= v_de and f.ano_mes < v_ate) then
      v_recusas := v_recusas || format('%s já tem card entre %s e %s', pai.nome, to_char(v_ini, 'MM/YYYY'), to_char(v_fim - 1, 'MM/YYYY'));
    end if;
    -- a área oficial de um piquete que muda depois do início de hoje e até o mês novo ficaria antes de ele começar
    for p in select x.* from public.pastos x where x.id = any (v_pastos)
               and exists (select 1 from public.pasto_area_vigencias v where v.pasto_id = x.id and v.desfeita_em is null
                            and v.vigente_desde > v_antes and v.vigente_desde <= v_mes) order by x.nome loop
      v_recusas := v_recusas || format('a área oficial de %s muda depois de %s (desfaça essa mudança antes)', p.nome, to_char(v_antes, 'MM/YYYY'));
    end loop;
  else
    -- os cards do pai nos meses que mudam: abertos, sem P1 congelado, sem P2
    for c in select * from public.fechamento_pastos x where x.pasto_id = pai.id and x.ano_mes >= v_de and x.ano_mes < v_ate order by x.ano_mes loop
      if c.status = 'fechado' then
        v_recusas := v_recusas || format('o card de %s em %s está fechado', pai.nome, c.ano_mes);
      end if;
      if public._fn_fechamento_p2_travado(c.fazenda_id, c.ano_mes) then
        v_recusas := v_recusas || format('%s tem Valor do Rebanho validado ou P2 fechado', c.ano_mes);
      end if;
      if exists (select 1 from public.fechamento_pastos_membros m where m.fechamento_pasto_id = c.id) then
        v_recusas := v_recusas || format('o card de %s em %s está no fechamento P1 congelado', pai.nome, c.ano_mes);
      end if;
      if exists (select 1 from public.fechamento_alocacoes a where a.fechamento_id = c.id) then
        v_recusas := v_recusas || format('o card de %s em %s já tem alocação de lote', pai.nome, c.ano_mes);
      end if;
      v_cab_antes := v_cab_antes + coalesce((select sum(i.quantidade) from public.fechamento_pasto_itens i where i.fechamento_id = c.id), 0);
      -- a régua da `fn_lotacao_do_mes`: kg = cab x peso médio; UA = kg/450 (sem peso, 1 UA por cabeça)
      select v_kg + coalesce(sum(i.quantidade * coalesce(i.peso_medio_kg, 0)), 0),
             v_ua + coalesce(sum(case when i.peso_medio_kg > 0 then i.quantidade * i.peso_medio_kg / 450 else i.quantidade end), 0)
        into v_kg, v_ua from public.fechamento_pasto_itens i where i.fechamento_id = c.id;
      v_cards := v_cards || jsonb_build_object('id', c.id, 'ano_mes', c.ano_mes, 'status', c.status, 'lote_mes', c.lote_mes,
        'cabecas', coalesce((select sum(i.quantidade) from public.fechamento_pasto_itens i where i.fechamento_id = c.id), 0),
        'pasto_antes', pai.id, 'pasto_depois', v_destino);
    end loop;
  end if;
  -- os piquetes não têm nada nos meses que mudam (antecipar: o card do pai vai para um deles; adiar, D2: nada volta sozinho ao pai)
  for p in select * from public.pastos x where x.id = any (v_pastos) order by x.nome loop
    if exists (select 1 from public.fechamento_pastos f where f.pasto_id = p.id and f.ano_mes >= v_de and f.ano_mes < v_ate) then
      v_recusas := v_recusas || format('%s já tem card antes de %s', p.nome, to_char(v_fim, 'MM/YYYY'));
    end if;
    if exists (select 1 from public.fechamento_alocacoes a where a.pasto_id = p.id and a.ano_mes >= v_de and a.ano_mes < v_ate) then
      v_recusas := v_recusas || format('%s recebe lote antes de %s', p.nome, to_char(v_fim, 'MM/YYYY'));
    end if;
    if exists (select 1 from public.pasto_movimentacoes m where p.id in (m.pasto_id, m.pasto_origem_id, m.pasto_destino_id)
                and m.data >= v_ini and m.data < v_fim) then
      v_recusas := v_recusas || format('%s tem movimentação de gado antes de %s', p.nome, to_char(v_fim, 'MM/YYYY'));
    end if;
  end loop;
  if cardinality(v_recusas) > 0 then
    v_frase := format('Os piquetes de %s não mudam para %s: %s. Nada foi gravado.', gr.nome, to_char(v_mes, 'MM/YYYY'), array_to_string(v_recusas, '; '));
    if v_fechado is not null then
      raise exception using errcode = 'P0001', message = v_frase, hint = 'fechamento:' || v_fechado;
    end if;
    raise exception using errcode = 'P0001', message = v_frase;
  end if;

  -- a área oficial que os piquetes levam para o mês novo (a de hoje desde o início antigo)
  select sum(v.area_ha), sum(v.area_ha) filter (where v.pasto_id = v_destino) into v_area_grupo, v_area_destino
    from public.pasto_area_vigencias v where v.pasto_id = any (v_pastos) and v.vigente_desde = v_antes and v.desfeita_em is null;
  v_lotacao := jsonb_build_object('cabecas', v_cab_antes, 'kg', v_kg, 'ua', round(v_ua, 1),
    'area_grupo_ha', v_area_grupo, 'ua_ha_grupo', case when v_area_grupo > 0 then round(v_ua / v_area_grupo, 2) end,
    'piquete', v_destino_nome, 'area_piquete_ha', v_area_destino,
    'ua_ha_piquete', case when p_alocar then case when v_area_grupo > 0 then round(v_ua / v_area_grupo, 2) end
                          when v_area_destino > 0 then round(v_ua / v_area_destino, 2) end);

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'direcao', case when v_adiar then 'adiar' else 'antecipar' end,
      'meses', v_meses, 'pastos', v_nomes, 'area_pai_ha', public.fn_pasto_area_no_mes(pai.id, v_de),
      'lotacao', v_lotacao, 'alocar', p_alocar, 'grupo', jsonb_build_object('id', gr.id, 'nome', gr.nome),
      'de', v_antes, 'para', v_mes, 'pai', jsonb_build_object('id', pai.id, 'nome', pai.nome, 'fim_antes', pai.data_fim, 'fim_depois', v_mes - 1),
      'piquetes', cardinality(v_pastos), 'cards', v_cards, 'cabecas_antes', v_cab_antes, 'card_vai_para', v_destino_nome,
      'frase', case when v_adiar then
        format('%s: os %s piquetes passam a começar em %s; %s volta a valer até %s (%s ha); nenhum card muda.',
          gr.nome, cardinality(v_pastos), to_char(v_mes, 'MM/YYYY'), pai.nome, to_char(v_mes - 1, 'DD/MM/YYYY'),
          public.fn_pasto_area_no_mes(pai.id, v_de))
      else
        format('%s: os %s piquetes passam a começar em %s; %s fica encerrado em %s; %s card(s) de %s (%s cab, %s kg, %s UA) passam %s; lotação do grupo %s UA/ha (%s ha), de %s %s UA/ha (%s ha).',
          gr.nome, cardinality(v_pastos), to_char(v_mes, 'MM/YYYY'), pai.nome, to_char(v_mes - 1, 'DD/MM/YYYY'),
          jsonb_array_length(v_cards), pai.nome, v_cab_antes, round(v_kg), round(v_ua, 1),
          case when p_alocar then format('a %s com o lote alocado aos %s piquetes', v_destino_nome, cardinality(v_pastos))
               else format('inteiros a %s', v_destino_nome) end,
          v_lotacao->>'ua_ha_grupo', v_area_grupo, v_destino_nome, v_lotacao->>'ua_ha_piquete', v_area_destino)
      end);
  end if;

  -- 1) os piquetes desde o mês novo, e a área oficial deles desde o mês novo
  update public.pastos x set data_inicio = v_mes where x.id = any (v_pastos);
  for p in select * from public.pastos x where x.id = any (v_pastos) order by x.nome loop
    select * into vg from public.pasto_area_vigencias v where v.pasto_id = p.id and v.vigente_desde = v_antes and v.desfeita_em is null;
    if vg.id is null then
      raise exception using errcode = 'P0001', message = format('A área oficial de %s desde %s não foi achada. Nada foi gravado.', p.nome, to_char(v_antes, 'YYYY-MM'));
    end if;
    update public.pasto_area_vigencias v set desfeita_em = now(), desfeita_por = auth.uid(),
           desfeita_motivo = format('o início dos piquetes passou a %s: %s', to_char(v_mes, 'MM/YYYY'), v_motivo)
     where v.id = vg.id;
    v_novo := public._fn_pasto_area_gravar(p.id, vg.area_ha, v_mes, vg.origem,
      format('%s (início passou de %s a %s)', vg.motivo, to_char(v_antes, 'MM/YYYY'), to_char(v_mes, 'MM/YYYY')), vg.geometria_id, vg.area_mapa_ha, v_lote);
    v_vigs := v_vigs || jsonb_build_object('pasto_id', p.id, 'desfeita', vg.id, 'nova', v_novo, 'area_ha', vg.area_ha);
  end loop;

  -- 2) o pai encerrado no último dia antes do mês novo (adiar: ele volta a valer até lá)
  update public.pastos x
     set data_fim = v_mes - 1,
         observacoes = concat_ws(' · ', nullif(btrim(coalesce(x.observacoes, '')), ''),
                                 format('piquetes passaram a começar em %s', to_char(v_mes, 'MM/YYYY')))
   where x.id = pai.id;

  -- 3) o card do pai em cada mês que muda: as MESMAS linhas passam ao 1º piquete (o A); com `p_alocar`, o lote fica alocado aos do grupo
  for c in select * from public.fechamento_pastos x where x.id in (select (e->>'id')::uuid from jsonb_array_elements(v_cards) e) loop
    update public.fechamento_pastos x set pasto_id = v_destino where x.id = c.id;
    if p_alocar then v_r := public.fn_fechamento_alocacoes_salvar(c.id, '', v_pastos); end if;
  end loop;

  -- a conferência: as cabeças do grupo nos meses que mudam = as do card antigo; o pai sem card nesses meses
  select coalesce(sum(i.quantidade), 0) into v_cab_depois
    from public.fechamento_pastos f join public.fechamento_pasto_itens i on i.fechamento_id = f.id
   where f.pasto_id = any (v_pastos) and f.ano_mes >= v_de and f.ano_mes < v_ate;
  if v_cab_depois <> v_cab_antes
     or exists (select 1 from public.fechamento_pastos f where f.pasto_id = pai.id and f.ano_mes >= v_de and f.ano_mes < v_ate) then
    raise exception using errcode = 'P0001',
      message = format('A conferência das cabeças de %s não fechou (antes %s, depois %s). Nada foi gravado.', gr.nome, v_cab_antes, v_cab_depois);
  end if;

  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  values (gr.cliente_id, pai.fazenda_id, auth.uid(), 'cadastros', 'piquetes_mudar_inicio', 'pasto_grupos', gr.id,
          format('piquetes de %s passam a começar em %s (eram %s); %s encerrado em %s; %s cab do card de %s passam ao grupo',
                 gr.nome, to_char(v_mes, 'MM/YYYY'), to_char(v_antes, 'MM/YYYY'), pai.nome, to_char(v_mes - 1, 'DD/MM/YYYY'), v_cab_antes, pai.nome),
          jsonb_build_object('inicio', v_antes, 'pai', jsonb_build_object('id', pai.id, 'data_fim', pai.data_fim, 'observacoes', pai.observacoes),
                             'cards', v_cards, 'pastos', to_jsonb(v_pastos)),
          jsonb_build_object('inicio', v_mes, 'direcao', case when v_adiar then 'adiar' else 'antecipar' end, 'motivo', v_motivo, 'lote', v_lote,
                             'vigencias', v_vigs, 'card_vai_para', v_destino, 'alocar', p_alocar, 'cabecas', v_cab_depois, 'lotacao', v_lotacao))
  returning id into v_log;

  return jsonb_build_object('ok', true, 'simulado', false, 'direcao', case when v_adiar then 'adiar' else 'antecipar' end,
    'grupo', jsonb_build_object('id', gr.id, 'nome', gr.nome), 'de', v_antes, 'para', v_mes,
    'pai_encerrado_em', v_mes - 1, 'cards', v_cards, 'lotacao', v_lotacao, 'alocar', p_alocar, 'cabecas_antes', v_cab_antes, 'cabecas_depois', v_cab_depois, 'card_vai_para', v_destino_nome,
    'trilha_id', v_log);
end $$;
revoke all on function public.fn_piquetes_mudar_inicio(uuid, date, text, boolean, boolean) from public, anon;
grant execute on function public.fn_piquetes_mudar_inicio(uuid, date, text, boolean, boolean) to authenticated;

-- (c) o caminho de volta do gesto: desfaz a ÚLTIMA mudança de início ainda não desfeita do grupo
create function public.fn_piquetes_mudar_inicio_desfazer(p_grupo uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  gr public.pasto_grupos; pai public.pastos; t public.audit_log; c public.fechamento_pastos; p public.pastos;
  vn public.pasto_area_vigencias; vg public.pasto_area_vigencias;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_pastos uuid[]; v_cards uuid[]; v_volta date; v_para date; v_antecipou boolean; v_destino uuid; v_alocou boolean;
  v_ini date; v_fim date; v_m date; v_de text; v_ate text; v_meses jsonb := '[]'::jsonb; v_fechado text;
  v_recusas text[] := '{}'; v_frase text; v_e jsonb; v_n int := 0; v_cab int := 0; v_cab_depois int;
  v_lote uuid := gen_random_uuid(); v_novo uuid; v_vigs jsonb := '[]'::jsonb; v_log uuid; v_r jsonb; v_nomes text;
begin
  perform public._fn_mapa_so_admin();
  select * into gr from public.pasto_grupos where id = p_grupo;
  if gr.id is null or not coalesce(public.tenant_ok(gr.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if not gr.ativo then
    raise exception using errcode = 'P0001', message = format('O grupo %s está desativado. Nada foi gravado.', gr.nome);
  end if;
  select * into pai from public.pastos where id = gr.pasto_origem_id;
  if pai.id is null then
    raise exception using errcode = 'P0001', message = format('O grupo %s não nasceu de um pasto. Nada foi gravado.', gr.nome);
  end if;
  if v_motivo is null then
    raise exception using errcode = 'P0001', message = 'Informe o motivo. Nada foi gravado.';
  end if;
  select * into t from public.audit_log a
   where a.acao = 'piquetes_mudar_inicio' and a.tabela_origem = 'pasto_grupos' and a.registro_id = gr.id
     and not exists (select 1 from public.audit_log d where d.acao = 'piquetes_mudar_inicio_desfeito' and d.registro_id = gr.id
                      and d.dados_novos->>'trilha_id' = a.id::text)
   order by a.created_at desc limit 1;
  if t.id is null then
    raise exception using errcode = 'P0001',
      message = format('O grupo %s não tem mudança de mês de início para desfazer. Nada foi gravado.', gr.nome);
  end if;

  v_volta := (t.dados_anteriores->>'inicio')::date;
  v_para := (t.dados_novos->>'inicio')::date;
  v_antecipou := v_volta > v_para;
  v_destino := nullif(t.dados_novos->>'card_vai_para', '')::uuid;
  v_alocou := coalesce((t.dados_novos->>'alocar')::boolean, false);
  v_pastos := array(select x::uuid from jsonb_array_elements_text(t.dados_anteriores->'pastos') x);
  v_cards := array(select (e->>'id')::uuid from jsonb_array_elements(coalesce(t.dados_anteriores->'cards', '[]'::jsonb)) e);
  v_ini := least(v_volta, v_para);
  v_fim := greatest(v_volta, v_para);
  v_de := to_char(v_ini, 'YYYY-MM');
  v_ate := to_char(v_fim, 'YYYY-MM');
  select string_agg(x.nome, ', ' order by x.nome) into v_nomes from public.pastos x where x.id = any (v_pastos);

  -- nada pode ter mudado depois do gesto
  for p in select * from public.pastos x where x.id = any (v_pastos) order by x.nome loop
    if p.data_inicio is distinct from v_para or p.grupo_id is distinct from gr.id or not coalesce(p.ativo, false) then
      v_recusas := v_recusas || format('%s mudou depois do gesto (início %s, era %s)', p.nome,
        coalesce(to_char(p.data_inicio, 'MM/YYYY'), 'sem início'), to_char(v_para, 'MM/YYYY'));
    end if;
  end loop;
  if pai.data_fim is distinct from (v_para - 1) then
    v_recusas := v_recusas || format('o fim de %s mudou depois do gesto (era %s, está %s)', pai.nome,
      to_char(v_para - 1, 'DD/MM/YYYY'), coalesce(to_char(pai.data_fim, 'DD/MM/YYYY'), 'sem fim'));
  end if;
  for v_e in select e from jsonb_array_elements(coalesce(t.dados_novos->'vigencias', '[]'::jsonb)) e loop
    select * into vn from public.pasto_area_vigencias v where v.id = (v_e->>'nova')::uuid;
    if vn.id is null or vn.desfeita_em is not null then
      v_recusas := v_recusas || format('a área oficial de %s mudou depois do gesto',
        coalesce((select x.nome from public.pastos x where x.id = (v_e->>'pasto_id')::uuid), 'um piquete'));
    end if;
  end loop;
  v_frase := public._fn_pasto_area_trava(pai.id, pai.fazenda_id, v_ini);
  if v_frase is not null then v_recusas := v_recusas || v_frase; end if;
  for v_m in select g::date from generate_series(v_ini, v_fim - interval '1 month', interval '1 month') g loop
    v_meses := v_meses || to_jsonb(to_char(v_m, 'YYYY-MM'));
    if (public._fn_status_pilares_fechamento(pai.fazenda_id, to_char(v_m, 'YYYY-MM'))->'p1_mapa_pastos'->>'status') = 'oficial' then
      v_recusas := v_recusas || format('o fechamento de %s está fechado (reabra o mês no Fechamento antes)', to_char(v_m, 'MM/YYYY'));
      v_fechado := coalesce(v_fechado, to_char(v_m, 'YYYY-MM'));
    end if;
  end loop;

  if v_antecipou then
    -- o gesto antecipou: os cards que ele passou ao 1º piquete voltam ao pai; nada mais dos piquetes pode estar nesses meses
    for c in select * from public.fechamento_pastos x where x.id = any (v_cards) order by x.ano_mes loop
      v_n := v_n + 1;
      if c.pasto_id is distinct from v_destino then
        v_recusas := v_recusas || format('o card de %s mudou de pasto depois do gesto', c.ano_mes);
      end if;
      if c.status = 'fechado' then
        v_recusas := v_recusas || format('o card de %s está fechado', c.ano_mes);
      end if;
      if public._fn_fechamento_p2_travado(c.fazenda_id, c.ano_mes) then
        v_recusas := v_recusas || format('%s tem Valor do Rebanho validado ou P2 fechado', c.ano_mes);
      end if;
      if exists (select 1 from public.fechamento_pastos_membros m where m.fechamento_pasto_id = c.id) then
        v_recusas := v_recusas || format('o card de %s está no fechamento P1 congelado', c.ano_mes);
      end if;
      if exists (select 1 from public.fechamento_alocacoes a where a.fechamento_id = c.id and (not v_alocou or a.lote <> '')) then
        v_recusas := v_recusas || format('o card de %s ganhou alocação de lote depois do gesto', c.ano_mes);
      end if;
      v_cab := v_cab + coalesce((select sum(i.quantidade) from public.fechamento_pasto_itens i where i.fechamento_id = c.id), 0);
    end loop;
    if v_n <> cardinality(v_cards) then
      v_recusas := v_recusas || 'um card do gesto não existe mais';
    end if;
    for p in select * from public.pastos x where x.id = any (v_pastos) order by x.nome loop
      if exists (select 1 from public.fechamento_pastos f where f.pasto_id = p.id and f.ano_mes >= v_de and f.ano_mes < v_ate
                  and not (f.id = any (v_cards))) then
        v_recusas := v_recusas || format('%s ganhou card antes de %s depois do gesto', p.nome, to_char(v_fim, 'MM/YYYY'));
      end if;
      if exists (select 1 from public.fechamento_alocacoes a where a.pasto_id = p.id and a.ano_mes >= v_de and a.ano_mes < v_ate
                  and not (v_alocou and a.lote = '' and a.fechamento_id = any (v_cards))) then
        v_recusas := v_recusas || format('%s recebe lote antes de %s', p.nome, to_char(v_fim, 'MM/YYYY'));
      end if;
      if exists (select 1 from public.pasto_movimentacoes m where p.id in (m.pasto_id, m.pasto_origem_id, m.pasto_destino_id)
                  and m.data >= v_ini and m.data < v_fim) then
        v_recusas := v_recusas || format('%s tem movimentação de gado antes de %s', p.nome, to_char(v_fim, 'MM/YYYY'));
      end if;
    end loop;
  else
    -- o gesto adiou: os meses voltam aos piquetes; o pai não pode ter ganhado card neles (D2: nada se move sozinho)
    if exists (select 1 from public.fechamento_pastos f where f.pasto_id = pai.id and f.ano_mes >= v_de and f.ano_mes < v_ate) then
      v_recusas := v_recusas || format('%s ganhou card entre %s e %s depois do gesto', pai.nome, to_char(v_ini, 'MM/YYYY'), to_char(v_fim - 1, 'MM/YYYY'));
    end if;
  end if;

  if cardinality(v_recusas) > 0 then
    v_frase := format('A mudança de início de %s não se desfaz: %s. Nada foi gravado.', gr.nome, array_to_string(v_recusas, '; '));
    if v_fechado is not null then
      raise exception using errcode = 'P0001', message = v_frase, hint = 'fechamento:' || v_fechado;
    end if;
    raise exception using errcode = 'P0001', message = v_frase;
  end if;

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'direcao', case when v_antecipou then 'adiar' else 'antecipar' end,
      'meses', v_meses, 'trilha_id', t.id, 'gravada_em', t.created_at, 'motivo_do_gesto', t.dados_novos->>'motivo',
      'grupo', jsonb_build_object('id', gr.id, 'nome', gr.nome), 'de', v_para, 'para', v_volta,
      'pai', jsonb_build_object('id', pai.id, 'nome', pai.nome, 'fim_antes', pai.data_fim, 'fim_depois', (t.dados_anteriores->'pai'->>'data_fim')::date),
      'cards', cardinality(v_cards), 'cabecas', v_cab,
      'frase', format('Desfaz a mudança de %s: os piquetes (%s) voltam a começar em %s; %s volta a %s; %s card(s) (%s cab) voltam a %s.',
        to_char(t.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), v_nomes, to_char(v_volta, 'MM/YYYY'), pai.nome,
        coalesce('valer até ' || to_char((t.dados_anteriores->'pai'->>'data_fim')::date, 'DD/MM/YYYY'), 'valer sem fim'),
        cardinality(v_cards), v_cab, pai.nome));
  end if;

  -- 1) o pai ao fim e às observações de antes do gesto (antes dos cards: o card só vai a pasto vigente no mês dele)
  update public.pastos x
     set data_fim = (t.dados_anteriores->'pai'->>'data_fim')::date,
         observacoes = t.dados_anteriores->'pai'->>'observacoes'
   where x.id = pai.id;

  -- 2) os cards do gesto voltam ao pai (a alocação do `p_alocar` sai antes, pelo gravador do Fechamento)
  if v_antecipou then
    for c in select * from public.fechamento_pastos x where x.id = any (v_cards) loop
      if v_alocou then v_r := public.fn_fechamento_alocacoes_salvar(c.id, '', '{}'::uuid[]); end if;
      update public.fechamento_pastos x set pasto_id = pai.id where x.id = c.id;
    end loop;
  end if;

  -- 3) os piquetes ao início de antes, e a área oficial ao mês de antes (a do gesto desfeita; a de antes volta com os mesmos valores)
  update public.pastos x set data_inicio = v_volta where x.id = any (v_pastos);
  for v_e in select e from jsonb_array_elements(coalesce(t.dados_novos->'vigencias', '[]'::jsonb)) e loop
    select * into vg from public.pasto_area_vigencias v where v.id = (v_e->>'desfeita')::uuid;
    if vg.id is null then
      raise exception using errcode = 'P0001', message = 'A área oficial de antes do gesto não foi achada. Nada foi gravado.';
    end if;
    update public.pasto_area_vigencias v set desfeita_em = now(), desfeita_por = auth.uid(),
           desfeita_motivo = format('desfeita a mudança do início para %s: %s', to_char(v_para, 'MM/YYYY'), v_motivo)
     where v.id = (v_e->>'nova')::uuid;
    v_novo := public._fn_pasto_area_gravar(vg.pasto_id, vg.area_ha, vg.vigente_desde, vg.origem, vg.motivo, vg.geometria_id, vg.area_mapa_ha, v_lote);
    v_vigs := v_vigs || jsonb_build_object('pasto_id', vg.pasto_id, 'desfeita', v_e->>'nova', 'nova', v_novo, 'area_ha', vg.area_ha);
  end loop;

  -- a conferência: o pai tem de novo as cabeças dos cards do gesto; os piquetes, nada nos meses que voltam ao pai
  if v_antecipou then
    select coalesce(sum(i.quantidade), 0) into v_cab_depois
      from public.fechamento_pastos f join public.fechamento_pasto_itens i on i.fechamento_id = f.id
     where f.pasto_id = pai.id and f.ano_mes >= v_de and f.ano_mes < v_ate;
    if v_cab_depois <> v_cab
       or exists (select 1 from public.fechamento_pastos f where f.pasto_id = any (v_pastos) and f.ano_mes >= v_de and f.ano_mes < v_ate) then
      raise exception using errcode = 'P0001',
        message = format('A conferência das cabeças de %s não fechou (antes %s, depois %s). Nada foi gravado.', pai.nome, v_cab, v_cab_depois);
    end if;
  end if;

  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  values (gr.cliente_id, pai.fazenda_id, auth.uid(), 'cadastros', 'piquetes_mudar_inicio_desfeito', 'pasto_grupos', gr.id,
          format('desfeita a mudança de início de %s: piquetes voltam a começar em %s (estavam em %s); %s volta a %s',
                 gr.nome, to_char(v_volta, 'MM/YYYY'), to_char(v_para, 'MM/YYYY'), pai.nome,
                 coalesce('valer até ' || to_char((t.dados_anteriores->'pai'->>'data_fim')::date, 'DD/MM/YYYY'), 'valer sem fim')),
          jsonb_build_object('inicio', v_para, 'pai', jsonb_build_object('id', pai.id, 'data_fim', pai.data_fim, 'observacoes', pai.observacoes),
                             'cards', to_jsonb(v_cards), 'pastos', to_jsonb(v_pastos)),
          jsonb_build_object('trilha_id', t.id, 'inicio', v_volta, 'motivo', v_motivo, 'lote', v_lote, 'vigencias', v_vigs, 'cabecas', v_cab))
  returning id into v_log;

  return jsonb_build_object('ok', true, 'simulado', false, 'grupo', jsonb_build_object('id', gr.id, 'nome', gr.nome),
    'de', v_para, 'para', v_volta, 'cards', cardinality(v_cards), 'cabecas', v_cab, 'trilha_id', v_log, 'desfez', t.id);
end $$;
revoke all on function public.fn_piquetes_mudar_inicio_desfazer(uuid, text, boolean) from public, anon;
grant execute on function public.fn_piquetes_mudar_inicio_desfazer(uuid, text, boolean) to authenticated;
