-- FIN-FORMA-CARTAO-AUTO-01 · 20261028115530 — o LEGADO: as saídas em conta-cartão com outra forma passam a 'Cartão de crédito', UM CLIENTE
-- POR VEZ (D4: começa pelo NJ), com PRÉVIA, BACKUP e DESFAZER (Gabriel 17/11 07:44). Só a coluna `forma_pagamento` muda: valor, status, datas,
-- conta, classificação e conciliação ficam.
-- · Rotina do admin AgroinBlue (como a conversão de textos, P118): usuário logado que não é admin → 42501.
-- · O backup é tabela PRÓPRIA (`financeiro_forma_cartao_backup`: lote · lançamento · forma de antes, NULL = vazia · feito/desfeito): a
--   `texto_conversao_backup` só aceita as conversões de TEXTO (CHECK da operação), e não se mistura com ela. Leitura por cliente (RLS
--   tenant_ok); escrita só pelas duas funções.
-- · `editado_manual` NÃO acende: a correção do sistema não é edição humana — `app.correcao_forma_cartao` = 'on' faz o
--   `mark_financeiro_lancamento_v2_editado_manual` pular (patch guardado pelo md5 da função de hoje; a âncora casa 1 vez).
-- · Trilha: o gatilho de auditoria de cada linha leva `via` = 'sistema:forma_cartao' e um resumo do lote vai ao audit_log.
-- · Desfazer: só as linhas que AINDA estão como o lote deixou (a editada depois fica, e o resultado diz quantas); desliga a regra da conta
--   (`app.forma_pela_conta_off`) só nessa transação.
set local lock_timeout = '2s';

create table public.financeiro_forma_cartao_backup (
  id bigint generated always as identity primary key,
  lote text not null check (lote like 'forma_cartao:%'),
  cliente_id uuid not null references public.clientes(id),
  lancamento_id uuid not null references public.financeiro_lancamentos_v2(id),
  forma_antes text,
  forma_nova text not null,
  feito_em timestamptz not null default clock_timestamp(),
  feito_por uuid,
  desfeito_em timestamptz
);
create index financeiro_forma_cartao_backup_lote_idx on public.financeiro_forma_cartao_backup (lote);
alter table public.financeiro_forma_cartao_backup enable row level security;
revoke all on table public.financeiro_forma_cartao_backup from public, anon, authenticated;
grant select on table public.financeiro_forma_cartao_backup to authenticated;
create policy financeiro_forma_cartao_backup_ler on public.financeiro_forma_cartao_backup
  for select to authenticated using (public.tenant_ok(cliente_id));

-- (1) a correção do sistema não acende "editado à mão"
do $$
declare d text := pg_get_functiondef('public.mark_financeiro_lancamento_v2_editado_manual()'::regprocedure);
  a text := $A$  IF OLD.lote_importacao_id IS NOT NULL$A$;
  b text := $B$  -- FIN-FORMA-CARTAO-AUTO-01: a correção da forma pela conta (lote com prévia/backup/desfazer) não é edição humana.
  IF coalesce(current_setting('app.correcao_forma_cartao', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.lote_importacao_id IS NOT NULL$B$;
begin
  if md5(d) <> '08468601c08859c623c2841b49e2f10e' then raise exception 'FORMA 115530: a mark_financeiro_lancamento_v2_editado_manual mudou (md5 %): refazer o patch.', md5(d); end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'FORMA 115530: a âncora não casa 1 vez.'; end if;
  execute replace(d, a, b);
end $$;

-- (2) a prévia e o lote de UM cliente
create or replace function public.fn_forma_cartao_corrigir(p_cliente_id uuid, p_motivo text default null, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_motivo text := btrim(coalesce(p_motivo, '')); v_op text; v_n int; v_por_forma jsonb; v_por_status jsonb; v_aud uuid;
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  if not coalesce(public.is_admin_agroinblue(auth.uid()), false) then
    raise exception using errcode = '42501', message = 'A correção da forma em lote é rotina do admin AgroinBlue.';
  end if;
  create temp table if not exists _forma_cartao_alvo (id uuid primary key, forma_antes text, status text) on commit drop;
  delete from _forma_cartao_alvo where true;
  insert into _forma_cartao_alvo (id, forma_antes, status)
  select l.id, l.forma_pagamento, l.status_transacao
    from public.financeiro_lancamentos_v2 l
    join public.financeiro_contas_bancarias cb on cb.id = l.conta_bancaria_id and cb.tipo_conta = 'cartao'
   where l.cliente_id = p_cliente_id and not coalesce(l.cancelado, false) and l.cenario = 'realizado'
     and coalesce(l.tipo_operacao, '') like '2-%' and l.forma_pagamento is distinct from 'Cartão de crédito';
  select count(*) into v_n from _forma_cartao_alvo;
  select coalesce(jsonb_object_agg(f, n), '{}'::jsonb) into v_por_forma
    from (select coalesce(forma_antes, '(vazia)') f, count(*) n from _forma_cartao_alvo group by 1) x;
  select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) into v_por_status
    from (select coalesce(status, '(sem status)') s, count(*) n from _forma_cartao_alvo group by 1) x;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'lancamentos', v_n, 'por_forma', v_por_forma, 'por_status', v_por_status,
      'frase', format('%s saídas em conta-cartão passam a "Cartão de crédito" (só a forma muda).', v_n));
  end if;
  if length(v_motivo) < 3 then raise exception 'Diga por que corrige (pelo menos 3 letras).'; end if;
  if v_n = 0 then
    return jsonb_build_object('simulado', false, 'gravado', false, 'lancamentos', 0, 'frase', 'Nada a corrigir neste cliente.');
  end if;
  v_op := 'forma_cartao:' || gen_random_uuid()::text;
  insert into public.financeiro_forma_cartao_backup (lote, cliente_id, lancamento_id, forma_antes, forma_nova, feito_por)
  select v_op, p_cliente_id, a.id, a.forma_antes, 'Cartão de crédito', auth.uid() from _forma_cartao_alvo a;
  perform set_config('app.via', 'sistema:forma_cartao', true);
  perform set_config('app.correcao_forma_cartao', 'on', true);
  update public.financeiro_lancamentos_v2 l set forma_pagamento = 'Cartão de crédito'
    from _forma_cartao_alvo a where l.id = a.id;
  perform set_config('app.correcao_forma_cartao', 'off', true);
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (p_cliente_id, auth.uid(), 'financeiro', 'editou', 'financeiro_lancamentos_v2', null,
          format('Forma pela conta-cartão: %s saídas passaram a "Cartão de crédito"', v_n),
          jsonb_build_object('gesto', 'forma_cartao', 'por_forma', v_por_forma),
          jsonb_build_object('gesto', 'forma_cartao', 'operacao', v_op, 'lancamentos', v_n, 'motivo', v_motivo),
          'sistema:forma_cartao')
  returning id into v_aud;
  return jsonb_build_object('simulado', false, 'gravado', true, 'operacao', v_op, 'lancamentos', v_n, 'por_forma', v_por_forma,
    'trilha_id', v_aud, 'frase', format('%s saídas em conta-cartão passaram a "Cartão de crédito".', v_n));
end $$;

-- (3) o desfazer do lote (pela `operacao` que o lote devolveu)
create or replace function public.fn_forma_cartao_desfazer(p_operacao text, p_motivo text default null, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_motivo text := btrim(coalesce(p_motivo, '')); v_cliente uuid; v_volta int; v_ficam int; v_feitas int;
begin
  if p_operacao is null or p_operacao not like 'forma_cartao:%' then raise exception 'Lote de forma não encontrado.'; end if;
  select min(cliente_id::text)::uuid into v_cliente from public.financeiro_forma_cartao_backup where lote = p_operacao;
  if v_cliente is null or not coalesce(public.tenant_ok(v_cliente), false) then
    raise exception using errcode = '42501', message = 'Lote não encontrado (ou sem acesso).';
  end if;
  if not coalesce(public.is_admin_agroinblue(auth.uid()), false) then
    raise exception using errcode = '42501', message = 'Desfazer a correção da forma é rotina do admin AgroinBlue.';
  end if;
  select count(*) filter (where b.desfeito_em is null and l.forma_pagamento is not distinct from b.forma_nova),
         count(*) filter (where b.desfeito_em is null and l.forma_pagamento is distinct from b.forma_nova),
         count(*) filter (where b.desfeito_em is not null)
    into v_volta, v_ficam, v_feitas
    from public.financeiro_forma_cartao_backup b join public.financeiro_lancamentos_v2 l on l.id = b.lancamento_id
   where b.lote = p_operacao;
  if v_volta = 0 and v_feitas > 0 then raise exception 'Este lote já foi desfeito.'; end if;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'voltam', v_volta, 'editados_depois_ficam', v_ficam,
      'frase', format('%s lançamentos voltam à forma de antes; %s editados depois ficam como estão.', v_volta, v_ficam));
  end if;
  if length(v_motivo) < 3 then raise exception 'Diga por que desfaz (pelo menos 3 letras).'; end if;
  perform set_config('app.via', 'sistema:forma_cartao-desfazer', true);
  perform set_config('app.correcao_forma_cartao', 'on', true);
  perform set_config('app.forma_pela_conta_off', 'on', true);
  with volta as (
    update public.financeiro_lancamentos_v2 l set forma_pagamento = b.forma_antes
      from public.financeiro_forma_cartao_backup b
     where b.lote = p_operacao and b.desfeito_em is null
       and b.lancamento_id = l.id and l.forma_pagamento is not distinct from b.forma_nova
    returning b.id)
  update public.financeiro_forma_cartao_backup b set desfeito_em = clock_timestamp() from volta where b.id = volta.id;
  get diagnostics v_volta = row_count;
  perform set_config('app.forma_pela_conta_off', 'off', true);
  perform set_config('app.correcao_forma_cartao', 'off', true);
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (v_cliente, auth.uid(), 'financeiro', 'desfez', 'financeiro_lancamentos_v2', null,
          format('Forma pela conta-cartão: desfeito o lote (%s voltaram)', v_volta),
          jsonb_build_object('gesto', 'forma_cartao', 'operacao', p_operacao),
          jsonb_build_object('desfaz', p_operacao, 'voltaram', v_volta, 'editados_depois_ficaram', v_ficam, 'motivo', v_motivo),
          'sistema:forma_cartao-desfazer');
  return jsonb_build_object('simulado', false, 'gravado', true, 'voltaram', v_volta, 'editados_depois_ficaram', v_ficam,
    'frase', format('%s lançamentos voltaram à forma de antes.', v_volta));
end $$;

revoke all on function public.fn_forma_cartao_corrigir(uuid, text, boolean) from public, anon;
revoke all on function public.fn_forma_cartao_desfazer(text, text, boolean) from public, anon;
grant execute on function public.fn_forma_cartao_corrigir(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.fn_forma_cartao_desfazer(text, text, boolean) to authenticated, service_role;
