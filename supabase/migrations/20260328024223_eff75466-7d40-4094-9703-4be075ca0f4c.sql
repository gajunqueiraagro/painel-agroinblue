
-- =====================================================
-- MÓDULO: FECHAMENTO EXECUTIVO MENSAL
-- Estrutura normalizada, auditável e escalável
-- =====================================================

-- 1. TABELA PRINCIPAL: fechamentos_executivos (cabeçalho)
CREATE TABLE public.fechamentos_executivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id uuid REFERENCES public.fazendas(id) ON DELETE CASCADE, -- NULL = global
  ano integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  periodo_texto text NOT NULL DEFAULT '',
  versao integer NOT NULL DEFAULT 1,
  status_fechamento text NOT NULL DEFAULT 'rascunho' CHECK (status_fechamento IN ('rascunho','revisado','fechado')),
  usuario_gerador uuid,
  data_geracao timestamptz NOT NULL DEFAULT now(),
  data_fechamento timestamptz,
  observacoes_manuais text,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices para consulta rápida
CREATE INDEX idx_fex_cliente_ano_mes ON public.fechamentos_executivos(cliente_id, ano, mes);
CREATE INDEX idx_fex_fazenda ON public.fechamentos_executivos(fazenda_id) WHERE fazenda_id IS NOT NULL;

-- Trigger updated_at
CREATE TRIGGER trg_fex_updated_at
  BEFORE UPDATE ON public.fechamentos_executivos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.fechamentos_executivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.fechamentos_executivos
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_insert" ON public.fechamentos_executivos
  FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_update" ON public.fechamentos_executivos
  FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_delete" ON public.fechamentos_executivos
  FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));


-- 2. TABELA: fechamento_indicadores (uma linha por indicador)
CREATE TABLE public.fechamento_indicadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid NOT NULL REFERENCES public.fechamentos_executivos(id) ON DELETE CASCADE,
  grupo text NOT NULL,        -- patrimonial, operacional, zootecnico, caixa, endividamento, aportes_dividendos
  subgrupo text,              -- sub-classificação opcional
  chave text NOT NULL,        -- ex: rebanho_final_cab, gmd_medio, faturamento_competencia
  label text NOT NULL,        -- nome legível: "Rebanho Final (cab)"
  valor_real numeric,
  valor_meta numeric,
  valor_ano_anterior numeric,
  unidade text,               -- cab, kg, ha, R$, %, @, etc.
  formato text DEFAULT 'numero', -- numero, moeda, percentual, inteiro
  ordem integer NOT NULL DEFAULT 0,
  json_origem jsonb,          -- metadados de auditoria (de onde veio o dado)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fi_fechamento ON public.fechamento_indicadores(fechamento_id);
CREATE INDEX idx_fi_grupo_chave ON public.fechamento_indicadores(fechamento_id, grupo, chave);

-- RLS via parent
ALTER TABLE public.fechamento_indicadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.fechamento_indicadores
  FOR SELECT TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_insert" ON public.fechamento_indicadores
  FOR INSERT TO authenticated
  WITH CHECK (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_update" ON public.fechamento_indicadores
  FOR UPDATE TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_delete" ON public.fechamento_indicadores
  FOR DELETE TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));


-- 3. TABELA: fechamento_textos (textos IA por seção)
CREATE TABLE public.fechamento_textos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid NOT NULL REFERENCES public.fechamentos_executivos(id) ON DELETE CASCADE,
  secao text NOT NULL CHECK (secao IN (
    'resumo_executivo','patrimonial','operacao','zootecnico',
    'fluxo_caixa','desvios_custos','aportes_dividendos','endividamento','resumo_global'
  )),
  texto_ia text,              -- gerado pela IA
  texto_editado text,         -- editado manualmente pelo usuário
  texto_final text,           -- versão final (= editado se existir, senão ia)
  modelo_ia text,             -- qual modelo gerou
  prompt_usado text,          -- prompt usado para auditoria
  gerado_em timestamptz,
  editado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fechamento_id, secao)
);

CREATE INDEX idx_ft_fechamento ON public.fechamento_textos(fechamento_id);

CREATE TRIGGER trg_ft_updated_at
  BEFORE UPDATE ON public.fechamento_textos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS via parent
ALTER TABLE public.fechamento_textos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.fechamento_textos
  FOR SELECT TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_insert" ON public.fechamento_textos
  FOR INSERT TO authenticated
  WITH CHECK (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_update" ON public.fechamento_textos
  FOR UPDATE TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_delete" ON public.fechamento_textos
  FOR DELETE TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));


-- 4. TABELA: fechamento_graficos (dados consolidados de gráficos)
CREATE TABLE public.fechamento_graficos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid NOT NULL REFERENCES public.fechamentos_executivos(id) ON DELETE CASCADE,
  secao text NOT NULL,        -- mesma seção dos textos
  tipo text NOT NULL,         -- bar, line, area, pie, composed
  titulo text NOT NULL,
  subtitulo text,
  ordem integer NOT NULL DEFAULT 0,
  json_dados jsonb NOT NULL DEFAULT '[]'::jsonb,   -- array de pontos do gráfico
  json_config jsonb DEFAULT '{}'::jsonb,            -- cores, eixos, legendas
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fg_fechamento ON public.fechamento_graficos(fechamento_id);

-- RLS via parent
ALTER TABLE public.fechamento_graficos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.fechamento_graficos
  FOR SELECT TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_insert" ON public.fechamento_graficos
  FOR INSERT TO authenticated
  WITH CHECK (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_update" ON public.fechamento_graficos
  FOR UPDATE TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_delete" ON public.fechamento_graficos
  FOR DELETE TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));


-- 5. TABELA: fechamento_execucoes (log de ações/auditoria)
CREATE TABLE public.fechamento_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid NOT NULL REFERENCES public.fechamentos_executivos(id) ON DELETE CASCADE,
  acao text NOT NULL,         -- gerou_rascunho, gerou_texto_ia, editou_texto, revisou, fechou, reabriu, exportou_pdf
  usuario_id uuid,
  detalhes jsonb,             -- contexto adicional
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fexec_fechamento ON public.fechamento_execucoes(fechamento_id);

-- RLS via parent
ALTER TABLE public.fechamento_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.fechamento_execucoes
  FOR SELECT TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_insert" ON public.fechamento_execucoes
  FOR INSERT TO authenticated
  WITH CHECK (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));

CREATE POLICY "cliente_delete" ON public.fechamento_execucoes
  FOR DELETE TO authenticated
  USING (fechamento_id IN (SELECT id FROM public.fechamentos_executivos WHERE cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid())));
