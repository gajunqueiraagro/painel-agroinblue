-- AJUSTE-CAMPEIRO-01 · D4 (Gabriel 06/11 14:35: D1–D4 conforme a recomendação; trava no banco com prévia e GO primeiro).
-- A "conta de ajuste do campeiro" é o pasto com `tipo_uso = 'divergencia'` (D1: o valor fica; muda só o rótulo na tela). Ela guarda os
-- animais que o campeiro não achou no pasto: conta no REBANHO (a P1 soma) e nunca é PASTO (sem área, sem grupo, sem desenho).
-- O que hoje é costume vira trava:
--   1. uma conta ATIVA por fazenda (índice único parcial);
--   2. a conta nunca tem área, área produtiva nem grupo de pastejo (gatilho em `pastos`, 23514);
--   3. a conta nunca recebe desenho (gatilho em `fazenda_geometrias`, 23514).
-- Caminho de volta: a conta se desativa como qualquer pasto (a ativa nova passa); a trava se desfaz com DROP do índice e dos gatilhos.
-- Medido em 06/11 antes de escrever: 11 contas, 9 ativas, nenhuma fazenda com 2 ativas, nenhuma com área, grupo ou desenho.
set lock_timeout = '2s';

do $$
begin
  if exists (select 1 from public.pastos where tipo_uso = 'divergencia' and ativo group by fazenda_id having count(*) > 1) then
    raise exception 'há fazenda com 2 contas de ajuste ativas: resolver antes.';
  end if;
  if exists (select 1 from public.pastos where tipo_uso = 'divergencia'
              and (coalesce(area, 0) <> 0 or coalesce(area_produtiva_ha, 0) <> 0 or grupo_id is not null)) then
    raise exception 'há conta de ajuste com área ou grupo: resolver antes.';
  end if;
  if exists (select 1 from public.fazenda_geometrias g join public.pastos p on p.id = g.pasto_id where p.tipo_uso = 'divergencia') then
    raise exception 'há conta de ajuste com desenho: resolver antes.';
  end if;
end $$;

create unique index ux_pastos_conta_ajuste_por_fazenda on public.pastos (fazenda_id) where tipo_uso = 'divergencia' and ativo;
comment on index public.ux_pastos_conta_ajuste_por_fazenda is
  'AJUSTE-CAMPEIRO-01 — uma conta de ajuste do campeiro (tipo_uso divergencia) ATIVA por fazenda.';

create or replace function public._fn_pastos_conta_ajuste_guarda()
returns trigger language plpgsql set search_path = public as $f$
begin
  if new.tipo_uso = 'divergencia'
     and (coalesce(new.area, 0) <> 0 or coalesce(new.area_produtiva_ha, 0) <> 0 or new.grupo_id is not null) then
    raise exception 'A conta de ajuste do campeiro não tem área nem grupo de pastejo.' using errcode = '23514';
  end if;
  return new;
end $f$;
revoke all on function public._fn_pastos_conta_ajuste_guarda() from public, anon;

create trigger trg_pastos_conta_ajuste_guarda before insert or update of tipo_uso, area, area_produtiva_ha, grupo_id on public.pastos
  for each row execute function public._fn_pastos_conta_ajuste_guarda();

create or replace function public._fn_geometria_sem_conta_ajuste()
returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if new.pasto_id is not null
     and exists (select 1 from public.pastos p where p.id = new.pasto_id and p.tipo_uso = 'divergencia') then
    raise exception 'A conta de ajuste do campeiro não tem desenho no mapa.' using errcode = '23514';
  end if;
  return new;
end $f$;
revoke all on function public._fn_geometria_sem_conta_ajuste() from public, anon;

create trigger trg_geometria_sem_conta_ajuste before insert or update of pasto_id on public.fazenda_geometrias
  for each row execute function public._fn_geometria_sem_conta_ajuste();
