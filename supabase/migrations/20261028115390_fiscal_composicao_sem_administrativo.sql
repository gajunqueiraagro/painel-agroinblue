-- FISCAL · 20261028115390 — "ADMINISTRATIVO NÃO É FAZENDA" na composição fazenda ↔ titular (Chat 15/11 08:25, lote 6 b).
-- O Administrativo é o centro de custo de cada cliente (criado pelo provisionamento: nome 'Administrativo', código 'ADM'); não tem dono,
-- IE nem participação — a despesa administrativa vai pelo rateio. Regra no BANCO para todo escritor da composição (gravar, antecipar,
-- desfazer): um gatilho recusa a linha viva numa fazenda administrativa; e a porta de gravar recusa já na PRÉVIA (a prévia nunca promete
-- o que o gravar vai recusar). Encerrar (lista vazia) continua aceito: é assim que o vínculo que existe sai.
-- · Quem é "administrativa": a MESMA regra da tela (`fazendaAdministrativa` em src/lib/financeiro/escopoDoSubcentro.ts: o nome contém
--   "administrat", sem acento e sem caixa). Hoje: 6 fazendas, uma por cliente, todas 'Administrativo'/ADM.
set local lock_timeout = '2s';

create or replace function public._fn_fazenda_e_administrativa(p_fazenda_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.fazendas f where f.id = p_fazenda_id and lower(coalesce(f.nome, '')) like '%administrat%')
$$;
revoke all on function public._fn_fazenda_e_administrativa(uuid) from public, anon;
grant execute on function public._fn_fazenda_e_administrativa(uuid) to authenticated, service_role;  -- o gatilho roda com quem grava

create or replace function public._fn_fiscal_composicao_sem_administrativo()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.substituida_em is null and public._fn_fazenda_e_administrativa(new.fazenda_id) then
    raise exception using errcode = '23514',
      message = 'Administrativo não é fazenda: não tem titular nem participação (a despesa administrativa vai pelo rateio).';
  end if;
  return new;
end $$;
revoke all on function public._fn_fiscal_composicao_sem_administrativo() from public, anon, authenticated;

create trigger trg_00_composicao_sem_administrativo
  before insert or update of fazenda_id, substituida_em on public.fiscal_fazenda_titulares
  for each row execute function public._fn_fiscal_composicao_sem_administrativo();

-- a prévia da porta de gravar já recusa (patch guardado pelo md5 da função de hoje; a âncora casa 1 vez)
do $$
declare d text := pg_get_functiondef('public.fn_fiscal_fazenda_titulares_gravar(uuid,date,jsonb,boolean)'::regprocedure);
  a text := $A$  if p_titulares is null or jsonb_typeof(p_titulares) <> 'array' then raise exception 'Informe a lista de titulares.'; end if;$A$;
  b text := $B$  if p_titulares is null or jsonb_typeof(p_titulares) <> 'array' then raise exception 'Informe a lista de titulares.'; end if;
  if jsonb_array_length(p_titulares) > 0 and public._fn_fazenda_e_administrativa(f.id) then
    raise exception using errcode = '23514',
      message = 'Administrativo não é fazenda: não tem titular nem participação (a despesa administrativa vai pelo rateio).';
  end if;$B$;
begin
  if md5(d) <> '3531daf65eaf0754e6c0c9724e173a17' then raise exception 'FISCAL 115390: a fn_fiscal_fazenda_titulares_gravar mudou (md5 %): refazer o patch.', md5(d); end if;
  if (length(d) - length(replace(d, a, ''))) / length(a) <> 1 then raise exception 'FISCAL 115390: a âncora não casa 1 vez.'; end if;
  execute replace(d, a, b);
end $$;
