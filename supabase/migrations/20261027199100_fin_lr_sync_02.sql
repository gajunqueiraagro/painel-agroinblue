-- FIN-LR-SYNC-01 passo a2 (Gabriel 16/10/2026) — "Atualizar do Lucro Rural": APLICAR o que o operador confirmou e DESFAZER a ultima
-- atualizacao inteira. Banco + hook, sem tela (a tela e' o passo b).
--
-- REGRAS (as do a1, aprovadas em 14/10): vinculo conta LR <-> lancamento gravado com a FOTO da linha; so' o que o LR mudou desde a foto
-- e' proposto; classificacao, fornecedor e fazenda do sistema NUNCA sao sobrescritos; nunca duplica; pago no LR NAO vira realizado
-- (o vinculo guarda `pago_no_lr_em`; o lancamento fica intacto); nova entra PROGRAMADA com o de-para resolvido, e sem classificacao
-- nao entra; sumiu do LR / so' no sistema = so' aviso; centavos, fatura de cartao e financiamento = sempre decisao do operador.
--
-- O ESCRITOR (FASE 0, decisao do Gabriel 16/10): nao existe no banco escritor generico de lancamento avulso — o canonico e' o do
-- front (`useFinanceiroV2.ts`: `buildInsertRow` / `criarLancamento` / `editarLancamento`, insert e update diretos sob RLS). Este
-- passo cria UMA interna, `_fn_lancamento_programado_gravar`, ESPELHO DECLARADO desses dois: cria programado (pagamento nulo) e,
-- na edicao, SO' valor, vencimento e a marca do valor do mes. Os gatilhos de sempre fazem classificacao, `ano_mes`, hash e trilha.
-- Quem mexer num confere o outro. DIVIDA: levar o front a ela (FIN-LANCAMENTO-ESCRITOR-UNICO-01).
-- Cancelar (no desfazer) e' o dono de sempre, `fn_cancelar_lancamento_auditoria`; nunca DELETE.
--
-- O APLICAR COMPARA DE NOVO: a sessao passa a guardar as linhas cruas (`lr_sync_sessoes.linhas`, patch de `fn_lr_sync_comparar`
-- guardado por md5) e `fn_lr_sync_aplicar` chama a comparacao outra vez; decisao cuja situacao (ou lancamento) mudou desde a tela e'
-- recusada ('mudou_desde_a_comparacao'). Linha recusada por trava (ja' realizado/conciliado, parte viva de OC, mes fechado, parcela
-- de contrato, importacao historica) leva o motivo e as outras seguem; erro inesperado aborta tudo (uma transacao).
-- SIMULACAO = GRAVACAO: `p_simular` (padrao) roda o mesmo caminho e desfaz (SQLSTATE 'LRSIM').
-- DESFAZER: so' a ULTIMA aplicacao do cliente; ordem reversa; criado -> cancelado pelo dono; atualizado -> volta valor, vencimento e
-- marca, SO' se o lancamento esta' como o aplicar o deixou; vinculo -> volta o de antes. O que nao volta diz o motivo.
-- Sem DDL em tabela quente: so' tabelas lr_* (novas ou vazias).
SET LOCAL lock_timeout = '2s';

ALTER TABLE public.lr_vinculos ADD COLUMN pago_no_lr_em date;
COMMENT ON COLUMN public.lr_vinculos.pago_no_lr_em IS
  'FIN-LR-SYNC-01a2: o LR diz que a conta foi paga nesta data; o lancamento NAO vira realizado (aguarda o extrato).';
ALTER TABLE public.lr_sync_sessoes ADD COLUMN linhas jsonb;
COMMENT ON COLUMN public.lr_sync_sessoes.linhas IS 'FIN-LR-SYNC-01a2: as linhas cruas comparadas (o aplicar compara de novo a partir delas).';

CREATE TABLE public.lr_sync_aplicacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid NOT NULL REFERENCES public.clientes(id),
  sessao_id       uuid NOT NULL REFERENCES public.lr_sync_sessoes(id),
  aplicada_em     timestamptz NOT NULL DEFAULT now(),
  aplicada_por    uuid,
  desfeita_em     timestamptz,
  desfeita_por    uuid,
  resumo          jsonb,
  resumo_desfazer jsonb
);
COMMENT ON TABLE public.lr_sync_aplicacoes IS 'FIN-LR-SYNC-01a2: uma atualizacao do Lucro Rural aplicada (e se foi desfeita). Escrita so'' pelas funcoes.';
CREATE INDEX idx_lr_sync_aplicacoes_cliente ON public.lr_sync_aplicacoes (cliente_id, aplicada_em DESC);

CREATE TABLE public.lr_sync_aplicacao_itens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aplicacao_id   uuid NOT NULL REFERENCES public.lr_sync_aplicacoes(id),
  seq            int NOT NULL,
  chave          text,
  acao           text NOT NULL,
  lancamento_id  uuid,
  antes          jsonb,
  depois         jsonb,
  vinculo_antes  jsonb,
  vinculo_tocado boolean NOT NULL DEFAULT false,
  status         text NOT NULL CHECK (status IN ('aplicado', 'recusado', 'desfeito', 'nao_desfeito')),
  motivo         text
);
COMMENT ON TABLE public.lr_sync_aplicacao_itens IS
  'FIN-LR-SYNC-01a2: cada decisao de uma aplicacao (o lancamento antes/depois e o vinculo de antes, para desfazer). Escrita so'' pelas funcoes.';
CREATE INDEX idx_lr_sync_aplicacao_itens_aplicacao ON public.lr_sync_aplicacao_itens (aplicacao_id, seq);

ALTER TABLE public.lr_sync_aplicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lr_sync_aplicacao_itens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lr_sync_aplicacoes, public.lr_sync_aplicacao_itens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lr_sync_aplicacoes, public.lr_sync_aplicacao_itens TO authenticated;
GRANT ALL ON public.lr_sync_aplicacoes, public.lr_sync_aplicacao_itens TO service_role;
CREATE POLICY lr_sync_aplicacoes_select_tenant ON public.lr_sync_aplicacoes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
CREATE POLICY lr_sync_aplicacao_itens_select_tenant ON public.lr_sync_aplicacao_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lr_sync_aplicacoes a WHERE a.id = aplicacao_id AND public.tenant_ok(a.cliente_id)));

-- ── a comparacao guarda as linhas (patch guardado por md5: origem, cada ancora 1x, destino) ──
DO $p$
DECLARE v_oid oid := 'public.fn_lr_sync_comparar(uuid, uuid, jsonb)'::regprocedure; v_md5 text; v_def text; i int; n int;
  t text[][] := ARRAY[
    ARRAY['  INSERT INTO public.lr_sync_sessoes (id, cliente_id, arquivos, resumo, criado_por, status)',
          '  INSERT INTO public.lr_sync_sessoes (id, cliente_id, arquivos, resumo, criado_por, status, linhas)'],
    ARRAY['          v_res, auth.uid(), ''comparada'')',
          '          v_res, auth.uid(), ''comparada'', p_linhas)'],
    ARRAY['ON CONFLICT (id) DO UPDATE SET arquivos = EXCLUDED.arquivos, resumo = EXCLUDED.resumo WHERE',
          'ON CONFLICT (id) DO UPDATE SET arquivos = EXCLUDED.arquivos, resumo = EXCLUDED.resumo, linhas = EXCLUDED.linhas WHERE']];
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = v_oid;
  IF v_md5 = 'f7d9ebb8e44cfdc8641ca3052d329ba1' THEN RETURN; END IF;
  IF v_md5 IS DISTINCT FROM '8eb040187a347d831f5ddd5a3e181327' THEN
    RAISE EXCEPTION 'FIN-LR-SYNC-01a2: fn_lr_sync_comparar com md5 inesperado (%). Abortado.', v_md5; END IF;
  v_def := pg_get_functiondef(v_oid);
  FOR i IN 1 .. array_length(t, 1) LOOP
    n := (length(v_def) - length(replace(v_def, t[i][1], ''))) / length(t[i][1]);
    IF n <> 1 THEN RAISE EXCEPTION 'FIN-LR-SYNC-01a2: ancora % casou % vezes. Abortado.', i, n; END IF;
    v_def := replace(v_def, t[i][1], t[i][2]);
  END LOOP;
  EXECUTE v_def;
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = v_oid;
  IF v_md5 IS DISTINCT FROM 'f7d9ebb8e44cfdc8641ca3052d329ba1' THEN
    RAISE EXCEPTION 'FIN-LR-SYNC-01a2: fn_lr_sync_comparar ficou com md5 %. Abortado.', v_md5; END IF;
END $p$;

-- ── o escritor declarado (espelho de buildInsertRow / editarLancamento) ──
CREATE FUNCTION public._fn_lancamento_programado_gravar(p_op text, p_id uuid, p_campos jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $f$
DECLARE v_id uuid; v_dir text := p_campos ->> 'tipo_operacao'; v_comp date := (p_campos ->> 'data_competencia')::date;
BEGIN
  IF p_op = 'criar' THEN
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id, data_competencia,
        data_vencimento, data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, escopo_negocio,
        observacao, numero_documento, favorecido_id, safra_id, ano_mes, origem_lancamento, created_by, sem_movimentacao_caixa, cenario)
    VALUES ((p_campos ->> 'cliente_id')::uuid, (p_campos ->> 'fazenda_id')::uuid,
        CASE WHEN v_dir LIKE '2-%' THEN nullif(p_campos ->> 'conta_id', '')::uuid END,
        CASE WHEN v_dir LIKE '1-%' THEN nullif(p_campos ->> 'conta_id', '')::uuid END,
        v_comp, (p_campos ->> 'data_vencimento')::date, NULL, abs((p_campos ->> 'valor')::numeric),
        CASE WHEN v_dir LIKE '1-%' THEN '1' ELSE '-1' END, v_dir, 'programado', nullif(p_campos ->> 'descricao', ''),
        (p_campos ->> 'plano_conta_id')::uuid,
        (SELECT pc.escopo_negocio FROM public.financeiro_plano_contas pc WHERE pc.id = (p_campos ->> 'plano_conta_id')::uuid),
        nullif(p_campos ->> 'observacao', ''), nullif(p_campos ->> 'numero_documento', ''), (p_campos ->> 'favorecido_id')::uuid,
        nullif(p_campos ->> 'safra_id', '')::uuid, to_char(v_comp, 'YYYY-MM'), coalesce(p_campos ->> 'origem_lancamento', 'lucro_rural'),
        auth.uid(), false, 'realizado')
    RETURNING id INTO v_id;
    RETURN v_id;
  ELSIF p_op = 'atualizar' THEN
    UPDATE public.financeiro_lancamentos_v2
       SET valor = CASE WHEN p_campos ? 'valor' THEN abs((p_campos ->> 'valor')::numeric) ELSE valor END,
           data_vencimento = CASE WHEN p_campos ? 'data_vencimento' THEN (p_campos ->> 'data_vencimento')::date ELSE data_vencimento END,
           valor_do_mes_em = CASE WHEN p_campos ? 'valor_do_mes_em' THEN nullif(p_campos ->> 'valor_do_mes_em', '')::timestamptz ELSE valor_do_mes_em END,
           valor_do_mes_origem = CASE WHEN p_campos ? 'valor_do_mes_origem' THEN nullif(p_campos ->> 'valor_do_mes_origem', '') ELSE valor_do_mes_origem END,
           updated_at = now(), updated_by = auth.uid()
     WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Lancamento % nao encontrado', p_id USING ERRCODE = 'P0001'; END IF;
    RETURN v_id;
  END IF;
  RAISE EXCEPTION 'Operacao % invalida', p_op USING ERRCODE = '22023';
END $f$;

-- o lancamento como foto (sem os carimbos de atualizacao)
CREATE FUNCTION public._fn_lr_foto_lancamento(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT to_jsonb(f) - 'updated_at' - 'updated_by' FROM public.financeiro_lancamentos_v2 f WHERE f.id = p_id
$f$;

-- mes fechado: a regra do cancelamento canonico (fn_cancelar_lancamento_auditoria)
CREATE FUNCTION public._fn_lr_mes_fechado(p_cliente uuid, p_fazenda uuid, p_ano_mes text) RETURNS boolean LANGUAGE sql STABLE
SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM public.financeiro_fechamentos x WHERE x.cliente_id = p_cliente AND x.fazenda_id = p_fazenda
                    AND x.ano_mes = p_ano_mes AND x.status_fechamento = 'fechado')
$f$;

-- por que este lancamento NAO pode ser editado pelo LR (nulo = pode)
CREATE FUNCTION public._fn_lr_trava_edicao(p_id uuid) RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $f$
DECLARE f public.financeiro_lancamentos_v2;
BEGIN
  SELECT * INTO f FROM public.financeiro_lancamentos_v2 WHERE id = p_id;
  IF NOT FOUND THEN RETURN 'lancamento_inexistente'; END IF;
  IF f.cancelado IS TRUE THEN RETURN 'lancamento_cancelado'; END IF;
  IF f.status_transacao IN ('realizado', 'conciliado') OR f.data_pagamento IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens i WHERE i.lancamento_id = f.id AND i.desfeito_em IS NULL) THEN RETURN 'ja_realizado'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes zp WHERE zp.financeiro_lancamento_id = f.id AND zp.cancelada = false) THEN RETURN 'parte_viva_de_oc'; END IF;
  IF f.financiamento_id IS NOT NULL THEN RETURN 'parcela_de_contrato'; END IF;
  IF f.origem_lancamento = 'importacao_historica' AND NOT coalesce(public.is_admin_agroinblue(auth.uid()), false) THEN RETURN 'importacao_historica'; END IF;
  IF public._fn_lr_mes_fechado(f.cliente_id, f.fazenda_id, f.ano_mes) THEN RETURN 'mes_fechado'; END IF;
  RETURN NULL;
END $f$;

-- por que este lancamento NAO pode ser o alvo de um vinculo (nulo = pode)
CREATE FUNCTION public._fn_lr_alvo_motivo(p_cliente uuid, p_id uuid, p_chave text, p_tipo text) RETURNS text LANGUAGE sql STABLE
SET search_path = public AS $f$
  SELECT CASE
    WHEN p_id IS NULL THEN 'sem_lancamento'
    WHEN f.id IS NULL OR f.cliente_id IS DISTINCT FROM p_cliente THEN 'lancamento_inexistente'
    WHEN f.cancelado IS TRUE THEN 'lancamento_cancelado'
    WHEN f.tipo_operacao IS DISTINCT FROM CASE p_tipo WHEN 'r' THEN '1-Entradas' ELSE '2-Saídas' END THEN 'direcao_diferente'
    WHEN EXISTS (SELECT 1 FROM public.zoo_operacao_partes zp WHERE zp.financeiro_lancamento_id = f.id AND zp.cancelada = false) THEN 'parte_viva_de_oc'
    WHEN EXISTS (SELECT 1 FROM public.lr_vinculos v WHERE v.cliente_id = p_cliente AND v.lancamento_id = f.id AND v.chave <> p_chave
                    AND NOT v.ignorar) THEN 'lancamento_ja_vinculado'
  END
  FROM (SELECT 1) x LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = p_id
$f$;

CREATE FUNCTION public._fn_lr_vinculo_gravar(p_cliente uuid, p_chave text, p_lanc uuid, p_ignorar boolean, p_foto jsonb, p_pago date)
RETURNS void LANGUAGE sql SET search_path = public AS $f$
  INSERT INTO public.lr_vinculos (cliente_id, chave, lancamento_id, ignorar, foto, criado_por, pago_no_lr_em)
  VALUES (p_cliente, p_chave, p_lanc, p_ignorar, p_foto, auth.uid(), p_pago)
  ON CONFLICT (cliente_id, chave) DO UPDATE SET lancamento_id = EXCLUDED.lancamento_id, ignorar = EXCLUDED.ignorar, foto = EXCLUDED.foto,
    pago_no_lr_em = EXCLUDED.pago_no_lr_em, atualizado_em = now()
$f$;

CREATE FUNCTION public._fn_lr_vinculo_voltar(p_cliente uuid, p_chave text, p_antes jsonb) RETURNS void LANGUAGE plpgsql
SET search_path = public AS $f$
BEGIN
  IF p_antes IS NULL THEN
    DELETE FROM public.lr_vinculos WHERE cliente_id = p_cliente AND chave = p_chave;
  ELSE
    UPDATE public.lr_vinculos SET lancamento_id = nullif(p_antes ->> 'lancamento_id', '')::uuid, ignorar = (p_antes ->> 'ignorar')::boolean,
           foto = p_antes -> 'foto', pago_no_lr_em = nullif(p_antes ->> 'pago_no_lr_em', '')::date, atualizado_em = now()
     WHERE cliente_id = p_cliente AND chave = p_chave;
  END IF;
END $f$;

-- ── aplicar ──
CREATE FUNCTION public._fn_lr_sync_aplicar_exec(p_cliente uuid, p_sessao uuid, p_decisoes jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $f$
DECLARE
  v_ses public.lr_sync_sessoes; v_cmp jsonb; v_ap uuid := gen_random_uuid(); d jsonb; l jsonb; v_raw jsonb;
  v_acao text; v_sit text; v_pad text; v_motivo text; v_lanc uuid; v_vant jsonb; v_antes jsonb; v_depois jsonb; v_tocado boolean;
  v_seq int := 0; v_campos jsonb; v_dif jsonb; v_perm text[]; v_plano uuid; v_faz uuid; v_forn uuid; v_conta uuid; v_comp date;
  v_venc date; v_safra uuid; f public.financeiro_lancamentos_v2; v_vistas text[] := '{}'; v_res jsonb; v_itens jsonb;
BEGIN
  SELECT * INTO v_ses FROM public.lr_sync_sessoes WHERE id = p_sessao;
  IF NOT FOUND OR v_ses.cliente_id IS DISTINCT FROM p_cliente THEN
    RAISE EXCEPTION 'Comparacao % nao encontrada neste cliente', p_sessao USING ERRCODE = 'P0002'; END IF;
  IF v_ses.linhas IS NULL THEN
    RAISE EXCEPTION 'Esta comparacao nao guardou as linhas do Lucro Rural: compare de novo antes de aplicar.' USING ERRCODE = 'P0001'; END IF;
  v_cmp := public.fn_lr_sync_comparar(p_cliente, p_sessao, v_ses.linhas);
  INSERT INTO public.lr_sync_aplicacoes (id, cliente_id, sessao_id, aplicada_por) VALUES (v_ap, p_cliente, p_sessao, auth.uid());

  FOR d IN SELECT x FROM jsonb_array_elements(p_decisoes) x LOOP
    v_acao := d ->> 'acao'; v_motivo := NULL; v_lanc := NULL; v_antes := NULL; v_depois := NULL; v_vant := NULL; v_tocado := false; l := NULL;
    IF v_acao IS NULL OR v_acao = 'nada' THEN CONTINUE; END IF;
    v_seq := v_seq + 1;
    SELECT x INTO l FROM jsonb_array_elements(v_cmp -> 'linhas') x WHERE x ->> 'chave' = d ->> 'chave';
    IF l IS NULL THEN v_motivo := 'chave_inexistente';
    ELSIF (d ->> 'chave') = ANY (v_vistas) THEN v_motivo := 'chave_repetida';
    ELSE
      v_sit := l ->> 'situacao'; v_pad := l ->> 'acao_padrao';
      IF (d ->> 'situacao') IS DISTINCT FROM v_sit
         OR (d ? 'lancamento_visto' AND nullif(d ->> 'lancamento_visto', '') IS DISTINCT FROM (l ->> 'lancamento_id')) THEN
        v_motivo := 'mudou_desde_a_comparacao';
      ELSIF v_acao IN ('decidir', 'decidir_centavos', 'nao_importar_fatura') THEN v_motivo := 'decisao_do_operador';
      ELSE
        v_perm := CASE v_sit
          WHEN 'nova' THEN ARRAY['criar_programada', 'vincular', 'ignorar']
          WHEN 'sem_mudanca' THEN ARRAY['vincular', 'ignorar']
          WHEN 'mudou' THEN ARRAY['atualizar', 'vincular', 'manter', 'ignorar']
          WHEN 'pago_no_lr' THEN ARRAY['aguardar_extrato', 'vincular', 'ignorar']
          WHEN 'decidir' THEN CASE
            WHEN v_pad = 'nao_importar_fatura' THEN ARRAY['ignorar', 'vincular']
            WHEN l ->> 'motivo' = 'financiamento' THEN ARRAY['vincular', 'ignorar']
            WHEN l ->> 'motivo' = 'vinculo_sem_lancamento' THEN ARRAY['vincular', 'ignorar', 'criar_programada']
            ELSE ARRAY['atualizar', 'vincular', 'ignorar'] END
          ELSE ARRAY[]::text[] END;
        IF NOT (v_acao = ANY (v_perm)) THEN v_motivo := 'acao_nao_permitida'; END IF;
      END IF;
      v_vistas := v_vistas || (d ->> 'chave');
    END IF;

    IF v_motivo IS NULL THEN
      v_raw := v_ses.linhas -> ((l ->> 'ordem')::int - 1);
      SELECT to_jsonb(v) - 'id' - 'cliente_id' - 'chave' INTO v_vant FROM public.lr_vinculos v WHERE v.cliente_id = p_cliente AND v.chave = l ->> 'chave';

      IF v_acao IN ('vincular', 'manter') THEN
        v_lanc := coalesce(nullif(d ->> 'lancamento_id', '')::uuid, (l ->> 'lancamento_id')::uuid);
        v_motivo := public._fn_lr_alvo_motivo(p_cliente, v_lanc, l ->> 'chave', l ->> 'tipo');
        IF v_motivo IS NULL THEN
          PERFORM public._fn_lr_vinculo_gravar(p_cliente, l ->> 'chave', v_lanc, false, v_raw, NULL); v_tocado := true; END IF;

      ELSIF v_acao = 'ignorar' THEN
        PERFORM public._fn_lr_vinculo_gravar(p_cliente, l ->> 'chave', NULL, true, v_raw, NULL); v_tocado := true;

      ELSIF v_acao = 'aguardar_extrato' THEN
        v_lanc := (l ->> 'lancamento_id')::uuid;
        PERFORM public._fn_lr_vinculo_gravar(p_cliente, l ->> 'chave', v_lanc, false, v_raw, (l -> 'lr' ->> 'pagamento')::date); v_tocado := true;

      ELSIF v_acao = 'atualizar' THEN
        v_lanc := (l ->> 'lancamento_id')::uuid;
        SELECT * INTO f FROM public.financeiro_lancamentos_v2 WHERE id = v_lanc FOR UPDATE;
        v_motivo := coalesce(public._fn_lr_alvo_motivo(p_cliente, v_lanc, l ->> 'chave', l ->> 'tipo'), public._fn_lr_trava_edicao(v_lanc));
        IF v_motivo IS NULL THEN
          v_dif := coalesce(l -> 'diferencas', '[]'::jsonb); v_campos := '{}'::jsonb;
          IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_dif) z WHERE z ->> 'campo' = 'valor') THEN
            v_campos := v_campos || jsonb_build_object('valor', ((l -> 'lr' ->> 'valor_c')::numeric / 100)); END IF;
          IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_dif) z WHERE z ->> 'campo' = 'vencimento') THEN
            v_campos := v_campos || jsonb_build_object('data_vencimento', l -> 'lr' ->> 'vencimento'); END IF;
          IF v_campos <> '{}'::jsonb THEN
            IF f.recorrencia_id IS NOT NULL THEN
              v_campos := v_campos || jsonb_build_object('valor_do_mes_em', now(), 'valor_do_mes_origem', 'planilha'); END IF;
            v_antes := public._fn_lr_foto_lancamento(v_lanc);
            PERFORM public._fn_lancamento_programado_gravar('atualizar', v_lanc, v_campos);
            v_depois := public._fn_lr_foto_lancamento(v_lanc);
          END IF;
          PERFORM public._fn_lr_vinculo_gravar(p_cliente, l ->> 'chave', v_lanc, false, v_raw, NULL); v_tocado := true;
        END IF;

      ELSIF v_acao = 'criar_programada' THEN
        v_plano := coalesce(nullif(d -> 'classificacao' ->> 'plano_conta_id', ''), l -> 'resolvido' ->> 'plano_conta_id')::uuid;
        v_faz := coalesce(nullif(d -> 'classificacao' ->> 'fazenda_id', ''), l -> 'resolvido' ->> 'fazenda_id')::uuid;
        v_forn := coalesce(nullif(d -> 'classificacao' ->> 'favorecido_id', ''), l -> 'resolvido' ->> 'fornecedor_id')::uuid;
        v_conta := coalesce(nullif(d -> 'classificacao' ->> 'conta_id', ''), l -> 'resolvido' ->> 'conta_id')::uuid;
        v_venc := (l -> 'lr' ->> 'vencimento')::date;
        v_comp := coalesce((l -> 'lr' ->> 'competencia')::date, v_venc);
        IF v_plano IS NULL OR v_faz IS NULL OR v_forn IS NULL THEN v_motivo := 'falta_classificar';
        ELSIF v_venc IS NULL OR (l -> 'lr' ->> 'valor_c') IS NULL THEN v_motivo := 'sem_vencimento_ou_valor';
        ELSIF NOT EXISTS (SELECT 1 FROM public.financeiro_plano_contas pc WHERE pc.id = v_plano AND pc.ativo
                            AND (pc.cliente_id IS NULL OR pc.cliente_id = p_cliente)
                            AND pc.tipo_operacao = CASE l ->> 'tipo' WHEN 'r' THEN '1-Entradas' ELSE '2-Saídas' END) THEN v_motivo := 'classificacao_invalida';
        ELSIF NOT EXISTS (SELECT 1 FROM public.fazendas z WHERE z.id = v_faz AND z.cliente_id = p_cliente)
           OR NOT EXISTS (SELECT 1 FROM public.financeiro_fornecedores fo WHERE fo.id = v_forn AND fo.cliente_id = p_cliente)
           OR (v_conta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.financeiro_contas_bancarias b WHERE b.id = v_conta AND b.cliente_id = p_cliente)) THEN
          v_motivo := 'cadastro_de_outro_cliente';
        ELSIF public._fn_lr_mes_fechado(p_cliente, v_faz, to_char(v_comp, 'YYYY-MM')) THEN v_motivo := 'mes_fechado';
        ELSE
          -- a safra so' entra se for da mesma atividade da conta do plano (a regra do modal: safra de outro escopo nao fica)
          v_safra := coalesce(nullif(d -> 'classificacao' ->> 'safra_id', ''), l -> 'resolvido' ->> 'safra_id')::uuid;
          IF v_safra IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.financeiro_safras sf JOIN public.financeiro_plano_contas pc ON pc.id = v_plano
                                                  WHERE sf.id = v_safra AND sf.cliente_id = p_cliente
                                                    AND sf.escopo_negocio IS NOT DISTINCT FROM pc.escopo_negocio) THEN v_safra := NULL; END IF;
          v_lanc := public._fn_lancamento_programado_gravar('criar', NULL, jsonb_build_object(
            'cliente_id', p_cliente, 'fazenda_id', v_faz, 'conta_id', v_conta, 'tipo_operacao', CASE l ->> 'tipo' WHEN 'r' THEN '1-Entradas' ELSE '2-Saídas' END,
            'data_competencia', v_comp, 'data_vencimento', v_venc, 'valor', (l -> 'lr' ->> 'valor_c')::numeric / 100,
            'descricao', coalesce(nullif(btrim(coalesce(v_raw ->> 'Descrição', v_raw ->> 'Histórico', '')), ''), l -> 'lr' ->> 'contraparte'),
            'plano_conta_id', v_plano, 'favorecido_id', v_forn, 'safra_id', v_safra,
            'numero_documento', nullif(l -> 'lr' ->> 'numero', ''), 'origem_lancamento', 'lucro_rural'));
          v_depois := public._fn_lr_foto_lancamento(v_lanc);
          PERFORM public._fn_lr_vinculo_gravar(p_cliente, l ->> 'chave', v_lanc, false, v_raw, NULL); v_tocado := true;
        END IF;
      END IF;
    END IF;

    INSERT INTO public.lr_sync_aplicacao_itens (aplicacao_id, seq, chave, acao, lancamento_id, antes, depois, vinculo_antes, vinculo_tocado, status, motivo)
    VALUES (v_ap, v_seq, d ->> 'chave', v_acao, v_lanc, v_antes, v_depois, v_vant, v_tocado,
            CASE WHEN v_motivo IS NULL THEN 'aplicado' ELSE 'recusado' END, v_motivo);
  END LOOP;

  SELECT jsonb_build_object(
           'aplicadas', count(*) FILTER (WHERE status = 'aplicado'), 'recusadas', count(*) FILTER (WHERE status = 'recusado'),
           'por_acao', coalesce((SELECT jsonb_object_agg(acao, q) FROM (SELECT acao, count(*) q FROM public.lr_sync_aplicacao_itens
                                  WHERE aplicacao_id = v_ap AND status = 'aplicado' GROUP BY acao) z), '{}'::jsonb),
           'por_motivo', coalesce((SELECT jsonb_object_agg(motivo, q) FROM (SELECT motivo, count(*) q FROM public.lr_sync_aplicacao_itens
                                  WHERE aplicacao_id = v_ap AND status = 'recusado' GROUP BY motivo) z), '{}'::jsonb))
    INTO v_res FROM public.lr_sync_aplicacao_itens WHERE aplicacao_id = v_ap;
  UPDATE public.lr_sync_aplicacoes SET resumo = v_res WHERE id = v_ap;
  SELECT coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'chave', chave, 'acao', acao, 'lancamento_id', lancamento_id, 'status', status,
           'motivo', motivo) ORDER BY seq), '[]'::jsonb) INTO v_itens FROM public.lr_sync_aplicacao_itens WHERE aplicacao_id = v_ap;
  RETURN jsonb_build_object('aplicacao_id', v_ap, 'sessao', p_sessao, 'resumo', v_res, 'itens', v_itens);
END $f$;

CREATE FUNCTION public.fn_lr_sync_aplicar(p_cliente uuid, p_sessao uuid, p_decisoes jsonb, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public SET plan_cache_mode = force_custom_plan AS $f$
DECLARE v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'acesso negado ao cliente' USING errcode = '42501'; END IF;
  IF p_sessao IS NULL OR jsonb_typeof(p_decisoes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'sessao e decisoes (array) obrigatorias' USING errcode = '22023'; END IF;
  IF p_simular IS NOT FALSE THEN
    BEGIN
      v := public._fn_lr_sync_aplicar_exec(p_cliente, p_sessao, p_decisoes);
      RAISE EXCEPTION 'simulacao' USING errcode = 'LRSIM';
    EXCEPTION WHEN SQLSTATE 'LRSIM' THEN
      RETURN v || jsonb_build_object('simulado', true);
    END;
  END IF;
  v := public._fn_lr_sync_aplicar_exec(p_cliente, p_sessao, p_decisoes);
  RETURN v || jsonb_build_object('simulado', false);
END $f$;

-- ── desfazer ──
CREATE FUNCTION public._fn_lr_sync_desfazer_exec(p_cliente uuid, p_aplicacao uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $f$
DECLARE a public.lr_sync_aplicacoes; it public.lr_sync_aplicacao_itens; f public.financeiro_lancamentos_v2; v_motivo text; v_res jsonb; v_itens jsonb;
BEGIN
  SELECT * INTO a FROM public.lr_sync_aplicacoes WHERE cliente_id = p_cliente AND desfeita_em IS NULL
   ORDER BY aplicada_em DESC, id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nenhuma atualizacao do Lucro Rural a desfazer.' USING ERRCODE = 'P0001'; END IF;
  IF p_aplicacao IS NOT NULL AND p_aplicacao IS DISTINCT FROM a.id THEN
    RAISE EXCEPTION 'So'' a ultima atualizacao do Lucro Rural pode ser desfeita (a de %); desfaca-a antes.',
      to_char(a.aplicada_em AT TIME ZONE 'America/Campo_Grande', 'DD/MM/YYYY HH24:MI') USING ERRCODE = 'P0001'; END IF;

  FOR it IN SELECT * FROM public.lr_sync_aplicacao_itens WHERE aplicacao_id = a.id AND status = 'aplicado' ORDER BY seq DESC LOOP
    v_motivo := NULL;
    IF it.lancamento_id IS NOT NULL AND it.depois IS NOT NULL THEN
      SELECT * INTO f FROM public.financeiro_lancamentos_v2 WHERE id = it.lancamento_id FOR UPDATE;
      IF NOT FOUND THEN v_motivo := 'lancamento_inexistente';
      ELSIF public._fn_lr_foto_lancamento(it.lancamento_id) IS DISTINCT FROM it.depois THEN
        v_motivo := CASE WHEN f.status_transacao IN ('realizado', 'conciliado') OR f.data_pagamento IS NOT NULL
                            OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens i WHERE i.lancamento_id = f.id AND i.desfeito_em IS NULL)
                          THEN 'pago_ou_conciliado_depois' ELSE 'editado_depois' END;
      ELSIF public._fn_lr_mes_fechado(f.cliente_id, f.fazenda_id, f.ano_mes) THEN v_motivo := 'mes_fechado';
      ELSIF it.antes IS NULL THEN
        PERFORM public.fn_cancelar_lancamento_auditoria(it.lancamento_id, 'Desfazer a atualizacao do Lucro Rural');
      ELSE
        PERFORM public._fn_lancamento_programado_gravar('atualizar', it.lancamento_id, jsonb_build_object(
          'valor', it.antes ->> 'valor', 'data_vencimento', it.antes ->> 'data_vencimento',
          'valor_do_mes_em', coalesce(it.antes ->> 'valor_do_mes_em', ''), 'valor_do_mes_origem', coalesce(it.antes ->> 'valor_do_mes_origem', '')));
      END IF;
    END IF;
    IF v_motivo IS NULL AND it.vinculo_tocado THEN PERFORM public._fn_lr_vinculo_voltar(p_cliente, it.chave, it.vinculo_antes); END IF;
    UPDATE public.lr_sync_aplicacao_itens SET status = CASE WHEN v_motivo IS NULL THEN 'desfeito' ELSE 'nao_desfeito' END,
           motivo = coalesce(v_motivo, motivo) WHERE id = it.id;
  END LOOP;

  SELECT jsonb_build_object('desfeitas', count(*) FILTER (WHERE status = 'desfeito'), 'nao_desfeitas', count(*) FILTER (WHERE status = 'nao_desfeito'),
           'por_motivo', coalesce((SELECT jsonb_object_agg(motivo, q) FROM (SELECT motivo, count(*) q FROM public.lr_sync_aplicacao_itens
                                  WHERE aplicacao_id = a.id AND status = 'nao_desfeito' GROUP BY motivo) z), '{}'::jsonb))
    INTO v_res FROM public.lr_sync_aplicacao_itens WHERE aplicacao_id = a.id AND status IN ('desfeito', 'nao_desfeito');
  UPDATE public.lr_sync_aplicacoes SET desfeita_em = now(), desfeita_por = auth.uid(), resumo_desfazer = v_res WHERE id = a.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'chave', chave, 'acao', acao, 'lancamento_id', lancamento_id, 'status', status,
           'motivo', motivo) ORDER BY seq), '[]'::jsonb) INTO v_itens
    FROM public.lr_sync_aplicacao_itens WHERE aplicacao_id = a.id AND status IN ('desfeito', 'nao_desfeito');
  RETURN jsonb_build_object('aplicacao_id', a.id, 'resumo', v_res, 'itens', v_itens);
END $f$;

CREATE FUNCTION public.fn_lr_sync_desfazer(p_cliente uuid, p_aplicacao uuid DEFAULT NULL, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $f$
DECLARE v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'acesso negado ao cliente' USING errcode = '42501'; END IF;
  IF p_simular IS NOT FALSE THEN
    BEGIN
      v := public._fn_lr_sync_desfazer_exec(p_cliente, p_aplicacao);
      RAISE EXCEPTION 'simulacao' USING errcode = 'LRSIM';
    EXCEPTION WHEN SQLSTATE 'LRSIM' THEN
      RETURN v || jsonb_build_object('simulado', true);
    END;
  END IF;
  v := public._fn_lr_sync_desfazer_exec(p_cliente, p_aplicacao);
  RETURN v || jsonb_build_object('simulado', false);
END $f$;

REVOKE ALL ON FUNCTION public._fn_lancamento_programado_gravar(text, uuid, jsonb), public._fn_lr_foto_lancamento(uuid),
  public._fn_lr_mes_fechado(uuid, uuid, text), public._fn_lr_trava_edicao(uuid), public._fn_lr_alvo_motivo(uuid, uuid, text, text),
  public._fn_lr_vinculo_gravar(uuid, text, uuid, boolean, jsonb, date), public._fn_lr_vinculo_voltar(uuid, text, jsonb),
  public._fn_lr_sync_aplicar_exec(uuid, uuid, jsonb), public._fn_lr_sync_desfazer_exec(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lr_sync_aplicar(uuid, uuid, jsonb, boolean), public.fn_lr_sync_desfazer(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lr_sync_aplicar(uuid, uuid, jsonb, boolean), public.fn_lr_sync_desfazer(uuid, uuid, boolean)
  TO authenticated, service_role;
