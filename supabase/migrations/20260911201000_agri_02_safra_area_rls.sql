-- 20260911201000_agri_02_safra_area_rls.sql
-- AGRI-02-SEC: agri_safra_area nasceu sem RLS (anon com acesso total). Segue o padrao
-- dos vizinhos zootecnicos (pastos, financeiro_safras: RLS on, policies abertas): RLS on
-- + 4 policies abertas por enquanto, anon revogado. Fecha por cliente_id junto com todas
-- no PR-ACESSOS-01 (85 de 162 tabelas ainda com policy true).
-- APLICADA no proto em 2026-09-11 via Management API, apos ROLLBACK.
alter table agri_safra_area enable row level security;
drop policy if exists agri_safra_area_select_open on agri_safra_area;
drop policy if exists agri_safra_area_insert_open on agri_safra_area;
drop policy if exists agri_safra_area_update_open on agri_safra_area;
drop policy if exists agri_safra_area_delete_open on agri_safra_area;
create policy agri_safra_area_select_open on agri_safra_area for select using (true);
create policy agri_safra_area_insert_open on agri_safra_area for insert with check (true);
create policy agri_safra_area_update_open on agri_safra_area for update using (true) with check (true);
create policy agri_safra_area_delete_open on agri_safra_area for delete using (true);
revoke all on agri_safra_area from anon;
