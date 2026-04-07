
-- Fix RLS: allow cliente members to insert/update/delete valor_rebanho_meta
DROP POLICY IF EXISTS "Admin pode inserir valor rebanho meta" ON public.valor_rebanho_meta;
DROP POLICY IF EXISTS "Admin pode atualizar valor rebanho meta" ON public.valor_rebanho_meta;
DROP POLICY IF EXISTS "Admin pode excluir valor rebanho meta" ON public.valor_rebanho_meta;

CREATE POLICY "Membros podem inserir valor rebanho meta"
  ON public.valor_rebanho_meta FOR INSERT TO authenticated
  WITH CHECK (is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros podem atualizar valor rebanho meta"
  ON public.valor_rebanho_meta FOR UPDATE TO authenticated
  USING (is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros podem excluir valor rebanho meta"
  ON public.valor_rebanho_meta FOR DELETE TO authenticated
  USING (is_cliente_member(auth.uid(), cliente_id));

-- Fix RLS: allow cliente members to insert/update/delete valor_rebanho_meta_itens
DROP POLICY IF EXISTS "Admin pode inserir itens valor rebanho meta" ON public.valor_rebanho_meta_itens;
DROP POLICY IF EXISTS "Admin pode atualizar itens valor rebanho meta" ON public.valor_rebanho_meta_itens;
DROP POLICY IF EXISTS "Admin pode excluir itens valor rebanho meta" ON public.valor_rebanho_meta_itens;

CREATE POLICY "Membros podem inserir itens valor rebanho meta"
  ON public.valor_rebanho_meta_itens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM valor_rebanho_meta m
    WHERE m.id = valor_rebanho_meta_itens.meta_id
    AND is_cliente_member(auth.uid(), m.cliente_id)
  ));

CREATE POLICY "Membros podem atualizar itens valor rebanho meta"
  ON public.valor_rebanho_meta_itens FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM valor_rebanho_meta m
    WHERE m.id = valor_rebanho_meta_itens.meta_id
    AND is_cliente_member(auth.uid(), m.cliente_id)
  ));

CREATE POLICY "Membros podem excluir itens valor rebanho meta"
  ON public.valor_rebanho_meta_itens FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM valor_rebanho_meta m
    WHERE m.id = valor_rebanho_meta_itens.meta_id
    AND is_cliente_member(auth.uid(), m.cliente_id)
  ));
