-- PR-OC-04A parte 1 — catálogo global de componentes financeiros + snapshot do responsável.
-- Endurecimento do motor da Operação Comercial. Tabelas OC estão vazias (greenfield):
--   a FK do catálogo e as novas colunas aplicam sem backfill/conflito de dado.
-- NÃO aplicar por este PR — aplicação é etapa separada sob autorização.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo GLOBAL de componentes financeiros (D3 + AJUSTE 2). Sem cliente_id.
--   Identidade lógica (natureza, codigo). categoria = agrupamento analítico
--   (NÃO afeta cálculo, ordenação ou natureza financeira nesta etapa).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.zoo_componentes_financeiros (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  natureza       text NOT NULL CHECK (natureza IN ('principal','deducao','acrescimo')),
  codigo         text NOT NULL CHECK (codigo ~ '^[a-z0-9_]+$'),
  nome           text NOT NULL,
  categoria      text NOT NULL CHECK (categoria IN ('principal','tributo','logistica','comissao','desconto','bonificacao','ajuste','outro')),
  ativo          boolean NOT NULL DEFAULT true,
  ordem_exibicao integer NOT NULL DEFAULT 0,
  sistemico      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zoo_componentes_financeiros_identidade_uniq UNIQUE (natureza, codigo)
);

INSERT INTO public.zoo_componentes_financeiros (natureza, codigo, nome, categoria, ordem_exibicao, sistemico) VALUES
  ('principal', 'principal',   'Principal',    'principal',   10, true),
  ('deducao',   'funrural',    'Funrural',     'tributo',     20, true),
  ('deducao',   'imposto',     'Imposto',      'tributo',     30, true),
  ('deducao',   'comissao',    'Comissão',     'comissao',    40, true),
  ('deducao',   'frete',       'Frete',        'logistica',   50, true),
  ('deducao',   'desconto',    'Desconto',     'desconto',    60, true),
  ('acrescimo', 'bonificacao', 'Bonificação',  'bonificacao', 70, true),
  ('acrescimo', 'ajuste',      'Ajuste',       'ajuste',      80, true);

ALTER TABLE public.zoo_componentes_financeiros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zoo_componentes_financeiros FROM PUBLIC, anon;
GRANT SELECT ON public.zoo_componentes_financeiros TO authenticated;
-- Catálogo global: leitura para qualquer autenticado; sem escrita pelo app.
CREATE POLICY zoo_componentes_financeiros_select ON public.zoo_componentes_financeiros
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.zoo_componentes_financeiros IS
  'PR-OC-04A: catálogo GLOBAL de componentes financeiros. Identidade (natureza, codigo). categoria = agrupamento analítico (nao afeta calculo/natureza). Somente leitura pelo app; DELETE RESTRICT; inativo nao pode ser usado em novas escritas, mas partes historicas permanecem validas.';

-- ─────────────────────────────────────────────────────────────────────────────
-- FK de zoo_operacao_partes (natureza, componente) -> catálogo (natureza, codigo).
--   Tabela vazia => aplica sem conflito. RESTRICT: catálogo é referência estável.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.zoo_operacao_partes
  ADD CONSTRAINT zoo_operacao_partes_componente_fk
  FOREIGN KEY (natureza, componente)
  REFERENCES public.zoo_componentes_financeiros (natureza, codigo)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Responsável comercial: SNAPSHOT do nome (AJUSTE 3 / D9). Preserva histórico.
--   responsavel_id (FK) foi RETIRADO deste PR: o ator ja e capturado por created_by
--   (padrao do projeto: uuid do ator sem FK a auth.users). A referencia canonica de
--   identidade fica para a frente de identidade. O snapshot e resolvido no servidor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.zoo_operacoes_comerciais
  ADD COLUMN responsavel_nome_snapshot text;

COMMENT ON COLUMN public.zoo_operacoes_comerciais.responsavel_nome_snapshot IS
  'PR-OC-04A: nome do responsavel (executor autenticado) no momento da criacao, resolvido no servidor por resolver_nome_usuario(). Imutavel ao historico; o frontend nao envia/controla. O uuid do ator vive em created_by.';
