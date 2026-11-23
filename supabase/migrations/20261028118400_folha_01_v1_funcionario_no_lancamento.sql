-- FOLHA-01 · V1 — o vínculo FUNCIONÁRIO no lançamento (Gabriel 18/11/2026 15:53 e "V1–V4 sim"): o favorecido segue sendo QUEM RECEBEU o
-- dinheiro (banco e conciliação não mudam); o lançamento de folha ganha `funcionario_id` = a PESSOA (ex.: "Rescisão Manoel" paga à
-- Liderança Contabil → funcionário Manoel). Relatório: folha-20261118-1609-FOLHA-01-APLICADOS-E-VINCULO-FASE0.md §3.
-- O QUE FAZ:
--   1. coluna nula `financeiro_lancamentos_v2.funcionario_id` (sem default: não reescreve a tabela; lock_timeout 2 s);
--      FK para folha_funcionarios criada NOT VALID e validada em seguida (trava leve); índice parcial (só os ligados).
--   2. gatilho: o funcionário tem de ser do MESMO cliente do lançamento (42501), em toda gravação, por qualquer caminho.
--   3. fn_lancamento_funcionario_ligar(lançamentos[], funcionário | null, motivo, simular): liga ou desliga (null) em lote, um cliente
--      por chamada, só com o acesso da folha (folha_ok); trilha = audit_log (via 'folha-vinculo'); devolve antes/depois.
--      Não mexe em valor/status/conta: liga também lançamento pago ou conciliado (é cadastro, não é dinheiro).
-- NÃO FAZ: não liga nada (a migração dos existentes é o V3, com prévia); não muda a lista/busca (V4).
-- DESFAZER: drop function fn_lancamento_funcionario_ligar; drop trigger trg_lancamento_funcionario_cliente; drop function
--   _fn_trg_lancamento_funcionario_cliente; drop index ix_fin_lanc_v2_funcionario; alter table financeiro_lancamentos_v2 drop column funcionario_id.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

do $pre$ begin
  if to_regclass('public.folha_funcionarios') is null then raise exception 'V1: aplique a 118370 antes.'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'financeiro_lancamentos_v2' and column_name = 'funcionario_id') then
    raise exception 'V1: já aplicado (a coluna existe).';
  end if;
end $pre$;

alter table public.financeiro_lancamentos_v2 add column funcionario_id uuid;
alter table public.financeiro_lancamentos_v2 add constraint fk_fin_lanc_v2_funcionario
  foreign key (funcionario_id) references public.folha_funcionarios(id) not valid;
alter table public.financeiro_lancamentos_v2 validate constraint fk_fin_lanc_v2_funcionario;
create index ix_fin_lanc_v2_funcionario on public.financeiro_lancamentos_v2 (funcionario_id) where funcionario_id is not null;

-- o funcionário é do cliente do lançamento
create function public._fn_trg_lancamento_funcionario_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.folha_funcionarios f where f.id = new.funcionario_id and f.cliente_id = new.cliente_id) then
    raise exception 'O funcionário não é deste cliente.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public._fn_trg_lancamento_funcionario_cliente() from public, anon, authenticated;
create trigger trg_lancamento_funcionario_cliente before insert or update of funcionario_id, cliente_id on public.financeiro_lancamentos_v2
  for each row when (new.funcionario_id is not null) execute function public._fn_trg_lancamento_funcionario_cliente();

create function public.fn_lancamento_funcionario_ligar(p_lancamentos uuid[], p_funcionario uuid, p_motivo text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cliente uuid; v_n int; v_mudam int; v_antes jsonb; v_nome text;
begin
  if p_simular is null or p_lancamentos is null or cardinality(p_lancamentos) = 0 then raise exception 'Vínculo: pedido inválido.' using errcode = '22023'; end if;
  select min(cliente_id::text)::uuid, count(distinct cliente_id), count(*) into v_cliente, v_n, v_mudam
    from financeiro_lancamentos_v2 where id = any (p_lancamentos);
  if v_mudam <> cardinality(array(select distinct unnest(p_lancamentos))) then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  if v_n <> 1 then raise exception 'Um cliente por vez.' using errcode = '22023'; end if;
  if not folha_ok(v_cliente) then raise exception 'Sem acesso à folha deste cliente.' using errcode = '42501'; end if;
  if p_funcionario is not null then
    select nome into v_nome from folha_funcionarios where id = p_funcionario and cliente_id = v_cliente;
    if not found then raise exception 'O funcionário não é deste cliente.' using errcode = '42501'; end if;
  end if;
  select count(*) filter (where funcionario_id is distinct from p_funcionario),
         coalesce(jsonb_agg(jsonb_build_object('lancamento_id', id, 'antes', funcionario_id)) filter (where funcionario_id is distinct from p_funcionario), '[]')
    into v_mudam, v_antes from financeiro_lancamentos_v2 where id = any (p_lancamentos);
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'funcionario', v_nome, 'lancamentos', cardinality(p_lancamentos), 'mudam', v_mudam, 'antes', v_antes);
  end if;
  perform set_config('app.via', 'folha-vinculo', true);
  perform set_config('app.motivo', coalesce(nullif(btrim(coalesce(p_motivo, '')), ''),
    case when p_funcionario is null then 'desligado do funcionário' else 'ligado ao funcionário ' || v_nome end), true);
  update financeiro_lancamentos_v2 set funcionario_id = p_funcionario, updated_by = auth.uid()
   where id = any (p_lancamentos) and funcionario_id is distinct from p_funcionario;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'simulado', false, 'funcionario', v_nome, 'mudaram', v_n, 'antes', v_antes);
end $$;
revoke all on function public.fn_lancamento_funcionario_ligar(uuid[], uuid, text, boolean) from public, anon;
grant execute on function public.fn_lancamento_funcionario_ligar(uuid[], uuid, text, boolean) to authenticated, service_role;
