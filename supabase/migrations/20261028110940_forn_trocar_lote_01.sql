-- FORN-TROCAR-LOTE-01 (Gabriel 22/10/2026) — trocar o fornecedor (favorecido) de VARIOS lancamentos de uma vez, com trilha e desfazer.
-- Uma funcao so' para a tela (linhas marcadas na lista de Lancamentos) e para as listas aprovadas que vem de fora (auditoria do legado:
-- ids -> fornecedor). Molde: `fn_fornecedor_sem_cadastro_ligar` / `_desfazer` (FORN-02).
--   `fn_lancamentos_trocar_favorecido(cliente, ids, fornecedor, motivo, simular)`:
--     SIMULAR devolve quantos trocam, a soma em R$, de quais fornecedores saem (nome e quantos), os meses FECHADOS envolvidos
--     (`financeiro_fechamentos`, por fazenda e mes), os conciliados e os ligados a OC — nada e' gravado.
--     APLICAR grava a operacao com o antes/depois de CADA lancamento e troca SO' o `favorecido_id` (valor, datas, conta e conciliacao
--     ficam como estao). Conciliado e mes fechado NAO recusam: a troca e' de cadastro; a tela avisa. O gatilho de auditoria grava o
--     antes/depois de cada linha com quem esta' logado.
--     Recusa: destino de outro cliente, inativo ou mesclado; id que nao e' deste cliente; lancamento historico (importacao_historica)
--     para quem nao e' admin (a guarda da tabela recusaria no meio); motivo vazio ao aplicar.
--     Fica de fora (contado, sem recusar): cancelado, e o que ja' esta' no fornecedor de destino.
--   `fn_lancamentos_trocar_favorecido_desfazer(operacao, motivo, simular)`: volta ao fornecedor de antes SO' os lancamentos que seguem
--     no fornecedor de destino (ninguem trocou de novo depois) e conta os outros.
-- SECURITY DEFINER com `tenant_ok`; REVOKE de PUBLIC/anon; EXECUTE para `authenticated`.
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.lancamento_favorecido_trocas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  fornecedor_destino_id uuid NOT NULL REFERENCES public.financeiro_fornecedores(id),
  motivo text NOT NULL,
  -- [{id, favorecido_antes, editado_manual_antes}] — o depois de todos e' o `fornecedor_destino_id`
  lancamentos jsonb NOT NULL,
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  feita_em timestamptz NOT NULL DEFAULT now(),
  feita_por uuid DEFAULT auth.uid(),
  desfeita_em timestamptz,
  desfeita_por uuid,
  desfeita_motivo text,
  CONSTRAINT lft_desfeita_coerente CHECK ((desfeita_em IS NULL) = (desfeita_motivo IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_lft_cliente ON public.lancamento_favorecido_trocas (cliente_id, feita_em DESC);
ALTER TABLE public.lancamento_favorecido_trocas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lft_select_tenant ON public.lancamento_favorecido_trocas;
CREATE POLICY lft_select_tenant ON public.lancamento_favorecido_trocas FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.lancamento_favorecido_trocas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lancamento_favorecido_trocas TO authenticated;
GRANT ALL ON public.lancamento_favorecido_trocas TO service_role;

CREATE OR REPLACE FUNCTION public.fn_lancamentos_trocar_favorecido(p_cliente uuid, p_ids uuid[], p_fornecedor uuid, p_motivo text,
  p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_f record; v_ids uuid[]; v_fora int; v_rec_m text; v_rec_f text; v_hist int; v_troca uuid[]; v_lancs jsonb; v_ret jsonb;
        v_op uuid; v_cancelados int; v_ja int; v_resumo jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO v_ids FROM unnest(coalesce(p_ids, '{}'::uuid[])) x WHERE x IS NOT NULL;
  SELECT id, cliente_id, nome, ativo, fundido_em_id INTO v_f FROM public.financeiro_fornecedores WHERE id = p_fornecedor;
  SELECT count(*) INTO v_fora FROM unnest(v_ids) x
   WHERE NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 l WHERE l.id = x AND l.cliente_id = p_cliente);
  SELECT count(*) FILTER (WHERE l.cancelado),
         count(*) FILTER (WHERE NOT l.cancelado AND l.favorecido_id IS NOT DISTINCT FROM p_fornecedor),
         count(*) FILTER (WHERE NOT l.cancelado AND l.favorecido_id IS DISTINCT FROM p_fornecedor AND l.origem_lancamento = 'importacao_historica'),
         array_agg(l.id ORDER BY l.id) FILTER (WHERE NOT l.cancelado AND l.favorecido_id IS DISTINCT FROM p_fornecedor)
    INTO v_cancelados, v_ja, v_hist, v_troca
    FROM public.financeiro_lancamentos_v2 l WHERE l.id = ANY (v_ids) AND l.cliente_id = p_cliente;

  IF cardinality(v_ids) = 0 THEN
    v_rec_m := 'sem_lancamentos'; v_rec_f := 'Nenhum lançamento marcado.';
  ELSIF cardinality(v_ids) > 20000 THEN
    v_rec_m := 'lista_grande'; v_rec_f := format('São %s lançamentos: o limite de uma troca é 20.000. Divida a lista.', cardinality(v_ids));
  ELSIF v_f.id IS NULL OR v_f.cliente_id IS DISTINCT FROM p_cliente THEN
    v_rec_m := 'destino_invalido'; v_rec_f := 'O fornecedor escolhido não é deste cliente.';
  ELSIF v_f.fundido_em_id IS NOT NULL OR v_f.ativo IS FALSE THEN
    v_rec_m := 'destino_inativo'; v_rec_f := format('"%s" está fora de uso (inativo ou mesclado): escolha um cadastro ativo.', v_f.nome);
  ELSIF v_fora > 0 THEN
    v_rec_m := 'fora_do_cliente'; v_rec_f := format('%s lançamento(s) da lista não são deste cliente (ou não existem).', v_fora);
  ELSIF v_hist > 0 AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN
    v_rec_m := 'historico'; v_rec_f := format('%s lançamento(s) da importação histórica só a equipe AgroinBlue altera.', v_hist);
  ELSIF v_troca IS NULL THEN
    v_rec_m := 'nada_a_trocar';
    v_rec_f := format('Nada a trocar: %s já está(ão) em "%s" e %s cancelado(s).', v_ja, v_f.nome, v_cancelados);
  ELSIF NOT p_simular AND nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    v_rec_m := 'sem_motivo'; v_rec_f := 'Informe o motivo da troca.';
  END IF;
  IF v_rec_m IS NOT NULL THEN
    IF p_simular THEN
      RETURN jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', v_rec_m, 'frase', v_rec_f));
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_rec_f || ' Nada foi gravado.';
  END IF;

  -- o resumo (o que a tela mostra antes de gravar)
  WITH t AS (SELECT l.* FROM public.financeiro_lancamentos_v2 l WHERE l.id = ANY (v_troca)),
  orig AS (SELECT t.favorecido_id id, coalesce(f.nome, 'Sem fornecedor') nome, count(*) n, round(sum(t.valor)::numeric, 2) soma
             FROM t LEFT JOIN public.financeiro_fornecedores f ON f.id = t.favorecido_id GROUP BY 1, 2),
  fech AS (SELECT DISTINCT t.fazenda_id, coalesce(z.nome, '—') fazenda, t.ano_mes
             FROM t JOIN public.financeiro_fechamentos ff ON ff.cliente_id = t.cliente_id AND ff.fazenda_id = t.fazenda_id
                                                         AND ff.ano_mes = t.ano_mes AND ff.status_fechamento = 'fechado'
             LEFT JOIN public.fazendas z ON z.id = t.fazenda_id)
  SELECT jsonb_build_object(
      'lancamentos', (SELECT count(*) FROM t),
      'soma', (SELECT round(coalesce(sum(valor), 0)::numeric, 2) FROM t),
      'origens', coalesce((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'lancamentos', o.n, 'soma', o.soma) ORDER BY o.n DESC, o.nome) FROM orig o), '[]'::jsonb),
      'meses_fechados', coalesce((SELECT jsonb_agg(jsonb_build_object('fazenda', x.fazenda, 'ano_mes', x.ano_mes) ORDER BY x.ano_mes, x.fazenda) FROM fech x), '[]'::jsonb),
      'meses_fechados_lancamentos', (SELECT count(*) FROM t JOIN fech x ON x.fazenda_id = t.fazenda_id AND x.ano_mes = t.ano_mes),
      'conciliados', (SELECT count(*) FROM t WHERE t.status_transacao = 'conciliado' OR t.conciliado_em IS NOT NULL
                        OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci WHERE ci.lancamento_id = t.id AND ci.desfeito_em IS NULL)),
      'ligados_a_oc', (SELECT count(*) FROM t WHERE EXISTS (SELECT 1 FROM public.zoo_operacao_partes p
                         WHERE p.financeiro_lancamento_id = t.id AND p.cancelada IS NOT TRUE)),
      'ja_no_destino', v_ja, 'cancelados', v_cancelados)
    INTO v_resumo;
  SELECT jsonb_agg(jsonb_build_object('id', l.id, 'favorecido_antes', l.favorecido_id, 'editado_manual_antes', l.editado_manual) ORDER BY l.id)
    INTO v_lancs FROM public.financeiro_lancamentos_v2 l WHERE l.id = ANY (v_troca);

  BEGIN
    PERFORM set_config('app.motivo', 'troca de fornecedor em lote: ' || coalesce(nullif(btrim(p_motivo), ''), 'simulação'), true);
    UPDATE public.financeiro_lancamentos_v2 SET favorecido_id = p_fornecedor WHERE id = ANY (v_troca) AND cliente_id = p_cliente;
    INSERT INTO public.lancamento_favorecido_trocas (cliente_id, fornecedor_destino_id, motivo, lancamentos, resumo)
    VALUES (p_cliente, p_fornecedor, coalesce(nullif(btrim(p_motivo), ''), 'simulação'), v_lancs, v_resumo)
    RETURNING id INTO v_op;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'operacao_id', CASE WHEN p_simular THEN NULL ELSE v_op END,
               'fornecedor', jsonb_build_object('id', v_f.id, 'nome', v_f.nome)) || v_resumo;
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'FTSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN sqlstate 'FTSIM' THEN
    RETURN sqlerrm::jsonb;
  END;
  RETURN v_ret;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_lancamentos_trocar_favorecido_desfazer(p_operacao_id uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_op record; v_rec_m text; v_rec_f text; v_volta uuid[]; v_ficam int; v_ret jsonb;
BEGIN
  SELECT * INTO v_op FROM public.lancamento_favorecido_trocas WHERE id = p_operacao_id;
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[v_op.cliente_id]);
  IF v_op.id IS NULL THEN
    v_rec_m := 'nao_encontrada'; v_rec_f := 'Troca não encontrada.';
  ELSIF v_op.desfeita_em IS NOT NULL THEN
    v_rec_m := 'ja_desfeita'; v_rec_f := 'Esta troca já foi desfeita.';
  ELSIF NOT p_simular AND nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    v_rec_m := 'sem_motivo'; v_rec_f := 'Informe o motivo para desfazer.';
  END IF;
  IF v_rec_m IS NOT NULL THEN
    IF p_simular THEN
      RETURN jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', v_rec_m, 'frase', v_rec_f));
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_rec_f || ' Nada foi gravado.';
  END IF;

  SELECT array_agg(l.id) INTO v_volta
    FROM jsonb_array_elements(v_op.lancamentos) e JOIN public.financeiro_lancamentos_v2 l ON l.id = (e->>'id')::uuid
   WHERE l.favorecido_id = v_op.fornecedor_destino_id;
  v_ficam := jsonb_array_length(v_op.lancamentos) - coalesce(cardinality(v_volta), 0);

  BEGIN
    PERFORM set_config('app.motivo', coalesce(nullif(btrim(p_motivo), ''), 'simulação') || ' (desfazer troca de fornecedor em lote)', true);
    UPDATE public.financeiro_lancamentos_v2 l
       SET favorecido_id = nullif(e->>'favorecido_antes', '')::uuid, editado_manual = coalesce((e->>'editado_manual_antes')::boolean, false)
      FROM jsonb_array_elements(v_op.lancamentos) e
     WHERE l.id = (e->>'id')::uuid AND l.id = ANY (coalesce(v_volta, '{}'::uuid[]));
    UPDATE public.lancamento_favorecido_trocas
       SET desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = coalesce(nullif(btrim(p_motivo), ''), 'simulação')
     WHERE id = p_operacao_id;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'voltaram', coalesce(cardinality(v_volta), 0), 'ficaram', v_ficam);
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'FTSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN sqlstate 'FTSIM' THEN
    RETURN sqlerrm::jsonb;
  END;
  RETURN v_ret;
END $f$;

REVOKE ALL ON FUNCTION public.fn_lancamentos_trocar_favorecido(uuid, uuid[], uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_lancamentos_trocar_favorecido_desfazer(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lancamentos_trocar_favorecido(uuid, uuid[], uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_lancamentos_trocar_favorecido_desfazer(uuid, text, boolean) TO authenticated, service_role;
