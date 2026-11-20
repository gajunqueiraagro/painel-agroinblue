-- FIN-REGRA-VARIAVEL-FAZENDA-01 (Gabriel 19/11 09:37 + 09:51 "tudo" + 09:53) — REGRA DE PRODUTO, todos os clientes:
--   · custo VARIÁVEL (qualquer atividade) nunca no Administrativo nem sem fazenda;
--   · custo FIXO de atividade (Pecuária/Agricultura/Silvicultura) nunca no Administrativo;
--   · receita de atividade (venda/abate) nunca no Administrativo nem sem fazenda;
--   · compra de bovinos nunca no Administrativo;
--   · dividendos/retiradas nunca em fazenda produtiva (vão ao Administrativo);
--   · conta de pecuária nunca em fazenda sem pecuária (preventiva).
-- O que este lote faz:
--   1) `_fn_regra_fazenda_da_conta(conta, fazenda)` — a regra, UMA (a tela lê a mesma pela `fn_regra_fazenda_da_conta`);
--   2) gatilhos que RECUSAM (P0001, a frase pronta; nunca 40001) no lançamento NOVO e quando a fazenda ou a conta MUDAM — o legado fica
--      editável nos outros campos até ser corrigido; nas partes da divisão, a parte nova/trocada confere com a fazenda do lançamento;
--   3) `fn_lancamentos_trocar_fazenda` (simular = prévia; trilha `lancamento_fazenda_trocas`; desfazer) — a correção em lote do modal
--      "N despesas … no Administrativo" (fazenda sugerida OU a conta administrativa equivalente);
--   4) `fn_lancamentos_regra_fazenda_pendentes` — a lista do modal, com a sugestão por linha e a origem;
--   5) a correção aprovada (D4): os 4 Starvac (77d37bbf) → SR (o Adubo 276.600 fica FORA: D3; os 2 do NJ já foram corrigidos na tela).
-- Trocar a fazenda NÃO desfaz a conciliação (só o cancelamento desfaz: `trg_cbi_desfazer_on_cancelamento`).

set local lock_timeout = '2s';

-- ═══ 1. a regra ═══
create or replace function public._fn_regra_fazenda_da_conta(p_plano uuid, p_fazenda uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  pc record; fz record; v_tipo text;
begin
  if p_plano is null then return null; end if;
  select grupo_custo, escopo_negocio, subcentro into pc from financeiro_plano_contas where id = p_plano;
  if not found then return null; end if;
  v_tipo := case
    when pc.grupo_custo ilike 'custo vari%' then 'variavel'
    when pc.grupo_custo in ('Custo Fixo Pecuária', 'Custo Fixo Agricultura', 'Custo Fixo Silvicultura') then 'fixo'
    when pc.grupo_custo in ('Receita Pecuária', 'Receita Agrícola', 'Receita Silvícola') then 'receita'
    when pc.grupo_custo = 'Compra de Bovinos' then 'bovinos'
    when pc.grupo_custo = 'Dividendos' then 'dividendos'
  end;
  if v_tipo is null then return null; end if;
  if p_fazenda is null then
    return case v_tipo
      when 'variavel' then format('Custo variável (%s) precisa de uma fazenda produtiva: escolha a fazenda.', pc.subcentro)
      when 'receita' then format('Receita (%s) é sempre de uma fazenda: escolha a fazenda.', pc.subcentro)
    end;
  end if;
  select eh_administrativa, tem_pecuaria, nome into fz from fazendas where id = p_fazenda;
  if not found then return null; end if;
  if coalesce(fz.eh_administrativa, false) then
    return case v_tipo
      when 'variavel' then format('Custo variável (%s) não vai para o Administrativo: escolha a fazenda produtiva.', pc.subcentro)
      when 'fixo' then format('Custo fixo da atividade (%s) não vai para o Administrativo: escolha a fazenda ou a conta administrativa.', pc.subcentro)
      when 'receita' then format('Receita (%s) não vai para o Administrativo: escolha a fazenda.', pc.subcentro)
      when 'bovinos' then format('Compra de bovinos (%s) não vai para o Administrativo: escolha a fazenda.', pc.subcentro)
    end;
  end if;
  if v_tipo = 'dividendos' then
    return format('Dividendos/retiradas (%s) vão para o Administrativo, não para a %s.', pc.subcentro, fz.nome);
  end if;
  if pc.escopo_negocio = 'pecuaria' and fz.tem_pecuaria is false then
    return format('Conta de pecuária (%s) numa fazenda sem pecuária (%s): escolha outra fazenda.', pc.subcentro, fz.nome);
  end if;
  return null;
end $$;
revoke all on function public._fn_regra_fazenda_da_conta(uuid, uuid) from public, anon, authenticated;

-- a porta da TELA (a mesma regra; a conta e a fazenda não são de cliente: o plano padrão e a fazenda são lidos pela própria tela)
create or replace function public.fn_regra_fazenda_da_conta(p_plano uuid, p_fazenda uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_cli uuid;
begin
  select cliente_id into v_cli from fazendas where id = p_fazenda;
  if v_cli is not null and not tenant_ok(v_cli) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  return _fn_regra_fazenda_da_conta(p_plano, p_fazenda);
end $$;
revoke all on function public.fn_regra_fazenda_da_conta(uuid, uuid) from public, anon;
grant execute on function public.fn_regra_fazenda_da_conta(uuid, uuid) to authenticated;

-- ═══ 2. as travas ═══
create or replace function public._fn_trg_regra_fazenda_lancamento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_frase text; v_parte record;
begin
  if new.cancelado then return new; end if;
  if current_setting('app.regra_fazenda_desfazer', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and new.fazenda_id is not distinct from old.fazenda_id and new.plano_conta_id is not distinct from old.plano_conta_id
     and new.cancelado is not distinct from old.cancelado then
    return new;
  end if;
  v_frase := _fn_regra_fazenda_da_conta(new.plano_conta_id, new.fazenda_id);
  if v_frase is null and tg_op = 'UPDATE' and new.fazenda_id is distinct from old.fazenda_id then
    for v_parte in select plano_conta_id from financeiro_lancamento_partes where lancamento_id = new.id loop
      v_frase := _fn_regra_fazenda_da_conta(v_parte.plano_conta_id, new.fazenda_id);
      exit when v_frase is not null;
    end loop;
  end if;
  if v_frase is not null then raise exception '%', v_frase using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function public._fn_trg_regra_fazenda_lancamento() from public, anon, authenticated;
-- `trg_zy_`: depois do `trg_resolve_classificacao_plano` (que põe a conta pelo subcentro) e antes do `trg_zz_aprovacao_foto_mudou`
drop trigger if exists trg_zy_regra_fazenda on public.financeiro_lancamentos_v2;
create trigger trg_zy_regra_fazenda before insert or update on public.financeiro_lancamentos_v2
  for each row execute function public._fn_trg_regra_fazenda_lancamento();

create or replace function public._fn_trg_regra_fazenda_parte()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_frase text; v_faz uuid;
begin
  if current_setting('app.regra_fazenda_desfazer', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and new.plano_conta_id is not distinct from old.plano_conta_id then return new; end if;
  select fazenda_id into v_faz from financeiro_lancamentos_v2 where id = new.lancamento_id;
  v_frase := _fn_regra_fazenda_da_conta(new.plano_conta_id, v_faz);
  if v_frase is not null then raise exception '%', v_frase using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function public._fn_trg_regra_fazenda_parte() from public, anon, authenticated;
drop trigger if exists trg_zy_regra_fazenda_parte on public.financeiro_lancamento_partes;
create trigger trg_zy_regra_fazenda_parte before insert or update on public.financeiro_lancamento_partes
  for each row execute function public._fn_trg_regra_fazenda_parte();

-- ═══ 3. a troca em lote (prévia · trilha · desfazer) ═══
create table if not exists public.lancamento_fazenda_trocas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  antes jsonb not null,            -- [{id, fazenda_id, plano_conta_id}]
  fazenda_para uuid,
  plano_para uuid,
  motivo text not null,
  feita_em timestamptz not null default now(),
  feita_por uuid,
  desfeita_em timestamptz,
  desfeita_por uuid
);
alter table public.lancamento_fazenda_trocas enable row level security;
drop policy if exists lancamento_fazenda_trocas_ler on public.lancamento_fazenda_trocas;
create policy lancamento_fazenda_trocas_ler on public.lancamento_fazenda_trocas for select to authenticated using (tenant_ok(cliente_id));
revoke all on public.lancamento_fazenda_trocas from public, anon;
revoke insert, update, delete on public.lancamento_fazenda_trocas from authenticated;
grant select on public.lancamento_fazenda_trocas to authenticated;

create or replace function public.fn_lancamentos_trocar_fazenda(p_cliente uuid, p_ids uuid[], p_fazenda uuid, p_plano uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_linhas jsonb := '[]'::jsonb; v_recusas text[] := '{}'; l record; v_faz uuid; v_plano uuid; v_frase text; v_id uuid;
begin
  if not tenant_ok(p_cliente) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if coalesce(trim(p_motivo), '') = '' then return jsonb_build_object('ok', false, 'recusas', jsonb_build_array('Diga o motivo da troca.')); end if;
  if p_fazenda is null and p_plano is null then return jsonb_build_object('ok', false, 'recusas', jsonb_build_array('Escolha a fazenda ou a conta.')); end if;
  if p_fazenda is not null and not exists (select 1 from fazendas where id = p_fazenda and cliente_id = p_cliente) then
    return jsonb_build_object('ok', false, 'recusas', jsonb_build_array('A fazenda não é deste cliente.'));
  end if;
  if p_plano is not null and not exists (select 1 from financeiro_plano_contas where id = p_plano and ativo and (cliente_id = p_cliente or cliente_id is null)) then
    return jsonb_build_object('ok', false, 'recusas', jsonb_build_array('A conta não é do plano deste cliente.'));
  end if;
  for l in select x.id, x.fazenda_id, x.plano_conta_id, x.data_competencia, x.valor, x.descricao, x.cancelado,
                  exists (select 1 from conciliacao_bancaria_itens c where c.lancamento_id = x.id and c.desfeito_em is null) conciliado
             from financeiro_lancamentos_v2 x where x.id = any(p_ids) and x.cliente_id = p_cliente order by x.data_competencia, x.id loop
    v_faz := coalesce(p_fazenda, l.fazenda_id); v_plano := coalesce(p_plano, l.plano_conta_id);
    v_frase := case
      when l.cancelado then 'cancelado'
      when exists (select 1 from financeiro_fechamentos f where f.cliente_id = p_cliente and f.status_fechamento = 'fechado'
                     and f.ano_mes = to_char(l.data_competencia, 'YYYY-MM') and f.fazenda_id in (l.fazenda_id, v_faz))
        then format('%s fechado: reabra o mês para trocar', to_char(l.data_competencia, 'MM/YYYY'))
      else _fn_regra_fazenda_da_conta(v_plano, v_faz) end;
    if v_frase is not null then v_recusas := v_recusas || format('%s (%s): %s', coalesce(l.descricao, '—'), to_char(l.data_competencia, 'DD/MM/YYYY'), v_frase); end if;
    v_linhas := v_linhas || jsonb_build_object('id', l.id, 'fazenda_de', l.fazenda_id, 'fazenda_para', v_faz, 'plano_de', l.plano_conta_id, 'plano_para', v_plano,
      'valor', l.valor, 'conciliado', l.conciliado, 'recusa', v_frase);
  end loop;
  if jsonb_array_length(v_linhas) <> coalesce(array_length(p_ids, 1), 0) then
    v_recusas := v_recusas || 'Algum lançamento não é deste cliente (ou não existe).'::text;
  end if;
  if p_simular or array_length(v_recusas, 1) > 0 then
    return jsonb_build_object('ok', coalesce(array_length(v_recusas, 1), 0) = 0, 'simulado', true, 'linhas', v_linhas, 'recusas', to_jsonb(v_recusas));
  end if;
  insert into lancamento_fazenda_trocas (cliente_id, antes, fazenda_para, plano_para, motivo, feita_por)
    select p_cliente, jsonb_agg(jsonb_build_object('id', e->>'id', 'fazenda_id', e->>'fazenda_de', 'plano_conta_id', e->>'plano_de')), p_fazenda, p_plano, p_motivo, auth.uid()
      from jsonb_array_elements(v_linhas) e
    returning id into v_id;
  update financeiro_lancamentos_v2 x set fazenda_id = coalesce(p_fazenda, x.fazenda_id), plano_conta_id = coalesce(p_plano, x.plano_conta_id)
   where x.id = any(p_ids) and x.cliente_id = p_cliente;
  return jsonb_build_object('ok', true, 'simulado', false, 'troca_id', v_id, 'linhas', v_linhas, 'recusas', '[]'::jsonb);
end $$;
revoke all on function public.fn_lancamentos_trocar_fazenda(uuid, uuid[], uuid, uuid, text, boolean) from public, anon;
grant execute on function public.fn_lancamentos_trocar_fazenda(uuid, uuid[], uuid, uuid, text, boolean) to authenticated;

create or replace function public.fn_lancamentos_trocar_fazenda_desfazer(p_troca uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record; e jsonb;
begin
  select * into t from lancamento_fazenda_trocas where id = p_troca;
  if not found then return jsonb_build_object('ok', false, 'recusa', 'Troca não achada.'); end if;
  if not tenant_ok(t.cliente_id) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if t.desfeita_em is not null then return jsonb_build_object('ok', false, 'recusa', 'Esta troca já foi desfeita.'); end if;
  -- voltar ao que era (mesmo que o antes viole a regra: é o desfazer, com trilha)
  perform set_config('app.regra_fazenda_desfazer', 'on', true);
  for e in select * from jsonb_array_elements(t.antes) loop
    update financeiro_lancamentos_v2 set fazenda_id = nullif(e->>'fazenda_id', '')::uuid, plano_conta_id = nullif(e->>'plano_conta_id', '')::uuid
     where id = (e->>'id')::uuid and cliente_id = t.cliente_id;
  end loop;
  perform set_config('app.regra_fazenda_desfazer', 'off', true);
  update lancamento_fazenda_trocas set desfeita_em = now(), desfeita_por = auth.uid() where id = p_troca;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fn_lancamentos_trocar_fazenda_desfazer(uuid) from public, anon;
grant execute on function public.fn_lancamentos_trocar_fazenda_desfazer(uuid) to authenticated;

-- ═══ 4. a lista do modal "N despesas … no Administrativo" (com a sugestão por linha e a origem) ═══
create or replace function public.fn_lancamentos_regra_fazenda_pendentes(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public set plan_cache_mode = force_custom_plan as $$
declare v jsonb;
begin
  if not tenant_ok(p_cliente) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  with base as (
    select l.id, l.data_competencia, l.valor, l.descricao, l.status_transacao, l.favorecido_id, l.fazenda_id, l.plano_conta_id, l.financiamento_id,
           pc.subcentro, pc.centro_custo, pc.macro_custo, pc.escopo_negocio, pc.grupo_custo,
           _fn_regra_fazenda_da_conta(l.plano_conta_id, l.fazenda_id) frase
      from financeiro_lancamentos_v2 l join financeiro_plano_contas pc on pc.id = l.plano_conta_id
     where l.cliente_id = p_cliente and not l.cancelado),
  pend as (select * from base where frase is not null)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'competencia', p.data_competencia, 'valor', p.valor, 'descricao', p.descricao, 'status', p.status_transacao,
      'fornecedor', (select f.nome from financeiro_fornecedores f where f.id = p.favorecido_id),
      'subcentro', p.subcentro, 'grupo_custo', p.grupo_custo, 'fazenda_id', p.fazenda_id, 'regra', p.frase, 'financiamento_id', p.financiamento_id,
      'conciliado', exists (select 1 from conciliacao_bancaria_itens c where c.lancamento_id = p.id and c.desfeito_em is null),
      'mes_fechado', exists (select 1 from financeiro_fechamentos f where f.cliente_id = p_cliente and f.status_fechamento = 'fechado'
                               and f.ano_mes = to_char(p.data_competencia, 'YYYY-MM') and f.fazenda_id = p.fazenda_id),
      -- (a) a fazenda pelo histórico do fornecedor (só fazenda que PASSA na regra), com "k de N"
      'sugestao', (select jsonb_build_object('fazenda_id', h.fazenda_id, 'vezes', h.n, 'de', h.total, 'origem', 'histórico do fornecedor')
                     from (select o.fazenda_id, count(*) n, sum(count(*)) over () total
                             from financeiro_lancamentos_v2 o join fazendas fz on fz.id = o.fazenda_id
                            where o.cliente_id = p_cliente and o.favorecido_id = p.favorecido_id and o.id <> p.id and not o.cancelado
                              and _fn_regra_fazenda_da_conta(p.plano_conta_id, o.fazenda_id) is null
                            group by o.fazenda_id order by count(*) desc limit 1) h),
      -- (b) só no custo FIXO de atividade: a conta ADMINISTRATIVA equivalente (mesmo centro, o subcentro com "Administrativo" no lugar da atividade)
      'conta_adm', case when p.grupo_custo like 'Custo Fixo %' then
        (select jsonb_build_object('plano_conta_id', a.id, 'subcentro', a.subcentro) from financeiro_plano_contas a
          where a.ativo and (a.cliente_id = p_cliente or a.cliente_id is null) and a.escopo_negocio = 'administrativo' and a.centro_custo = p.centro_custo
            and lower(a.subcentro) = lower(regexp_replace(p.subcentro, '\s+(Pecuária|Agricultura|Silvicultura)$', ' Administrativo'))
          order by a.cliente_id nulls last limit 1) end
    ) order by p.data_competencia), '[]'::jsonb) into v
  from pend p;
  return v;
end $$;
revoke all on function public.fn_lancamentos_regra_fazenda_pendentes(uuid) from public, anon;
grant execute on function public.fn_lancamentos_regra_fazenda_pendentes(uuid) to authenticated;

-- ═══ 5. a correção aprovada (D4) — pela própria função (as guardas de cada linha, a trilha e o desfazer); o Adubo 276.600 fica FORA (D3) ═══
do $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  -- 77d37bbf · Starvac 2/5..5/5 (Vacinas e Vermífugos, 375,36, no Administrativo) → SR (histórico do fornecedor: 14 de 14)
  if (select count(*) from financeiro_lancamentos_v2 where id in ('ed0c50e1-bebe-4bc2-a06b-c5c7a2d3e224', '65561f34-f528-42e6-ad11-a0a488017706',
        '64d2595f-b78b-4b9d-8584-6e8df86c85da', 'bdfdb843-df41-48e1-b128-52b86f4f2ed4') and not cancelado and valor = 375.36
        and fazenda_id = 'cfe61cf4-5c33-44f4-9e75-7a0fcc634799' and cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4') <> 4 then
    raise exception 'FIN-REGRA-VARIAVEL-FAZENDA-01: os 4 Starvac não estão como na prévia; nada gravado';
  end if;
  r := fn_lancamentos_trocar_fazenda('77d37bbf-a440-4fca-bf1a-eac60cf91bc4', array['ed0c50e1-bebe-4bc2-a06b-c5c7a2d3e224', '65561f34-f528-42e6-ad11-a0a488017706',
         '64d2595f-b78b-4b9d-8584-6e8df86c85da', 'bdfdb843-df41-48e1-b128-52b86f4f2ed4']::uuid[], '161b905e-f14c-4a9b-965f-dd3c8f82dc74', null,
         'FIN-REGRA-VARIAVEL-FAZENDA-01 (Gabriel 19/11): custo variável sai do Administrativo — fazenda pelo histórico do fornecedor (14 de 14 em SR)', false);
  if not (r->>'ok')::boolean then raise exception 'FIN-REGRA-VARIAVEL-FAZENDA-01: Starvac recusado: %; nada gravado', r->'recusas'; end if;
  -- (as vacinas parc. 3 do NJ, 77473109, e as peças W130, be79ece8, já foram para PUR na tela em 19/11 antes deste lote: fora dele)
end $$;