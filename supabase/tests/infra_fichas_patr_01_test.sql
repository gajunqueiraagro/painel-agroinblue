-- INFRA-FICHAS-PATR-01 · teste da FICHA da infraestrutura e do bem criado a partir dela (20261028117100). Fixture SINTÉTICA no cliente
-- Teste (43f32d07, Fazenda Teste Cana c2498ace), gravada pelas próprias RPCs como o admin (7bd0b6ad); o usuário de FORA é a91962cd.
-- Roda como `postgres`, as chamadas como `authenticated` com as claims do usuário. TERMINA EM RAISE: nada fica no banco.
--   T0  catálogo: a coluna `ficha` (not null, default {}) e a trava; `fn_infra_criar_bem` SECURITY DEFINER com search_path fixo, sem
--       EXECUTE para PUBLIC/anon, com EXECUTE para authenticated; as 2 internas novas fechadas; o catálogo do banco tem EXATAMENTE as
--       chaves dos exemplos da tela (`src/lib/mapa/fichasDaInfra.exemplos.json`, copiados abaixo) — os 14 tipos
--   T1  as 14 fichas de exemplo passam na conferência
--   T2  criar cocho COM ficha: grava a ficha; a trilha 'criar' leva a ficha
--   T3  recusas da ficha com frase pronta (campo de outro tipo, texto vazio, número zero, inteiro quebrado, sim/não em texto, lados 3)
--   T4  editar só a ficha: a prévia lista 'ficha'; gravar sobe a versão; a trilha guarda só a ficha; sem ficha no p_infra, fica como está
--   T5  criar o bem: a prévia não grava nada (nem bem nem vínculo); gravar cria o bem na categoria do tipo, na fazenda da infra, com a
--       vida útil pedida, e liga a infra (versão +1, trilha com o bem)
--   T6  recusas do criar bem: versão velha (40001); já ligada (P0001); categoria que não existe (P0001); o Patrimônio recusa (sem
--       descrição) e NENHUM bem nasce
--   T7  o usuário de FORA: criar bem recusa com 42501
-- Mutações (ensaio de 01/11 noite, num só RAISE): M1 o escritor sem a conferência da ficha → T3 pega · M2 o criar bem sem o
-- tenant_ok → T7 pega · M4 um campo a mais no catálogo do banco → T0 pega.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- T0 catálogo ---------------------------------------------------------------------------------------------------------------------
do $t0$
declare
  ex constant jsonb := '{
    "cocho": { "material": "Concreto", "comprimento_m": 12, "lados": 2, "coberto": true, "uso": "Sal mineral" },
    "bebedouro": { "modelo": "Australiano", "material": "Concreto", "capacidade_l": 15000, "abastecimento": "Poço" },
    "saleiro": { "material": "Madeira", "coberto": true, "comprimento_m": 3.5 },
    "caixa_dagua": { "material": "Fibra", "capacidade_l": 20000, "elevada": true },
    "poco": { "modelo": "Semiartesiano", "profundidade_m": 80, "vazao_m3h": 6.5, "bomba": "Submersa 3 cv" },
    "represa_acude": { "finalidade": "Dessedentação do gado" },
    "curral": { "area_m2": 1800, "material": "Madeira", "divisoes": 6 },
    "tronco_brete": { "modelo": "Tronco de contenção", "material": "Metal" },
    "balanca": { "capacidade_kg": 2000, "marca_modelo": "Coimma BR 2000", "eletronica": true },
    "porteira": { "material": "Metal", "largura_m": 4 },
    "cerca": { "modelo": "Arame liso", "fios": 5, "mourao": "Eucalipto tratado" },
    "sede_casa": { "area_construida_m2": 220, "material": "Alvenaria" },
    "galpao": { "area_construida_m2": 600, "material": "Metálico" },
    "energia": { "modelo": "Transformador", "potencia_kva": 75 }
  }'::jsonb;
  t text; f text;
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fazenda_infraestruturas'
                 and column_name = 'ficha' and is_nullable = 'NO' and column_default like '''{}''::jsonb%') then
    raise exception 'T0: coluna ficha errada';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fazenda_infra_ficha_chk') then raise exception 'T0: sem a trava da ficha'; end if;
  f := 'public.fn_infra_criar_bem(uuid, integer, jsonb, boolean, text)';
  if not (select prosecdef from pg_proc where oid = f::regprocedure) then raise exception 'T0: criar bem não é SECURITY DEFINER'; end if;
  if not exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = f::regprocedure and c = 'search_path=pg_catalog, public') then
    raise exception 'T0: criar bem sem search_path fixo';
  end if;
  if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f::regprocedure and a.grantee = 0) then
    raise exception 'T0: EXECUTE errado no criar bem';
  end if;
  foreach f in array array['public._fn_infra_ficha_campos(text)', 'public._fn_infra_ficha_erro(text, jsonb)'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'T0: interna % aberta', f;
    end if;
  end loop;
  if (select count(*) from jsonb_object_keys(ex)) <> 14 then raise exception 'T0: esperados 14 tipos nos exemplos'; end if;
  for t in select jsonb_object_keys(ex) loop
    if (select array_agg(k order by k) from jsonb_object_keys(public._fn_infra_ficha_campos(t)) k)
       is distinct from (select array_agg(k order by k) from jsonb_object_keys(ex->t) k) then
      raise exception 'T0: catálogo do banco × exemplo da tela diferem em %', t;
    end if;
    -- T1 cada exemplo passa
    if public._fn_infra_ficha_erro(t, ex->t) is not null then raise exception 'T1: % recusou: %', t, public._fn_infra_ficha_erro(t, ex->t); end if;
  end loop;
end $t0$;

-- T2–T6 como o ADMIN ----------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $adm$
declare
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cocho_ficha constant jsonb := '{"material":"Concreto","comprimento_m":12,"lados":2,"coberto":true,"uso":"Sal mineral"}';
  r jsonb; v_cocho uuid; v_bem uuid; n_bens int; c record; v_ok boolean;
begin
  -- T2 criar com ficha
  r := public.fn_infra_salvar(jsonb_build_object('fazenda_id', c_faz, 'tipo', 'cocho', 'nome', 'Cocho sintético fichas',
         'geometria', '{"type":"Point","coordinates":[-47.0,-20.0]}'::jsonb, 'ficha', c_cocho_ficha), false);
  v_cocho := (r->>'id')::uuid;
  if (select ficha from public.fazenda_infraestruturas where id = v_cocho) <> c_cocho_ficha then raise exception 'T2: ficha gravada errada'; end if;
  if (select depois->'ficha' from public.fazenda_infraestrutura_trilha where infra_id = v_cocho and acao = 'criar') <> c_cocho_ficha then
    raise exception 'T2: a trilha não levou a ficha';
  end if;

  -- T3 recusas da ficha
  for c in select * from (values
      ('{"capacidade_l":100}', 'O campo "capacidade_l" não é da ficha de Cocho.'),
      ('{"material":" "}', 'O campo "material" da ficha precisa de um texto (até 80 letras).'),
      ('{"comprimento_m":0}', 'O campo "comprimento_m" da ficha precisa de um número maior que zero.'),
      ('{"coberto":"sim"}', 'O campo "coberto" da ficha é sim ou não.'),
      ('{"lados":3}', 'Os lados de acesso do cocho são 1 ou 2.')
    ) t(ficha, msg) loop
    v_ok := false;
    begin
      perform public.fn_infra_salvar(jsonb_build_object('fazenda_id', c_faz, 'tipo', 'cocho',
        'geometria', '{"type":"Point","coordinates":[-47,-20]}'::jsonb, 'ficha', c.ficha::jsonb), true);
    exception when sqlstate 'P0001' then
      if sqlerrm <> c.msg then raise exception 'T3 (%): recusou com "%", esperado "%"', c.ficha, sqlerrm, c.msg; end if;
      v_ok := true;
    end;
    if not v_ok then raise exception 'T3 (%): não recusou', c.ficha; end if;
  end loop;
  v_ok := false;
  begin
    perform public.fn_infra_salvar(jsonb_build_object('fazenda_id', c_faz, 'tipo', 'curral',
      'geometria', '{"type":"Point","coordinates":[-47,-20]}'::jsonb, 'ficha', '{"divisoes":2.5}'::jsonb), true);
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'O campo "divisoes" da ficha precisa de um número inteiro (1 ou mais).' then raise exception 'T3 (inteiro): %', sqlerrm; end if;
    v_ok := true;
  end;
  if not v_ok then raise exception 'T3 (inteiro): não recusou'; end if;

  -- T4 editar só a ficha
  r := public.fn_infra_salvar(jsonb_build_object('id', v_cocho, 'versao', 1, 'ficha', c_cocho_ficha || '{"lados":1}'), true);
  if r->'muda' <> '["ficha"]'::jsonb then raise exception 'T4: prévia muda %', r->'muda'; end if;
  if (select ficha->>'lados' from public.fazenda_infraestruturas where id = v_cocho) <> '2' then raise exception 'T4: a prévia gravou'; end if;
  r := public.fn_infra_salvar(jsonb_build_object('id', v_cocho, 'versao', 1, 'ficha', c_cocho_ficha || '{"lados":1}'), false);
  if (r->>'versao')::int <> 2 then raise exception 'T4: versão %', r; end if;
  if (select array_agg(k) from public.fazenda_infraestrutura_trilha t, jsonb_object_keys(t.depois) k where t.infra_id = v_cocho and t.acao = 'alterar')
     <> array['ficha'] then
    raise exception 'T4: a trilha guardou mais que a ficha';
  end if;
  r := public.fn_infra_salvar(jsonb_build_object('id', v_cocho, 'versao', 2, 'nome', 'Cocho sintético fichas 2'), false);
  if (select ficha->>'lados' from public.fazenda_infraestruturas where id = v_cocho) <> '1' then raise exception 'T4: sem ficha no p_infra apagou a ficha'; end if;

  -- T5 criar o bem
  select count(*) into n_bens from public.patrimonio_bens where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a';
  r := public.fn_infra_criar_bem(v_cocho, 3, jsonb_build_object('categoria_codigo', 'instalacoes', 'descricao', 'Cocho de concreto coberto · 12 m',
         'em_uso_desde', '2024-03-15', 'atividade', 'pecuaria', 'vida_util_meses', 240, 'residual_pct', 0), true);
  if not (r->>'simulado')::boolean or r->'bem'->'categoria'->>'codigo' <> 'instalacoes' or (r->'bem'->>'vida_util_meses')::int <> 240 then
    raise exception 'T5: prévia errada %', r;
  end if;
  if (select count(*) from public.patrimonio_bens where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a') <> n_bens
     or (select bem_id from public.fazenda_infraestruturas where id = v_cocho) is not null then
    raise exception 'T5: a prévia gravou';
  end if;
  r := public.fn_infra_criar_bem(v_cocho, 3, jsonb_build_object('categoria_codigo', 'instalacoes', 'descricao', 'Cocho de concreto coberto · 12 m',
         'em_uso_desde', '2024-03-15', 'atividade', 'pecuaria', 'vida_util_meses', 240, 'residual_pct', 0, 'fazenda_id', gen_random_uuid()), false);
  v_bem := (r->>'bem_id')::uuid;
  if (r->>'versao')::int <> 4 or r->>'codigo' is null then raise exception 'T5: retorno %', r; end if;
  if not exists (select 1 from public.patrimonio_bens b join public.patrimonio_categorias k on k.id = b.categoria_id
                 where b.id = v_bem and b.fazenda_id = c_faz and k.codigo = 'instalacoes' and b.descricao = 'Cocho de concreto coberto · 12 m'
                 and b.situacao = 'em_uso' and b.atividade = 'pecuaria') then
    raise exception 'T5: bem gravado errado (fazenda do p_bem tem de ser ignorada)';
  end if;
  if (select vida_util_meses from public.patrimonio_bem_parametros where bem_id = v_bem order by vigente_desde desc limit 1) <> 240 then
    raise exception 'T5: vida útil';
  end if;
  if (select bem_id from public.fazenda_infraestruturas where id = v_cocho) <> v_bem then raise exception 'T5: não ligou'; end if;
  if not exists (select 1 from public.fazenda_infraestrutura_trilha where infra_id = v_cocho and acao = 'alterar'
                 and depois->>'bem_id' = v_bem::text and motivo like 'criou o bem %') then
    raise exception 'T5: trilha do vínculo';
  end if;

  -- T6 recusas do criar bem
  for c in select * from (values
      (3, '{"categoria_codigo":"instalacoes","descricao":"x","em_uso_desde":"2024-01-01","atividade":"pecuaria"}', '40001',
       'Esta infraestrutura foi alterada por outra pessoa. Feche e abra de novo.'),
      (4, '{"categoria_codigo":"instalacoes","descricao":"x","em_uso_desde":"2024-01-01","atividade":"pecuaria"}', 'P0001',
       'Esta infraestrutura já está ligada a um bem do Patrimônio: troque pelo "Ligar a um bem existente".')
    ) t(versao, bem, estado, msg) loop
    v_ok := false;
    begin
      perform public.fn_infra_criar_bem(v_cocho, c.versao, c.bem::jsonb, false);
    exception when others then
      if sqlstate <> c.estado or sqlerrm <> c.msg then raise exception 'T6: % "%", esperado % "%"', sqlstate, sqlerrm, c.estado, c.msg; end if;
      v_ok := true;
    end;
    if not v_ok then raise exception 'T6: não recusou (%)', c.msg; end if;
  end loop;
  -- uma infra nova, sem bem: categoria inexistente e o Patrimônio recusando (sem descrição) — nenhum bem nasce
  r := public.fn_infra_salvar(jsonb_build_object('fazenda_id', c_faz, 'tipo', 'poco', 'geometria', '{"type":"Point","coordinates":[-47.0,-20.0]}'::jsonb), false);
  select count(*) into n_bens from public.patrimonio_bens where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a';
  for c in select * from (values
      ('{"categoria_codigo":"piscinas","descricao":"x","em_uso_desde":"2024-01-01","atividade":"pecuaria"}', 'A categoria do Patrimônio deste tipo não foi encontrada.'),
      ('{"categoria_codigo":"rede_agua","em_uso_desde":"2024-01-01","atividade":"pecuaria"}', 'Informe a descrição do bem.')
    ) t(bem, msg) loop
    v_ok := false;
    begin
      perform public.fn_infra_criar_bem((r->>'id')::uuid, 1, c.bem::jsonb, false);
    exception when sqlstate 'P0001' then
      if sqlerrm <> c.msg then raise exception 'T6: recusou com "%", esperado "%"', sqlerrm, c.msg; end if;
      v_ok := true;
    end;
    if not v_ok then raise exception 'T6: não recusou (%)', c.msg; end if;
  end loop;
  if (select count(*) from public.patrimonio_bens where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a') <> n_bens then
    raise exception 'T6: um bem nasceu numa recusa';
  end if;
  perform set_config('teste.infra_fichas', v_cocho::text, true);
end $adm$;
reset role;

-- T7 o usuário de FORA ---------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
set local role authenticated;
do $t7$
declare v_ok boolean := false;
begin
  if public.is_admin_agroinblue(auth.uid()) or coalesce(public.tenant_ok('43f32d07-dba8-4670-900c-bf645440c04a'), false) then
    raise exception 'T7: o usuário a91962cd tem acesso ao Teste — o teste não prova nada';
  end if;
  begin
    perform public.fn_infra_criar_bem(current_setting('teste.infra_fichas')::uuid, 4, '{"categoria_codigo":"instalacoes","descricao":"x"}'::jsonb, true);
  exception when sqlstate '42501' then v_ok := true;
  end;
  if not v_ok then raise exception 'T7: o de fora não recebeu 42501'; end if;
end $t7$;

reset role;
do $fim$ begin raise exception 'OK INFRA-FICHAS-PATR-01: T0–T7 passaram (nada fica no banco)'; end $fim$;
