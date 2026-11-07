-- FECH-PASTO-UNIDADE-01 · F1 banco 3/4 (Gabriel 07/11/2026, decisões 1 e 2): a MIGRAÇÃO do que já foi gravado no modelo antigo, com prévia,
-- sem apagar nada e com desfazer. Esta migration só CRIA as duas rotinas; a gravação é a chamada `fn_pasto_unidade_migrar(false)`, num
-- passo próprio, depois do GO.
--   · os pais encerrados pela divisão (grupo ativo com origem, `data_fim` = véspera do 1º piquete, observação "virou o grupo") voltam a
--     valer sem fim: o pai é o pasto (os 38 de hoje: NJ 27, Agnaldo 6, Santa Rita 2, Teste 3);
--   · cada card de piquete passa ao card do pai no mesmo mês (o MESMO card: muda o `pasto_id`), e as linhas dele ficam com
--     `piquete_id` = o piquete de onde vieram (nenhuma cabeça muda). Se o pai já tem card naquele mês, o card do piquete FICA onde está
--     (nada se apaga): é o caso dos vazios da P6 da PUR (P6-B, P6-C), que não contam mais em P1 nem em pendência (117450);
--   · a trilha (`audit_log`, via `sistema:FECH-PASTO-UNIDADE-01`) guarda o antes de cada pai e de cada card; a rodada é achada pelo
--     índice que já existe (`tabela_origem` = 'pasto_unidade', `registro_id` = a rodada; o audit_log tem 432 MB e nenhum índice por ação);
--     o histórico de cada pasto também sai pelo gatilho de cadastro (`app.motivo`);
--   · `fn_pasto_unidade_desfazer(rodada, motivo, simular)` volta tudo da rodada, e recusa se algo mudou depois.
-- As duas são INTERNAS (sem EXECUTE para `authenticated`): rodam pelo canal do banco, como as cargas.
set local lock_timeout = '2s';

create or replace function public.fn_pasto_unidade_migrar(p_simular boolean default true)
returns jsonb language plpgsql security invoker set search_path to 'pg_catalog', 'public' as $$
declare
  r record; v_rodada uuid := gen_random_uuid(); v_pais jsonb := '[]'; v_cards jsonb := '[]'; v_ficam jsonb := '[]';
  v_fora jsonb := '[]'; v_feitos text[] := '{}'; v_chave text; v_cab_antes int; v_cab_ligadas int := 0; v_cab_conferida int; v_itens jsonb;
begin
  -- os cards de piquete de hoje e as cabeças deles (a conta que tem de fechar no fim)
  select coalesce(sum(i.quantidade), 0) into v_cab_antes
    from public.fechamento_pastos fp join public.fechamento_pasto_itens i on i.fechamento_id = fp.id
   where public._fn_pai_do_piquete(fp.pasto_id) is not null;
  perform set_config('app.via', 'FECH-PASTO-UNIDADE-01', true);
  perform set_config('app.motivo', 'FECH-PASTO-UNIDADE-01: piquete é subárea do pasto; o pasto dividido segue sendo o pasto e o card', true);

  -- 1) os pais encerrados pela divisão voltam a valer
  for r in
    select po.id, po.nome, po.cliente_id, po.fazenda_id, po.data_fim, po.observacoes, g.nome grupo,
           (select min(q.data_inicio) from public.pastos q where q.grupo_id = g.id) inicio
      from public.pasto_grupos g join public.pastos po on po.id = g.pasto_origem_id
     where g.ativo and po.data_fim is not null
     order by po.cliente_id, po.fazenda_id, po.nome
  loop
    if r.observacoes is null or r.observacoes !~ 'virou o grupo' or r.inicio is null or r.data_fim <> r.inicio - 1 then
      v_fora := v_fora || jsonb_build_object('pasto', r.nome, 'fim', r.data_fim, 'inicio_piquetes', r.inicio, 'motivo', 'o fim não é o da divisão');
      continue;
    end if;
    v_pais := v_pais || jsonb_build_object('pasto_id', r.id, 'nome', r.nome, 'cliente_id', r.cliente_id, 'fim_antes', r.data_fim, 'grupo', r.grupo);
    if not p_simular then
      update public.pastos set data_fim = null where id = r.id;
      insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
      values (r.cliente_id, r.fazenda_id, null, 'cadastros', 'pasto_unidade_pai', 'pasto_unidade', v_rodada,
              format('%s volta a valer sem fim (estava encerrado em %s pela divisão): os piquetes de %s são subáreas dele', r.nome,
                     to_char(r.data_fim, 'DD/MM/YYYY'), r.grupo),
              jsonb_build_object('pasto_id', r.id, 'data_fim', r.data_fim), jsonb_build_object('pasto_id', r.id, 'data_fim', null), 'sistema:FECH-PASTO-UNIDADE-01');
    end if;
  end loop;

  -- 2) cada card de piquete vai ao pai no mesmo mês (o mesmo card); se o pai já tem card no mês, fica onde está
  for r in
    select fp.id, fp.ano_mes, fp.status, fp.cliente_id, fp.fazenda_id, fp.pasto_id, p.nome piquete, public._fn_pai_do_piquete(fp.pasto_id) pai,
           (select x.nome from public.pastos x where x.id = public._fn_pai_do_piquete(fp.pasto_id)) nome_pai,
           (select coalesce(sum(i.quantidade), 0) from public.fechamento_pasto_itens i where i.fechamento_id = fp.id) cab
      from public.fechamento_pastos fp join public.pastos p on p.id = fp.pasto_id
     where public._fn_pai_do_piquete(fp.pasto_id) is not null
     order by fp.cliente_id, nome_pai, fp.ano_mes, (select coalesce(sum(i.quantidade), 0) from public.fechamento_pasto_itens i where i.fechamento_id = fp.id) desc, p.nome
  loop
    v_chave := r.pai::text || '|' || r.ano_mes;
    if v_chave = any (v_feitos) or exists (select 1 from public.fechamento_pastos x where x.pasto_id = r.pai and x.ano_mes = r.ano_mes) then
      v_ficam := v_ficam || jsonb_build_object('card_id', r.id, 'piquete', r.piquete, 'pai', r.nome_pai, 'ano_mes', r.ano_mes, 'cabecas', r.cab, 'status', r.status);
      if r.cab > 0 then
        raise exception 'FECH-PASTO-UNIDADE-01: o card de % em % tem % cab e o pai % já tem card no mês: isso pede decisão. Nada foi gravado.',
          r.piquete, r.ano_mes, r.cab, r.nome_pai;
      end if;
      continue;
    end if;
    v_feitos := v_feitos || v_chave;
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'categoria_id', i.categoria_id, 'quantidade', i.quantidade) order by i.id), '[]'::jsonb)
      into v_itens from public.fechamento_pasto_itens i where i.fechamento_id = r.id;
    v_cards := v_cards || jsonb_build_object('card_id', r.id, 'piquete_id', r.pasto_id, 'piquete', r.piquete, 'pai_id', r.pai, 'pai', r.nome_pai,
                                             'ano_mes', r.ano_mes, 'status', r.status, 'cabecas', r.cab, 'linhas', jsonb_array_length(v_itens));
    v_cab_ligadas := v_cab_ligadas + r.cab;
    if not p_simular then
      update public.fechamento_pastos set pasto_id = r.pai where id = r.id;
      update public.fechamento_pasto_itens set piquete_id = r.pasto_id where fechamento_id = r.id;
      insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
      values (r.cliente_id, r.fazenda_id, null, 'fechamento', 'pasto_unidade_card', 'pasto_unidade', v_rodada,
              format('o card de %s em %s (%s cab) passa ao card de %s, com as linhas marcadas no piquete %s', r.piquete, r.ano_mes, r.cab, r.nome_pai, r.piquete),
              jsonb_build_object('card_id', r.id, 'pasto_id', r.pasto_id, 'itens', v_itens), jsonb_build_object('card_id', r.id, 'pasto_id', r.pai, 'piquete_id', r.pasto_id),
              'sistema:FECH-PASTO-UNIDADE-01');
    end if;
  end loop;

  -- 3) a conferência: as cabeças que estavam em piquete = as que agora estão no pai marcadas no piquete (+ as que ficaram, que são zero)
  if not p_simular then
    select coalesce(sum(i.quantidade), 0) into v_cab_conferida
      from public.fechamento_pastos fp join public.fechamento_pasto_itens i on i.fechamento_id = fp.id
     where fp.id in (select (e->>'card_id')::uuid from jsonb_array_elements(v_cards) e) and i.piquete_id is not null;
    if v_cab_conferida <> v_cab_antes or v_cab_ligadas <> v_cab_antes then
      raise exception 'FECH-PASTO-UNIDADE-01: a conta das cabeças não fechou (antes %, ligadas %, conferidas %). Nada foi gravado.',
        v_cab_antes, v_cab_ligadas, v_cab_conferida;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'simulado', p_simular, 'rodada', case when p_simular then null else v_rodada end,
    'pais', v_pais, 'cards', v_cards, 'ficam', v_ficam, 'fora', v_fora,
    'resumo', jsonb_build_object('pais', jsonb_array_length(v_pais), 'cards', jsonb_array_length(v_cards), 'ficam', jsonb_array_length(v_ficam),
                                 'fora', jsonb_array_length(v_fora), 'cabecas_antes', v_cab_antes, 'cabecas_ligadas', v_cab_ligadas));
end $$;
revoke all on function public.fn_pasto_unidade_migrar(boolean) from public, anon, authenticated;

create or replace function public.fn_pasto_unidade_desfazer(p_rodada uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security invoker set search_path to 'pg_catalog', 'public' as $$
declare
  t public.audit_log%rowtype; v_ids_cards uuid[]; v_recusas text[] := '{}'; v_cards int := 0; v_pais int := 0; v_fp public.fechamento_pastos%rowtype; v_agora jsonb; v_nome text;
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Diga o motivo de desfazer. Nada foi gravado.';
  end if;
  if not exists (select 1 from public.audit_log a where a.tabela_origem = 'pasto_unidade' and a.registro_id = p_rodada and a.acao in ('pasto_unidade_pai', 'pasto_unidade_card')) then
    raise exception using errcode = 'P0001', message = 'Essa rodada não existe. Nada foi gravado.';
  end if;
  if exists (select 1 from public.audit_log a where a.tabela_origem = 'pasto_unidade' and a.registro_id = p_rodada and a.acao = 'pasto_unidade_desfeita') then
    raise exception using errcode = 'P0001', message = 'Essa rodada já foi desfeita. Nada foi gravado.';
  end if;
  -- os cards: abertos, sem P2, com as MESMAS linhas que a rodada deixou
  select coalesce(array_agg((a.dados_anteriores->>'card_id')::uuid), '{}') into v_ids_cards
    from public.audit_log a where a.tabela_origem = 'pasto_unidade' and a.registro_id = p_rodada and a.acao = 'pasto_unidade_card';
  for t in select * from public.audit_log a where a.tabela_origem = 'pasto_unidade' and a.registro_id = p_rodada and a.acao = 'pasto_unidade_card' loop
    select * into v_fp from public.fechamento_pastos where id = (t.dados_anteriores->>'card_id')::uuid;
    select nome into v_nome from public.pastos where id = (t.dados_anteriores->>'pasto_id')::uuid;
    if v_fp.id is null or v_fp.pasto_id is distinct from (t.dados_novos->>'pasto_id')::uuid then
      v_recusas := v_recusas || format('o card de %s mudou de pasto depois', v_nome); continue;
    end if;
    if v_fp.status = 'fechado' or public._fn_fechamento_p2_travado(v_fp.fazenda_id, v_fp.ano_mes) then
      v_recusas := v_recusas || format('o card de %s em %s está fechado ou com o P2 travado', v_nome, v_fp.ano_mes);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'categoria_id', i.categoria_id, 'quantidade', i.quantidade) order by i.id), '[]'::jsonb)
      into v_agora from public.fechamento_pasto_itens i where i.fechamento_id = v_fp.id;
    if v_agora <> t.dados_anteriores->'itens' then
      v_recusas := v_recusas || format('as linhas do card de %s em %s mudaram depois', v_nome, v_fp.ano_mes);
    end if;
    v_cards := v_cards + 1;
  end loop;
  -- os pais: sem card em mês depois do fim de antes (a não ser os que voltam ao piquete nesta rodada)
  for t in select * from public.audit_log a where a.tabela_origem = 'pasto_unidade' and a.registro_id = p_rodada and a.acao = 'pasto_unidade_pai' loop
    select nome into v_nome from public.pastos where id = (t.dados_anteriores->>'pasto_id')::uuid;
    if (select data_fim from public.pastos where id = (t.dados_anteriores->>'pasto_id')::uuid) is not null then
      v_recusas := v_recusas || format('%s ganhou um fim depois', v_nome);
    end if;
    if exists (select 1 from public.fechamento_pastos f where f.pasto_id = (t.dados_anteriores->>'pasto_id')::uuid
                and f.ano_mes > to_char((t.dados_anteriores->>'data_fim')::date, 'YYYY-MM')
                and not (f.id = any (v_ids_cards))) then
      v_recusas := v_recusas || format('%s tem card depois de %s', v_nome, to_char((t.dados_anteriores->>'data_fim')::date, 'MM/YYYY'));
    end if;
    v_pais := v_pais + 1;
  end loop;
  if cardinality(v_recusas) > 0 then
    raise exception using errcode = 'P0001', message = format('A rodada não volta: %s. Nada foi gravado.', array_to_string(v_recusas, '; '));
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'cards', v_cards, 'pais', v_pais,
      'frase', format('%s card(s) voltam ao piquete e %s pasto(s) voltam a ter o fim de antes.', v_cards, v_pais));
  end if;

  perform set_config('app.via', 'FECH-PASTO-UNIDADE-01', true);
  perform set_config('app.motivo', 'FECH-PASTO-UNIDADE-01 desfeito: ' || p_motivo, true);
  perform set_config('app.pasto_unidade_desfazer', 'on', true);
  for t in select * from public.audit_log a where a.tabela_origem = 'pasto_unidade' and a.registro_id = p_rodada and a.acao = 'pasto_unidade_card' loop
    update public.fechamento_pasto_itens set piquete_id = null where fechamento_id = (t.dados_anteriores->>'card_id')::uuid;
    update public.fechamento_pastos set pasto_id = (t.dados_anteriores->>'pasto_id')::uuid where id = (t.dados_anteriores->>'card_id')::uuid;
  end loop;
  for t in select * from public.audit_log a where a.tabela_origem = 'pasto_unidade' and a.registro_id = p_rodada and a.acao = 'pasto_unidade_pai' loop
    update public.pastos set data_fim = (t.dados_anteriores->>'data_fim')::date where id = (t.dados_anteriores->>'pasto_id')::uuid;
  end loop;
  perform set_config('app.pasto_unidade_desfazer', '', true);
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  select a.cliente_id, auth.uid(), 'cadastros', 'pasto_unidade_desfeita', 'pasto_unidade', p_rodada, format('desfeita a rodada %s: %s', p_rodada, p_motivo),
         null, jsonb_build_object('motivo', p_motivo), 'sistema:FECH-PASTO-UNIDADE-01'
    from (select distinct a.cliente_id from public.audit_log a
           where a.tabela_origem = 'pasto_unidade' and a.registro_id = p_rodada and a.acao in ('pasto_unidade_pai', 'pasto_unidade_card')) a;
  return jsonb_build_object('ok', true, 'simulado', false, 'cards', v_cards, 'pais', v_pais);
end $$;
revoke all on function public.fn_pasto_unidade_desfazer(uuid, text, boolean) from public, anon, authenticated;
