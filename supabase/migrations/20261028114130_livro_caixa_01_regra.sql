-- NOTAS-ITENS-LIVRO-CAIXA-01 fatia 2 (Gabriel 05/11/2026 10:31; FASE 0 visao-20261105-1024, mock ui-validar/livro-caixa-campo.html) — o
-- "ENTRA NO LIVRO CAIXA" com UM dono: a regra por conta do plano + a exceção do lançamento, e a marca DERIVADA numa visão só.
--   `fin_livro_caixa_regra`    o padrão por conta do plano (cliente_id NULO = a regra global da conta global; com cliente = a conta do
--                              cliente ou a troca do padrão para um cliente). lado: entra | fora | confirmar (= "confirmar com o contador").
--   `fin_livro_caixa_excecao`  a exceção de UM lançamento (entra | fora + motivo obrigatório + autor). Nunca se apaga: voltar ao padrão
--                              marca `desfeita_em` (AUDIT-DELETE-01a); trilha pelo `_fn_trilha_registro` (audit_log, com o motivo).
--   `vw_fin_livro_caixa`       A MARCA, por parte da classificação (a mesma `vw_fin_classificacao_por_parte` do DRE): exceção > sem caixa
--                              (fora do livro; a Reforma o soma à parte, D2) > regra do cliente > regra global > 'confirmar' (sem regra ou
--                              sem classificação). A tela do lançamento, a lista, a aba Livro Caixa e a Reforma (Code 6) LEEM daqui.
-- ⚠ SEM UPDATE EM `financeiro_plano_contas` (decisão D-0/D-C1): o `gera_lcdpr` do plano e do lançamento deixa de ser fonte e fica só
--   para a auditoria antiga — ele é copiado na criação do lançamento e envelhece; a regra aqui vale na hora em que se lê.
-- ⚠ O PADRÃO SEMEADO é a PROPOSTA da FASE 0 (C1), para o contador confirmar (D-C2): entram receitas da atividade, custeio, investimento,
--   reposição, juros e impostos/deduções (menos IRPF/IRPJ/CSLL); ficam fora transferências, dividendos, financiamento (entrada e
--   amortização), outras entradas/saídas (menos Acerto de Boitel), rendimentos financeiros, arrendamentos, consumo interno; "confirmar":
--   venda de máquinas, outras receitas e mercado futuro. Uma regra por conta do plano (ativa ou não: o lançamento antigo também se marca),
--   global e de cliente.
-- Escrita da exceção SÓ pelas RPCs `fn_livro_caixa_excecao_gravar` / `_desfazer` (simular antes; `tenant_ok`; recusa P0001 com a frase,
-- nunca 40001). Leitura pela RLS do cliente; a regra global é catálogo (legível por todos, escrita só por migration).
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.fin_livro_caixa_regra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  plano_conta_id uuid NOT NULL REFERENCES public.financeiro_plano_contas(id) ON DELETE RESTRICT,
  lado text NOT NULL CHECK (lado IN ('entra', 'fora', 'confirmar')),
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 3),
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  substituida_em timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS fin_livro_caixa_regra_viva_uniq
  ON public.fin_livro_caixa_regra (coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), plano_conta_id) WHERE substituida_em IS NULL;

CREATE TABLE IF NOT EXISTS public.fin_livro_caixa_excecao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  lancamento_id uuid NOT NULL REFERENCES public.financeiro_lancamentos_v2(id) ON DELETE RESTRICT,
  lado text NOT NULL CHECK (lado IN ('entra', 'fora')),
  motivo text NOT NULL CHECK (length(btrim(motivo)) >= 3),
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid,
  desfeita_em timestamptz,
  desfeita_por uuid,
  desfeita_motivo text
);
CREATE UNIQUE INDEX IF NOT EXISTS fin_livro_caixa_excecao_viva_uniq ON public.fin_livro_caixa_excecao (lancamento_id) WHERE desfeita_em IS NULL;
CREATE INDEX IF NOT EXISTS fin_livro_caixa_excecao_cliente ON public.fin_livro_caixa_excecao (cliente_id) WHERE desfeita_em IS NULL;

ALTER TABLE public.fin_livro_caixa_regra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_livro_caixa_excecao ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_livro_caixa_regra_select ON public.fin_livro_caixa_regra FOR SELECT TO authenticated
  USING (cliente_id IS NULL OR public.tenant_ok(cliente_id));
CREATE POLICY fin_livro_caixa_excecao_select ON public.fin_livro_caixa_excecao FOR SELECT TO authenticated
  USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.fin_livro_caixa_regra, public.fin_livro_caixa_excecao FROM PUBLIC, anon;
GRANT SELECT ON public.fin_livro_caixa_regra, public.fin_livro_caixa_excecao TO authenticated;

CREATE TRIGGER trg_trilha_registro AFTER INSERT OR UPDATE OR DELETE ON public.fin_livro_caixa_excecao
  FOR EACH ROW EXECUTE FUNCTION public._fn_trilha_registro();
CREATE TRIGGER trg_sem_delete_direto BEFORE DELETE ON public.fin_livro_caixa_excecao
  FOR EACH ROW EXECUTE FUNCTION public._fn_sem_delete_direto();

-- O padrão proposto (C1), uma regra por conta do plano (global e de cliente). O motivo diz a razão em português, para o ⓘ.
INSERT INTO public.fin_livro_caixa_regra (cliente_id, plano_conta_id, lado, motivo)
SELECT p.cliente_id, p.id, t.lado, t.motivo
  FROM public.financeiro_plano_contas p
  CROSS JOIN LATERAL (SELECT CASE
      WHEN p.tipo_operacao LIKE '3-%' THEN 'transferencia'
      WHEN p.grupo_fluxo = 'Dividendos' THEN 'dividendos'
      WHEN p.grupo_fluxo = 'Entradas de capital e financiamento' THEN 'capital'
      WHEN p.grupo_fluxo = 'Amortizações' THEN 'amortizacao'
      WHEN p.grupo_fluxo = 'Outras entradas' THEN 'outras_entradas'
      WHEN p.grupo_fluxo = 'Outras saídas' AND p.subcentro = 'Acerto de Boitel (despesas)' THEN 'acerto_boitel'
      WHEN p.grupo_fluxo = 'Outras saídas' THEN 'outras_saidas'
      WHEN p.grupo_fluxo = 'Receitas operacionais' AND p.subcentro = 'Rendimentos Financeiros' THEN 'rendimentos'
      WHEN p.grupo_fluxo = 'Receitas operacionais' AND p.subcentro IN ('Receita de Arrendamento de Pasto', 'Receita de Arrendamento Florestal') THEN 'arrendamento'
      WHEN p.grupo_fluxo = 'Receitas operacionais' AND p.subcentro = 'Consumo Interno e Doações' THEN 'consumo_interno'
      WHEN p.grupo_fluxo = 'Receitas operacionais' AND (p.subcentro LIKE 'Venda de Máquinas%' OR p.subcentro IN ('Outras Receitas', 'Ganho com Mercado Futuro')) THEN 'receita_a_confirmar'
      WHEN p.grupo_fluxo = 'Receitas operacionais' THEN 'receita'
      WHEN p.grupo_fluxo = 'Impostos e deduções' AND p.subcentro IN ('IRPF', 'IRPJ', 'CSLL') THEN 'imposto_de_renda'
      WHEN p.grupo_fluxo = 'Impostos e deduções' AND p.subcentro = 'Resultado com Mercado Futuro' THEN 'mercado_futuro'
      WHEN p.grupo_fluxo = 'Impostos e deduções' THEN 'imposto'
      WHEN p.grupo_fluxo = 'Custeio' THEN 'custeio'
      WHEN p.grupo_fluxo = 'Investimentos' THEN 'investimento'
      WHEN p.grupo_fluxo = 'Reposição de bovinos' THEN 'reposicao'
      WHEN p.grupo_fluxo = 'Juros' THEN 'juros'
      ELSE 'sem_padrao' END AS codigo) c
  JOIN (VALUES
      ('transferencia',       'fora',      'Transferência entre contas do próprio produtor: não é receita nem despesa.'),
      ('dividendos',          'fora',      'Retirada do produtor (dividendos): não é despesa da atividade rural.'),
      ('capital',             'fora',      'Financiamento, aporte ou retorno de empréstimo: dinheiro que entra mas não é receita.'),
      ('amortizacao',         'fora',      'Pagamento do principal de financiamento: não é despesa (os juros entram).'),
      ('outras_entradas',     'fora',      'Devolução, estorno ou repasse: não é receita da atividade.'),
      ('acerto_boitel',       'entra',     'Despesa do boitel paga no acerto: custo da atividade.'),
      ('outras_saidas',       'fora',      'Adiantamento, repasse ou estorno: não é despesa da atividade.'),
      ('rendimentos',         'fora',      'Rendimento de aplicação: tributado à parte, fora da receita da atividade rural.'),
      ('arrendamento',        'fora',      'Arrendamento recebido: aluguel, fora da receita da atividade rural.'),
      ('consumo_interno',     'fora',      'Consumo interno ou doação: não houve venda nem dinheiro.'),
      ('receita_a_confirmar', 'confirmar', 'Pode ou não ser receita da atividade rural: confirmar com o contador.'),
      ('receita',             'entra',     'Receita da atividade rural (venda da produção).'),
      ('imposto_de_renda',    'fora',      'Imposto de renda: não é despesa dedutível da atividade.'),
      ('mercado_futuro',      'confirmar', 'Resultado de mercado futuro: confirmar com o contador.'),
      ('imposto',             'entra',     'Imposto, taxa ou dedução da venda: despesa da atividade.'),
      ('custeio',             'entra',     'Custeio: despesa da atividade rural.'),
      ('investimento',        'entra',     'Investimento na atividade rural (entra como despesa no livro caixa).'),
      ('reposicao',           'entra',     'Compra de animais: despesa da atividade rural.'),
      ('juros',               'entra',     'Juros de financiamento da atividade: despesa dedutível.'),
      ('sem_padrao',          'confirmar', 'Conta sem padrão definido: confirmar com o contador.')
    ) AS t(codigo, lado, motivo) ON t.codigo = c.codigo
ON CONFLICT DO NOTHING;

-- A MARCA, por parte. ⚠ security_invoker: quem lê vê só o seu cliente (a RLS das três tabelas).
CREATE OR REPLACE VIEW public.vw_fin_livro_caixa WITH (security_invoker = true) AS
SELECT vp.lancamento_id, vp.cliente_id, vp.parte_ordem, vp.partes_total, vp.valor, vp.plano_conta_id, vp.subcentro,
       vp.tipo_operacao, vp.data_pagamento, vp.status_transacao, vp.sem_movimentacao_caixa,
       CASE WHEN x.id IS NOT NULL THEN x.lado
            WHEN vp.sem_movimentacao_caixa THEN 'fora'
            WHEN vp.plano_conta_id IS NULL THEN 'confirmar'
            ELSE coalesce(rc.lado, rg.lado, 'confirmar') END AS lado,
       CASE WHEN x.id IS NOT NULL THEN 'excecao'
            WHEN vp.sem_movimentacao_caixa THEN 'sem_caixa'
            WHEN vp.plano_conta_id IS NULL THEN 'sem_classificacao'
            WHEN rc.id IS NOT NULL THEN 'regra_cliente'
            WHEN rg.id IS NOT NULL THEN 'regra'
            ELSE 'sem_regra' END AS origem,
       CASE WHEN x.id IS NOT NULL THEN x.motivo
            WHEN vp.sem_movimentacao_caixa THEN 'Sem movimento de caixa (permuta, barter ou pago por outro lançamento): fica fora do livro.'
            WHEN vp.plano_conta_id IS NULL THEN 'Lançamento sem classificação: classifique para saber se entra.'
            ELSE coalesce(rc.motivo, rg.motivo, 'Conta sem padrão definido: confirmar com o contador.') END AS motivo,
       coalesce(rc.lado, rg.lado, 'confirmar') AS lado_da_conta,
       x.id AS excecao_id, x.criado_por AS excecao_por, x.criado_em AS excecao_em
  FROM public.vw_fin_classificacao_por_parte vp
  LEFT JOIN public.fin_livro_caixa_excecao x ON x.lancamento_id = vp.lancamento_id AND x.desfeita_em IS NULL
  LEFT JOIN public.fin_livro_caixa_regra rc ON rc.plano_conta_id = vp.plano_conta_id AND rc.cliente_id = vp.cliente_id AND rc.substituida_em IS NULL
  LEFT JOIN public.fin_livro_caixa_regra rg ON rg.plano_conta_id = vp.plano_conta_id AND rg.cliente_id IS NULL AND rg.substituida_em IS NULL
 WHERE NOT coalesce(vp.cancelado, false) AND coalesce(vp.cenario, 'realizado') <> 'meta';
REVOKE ALL ON public.vw_fin_livro_caixa FROM PUBLIC, anon;
GRANT SELECT ON public.vw_fin_livro_caixa TO authenticated;

-- A EXCEÇÃO. Simular devolve o antes/depois e não grava. Mesma marca de hoje e sem exceção = "nada a mudar".
CREATE OR REPLACE FUNCTION public.fn_livro_caixa_excecao_gravar(p_lancamento uuid, p_lado text, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cli uuid; v_cancelado boolean; v_antes text[]; v_viva public.fin_livro_caixa_excecao; v_id uuid;
BEGIN
  SELECT cliente_id, coalesce(cancelado, false) INTO v_cli, v_cancelado FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento;
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.tenant_ok(v_cli) THEN RAISE EXCEPTION 'Sem acesso a este cliente.' USING ERRCODE = '42501'; END IF;
  IF v_cancelado THEN RAISE EXCEPTION 'Lançamento cancelado não entra no livro caixa.' USING ERRCODE = 'P0001'; END IF;
  IF p_lado IS NULL OR p_lado NOT IN ('entra', 'fora') THEN RAISE EXCEPTION 'Escolha Entra ou Fora.' USING ERRCODE = 'P0001'; END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escreva o motivo da exceção.' USING ERRCODE = 'P0001'; END IF;
  SELECT array_agg(DISTINCT lado ORDER BY lado) INTO v_antes FROM public.vw_fin_livro_caixa WHERE lancamento_id = p_lancamento;
  SELECT * INTO v_viva FROM public.fin_livro_caixa_excecao WHERE lancamento_id = p_lancamento AND desfeita_em IS NULL;
  IF v_viva.id IS NOT NULL AND v_viva.lado = p_lado AND v_viva.motivo = btrim(p_motivo) THEN
    RETURN jsonb_build_object('ok', true, 'simulado', p_simular, 'nada_a_mudar', true, 'antes', to_jsonb(v_antes), 'depois', to_jsonb(ARRAY[p_lado]));
  END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'nada_a_mudar', false, 'antes', to_jsonb(v_antes), 'depois', to_jsonb(ARRAY[p_lado]),
                              'troca_excecao', v_viva.id IS NOT NULL);
  END IF;
  PERFORM set_config('app.motivo', btrim(p_motivo), true);
  IF v_viva.id IS NOT NULL THEN
    UPDATE public.fin_livro_caixa_excecao SET desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = 'trocada por outra exceção'
     WHERE id = v_viva.id;
  END IF;
  INSERT INTO public.fin_livro_caixa_excecao (cliente_id, lancamento_id, lado, motivo, criado_por)
  VALUES (v_cli, p_lancamento, p_lado, btrim(p_motivo), auth.uid()) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'nada_a_mudar', false, 'antes', to_jsonb(v_antes), 'depois', to_jsonb(ARRAY[p_lado]), 'excecao_id', v_id);
END $$;

-- VOLTAR AO PADRÃO DA CONTA: a exceção viva vira desfeita (nada se apaga). Sem exceção = "nada a mudar".
CREATE OR REPLACE FUNCTION public.fn_livro_caixa_excecao_desfazer(p_lancamento uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cli uuid; v_viva public.fin_livro_caixa_excecao; v_depois text[];
BEGIN
  SELECT cliente_id INTO v_cli FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento;
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.tenant_ok(v_cli) THEN RAISE EXCEPTION 'Sem acesso a este cliente.' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escreva o motivo de voltar ao padrão.' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_viva FROM public.fin_livro_caixa_excecao WHERE lancamento_id = p_lancamento AND desfeita_em IS NULL;
  IF v_viva.id IS NULL THEN RETURN jsonb_build_object('ok', true, 'simulado', p_simular, 'nada_a_mudar', true); END IF;
  SELECT array_agg(DISTINCT lado_da_conta ORDER BY lado_da_conta) INTO v_depois FROM public.vw_fin_livro_caixa WHERE lancamento_id = p_lancamento;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'nada_a_mudar', false, 'antes', to_jsonb(ARRAY[v_viva.lado]), 'depois', to_jsonb(v_depois));
  END IF;
  PERFORM set_config('app.motivo', btrim(p_motivo), true);
  UPDATE public.fin_livro_caixa_excecao SET desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = btrim(p_motivo) WHERE id = v_viva.id;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'nada_a_mudar', false, 'antes', to_jsonb(ARRAY[v_viva.lado]), 'depois', to_jsonb(v_depois));
END $$;

REVOKE ALL ON FUNCTION public.fn_livro_caixa_excecao_gravar(uuid, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_livro_caixa_excecao_desfazer(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_livro_caixa_excecao_gravar(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_livro_caixa_excecao_desfazer(uuid, text, boolean) TO authenticated;
