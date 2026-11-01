-- RLS-PERF-01 — a policy de SELECT de 5 tabelas avalia o tenant UMA vez por consulta, não uma vez por linha.
--
-- Hoje: `tenant_ok(cliente_id)` é SECURITY DEFINER (o planner não a abre) e roda por LINHA lida; nos itens, ainda com a
-- subconsulta do fechamento por linha. Na financeiro_lancamentos_v2 o `auth.uid()` fora de `(select …)` também é avaliado
-- por linha. FASE 0: visao-20261101-0640-ROTULOS-gate-e-RLS-PERF-01-fase0 (14 leituras de 10× a 80× mais rápidas, mesmo
-- resultado; os 12 casos de tenant iguais).
--
-- Mesma regra de visibilidade, as mesmas funções que o `tenant_ok` usa:
--   admin AgroInBlue vê tudo; os demais, só as linhas dos clientes de que são membros ativos; sem vínculo / sem `sub`, nada.
-- Itens: pelo fechamento (a tabela não tem cliente_id), na forma EXISTS (medida contra IN em Q1–Q6: 82,5 × 115,4 ms no
-- conjunto gestor + admin).
--
-- Só as policies de SELECT (o nome e os papéis ficam). INSERT/UPDATE/DELETE seguem com `tenant_ok`.
-- Guarda: cada policy tem de estar com o texto de hoje (md5 do qual); se alguém a mudou, nada é alterado.

do $$
declare
  r record;
  esperado jsonb := jsonb_build_object(
    'fechamento_pastos.fechamento_pastos_select_tenant',          'eabbc46a2882faf19ce248b0b0ab0b1e',
    'zoot_mensal_cache.zoot_mensal_cache_select_tenant',          'eabbc46a2882faf19ce248b0b0ab0b1e',
    'fazenda_geometrias.fazenda_geometrias_select_tenant',        'eabbc46a2882faf19ce248b0b0ab0b1e',
    'financeiro_lancamentos_v2.financeiro_lancamentos_v2_select', 'a71d098dccd57399b38a920ac18a841a',
    'fechamento_pasto_itens.fechamento_pasto_itens_select_tenant','806b1fae25496788593295b444d2f258');
  achados int := 0;
begin
  for r in
    select tablename || '.' || policyname as chave, md5(qual) as m
      from pg_policies
     where schemaname = 'public' and cmd = 'SELECT'
       and tablename || '.' || policyname in (select jsonb_object_keys(esperado))
  loop
    if r.m is distinct from esperado ->> r.chave then
      raise exception 'RLS-PERF-01: a policy % mudou desde a FASE 0 (md5 %); nada alterado', r.chave, r.m;
    end if;
    achados := achados + 1;
  end loop;
  if achados <> 5 then
    raise exception 'RLS-PERF-01: esperava 5 policies de SELECT, achei %; nada alterado', achados;
  end if;
end $$;

alter policy fechamento_pastos_select_tenant on public.fechamento_pastos
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy zoot_mensal_cache_select_tenant on public.zoot_mensal_cache
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy fazenda_geometrias_select_tenant on public.fazenda_geometrias
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy financeiro_lancamentos_v2_select on public.financeiro_lancamentos_v2
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy fechamento_pasto_itens_select_tenant on public.fechamento_pasto_itens
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or exists (select 1
                      from public.fechamento_pastos p
                     where p.id = fechamento_pasto_itens.fechamento_id
                       and p.cliente_id in (select public.get_user_cliente_ids((select auth.uid())))));
