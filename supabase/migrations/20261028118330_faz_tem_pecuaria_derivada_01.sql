-- FAZ-TEM-PECUARIA-DERIVADA-01 — "tem pecuária" passa a ser mantida pelo banco; "Administrativo" ganha coluna própria.
-- Decisões do Gabriel 17/11/2026 12:07: D1 SÓ LIGA (entrou gado → tem_pecuaria = true; nunca desliga sozinho); D2 Administrativo em
-- coluna própria; D3 o cadastro da fazenda pergunta se é administrativa (tela: PR seguinte, depois deste lote).
--
-- O QUE FAZ
--  1. fazendas.eh_administrativa (boolean, padrão false); as 6 "Administrativo" de hoje (nome = 'Administrativo' e sem pecuária) = true.
--  2. _fn_fazenda_tem_rebanho(fazenda): saldo inicial > 0 OU card com gado OU lançamento zootécnico REALIZADO vivo. Interna, fechada.
--  3. Gatilho que SÓ LIGA, em saldos_iniciais, fechamento_pasto_itens e lancamentos: gado entrou numa fazenda sem pecuária e que não é
--     administrativa → tem_pecuaria = true. Nunca desliga.
--  4. Guarda em fazendas: desligar a pecuária ou marcar como administrativa uma fazenda COM rebanho é recusado (P0001, frase pronta);
--     fazenda administrativa nasce/fica sem pecuária.
--  5. provisionar_cliente: o Administrativo que ele cria nasce com eh_administrativa = true (patch guardado por md5 do corpo).
-- O QUE NÃO FAZ: não muda o padrão de tem_pecuaria (true) nem os leitores da tela — o padrão só vira false DEPOIS que os 6 leitores que
-- usam "tem_pecuaria = false" como "é Administrativo" passarem à coluna nova (PR da tela). Nenhuma fazenda muda de tem_pecuaria aqui.

set local lock_timeout = '2s';
select set_config('app.via', 'FAZ-TEM-PECUARIA-DERIVADA-01', true);

-- 1. coluna + as 6 de hoje
alter table public.fazendas add column eh_administrativa boolean not null default false;
comment on column public.fazendas.eh_administrativa is
  'FAZ-TEM-PECUARIA-DERIVADA-01: fazenda administrativa (centro de custo, sem rebanho). Não se deduz de tem_pecuaria.';

do $adm$
declare v_n int;
begin
  update public.fazendas set eh_administrativa = true where nome = 'Administrativo' and tem_pecuaria = false;
  get diagnostics v_n = row_count;
  if v_n <> 6 then raise exception 'FAZ-TEM-PECUARIA: % fazendas Administrativo, esperado 6. Nada gravado.', v_n; end if;
end $adm$;

-- 2. a regra
create or replace function public._fn_fazenda_tem_rebanho(p_fazenda uuid) returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (select 1 from saldos_iniciais s where s.fazenda_id = p_fazenda and s.quantidade > 0)
      or exists (select 1 from fechamento_pastos fp join fechamento_pasto_itens i on i.fechamento_id = fp.id
                  where fp.fazenda_id = p_fazenda and i.quantidade > 0)
      or exists (select 1 from lancamentos l where l.fazenda_id = p_fazenda and l.cenario = 'realizado' and not coalesce(l.cancelado, false));
$f$;
revoke all on function public._fn_fazenda_tem_rebanho(uuid) from public, anon, authenticated;

-- 3. o gatilho que só liga
create or replace function public._fn_fazenda_liga_pecuaria() returns trigger
language plpgsql security definer set search_path = public as $f$
declare v_faz uuid;
begin
  if tg_table_name = 'saldos_iniciais' then
    if coalesce(new.quantidade, 0) <= 0 then return null; end if;
    v_faz := new.fazenda_id;
  elsif tg_table_name = 'fechamento_pasto_itens' then
    if coalesce(new.quantidade, 0) <= 0 then return null; end if;
    select fp.fazenda_id into v_faz from fechamento_pastos fp where fp.id = new.fechamento_id;
  else -- lancamentos
    if new.cenario is distinct from 'realizado' or coalesce(new.cancelado, false) then return null; end if;
    v_faz := new.fazenda_id;
  end if;
  update fazendas set tem_pecuaria = true
   where id = v_faz and tem_pecuaria is distinct from true and not eh_administrativa;
  return null;
end $f$;
revoke all on function public._fn_fazenda_liga_pecuaria() from public, anon, authenticated;

create trigger trg_zz_fazenda_liga_pecuaria after insert or update of quantidade, fazenda_id on public.saldos_iniciais
  for each row execute function public._fn_fazenda_liga_pecuaria();
create trigger trg_zz_fazenda_liga_pecuaria after insert or update of quantidade, fechamento_id on public.fechamento_pasto_itens
  for each row execute function public._fn_fazenda_liga_pecuaria();
create trigger trg_zz_fazenda_liga_pecuaria after insert or update of cenario, cancelado, fazenda_id on public.lancamentos
  for each row execute function public._fn_fazenda_liga_pecuaria();

-- 4. a guarda em fazendas
create or replace function public._fn_fazenda_pecuaria_guarda() returns trigger
language plpgsql security definer set search_path = public as $f$
begin
  if new.eh_administrativa then
    if tg_op = 'UPDATE' and not old.eh_administrativa and public._fn_fazenda_tem_rebanho(new.id) then
      raise exception 'A fazenda % tem rebanho; não pode ser administrativa.', new.nome using errcode = 'P0001';
    end if;
    new.tem_pecuaria := false;
  elsif tg_op = 'UPDATE' and old.tem_pecuaria is true and new.tem_pecuaria is not true and public._fn_fazenda_tem_rebanho(new.id) then
    raise exception 'A fazenda % tem rebanho; a pecuária não se desliga.', new.nome using errcode = 'P0001';
  end if;
  return new;
end $f$;
revoke all on function public._fn_fazenda_pecuaria_guarda() from public, anon, authenticated;

create trigger trg_fazenda_pecuaria_guarda before insert or update of tem_pecuaria, eh_administrativa on public.fazendas
  for each row execute function public._fn_fazenda_pecuaria_guarda();

-- 5. provisionar_cliente: o Administrativo nasce marcado (patch no corpo vigente, guardado por md5)
do $prov$
declare
  v_def text := pg_get_functiondef('public.provisionar_cliente(text, text)'::regprocedure);
  v_de  text := 'INSERT INTO public.fazendas AS f (nome, cliente_id, tem_pecuaria, owner_id, codigo, codigo_importacao)
       VALUES (''Administrativo'', v_cli, false, v_uid, ''ADM'', ''ADM'')';
  v_para text := 'INSERT INTO public.fazendas AS f (nome, cliente_id, tem_pecuaria, eh_administrativa, owner_id, codigo, codigo_importacao)
       VALUES (''Administrativo'', v_cli, false, true, v_uid, ''ADM'', ''ADM'')';
begin
  if md5(v_def) <> 'e28582d547a99b1497762ead5014d4a7' then
    raise exception 'FAZ-TEM-PECUARIA: provisionar_cliente mudou desde a prévia (md5 %). Nada gravado.', md5(v_def);
  end if;
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'FAZ-TEM-PECUARIA: a âncora do INSERT do Administrativo não casa 1 vez. Nada gravado.';
  end if;
  execute replace(v_def, v_de, v_para);
end $prov$;
