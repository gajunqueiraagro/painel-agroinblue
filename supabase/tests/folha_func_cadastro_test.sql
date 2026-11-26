-- FOLHA-FUNC-CADASTRO-01 (118720) — a ficha completa do funcionário. Roda como postgres DEPOIS da migration; termina em RAISE 'OK…'.
-- Fixture SINTÉTICA no cliente Teste (43f32d07): nomes e números INVENTADOS. Usuário = um admin real (as claims).
-- C1 criar com os campos novos grava todos · C2 editar SEM as chaves novas mantém o gravado · C3 fazenda do registro de outro cliente =
-- recusa 42501 · C4 valor fora da lista (sexo) = recusa · C5 novo sem "dia útil" = false · C6 o favorecido pelo gravador de campo:
-- banco/agência/conta/tipo/titular/celular/e-mail — a prévia não grava, gravar muda e deixa 1 linha de trilha · C7 campo fora da lista segue recusado.
-- Mutações (voltam conferidas por md5): MF1 o gravar sem o sexo → C1 · MF2 o gravador do favorecido sem 'banco' → C6.

create or replace function pg_temp.checa_cad() returns text[] language plpgsql as $c$
declare
  f text[] := '{}'; T constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; ADM uuid; faz uuid; faz_outro uuid; fa uuid; fv uuid; r jsonb; v text; n int;
begin
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select id into faz from fazendas where cliente_id = T limit 1;
  select id into faz_outro from fazendas where cliente_id <> T limit 1;
  if ADM is null or faz is null or faz_outro is null then return f || 'FIXTURE'::text; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  -- C1
  r := fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Valdomiro Cadastro Sint', 'sexo', 'M', 'estado_civil', 'casado', 'dependentes', 2,
         'jornada', '44h', 'fazenda_registro_id', faz, 'experiencia_ate', '2026-12-20', 'rg', '1.234.567 SSP/XX', 'cnh_categoria', 'd',
         'cnh_validade', '2029-03-31', 'contato_emergencia', 'Fulana · (00) 9 0000-0000', 'dia_pagamento', 5, 'dia_pagamento_util', true), false);
  fa := (r->>'id')::uuid;
  select concat_ws('|', sexo, estado_civil, dependentes, jornada, fazenda_registro_id = faz, experiencia_ate, rg, cnh_categoria, cnh_validade, contato_emergencia, dia_pagamento, dia_pagamento_util)
    into v from folha_funcionarios where id = fa;
  if v is distinct from 'M|casado|2|44h|t|2026-12-20|1.234.567 SSP/XX|D|2029-03-31|Fulana · (00) 9 0000-0000|5|t' then f := f || ('C1 ' || coalesce(v, '∅')); end if;

  -- C2
  perform fn_folha_funcionario_gravar(T, jsonb_build_object('id', fa, 'nome', 'Valdomiro Cadastro Sint', 'cargo', 'Tratorista'), false);
  select concat_ws('|', sexo, estado_civil, dependentes, jornada, rg, cnh_categoria, dia_pagamento, dia_pagamento_util, cargo) into v from folha_funcionarios where id = fa;
  if v is distinct from 'M|casado|2|44h|1.234.567 SSP/XX|D|5|t|Tratorista' then f := f || ('C2 ' || coalesce(v, '∅')); end if;

  -- C3
  begin
    perform fn_folha_funcionario_gravar(T, jsonb_build_object('id', fa, 'nome', 'Valdomiro Cadastro Sint', 'fazenda_registro_id', faz_outro), false);
    f := f || 'C3 gravou'::text;
  exception when sqlstate '42501' then null;
  end;

  -- C4
  begin
    perform fn_folha_funcionario_gravar(T, jsonb_build_object('id', fa, 'nome', 'Valdomiro Cadastro Sint', 'sexo', 'X'), false);
    f := f || 'C4 gravou'::text;
  exception when check_violation then null;
  end;

  -- C5
  r := fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Wanderlei Semdia Sint'), false);
  if (select dia_pagamento_util from folha_funcionarios where id = (r->>'id')::uuid) is distinct from false then f := f || 'C5'::text; end if;

  -- C6
  insert into financeiro_fornecedores (cliente_id, nome) values (T, 'Valdomiro Cadastro Sint') returning id into fv;
  r := fn_fornecedor_atualizar_campos(fv, jsonb_build_object('banco', '000 Banco Sint', 'agencia', '0001', 'conta', '12345-6', 'tipo_conta', 'Salário',
         'nome_favorecido', 'Valdomiro Cadastro Sint', 'cpf_cnpj_pagamento', '00000000191', 'celular', '(00) 9 0000-0001', 'email', 'sint@exemplo.invalid'), 'tela', 'folha-ficha', true);
  if (select banco from financeiro_fornecedores where id = fv) is not null or not (r->'campos' ? 'banco') then f := f || ('C6 prévia ' || coalesce(r::text, '∅')); end if;
  perform fn_fornecedor_atualizar_campos(fv, jsonb_build_object('banco', '000 Banco Sint', 'agencia', '0001', 'conta', '12345-6', 'tipo_conta', 'Salário',
         'nome_favorecido', 'Valdomiro Cadastro Sint', 'cpf_cnpj_pagamento', '00000000191', 'celular', '(00) 9 0000-0001', 'email', 'sint@exemplo.invalid'), 'tela', 'folha-ficha', false);
  select concat_ws('|', banco, agencia, conta, tipo_conta, cpf_cnpj_pagamento, celular, email) into v from financeiro_fornecedores where id = fv;
  select count(*) into n from fornecedor_campos_alteracoes where fornecedor_id = fv;
  if v is distinct from '000 Banco Sint|0001|12345-6|Salário|00000000191|(00) 9 0000-0001|sint@exemplo.invalid' or n <> 1 then f := f || ('C6 ' || coalesce(v, '∅') || ' trilha ' || n); end if;

  -- C7
  begin
    perform fn_fornecedor_atualizar_campos(fv, jsonb_build_object('observacao', 'x'), 'tela', 'folha-ficha', false);
    f := f || 'C7 gravou'::text;
  exception when sqlstate '22023' then null;
  end;
  return f;
end $c$;

do $t$
declare f text[] := pg_temp.checa_cad();
begin
  if cardinality(f) > 0 then raise exception 'FALHOU FOLHA-FUNC-CADASTRO-01: %', f; end if;
  raise exception 'OK FOLHA-FUNC-CADASTRO-01';
end $t$;
