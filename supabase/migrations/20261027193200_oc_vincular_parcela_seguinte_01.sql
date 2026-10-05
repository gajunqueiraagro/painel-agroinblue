-- OC-VINCULAR-PARCELA-SEGUINTE-01 — o "criar item" do Vincular entra como a PARCELA SEGUINTE do grupo (Gabriel, 05/10/2026).
--
-- POR QUE
--   Agnaldo, OC f74f95e5 (Venda 25/08/2026, 55 cab, acordado 294.595,00), venda paga em DUAS vezes (200.000,00 + 94.595,00).
--   O primeiro recebimento foi vinculado ao compromisso (que encolheu para 200.000,00 — outro defeito, registrado como
--   OC-VINCULAR-RECEBIMENTO-PARCIAL-01). O segundo, sem compromisso livre, cai no "criar item": compromisso novo, programacao
--   nova, parcela 1 — e a PARTE era gravada como "1 de 1". Com lote, isso bate no indice
--   `zoo_operacao_partes_identidade_lote` (operacao, lote, natureza, componente, sequencia_parcela) WHERE lote_id IS NOT NULL
--   AND cancelada = false: "duplicate key value violates unique constraint". A SIMULACAO roda o MESMO caminho e estourava do
--   mesmo jeito — por isso o "O que vai acontecer" da tela vinha vazio, com o erro cru.
--
-- ESTADO ANTERIOR (medido em 05/10/2026)
--   oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean)  md5(prosrc) = 7b8662324d4d96c736e260889c1ce9f5
--     SECURITY DEFINER, search_path = public, ACL {postgres, service_role, authenticated} (sem anon, sem PUBLIC)
--
-- O QUE MUDA (so' o corpo desta funcao — o dono do vinculo; nenhuma tabela, nenhum indice, nenhum dado)
--   a) ITEM CRIADO num grupo (operacao, lote, natureza, componente) que ja' tem parte ATIVA: a parte nasce com
--      sequencia_parcela = maior sequencia ativa + 1, e `quantidade_parcelas` fica igual em todas as ativas do grupo
--      (1/2 e 2/2). Parte cancelada nao conta. Sem lote, nada muda (o indice nao existe ali).
--   b) O retorno ganha `parte {sequencia, quantidade, parcela_seguinte, descricao}` (a descricao e' a do item que ja' estava no
--      grupo) e, no principal,
--      `principal {acordado, vinculado, recebido}`; passar do acordado vira o aviso `principal_excede_acordado`
--      (avisa, nao bloqueia). A simulacao e' o mesmo caminho desfeito, entao devolve exatamente isso.
--   c) `unique_violation` dentro da funcao vira frase em portugues (P0001), nunca o erro cru do indice.
--   NAO MUDA: o ramo "compromisso existente com titulo programado" (cancela o titulo e ajusta o compromisso ao valor do
--   recebimento) — divida OC-VINCULAR-RECEBIMENTO-PARCIAL-01; valor, pagamento, conciliacao e competencia de lancamento.
--   Assinatura, retorno (jsonb), SECURITY DEFINER, search_path e ACL: os de antes (CREATE OR REPLACE preserva a ACL).
--
-- PATCH GUARDADO POR md5 (origem, 6 ancoras exatamente 1x, destino) — a regra do CLAUDE.md para corpo grande.
--   md5 de destino: 0fd703b66307ad1bebfbc7dab53c668f

DO $patch$
DECLARE
  v_src text; v_novo text; v_a text; v_b text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = 'public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean)'::regprocedure;
  IF md5(v_src) <> '7b8662324d4d96c736e260889c1ce9f5' THEN
    RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- ancora 1
  v_a := $a1$  v_ret jsonb;
BEGIN
$a1$;
  v_b := $b1$  v_ret jsonb;
  -- OC-VINCULAR-PARCELA-SEGUINTE-01
  v_seq_parte int; v_qtd_parte int; v_seq_grupo int; v_n_grupo int; v_parcela_seguinte boolean := false;
  v_vinculado numeric; v_recebido numeric; v_restricao text; v_desc_grupo text;
BEGIN
$b1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: ancora 1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 2
  v_a := $a2$  SELECT count(*) INTO v_qtd FROM public.zoo_operacao_parcelas_programacao pp WHERE pp.programacao_id = v_prog_id;
  INSERT INTO public.zoo_operacao_partes (
$a2$;
  v_b := $b2$  SELECT count(*) INTO v_qtd FROM public.zoo_operacao_parcelas_programacao pp WHERE pp.programacao_id = v_prog_id;
  v_seq_parte := v_parc.sequencia; v_qtd_parte := v_qtd;
  -- OC-VINCULAR-PARCELA-SEGUINTE-01: o ITEM CRIADO num grupo (operacao, lote, natureza, componente) que JA' TEM parte ativa
  -- entra como a PARCELA SEGUINTE do grupo — a maior sequencia ATIVA + 1 —, e a quantidade fica coerente em todas as ativas
  -- (1/2 e 2/2). O compromisso novo abre programacao nova, cuja parcela e' sempre a 1: gravar a parte como "1 de 1" batia
  -- no indice `zoo_operacao_partes_identidade_lote` (o segundo recebimento de uma venda paga em duas vezes).
  -- ⚠ SO' AS ATIVAS CONTAM: parte cancelada nao ocupa sequencia (o indice e' parcial em `cancelada = false`).
  -- ⚠ SO' COM LOTE: sem lote o indice nao existe e o mesmo componente se repete livremente (tres guias de Fundersul).
  -- ⚠ NAO TOCA valor, pagamento, conciliacao nem competencia de lancamento nenhum: so' `quantidade_parcelas` das partes do grupo.
  IF v_comp_acao = 'criado' AND v_comp.lote_id IS NOT NULL THEN
    SELECT coalesce(max(pt.sequencia_parcela), 0), count(*) INTO v_seq_grupo, v_n_grupo
      FROM public.zoo_operacao_partes pt
     WHERE pt.operacao_id = p_operacao_id AND pt.lote_id = v_comp.lote_id AND pt.natureza = v_natureza
       AND pt.componente = v_componente AND pt.cancelada = false;
    IF v_n_grupo > 0 THEN
      v_parcela_seguinte := true;
      -- o nome do grupo e' o da PRIMEIRA parcela ativa (o item que ja' estava na OC), para a tela dizer "parcela 2 de 2 da X"
      SELECT pt.descricao INTO v_desc_grupo FROM public.zoo_operacao_partes pt
       WHERE pt.operacao_id = p_operacao_id AND pt.lote_id = v_comp.lote_id AND pt.natureza = v_natureza
         AND pt.componente = v_componente AND pt.cancelada = false
       ORDER BY pt.sequencia_parcela, pt.created_at LIMIT 1;
      v_seq_parte := v_seq_grupo + 1;
      v_qtd_parte := v_seq_grupo + 1;
      UPDATE public.zoo_operacao_partes pt
         SET quantidade_parcelas = v_qtd_parte, updated_at = now()
       WHERE pt.operacao_id = p_operacao_id AND pt.lote_id = v_comp.lote_id AND pt.natureza = v_natureza
         AND pt.componente = v_componente AND pt.cancelada = false AND pt.quantidade_parcelas <> v_qtd_parte;
    END IF;
  END IF;
  INSERT INTO public.zoo_operacao_partes (
$b2$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: ancora 2 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 3
  v_a := $a3$    v_cli, p_operacao_id, 'programacao', v_natureza, v_componente, v_parc.sequencia, v_qtd,
$a3$;
  v_b := $b3$    v_cli, p_operacao_id, 'programacao', v_natureza, v_componente, v_seq_parte, v_qtd_parte,
$b3$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: ancora 3 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 4
  v_a := $a4$        'base', v_base, 'soma_principal', round(v_soma_principal, 2)));
    END IF;
  END IF;
$a4$;
  v_b := $b4$        'base', v_base, 'soma_principal', round(v_soma_principal, 2)));
    END IF;
    -- OC-VINCULAR-PARCELA-SEGUINTE-01: o que a OC passa a ter LIGADO ao principal (titulos vivos das partes ativas) e quanto
    -- disso ja' e' dinheiro recebido — contado DEPOIS das escritas, para a tela dizer "R$ X recebidos de R$ Y acordados".
    -- Passar do acordado AVISA; nao bloqueia nem ajusta nada (quem decide e' o operador).
    SELECT coalesce(sum(pt.valor), 0), coalesce(sum(pt.valor) FILTER (WHERE f.status_transacao = 'realizado'), 0)
      INTO v_vinculado, v_recebido
      FROM public.zoo_operacao_partes pt
      JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
     WHERE pt.operacao_id = p_operacao_id AND pt.natureza = 'principal' AND pt.origem = 'programacao' AND pt.cancelada = false;
    IF v_base IS NOT NULL AND round(v_vinculado, 2) - round(v_base, 2) > 0.01 THEN
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'principal_excede_acordado',
        'acordado', round(v_base, 2), 'vinculado', round(v_vinculado, 2), 'excedente', round(v_vinculado - v_base, 2)));
    END IF;
  END IF;
$b4$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: ancora 4 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 5
  v_a := $a5$    'avisos', v_avisos);

  -- ⚠ SIMULACAO = O MESMO CAMINHO, DESFEITO.$a5$;
  v_b := $b5$    -- OC-VINCULAR-PARCELA-SEGUINTE-01: a parte como ficou (a simulacao diz "parcela 2 de 2") e o principal depois do vinculo
    'parte', jsonb_build_object('sequencia', v_seq_parte, 'quantidade', v_qtd_parte, 'parcela_seguinte', v_parcela_seguinte,
                 'descricao', coalesce(v_desc_grupo, v_comp.descricao, v_l.descricao)),
    'principal', CASE WHEN v_natureza = 'principal' THEN jsonb_build_object(
                 'acordado', round(v_base, 2), 'vinculado', round(v_vinculado, 2), 'recebido', round(v_recebido, 2)) END,
    'avisos', v_avisos);

  -- ⚠ SIMULACAO = O MESMO CAMINHO, DESFEITO.$b5$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: ancora 5 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 6
  v_a := $a6$EXCEPTION WHEN SQLSTATE 'OCSIM' THEN
  RETURN v_ret;
END;
$a6$;
  v_b := $b6$EXCEPTION
  WHEN SQLSTATE 'OCSIM' THEN
    RETURN v_ret;
  -- OC-VINCULAR-PARCELA-SEGUINTE-01: violacao de unicidade nunca chega crua a' tela (nem na simulacao): a frase diz o que colidiu.
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_restricao = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_restricao
        WHEN 'zoo_operacao_partes_identidade_lote' THEN
          'A operação já tem um item ativo com o mesmo lote, componente e número de parcela. Nada foi gravado.'
        WHEN 'zoo_operacao_partes_titulo_uniq' THEN
          'Este lançamento já está ligado a uma operação. Nada foi gravado.'
        WHEN 'zoo_operacao_partes_parcela_prog_ativa_uniq' THEN
          'A parcela escolhida já tem um título ativo na operação. Nada foi gravado.'
        ELSE 'O vínculo colide com um registro que já existe na operação (' || coalesce(v_restricao, 'unicidade') || '). Nada foi gravado.'
      END USING ERRCODE = 'P0001';
END;
$b6$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: ancora 6 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> '0fd703b66307ad1bebfbc7dab53c668f' THEN
    RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.oc_vincular_lancamento(p_operacao_id uuid, p_versao_esperada integer, p_lancamento_id uuid, p_componente text, p_motivo text, p_compromisso_id uuid DEFAULT NULL::uuid, p_parcela_id uuid DEFAULT NULL::uuid, p_criar_novo boolean DEFAULT false, p_simular boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS %L$f$, v_novo);
END
$patch$;

-- ── conferencia ───────────────────────────────────────────────────────────────────────────────────────────────────────
DO $confere$
DECLARE
  f regprocedure := 'public.oc_vincular_lancamento(uuid, integer, uuid, text, text, uuid, uuid, boolean, boolean)'::regprocedure;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = f) <> '0fd703b66307ad1bebfbc7dab53c668f' THEN RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: md5 do corpo gravado difere'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = f) THEN RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: a funcao nao e SECURITY DEFINER'; END IF;
  IF has_function_privilege('anon', f, 'EXECUTE') THEN RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: anon executa a funcao'; END IF;
  IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'OC-VINCULAR-PARCELA-SEGUINTE-01: authenticated perdeu o EXECUTE'; END IF;
END
$confere$;
