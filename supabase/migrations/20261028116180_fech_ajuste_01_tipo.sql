-- FECH-AJUSTE-INVENTARIO-01 · B1 — o tipo "Ajuste de inventário" (Gabriel 03/11/2026: A1 sim, dois tipos com sentido Sobra/Falta).
-- O que muda:
--   1. a CHECK de `lancamentos.tipo` aceita `ajuste_entrada` (sobra) e `ajuste_saida` (falta);
--   2. a validação por tipo: ajuste só no realizado (nunca meta), cabeças > 0 e PESO MÉDIO obrigatório (sem ele o motor move a cabeça
--      e não o peso — a mesma razão da reclassificação);
--   3. o estoque mensal (`_fn_zoot_categoria_mensal`, que alimenta o cache) e a sua cópia `vw_zoot_categoria_mensal` contam o ajuste como
--      entrada/saída EXTERNA: o saldo do sistema muda e o peso entra/sai junto, então GMD e @ produzida NÃO o contam.
-- O que NÃO muda: nenhum lançamento existe com o tipo novo (só a RPC do passo seguinte o cria), então nenhum número de hoje se altera.
-- Patch guardado por md5 (corpo de partida) e contagem das âncoras; a view mantém `security_invoker = true`.
-- Fica para depois (dívida declarada): colunas próprias `cab_ajuste_*` / `peso_ajuste_*` (mudam a assinatura da função, a view e o cache).

set lock_timeout = '2s';

-- 1. A CHECK do tipo
alter table public.lancamentos drop constraint lancamentos_tipo_check;
alter table public.lancamentos add constraint lancamentos_tipo_check check (tipo = any (array[
  'compra'::text, 'venda'::text, 'abate'::text, 'nascimento'::text, 'morte'::text, 'consumo'::text,
  'transferencia_entrada'::text, 'transferencia_saida'::text, 'reclassificacao'::text, 'saldo_inicial'::text,
  'ajuste_entrada'::text, 'ajuste_saida'::text])) not valid;
alter table public.lancamentos validate constraint lancamentos_tipo_check;

-- 2. A validação por tipo
do $$
declare
  v_def text := pg_get_functiondef('public.validate_lancamento_campos_por_tipo()'::regprocedure);
  a_meta constant text := E'  -- Skip validation for meta scenario (less strict)\n';
  a_rcl constant text := E'    WHEN ''reclassificacao'' THEN\n';
begin
  if md5(v_def) <> '7564e3cc2b23b85f7809382f7c786b97' then
    raise exception 'validate_lancamento_campos_por_tipo mudou no banco (md5 %); refazer o patch.', md5(v_def);
  end if;
  if (length(v_def) - length(replace(v_def, a_meta, ''))) / length(a_meta) <> 1
     or (length(v_def) - length(replace(v_def, a_rcl, ''))) / length(a_rcl) <> 1 then
    raise exception 'validate_lancamento_campos_por_tipo: âncora não casa exatamente 1 vez.';
  end if;
  v_def := replace(v_def, a_meta,
    E'  -- FECH-AJUSTE-INVENTARIO-01: o ajuste de inventário é só do realizado (META x REALIZADO).\n'
    || E'  IF NEW.tipo IN (''ajuste_entrada'', ''ajuste_saida'') AND NEW.cenario IS DISTINCT FROM ''realizado'' THEN\n'
    || E'    RAISE EXCEPTION ''Ajuste de inventário é só do realizado.'';\n'
    || E'  END IF;\n\n' || a_meta);
  v_def := replace(v_def, a_rcl,
    E'    WHEN ''ajuste_entrada'', ''ajuste_saida'' THEN\n'
    || E'      IF NEW.quantidade <= 0 THEN\n'
    || E'        RAISE EXCEPTION ''Ajuste de inventário deve ter quantidade > 0.'';\n'
    || E'      END IF;\n'
    || E'      IF coalesce(NEW.peso_medio_kg, 0) <= 0 THEN\n'
    || E'        RAISE EXCEPTION ''Ajuste de inventário deve informar o peso médio dos animais. Sem ele o motor do rebanho move a cabeça e não o peso.'';\n'
    || E'      END IF;\n\n' || a_rcl);
  execute v_def;
  if md5(pg_get_functiondef('public.validate_lancamento_campos_por_tipo()'::regprocedure)) <> '2bff544d21fc9d24ccc9dc9a02a572ba' then
    raise exception 'validate_lancamento_campos_por_tipo: md5 final inesperado.';
  end if;
end $$;

-- 3a. O estoque mensal (função do cache)
do $$
declare
  v_def text := pg_get_functiondef('public._fn_zoot_categoria_mensal(uuid,integer,text)'::regprocedure);
  a_ent constant text := $a$ARRAY['nascimento','compra','transferencia_entrada']$a$;
  a_sai constant text := $a$ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte']$a$;
begin
  if md5(v_def) <> '6e93079dbf525fb380f6821334a20431' then
    raise exception '_fn_zoot_categoria_mensal mudou no banco (md5 %); refazer o patch.', md5(v_def);
  end if;
  if (length(v_def) - length(replace(v_def, a_ent, ''))) / length(a_ent) <> 4
     or (length(v_def) - length(replace(v_def, a_sai, ''))) / length(a_sai) <> 4 then
    raise exception '_fn_zoot_categoria_mensal: as listas de entradas/saídas não aparecem 4 vezes cada.';
  end if;
  v_def := replace(v_def, a_ent, $a$ARRAY['nascimento','compra','transferencia_entrada','ajuste_entrada']$a$);
  v_def := replace(v_def, a_sai, $a$ARRAY['abate','venda','venda_pe','transferencia_saida','consumo','morte','ajuste_saida']$a$);
  execute v_def;
  if md5(pg_get_functiondef('public._fn_zoot_categoria_mensal(uuid,integer,text)'::regprocedure)) <> '262f68b10d5860b4aa5ce8a81ad1ae85' then
    raise exception '_fn_zoot_categoria_mensal: md5 final inesperado.';
  end if;
end $$;

-- 3b. A cópia em view (lida por 9 telas)
do $$
declare
  v_def text := pg_get_viewdef('public.vw_zoot_categoria_mensal'::regclass);
  a_ent constant text := $a$'nascimento'::text, 'compra'::text, 'transferencia_entrada'::text]$a$;
  a_sai constant text := $a$'transferencia_saida'::text, 'consumo'::text, 'morte'::text]$a$;
begin
  if md5(v_def) <> 'f89e9cc1ba7117f229427a310cee61ff' then
    raise exception 'vw_zoot_categoria_mensal mudou no banco (md5 %); refazer o patch.', md5(v_def);
  end if;
  if (length(v_def) - length(replace(v_def, a_ent, ''))) / length(a_ent) <> 4
     or (length(v_def) - length(replace(v_def, a_sai, ''))) / length(a_sai) <> 4 then
    raise exception 'vw_zoot_categoria_mensal: as listas de entradas/saídas não aparecem 4 vezes cada.';
  end if;
  v_def := replace(v_def, a_ent, $a$'nascimento'::text, 'compra'::text, 'transferencia_entrada'::text, 'ajuste_entrada'::text]$a$);
  v_def := replace(v_def, a_sai, $a$'transferencia_saida'::text, 'consumo'::text, 'morte'::text, 'ajuste_saida'::text]$a$);
  execute 'create or replace view public.vw_zoot_categoria_mensal with (security_invoker = true) as ' || v_def;
  if md5(pg_get_viewdef('public.vw_zoot_categoria_mensal'::regclass)) <> '4e11ec19f25cb78cf122eb3f90033bbc' then
    raise exception 'vw_zoot_categoria_mensal: md5 final inesperado.';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.vw_zoot_categoria_mensal'::regclass
                  and 'security_invoker=true' = any (reloptions)) then
    raise exception 'vw_zoot_categoria_mensal perdeu o security_invoker.';
  end if;
end $$;
