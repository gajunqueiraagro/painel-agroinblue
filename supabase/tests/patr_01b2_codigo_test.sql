-- PATR-01 · PR B2 (116080) — o CODIGO do bem e os campos separados da identificacao. Fixture SINTETICA no cliente Teste (43f32d07) e
-- num cliente sintetico criado aqui; roda como `authenticated` (admin 7bd0b6ad) pelas RPCs e como `postgres` nas provas de tabela.
-- TERMINA EM RAISE: nada fica (nem o contador anda).
--   C1  as 13 categorias globais tem prefixo de 3 letras, todos diferentes; categoria do cliente sem prefixo herda o da global
--   C2  a previa do salvar nao gera codigo nem anda o contador
--   C3  bem novo recebe o proximo codigo do cliente + prefixo (MAQ-n, MAQ-n+1; IMP comeca no dele)
--   C4  trocar a categoria nao muda o codigo; UPDATE direto do codigo e' recusado pelo gatilho; codigo repetido no cliente: 23505
--   C5  outro cliente comeca do 001; depois do 999 vem o 1000 (nao corta)
--   C6  campos separados: gravam (placa/chassi em maiuscula, sem espaco); Placa/Renavam fora de Veiculos recusam; o campo antigo
--       `identificacao` e os 5 novos so' mudam quando vem no pedido (a tela de antes do B2 nao manda os novos; a nova nao manda o
--       antigo): sem a chave, mantem; com a chave vazia, limpa; a lista devolve os 6 campos
-- A concorrencia (dois salvamentos ao mesmo tempo nao repetem) se prova no ensaio com duas sessoes (ver o relatorio): uma sessao so'
-- nao a prova.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

do $c1$
begin
  if (select count(*) from public.patrimonio_categorias where cliente_id is null and prefixo ~ '^[A-Z]{3}$') is distinct from 13
     or (select count(distinct prefixo) from public.patrimonio_categorias where cliente_id is null) is distinct from 13 then
    raise exception 'C1: prefixos das globais';
  end if;
  if (select string_agg(prefixo, ' ' order by ordem) from public.patrimonio_categorias where cliente_id is null)
     is distinct from 'MAQ IMP VEI EQP BEN INS AGU CER EST PAS FOR COR TER' then
    raise exception 'C1: prefixos = %', (select string_agg(prefixo, ' ' order by ordem) from public.patrimonio_categorias where cliente_id is null);
  end if;
end $c1$;

-- um cliente sintetico (C5) e uma categoria propria do Teste sem prefixo (C1)
insert into public.clientes (id, nome) values ('b2b2b2b2-0000-4000-8000-000000000001', 'Cliente sintetico B2');
insert into public.patrimonio_categorias (cliente_id, codigo, nome, vida_util_anos, residual_pct, deprecia, tem_mercado, base_mercado, ordem)
values ('43f32d07-dba8-4670-900c-bf645440c04a', 'veiculos', 'Veículos (sintetica do cliente)', 5, 30, true, true, 'bem', 30),
       ('43f32d07-dba8-4670-900c-bf645440c04a', 'sintetica_bdois', 'Categoria sintetica B2', 5, 0, true, false, null, 999);
do $c1b$
begin
  if public._fn_patrimonio_prefixo((select id from public.patrimonio_categorias where cliente_id is not null and codigo = 'veiculos'
                                     and cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a')) is distinct from 'VEI' then
    raise exception 'C1: a categoria do cliente nao herdou o prefixo da global';
  end if;
  if public._fn_patrimonio_prefixo((select id from public.patrimonio_categorias where codigo = 'sintetica_bdois')) is distinct from 'BEM' then
    raise exception 'C1: categoria sem global nao caiu no BEM';
  end if;
end $c1b$;
create temp table b2_antes on commit drop as
  select prefixo, ultimo from public.patrimonio_codigo_contador where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a';
grant select on b2_antes to authenticated;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $c2$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cat_maq uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'maquinas');
  cat_imp uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'implementos');
  cat_vei uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'veiculos');
  n_maq int := coalesce((select ultimo from b2_antes where prefixo = 'MAQ'), 0);
  n_imp int := coalesce((select ultimo from b2_antes where prefixo = 'IMP'), 0);
  r jsonb; v1 uuid; v2 uuid; v3 uuid; v4 uuid; x record;
begin
  -- C2
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_maq,
         'descricao', 'Trator sintetico B2', 'situacao', 'em_uso', 'em_uso_desde', '2024-01-01', 'atividade', 'pecuaria'), true);
  if r ? 'codigo' is false or r->>'codigo' is not null then raise exception 'C2: a previa devolveu codigo %', r->>'codigo'; end if;
  -- C3
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_maq,
         'descricao', 'Trator sintetico B2', 'situacao', 'em_uso', 'em_uso_desde', '2024-01-01', 'atividade', 'pecuaria'), false);
  v1 := (r->>'id')::uuid;
  if r->>'codigo' is distinct from 'MAQ-' || lpad((n_maq + 1)::text, 3, '0') then
    raise exception 'C2/C3: o 1o trator recebeu % (esperado MAQ-%; a previa andou o contador?)', r->>'codigo', lpad((n_maq + 1)::text, 3, '0');
  end if;
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_maq,
         'descricao', 'Trator sintetico B2 dois', 'situacao', 'em_uso', 'em_uso_desde', '2024-01-01', 'atividade', 'pecuaria'), false);
  v2 := (r->>'id')::uuid;
  if r->>'codigo' is distinct from 'MAQ-' || lpad((n_maq + 2)::text, 3, '0') then raise exception 'C3: o 2o trator recebeu %', r->>'codigo'; end if;
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_imp,
         'descricao', 'Grade sintetica B2', 'situacao', 'em_formacao', 'atividade', 'lavoura'), false);
  v3 := (r->>'id')::uuid;
  if r->>'codigo' is distinct from 'IMP-' || lpad((n_imp + 1)::text, 3, '0') then raise exception 'C3: a grade recebeu %', r->>'codigo'; end if;
  -- C4 trocar a categoria (maquina → implemento, as duas depreciam)
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('id', v2, 'versao', (select versao from public.patrimonio_bens where id = v2),
         'fazenda_id', c_faz, 'categoria_id', cat_imp, 'descricao', 'Trator sintetico B2 dois', 'situacao', 'em_uso', 'em_uso_desde', '2024-01-01',
         'atividade', 'pecuaria'), false);
  if r->>'codigo' is distinct from 'MAQ-' || lpad((n_maq + 2)::text, 3, '0')
     or (select codigo from public.patrimonio_bens where id = v2) is distinct from 'MAQ-' || lpad((n_maq + 2)::text, 3, '0') then
    raise exception 'C4: trocar a categoria mudou o codigo para %', (select codigo from public.patrimonio_bens where id = v2);
  end if;
  -- C6 campos separados
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_vei,
         'descricao', 'Caminhonete sintetica B2', 'situacao', 'em_uso', 'em_uso_desde', '2024-01-01', 'atividade', 'compartilhado',
         'numero_proprio', ' V-03 ', 'placa', 'abc 1d23', 'chassi', '9bw zzz377vt004251', 'numero_serie', ' S-1 ', 'renavam', '0012 3456 789',
         'identificacao', 'campo antigo sintetico'), false);
  v4 := (r->>'id')::uuid;
  select * into x from public.fn_patrimonio_lista(c_cli, c_faz, null) where bem_id = v4;
  if x.codigo is distinct from r->>'codigo' or x.numero_proprio is distinct from 'V-03' or x.placa is distinct from 'ABC1D23'
     or x.chassi is distinct from '9BWZZZ377VT004251' or x.numero_serie is distinct from 'S-1' or x.renavam is distinct from '00123456789'
     or x.identificacao is distinct from 'campo antigo sintetico' then
    raise exception 'C6 lista: % % % % % % %', x.codigo, x.numero_proprio, x.placa, x.chassi, x.numero_serie, x.renavam, x.identificacao;
  end if;
  begin
    perform public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_maq,
      'descricao', 'Trator com placa', 'situacao', 'em_formacao', 'atividade', 'pecuaria', 'placa', 'ABC1D23'), true);
    raise exception 'C6: placa fora de Veiculos passou';
  exception when others then if sqlerrm not like 'Placa e Renavam são só de Veículos%' then raise exception 'C6 recusa errada: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_patrimonio_bem_salvar(jsonb_build_object('id', v4, 'versao', (select versao from public.patrimonio_bens where id = v4),
      'fazenda_id', c_faz, 'categoria_id', cat_maq, 'descricao', 'Caminhonete sintetica B2', 'situacao', 'em_uso', 'em_uso_desde', '2024-01-01',
      'atividade', 'compartilhado', 'placa', 'ABC1D23'), true);
    raise exception 'C6: trocou para Maquinas com placa';
  exception when others then if sqlerrm not like 'Placa e Renavam são só de Veículos%' then raise exception 'C6 recusa errada (troca): %', sqlerrm; end if;
  end;
  -- a tela nova nao manda `identificacao`: o salvar o mantem
  perform public.fn_patrimonio_bem_salvar(jsonb_build_object('id', v4, 'versao', (select versao from public.patrimonio_bens where id = v4),
    'fazenda_id', c_faz, 'categoria_id', cat_vei, 'descricao', 'Caminhonete sintetica B2', 'situacao', 'em_uso', 'em_uso_desde', '2024-01-01',
    'atividade', 'compartilhado', 'placa', 'ABC1D23', 'renavam', ''), false);
  if (select identificacao from public.patrimonio_bens where id = v4) is distinct from 'campo antigo sintetico'
     or (select chassi from public.patrimonio_bens where id = v4) is distinct from '9BWZZZ377VT004251'
     or (select renavam from public.patrimonio_bens where id = v4) is not null then
    raise exception 'C6: sem a chave, o campo nao se manteve (ou com a chave vazia nao foi limpo)';
  end if;
  perform set_config('teste.v1', v1::text, true);
end $c2$;
reset role;

-- C4 (tabela, como postgres): o gatilho e a unicidade
do $c4$
declare v1 uuid := current_setting('teste.v1')::uuid;
begin
  begin
    update public.patrimonio_bens set codigo = 'MAQ-999' where id = v1;
    raise exception 'C4: o codigo mudou por UPDATE direto';
  exception when others then if sqlerrm is distinct from 'O código do bem não muda.' then raise exception 'C4 recusa errada: %', sqlerrm; end if;
  end;
  begin
    insert into public.patrimonio_bens (cliente_id, fazenda_id, categoria_id, descricao, atividade, codigo)
    values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f',
            (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'cercas'), 'Repetido sintetico', 'pecuaria',
            (select codigo from public.patrimonio_bens where id = v1));
    raise exception 'C4: codigo repetido no cliente gravou';
  exception when unique_violation then null;
  end;
end $c4$;

-- C5 outro cliente comeca do 001; depois do 999 vem o 1000
do $c5$
declare c_b2 constant uuid := 'b2b2b2b2-0000-4000-8000-000000000001';
        cat_maq uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'maquinas');
        v text;
begin
  v := public._fn_patrimonio_proximo_codigo(c_b2, cat_maq);
  if v is distinct from 'MAQ-001' then raise exception 'C5: o outro cliente comecou em %', v; end if;
  update public.patrimonio_codigo_contador set ultimo = 998 where cliente_id = c_b2 and prefixo = 'MAQ';
  v := public._fn_patrimonio_proximo_codigo(c_b2, cat_maq);
  if v is distinct from 'MAQ-999' then raise exception 'C5: 999 = %', v; end if;
  v := public._fn_patrimonio_proximo_codigo(c_b2, cat_maq);
  if v is distinct from 'MAQ-1000' then raise exception 'C5: depois do 999 veio %', v; end if;
end $c5$;

do $fim$ begin raise exception 'OK patr_01b2 (C1–C6)'; end $fim$;
rollback;
