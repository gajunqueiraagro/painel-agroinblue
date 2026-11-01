-- PATR-01c (116100 + 116110) — o Salvar sem 40001 e a vida util: CORRIGIR O CADASTRO x MUDANCA DE ESTIMATIVA. Fixture SINTETICA no
-- cliente Teste (43f32d07) que reproduz o VEI-001 do proto (Caminhao: 250 mil sem lancamento, em uso desde 01/2020, 60 meses/30% da
-- categoria + uma linha "correto" de 240 meses em 10/2026, gravada como postgres como se fosse do passado). As RPCs rodam como
-- `authenticated` (admin 7bd0b6ad). TERMINA EM RAISE: nada fica.
--   S1  a versao velha no Salvar recusa com P0001 (a frase de sempre), nunca 40001; nenhum 40001 no corpo da fn_patrimonio_bem_salvar
--   E1  mudanca de estimativa num bem TODO depreciado: a previa diz sem_efeito + "Ja' esta' todo depreciado; ..."; gravar recusa
--       (P0001, a mesma frase) e nada muda (linhas, versao, trilha)
--   C1  previa da correcao: antes = 175.000 acumulados no mes atual, fim da vida 12/2024; depois = 175.000 x j/240 (j = meses desde
--       01/2020), 8.750 em 2020, fim da vida 12/2039, 1 linha a sair; a previa NAO grava (linhas, versao, trilha)
--   C2  versao velha na correcao: P0001 "Este bem foi alterado por outra pessoa. ..."
--   C3  gravar a correcao: 1 linha (240/30 desde 2020-01, o motivo), versao + 1, trilha `correcao_cadastro` com as 2 linhas antes e a 1
--       depois, autor = quem esta' logado; a serie do bem = a da previa
--   C4  corrigir de novo para o mesmo: "Nada a corrigir: ..."
--   E2  mudanca de estimativa com efeito (300 meses do mes atual): versao velha recusa (P0001); a certa grava, devolve a versao nova,
--       trilha `mudanca_estimativa`
--   E3  mudanca igual a' vigente (o mesmo mes, 300/30): sem_efeito + "Esta mudança não altera nenhum mês da depreciação."
--   C5  regras: bem em formacao e categoria que nao deprecia recusam (P0001)
--   T1  a trilha recusa acao fora das 3 (check_violation)
-- Mutacoes (ensaio, ver o relatorio): MC1 sem a 116100 derruba S1 · MC2 a correcao sem apagar as posteriores derruba C3 · MC3 a
-- correcao sem conferir a versao derruba C2 · MC4 a mudanca sem a recusa do sem_efeito derruba E1.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- S1 (como postgres): o corpo
do $s1a$
begin
  if (select p.prosrc like '%40001%' from pg_proc p where p.oid = 'public.fn_patrimonio_bem_salvar(jsonb,boolean,text)'::regprocedure) then
    raise exception 'S1: a fn_patrimonio_bem_salvar ainda tem 40001';
  end if;
end $s1a$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cat_vei uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'veiculos');
  r jsonb; v uuid;
begin
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_vei,
         'descricao', 'Caminhao sintetico 01c', 'situacao', 'em_uso', 'em_uso_desde', '2020-01-01', 'atividade', 'compartilhado',
         'origem_valor', 'sem_lancamento', 'valor_sem_lancamento', 250000), false);
  v := (r->>'id')::uuid;
  perform set_config('teste.vei', v::text, true);
  -- S1: a versao velha
  begin
    perform public.fn_patrimonio_bem_salvar(jsonb_build_object('id', v, 'versao', 0, 'fazenda_id', c_faz, 'categoria_id', cat_vei,
      'descricao', 'Caminhao sintetico 01c', 'situacao', 'em_uso', 'em_uso_desde', '2020-01-01', 'atividade', 'compartilhado',
      'origem_valor', 'sem_lancamento', 'valor_sem_lancamento', 250000), false);
    raise exception 'S1: a versao velha gravou';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm <> 'Este bem foi alterado por outra pessoa. Feche e abra de novo.' then
      raise exception 'S1: a versao velha recusou com % (%)', sqlstate, sqlerrm;
    end if;
  end;
end $fx$;
reset role;

-- a linha "correto" de 10/2026, como se tivesse sido gravada no passado (o D4 de hoje so' aceita do mes atual em diante)
insert into public.patrimonio_bem_parametros (cliente_id, bem_id, vigente_desde, vida_util_meses, residual_pct, motivo)
values ('43f32d07-dba8-4670-900c-bf645440c04a', current_setting('teste.vei')::uuid, '2026-10-01', 240, 30, 'correto (fixture)');
do $chk$
begin
  if (select string_agg(vida_util_meses || '/' || residual_pct, ' ' order by vigente_desde) from public.patrimonio_bem_parametros
       where bem_id = current_setting('teste.vei')::uuid) is distinct from '60/30.00 240/30.00' then
    raise exception 'fixture: linhas do caminhao';
  end if;
end $chk$;
select set_config('teste.mes', date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date::text, true);

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $t$
declare
  v uuid := current_setting('teste.vei')::uuid;
  m_atual date := current_setting('teste.mes')::date;
  j int := ((extract(year from current_setting('teste.mes')::date) - 2020) * 12 + extract(month from current_setting('teste.mes')::date))::int;
  ver int := (select versao from public.patrimonio_bens where id = v);
  r jsonb; x record; frase_todo constant text := 'Já está todo depreciado; esta mudança não altera nada. Quer corrigir o cadastro desde o início?';
begin
  -- E1
  r := public.fn_patrimonio_parametros_mudar(v, m_atual, 120, 30, 'estimativa sintetica', true, ver);
  if (r->>'sem_efeito')::boolean is not true or r->>'aviso' is distinct from frase_todo then
    raise exception 'E1 previa: sem_efeito=% aviso=%', r->>'sem_efeito', r->>'aviso';
  end if;
  begin
    perform public.fn_patrimonio_parametros_mudar(v, m_atual, 120, 30, 'estimativa sintetica', false, ver);
    raise exception 'E1: a mudanca sem efeito gravou';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm <> frase_todo then raise exception 'E1 recusa: % %', sqlstate, sqlerrm; end if;
  end;
  if (select count(*) from public.patrimonio_bem_parametros where bem_id = v) <> 2
     or (select versao from public.patrimonio_bens where id = v) <> ver
     or exists (select 1 from public.patrimonio_bem_trilha where bem_id = v) then
    raise exception 'E1: a recusa deixou rastro';
  end if;

  -- C1 previa
  r := public.fn_patrimonio_parametros_corrigir(v, ver, 240, 30, 'cadastro errado desde o inicio (sintetico)', true);
  if (r->'antes'->'hoje'->>'acumulada')::numeric <> 175000 or r->'antes'->>'fim_da_vida' <> '2024-12-01'
     or (r->'depois'->'hoje'->>'acumulada')::numeric <> round(175000::numeric * j / 240, 2)
     or (r->'depois'->'hoje'->>'contabil')::numeric <> 250000 - round(175000::numeric * j / 240, 2)
     or r->'depois'->>'fim_da_vida' <> '2039-12-01'
     or (r->'depois'->'anos'->0->>'ano')::int <> 2020 or (r->'depois'->'anos'->0->>'quota')::numeric <> 8750
     or (r->>'linhas_removidas')::int <> 1 or jsonb_array_length(r->'parametros_antes') <> 2 or (r->>'versao')::int <> ver then
    raise exception 'C1 previa: %', r;
  end if;
  if (select count(*) from public.patrimonio_bem_parametros where bem_id = v) <> 2
     or (select versao from public.patrimonio_bens where id = v) <> ver
     or exists (select 1 from public.patrimonio_bem_trilha where bem_id = v) then
    raise exception 'C1: a previa gravou';
  end if;
  perform set_config('teste.previa', r::text, true);

  -- C2
  begin
    perform public.fn_patrimonio_parametros_corrigir(v, ver - 1, 240, 30, 'cadastro errado (sintetico)', false);
    raise exception 'C2: a versao velha gravou';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm <> 'Este bem foi alterado por outra pessoa. Feche e abra de novo.' then
      raise exception 'C2 recusa: % %', sqlstate, sqlerrm;
    end if;
  end;

  -- C3
  r := public.fn_patrimonio_parametros_corrigir(v, ver, 240, 30, ' cadastro errado desde o inicio (sintetico) ', false);
  if (r->>'versao')::int <> ver + 1 or (select versao from public.patrimonio_bens where id = v) <> ver + 1 then
    raise exception 'C3: versao % / %', r->>'versao', (select versao from public.patrimonio_bens where id = v);
  end if;
  if (select string_agg(vigente_desde || ' ' || vida_util_meses || '/' || residual_pct || ' ' || motivo, ' | ')
        from public.patrimonio_bem_parametros where bem_id = v)
     is distinct from '2020-01-01 240/30.00 cadastro errado desde o inicio (sintetico)' then
    raise exception 'C3: linhas = %', (select string_agg(vigente_desde || ' ' || vida_util_meses || '/' || residual_pct, ' | ')
                                          from public.patrimonio_bem_parametros where bem_id = v);
  end if;
  select * into x from public.patrimonio_bem_trilha where bem_id = v;
  if x.acao is distinct from 'correcao_cadastro' or jsonb_array_length(x.antes->'parametros') <> 2
     or jsonb_array_length(x.depois->'parametros') <> 1 or x.por is distinct from '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'::uuid
     or x.motivo is distinct from 'cadastro errado desde o inicio (sintetico)'
     or (x.antes->'hoje'->>'acumulada')::numeric <> 175000
     or (x.depois->'hoje'->>'acumulada')::numeric <> round(175000::numeric * j / 240, 2) then
    raise exception 'C3 trilha: % % %', x.acao, x.antes, x.depois;
  end if;
  if r->'depois' is distinct from current_setting('teste.previa')::jsonb->'depois' then
    raise exception 'C3: a serie gravada difere da previa';
  end if;

  -- C4
  begin
    perform public.fn_patrimonio_parametros_corrigir(v, ver + 1, 240, 30, 'de novo', true);
    raise exception 'C4: corrigir para o mesmo passou';
  exception when others then
    if sqlerrm <> 'Nada a corrigir: o cadastro já tem esta vida útil e este residual desde o início.' then raise exception 'C4: %', sqlerrm; end if;
  end;

  -- E2
  r := public.fn_patrimonio_parametros_mudar(v, m_atual, 300, 30, 'vida maior (sintetico)', true, ver + 1);
  if (r->>'sem_efeito')::boolean is not false or r->>'aviso' is not null then raise exception 'E2 previa: %', r; end if;
  begin
    perform public.fn_patrimonio_parametros_mudar(v, m_atual, 300, 30, 'vida maior (sintetico)', false, ver);
    raise exception 'E2: a versao velha gravou';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm <> 'Este bem foi alterado por outra pessoa. Feche e abra de novo.' then raise exception 'E2 recusa: % %', sqlstate, sqlerrm; end if;
  end;
  r := public.fn_patrimonio_parametros_mudar(v, m_atual, 300, 30, 'vida maior (sintetico)', false, ver + 1);
  if (r->>'versao')::int <> ver + 2 or (select versao from public.patrimonio_bens where id = v) <> ver + 2
     or (select count(*) from public.patrimonio_bem_parametros where bem_id = v) <> 2
     or (select count(*) from public.patrimonio_bem_trilha where bem_id = v and acao = 'mudanca_estimativa') <> 1 then
    raise exception 'E2: %', r;
  end if;

  -- E3
  r := public.fn_patrimonio_parametros_mudar(v, m_atual, 300, 30, 'igual (sintetico)', true, ver + 2);
  if (r->>'sem_efeito')::boolean is not true or r->>'aviso' is distinct from 'Esta mudança não altera nenhum mês da depreciação.' then
    raise exception 'E3: %', r;
  end if;
end $t$;

-- C5
do $c5$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  r jsonb; v_form uuid; v_ter uuid;
begin
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz,
         'categoria_id', (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'veiculos'),
         'descricao', 'Caminhao em formacao 01c', 'situacao', 'em_formacao', 'atividade', 'compartilhado'), false);
  v_form := (r->>'id')::uuid;
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz,
         'categoria_id', (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'terra'),
         'descricao', 'Terra sintetica 01c', 'situacao', 'em_uso', 'em_uso_desde', '2019-01-01', 'atividade', 'compartilhado',
         'origem_valor', 'sem_lancamento', 'valor_sem_lancamento', 1000000, 'area_ha', 500), false);
  v_ter := (r->>'id')::uuid;
  begin
    perform public.fn_patrimonio_parametros_corrigir(v_form, 1, 240, 30, 'x', true);
    raise exception 'C5: em formacao passou';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm not like 'Só o bem em uso corrige%' then raise exception 'C5 formacao: % %', sqlstate, sqlerrm; end if;
  end;
  begin
    perform public.fn_patrimonio_parametros_corrigir(v_ter, 1, 240, 30, 'x', true);
    raise exception 'C5: terra passou';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm <> 'Esta categoria não deprecia.' then raise exception 'C5 terra: % %', sqlstate, sqlerrm; end if;
  end;
end $c5$;
reset role;

-- T1 (como postgres)
do $t1$
begin
  begin
    insert into public.patrimonio_bem_trilha (cliente_id, bem_id, acao, antes, depois, motivo)
    values ('43f32d07-dba8-4670-900c-bf645440c04a', current_setting('teste.vei')::uuid, 'outra', '{}', '{}', 'x');
    raise exception 'T1: a trilha aceitou acao fora da lista';
  exception when check_violation then null;
  end;
end $t1$;

do $fim$ begin raise exception 'OK patr_01c (S1, E1–E3, C1–C5, T1)'; end $fim$;
rollback;
