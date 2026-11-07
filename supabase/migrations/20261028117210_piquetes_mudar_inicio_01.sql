-- PIQUETES-MUDAR-INICIO-01 (Gabriel 03/11 14:48 D1 = a; 14:52 D2 = b, o card inteiro no piquete A) — os piquetes de um grupo nascido do "Concluir piquetes" passam a
-- começar num mês ANTERIOR (o caso: Sta. Tereza, Modulo 01/02/03 marcados desde 11/2026, o certo é 10/2026).
-- O "Concluir" recusa começar num mês em que o pai já tem card, e não há função que apague ou mova o card: daí este gesto, num só:
--   1) os piquetes desde o mês novo (`data_inicio`) e a área oficial deles desde o mês novo (a vigência antiga fica desfeita, com motivo);
--   2) o pai encerrado no último dia do mês anterior;
--   3) o card do pai em cada mês que muda passa INTEIRO ao 1º piquete pelo nome, o "A" (D2 = b, Gabriel 14:52). Com `p_alocar`, o lote
--      fica também ALOCADO aos piquetes do grupo (lote '' = o card inteiro, a alocação do Fechamento: `fn_fechamento_alocacoes_salvar`,
--      rateio por área na `fn_lotacao_do_mes`). As cabeças não se copiam: são as MESMAS linhas do card, e a função confere antes = depois;
--   4) a trilha (`audit_log`, acao 'piquetes_mudar_inicio') com os valores anteriores de tudo (o caminho de volta).
-- Recusa (nada gravado): grupo que não nasceu do Concluir; mês que não é anterior; pai com fim diferente do que o Concluir pôs; card do
-- pai FECHADO, P1 congelado ou P2 travado num mês que muda; piquete com card, alocação ou movimentação num mês que muda; a trava de área.
-- `p_simular` (padrão) = a prévia com a conferência das cabeças e a lotação (cab, kg, UA = kg/450 como a `fn_lotacao_do_mes`; UA/ha do
-- grupo = Σ das áreas dos piquetes; UA/ha do piquete que recebe o card). Nasce fechada: só `authenticated`, e só admin (`_fn_mapa_so_admin`).
set lock_timeout = '2s';

create function public.fn_piquetes_mudar_inicio(p_grupo uuid, p_mes date, p_motivo text, p_simular boolean default true,
  p_alocar boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  gr public.pasto_grupos; pai public.pastos; p public.pastos; c public.fechamento_pastos; vg public.pasto_area_vigencias;
  v_conc public.audit_log;
  v_mes date := date_trunc('month', p_mes)::date;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_pastos uuid[]; v_antes date; v_n_inicios int; v_destino uuid; v_destino_nome text;
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

  -- os piquetes do Concluir que seguem no grupo e ativos; todos começam no mesmo mês (o de hoje)
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
  if v_mes is null or v_mes >= v_antes then
    raise exception using errcode = 'P0001',
      message = format('Os piquetes de %s começam em %s: o mês novo tem de ser antes. Nada foi gravado.', gr.nome, to_char(v_antes, 'MM/YYYY'));
  end if;
  if pai.data_inicio is not null and pai.data_inicio >= v_mes then
    raise exception using errcode = 'P0001',
      message = format('O pasto %s começou em %s: os piquetes começam num mês depois. Nada foi gravado.', pai.nome, to_char(pai.data_inicio, 'MM/YYYY'));
  end if;
  if pai.data_fim is distinct from (v_antes - 1) then
    v_recusas := v_recusas || format('o fim de %s mudou depois dos piquetes (era %s, está %s)', pai.nome,
      to_char(v_antes - 1, 'DD/MM/YYYY'), coalesce(to_char(pai.data_fim, 'DD/MM/YYYY'), 'sem fim'));
  end if;
  v_de := to_char(v_mes, 'YYYY-MM');
  v_ate := to_char(v_antes, 'YYYY-MM');
  v_destino := v_pastos[1];
  select x.nome into v_destino_nome from public.pastos x where x.id = v_destino;

  v_frase := public._fn_pasto_area_trava(pai.id, pai.fazenda_id, v_mes);
  if v_frase is not null then v_recusas := v_recusas || v_frase; end if;
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
  -- os piquetes não têm nada nos meses que mudam (o card do pai vai para um deles)
  for p in select * from public.pastos x where x.id = any (v_pastos) order by x.nome loop
    if exists (select 1 from public.fechamento_pastos f where f.pasto_id = p.id and f.ano_mes >= v_de and f.ano_mes < v_ate) then
      v_recusas := v_recusas || format('%s já tem card antes de %s', p.nome, to_char(v_antes, 'MM/YYYY'));
    end if;
    if exists (select 1 from public.fechamento_alocacoes a where a.pasto_id = p.id and a.ano_mes >= v_de and a.ano_mes < v_ate) then
      v_recusas := v_recusas || format('%s recebe lote antes de %s', p.nome, to_char(v_antes, 'MM/YYYY'));
    end if;
    if exists (select 1 from public.pasto_movimentacoes m where p.id in (m.pasto_id, m.pasto_origem_id, m.pasto_destino_id)
                and m.data >= v_mes and m.data < v_antes) then
      v_recusas := v_recusas || format('%s tem movimentação de gado antes de %s', p.nome, to_char(v_antes, 'MM/YYYY'));
    end if;
  end loop;
  if cardinality(v_recusas) > 0 then
    raise exception using errcode = 'P0001',
      message = format('Os piquetes de %s não mudam para %s: %s. Nada foi gravado.', gr.nome, to_char(v_mes, 'MM/YYYY'), array_to_string(v_recusas, '; '));
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
    return jsonb_build_object('ok', true, 'simulado', true, 'lotacao', v_lotacao, 'alocar', p_alocar, 'grupo', jsonb_build_object('id', gr.id, 'nome', gr.nome),
      'de', v_antes, 'para', v_mes, 'pai', jsonb_build_object('id', pai.id, 'nome', pai.nome, 'fim_antes', pai.data_fim, 'fim_depois', v_mes - 1),
      'piquetes', cardinality(v_pastos), 'cards', v_cards, 'cabecas_antes', v_cab_antes, 'card_vai_para', v_destino_nome,
      'frase', format('%s: os %s piquetes passam a começar em %s; %s fica encerrado em %s; %s card(s) de %s (%s cab, %s kg, %s UA) passam %s; lotação do grupo %s UA/ha (%s ha), de %s %s UA/ha (%s ha).',
        gr.nome, cardinality(v_pastos), to_char(v_mes, 'MM/YYYY'), pai.nome, to_char(v_mes - 1, 'DD/MM/YYYY'),
        jsonb_array_length(v_cards), pai.nome, v_cab_antes, round(v_kg), round(v_ua, 1),
        case when p_alocar then format('a %s com o lote alocado aos %s piquetes', v_destino_nome, cardinality(v_pastos))
             else format('inteiros a %s', v_destino_nome) end,
        v_lotacao->>'ua_ha_grupo', v_area_grupo, v_destino_nome, v_lotacao->>'ua_ha_piquete', v_area_destino));
  end if;

  -- 1) os piquetes desde o mês novo, e a área oficial deles desde o mês novo
  update public.pastos x set data_inicio = v_mes where x.id = any (v_pastos);
  for p in select * from public.pastos x where x.id = any (v_pastos) order by x.nome loop
    select * into vg from public.pasto_area_vigencias v where v.pasto_id = p.id and v.vigente_desde = v_antes and v.desfeita_em is null;
    if vg.id is null then
      raise exception using errcode = 'P0001', message = format('A área oficial de %s desde %s não foi achada. Nada foi gravado.', p.nome, v_ate);
    end if;
    update public.pasto_area_vigencias v set desfeita_em = now(), desfeita_por = auth.uid(),
           desfeita_motivo = format('o início dos piquetes passou a %s: %s', to_char(v_mes, 'MM/YYYY'), v_motivo)
     where v.id = vg.id;
    v_novo := public._fn_pasto_area_gravar(p.id, vg.area_ha, v_mes, vg.origem,
      format('%s (início passou de %s a %s)', vg.motivo, to_char(v_antes, 'MM/YYYY'), to_char(v_mes, 'MM/YYYY')), vg.geometria_id, vg.area_mapa_ha, v_lote);
    v_vigs := v_vigs || jsonb_build_object('pasto_id', p.id, 'desfeita', vg.id, 'nova', v_novo, 'area_ha', vg.area_ha);
  end loop;

  -- 2) o pai encerrado no último dia antes do mês novo
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
          jsonb_build_object('inicio', v_mes, 'motivo', v_motivo, 'lote', v_lote, 'vigencias', v_vigs, 'card_vai_para', v_destino,
                             'alocar', p_alocar, 'cabecas', v_cab_depois, 'lotacao', v_lotacao))
  returning id into v_log;

  return jsonb_build_object('ok', true, 'simulado', false, 'grupo', jsonb_build_object('id', gr.id, 'nome', gr.nome), 'de', v_antes, 'para', v_mes,
    'pai_encerrado_em', v_mes - 1, 'cards', v_cards, 'lotacao', v_lotacao, 'alocar', p_alocar, 'cabecas_antes', v_cab_antes, 'cabecas_depois', v_cab_depois, 'card_vai_para', v_destino_nome,
    'trilha_id', v_log);
end $$;
revoke all on function public.fn_piquetes_mudar_inicio(uuid, date, text, boolean, boolean) from public, anon;
grant execute on function public.fn_piquetes_mudar_inicio(uuid, date, text, boolean, boolean) to authenticated;
