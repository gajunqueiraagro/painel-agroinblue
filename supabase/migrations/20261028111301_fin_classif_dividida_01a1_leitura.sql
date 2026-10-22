-- FIN-CLASSIF-DIVIDIDA-01a-1 — parte 2/4: a leitura unica, a guarda e a reescala (partida da 111300 pelo limite do canal).

-- ── a LEITURA UNICA: 1 linha por parte (lancamento sem divisao = 1 linha, as colunas de hoje). `valor` = o da parte, com o sinal do
--    lancamento; `valor_lancamento` = o total. security_invoker: a RLS de quem le vale.
CREATE OR REPLACE VIEW public.vw_fin_classificacao_por_parte WITH (security_invoker = true) AS
SELECT l.id AS lancamento_id, l.cliente_id, l.fazenda_id,
       coalesce(p.ordem, 1)::int AS parte_ordem,
       -- subconsulta (e nao janela): o filtro de quem le (cliente, datas) desce ate' a tabela
       CASE WHEN p.id IS NULL THEN 1 ELSE (SELECT count(*) FROM public.financeiro_lancamento_partes p2 WHERE p2.lancamento_id = l.id) END::int AS partes_total,
       CASE WHEN p.id IS NULL THEN l.valor ELSE sign(l.valor) * p.valor END AS valor,
       l.valor AS valor_lancamento,
       coalesce(p.percentual, 100)::numeric AS percentual,
       l.classificacao_dividida,
       CASE WHEN p.id IS NULL THEN l.plano_conta_id ELSE p.plano_conta_id END AS plano_conta_id,
       CASE WHEN p.id IS NULL THEN l.macro_custo    ELSE p.macro_custo    END AS macro_custo,
       CASE WHEN p.id IS NULL THEN l.grupo_custo    ELSE p.grupo_custo    END AS grupo_custo,
       CASE WHEN p.id IS NULL THEN l.centro_custo   ELSE p.centro_custo   END AS centro_custo,
       CASE WHEN p.id IS NULL THEN l.subcentro      ELSE p.subcentro      END AS subcentro,
       CASE WHEN p.id IS NULL THEN l.escopo_negocio ELSE p.escopo_negocio END AS escopo_negocio,
       CASE WHEN p.id IS NULL THEN l.safra_id       ELSE p.safra_id       END AS safra_id,
       CASE WHEN p.id IS NULL THEN l.cultura        ELSE p.cultura        END AS cultura,
       CASE WHEN p.id IS NULL THEN l.fase           ELSE p.fase           END AS fase,
       CASE WHEN p.id IS NULL THEN l.compoe_dre     ELSE p.compoe_dre     END AS compoe_dre,
       CASE WHEN p.id IS NULL THEN l.gera_lcdpr     ELSE p.gera_lcdpr     END AS gera_lcdpr,
       l.sinal, l.tipo_operacao, l.data_competencia, l.data_pagamento, l.data_vencimento, l.ano_mes, l.status_transacao,
       l.cancelado, l.cenario, l.sem_movimentacao_caixa, l.conta_bancaria_id, l.conta_destino_id, l.favorecido_id,
       l.descricao, l.historico, l.origem_lancamento, l.numero_documento
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_lancamento_partes p ON p.lancamento_id = l.id AND l.classificacao_dividida;
REVOKE ALL ON public.vw_fin_classificacao_por_parte FROM anon;
GRANT SELECT ON public.vw_fin_classificacao_por_parte TO authenticated;

-- ── a guarda: classificacao do lancamento dividido so' muda pelas RPCs da divisao (nada de classificacao paralela)
CREATE OR REPLACE FUNCTION public._fn_trg_classificacao_dividida_guarda()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('app.fin_dividindo', true), 'off') = 'on' THEN RETURN NEW; END IF;
  IF NEW.classificacao_dividida IS DISTINCT FROM OLD.classificacao_dividida THEN
    RAISE EXCEPTION 'A divisão da classificação só muda por "Dividir" ou "Voltar para 1 conta".' USING ERRCODE = 'P0001', DETAIL = NEW.id::text;
  END IF;
  IF OLD.classificacao_dividida AND (
       NEW.plano_conta_id IS DISTINCT FROM OLD.plano_conta_id OR NEW.subcentro IS DISTINCT FROM OLD.subcentro
    OR NEW.macro_custo IS DISTINCT FROM OLD.macro_custo OR NEW.grupo_custo IS DISTINCT FROM OLD.grupo_custo
    OR NEW.centro_custo IS DISTINCT FROM OLD.centro_custo OR NEW.escopo_negocio IS DISTINCT FROM OLD.escopo_negocio
    OR NEW.safra_id IS DISTINCT FROM OLD.safra_id OR NEW.cultura IS DISTINCT FROM OLD.cultura
    OR NEW.tipo_operacao IS DISTINCT FROM OLD.tipo_operacao) THEN
    RAISE EXCEPTION 'O lançamento "%" está dividido em % contas: para mudar a classificação use "Dividir" ou "Voltar para 1 conta". Nada foi gravado.',
      coalesce(OLD.descricao, OLD.historico, OLD.id::text),
      (SELECT count(*) FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = OLD.id)
      USING ERRCODE = 'P0001', DETAIL = OLD.id::text;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_zy_classificacao_dividida_guarda BEFORE UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW WHEN (OLD.classificacao_dividida OR NEW.classificacao_dividida) EXECUTE FUNCTION public._fn_trg_classificacao_dividida_guarda();

-- ── o valor mudou (editar, "corrigir o valor" da conciliacao, OC): as partes reescalam pelo %, a ultima absorve o centavo
CREATE OR REPLACE FUNCTION public._fn_trg_classificacao_dividida_reescala()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_antes jsonb; v_total numeric := abs(NEW.valor); v_acum numeric := 0; v_n int; r record;
BEGIN
  IF abs(NEW.valor) = abs(OLD.valor) THEN RETURN NEW; END IF;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'O lançamento "%" está dividido em contas e não pode ficar com valor zero: volte para 1 conta antes.',
      coalesce(NEW.descricao, NEW.historico, NEW.id::text) USING ERRCODE = 'P0001', DETAIL = NEW.id::text;
  END IF;
  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.ordem), count(*) INTO v_antes, v_n FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = NEW.id;
  FOR r IN SELECT p.id, p.ordem, p.percentual, row_number() OVER (ORDER BY p.ordem) AS k FROM public.financeiro_lancamento_partes p
            WHERE p.lancamento_id = NEW.id ORDER BY p.ordem LOOP
    IF r.k < v_n THEN
      UPDATE public.financeiro_lancamento_partes SET valor = round(v_total * r.percentual / 100, 2) WHERE id = r.id;
      v_acum := v_acum + round(v_total * r.percentual / 100, 2);
    ELSE
      IF v_total - v_acum <= 0 THEN
        RAISE EXCEPTION 'O novo valor do lançamento não cabe na divisão: volte para 1 conta ou divida de novo.' USING ERRCODE = 'P0001', DETAIL = NEW.id::text;
      END IF;
      UPDATE public.financeiro_lancamento_partes SET valor = v_total - v_acum WHERE id = r.id;
    END IF;
  END LOOP;
  INSERT INTO public.financeiro_lancamento_divisoes (cliente_id, lancamento_id, acao, antes, depois, motivo, criado_por)
  VALUES (NEW.cliente_id, NEW.id, 'reescalar', jsonb_build_object('valor', OLD.valor, 'partes', v_antes),
          jsonb_build_object('valor', NEW.valor, 'partes', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.ordem) FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = NEW.id)),
          'o valor do lançamento mudou: as partes seguem o %', auth.uid());
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER trg_zzzz_classificacao_dividida_reescala AFTER UPDATE OF valor ON public.financeiro_lancamentos_v2
  FOR EACH ROW WHEN (NEW.classificacao_dividida) EXECUTE FUNCTION public._fn_trg_classificacao_dividida_reescala();
