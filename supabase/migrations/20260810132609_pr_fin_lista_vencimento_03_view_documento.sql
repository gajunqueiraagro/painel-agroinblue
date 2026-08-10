-- =====================================================================
-- PR-FIN-LISTA-VENCIMENTO-03 · view de leitura da lista financeira.
--
-- Materializa em coluna o que o filtro da lista precisa e a tabela nao tem:
--   documento_formatado — o texto que a tela mostra (tipo + numero formatado)
--   mes_<dimensao>      — o mes de cada eixo de data, para "mes em qualquer ano"
--
-- Por que view e nao coluna gerada: ADD COLUMN GENERATED reescreve
-- financeiro_lancamentos_v2 inteira sob ACCESS EXCLUSIVE. A view nao pega
-- lock algum e nao altera a tabela base.
-- Por que view e nao RPC para a LISTA: PostgREST filtra sobre view nativamente.
-- (Para os TOTAIS ha uma RPC — agregacao nao se faz por PostgREST.)
--
-- security_invoker = true: a view executa com os privilegios de QUEM CONSULTA,
-- portanto a RLS de financeiro_lancamentos_v2 continua valendo por construcao.
-- Sem isso, a view rodaria como o dono e seria um furo cross-tenant.
--
-- PROJECAO EXPLICITA, nao `l.*`: a view e uma superficie publica da Data API,
-- e `l.*` exporia colunas internas (hash_importacao, duplicado_de_id, chaves de
-- deduplicacao, created_by/updated_by, cancelado_por) que consumidor nenhum le.
-- O gate VW4 compara a projecao NOMINALMENTE, nos dois sentidos: nada a menos,
-- nada a mais.
--
-- Zero SQL dinamico. Expressoes IMMUTABLE por construcao.
-- =====================================================================

CREATE OR REPLACE VIEW public.vw_financeiro_lancamentos_v2_doc
WITH (security_invoker = true) AS
SELECT
  -- identidade e tenant
  l.id,
  l.cliente_id,
  l.fazenda_id,
  -- eixos de data
  l.data_competencia,
  l.data_pagamento,
  l.data_vencimento,
  l.ano_mes,
  -- valor e classificacao
  l.valor,
  l.sinal,
  l.tipo_operacao,
  l.status_transacao,
  l.cenario,
  l.descricao,
  l.macro_custo,
  l.grupo_custo,
  l.centro_custo,
  l.subcentro,
  l.escopo_negocio,
  -- texto livre
  l.observacao,
  l.documento,
  l.historico,
  -- documento
  l.numero_documento,
  l.tipo_documento,
  -- relacionamentos que a grade le
  l.favorecido_id,
  l.conta_bancaria_id,
  l.conta_destino_id,
  l.origem_lancamento,
  l.origem_tipo,
  l.lote_importacao_id,
  l.financiamento_id,
  l.movimentacao_rebanho_id,
  l.safra_id,
  -- pagamento
  l.forma_pagamento,
  l.dados_pagamento,
  -- estado
  l.cancelado,
  l.conciliado_em,
  l.editado_manual,
  l.created_at,
  l.updated_at,

  -- mes de cada eixo, para o recorte "mes em qualquer ano".
  -- Sem estas colunas o filtro nao e expressavel no PostgREST (que nao expoe
  -- extract) e a lista paginada devolveria TODOS os anos. Data nula -> mes nulo,
  -- e `in` nao casa nulo: mesma semantica do residuo client-side que substituem.
  extract(month from l.data_competencia)::smallint AS mes_competencia,
  extract(month from l.data_vencimento)::smallint  AS mes_vencimento,
  extract(month from l.data_pagamento)::smallint   AS mes_pagamento,
  extract(month from coalesce(l.data_pagamento, l.data_vencimento))::smallint AS mes_financeira,

  -- documento_formatado — espelha formatDocumento(tipo, numero) do TypeScript:
  --   sem numero e sem tipo            -> '-'
  --   Nota Fiscal com numero           -> 'NF ' || formatNFNumber(numero)
  --   com numero                       -> coalesce(tipo,'Outros') || ' ' || numero
  --   so tipo                          -> coalesce(tipo,'Outros')
  -- formatNFNumber: so digitos, primeiros 9, lpad a 9, grupos de tres com ponto.
  -- nullif(btrim(...),'') blinda string vazia junto com NULL, como o `!numero` do TS.
  --
  -- A expressao e repetida em vez de fatorada em LATERAL de proposito: com
  -- LATERAL a view deixa de ser trivialmente inlined e o planner perde o
  -- Index Scan por (cliente_id, data_vencimento, id) — medido. Verbosidade aqui
  -- compra a ordenacao indexada da lista, que e o ponto da frente inteira.
  CASE
    WHEN nullif(btrim(l.numero_documento), '') IS NULL
     AND nullif(btrim(l.tipo_documento), '')   IS NULL
      THEN '-'
    WHEN coalesce(nullif(btrim(l.tipo_documento), ''), 'Outros') = 'Nota Fiscal'
     AND coalesce(l.numero_documento, '') <> ''
      THEN 'NF ' || CASE
             WHEN left(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), 9) = ''
               THEN ''
             ELSE substr(lpad(left(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), 9), 9, '0'), 1, 3)
               || '.' || substr(lpad(left(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), 9), 9, '0'), 4, 3)
               || '.' || substr(lpad(left(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), 9), 9, '0'), 7, 3)
           END
    WHEN coalesce(l.numero_documento, '') <> ''
      THEN coalesce(nullif(btrim(l.tipo_documento), ''), 'Outros') || ' ' || l.numero_documento
    ELSE coalesce(nullif(btrim(l.tipo_documento), ''), 'Outros')
  END AS documento_formatado
FROM public.financeiro_lancamentos_v2 l;

-- ACL: fora da Data API para quem nao precisa.
REVOKE ALL ON public.vw_financeiro_lancamentos_v2_doc FROM PUBLIC;
REVOKE ALL ON public.vw_financeiro_lancamentos_v2_doc FROM anon;
REVOKE ALL ON public.vw_financeiro_lancamentos_v2_doc FROM service_role;
GRANT SELECT ON public.vw_financeiro_lancamentos_v2_doc TO authenticated;
GRANT SELECT ON public.vw_financeiro_lancamentos_v2_doc TO postgres;

DO $$
DECLARE
  v_inv boolean;
  v_n int;
  c_projecao constant text[] := ARRAY[
    'id','cliente_id','fazenda_id',
    'data_competencia','data_pagamento','data_vencimento','ano_mes',
    'valor','sinal','tipo_operacao','status_transacao','cenario',
    'descricao','macro_custo','grupo_custo','centro_custo','subcentro','escopo_negocio',
    'observacao','documento','historico',
    'numero_documento','tipo_documento',
    'favorecido_id','conta_bancaria_id','conta_destino_id',
    'origem_lancamento','origem_tipo','lote_importacao_id','financiamento_id',
    'movimentacao_rebanho_id','safra_id',
    'forma_pagamento','dados_pagamento',
    'cancelado','conciliado_em','editado_manual','created_at','updated_at',
    'mes_competencia','mes_vencimento','mes_pagamento','mes_financeira',
    'documento_formatado'
  ];
  v_faltando text;
  v_sobrando text;
BEGIN
  SELECT (c.reloptions @> ARRAY['security_invoker=true']) INTO v_inv
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'vw_financeiro_lancamentos_v2_doc';
  IF v_inv IS NOT TRUE THEN
    RAISE EXCEPTION 'L3 VW1: view sem security_invoker — seria furo cross-tenant';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, LATERAL aclexplode(c.relacl) a
   WHERE n.nspname = 'public' AND c.relname = 'vw_financeiro_lancamentos_v2_doc'
     AND coalesce(pg_get_userbyid(a.grantee), 'PUBLIC') IN ('PUBLIC', 'anon', 'service_role');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'L3 VW2: view concede privilegio a PUBLIC/anon/service_role (%)', v_n;
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.vw_financeiro_lancamentos_v2_doc', 'SELECT') THEN
    RAISE EXCEPTION 'L3 VW3: authenticated perdeu SELECT na view';
  END IF;

  -- VW4 — projecao NOMINAL, nos dois sentidos.
  --   faltando: o hook leria undefined em silencio.
  --   sobrando: a Data API exporia coluna que ninguem pediu.
  SELECT string_agg(nome, ', ' ORDER BY nome) INTO v_faltando
    FROM unnest(c_projecao) AS req(nome)
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                      WHERE c.table_schema = 'public'
                        AND c.table_name = 'vw_financeiro_lancamentos_v2_doc'
                        AND c.column_name = req.nome);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'L3 VW4: a view NAO expoe coluna(s) exigida(s): %', v_faltando;
  END IF;

  SELECT string_agg(c.column_name, ', ' ORDER BY c.column_name) INTO v_sobrando
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'vw_financeiro_lancamentos_v2_doc'
     AND NOT (c.column_name = ANY (c_projecao));
  IF v_sobrando IS NOT NULL THEN
    RAISE EXCEPTION 'L3 VW4: a view expoe coluna(s) NAO prevista(s): %', v_sobrando;
  END IF;

  RAISE NOTICE 'L3: view com % colunas, projecao nominal exata, security_invoker ativo, ACL contida.',
    array_length(c_projecao, 1);
END $$;
