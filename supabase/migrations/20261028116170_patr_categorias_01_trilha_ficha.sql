-- PATR-CATEGORIAS-01 · 116170 — a troca de categoria PELA FICHA do bem passa a gravar trilha (Gabriel 03/11 12:21: "a mudança de
-- categoria pela ficha do bem passa a gravar trilha").
-- Por quê: o E-05 (semeadeira elétrica, NJ) foi de "Equipamentos e informática" para Implementos em 01/11 pela ficha e não sobrou
-- registro de quem nem quando — a `fn_patrimonio_bem_salvar` só registrava a correção do "em uso desde".
-- O QUE MUDA: depois do UPDATE do bem, se a categoria mudou, uma linha 'troca_categoria' na `patrimonio_bem_trilha` (antes/depois com
-- código e nome, autor = quem está logado). O motivo é o `p_motivo` do salvar quando vier; sem ele, "troca de categoria pela ficha do
-- bem" (a ficha não pede motivo para trocar a categoria, e a trilha exige motivo não vazio). Nada mais no corpo muda.
-- PATCH GUARDADO POR MD5 (o molde do 116100): o corpo de partida é o do 116080 com as 2 recusas 40001 → P0001 do 116100
-- (md5 0e38da13…); a âncora (o `if v_corrige` depois do UPDATE) tem de aparecer uma vez; o corpo final é conferido por md5.

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $patch$
declare
  f constant regprocedure := 'public.fn_patrimonio_bem_salvar(jsonb,boolean,text)'::regprocedure;
  anc constant text := $a$  if v_corrige then
    v_acum_depois := coalesce($a$;
  novo constant text := $b$  if o.categoria_id <> n.categoria_id then
    insert into public.patrimonio_bem_trilha (cliente_id, bem_id, acao, antes, depois, motivo, por)
    values (o.cliente_id, o.id, 'troca_categoria',
            (select jsonb_build_object('categoria', x.codigo, 'nome', x.nome) from public.patrimonio_categorias x where x.id = o.categoria_id),
            jsonb_build_object('categoria', c.codigo, 'nome', c.nome),
            coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'troca de categoria pela ficha do bem'), auth.uid());
  end if;
$b$;
  d text; n int;
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = f) is distinct from '0e38da13d7e8ca0aca45dc2cf5291911' then
    raise exception '116170: o corpo da fn_patrimonio_bem_salvar nao e'' o conferido (md5 %)', (select md5(p.prosrc) from pg_proc p where p.oid = f);
  end if;
  d := pg_get_functiondef(f);
  n := (length(d) - length(replace(d, anc, ''))) / length(anc);
  if n <> 1 then raise exception '116170: esperava a ancora 1 vez, achei %', n; end if;
  execute replace(d, anc, novo || anc);
  if (select md5(p.prosrc) from pg_proc p where p.oid = f) is distinct from 'f1ae74704657d6202494195a9ad5b90f' then
    raise exception '116170: o patch nao ficou como esperado (md5 %)', (select md5(p.prosrc) from pg_proc p where p.oid = f);
  end if;
end $patch$;
