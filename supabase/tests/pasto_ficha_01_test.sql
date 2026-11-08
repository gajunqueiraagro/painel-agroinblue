-- PASTO-FICHA-01 · teste do PR A (20261028117230). Roda DEPOIS da migration (no ensaio, na mesma transação). Fixture sintético no cliente
-- Teste (43f32d07 · Fazenda Teste Cana c2498ace); admin = 7bd0b6ad; "de fora" = a91962cd (sem vínculo com o Teste). As chamadas rodam como
-- `authenticated` com as claims do usuário. TERMINA EM RAISE: nada fica no banco.
--   T0  objetos: as 7 funções públicas fechadas (anon sem EXECUTE, authenticated com); as internas sem EXECUTE para authenticated;
--       a trava do catálogo aceita as 5 listas novas; a semeadura (31 forrageiras, 5 relevos, 5 texturas, 4 drenagens, 5 sombras), com trilha
--   T1  fn_pasto_criar: a prévia não grava; o real cria o pasto com a ficha e a área NASCE com vigência desde o "em uso desde" (origem cadastro)
--   T2  fn_pasto_criar recusa: sem nome · área 0 · mês futuro · mês fechado da fazenda (foto da área) · nome repetido na fazenda
--   T3  fn_pasto_ficha_salvar: a prévia lista o antes × depois com o nome do item e NÃO grava; o real grava, sobe a versão e deixa trilha
--       (audit_log 'editou' com o motivo); sem mudança = sem_mudanca
--   T4  fn_pasto_ficha_salvar recusa: a área (vai pela vigência) · campo desconhecido · item de outra lista · item de outro cliente ·
--       principal = secundária · fim antes do início · versão velha (40001)
--   T5  a gravação DIRETA dos campos da ficha (UPDATE e INSERT) não passa; a de nome continua (o renomear do Fechamento)
--   T6  avaliação: criar (prévia não grava) · corrigir pede motivo · desfazer (nada se apaga; cancelada sai da "última") · recusas
--       (data futura, nada preenchido, valor fora da régua)
--   T7  leitores: fn_pasto_ficha (área oficial, cadastro × mapa, última avaliação) · fn_pasto_lotacao_meses (12 linhas; suporte da época) ·
--       fn_pasto_reformas (vazio sem ligação)
--   T8  o usuário de fora: 42501 em todas as públicas
set local lock_timeout = '2s';
set local statement_timeout = '25s';

do $t0$
declare n int; f text;
begin
  foreach f in array array['fn_pasto_ficha_salvar', 'fn_pasto_criar', 'fn_pasto_avaliacao_salvar', 'fn_pasto_avaliacao_desfazer', 'fn_pasto_ficha',
                           'fn_pasto_reformas', 'fn_pasto_lotacao_meses'] loop
    select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f and p.prosecdef
       and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
    if n <> 1 then raise exception 'T0: % não está fechada como devia', f; end if;
  end loop;
  foreach f in array array['_fn_pasto_ficha_item_ok', '_fn_pasto_ficha_mes', '_fn_pasto_ficha_aplicar', '_fn_pasto_ficha_diferencas',
                           '_fn_pastos_ficha_so_pelo_escritor'] loop
    select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f
       and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
    if n <> 1 then raise exception 'T0: a interna % está aberta', f; end if;
  end loop;
  select count(*) into n from public.catalogo_itens where cliente_id is null and ativo and lista = 'forrageira';
  if n <> 31 then raise exception 'T0: % forrageiras semeadas (esperado 31)', n; end if;
  select count(*) into n from public.catalogo_itens where cliente_id is null and ativo and lista in ('relevo', 'textura_solo', 'sombra');
  if n <> 15 then raise exception 'T0: relevo+textura+sombra = % (esperado 15)', n; end if;
  select count(*) into n from public.catalogo_itens where cliente_id is null and ativo and lista = 'drenagem';
  if n <> 4 then raise exception 'T0: % drenagens (esperado 4)', n; end if;
  select count(*) into n from public.catalogo_itens i where i.lista <> 'motivo_morte'
     and not exists (select 1 from public.catalogo_itens_trilha t where t.item_id = i.id and t.acao = 'criar');
  if n <> 0 then raise exception 'T0: % itens semeados sem trilha', n; end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.pastos'::regclass and tgname = 'trg_pastos_ficha_so_pelo_escritor') <> 1 then
    raise exception 'T0: falta a trava da ficha em pastos';
  end if;
end $t0$;

-- fixture: um item de forrageira de OUTRO cliente (para a recusa) — como postgres
insert into public.catalogo_itens (id, lista, cliente_id, grupo, nome, nome_busca, ordem, ativo)
select '0b5e0000-0000-4000-8000-0000000f0001', 'forrageira', c.id, 'Do cliente', 'Capim de outro cliente', 'capim de outro cliente', 1000, true
  from public.clientes c where c.id <> '43f32d07-dba8-4670-900c-bf645440c04a' order by c.id limit 1;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;

do $t1$
declare r jsonb; v_id uuid; n int; v_mar uuid; v_mom uuid; v_pla uuid;
  v_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_am_ant text := to_char((date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '1 month')::date, 'YYYY-MM');
begin
  select id into v_mar from public.catalogo_itens where lista = 'forrageira' and cliente_id is null and nome = 'Marandu (braquiarão)';
  select id into v_mom from public.catalogo_itens where lista = 'forrageira' and cliente_id is null and nome = 'Mombaça';
  select id into v_pla from public.catalogo_itens where lista = 'relevo' and cliente_id is null and nome = 'Plano (0–3%)';
  perform set_config('teste.mar', v_mar::text, true); perform set_config('teste.mom', v_mom::text, true);
  perform set_config('teste.pla', v_pla::text, true);

  -- T1 · prévia
  select count(*) into n from public.pastos where fazenda_id = v_faz;
  r := public.fn_pasto_criar(v_faz, jsonb_build_object('nome', 'Pasto Ficha Teste', 'tipo_uso', 'recria', 'mes_inicio', v_am_ant,
         'posse', 'propria', 'forrageira_principal_id', v_mar, 'relevo_id', v_pla, 'manejo', 'continuo'), 72.8, true);
  if not (r->>'simulado')::boolean or (r->>'area_ha')::numeric <> 72.8 or (r->>'vigente_desde') <> v_am_ant || '-01' then
    raise exception 'T1: prévia errada %', r;
  end if;
  if (select count(*) from public.pastos where fazenda_id = v_faz) <> n then raise exception 'T1: a prévia gravou'; end if;
  -- T1 · real
  r := public.fn_pasto_criar(v_faz, jsonb_build_object('nome', 'Pasto Ficha Teste', 'tipo_uso', 'recria', 'mes_inicio', v_am_ant,
         'posse', 'propria', 'forrageira_principal_id', v_mar, 'relevo_id', v_pla, 'manejo', 'continuo'), 72.8, false);
  v_id := (r->>'pasto_id')::uuid;
  perform set_config('teste.pasto', v_id::text, true);
  if not exists (select 1 from public.pastos p where p.id = v_id and p.posse = 'propria' and p.forrageira_principal_id = v_mar
                    and p.relevo_id = v_pla and p.manejo = 'continuo' and p.area_produtiva_ha = 72.8 and p.ficha_versao = 1
                    and p.data_inicio = (v_am_ant || '-01')::date and p.cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a') then
    raise exception 'T1: o pasto não nasceu com a ficha';
  end if;
  if not exists (select 1 from public.pasto_area_vigencias v where v.pasto_id = v_id and v.desfeita_em is null and v.area_ha = 72.8
                    and v.origem = 'cadastro' and v.vigente_desde = (v_am_ant || '-01')::date) then
    raise exception 'T1: a área não nasceu com vigência desde o "em uso desde"';
  end if;
  if public.fn_pasto_area_no_mes(v_id, v_am_ant) is distinct from 72.8 then raise exception 'T1: a área do mês não é a do cadastro'; end if;

  -- T2 · recusas do criar
  begin perform public.fn_pasto_criar(v_faz, jsonb_build_object('tipo_uso', 'recria', 'mes_inicio', v_am_ant), 10, true);
        raise exception 'T2: criou sem nome'; exception when sqlstate 'P0001' then if sqlerrm <> 'Digite o nome do pasto.' then raise; end if; end;
  begin perform public.fn_pasto_criar(v_faz, jsonb_build_object('nome', 'X1', 'tipo_uso', 'recria', 'mes_inicio', v_am_ant), 0, true);
        raise exception 'T2: criou com área 0'; exception when sqlstate 'P0001' then if sqlerrm not like 'A área do pasto%' then raise; end if; end;
  begin perform public.fn_pasto_criar(v_faz, jsonb_build_object('nome', 'X2', 'tipo_uso', 'recria', 'mes_inicio', '2099-01'), 10, true);
        raise exception 'T2: criou no futuro'; exception when sqlstate 'P0001' then if sqlerrm not like 'Em uso desde: o mês não pode%' then raise; end if; end;
  begin perform public.fn_pasto_criar(v_faz, jsonb_build_object('nome', 'pasto ficha TESTE', 'tipo_uso', 'recria', 'mes_inicio', v_am_ant), 10, true);
        raise exception 'T2: criou com nome repetido'; exception when sqlstate 'P0001' then if sqlerrm not like 'Já existe um pasto ativo%' then raise; end if; end;
end $t1$;

-- T2 · mês fechado: a foto da área da fazenda em 01/2026 (como postgres)
reset role;
insert into public.fechamento_area_snapshot (cliente_id, fazenda_id, ano_mes, area_produtiva_ha)
values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '2026-01-01', 100);
set local role authenticated;
do $t2b$
begin
  perform public.fn_pasto_criar('c2498ace-8478-410c-a697-d3f2e2934d1f', jsonb_build_object('nome', 'X3', 'tipo_uso', 'recria', 'mes_inicio', '2025-12'), 10, true);
  raise exception 'T2: criou começando num mês fechado';
exception when sqlstate 'P0001' then
  if sqlerrm not like 'O pasto novo não pode começar em 12/2025: a área de 01/2026 da fazenda já foi oficializada%' then raise; end if;
end $t2b$;

do $t3$
declare r jsonb; v_id uuid := current_setting('teste.pasto')::uuid; n int; v_mom uuid := current_setting('teste.mom')::uuid;
  v_mar uuid := current_setting('teste.mar')::uuid; v_outro uuid := '0b5e0000-0000-4000-8000-0000000f0001';
begin
  -- T3 · prévia
  r := public.fn_pasto_ficha_salvar(v_id, 1, jsonb_build_object('forrageira_principal_id', v_mom, 'posse', 'arrendada_de_terceiro',
         'sombra_cobertura', 'parcial'), 'conferido em campo', true);
  if not (r->>'simulado')::boolean or jsonb_array_length(r->'muda') <> 3 then raise exception 'T3: prévia errada %', r; end if;
  if not exists (select 1 from jsonb_array_elements(r->'muda') m where m->>'campo' = 'forrageira_principal_id'
                    and m->>'antes_nome' = 'Marandu (braquiarão)' and m->>'depois_nome' = 'Mombaça') then
    raise exception 'T3: a prévia não diz o nome do item %', r;
  end if;
  if (select forrageira_principal_id from public.pastos where id = v_id) <> v_mar then raise exception 'T3: a prévia gravou'; end if;
  -- T3 · real
  r := public.fn_pasto_ficha_salvar(v_id, 1, jsonb_build_object('forrageira_principal_id', v_mom, 'posse', 'arrendada_de_terceiro',
         'sombra_cobertura', 'parcial'), 'conferido em campo', false);
  if (r->>'versao')::int <> 2 then raise exception 'T3: a versão não subiu %', r; end if;
  if not exists (select 1 from public.pastos where id = v_id and forrageira_principal_id = v_mom and posse = 'arrendada_de_terceiro'
                    and sombra_cobertura = 'parcial' and ficha_versao = 2) then raise exception 'T3: não gravou'; end if;
  select count(*) into n from public.audit_log a where a.registro_id = v_id and a.acao = 'editou' and a.resumo = 'motivo: conferido em campo';
  if n <> 1 then raise exception 'T3: trilha da ficha = % (esperado 1)', n; end if;
  r := public.fn_pasto_ficha_salvar(v_id, 2, jsonb_build_object('posse', 'arrendada_de_terceiro'), null, false);
  if not (r->>'sem_mudanca')::boolean then raise exception 'T3: sem mudança gravou %', r; end if;

  -- T4 · recusas
  begin perform public.fn_pasto_ficha_salvar(v_id, 2, '{"area_produtiva_ha": 66.3}', null, true); raise exception 'T4: aceitou a área';
  exception when sqlstate 'P0001' then if sqlerrm not like 'A área muda só pela área com vigência%' then raise; end if; end;
  begin perform public.fn_pasto_ficha_salvar(v_id, 2, '{"capim": "x"}', null, true); raise exception 'T4: aceitou campo desconhecido';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Campo desconhecido na ficha: capim%' then raise; end if; end;
  begin perform public.fn_pasto_ficha_salvar(v_id, 2, jsonb_build_object('relevo_id', v_mar), null, true); raise exception 'T4: aceitou item de outra lista';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Uma das opções escolhidas não está na lista%' then raise; end if; end;
  begin perform public.fn_pasto_ficha_salvar(v_id, 2, jsonb_build_object('forrageira_secundaria_id', v_outro), null, true);
        raise exception 'T4: aceitou item de outro cliente';
  exception when sqlstate 'P0001' then if sqlerrm not like 'A forrageira escolhida não está na lista%' then raise; end if; end;
  begin perform public.fn_pasto_ficha_salvar(v_id, 2, jsonb_build_object('forrageira_secundaria_id', v_mom), null, true);
        raise exception 'T4: aceitou principal = secundária';
  exception when sqlstate 'P0001' then if sqlerrm not like 'A forrageira secundária tem de ser outra%' then raise; end if; end;
  begin perform public.fn_pasto_ficha_salvar(v_id, 2, '{"mes_fim": "2020-01"}', null, true); raise exception 'T4: aceitou fim antes do início';
  exception when sqlstate 'P0001' then if sqlerrm not like 'O "encerrado em" não pode ser antes%' then raise; end if; end;
  begin perform public.fn_pasto_ficha_salvar(v_id, 1, '{"manejo": "rotacionado"}', null, false); raise exception 'T4: aceitou versão velha';
  exception when sqlstate '40001' then null; end;

  -- T5 · gravação direta
  begin update public.pastos set posse = 'propria' where id = v_id; raise exception 'T5: UPDATE direto da ficha passou';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Os dados da ficha do pasto gravam só pela ficha%' then raise; end if; end;
  begin
    insert into public.pastos (fazenda_id, cliente_id, nome, manejo) values ('c2498ace-8478-410c-a697-d3f2e2934d1f',
      '43f32d07-dba8-4670-900c-bf645440c04a', 'Direto', 'continuo');
    raise exception 'T5: INSERT direto com a ficha passou';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Os dados da ficha do pasto gravam só pela ficha%' then raise; end if; end;
  update public.pastos set nome = 'Pasto Ficha Teste (renomeado)' where id = v_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T5: o renomear direto deixou de passar'; end if;
end $t3$;

do $t6$
declare r jsonb; v_id uuid := current_setting('teste.pasto')::uuid; v_av uuid; v_av2 uuid; n int;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  r := public.fn_pasto_avaliacao_salvar(v_id, jsonb_build_object('data', v_hoje - 40, 'cercas', 'bom', 'degradacao', 'leve',
         'cobertura_pct', 85, 'suporte_aguas_ua_ha', 1.6, 'suporte_seca_ua_ha', 0.9, 'avaliador', 'Gabriel'), null, null, true);
  if not (r->>'simulado')::boolean then raise exception 'T6: prévia errada'; end if;
  if exists (select 1 from public.pasto_condicoes where pasto_id = v_id) then raise exception 'T6: a prévia gravou'; end if;
  r := public.fn_pasto_avaliacao_salvar(v_id, jsonb_build_object('data', v_hoje - 40, 'cercas', 'bom', 'degradacao', 'leve',
         'cobertura_pct', 85, 'suporte_aguas_ua_ha', 1.6, 'suporte_seca_ua_ha', 0.9, 'avaliador', 'Gabriel'), null, null, false);
  v_av := (r->>'id')::uuid;
  r := public.fn_pasto_avaliacao_salvar(v_id, jsonb_build_object('data', v_hoje - 5, 'degradacao', 'moderada', 'suporte_aguas_ua_ha', 1.2,
         'suporte_seca_ua_ha', 0.5), null, null, false);
  v_av2 := (r->>'id')::uuid;
  perform set_config('teste.av2', v_av2::text, true);
  if not exists (select 1 from public.pasto_condicoes c where c.id = v_av and c.cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a'
                    and c.cercas = 'bom' and c.cobertura_pct = 85 and c.criado_por = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') then
    raise exception 'T6: a avaliação não gravou';
  end if;
  if (select count(*) from public.audit_log a where a.registro_id in (v_av, v_av2) and a.acao = 'criou') <> 2 then
    raise exception 'T6: sem trilha da avaliação';
  end if;
  begin perform public.fn_pasto_avaliacao_salvar(v_id, '{"degradacao": "forte"}', v_av, null, false); raise exception 'T6: corrigiu sem motivo';
  exception when sqlstate 'P0001' then if sqlerrm <> 'Informe o motivo da correção.' then raise; end if; end;
  perform public.fn_pasto_avaliacao_salvar(v_id, '{"degradacao": "forte"}', v_av, 'digitei errado', false);
  if (select degradacao from public.pasto_condicoes where id = v_av) <> 'forte' then raise exception 'T6: não corrigiu'; end if;
  begin perform public.fn_pasto_avaliacao_salvar(v_id, jsonb_build_object('data', v_hoje + 1, 'degradacao', 'sem'), null, null, true);
        raise exception 'T6: aceitou data futura';
  exception when sqlstate 'P0001' then if sqlerrm <> 'A data da avaliação não pode ser depois de hoje.' then raise; end if; end;
  begin perform public.fn_pasto_avaliacao_salvar(v_id, jsonb_build_object('data', v_hoje, 'avaliador', 'x'), null, null, true);
        raise exception 'T6: aceitou avaliação vazia';
  exception when sqlstate 'P0001' then if sqlerrm <> 'Preencha ao menos um item da avaliação.' then raise; end if; end;
  begin perform public.fn_pasto_avaliacao_salvar(v_id, jsonb_build_object('data', v_hoje, 'cupins', 'muito'), null, null, true);
        raise exception 'T6: aceitou valor fora da régua';
  exception when sqlstate 'P0001' then if sqlerrm <> 'Invasoras e cupins: baixo, médio ou alto.' then raise; end if; end;
  -- desfazer a mais recente: a "última" volta a ser a de 40 dias
  r := public.fn_pasto_avaliacao_desfazer(v_av2, 'avaliação lançada no pasto errado', true);
  if exists (select 1 from public.pasto_condicoes where id = v_av2 and cancelado) then raise exception 'T6: a prévia do desfazer gravou'; end if;
  perform public.fn_pasto_avaliacao_desfazer(v_av2, 'avaliação lançada no pasto errado', false);
  if not exists (select 1 from public.pasto_condicoes where id = v_av2 and cancelado and cancelado_motivo = 'avaliação lançada no pasto errado') then
    raise exception 'T6: não desfez (ou apagou)';
  end if;
  r := public.fn_pasto_ficha(v_id);
  if (r->'ultima_avaliacao'->>'id')::uuid is distinct from v_av then raise exception 'T6: a cancelada continua como a última %', r->'ultima_avaliacao'; end if;

  -- T7 · leitores
  if (r->'area'->>'oficial_ha')::numeric is distinct from 72.8 or (r->'nomes'->>'forrageira_principal') <> 'Mombaça'
     or (r->'pasto'->>'ficha_versao')::int <> 2 then
    raise exception 'T7: ficha errada %', r;
  end if;
  select count(*) into n from public.fn_pasto_lotacao_meses(v_id, null, 12);
  if n <> 12 then raise exception 'T7: lotação com % meses', n; end if;
  if (select l.suporte_ua_ha from public.fn_pasto_lotacao_meses(v_id, to_char(v_hoje, 'YYYY-MM'), 1) l)
     is distinct from (case when extract(month from v_hoje) between 5 and 10 then 0.9 else 1.6 end) then
    raise exception 'T7: o suporte do mês não é o da época';
  end if;
  if exists (select 1 from public.fn_pasto_reformas(v_id)) then raise exception 'T7: reforma sem ligação'; end if;
end $t6$;

-- T8 · o usuário de fora
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
do $t8$
declare v_id uuid := current_setting('teste.pasto')::uuid; c text; v_ok int := 0;
begin
  foreach c in array array[
    format('select public.fn_pasto_ficha_salvar(%L, 2, ''{"manejo":"rotacionado"}'', null, true)', v_id),
    format('select public.fn_pasto_criar(%L, ''{"nome":"Y","tipo_uso":"recria","mes_inicio":"2026-10"}'', 10, true)', 'c2498ace-8478-410c-a697-d3f2e2934d1f'),
    format('select public.fn_pasto_avaliacao_salvar(%L, ''{"data":"2026-10-01","degradacao":"sem"}'', null, null, true)', v_id),
    format('select public.fn_pasto_avaliacao_desfazer(%L, ''x'', true)', current_setting('teste.av2')),
    format('select public.fn_pasto_ficha(%L)', v_id),
    format('select * from public.fn_pasto_reformas(%L)', v_id),
    format('select * from public.fn_pasto_lotacao_meses(%L)', v_id)] loop
    begin execute c; raise exception 'T8: o de fora passou em %', c;
    exception when sqlstate '42501' then v_ok := v_ok + 1; end;
  end loop;
  if v_ok <> 7 then raise exception 'T8: % de 7 barradas', v_ok; end if;
end $t8$;

reset role;
do $fim$ begin raise exception 'OK PASTO-FICHA-01 (117230): T0–T8 passaram (nada fica no banco)'; end $fim$;
