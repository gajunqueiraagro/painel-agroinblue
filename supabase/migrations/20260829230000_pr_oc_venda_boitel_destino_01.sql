-- ═══════════════════════════════════════════════════════════════════════════════
-- PR-OC-VENDA-BOITEL-DESTINO-01 — onde o planejamento do boitel passa a existir
--
-- APLICADA no Proto em 2026-08-29, com GO explicito do Gabriel.
--
-- POR QUE ESTA TABELA EXISTE
-- O boitel e' uma VENDA NORMAL com valor a confirmar: o gado sai do rebanho no envio,
-- a venda existe desde o comeco, e o valor e' projecao ate o abate. Nao ha lote vivendo
-- antes da venda — a OC de venda E' o lote.
-- As cinco tabelas `boitel_*` modelam o negocio INVERSO (hospedar gado de terceiro) e
-- sao plano abandonado: as cinco estao com ZERO linhas, e o esquema delas no banco nao
-- tem nenhuma coluna em comum com o que `useBoitelOperacoes.ts` escreve. Esta migration
-- NAO as apaga — ver a secao final.
--
-- POR QUE TABELA FILHA E NAO COLUNAS NA OC
-- Porque o comparativo precisa de DOIS conjuntos do mesmo campo: o PROJETADO no envio e
-- o REALIZADO no abate. Em colunas na `zoo_operacoes_comerciais` isso dobraria ~26
-- colunas para ~52, todas nulas em 100% das operacoes que nao sao boitel. Numa tabela
-- filha, o segundo conjunto e' UMA LINHA A MAIS — a estrutura nao muda.
--
-- POR QUE NAO JSONB
-- Decisao ja registrada: "vai ter que virar estrutura, sem quebrar". JSONB seria adiar
-- a mesma migration com o custo de nao poder consultar no meio do caminho.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.zoo_operacao_boitel (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id                  uuid NOT NULL,
  operacao_id                 uuid NOT NULL
    REFERENCES public.zoo_operacoes_comerciais(id) ON DELETE CASCADE,

  -- ⚠ O EIXO DO COMPARATIVO. 'projetado' nasce no envio; 'realizado' nasce no abate.
  --   O projetado NUNCA e' sobrescrito pelo realizado — e' isso que faz o comparativo
  --   existir. Duas linhas por operacao, no maximo.
  cenario                     text NOT NULL
    CHECK (cenario IN ('projetado', 'realizado')),

  -- ── IDENTIDADE DO ENVIO ──────────────────────────────────────────────────────
  -- ⚠ `data_envio` NAO e' `zoo_operacoes_comerciais.data_embarque`. Aquela coluna e'
  --   "data de embarque (abate)" por ADR-2026-16 D3.B; esta e' a saida da fazenda RUMO
  --   AO BOITEL, meses antes. Dois eventos, duas colunas.
  nome_boitel                 text,
  lote_codigo                 text,
  numero_contrato             text,
  data_envio                  date,

  -- ── DESEMPENHO ───────────────────────────────────────────────────────────────
  -- ⚠ `peso_saida_fazenda_kg` NAO e' `peso_medio_negociado_kg` da OC: o que se negocia
  --   num boitel e' a carcaca no abate, nao o peso de saida da fazenda.
  peso_saida_fazenda_kg       numeric,
  dias                        integer,
  gmd                         numeric,
  quebra_viagem_pct           numeric,
  rendimento_entrada_pct      numeric,
  -- ⚠ `rendimento_saida_pct` tem o mesmo SIGNIFICADO de
  --   `zoo_operacoes_comerciais.rendimento_carcaca`, mas aquela coluna e' declarada
  --   "exclusivo de operacao de abate (RPC)" e o boitel e' uma operacao de VENDA. Fica
  --   aqui ate' a RPC decidir liberar la'; se liberar, esta coluna sai e o valor migra.
  rendimento_saida_pct        numeric,

  -- ── CUSTOS ───────────────────────────────────────────────────────────────────
  -- ⚠ SO A MODALIDADE DIARIA. `arroba` e `parceria` nunca rodaram com dado real (as 10
  --   vendas boitel sao `diaria`) e a parceria nem custo e' — o parceiro deduz da
  --   receita. O CHECK abaixo e' a trava: entra uma modalidade nova quando ela for
  --   desenhada, nao antes.
  modalidade_custo            text NOT NULL DEFAULT 'diaria'
    CHECK (modalidade_custo IN ('diaria')),
  -- A diaria e' o unico custo calculado a partir de TAXA; os quatro abaixo sao totais.
  custo_diaria                numeric,
  custo_nutricao              numeric,
  custo_sanidade              numeric,
  custo_frete                 numeric,
  outros_custos               numeric,
  -- ⚠ TRES CAMPOS VIRAM UMA LINHA SO NO FINANCEIRO: `custo_nutricao`, `outros_custos` e
  --   os extras de parceria somam numa unica obrigacao "Outros Custos". Ver
  --   `useBoitelOperacoes.ts`. Mexer em um muda o valor sem mudar rotulo nenhum.
  custo_oportunidade          numeric,

  -- ── COMERCIALIZACAO ──────────────────────────────────────────────────────────
  preco_venda_arroba          numeric,
  -- ⚠ UM CAMPO SO. `custo_nf_abate` e `despesas_abate` eram o mesmo custo escrito duas
  --   vezes; a unificacao saiu em PR-OC-VENDA-BOITEL-01A e nao mudou nenhum registro
  --   (o primeiro estava zerado nos 10 e nunca teve coluna no banco).
  despesas_abate              numeric,

  -- ── ADIANTAMENTO ─────────────────────────────────────────────────────────────
  -- ⚠ VALOR CHEIO DIGITADO, sem percentual e sem dias — decisao do Gabriel, que troca a
  --   regra anterior. A migracao dos 10 registros nao perde nada: o valor derivado do
  --   percentual JA ESTA persistido em `valorAdiantamentoDiarias` (conferido: 108791,10
  --   e 45678,35 nos dois registros que tinham percentual).
  possui_adiantamento         boolean NOT NULL DEFAULT false,
  data_adiantamento           date,
  valor_adiantamento_diarias  numeric,
  valor_adiantamento_sanitario numeric,
  valor_adiantamento_outros   numeric,
  adiantamento_observacao     text,

  -- ── MORTE NO PERIODO ─────────────────────────────────────────────────────────
  -- ⚠ OS DOIS OPCIONAIS, e sem campo de causa. Campo novo: nao existe no snapshot
  --   antigo, entao nasce NULL nos 10 migrados — e NULL aqui e' "nao informado", nunca
  --   "nenhuma morte". Zero e' valor real e so' aparece se alguem digitar zero.
  morte_quantidade            integer,
  morte_valor_indenizacao     numeric,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid,

  -- No maximo um projetado e um realizado por operacao.
  CONSTRAINT zoo_operacao_boitel_uq_operacao_cenario UNIQUE (operacao_id, cenario)
);

CREATE INDEX IF NOT EXISTS zoo_operacao_boitel_operacao_idx
  ON public.zoo_operacao_boitel (operacao_id);
CREATE INDEX IF NOT EXISTS zoo_operacao_boitel_cliente_idx
  ON public.zoo_operacao_boitel (cliente_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
-- Mesmo idioma de `zoo_operacao_lotes`, conferido no banco: UMA politica, so' de
-- SELECT, e NENHUM grant. Escrita e' exclusiva das RPCs SECURITY DEFINER — sem grant,
-- o PostgREST nao escreve nem por engano.
ALTER TABLE public.zoo_operacao_boitel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS zoo_operacao_boitel_select ON public.zoo_operacao_boitel;
CREATE POLICY zoo_operacao_boitel_select
  ON public.zoo_operacao_boitel FOR SELECT
  USING (
    is_admin_agroinblue(auth.uid())
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))
  );

COMMENT ON TABLE public.zoo_operacao_boitel IS
  'PR-OC-VENDA-BOITEL-DESTINO-01: planejamento do boitel de uma OC de venda. Uma linha por cenario (projetado no envio, realizado no abate) — o projetado nunca e sobrescrito, e o comparativo nasce da existencia das duas. Substitui o `detalhes_snapshot.boitelSnapshot` do formulario antigo.';
COMMENT ON COLUMN public.zoo_operacao_boitel.cenario IS
  'projetado = informado no envio; realizado = informado no abate. UNIQUE (operacao_id, cenario).';
COMMENT ON COLUMN public.zoo_operacao_boitel.data_envio IS
  'Saida da fazenda rumo ao boitel. NAO confundir com zoo_operacoes_comerciais.data_embarque, que e a data de embarque para o ABATE.';
COMMENT ON COLUMN public.zoo_operacao_boitel.rendimento_saida_pct IS
  'Mesmo significado de zoo_operacoes_comerciais.rendimento_carcaca. Fica aqui porque aquela coluna e declarada exclusiva de operacao de abate (ADR-2026-16 D3.B) e a RPC a recusa fora de abate; o boitel e operacao de VENDA. Se a RPC for liberada, esta coluna sai do filho.';
COMMENT ON COLUMN public.zoo_operacao_boitel.morte_quantidade IS
  'Opcional. NULL = nao informado; zero = informado como nenhuma morte.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- O QUE ESTA MIGRATION NAO FAZ, DE PROPOSITO
--
-- 1. NAO migra as 10 vendas boitel existentes. Elas somam R$ 4.949.050,88 em
--    `valor_total` (MEDIDO; o 1,3 milhao que circulou e' o `_lucroTotal` de UM registro,
--    nao o total das vendas) e hoje vivem em `lancamentos.detalhes_snapshot.boitelSnapshot`, lidas pelo formulario
--    antigo, que continua funcionando. O backfill precisa de uma OC de venda para cada
--    uma — e nenhuma existe: `zoo_operacoes_comerciais` tem 32 linhas, TODAS de compra.
--    Criar OC para lancamento antigo e' decisao de produto, nao efeito colateral de DDL.
--    Fica como PR proprio, depois de o caminho novo estar de pe' e exercido.
--
-- 2. NAO apaga as cinco tabelas `boitel_*`. Estao vazias e o esquema delas nao bate com
--    o codigo, mas `ContaBoitelTab` ainda le duas delas e esta' MONTADA
--    (src/pages/Index.tsx:819) — nao e' orfa, e' uma tela viva sobre tabela vazia.
--    Apagar tabela e' irreversivel; a ordem certa e' desligar a tela primeiro.
-- ═══════════════════════════════════════════════════════════════════════════════
