-- RLS-PERF-02 — o 2º lote: a policy de SELECT das 15 tabelas mais lidas (pg_stat_statements) avalia o tenant UMA vez por
-- consulta, não uma vez por linha. Mesmo método do RLS-PERF-01 (114090).
--
-- Hoje: 11 com `tenant_ok(cliente_id)` (SECURITY DEFINER, roda por LINHA); financeiro_plano_contas com
-- `cliente_id IS NULL OR tenant_ok(cliente_id)` (o catálogo global segue legível por todos); zoo_operacao_movimentacoes com
-- `is_admin_agroinblue(auth.uid()) OR … get_user_cliente_ids(auth.uid())`; extrato_bancario_v2 e conciliacao_bancaria_itens com
-- `is_admin_agroinblue(auth.uid()) OR cliente_id IN (select … from cliente_membros …)` — o `auth.uid()` fora de `(select …)`, por linha.
--
-- Mesma regra de visibilidade, as mesmas funções que o `tenant_ok` usa: admin AgroInBlue vê tudo; os demais, só as linhas dos
-- clientes de que são membros ativos (`get_user_cliente_ids` = `cliente_membros` ativos do usuário); sem vínculo / sem `sub`, nada.
--
-- Só as policies de SELECT (o nome e os papéis ficam). INSERT/UPDATE/DELETE não mudam.
-- Guarda: cada policy tem de estar com o texto de hoje (md5 do qual); se alguém a mudou, nada é alterado.

do $$
declare
  r record;
  esperado jsonb := jsonb_build_object(
    'lancamentos.lancamentos_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'pastos.pastos_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'financeiro_fornecedores.financeiro_fornecedores_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'financeiro_saldos_bancarios_v2.financeiro_saldos_bancarios_v2_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'extrato_bancario_v2.extrato_v2_select', 'b799ef5512157bdb7fc4a4cbcf7a6118',
    'planejamento_financeiro.planejamento_financeiro_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'meta_gmd_mensal.meta_gmd_mensal_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'conciliacao_bancaria_itens.conc_itens_select', 'b799ef5512157bdb7fc4a4cbcf7a6118',
    'saldos_iniciais.saldos_iniciais_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'financeiro_importacoes_v2.financeiro_importacoes_v2_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'valor_rebanho_fechamento.valor_rebanho_fechamento_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'financeiro_plano_contas.financeiro_plano_contas_select_tenant', '5eb7506838e3c0834df68a22185b7393',
    'planejamento_area_meta.planejamento_area_meta_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'valor_rebanho_meta_validada.valor_rebanho_meta_validada_select_tenant', 'eabbc46a2882faf19ce248b0b0ab0b1e',
    'zoo_operacao_movimentacoes.zoo_operacao_movimentacoes_select', 'a71d098dccd57399b38a920ac18a841a');
  achados int := 0;
begin
  for r in
    select tablename || '.' || policyname as chave, md5(qual) as m
      from pg_policies
     where schemaname = 'public' and cmd = 'SELECT'
       and tablename || '.' || policyname in (select jsonb_object_keys(esperado))
  loop
    if r.m is distinct from esperado ->> r.chave then
      raise exception 'RLS-PERF-02: a policy % mudou desde a FASE 0 (md5 %); nada alterado', r.chave, r.m;
    end if;
    achados := achados + 1;
  end loop;
  if achados <> 15 then
    raise exception 'RLS-PERF-02: esperava 15 policies de SELECT, achei %; nada alterado', achados;
  end if;
end $$;

alter policy lancamentos_select_tenant on public.lancamentos
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy pastos_select_tenant on public.pastos
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy financeiro_fornecedores_select_tenant on public.financeiro_fornecedores
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy financeiro_saldos_bancarios_v2_select_tenant on public.financeiro_saldos_bancarios_v2
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy extrato_v2_select on public.extrato_bancario_v2
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy planejamento_financeiro_select_tenant on public.planejamento_financeiro
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy meta_gmd_mensal_select_tenant on public.meta_gmd_mensal
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy conc_itens_select on public.conciliacao_bancaria_itens
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy saldos_iniciais_select_tenant on public.saldos_iniciais
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy financeiro_importacoes_v2_select_tenant on public.financeiro_importacoes_v2
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy valor_rebanho_fechamento_select_tenant on public.valor_rebanho_fechamento
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy financeiro_plano_contas_select_tenant on public.financeiro_plano_contas
  using (cliente_id is null
         or (select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy planejamento_area_meta_select_tenant on public.planejamento_area_meta
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy valor_rebanho_meta_validada_select_tenant on public.valor_rebanho_meta_validada
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));

alter policy zoo_operacao_movimentacoes_select on public.zoo_operacao_movimentacoes
  using ((select public.is_admin_agroinblue((select auth.uid())))
         or cliente_id in (select public.get_user_cliente_ids((select auth.uid()))));
