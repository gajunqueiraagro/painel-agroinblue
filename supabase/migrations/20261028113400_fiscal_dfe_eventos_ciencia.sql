-- NOTAS-RECEITA · CIÊNCIA DA OPERAÇÃO (210210) — a TRILHA dos eventos enviados à Receita (FASE 0 18/11 09:14, OK do desenho do Gabriel).
-- Uma linha por envio (aceito OU recusado): quem pediu, a chave, o evento, o cStat do lote e do evento, o protocolo e a resposta crua (sem o
-- XML da nota; a resposta do evento não traz dado da nota). Só o evento 210210 entra (a Lambda também só deixa passar ele).
-- O mesmo padrão das outras tabelas fiscais: RLS de leitura por cliente (tenant_ok), escrita SÓ pela service_role pela função (a borda).
create table public.fiscal_dfe_eventos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null,
  titular_id uuid not null references public.fiscal_titulares(id),
  chave text not null check (chave ~ '^\d{44}$'),
  tp_evento text not null check (tp_evento = '210210'),
  n_seq integer not null default 1 check (n_seq = 1),
  ambiente text not null check (ambiente in ('producao', 'homologacao')),
  cstat_lote text,
  cstat text,
  x_motivo text,
  n_prot text,
  dh_registro timestamptz,
  falha text,
  via text not null check (via in ('manual', 'automatica')),
  autor uuid,
  certificado_id uuid,
  bruto text,
  em timestamptz not null default now()
);
create index fiscal_dfe_eventos_chave on public.fiscal_dfe_eventos (cliente_id, chave);
create index fiscal_dfe_eventos_titular_em on public.fiscal_dfe_eventos (titular_id, em desc);
alter table public.fiscal_dfe_eventos enable row level security;
create policy fiscal_dfe_eventos_ler on public.fiscal_dfe_eventos for select using (public.tenant_ok(cliente_id));
revoke all on table public.fiscal_dfe_eventos from public, anon, authenticated;
grant select on table public.fiscal_dfe_eventos to authenticated;
grant all on table public.fiscal_dfe_eventos to service_role;

-- A borda grava pelo titular (o cliente vem do titular, nunca do pedido). Devolve o id e se a ciência ficou registrada
-- (135 = registrado e vinculado; 573 = duplicidade: já havia ciência — os dois contam como "com ciência").
create or replace function public.fn_fiscal_dfe_evento_registrar(
  p_titular_id uuid, p_chave text, p_ambiente text, p_cstat_lote text, p_cstat text, p_x_motivo text, p_n_prot text,
  p_dh_registro timestamptz, p_falha text, p_via text, p_autor uuid, p_certificado_id uuid, p_bruto text)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog, public'
as $function$
declare v_cliente uuid; v_id bigint;
begin
  select cliente_id into v_cliente from public.fiscal_titulares where id = p_titular_id;
  if v_cliente is null then raise exception using errcode = 'P0001', message = 'Titular não encontrado.'; end if;
  insert into public.fiscal_dfe_eventos (cliente_id, titular_id, chave, tp_evento, ambiente, cstat_lote, cstat, x_motivo, n_prot, dh_registro,
                                         falha, via, autor, certificado_id, bruto)
  values (v_cliente, p_titular_id, regexp_replace(coalesce(p_chave, ''), '\D', '', 'g'), '210210', p_ambiente, p_cstat_lote, p_cstat,
          left(p_x_motivo, 500), p_n_prot, p_dh_registro, p_falha, p_via, p_autor, p_certificado_id, left(p_bruto, 20000))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'com_ciencia', coalesce(p_cstat in ('135', '573'), false));
end $function$;
revoke all on function public.fn_fiscal_dfe_evento_registrar(uuid, text, text, text, text, text, text, timestamptz, text, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fn_fiscal_dfe_evento_registrar(uuid, text, text, text, text, text, text, timestamptz, text, text, uuid, uuid, text)
  to service_role;
