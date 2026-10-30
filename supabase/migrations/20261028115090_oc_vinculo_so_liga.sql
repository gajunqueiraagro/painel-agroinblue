-- OC-VINCULO-VALOR — VINCULAR SO' LIGA (Gabriel, 30/10/2026 06:07): "Vincular não pode mudar valor, não pode nada, nada, nada.
-- Cria um novo, se for o caso, dentro da OC".
--
-- O DEFEITO (medido em 29/10/2026): o lancamento manual "Abate 185 cab. - Acompanhamento" (R$ 1.850,00, agendado) ocupava a parcela do
--   compromisso dele; ligar o Fundersul (R$ 1.803,75, outro fornecedor) ao MESMO compromisso — escolhido sozinho, por ser o unico
--   livre do componente — caiu no ramo do recebimento parcial e REDUZIU o lancamento manual ao "saldo" (R$ 46,25), e trocou a
--   competencia do Fundersul para a data da OC. Dos 69 vinculos da trilha, foi o unico lancamento NAO gerado pela OC atingido; 51 dos
--   69 trocaram a competencia do lancamento ligado (12 de mes). O dado foi devolvido em 30/10 pelo `oc_desvincular_lancamento`.
--
-- ESTADO ANTERIOR
--   oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean)  md5(prosrc) = 659896721f642a198ecd56d44c17034b
--   _oc_vincular_recebimento(uuid, integer, uuid, text, boolean)                          md5(prosrc) = a3366810662368f6a1fc0e08bf6abc70
--
-- O QUE MUDA (so' corpos de funcao e um parametro novo; nenhuma tabela, indice, view ou dado)
--   (1) O lancamento ligado sai como entrou: valor, descricao, classificacao, competencia, safra, datas, status e cancelado — guarda
--       no fim (muda = nada gravado). O elo antigo com o rebanho (`movimentacao_rebanho_id`) continua se soltando (D4), como hoje.
--   (2) Parcela ocupada por lancamento que NAO foi gerado pela OC (`origem_lancamento <> 'operacao_comercial'`): RECUSA
--       `parcela_tem_lancamento` ("Este compromisso já tem o lançamento X (R$ …). Crie um compromisso novo para este."), com
--       `pode_criar_novo`; a tela oferece "Criar compromisso novo" (`p_criar_novo`, o caminho de hoje: compromisso novo dentro da OC
--       com o valor do lancamento ligado). Nada e' gravado.
--   (3) Compromisso escolhido sozinho (o unico livre do item) com FORNECEDOR diferente do lancamento: nunca escolhe — devolve
--       `escolher_compromisso` (`fornecedor_diferente`, `pode_criar_novo`). Compromisso escolhido pelo operador segue.
--   (4) Titulo PROGRAMADO gerado pela OC que ocupa a parcela (reduzir ao saldo / cancelar na substituicao, regra de 05/10): so' com
--       `p_aceitar_titulo_oc = true`. Sem ele a gravacao recusa `confirmar_titulo_oc`; a simulacao devolve `confirmar_titulo_oc`
--       {acao, titulo_id, valor_antes, valor_depois, frase: "O título programado da OC de R$ X passa a R$ Y."} para a previa.
--   (5) Competencia: o vincular deixa de trocar a competencia (e a safra) do lancamento ligado — nem a data da OC, nem a da saida do
--       gado (FIN-COMPETENCIA-VENDA-01a deixa de rodar no vincular, nos dois caminhos). Os 51 ja' feitos ficam como estao.
--   ASSINATURA: `oc_vincular_lancamento` ganha `p_aceitar_titulo_oc boolean DEFAULT false` no fim (os chamadores de hoje — por nome na
--   tela, posicionais com 5 argumentos no `oc_criar_do_legado` e no `fn_conc_ligar_com_diferenca` — seguem resolvendo). A antiga sai.
--   ACL igual a de antes: postgres, service_role, authenticated; nunca PUBLIC/anon.
--
-- PATCH GUARDADO POR md5 (origem, cada ancora exatamente 1x, destino conferido no ensaio).

DO $mig$
DECLARE
  v_src text; v_novo text; v_a text; v_b text; v_args text;
BEGIN
  -- ═══ oc_vincular_lancamento ═══
  SELECT p.prosrc INTO v_src FROM pg_proc p
   WHERE p.oid = 'public.oc_vincular_lancamento(uuid,integer,uuid,text,text,uuid,uuid,boolean,boolean)'::regprocedure;
  IF md5(v_src) <> '659896721f642a198ecd56d44c17034b' THEN
    RAISE EXCEPTION 'OC-VINCULO-VALOR: oc_vincular_lancamento com corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- V1: a variavel da confirmacao
  v_a := $a1$  v_parc_status_antes text;
BEGIN
$a1$;
  v_b := $b1$  v_parc_status_antes text;
  -- OC-VINCULO-VALOR (4): o que o vinculo faria com o titulo programado da OC que ocupa a parcela (nulo se nada)
  v_pede_conf jsonb;
BEGIN
$b1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULO-VALOR: ancora V1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- V2 (3): fornecedor diferente — nunca escolhe sozinho
  v_a := $a2$    ELSIF v_n = 1 THEN
      SELECT * INTO v_comp FROM public.zoo_operacao_compromissos c
       WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente AND c.status <> 'cancelado'
         AND NOT public._oc_vinculo_compromisso_liquidado(c.id)
       FOR UPDATE;
$a2$;
  v_b := v_a || $b2$      -- OC-VINCULO-VALOR (3): o unico livre do item, mas de OUTRO fornecedor: o operador escolhe (ou cria um novo)
      IF v_comp.favorecido_id IS NOT NULL AND v_l.favorecido_id IS NOT NULL AND v_comp.favorecido_id <> v_l.favorecido_id THEN
        RETURN jsonb_build_object('ok', false, 'acao', 'recusado', 'motivo', 'escolher_compromisso', 'fornecedor_diferente', true,
          'pode_criar_novo', true,
          'compromissos', jsonb_build_array(jsonb_build_object('id', v_comp.id, 'componente', v_comp.componente,
                            'descricao', v_comp.descricao, 'valor_total', v_comp.valor_total, 'status', v_comp.status)),
          'operacao_versao', v_op.versao);
      END IF;
$b2$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULO-VALOR: ancora V2 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- V3 (2): lancamento que nao e' da OC ocupando a parcela — recusa
  v_a := $a3$        SELECT * INTO v_tit_velho FROM public.financeiro_lancamentos_v2
         WHERE id = v_parte_velha.financeiro_lancamento_id FOR UPDATE;
$a3$;
  v_b := v_a || $b3$        -- OC-VINCULO-VALOR (2): o vinculo nunca reduz nem cancela lancamento que a OC nao gerou
        IF v_tit_velho.id IS NOT NULL AND v_tit_velho.cancelado IS NOT TRUE
           AND v_tit_velho.origem_lancamento IS DISTINCT FROM 'operacao_comercial' THEN
          RETURN jsonb_build_object('ok', false, 'acao', 'recusado', 'motivo', 'parcela_tem_lancamento',
            'compromisso_id', v_comp.id, 'pode_criar_novo', true,
            'titulo', jsonb_build_object('id', v_tit_velho.id, 'valor', v_tit_velho.valor, 'descricao', v_tit_velho.descricao,
                        'status_transacao', v_tit_velho.status_transacao),
            'frase', format('Este compromisso já tem o lançamento %s (%s). Crie um compromisso novo para este.',
                            coalesce(v_tit_velho.descricao, '—'), public._fn_oc_brl(abs(v_tit_velho.valor))),
            'operacao_versao', v_op.versao);
        END IF;
$b3$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULO-VALOR: ancora V3 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- V4 (4): o titulo programado da OC so' encolhe / e' substituido com a confirmacao
  v_a := $a4$  -- ═══ daqui para baixo, escreve ═══
$a4$;
  v_b := $b4$  -- OC-VINCULO-VALOR (4): o titulo PROGRAMADO da OC que ocupa a parcela (o unico que chega aqui: o resto recusou acima) so' e'
  -- reduzido ao saldo ou substituido com o clique do operador na previa (`p_aceitar_titulo_oc`). A simulacao diz o que acontece.
  IF v_parc.id IS NOT NULL AND v_parte_velha.id IS NOT NULL AND v_tit_velho.id IS NOT NULL AND v_tit_velho.cancelado IS NOT TRUE THEN
    v_pede_conf := jsonb_build_object('titulo_id', v_tit_velho.id, 'valor_antes', round(abs(v_tit_velho.valor), 2),
      'acao', CASE WHEN round(v_valor, 2) < round(v_parc.valor, 2) THEN 'reduzir' ELSE 'cancelar' END,
      'valor_depois', CASE WHEN round(v_valor, 2) < round(v_parc.valor, 2) THEN v_parc.valor - v_valor ELSE 0 END,
      'frase', CASE WHEN round(v_valor, 2) < round(v_parc.valor, 2)
        THEN format('O título programado da OC de %s passa a %s.', public._fn_oc_brl(abs(v_tit_velho.valor)), public._fn_oc_brl(v_parc.valor - v_valor))
        ELSE format('O título programado da OC de %s é cancelado: este lançamento ocupa a parcela.', public._fn_oc_brl(abs(v_tit_velho.valor))) END);
    IF p_simular IS NOT TRUE AND p_aceitar_titulo_oc IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'acao', 'recusado', 'motivo', 'confirmar_titulo_oc', 'confirmar_titulo_oc', v_pede_conf,
        'frase', v_pede_conf->>'frase', 'compromisso_id', v_comp.id, 'operacao_versao', v_op.versao);
    END IF;
  END IF;

  -- ═══ daqui para baixo, escreve ═══
$b4$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULO-VALOR: ancora V4 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- V5 (5): a competencia e a safra ficam as do lancamento
  v_a := $a5$  -- o lancamento: competencia = data da OC, elo zootecnico solto (D4)
  v_comp_nova := v_op.data_operacao;
  v_safra_nova := v_l.safra_id;
  -- FIN-COMPETENCIA-VENDA-01a: recebimento de venda/abate (principal de entrada no mapa, com caixa) tem competencia e safra da
  -- PRIMEIRA saida do gado da OC — a regra da entrega. Se a data da OC diverge da saida, manda a saida. OC sem saida: segue a
  -- data da OC, safra intocada (como antes). Despesa e o resto: data da OC, safra intocada (como antes).
  IF v_regra.natureza = 'principal' AND v_regra.tipo_operacao = '1-Entradas' AND NOT coalesce(v_l.sem_movimentacao_caixa, false)
     AND v_l.subcentro <> 'Venda em Boitel' THEN  -- boitel: fora da regra, segue a data da OC (Gabriel, 29/09/2026)
    SELECT c.data_competencia, c.safra_id INTO v_cps_data, v_cps_safra FROM public._oc_competencia_pela_saida(p_operacao_id) c;
    IF v_cps_data IS NOT NULL THEN
      v_pela_saida := true; v_comp_nova := v_cps_data; v_safra_nova := v_cps_safra;
    END IF;
  END IF;
  v_mov_antigo := v_l.movimentacao_rebanho_id;
  IF v_l.data_competencia IS DISTINCT FROM v_comp_nova OR v_mov_antigo IS NOT NULL OR v_l.safra_id IS DISTINCT FROM v_safra_nova THEN
    UPDATE public.financeiro_lancamentos_v2
       SET data_competencia = v_comp_nova, movimentacao_rebanho_id = NULL, safra_id = v_safra_nova,
           updated_at = now(), updated_by = v_actor
     WHERE id = v_l.id;
  END IF;
$a5$;
  v_b := $b5$  -- o lancamento: OC-VINCULO-VALOR (5, Gabriel 30/10) — competencia e safra FICAM as do lancamento (nem a data da OC, nem a da
  -- saida do gado: a FIN-COMPETENCIA-VENDA-01a nao roda mais no vincular). Os vinculos ja' feitos ficam como estao.
  -- So' o elo zootecnico antigo se solta (D4).
  v_comp_nova := v_l.data_competencia;
  v_safra_nova := v_l.safra_id;
  v_mov_antigo := v_l.movimentacao_rebanho_id;
  IF v_mov_antigo IS NOT NULL THEN
    UPDATE public.financeiro_lancamentos_v2
       SET movimentacao_rebanho_id = NULL, updated_at = now(), updated_by = v_actor
     WHERE id = v_l.id;
  END IF;
$b5$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULO-VALOR: ancora V5 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- V6 (1): a guarda — o lancamento ligado sai como entrou
  v_a := $a6$  -- D3: a identidade de importacao nao pode mudar (ver cabecalho). Se mudar, nada fica gravado.
$a6$;
  v_b := $b6$  -- OC-VINCULO-VALOR (1): VINCULAR SO' LIGA — o lancamento ligado sai como entrou. Se mudar, nada fica gravado.
  IF v_l_depois.valor IS DISTINCT FROM v_l.valor OR v_l_depois.descricao IS DISTINCT FROM v_l.descricao
     OR v_l_depois.plano_conta_id IS DISTINCT FROM v_l.plano_conta_id OR v_l_depois.subcentro IS DISTINCT FROM v_l.subcentro
     OR v_l_depois.data_competencia IS DISTINCT FROM v_l.data_competencia OR v_l_depois.safra_id IS DISTINCT FROM v_l.safra_id
     OR v_l_depois.data_pagamento IS DISTINCT FROM v_l.data_pagamento OR v_l_depois.data_vencimento IS DISTINCT FROM v_l.data_vencimento
     OR v_l_depois.status_transacao IS DISTINCT FROM v_l.status_transacao OR v_l_depois.cancelado IS DISTINCT FROM v_l.cancelado THEN
    RAISE EXCEPTION 'Vincular mudaria o lancamento % (vincular so liga); nada foi gravado', v_l.id USING ERRCODE = 'P0001'; END IF;
  -- D3: a identidade de importacao nao pode mudar (ver cabecalho). Se mudar, nada fica gravado.
$b6$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULO-VALOR: ancora V6 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- V7 (4): o retorno diz o que acontece com o titulo da OC
  v_a := $a7$    'avisos', v_avisos);

  -- ⚠ SIMULACAO = O MESMO CAMINHO, DESFEITO.$a7$;
  v_b := $b7$    'avisos', v_avisos,
    -- OC-VINCULO-VALOR (4): o titulo programado da OC que o vinculo reduz ou substitui (nulo se nada) — a previa o mostra
    'confirmar_titulo_oc', v_pede_conf);

  -- ⚠ SIMULACAO = O MESMO CAMINHO, DESFEITO.$b7$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULO-VALOR: ancora V7 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> 'bf009a38714ebf69f5b6bcc1aeaf0b88' THEN
    RAISE EXCEPTION 'OC-VINCULO-VALOR: oc_vincular_lancamento com corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  v_args := pg_get_function_arguments('public.oc_vincular_lancamento(uuid,integer,uuid,text,text,uuid,uuid,boolean,boolean)'::regprocedure)
            || ', p_aceitar_titulo_oc boolean DEFAULT false';
  EXECUTE format($f$CREATE FUNCTION public.oc_vincular_lancamento(%s) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS %L$f$,
                 v_args, v_novo);
  DROP FUNCTION public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean);
  REVOKE ALL ON FUNCTION public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean, boolean) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean, boolean) TO authenticated, service_role;

  -- ═══ _oc_vincular_recebimento (5) ═══
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = 'public._oc_vincular_recebimento(uuid,integer,uuid,text,boolean)'::regprocedure;
  IF md5(v_src) <> 'a3366810662368f6a1fc0e08bf6abc70' THEN
    RAISE EXCEPTION 'OC-VINCULO-VALOR: _oc_vincular_recebimento com corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  v_a := $r1$  -- OC-CC-CLASSIFICACAO-01: a conta FICA (subcentro da operacao); o DRE sai pela parte (gatilho). A competencia e a safra do
  -- recebimento de venda passam a ser as da saida do gado (FIN-COMPETENCIA-VENDA-01a, logo abaixo da guarda).
$r1$;
  v_b := $s1$  -- OC-CC-CLASSIFICACAO-01: a conta FICA (subcentro da operacao); o DRE sai pela parte (gatilho). A competencia e a safra
  -- tambem ficam (OC-VINCULO-VALOR, Gabriel 30/10: vincular so' liga).
$s1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULO-VALOR: ancora R1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  v_a := $r2$  -- FIN-COMPETENCIA-VENDA-01a: recebimento de venda/abate (principal de entrada no mapa) ganha competencia e safra da PRIMEIRA
  -- saida do gado da OC — a regra da entrega (`oc_sincronizar_entregas`). OC sem saida: nada muda. Valor, pagamento, banco e
  -- conta do plano ficam; a guarda repete-se depois da escrita. O anterior vai para o evento (a volta: `_oc_restaurar_competencia`).
  v_comp_ant := v_l.data_competencia; v_safra_ant := v_l.safra_id;
  IF EXISTS (SELECT 1 FROM public._oc_vinculo_mapa() m
              WHERE m.subcentro = v_l.subcentro AND m.natureza = 'principal' AND m.tipo_operacao = '1-Entradas'
                AND v_op.tipo_operacao = ANY (m.tipos_oc) AND m.subcentro <> 'Venda em Boitel') THEN  -- boitel: fora (Gabriel, 29/09)
    SELECT c.data_competencia, c.safra_id INTO v_cps_data, v_cps_safra FROM public._oc_competencia_pela_saida(p_operacao_id) c;
    IF v_cps_data IS NOT NULL THEN
      v_pela_saida := true;
      IF v_l_depois.data_competencia IS DISTINCT FROM v_cps_data OR v_l_depois.safra_id IS DISTINCT FROM v_cps_safra THEN
        UPDATE public.financeiro_lancamentos_v2
           SET data_competencia = v_cps_data, safra_id = v_cps_safra, updated_at = now(), updated_by = v_actor
         WHERE id = v_l.id;
        UPDATE public.financeiro_lancamentos_v2 SET hash_importacao = v_l.hash_importacao
         WHERE id = v_l.id AND hash_importacao IS DISTINCT FROM v_l.hash_importacao;
        SELECT * INTO v_l_depois FROM public.financeiro_lancamentos_v2 WHERE id = v_l.id;
        IF v_l_depois.hash_importacao IS DISTINCT FROM v_l.hash_importacao OR v_l_depois.valor IS DISTINCT FROM v_l.valor
           OR v_l_depois.data_pagamento IS DISTINCT FROM v_l.data_pagamento
           OR v_l_depois.conta_bancaria_id IS DISTINCT FROM v_l.conta_bancaria_id
           OR v_l_depois.conta_destino_id IS DISTINCT FROM v_l.conta_destino_id
           OR v_l_depois.plano_conta_id IS DISTINCT FROM v_l.plano_conta_id
           OR v_l_depois.data_competencia IS DISTINCT FROM v_cps_data OR v_l_depois.safra_id IS DISTINCT FROM v_cps_safra THEN
          RAISE EXCEPTION 'Competencia pela saida mudaria valor, pagamento, conta ou hash do lancamento %; abortado', v_l.id
            USING ERRCODE = 'P0001'; END IF;
      END IF;
    END IF;
  END IF;
$r2$;
  v_b := $s2$  -- OC-VINCULO-VALOR (5, Gabriel 30/10): a competencia e a safra do recebimento nao mudam mais no vincular (antes:
  -- FIN-COMPETENCIA-VENDA-01a, a da primeira saida do gado). Os ja' feitos ficam como estao. A guarda acima ja' confere a competencia.
  v_comp_ant := v_l.data_competencia; v_safra_ant := v_l.safra_id;
$s2$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULO-VALOR: ancora R2 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> '76f7471fd778a4cf12bf8f861c693fc5' THEN
    RAISE EXCEPTION 'OC-VINCULO-VALOR: _oc_vincular_recebimento com corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public._oc_vincular_recebimento(%s) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS %L$f$,
                 pg_get_function_arguments('public._oc_vincular_recebimento(uuid,integer,uuid,text,boolean)'::regprocedure), v_novo);
END $mig$;

-- conferencia final: a assinatura antiga sumiu, a nova e' SECURITY DEFINER e a ACL e' a de antes
DO $conf$
DECLARE r record;
BEGIN
  IF to_regprocedure('public.oc_vincular_lancamento(uuid,integer,uuid,text,text,uuid,uuid,boolean,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'OC-VINCULO-VALOR: a assinatura antiga do oc_vincular_lancamento continua'; END IF;
  FOR r IN SELECT p.oid, p.proname, p.prosecdef FROM pg_proc p
            WHERE p.oid IN ('public.oc_vincular_lancamento(uuid,integer,uuid,text,text,uuid,uuid,boolean,boolean,boolean)'::regprocedure,
                            'public._oc_vincular_recebimento(uuid,integer,uuid,text,boolean)'::regprocedure) LOOP
    IF NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE')
       OR (r.proname = 'oc_vincular_lancamento' AND NOT has_function_privilege('authenticated', r.oid, 'EXECUTE'))
       OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'OC-VINCULO-VALOR: % fora do esperado (secdef/ACL)', r.proname; END IF;
  END LOOP;
END $conf$;
