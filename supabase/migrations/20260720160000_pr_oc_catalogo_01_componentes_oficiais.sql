-- PR-OC-CATALOGO-01 — catálogo oficial de componentes comerciais (ADR-2026-16 Decisão 3).
--   Componentes gerencialmente diferentes têm SLUGS PRÓPRIOS (identidade analítica),
--   proibido colapsar em bonificacao/desconto/ajuste genéricos com descrição livre.
--   Aditivo: o catálogo já existe (PR-OC-04A) com principal/funrural/imposto/comissao/
--   frete/desconto/bonificacao/ajuste. Aqui somam-se os slugs nomeados que faltavam.
--   Estrutura, UNIQUE(natureza,codigo) e a FK de zoo_operacao_partes já existem; o validador
--   _oc_aplicar_partes lê o catálogo ATIVO dinamicamente — nenhuma RPC precisa mudar.
-- NÃO aplicar por este PR — aplicação é etapa separada.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Slugs oficiais mínimos do ADR ainda ausentes (funrural/comissao/frete já existem).
--   natureza: acrescimo (bônus somam) · deducao (tributos/quebras/condenação/descontos reduzem).
--   categoria = agrupamento analítico (não afeta cálculo/natureza); slug = identidade.
INSERT INTO public.zoo_componentes_financeiros (natureza, codigo, nome, categoria, ordem_exibicao, sistemico) VALUES
  ('deducao',   'senar_proape',       'SENAR/PROAPE',        'tributo',     25, true),
  ('deducao',   'condenacao',         'Condenação',          'ajuste',      55, true),
  ('deducao',   'quebra',             'Quebra',              'ajuste',      57, true),
  ('deducao',   'desconto_qualidade', 'Desconto qualidade',  'desconto',    62, true),
  ('acrescimo', 'bonus_precoce',      'Bônus precoce',       'bonificacao', 72, true),
  ('acrescimo', 'bonus_qualidade',    'Bônus qualidade',     'bonificacao', 74, true),
  ('acrescimo', 'bonus_lista_trace',  'Bônus lista/trace',   'bonificacao', 76, true)
ON CONFLICT (natureza, codigo) DO NOTHING;

-- Desativação dos genéricos (ADR-2026-16 D3: proibido colapsar em bonificacao/ajuste/
--   desconto genéricos com descrição livre — a identidade analítica passa a exigir slugs
--   próprios). ativo=false PRESERVA as linhas (sem DELETE); a FK de zoo_operacao_partes
--   não é afetada, então partes históricas permanecem válidas — só NOVAS escritas ficam
--   bloqueadas (o validador _oc_aplicar_partes exige componente ativo).
-- Guard: aborta se houver partes usando os genéricos (não desativar componente em uso).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes WHERE componente IN ('bonificacao','ajuste','desconto')) THEN
    RAISE EXCEPTION 'Ha partes usando componentes genericos (bonificacao/ajuste/desconto); desativacao abortada';
  END IF;
END $$;

UPDATE public.zoo_componentes_financeiros
   SET ativo = false
 WHERE codigo IN ('bonificacao','ajuste','desconto');

COMMENT ON TABLE public.zoo_componentes_financeiros IS
  'PR-OC-04A/CATALOGO-01 (ADR-2026-16 D3): catálogo GLOBAL de componentes financeiros. Identidade (natureza, codigo) com SLUGS PRÓPRIOS por identidade analítica; categoria = agrupamento (nao afeta calculo). Somente leitura pelo app; DELETE RESTRICT; extensível; inativo nao pode ser usado em novas escritas, partes historicas permanecem validas.';
