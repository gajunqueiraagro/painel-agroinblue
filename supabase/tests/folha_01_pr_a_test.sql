-- FOLHA-01 PR A · teste (roda como postgres DEPOIS da 118370; termina em RAISE 'OK…'; nada fica no banco). Fixture no cliente Teste
-- (43f32d07) com nomes e números INVENTADOS (nunca dado de funcionário real). O usuário L é real, sem acesso ao Teste, e ganha uma
-- filiação SINTÉTICA dentro da transação. As RPCs leem auth.uid() das claims; a RLS se prova com `set local role authenticated`.
do $t$
declare
  T uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ADM uuid; L uuid; FZ uuid; FV uuid;
  fa uuid; fb uuid; fc uuid; fo uuid; d1 uuid; r jsonb; ok boolean; n int;
  CPF_A constant text := '529.982.247-25';   -- CPF de exemplo (válido no dígito, de ninguém)
begin
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select m.user_id into L from cliente_membros m where m.ativo and m.perfil <> 'admin_agroinblue' and m.cliente_id <> T
     and not exists (select 1 from cliente_membros a where a.user_id = m.user_id and (a.perfil = 'admin_agroinblue' or a.cliente_id = T)) order by m.user_id limit 1;
  select id into FZ from fazendas where cliente_id = T order by id limit 1;
  select id into FV from financeiro_fornecedores where cliente_id = T order by id limit 1;
  if ADM is null or L is null or FZ is null or FV is null then raise exception 'sem fixture para o teste'; end if;
  insert into cliente_membros (user_id, cliente_id, perfil, ativo) values (L, T, 'financeiro', true);
  perform set_config('test.L', L::text, true);

  -- T1 acesso: membro SEM a marca não grava; só o admin marca; "por fora" só depois da folha
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_funcionario_gravar(T, '{"nome":"Fulano Teste"}', false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T1a (sem marca gravou)'; end if;
  ok := false; begin perform fn_folha_acesso_gravar(T, L, 'folha', true, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T1b (membro se marcou)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_acesso_gravar(T, L, 'folha_por_fora', true, false); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T1c (por fora sem a folha)'; end if;
  r := fn_folha_acesso_gravar(T, L, 'folha', true, true);
  if exists (select 1 from folha_acessos where user_id = L) then raise exception 'T1d (a prévia gravou)'; end if;
  perform fn_folha_acesso_gravar(T, L, 'folha', true, false);

  -- T2 funcionário: CPF inválido recusa; prévia não grava; CPF repetido recusa com o nome
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_funcionario_gravar(T, '{"nome":"Fulano Teste","cpf":"111.111.111-12"}', false); exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T2a (CPF inválido gravou)'; end if;
  r := fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Fulano Teste', 'cpf', CPF_A), true);
  if exists (select 1 from folha_funcionarios where cliente_id = T) then raise exception 'T2b (a prévia gravou)'; end if;
  fa := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Fulano Teste', 'cpf', CPF_A, 'codigo_contador', '1', 'admissao', '2025-12-15',
          'favorecido_id', FV, 'a_atualizar', jsonb_build_array('cbo')), false)->>'id')::uuid;
  if (select cpf from folha_funcionarios where id = fa) <> '52998224725' then raise exception 'T2c (CPF não normalizado)'; end if;
  ok := false; begin perform fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Outro', 'cpf', CPF_A), false); exception when sqlstate 'P0001' then ok := position('Fulano Teste' in sqlerrm) > 0; end;
  if not ok then raise exception 'T2d (CPF repetido)'; end if;
  fb := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Beltrano Rateio', 'empregador_registro', 'Outro Empregador Teste'), false)->>'id')::uuid;
  fc := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Cicrano Sem Salario'), false)->>'id')::uuid;

  -- T3 salário e atuação: parte 50% (F5); atuação que não soma 100 recusa
  perform fn_folha_salario_gravar(fa, '2026-01-01', 3500, null, 'admissão', false);
  perform fn_folha_salario_gravar(fb, '2026-01-01', 2000, 50, 'rateio 50%', false);
  ok := false; begin perform fn_folha_atuacao_gravar(fa, '2026-01-01', jsonb_build_array(jsonb_build_object('fazenda_id', FZ, 'atividade', 'pecuaria', 'pct', 90)), false);
  exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T3a (atuação 90%% gravou)'; end if;
  perform fn_folha_atuacao_gravar(fa, '2026-01-01', jsonb_build_array(jsonb_build_object('fazenda_id', FZ, 'atividade', 'pecuaria', 'pct', 70),
                                                                     jsonb_build_object('fazenda_id', FZ, 'atividade', 'agricultura', 'pct', 30)), false);
  if (select sum(pct) from folha_funcionario_atuacao where funcionario_id = fa) <> 100 then raise exception 'T3b'; end if;

  -- T4 a folha prevista nasce do cadastro: A 3.500, B 1.000 (50%), C sem salário (aviso)
  r := fn_folha_prever(T, '2026-10', true);
  if exists (select 1 from folha_folhas where cliente_id = T) or jsonb_array_length(r->'previstas') <> 2 or jsonb_array_length(r->'sem_salario') <> 1 then raise exception 'T4a %', r; end if;
  r := fn_folha_prever(T, '2026-10', false);
  fo := (r->>'folha_id')::uuid;
  if (select bruto from folha_pessoas where folha_id = fo and funcionario_id = fb) <> 1000 or (select count(*) from folha_pessoas where folha_id = fo) <> 2 then raise exception 'T4b %', r; end if;

  -- T5 documento: caminho no cliente; o mesmo arquivo (md5) recusa
  r := fn_folha_documento_registrar(T, fo, null, 'holerite', 'recibos-10.pdf', 'pdf', 'application/pdf', 1000, repeat('a', 32), null);
  d1 := (r->>'id')::uuid;
  if r->>'storage_path' not like T::text || '/folha/2026-10/%.pdf' then raise exception 'T5a %', r; end if;
  ok := false; begin perform fn_folha_documento_registrar(T, fo, null, 'holerite', 'de novo.pdf', 'pdf', null, null, repeat('a', 32), null); exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T5b (arquivo repetido)'; end if;

  -- T6 CONFERÊNCIA: líquido que não fecha e rubricas que não somam recusam com o nome; A pelo documento → B segue previsto (prevista) e
  --    "ativos fora do documento" traz B e C
  ok := false; begin perform fn_folha_pessoas_gravar(fo, jsonb_build_array(jsonb_build_object('funcionario_id', fa, 'bruto', 3500.62, 'descontos', 308.62, 'liquido', 3191.00)), 'documento', d1, false);
  exception when sqlstate 'P0001' then ok := position('Fulano Teste' in sqlerrm) > 0; end;
  if not ok then raise exception 'T6a (líquido que não fecha gravou)'; end if;
  ok := false; begin perform fn_folha_pessoas_gravar(fo, jsonb_build_array(jsonb_build_object('funcionario_id', fa, 'bruto', 3500.62, 'descontos', 308.62, 'liquido', 3192.00,
      'rubricas', jsonb_build_array(jsonb_build_object('codigo', '5', 'descricao', 'Salário', 'natureza', 'provento', 'valor', 3500),
                                    jsonb_build_object('codigo', '9101', 'descricao', 'INSS', 'natureza', 'desconto', 'valor', 308.58)))), 'documento', d1, false);
  exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T6b (rubricas que não somam gravaram)'; end if;
  r := fn_folha_pessoas_gravar(fo, jsonb_build_array(jsonb_build_object('funcionario_id', fa, 'bruto', 3500.62, 'descontos', 308.62, 'liquido', 3192.00,
      'base_inss', 3500, 'base_fgts', 3500, 'valor_fgts', 280, 'base_irrf', 2892.80,
      'rubricas', jsonb_build_array(jsonb_build_object('codigo', '5', 'descricao', 'Salário', 'natureza', 'provento', 'referencia', 30, 'valor', 3500),
                                    jsonb_build_object('codigo', '9002', 'descricao', 'Arredondamento', 'natureza', 'provento', 'valor', 0.62),
                                    jsonb_build_object('codigo', '9003', 'descricao', 'Arredondamento', 'natureza', 'desconto', 'valor', 0.04),
                                    jsonb_build_object('codigo', '9101', 'descricao', 'INSS', 'natureza', 'desconto', 'valor', 308.58)))), 'documento', d1, false);
  if r->>'situacao' <> 'prevista' or jsonb_array_length(r->'ativos_fora_do_documento') <> 2 or jsonb_array_length(r->'diferencas') <> 1
     or (select count(*) from folha_rubricas fr join folha_pessoas p on p.id = fr.folha_pessoa_id where p.folha_id = fo) <> 4 then raise exception 'T6c %', r; end if;

  -- T7 confirmar com previsto sobrando recusa; B à mão → conferida? (não: à mão não confere) → B pelo documento → conferida → confirmar
  ok := false; begin perform fn_folha_confirmar(fo, false); exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T7a (confirmou com previsto)'; end if;
  r := fn_folha_pessoas_gravar(fo, jsonb_build_array(jsonb_build_object('funcionario_id', fb, 'bruto', 1000, 'descontos', 0, 'liquido', 1000)), 'documento', d1, false);
  if r->>'situacao' <> 'conferida' then raise exception 'T7b %', r; end if;
  perform fn_folha_confirmar(fo, false);
  ok := false; begin perform fn_folha_pessoas_gravar(fo, jsonb_build_array(jsonb_build_object('funcionario_id', fb, 'bruto', 1, 'descontos', 0, 'liquido', 1)), 'manual', null, false);
  exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T7c (mudou folha confirmada)'; end if;
  ok := false; begin perform fn_folha_reabrir(fo, '', false); exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T7d (reabriu sem motivo)'; end if;
  r := fn_folha_reabrir(fo, 'teste', false);
  if r->>'situacao' <> 'conferida' then raise exception 'T7e %', r; end if;

  -- T8 guia: a composição tem de somar o total
  ok := false; begin perform fn_folha_guia_gravar(fo, jsonb_build_object('tipo', 'inss_darf', 'competencia', '2026-10', 'vencimento', '2026-11-19', 'valor', 1013.23,
      'composicao', jsonb_build_array(jsonb_build_object('codigo', '1082', 'valor', 991.14), jsonb_build_object('codigo', '1176', 'valor', 22.00))), false);
  exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T8a (composição errada gravou)'; end if;
  perform fn_folha_guia_gravar(fo, jsonb_build_object('tipo', 'inss_darf', 'competencia', '2026-10', 'vencimento', '2026-11-19', 'valor', 1013.23, 'documento_id', d1,
      'composicao', jsonb_build_array(jsonb_build_object('codigo', '1082', 'valor', 991.14), jsonb_build_object('codigo', '1176', 'valor', 22.09))), false);

  -- T9 por fora: sem a marca própria recusa; com ela grava
  ok := false; begin perform fn_folha_por_fora_gravar(fo, fa, 'prêmio', 500, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T9a (por fora sem marca)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  perform fn_folha_acesso_gravar(T, L, 'folha_por_fora', true, false);
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  perform fn_folha_por_fora_gravar(fo, fa, 'prêmio', 500, false);

  -- T10 desligar sem data recusa; desligado em 10/2026 some da prevista de 12/2026; reativar desfaz
  ok := false; begin perform fn_folha_funcionario_desligar(fc, null, 'x', false); exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'T10a'; end if;
  perform fn_folha_funcionario_desligar(fb, '2026-10-31', 'fim do rateio (teste)', false);
  r := fn_folha_prever(T, '2026-12', true);
  if exists (select 1 from jsonb_array_elements(r->'previstas') x where (x->>'funcionario_id')::uuid = fb) then raise exception 'T10b %', r; end if;
  perform fn_folha_funcionario_reativar(fb, 'desfazer (teste)', false);
  if (select situacao from folha_funcionarios where id = fb) <> 'ativo' then raise exception 'T10c'; end if;

  -- T11 a trilha: tem o autor; não se altera
  if (select count(*) from folha_trilha where cliente_id = T and usuario_id = L) < 10 then raise exception 'T11a'; end if;
  ok := false; begin update folha_trilha set motivo = 'x' where cliente_id = T; exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T11b (trilha alterada)'; end if;

  -- T12 nascem fechadas: anon não executa nenhuma fn_folha_*, authenticated executa; guarda do só leitura nas 12
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'fn\_folha\_%'
               and (has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute'))) then raise exception 'T12a'; end if;
  if exists (select 1 from pg_proc p where p.proname like '\_fn\_folha\_%' and has_function_privilege('authenticated', p.oid, 'execute')) then raise exception 'T12b'; end if;
  if (select count(*) from pg_trigger where tgname = 'trg_leitura_nao_grava' and tgrelid::regclass::text like 'folha\_%') <> 12 then raise exception 'T12c'; end if;
  if exists (select 1 from information_schema.table_privileges where table_schema = 'public' and table_name like 'folha\_%'
               and grantee in ('authenticated', 'anon') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) then raise exception 'T12d'; end if;
end $t$;

-- T13 RLS como authenticated (L com as 2 marcas vê; sem a folha não vê nada, nem o por fora; a lista de acessos segue visível)
set local role authenticated;
do $r$ begin
  if (select count(*) from folha_funcionarios) <> 3 or (select count(*) from folha_por_fora) <> 1 or (select count(*) from folha_pessoas) <> 2 then
    raise exception 'T13a (com a marca não viu)';
  end if;
end $r$;
reset role;
do $d$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1), 'role', 'authenticated')::text, true);
  perform fn_folha_acesso_gravar('43f32d07-dba8-4670-900c-bf645440c04a', current_setting('test.L')::uuid, 'folha', false, false);
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.L'), 'role', 'authenticated')::text, true);
end $d$;
set local role authenticated;
do $r2$ begin
  if (select count(*) from folha_funcionarios) <> 0 or (select count(*) from folha_por_fora) <> 0 or (select count(*) from folha_trilha) <> 0
     or (select count(*) from folha_documentos) <> 0 then raise exception 'T13b (sem a marca viu)'; end if;
  if (select count(*) from folha_acessos where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a') < 2 then raise exception 'T13c'; end if;
  raise exception 'OK FOLHA-01 PR A: T1–T13 (nada gravado)';
end $r2$;
