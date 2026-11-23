-- SEG-FAZENDA-ID-01 (SEG-AUDIT-02 R3, Gabriel 23/11/2026: "aprovado na ordem proposta") — 5 funções SECURITY DEFINER sem guarda de cliente.
-- O QUE FAZ:
--   1. FECHA ao usuário as 3 leituras de pasto/rebanho que recebiam só o id da fazenda e não conferiam o cliente:
--      fn_auditoria_consistencia_zoot (com a fazenda NULA devolvia as divergências de TODOS os clientes), fn_pastos_aplicaveis_mes e
--      fn_saldo_inicial_pasto. Nenhuma tem chamador na tela (git grep em src/ e supabase/functions/: só comentário). Quem as usa são
--      fn_materializar_conjunto_mes e fn_regenerar_area_do_mes — SECURITY DEFINER, com guarda própria, rodando como dono: seguem.
--      Só GRANT/REVOKE: nenhum corpo muda.
--   2. As 2 da conta corrente da OC (oc_lancar_pelo_modal, oc_programar_recebimento) recebiam só o id da operação e liam/travavam
--      (FOR UPDATE) a operação ANTES de qualquer guarda; a prévia da oc_lancar_pelo_modal devolvia dado da operação sem chamar
--      ninguém guardado. Ganham, como PRIMEIRA linha, a guarda da oc_criar_compromisso (service_role, admin, ou o cliente da operação
--      entre os do usuário; 42501). Operação inexistente: o não-admin recebe 42501 (não distingue "não existe" de "não é seu").
--      O corpo é remendado no lugar: md5 da função antes e depois + a âncora casando UMA vez; qualquer diferença recusa.
-- NÃO FAZ: não cria objeto, não muda dado, não muda nenhuma outra regra das 5.
-- DESFAZER: GRANT EXECUTE ... TO authenticated nas 3; nas 2 da OC, replace inverso (tirar o bloco "SEG-FAZENDA-ID-01").

set local lock_timeout = '2s';
set local statement_timeout = '60s';

revoke execute on function public.fn_auditoria_consistencia_zoot(uuid) from public, anon, authenticated;
revoke execute on function public.fn_pastos_aplicaveis_mes(uuid, text) from public, anon, authenticated;
revoke execute on function public.fn_saldo_inicial_pasto(uuid, integer, integer, text) from public, anon, authenticated;

do $remendo$
declare
  r record; v_def text; v_novo text;
  c_ancora constant text := E'BEGIN\n  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;';
  c_guarda constant text := E'BEGIN\n'
    || E'  -- SEG-FAZENDA-ID-01: a guarda da oc_criar_compromisso, ANTES de ler ou travar a operação\n'
    || E'  IF NOT coalesce(COALESCE(auth.role(), \'\') = \'service_role\' OR public.is_admin_agroinblue(auth.uid())\n'
    || E'      OR (SELECT o.cliente_id FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id)\n'
    || E'         IN (SELECT public.get_user_cliente_ids(auth.uid())), false) THEN\n'
    || E'    RAISE EXCEPTION \'Sem acesso a esta operação.\' USING ERRCODE = \'42501\';\n'
    || E'  END IF;\n'
    || E'  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;';
begin
  for r in select * from (values
    ('public.oc_lancar_pelo_modal(uuid,integer,text,text,uuid,uuid,jsonb,text,text,text,text,text,boolean)',
     '5b520a8cce4a2ffa801bd87cdc97a668', '44d4860593ebae8e8850af2073cebf7d'),
    ('public.oc_programar_recebimento(uuid,integer,numeric,date,uuid,boolean)',
     'e12b42609a715f85904ed8ab53258cfa', '0148fa29ac4c8cd8683a523e1fe2cc6e')
  ) x(fn, md5_antes, md5_depois) loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if md5(v_def) <> r.md5_antes then raise exception 'SEG-FAZENDA-ID-01: % mudou (md5 %). Nada foi gravado.', r.fn, md5(v_def); end if;
    if (length(v_def) - length(replace(v_def, c_ancora, ''))) / length(c_ancora) <> 1 then
      raise exception 'SEG-FAZENDA-ID-01: a âncora de % não casa uma vez só. Nada foi gravado.', r.fn;
    end if;
    v_novo := replace(v_def, c_ancora, c_guarda);
    execute v_novo;
    if md5(pg_get_functiondef(r.fn::regprocedure)) <> r.md5_depois then
      raise exception 'SEG-FAZENDA-ID-01: % depois do remendo tem md5 % (esperado %). Nada foi gravado.',
        r.fn, md5(pg_get_functiondef(r.fn::regprocedure)), r.md5_depois;
    end if;
  end loop;
end $remendo$;

-- chegada: as 3 fechadas ao usuário e abertas ao dono das chamadoras; as 2 da OC com a guarda antes do FOR UPDATE e ainda chamáveis
do $chegada$
declare v_fn text; v_dono name;
begin
  foreach v_fn in array array['public.fn_auditoria_consistencia_zoot(uuid)', 'public.fn_pastos_aplicaveis_mes(uuid,text)',
                               'public.fn_saldo_inicial_pasto(uuid,integer,integer,text)'] loop
    if has_function_privilege('authenticated', v_fn, 'execute') or has_function_privilege('anon', v_fn, 'execute') then
      raise exception 'SEG-FAZENDA-ID-01: % segue aberta ao usuário. Nada foi gravado.', v_fn;
    end if;
  end loop;
  for v_dono in select distinct pg_get_userbyid(p.proowner) from pg_proc p
                 where p.oid in ('public.fn_materializar_conjunto_mes(uuid,text)'::regprocedure, 'public.fn_regenerar_area_do_mes(uuid,text)'::regprocedure) loop
    if not has_function_privilege(v_dono, 'public.fn_pastos_aplicaveis_mes(uuid,text)', 'execute') then
      raise exception 'SEG-FAZENDA-ID-01: o dono % das chamadoras perdeu a fn_pastos_aplicaveis_mes. Nada foi gravado.', v_dono;
    end if;
  end loop;
  foreach v_fn in array array['public.oc_lancar_pelo_modal(uuid,integer,text,text,uuid,uuid,jsonb,text,text,text,text,text,boolean)',
                               'public.oc_programar_recebimento(uuid,integer,numeric,date,uuid,boolean)'] loop
    if position('SEG-FAZENDA-ID-01' in pg_get_functiondef(v_fn::regprocedure)) = 0
       or position('SEG-FAZENDA-ID-01' in pg_get_functiondef(v_fn::regprocedure)) > position('FOR UPDATE' in pg_get_functiondef(v_fn::regprocedure))
       or not has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'SEG-FAZENDA-ID-01: a guarda de % não confere. Nada foi gravado.', v_fn;
    end if;
  end loop;
end $chegada$;
