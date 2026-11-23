-- FOLHA-01 · D-C6 (Gabriel 22/11/2026: "D-C6 = (a), num lote seguinte com ensaio") — o 13º escrito como "Folha … 13".
-- O QUE FAZ:
--   1. A regra do tipo (`_fn_folha_tipo`) passa a reconhecer como 13º a descrição que começa com "Folha" e tem o número 13 solto
--      ("Folha Pagamento - 13", "Folha Pagamento-13-3M", "Folha de Pagamento -1/2 (13)", "Folha de Pagamento (+13)"…), nunca uma data
--      ("Folha 13/10/2026": 13 seguido de / ou . e número não conta). Hoje casa 59 lançamentos (33 ligados): RRCC, Santa Rita, Vera, Raul.
--      Fica de fora o que não começa com "Folha" ("13 diárias peão" do NJ). O Histórico muda o tipo desses de Salário para 13º (por desenho).
--   2. O 13º SEM a parcela na descrição casa com a 1ª e com a 2ª parcela pela competência: na Folha do mês (fn_folha_mes, tipo 13_1/13_2)
--      e no recibo do contador (fn_folha_recibos_aplicar). Saem do mensal (o tipo deles deixou de ser Salário).
--   3. Pendência "sem recibo": esse 13º entra no grupo "13º" do mês.
--   As 3 funções são remendadas no lugar (a 118430 tem o corpo inteiro): cada troca é guardada pelo md5 da função antes e depois e pela
--   âncora casar UMA vez; qualquer diferença recusa e nada é gravado.
-- NÃO FAZ: não muda nenhum lançamento (descrição, valor, nada); só a leitura do tipo.
-- DESFAZER: recriar _fn_folha_tipo, fn_folha_mes, fn_folha_recibos_aplicar e fn_folha_pendencias da 118430 (o arquivo tem o corpo inteiro).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create or replace function public._fn_folha_tipo(p_descricao text, p_subcentro text)
returns text language sql immutable set search_path = public as $$
  select case
        when p_descricao ilike '13%sal%' or p_descricao ilike '%13º%' or p_descricao ilike '%décimo terceiro%'
             or p_descricao ~* '^\s*folha.*\m13\M(?!\s*[/.]\d)' then '13º'
        when p_subcentro ilike 'Rescisões e Acertos%' and p_descricao ilike '%multa%' then 'Multa rescisória'
        when p_subcentro ilike 'Rescisões e Acertos%' then 'Rescisão'
        when p_descricao ilike '%férias%' or p_descricao ilike '%ferias%' then 'Férias'
        when p_descricao ilike '%adiant%' then 'Adiantamento'
        when p_subcentro ilike 'Benefícios e Premiações%' then 'Benefício'
        when p_subcentro ilike 'Salários e Encargos%' or p_subcentro is null then 'Salário'
        else 'Outro' end
$$;
revoke all on function public._fn_folha_tipo(text, text) from public, anon, authenticated;

do $remendo$
declare
  r record; v_def text; v_novo text;
begin
  for r in select * from (values
    ('public.fn_folha_mes(uuid,text,text)', '4e663f00074c829f07c478340948afa6', 'ae931545388687e9e720a8943fe74641',
     $a$when '13_1' then l.descricao like '13º Salário 1ª Parcela%'$a$,
     $b$when '13_1' then (l.descricao like '13º Salário 1ª Parcela%' or (_fn_folha_tipo(l.descricao, pc.subcentro) = '13º' and l.descricao not like '13º Salário _ª Parcela%'))$b$,
     $a$when '13_2' then l.descricao like '13º Salário 2ª Parcela%'$a$,
     $b$when '13_2' then (l.descricao like '13º Salário 2ª Parcela%' or (_fn_folha_tipo(l.descricao, pc.subcentro) = '13º' and l.descricao not like '13º Salário _ª Parcela%'))$b$),
    ('public.fn_folha_recibos_aplicar(uuid,uuid,jsonb,jsonb,boolean)', '266983ee9adf345759f9a01afaa5af93', '6eb381a7accf1d2940e575876164e228',
     $a$when '13_1' then l2.descricao like '13º Salário 1ª Parcela%'$a$,
     $b$when '13_1' then (l2.descricao like '13º Salário 1ª Parcela%' or (_fn_folha_tipo(l2.descricao, pc.subcentro) = '13º' and l2.descricao not like '13º Salário _ª Parcela%'))$b$,
     $a$when '13_2' then l2.descricao like '13º Salário 2ª Parcela%'$a$,
     $b$when '13_2' then (l2.descricao like '13º Salário 2ª Parcela%' or (_fn_folha_tipo(l2.descricao, pc.subcentro) = '13º' and l2.descricao not like '13º Salário _ª Parcela%'))$b$),
    ('public.fn_folha_pendencias(uuid)', 'ba41d1e88b3948a5649f3e779217f1f3', '1502f0188c5ef318897535fb329dfced',
     $a$then l.descricao else 'salario' end grupo$a$,
     $b$then l.descricao when _fn_folha_tipo(l.descricao, pc2.subcentro) = '13º' then '13º' else 'salario' end grupo$b$,
     $a$or _fn_folha_tipo(l.descricao, pc2.subcentro) = 'Salário')),$a$,
     $b$or _fn_folha_tipo(l.descricao, pc2.subcentro) in ('Salário', '13º'))),$b$)
  ) x(fn, md5_antes, md5_depois, a1, b1, a2, b2) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if md5(v_def) <> r.md5_antes then raise exception 'D-C6: % não é a da 118430 (md5 %). Nada foi gravado.', r.fn, md5(v_def); end if;
    if (length(v_def) - length(replace(v_def, r.a1, ''))) / length(r.a1) <> 1 or (length(v_def) - length(replace(v_def, r.a2, ''))) / length(r.a2) <> 1 then
      raise exception 'D-C6: a âncora de % não casa uma vez só. Nada foi gravado.', r.fn;
    end if;
    v_novo := replace(replace(v_def, r.a1, r.b1), r.a2, r.b2);
    execute v_novo;
    if md5(pg_get_functiondef(r.fn::regprocedure)) <> r.md5_depois then
      raise exception 'D-C6: % depois do remendo tem md5 % (esperado %). Nada foi gravado.', r.fn, md5(pg_get_functiondef(r.fn::regprocedure)), r.md5_depois;
    end if;
  end loop;
end $remendo$;

-- chegada: a regra nova casa os moldes do 13º e não casa data nem diária
do $chegada$ begin
  if _fn_folha_tipo('Folha Pagamento - 13', 'Salários e Encargos Pecuária') <> '13º' or _fn_folha_tipo('Folha Pagamento-13-3M', null) <> '13º'
     or _fn_folha_tipo('Folha de Pagamento -1/2 (13)', null) <> '13º' or _fn_folha_tipo('Folha de Pagamento', 'Salários e Encargos Pecuária') <> 'Salário'
     or _fn_folha_tipo('Folha Pagamento 13/10/2026', 'Salários e Encargos Pecuária') <> 'Salário' or _fn_folha_tipo('13 diarias peão', 'Salários e Encargos Pecuária') <> 'Salário'
     or has_function_privilege('authenticated', 'public._fn_folha_tipo(text,text)', 'execute') then
    raise exception 'D-C6: a regra do tipo não confere. Nada foi gravado.';
  end if;
end $chegada$;
