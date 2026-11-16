-- LANC-PATRIMONIO-VINCULO-01 · 116270 — CRIAR O BEM E LIGAR O LANÇAMENTO NUMA IDA SÓ (D6 do mock v1, aprovado pelo Gabriel 15/11 07:48).
-- O "Criar o bem" do rodapé do Editar lançamento: ou nasce o bem JÁ LIGADO aos lançamentos, ou nada nasce. Com duas chamadas
-- (fn_patrimonio_bem_salvar e depois fn_patrimonio_bem_ligar) uma recusa do ligar (RH, contrato incompleto, repetida sem confirmar,
-- já em outro bem) deixava um bem sem lançamento.
--   · NÃO HÁ REGRA NOVA: o corpo chama as duas RPCs de hoje, sem tocar nelas — as recusas, a frase pronta, o código do bem, a vida útil,
--     o contrato inteiro e a repetida são as delas.
--   · A PRÉVIA (p_simular, padrão true) cria e liga DE VERDADE dentro de um bloco e o DESFAZ por exceção (o molde da prévia da correção
--     da `fn_patrimonio_bem_salvar`): mostra o código que o bem teria, a soma de aquisição e o que o ligar diria, e nada fica no banco.
--   · Só CRIA: com `id` no p_bem, recusa (o bem que existe se liga pelo "Ligar a um bem" = fn_patrimonio_bem_ligar).
--   · Guarda: tenant_ok do cliente do p_bem (42501) antes de tudo; as duas de dentro guardam de novo (salvar: tenant_ok; ligar: o
--     cliente do bem).
--   · NADA MUDA NO LANÇAMENTO (ligar só liga). Sem dado de cliente: só a função.
-- GESTO CONTRÁRIO: drop function public.fn_patrimonio_bem_criar_e_ligar(jsonb, jsonb, boolean, boolean).
set local lock_timeout = '2s';

do $guarda$
begin
  if to_regprocedure('public.fn_patrimonio_bem_criar_e_ligar(jsonb,jsonb,boolean,boolean)') is not null then
    raise exception '116270: a função já existe; nada foi alterado';
  end if;
  -- as duas de dentro têm de ser as de hoje (a prévia e a gravação dependem das recusas e das chaves de retorno delas)
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_patrimonio_bem_salvar(jsonb,boolean,text)'::regprocedure)
     is distinct from 'f1ae74704657d6202494195a9ad5b90f'
  or (select md5(prosrc) from pg_proc where oid = 'public.fn_patrimonio_bem_ligar(uuid,jsonb,boolean,boolean)'::regprocedure)
     is distinct from '85c11a3a1a5d94490fcb540b15ff84c7' then
    raise exception '116270: fn_patrimonio_bem_salvar ou fn_patrimonio_bem_ligar não é a de hoje; nada foi alterado';
  end if;
end $guarda$;

create function public.fn_patrimonio_bem_criar_e_ligar(p_bem jsonb, p_itens jsonb, p_confirmar_repetidas boolean default false,
                                                       p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $f$
declare
  v_cliente uuid;
  v_bem jsonb; v_lig jsonb; v_previa jsonb; v_ok boolean := false;
begin
  begin
    v_cliente := nullif(p_bem->>'cliente_id', '')::uuid;
  exception when others then v_cliente := null;
  end;
  if v_cliente is null or not coalesce(public.tenant_ok(v_cliente), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if nullif(p_bem->>'id', '') is not null then
    raise exception using errcode = 'P0001', message = 'Aqui só se cria um bem novo: para um bem que já existe, use "Ligar a um bem".';
  end if;

  if coalesce(p_simular, true) then
    begin
      v_bem := public.fn_patrimonio_bem_salvar(p_bem, false, null);
      v_lig := public.fn_patrimonio_bem_ligar((v_bem->>'id')::uuid, p_itens, p_confirmar_repetidas, true);
      v_previa := jsonb_build_object(
        'ok', coalesce((v_lig->>'ok')::boolean, false), 'simulado', true, 'codigo', v_bem->>'codigo', 'ligar', v_lig);
      v_ok := true;
      raise exception using errcode = 'P0001', message = 'desfaz a previa';
    exception when others then
      if not v_ok then raise; end if;
    end;
    -- a ficha que nasceria (categoria, vida útil, residual, avisos): a prévia da própria salvar (não grava)
    return v_previa || jsonb_build_object('bem', public.fn_patrimonio_bem_salvar(p_bem, true, null));
  end if;

  v_bem := public.fn_patrimonio_bem_salvar(p_bem, false, null);
  v_lig := public.fn_patrimonio_bem_ligar((v_bem->>'id')::uuid, p_itens, p_confirmar_repetidas, false);
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_bem->>'id', 'codigo', v_bem->>'codigo',
    'versao', (select b.versao from public.patrimonio_bens b where b.id = (v_bem->>'id')::uuid),
    'n_ligados', v_lig->'n_ligados', 'soma_aquisicao', v_lig->'soma_aquisicao');
end $f$;

comment on function public.fn_patrimonio_bem_criar_e_ligar(jsonb, jsonb, boolean, boolean) is
  'LANC-PATRIMONIO-VINCULO-01 (116270): cria o bem (fn_patrimonio_bem_salvar) e liga os lançamentos (fn_patrimonio_bem_ligar) numa transação; p_simular = prévia que cria, liga e desfaz.';

revoke all on function public.fn_patrimonio_bem_criar_e_ligar(jsonb, jsonb, boolean, boolean) from public, anon;
grant execute on function public.fn_patrimonio_bem_criar_e_ligar(jsonb, jsonb, boolean, boolean) to authenticated, service_role;
