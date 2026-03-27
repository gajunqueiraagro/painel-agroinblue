
-- 1. Criar enum de perfis de acesso
CREATE TYPE public.perfil_acesso AS ENUM (
  'admin_agroinblue',
  'gestor_cliente',
  'financeiro',
  'campo',
  'leitura'
);

-- 2. Criar tabela clientes
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- 3. Criar tabela cliente_membros
CREATE TABLE public.cliente_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  perfil perfil_acesso NOT NULL DEFAULT 'leitura',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, user_id)
);

ALTER TABLE public.cliente_membros ENABLE ROW LEVEL SECURITY;

-- 4. Adicionar cliente_id em fazendas (nullable inicialmente para não quebrar dados existentes)
ALTER TABLE public.fazendas ADD COLUMN cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE;

-- 5. Funções de isolamento

-- Verifica se o usuário é admin Agroinblue
CREATE OR REPLACE FUNCTION public.is_admin_agroinblue(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cliente_membros
    WHERE user_id = _user_id
      AND perfil = 'admin_agroinblue'
      AND ativo = true
  )
$$;

-- Retorna o cliente_id do usuário (para queries simples de 1 cliente)
CREATE OR REPLACE FUNCTION public.get_user_cliente_id(_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cliente_id FROM public.cliente_membros
  WHERE user_id = _user_id AND ativo = true
  LIMIT 1
$$;

-- Verifica se o usuário é membro de um cliente específico
CREATE OR REPLACE FUNCTION public.is_cliente_member(_user_id uuid, _cliente_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cliente_membros
    WHERE user_id = _user_id
      AND cliente_id = _cliente_id
      AND ativo = true
  )
$$;

-- Retorna o perfil do usuário em um cliente
CREATE OR REPLACE FUNCTION public.get_user_perfil(_user_id uuid, _cliente_id uuid)
RETURNS perfil_acesso
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT perfil FROM public.cliente_membros
  WHERE user_id = _user_id
    AND cliente_id = _cliente_id
    AND ativo = true
  LIMIT 1
$$;

-- 6. RLS para clientes
CREATE POLICY "Admin vê todos os clientes"
ON public.clientes FOR SELECT
TO authenticated
USING (public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "Membros veem próprio cliente"
ON public.clientes FOR SELECT
TO authenticated
USING (public.is_cliente_member(auth.uid(), id));

CREATE POLICY "Admin pode inserir clientes"
ON public.clientes FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "Admin pode atualizar clientes"
ON public.clientes FOR UPDATE
TO authenticated
USING (public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "Admin pode deletar clientes"
ON public.clientes FOR DELETE
TO authenticated
USING (public.is_admin_agroinblue(auth.uid()));

-- 7. RLS para cliente_membros
CREATE POLICY "Admin vê todos os membros"
ON public.cliente_membros FOR SELECT
TO authenticated
USING (public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "Membros veem membros do próprio cliente"
ON public.cliente_membros FOR SELECT
TO authenticated
USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Admin e gestor podem inserir membros"
ON public.cliente_membros FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_agroinblue(auth.uid())
  OR public.get_user_perfil(auth.uid(), cliente_id) = 'gestor_cliente'
);

CREATE POLICY "Admin e gestor podem atualizar membros"
ON public.cliente_membros FOR UPDATE
TO authenticated
USING (
  public.is_admin_agroinblue(auth.uid())
  OR public.get_user_perfil(auth.uid(), cliente_id) = 'gestor_cliente'
);

CREATE POLICY "Admin pode deletar membros"
ON public.cliente_membros FOR DELETE
TO authenticated
USING (public.is_admin_agroinblue(auth.uid()));
