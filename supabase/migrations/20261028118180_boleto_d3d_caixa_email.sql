-- BOLETO D3d — A CAIXA POR E-MAIL v2, o banco (mock boleto-caixa-email-v2 aprovado pelo Gabriel 18/11 07:50, "D1–D7 sim").
--   1. entrada_arquivos ganha o MOTIVO de ignorar (D6) e o lançamento da nota resolvida; "dispensado" passa a ser "ignorado" e exige o
--      motivo. Nada se apaga: o arquivo segue no armazenamento e volta com fn_entrada_voltar.
--   2. entrada_trilha — quem ignorou / voltou / resolveu, quando e por quê (imutável: UPDATE/DELETE recusados).
--   3. RPCs da tela (prévia = p_simular, padrão true; tenant_ok; 42501 fora do cliente):
--      fn_entrada_ignorar(ids[], motivo, detalhe) · fn_entrada_voltar(id) · fn_entrada_resolver(id, 'boleto'|'nota', boleto, lançamento).
--      fn_entrada_dispensar (a tela antiga, até o push) passa a gravar o motivo 'anterior_a_regra' e a trilha.
--   4. D5 (Gabriel 18/11 07:50): os 2 XMLs da Pontero dispensados em 17/11 VOLTAM para "a ler" (via sistema:manutenção, na trilha).
--   5. a guarda do usuário só de leitura (`_fn_leitura_nao_grava`) em entrada_arquivos e entrada_trilha (faltava desde a 118110).
-- NADA AQUI ESCREVE EM boletos, boleto_lancamentos nem financeiro_lancamentos_v2. Dado de cliente: só as 2 linhas do item 4.
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.entrada_trilha') is not null then raise exception 'BOLETO-D3d: entrada_trilha já existe: refazer.'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'entrada_arquivos'
             and column_name in ('ignorado_motivo', 'ignorado_detalhe', 'lancamento_id')) then
    raise exception 'BOLETO-D3d: as colunas já existem: refazer.';
  end if;
end $$;

-- ═══ 1. as colunas ═══
alter table public.entrada_arquivos
  add column ignorado_motivo  text check (ignorado_motivo in ('antigo', 'repetido', 'outro_cliente', 'nao_e_documento', 'outro', 'anterior_a_regra')),
  add column ignorado_detalhe text check (length(ignorado_detalhe) <= 300),
  add column lancamento_id    uuid references public.financeiro_lancamentos_v2(id);

-- ═══ 2. a trilha ═══
create table public.entrada_trilha (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id),
  entrada_id  uuid not null references public.entrada_arquivos(id),
  acao        text not null check (acao in ('ignorado', 'voltou', 'resolvido')),
  antes       jsonb not null,
  depois      jsonb not null,
  motivo      text,
  por         uuid,
  via         text not null,
  em          timestamptz not null default now()
);
create index ix_entrada_trilha on public.entrada_trilha (entrada_id, em);
alter table public.entrada_trilha enable row level security;
create policy entrada_trilha_select on public.entrada_trilha for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.entrada_trilha from public, anon, authenticated;
grant select on public.entrada_trilha to authenticated;
grant all on public.entrada_trilha to service_role;

create function public._fn_entrada_trilha_imutavel() returns trigger language plpgsql as $$
begin
  raise exception 'A trilha da entrada não se altera nem se apaga.' using errcode = '42501';
end $$;
revoke all on function public._fn_entrada_trilha_imutavel() from public, anon, authenticated;
create trigger trg_entrada_trilha_imutavel before update or delete on public.entrada_trilha
  for each row execute function public._fn_entrada_trilha_imutavel();

-- ═══ 5. a guarda do só leitura (a mesma das outras tabelas) ═══
create trigger trg_leitura_nao_grava before insert or delete or update on public.entrada_arquivos
  for each statement execute function public._fn_leitura_nao_grava();
create trigger trg_leitura_nao_grava before insert or delete or update on public.entrada_trilha
  for each statement execute function public._fn_leitura_nao_grava();

-- ═══ internas ═══
create function public._fn_entrada_foto(v public.entrada_arquivos) returns jsonb language sql immutable as $$
  select jsonb_build_object('estado', v.estado, 'ignorado_motivo', v.ignorado_motivo, 'ignorado_detalhe', v.ignorado_detalhe,
                            'boleto_id', v.boleto_id, 'lancamento_id', v.lancamento_id)
$$;
revoke all on function public._fn_entrada_foto(public.entrada_arquivos) from public, anon, authenticated;

create function public._fn_entrada_via() returns text language sql stable as $$
  select coalesce(nullif(current_setting('app.via', true), ''), case when auth.uid() is null then 'sistema:manutenção' else 'tela' end)
$$;
revoke all on function public._fn_entrada_via() from public, anon, authenticated;

-- ignorar (a regra única; a pública valida o motivo escolhido na tela, a antiga passa 'anterior_a_regra')
create function public._fn_entrada_ignorar(p_ids uuid[], p_motivo text, p_detalhe text, p_simular boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v entrada_arquivos; v_cli uuid; v_n int := 0; v_ja int := 0; v_det text := nullif(btrim(coalesce(p_detalhe, '')), '');
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Nada escolhido para ignorar.' using errcode = '22023'; end if;
  if cardinality(p_ids) > 200 then raise exception 'No máximo 200 de uma vez.' using errcode = '22023'; end if;
  if p_motivo = 'outro' and v_det is null then raise exception 'Escreva o motivo.' using errcode = 'P0001'; end if;
  if (select count(*) from entrada_arquivos where id = any(p_ids)) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Linha da entrada não encontrada.' using errcode = 'P0002';
  end if;
  select min(cliente_id::text)::uuid into v_cli from entrada_arquivos where id = any(p_ids);
  if exists (select 1 from entrada_arquivos where id = any(p_ids) and cliente_id <> v_cli) then
    raise exception 'Sem acesso a este cliente.' using errcode = '42501';
  end if;
  if not public.tenant_ok(v_cli) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  for v in select * from entrada_arquivos where id = any(p_ids) order by recebido_em, id for update loop
    if v.estado in ('boleto', 'nota') then
      raise exception 'Este arquivo já foi resolvido; para tirá-lo, use "Desfazer" em Resolvidos.' using errcode = 'P0001';
    end if;
    if v.estado = 'dispensado' then v_ja := v_ja + 1; continue; end if;
    v_n := v_n + 1;
    if not p_simular then
      update entrada_arquivos set estado = 'dispensado', ignorado_motivo = p_motivo, ignorado_detalhe = left(v_det, 300),
             dispensado_em = now(), dispensado_por = auth.uid()
       where id = v.id;
      insert into entrada_trilha (cliente_id, entrada_id, acao, antes, depois, motivo, por, via)
      select v.cliente_id, v.id, 'ignorado', public._fn_entrada_foto(v), public._fn_entrada_foto(e), left(v_det, 300), auth.uid(), public._fn_entrada_via()
        from entrada_arquivos e where e.id = v.id;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'ignorados', v_n, 'ja_estavam', v_ja);
end $$;
revoke all on function public._fn_entrada_ignorar(uuid[], text, text, boolean) from public, anon, authenticated;

-- ═══ 3. as RPCs da tela ═══
create function public.fn_entrada_ignorar(p_ids uuid[], p_motivo text, p_detalhe text default null, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_motivo is null or p_motivo not in ('antigo', 'repetido', 'outro_cliente', 'nao_e_documento', 'outro') then
    raise exception 'Escolha o motivo.' using errcode = 'P0001';
  end if;
  return public._fn_entrada_ignorar(p_ids, p_motivo, p_detalhe, p_simular);
end $$;

-- voltar para "a ler": o ignorado (D6) e o resolvido ("Desfazer": só tira o vínculo da linha; o boleto segue na caixa e o lançamento fica)
create function public.fn_entrada_voltar(p_id uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v entrada_arquivos;
begin
  select * into v from entrada_arquivos where id = p_id for update;
  if not found then raise exception 'Linha da entrada não encontrada.' using errcode = 'P0002'; end if;
  if not public.tenant_ok(v.cliente_id) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if v.estado not in ('dispensado', 'boleto', 'nota') then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', true);
  end if;
  if v.md5 is null then raise exception 'Esta linha não tem arquivo para ler.' using errcode = 'P0001'; end if;
  if not p_simular then
    update entrada_arquivos set estado = 'a_ler', ignorado_motivo = null, ignorado_detalhe = null, boleto_id = null, lancamento_id = null,
           dispensado_em = null, dispensado_por = null, lido_em = null, lido_por = null
     where id = v.id;
    insert into entrada_trilha (cliente_id, entrada_id, acao, antes, depois, motivo, por, via)
    select v.cliente_id, v.id, 'voltou', public._fn_entrada_foto(v), public._fn_entrada_foto(e), null, auth.uid(), public._fn_entrada_via()
      from entrada_arquivos e where e.id = v.id;
  end if;
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', false, 'era', v.estado);
end $$;

-- resolver: o boleto entrou na caixa (o id do banco) ou a nota foi lançada/vinculada (o lançamento, quando a tela o sabe)
create function public.fn_entrada_resolver(p_id uuid, p_estado text, p_boleto_id uuid default null, p_lancamento_id uuid default null,
                                           p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v entrada_arquivos; v_cli uuid;
begin
  if p_estado not in ('boleto', 'nota') then raise exception 'Estado inválido.' using errcode = '22023'; end if;
  select * into v from entrada_arquivos where id = p_id for update;
  if not found then raise exception 'Linha da entrada não encontrada.' using errcode = 'P0002'; end if;
  if not public.tenant_ok(v.cliente_id) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  if v.estado in ('boleto', 'nota', 'dispensado') then
    raise exception 'Este arquivo já foi resolvido ou ignorado.' using errcode = 'P0001';
  end if;
  if v.md5 is null then raise exception 'Esta linha não tem arquivo.' using errcode = 'P0001'; end if;
  if p_estado = 'boleto' then
    if p_boleto_id is null then raise exception 'Falta o boleto.' using errcode = '22023'; end if;
    select cliente_id into v_cli from boletos where id = p_boleto_id;
    if v_cli is distinct from v.cliente_id then raise exception 'O boleto não é deste cliente.' using errcode = '42501'; end if;
  elsif p_boleto_id is not null then raise exception 'Só o estado boleto leva o boleto.' using errcode = '22023';
  end if;
  if p_lancamento_id is not null then
    select cliente_id into v_cli from financeiro_lancamentos_v2 where id = p_lancamento_id;
    if v_cli is distinct from v.cliente_id then raise exception 'O lançamento não é deste cliente.' using errcode = '42501'; end if;
  end if;
  if not p_simular then
    update entrada_arquivos set estado = p_estado, boleto_id = p_boleto_id, lancamento_id = p_lancamento_id, lido_em = now(), lido_por = auth.uid()
     where id = v.id;
    insert into entrada_trilha (cliente_id, entrada_id, acao, antes, depois, motivo, por, via)
    select v.cliente_id, v.id, 'resolvido', public._fn_entrada_foto(v), public._fn_entrada_foto(e), null, auth.uid(), public._fn_entrada_via()
      from entrada_arquivos e where e.id = v.id;
  end if;
  return jsonb_build_object('ok', true, 'simulado', p_simular);
end $$;

-- a tela antiga (até o push): o "dispensar" grava o motivo 'anterior_a_regra' e a trilha (assinatura e retorno de hoje)
create or replace function public.fn_entrada_dispensar(p_id uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := public._fn_entrada_ignorar(array[p_id], 'anterior_a_regra', null, p_simular);
  return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_estava', (r ->> 'ja_estavam')::int > 0);
end $$;

revoke all on function public.fn_entrada_ignorar(uuid[], text, text, boolean) from public, anon;
revoke all on function public.fn_entrada_voltar(uuid, boolean) from public, anon;
revoke all on function public.fn_entrada_resolver(uuid, text, uuid, uuid, boolean) from public, anon;
grant execute on function public.fn_entrada_ignorar(uuid[], text, text, boolean) to authenticated;
grant execute on function public.fn_entrada_voltar(uuid, boolean) to authenticated;
grant execute on function public.fn_entrada_resolver(uuid, text, uuid, uuid, boolean) to authenticated;

-- ═══ 4. D5: os 2 XMLs da Pontero (NJ) dispensados em 17/11 voltam para "a ler" ═══
do $$
declare v entrada_arquivos;
begin
  perform set_config('app.via', 'sistema:manutenção', true);
  for v in select * from entrada_arquivos
            where id in ('2df413c3-7390-4f89-8556-f5cf7e517e52', '4afe8530-a45e-47a5-9e27-c0e53c49f034')
              and cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' and estado = 'dispensado' and tipo = 'xml'
            for update loop
    update entrada_arquivos set estado = 'a_ler', dispensado_em = null, dispensado_por = null where id = v.id;
    insert into entrada_trilha (cliente_id, entrada_id, acao, antes, depois, motivo, por, via)
    select v.cliente_id, v.id, 'voltou', public._fn_entrada_foto(v) || jsonb_build_object('dispensado_em', v.dispensado_em, 'dispensado_por', v.dispensado_por),
           public._fn_entrada_foto(e), 'D5 Gabriel 18/11 07:50: dispensado antes da regra do motivo; volta para "a ler"', null, 'sistema:manutenção'
      from entrada_arquivos e where e.id = v.id;
  end loop;
  perform set_config('app.via', '', true);   -- o resto da transação não herda a via da manutenção
end $$;

-- o que ainda estiver dispensado (de outro cliente ou depois desta escrita) leva o motivo 'anterior_a_regra' antes da regra
update public.entrada_arquivos set ignorado_motivo = 'anterior_a_regra' where estado = 'dispensado' and ignorado_motivo is null;

alter table public.entrada_arquivos
  add constraint chk_entrada_ignorado_tem_motivo check ((estado = 'dispensado') = (ignorado_motivo is not null)),
  add constraint chk_entrada_outro_tem_detalhe check (ignorado_motivo is distinct from 'outro' or nullif(btrim(ignorado_detalhe), '') is not null),
  add constraint chk_entrada_lancamento_so_resolvido check (lancamento_id is null or estado in ('boleto', 'nota'));
