-- ====================================================================
-- PR-Aliases-Core (26/05/2026) — Tabela de aliases legado → canônico
-- ====================================================================
-- CONTRATO ARQUITETURAL:
-- Classificação vem APENAS de comparação direta com cadastros oficiais.
-- Esta tabela armazena mapeamentos EXPLÍCITOS curados manualmente entre
-- strings legadas do Excel e plano_conta_id canônico em
-- financeiro_plano_contas. Match é exato (com lower/trim para tolerância
-- de caixa/espaço, igual ao lookup atual em financeiro_plano_contas).
-- Não permite fuzzy, LIKE, ILIKE ou inferência por outros campos.
--
-- cliente_id NULL = alias global; UUID = alias específico do cliente.
-- Alias específico do cliente tem prioridade sobre global na resolução.
--
-- AJUSTE PR-Aliases-Core: unicidade enforçada via 2 índices parciais
-- únicos normalizados com lower(trim(alias_text)), NÃO via constraint
-- UNIQUE inline:
--   - UNIQUE inline trataria NULL (cliente_id) como distinto, permitindo
--     duplicatas globais.
--   - Sem normalização, "Pec/ADM/X" e "pec/adm/x" seriam aceitos como
--     aliases diferentes — o ORDER BY ... LIMIT 1 da resolução decidiria
--     imprevisivelmente.
-- ====================================================================

CREATE TABLE public.financeiro_subcentro_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  alias_text text NOT NULL,
  plano_conta_id uuid NOT NULL REFERENCES public.financeiro_plano_contas(id) ON DELETE RESTRICT,
  origem text NOT NULL DEFAULT 'manual',
  observacao text NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT alias_text_not_blank CHECK (length(trim(alias_text)) > 0),
  CONSTRAINT origem_valida CHECK (origem IN ('manual', 'importacao', 'migracao'))
);

-- Unicidade por cliente (alias específico do cliente):
-- normaliza alias_text com lower/trim para coincidir com a busca
-- real do populate e impedir duplicatas case-insensitive.
CREATE UNIQUE INDEX uniq_alias_cliente
  ON public.financeiro_subcentro_aliases (cliente_id, lower(trim(alias_text)))
  WHERE cliente_id IS NOT NULL;

-- Unicidade global (cliente_id IS NULL):
-- índice parcial separado porque UNIQUE padrão trata NULL como distinto
-- e permitiria duplicatas globais.
CREATE UNIQUE INDEX uniq_alias_global
  ON public.financeiro_subcentro_aliases (lower(trim(alias_text)))
  WHERE cliente_id IS NULL;

-- Lookup do populate (alinhado com o WHERE da resolução de alias):
-- inclui cliente_id, lower(trim(alias_text)) e ativo.
CREATE INDEX idx_alias_lookup
  ON public.financeiro_subcentro_aliases (cliente_id, lower(trim(alias_text)))
  WHERE ativo = true;

-- Lookup secundário por plano_conta_id (queries de auditoria
-- "quais aliases mapeiam para este subcentro").
CREATE INDEX idx_alias_plano_conta
  ON public.financeiro_subcentro_aliases (plano_conta_id);

-- RLS conservadora: leitura via authenticated, escrita via service_role
-- (ajuste para RBAC multi-tenant fica para PR futuro)
ALTER TABLE public.financeiro_subcentro_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alias_select_authenticated"
  ON public.financeiro_subcentro_aliases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "alias_all_service_role"
  ON public.financeiro_subcentro_aliases FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.financeiro_subcentro_aliases IS
'PR-Aliases-Core: mapeamento explícito legado → plano oficial. Curado manualmente. Match exato com lower/trim. Cliente_id NULL = global.';

COMMENT ON COLUMN public.financeiro_subcentro_aliases.alias_text IS
'String legada exata como aparece no Excel (ex: "Pec/ADM/Despesas Financeiras"). Match case-insensitive via lower(trim()). Unicidade enforçada via índices parciais (uniq_alias_cliente + uniq_alias_global) que normalizam com lower(trim()).';

COMMENT ON COLUMN public.financeiro_subcentro_aliases.plano_conta_id IS
'FK para financeiro_plano_contas. Subcentro canônico resolvido vem deste registro.';

COMMENT ON COLUMN public.financeiro_subcentro_aliases.origem IS
'manual | importacao | migracao. Default manual (CRUD operador).';
