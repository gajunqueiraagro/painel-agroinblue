-- FOLHA-ADMISSAO-01 (Gabriel 25/11/2026 08:05) — a ADMISSÃO é a fonte única da data da contratação. Bug: "a atualizar: salário"
-- seguia com o salário gravado (a marca é coluna gravada e só saía pelo Salvar do Cadastro, e só para CPF/cargo/admissão).
--   (1) fn_folha_salario_gravar: gravou um salário → sai a marca 'salario' de `a_atualizar`.
--   (2) fn_folha_funcionario_gravar: (a) com salário gravado, a marca 'salario' não volta pelo pedido; (b) a admissão MUDOU (inclusive
--       de vazia para uma data) → a 1ª linha de salário e a 1ª vigência da atuação acompanham (trilha 'acompanhar a admissão'); a admissão
--       que cai no 2º salário ou na 2ª atuação, ou depois, é recusada (ajustar a linha antes); a prévia (`p_simular`) diz o que acompanha.
--   (3) Os de hoje com salário gravado e a marca 'salario' (NJ e Vera; 9, 12 e 20 nas medições de 25/11 — o número cresce enquanto o
--       Gabriel grava salários pela tela, por isso a trava é "só NJ/Vera e nenhum sobra", não um número): a marca sai, com trilha, autor = o Gabriel.
-- A data do salário e da atuação grava como digitada (medido 25/11: 17/03/2019 e 09/02/2027 gravam exatos) — o "01/11/2026" era a TELA.
-- Corpo grande: patch guardado por md5 (as âncoras casam 1 vez cada). DESFAZER: recriar as duas funções com o texto de antes (o md5
-- guardado aqui) e devolver a marca pela trilha (folha_trilha, via FOLHA-ADMISSAO-01).

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $m$
declare
  s text := pg_get_functiondef('public.fn_folha_salario_gravar(uuid,date,numeric,numeric,text,boolean)'::regprocedure);
  g text := pg_get_functiondef('public.fn_folha_funcionario_gravar(uuid,jsonb,boolean)'::regprocedure);
  s1 constant text := $p$  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_id);
$p$;
  s1n constant text := $p$  -- FOLHA-ADMISSAO-01: gravou um salário → sai a marca "a atualizar: salário"
  if p_salario is not null then
    update folha_funcionarios set a_atualizar = array_remove(a_atualizar, 'salario') where id = f.id and 'salario' = any(a_atualizar);
  end if;
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_id);
$p$;
  g1 constant text := $p$  v_outro text;
$p$;
  g1n constant text := $p$  v_outro text;
  -- FOLHA-ADMISSAO-01
  v_sal1_id uuid; v_sal1 date; v_sal2 date; v_atu1 date; v_atu2 date; v_itens jsonb; v_acompanha jsonb := '{}'::jsonb;
$p$;
  g2 constant text := $p$  v_novo.a_atualizar := coalesce(array(select jsonb_array_elements_text(p_dados->'a_atualizar')), '{}');
$p$;
  g2n constant text := $p$  v_novo.a_atualizar := coalesce(array(select jsonb_array_elements_text(p_dados->'a_atualizar')), '{}');
  -- FOLHA-ADMISSAO-01: com salário gravado, a marca 'salario' não volta pelo pedido
  if v_id is not null and exists (select 1 from folha_funcionario_salarios where funcionario_id = v_id) then
    v_novo.a_atualizar := array_remove(v_novo.a_atualizar, 'salario');
  end if;
$p$;
  g3 constant text := $p$  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'novo', v_id is null, 'antes', to_jsonb(v_antes), 'depois', to_jsonb(v_novo));
$p$;
  g3n constant text := $p$  -- FOLHA-ADMISSAO-01: a admissão é a fonte da 1ª linha de salário e da 1ª vigência da atuação; mudou → elas acompanham
  if v_id is not null and v_novo.admissao is not null and v_novo.admissao is distinct from v_antes.admissao then
    select id, desde into v_sal1_id, v_sal1 from folha_funcionario_salarios where funcionario_id = v_id order by desde limit 1;
    select min(desde) into v_sal2 from folha_funcionario_salarios where funcionario_id = v_id and desde > v_sal1;
    if v_sal1_id is not null and v_sal1 <> v_novo.admissao then
      if v_sal2 is not null and v_novo.admissao >= v_sal2 then
        raise exception 'A admissão (%) cai no 2º salário (desde %) ou depois: ajuste o salário antes.',
          to_char(v_novo.admissao, 'DD/MM/YYYY'), to_char(v_sal2, 'DD/MM/YYYY') using errcode = 'P0001';
      end if;
      v_acompanha := v_acompanha || jsonb_build_object('salario', jsonb_build_object('de', v_sal1, 'para', v_novo.admissao));
    end if;
    select min(desde) into v_atu1 from folha_funcionario_atuacao where funcionario_id = v_id;
    select min(desde) into v_atu2 from folha_funcionario_atuacao where funcionario_id = v_id and desde > v_atu1;
    if v_atu1 is not null and v_atu1 <> v_novo.admissao then
      if v_atu2 is not null and v_novo.admissao >= v_atu2 then
        raise exception 'A admissão (%) cai na 2ª atuação (desde %) ou depois: ajuste a atuação antes.',
          to_char(v_novo.admissao, 'DD/MM/YYYY'), to_char(v_atu2, 'DD/MM/YYYY') using errcode = 'P0001';
      end if;
      v_acompanha := v_acompanha || jsonb_build_object('atuacao', jsonb_build_object('de', v_atu1, 'para', v_novo.admissao));
    end if;
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'novo', v_id is null, 'antes', to_jsonb(v_antes), 'depois', to_jsonb(v_novo),
      'acompanha', v_acompanha);
$p$;
  g4 constant text := $p$  perform _fn_folha_trilha(p_cliente, 'folha_funcionarios', v_novo.id, case when v_id is null then 'criar' else 'editar' end,
$p$;
  g4n constant text := $p$  if v_acompanha ? 'salario' then
    update folha_funcionario_salarios set desde = v_novo.admissao where id = v_sal1_id;
    perform _fn_folha_trilha(p_cliente, 'folha_funcionario_salarios', v_sal1_id, 'acompanhar a admissão', jsonb_build_object('desde', v_sal1),
      jsonb_build_object('desde', v_novo.admissao), 'a admissão mudou');
  end if;
  if v_acompanha ? 'atuacao' then
    select coalesce(jsonb_agg(jsonb_build_object('fazenda_id', fazenda_id, 'atividade', atividade, 'pct', pct) order by fazenda_id, atividade), '[]')
      into v_itens from folha_funcionario_atuacao where funcionario_id = v_id and desde = v_atu1;
    update folha_funcionario_atuacao set desde = v_novo.admissao where funcionario_id = v_id and desde = v_atu1;
    perform _fn_folha_trilha(p_cliente, 'folha_funcionario_atuacao', v_id, 'acompanhar a admissão', jsonb_build_object('desde', v_atu1, 'itens', v_itens),
      jsonb_build_object('desde', v_novo.admissao, 'itens', v_itens), 'a admissão mudou');
  end if;
  perform _fn_folha_trilha(p_cliente, 'folha_funcionarios', v_novo.id, case when v_id is null then 'criar' else 'editar' end,
$p$;
begin
  if md5(s) <> '8047f0954f45040d920d4a11a45b9a6d' or md5(g) <> 'ba983538f64eceb415355b595a238b51' then
    raise exception 'FOLHA-ADMISSAO-01: as funções de hoje não são as medidas (md5): nada gravado.';
  end if;
  if (length(s) - length(replace(s, s1, ''))) / length(s1) <> 1 or (length(g) - length(replace(g, g1, ''))) / length(g1) <> 1
     or (length(g) - length(replace(g, g2, ''))) / length(g2) <> 1 or (length(g) - length(replace(g, g3, ''))) / length(g3) <> 1
     or (length(g) - length(replace(g, g4, ''))) / length(g4) <> 1 then
    raise exception 'FOLHA-ADMISSAO-01: uma âncora não casa 1 vez: nada gravado.';
  end if;
  execute replace(s, s1, s1n);
  execute replace(replace(replace(replace(g, g1, g1n), g2, g2n), g3, g3n), g4, g4n);
end $m$;

do $dados$
declare
  c_autor constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  r record; v_n int := 0;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_autor, 'role', 'authenticated')::text, true);
  perform set_config('app.via', 'FOLHA-ADMISSAO-01', true);
  for r in
    select f.id, f.cliente_id, f.a_atualizar from folha_funcionarios f
     where 'salario' = any(f.a_atualizar) and exists (select 1 from folha_funcionario_salarios s where s.funcionario_id = f.id)
  loop
    if r.cliente_id not in ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890') then raise exception 'FOLHA-ADMISSAO-01: funcionário fora do medido (%): nada gravado.', r.id; end if;
    update folha_funcionarios set a_atualizar = array_remove(a_atualizar, 'salario') where id = r.id and cliente_id = r.cliente_id;
    perform _fn_folha_trilha(r.cliente_id, 'folha_funcionarios', r.id, 'editar', jsonb_build_object('a_atualizar', r.a_atualizar),
      jsonb_build_object('a_atualizar', array_remove(r.a_atualizar, 'salario')), 'o salário já está gravado');
    v_n := v_n + 1;
  end loop;
  perform set_config('app.via', '', true);
  if v_n = 0 then raise exception 'FOLHA-ADMISSAO-01: nenhum funcionário com a marca (o medido era 20): nada gravado.'; end if;
  if exists (select 1 from folha_funcionarios f where 'salario' = any(f.a_atualizar)
              and exists (select 1 from folha_funcionario_salarios s where s.funcionario_id = f.id)) then
    raise exception 'FOLHA-ADMISSAO-01: ainda há marca "salário" com salário gravado: nada gravado.';
  end if;
end $dados$;
