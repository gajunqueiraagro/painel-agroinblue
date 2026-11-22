-- NOTAS-RECEITA · CIÊNCIA AUTOMÁTICA (210210) — REGRA DO PRODUTO (Gabriel 18/11 09:02 + 19/11 06:11): todo cliente com certificado ativo,
-- atuais e futuros, nada por cliente. SÓ a Ciência da Operação; Confirmação/Desconhecimento/Não realizada seguem nota a nota com OK.
-- Onde roda: no fim de cada BUSCA bem-sucedida (137/138, sem consChNFe) a borda `fiscal-dfe-buscar` pede as pendentes do titular
-- e envia a ciência de cada uma pela borda `fiscal-dfe-ciencia` (via 'automatica', service_role) — a trilha/protocolo já é a
-- `fiscal_dfe_eventos` (lote 23). Este lote traz:
-- (1) fiscal_dfe_parametros: o PARÂMETRO DO PRODUTO (uma linha só): liga/desliga e quantas por busca. Desligar = um UPDATE, sem deploy.
-- (2) fn_fiscal_dfe_ciencia_pendentes: as notas em RESUMO (resNFe, sem XML, não canceladas) do titular SEM ciência registrada;
--     não repete recusa da Receita (cStat ≠ 135/573) nem falha 3 vezes; só com certificado ativo e válido. Só service_role.
-- (3) fn_fiscal_dfe_ciencia_contador: o CONTADOR por titular (com ciência · automáticas · recusadas · falhas · pendentes) para a tela.

create table public.fiscal_dfe_parametros (
  id boolean primary key default true check (id),
  ciencia_automatica boolean not null default true,
  ciencia_por_busca integer not null default 10 check (ciencia_por_busca between 1 and 20),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
insert into public.fiscal_dfe_parametros (id) values (true);
alter table public.fiscal_dfe_parametros enable row level security;
revoke all on table public.fiscal_dfe_parametros from public, anon, authenticated;
grant all on table public.fiscal_dfe_parametros to service_role;

create or replace function public.fn_fiscal_dfe_ciencia_pendentes(p_titular_id uuid, p_ambiente text)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog', 'public'
as $function$
declare v_par public.fiscal_dfe_parametros; v_cert boolean; v_chaves text[];
begin
  select * into v_par from public.fiscal_dfe_parametros where id;
  if not coalesce(v_par.ciencia_automatica, false) then
    return jsonb_build_object('ligada', false, 'limite', 0, 'chaves', '[]'::jsonb, 'motivo', 'desligada');
  end if;
  select exists (select 1 from public.fiscal_certificados c join public.fiscal_titulares t on t.id = c.titular_id
                  where c.titular_id = p_titular_id and c.situacao = 'ativo' and c.valido_ate > now() and t.ativo)
    into v_cert;
  if not v_cert then
    return jsonb_build_object('ligada', true, 'limite', 0, 'chaves', '[]'::jsonb, 'motivo', 'sem_certificado');
  end if;
  select coalesce(array_agg(x.chave order by x.emissao nulls last, x.chave), '{}') into v_chaves
    from (select r.chave, r.emissao
            from public.fiscal_dfe_recebidos r
           where r.titular_id = p_titular_id and r.tipo = 'nfe' and r.situacao = 'resumo' and r.xml is null
             and not exists (select 1 from public.fiscal_dfe_eventos e
                              where e.titular_id = r.titular_id and e.chave = r.chave and e.ambiente = p_ambiente
                                and e.cstat is not null)
             and (select count(*) from public.fiscal_dfe_eventos e
                   where e.titular_id = r.titular_id and e.chave = r.chave and e.ambiente = p_ambiente and e.falha is not null) < 3
           order by r.emissao nulls last, r.chave
           limit v_par.ciencia_por_busca) x;
  return jsonb_build_object('ligada', true, 'limite', v_par.ciencia_por_busca, 'chaves', to_jsonb(v_chaves));
end $function$;
revoke all on function public.fn_fiscal_dfe_ciencia_pendentes(uuid, text) from public, anon, authenticated;
grant execute on function public.fn_fiscal_dfe_ciencia_pendentes(uuid, text) to service_role;

create or replace function public.fn_fiscal_dfe_ciencia_contador(p_cliente uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'titular_id', t.id,
      'com_ciencia', (select count(distinct e.chave) from public.fiscal_dfe_eventos e where e.titular_id = t.id and e.cstat in ('135', '573')),
      'automaticas', (select count(distinct e.chave) from public.fiscal_dfe_eventos e where e.titular_id = t.id and e.cstat in ('135', '573') and e.via = 'automatica'),
      'recusadas', (select count(distinct e.chave) from public.fiscal_dfe_eventos e where e.titular_id = t.id and e.cstat is not null and e.cstat not in ('135', '573')),
      'falhas', (select count(*) from public.fiscal_dfe_eventos e where e.titular_id = t.id and e.falha is not null),
      'pendentes', (select count(*) from public.fiscal_dfe_recebidos r where r.titular_id = t.id and r.tipo = 'nfe' and r.situacao = 'resumo' and r.xml is null
                      and not exists (select 1 from public.fiscal_dfe_eventos e where e.titular_id = t.id and e.chave = r.chave and e.cstat is not null)),
      'ultima', (select max(e.em) from public.fiscal_dfe_eventos e where e.titular_id = t.id)) order by t.nome), '[]'::jsonb)
    from public.fiscal_titulares t where t.cliente_id = p_cliente);
end $function$;
revoke all on function public.fn_fiscal_dfe_ciencia_contador(uuid) from public, anon;
grant execute on function public.fn_fiscal_dfe_ciencia_contador(uuid) to authenticated;
