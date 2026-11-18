-- CONC-DESCONCILIAR-EDSON-01 (Gabriel 18/11 08:18, "tudo como recomendado") — o casar com o banco pelas REGRAS R1–R3 (FILA 18/11 06:52).
-- Caso: NJ · Edson/Mecânica Líder, 17/11. O "Casar com o banco" reescreveu a NF 404 de 5.250,00 para 386,65 (BUG 1) e o desfazer do
-- Espelho tirou os vínculos e deixou os 5 lançamentos realizados (BUG 2).
--   R1  SEM NF (previsto, recorrência, estimado, boleto, guia): o lançamento assume o valor do banco, como hoje — agora com o ANTES guardado.
--   R2  COM NF (`_fn_lancamento_tem_nf`): o valor da NF NUNCA é reescrito. Diferença acima de R$ 1,00 (D3-a: até R$ 1,00 é arredondamento):
--         banco a MAIS  → "juros": a NF casa inteira + nasce "Juros/multa da NF nº X" (conta "Juros/multa por atraso"), no MESMO extrato;
--         banco a MENOS → "desconto" (motivo obrigatório): nasce "Desconto obtido da NF nº X" sem caixa (conta "Desconto obtido") e a NF
--                         fica quitada (pago + desconto = NF; o núcleo da baixa conta o desconto);
--                       → "parcial" (D2-b i): o núcleo de sempre divide (as 2 partes com o nº da NF; o desfazer junta).
--         sem dizer o que é a diferença, o casar NÃO grava (motivo 'nf_diferenca', a pergunta pronta em `pergunta_nf`).
--   R3  desconciliar = o estado anterior EXATO: todo casar guarda o ANTES do lançamento (valor, status, data de pagamento, plano, contas,
--       conciliado_em) em `financeiro_baixas_no_vinculo` tipo 'casar' — pelo Espelho, pelo 1:1, pelo grupo e pelo gatilho do vínculo —
--       e todo desfazer (grupo, 1:1, cancelamento) o devolve quando o lançamento fica sem vínculo vivo, cancelando as linhas que o casar
--       criou (juros, desconto). D4-a (i): o campo editado DEPOIS do casar fica com a edição (o motivo do desfazer diz qual).
--   O motor de blocos (fn_conciliar_bloco / fn_desfazer_bloco) já guarda e devolve o dele (conciliacao_blocos.estado_anterior) e nunca
--   muda valor: fica como está (o guardar pula quando `app.conciliar_bloco` = on).
-- D2-a: as 2 contas nascem no plano GLOBAL (cliente_id nulo), ao lado de "Despesas Financeiras Administrativo" e "Rendimentos Financeiros".
-- As funções que já existem mudam por patch guardado por md5 do corpo de hoje (âncora que não casa 1 vez = nada gravado).

-- (0) a trilha das baixas aceita os tipos novos
ALTER TABLE public.financeiro_baixas_no_vinculo DROP CONSTRAINT financeiro_baixas_no_vinculo_tipo_check;
ALTER TABLE public.financeiro_baixas_no_vinculo ADD CONSTRAINT financeiro_baixas_no_vinculo_tipo_check
  CHECK (tipo = ANY (ARRAY['divisao'::text, 'juncao'::text, 'baixa'::text, 'valor_real'::text, 'casar'::text, 'juros'::text, 'desconto'::text]));

-- (1) D2-a: as 2 contas do plano padrão
INSERT INTO public.financeiro_plano_contas (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, grupo_fluxo,
    escopo_negocio, ativo, ordem_exibicao, compoe_dre, bloco_dre)
SELECT NULL, v.tipo, v.macro, v.grupo, v.centro, v.sub, v.fluxo, 'administrativo', true, v.ordem, true, v.bloco
  FROM (VALUES ('2-Saídas', 'Custeio Produção', 'Custo Fixo Administrativo', 'Financeiro', 'Juros/multa por atraso', 'Custeio', 21091, 'fixo'),
               ('1-Entradas', 'Receita Operacional', 'Outras Receitas', 'Financeiro', 'Desconto obtido', 'Receitas operacionais', 3011, NULL))
       AS v(tipo, macro, grupo, centro, sub, fluxo, ordem, bloco)
 WHERE NOT EXISTS (SELECT 1 FROM public.financeiro_plano_contas p WHERE p.cliente_id IS NULL AND p.subcentro = v.sub);

-- (2) "tem NF": UMA regra, no banco (a tela só lê)
CREATE OR REPLACE FUNCTION public._fn_lancamento_tem_nf(p_lancamento_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- R2: documento vivo de nota (nf, nf_principal, nf_complementar, nf_produtor, ou com chave de acesso) OU tipo de documento "Nota Fiscal"
  -- fora de recorrência. D3-b (Gabriel 18/11): guia (FGTS, DARF, e-Social, GPS, DAE, GARE) é "sem NF", mesmo marcada como Nota Fiscal.
  -- R1: recorrência sem documento de nota é "sem NF" (o valor do mês é o do banco).
  SELECT CASE
           WHEN l.id IS NULL THEN false
           WHEN coalesce(public._fn_normalizar_texto(l.descricao), '') ~ '(^|[^a-z0-9])(fgts|darf|e[ -]?social|gps|dae|gare|guia)([^a-z0-9]|$)' THEN false
           WHEN EXISTS (SELECT 1 FROM public.vw_lancamento_documentos d
                         WHERE d.lancamento_id = l.id AND d.cancelado IS NOT TRUE
                           AND (d.especie IN ('nf', 'nf_principal', 'nf_complementar', 'nf_produtor') OR d.chave_acesso IS NOT NULL)) THEN true
           WHEN l.tipo_documento = 'Nota Fiscal' AND l.recorrencia_id IS NULL THEN true
           ELSE false
         END
    FROM (SELECT p_lancamento_id AS id) k
    LEFT JOIN public.financeiro_lancamentos_v2 l ON l.id = k.id
$function$;

-- (3) o estado do lançamento que o desfazer devolve (o mesmo para o ANTES e o DEPOIS)
CREATE OR REPLACE FUNCTION public._fn_conc_estado_do_lancamento(p_lancamento_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT jsonb_build_object('valor', l.valor, 'status_transacao', l.status_transacao, 'data_pagamento', l.data_pagamento,
                            'plano_conta_id', l.plano_conta_id, 'conta_bancaria_id', l.conta_bancaria_id, 'conta_destino_id', l.conta_destino_id,
                            'conciliado_em', l.conciliado_em, 'valor_do_mes_em', l.valor_do_mes_em, 'valor_do_mes_origem', l.valor_do_mes_origem)
    FROM public.financeiro_lancamentos_v2 l WHERE l.id = p_lancamento_id
$function$;

-- (4) R3: guarda o ANTES do casar (uma vez por casamento: o 1º vínculo vivo; os seguintes não sobrescrevem)
CREATE OR REPLACE FUNCTION public._fn_conc_guardar_antes(p_lancamento_id uuid, p_extrato_id uuid, p_origem text DEFAULT 'conserto')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE l public.financeiro_lancamentos_v2;
BEGIN
  -- o motor de blocos guarda o dele (conciliacao_blocos.estado_anterior) e o devolve pelo fn_desfazer_bloco
  IF coalesce(current_setting('app.conciliar_bloco', true), 'off') = 'on' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_baixas_no_vinculo b
              WHERE b.lancamento_id = p_lancamento_id AND b.tipo = 'casar' AND b.desfeita_em IS NULL) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL) THEN RETURN; END IF;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  -- a linha que o próprio casar criou (juros, desconto) sai com o desfazer da NF: não tem antes
  IF NOT FOUND OR l.cancelado IS TRUE OR coalesce(l.origem_tipo, '') IN ('conc:juros', 'conc:desconto') THEN RETURN; END IF;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, valor_original, antes, depois, origem, motivo, feita_por)
  VALUES (l.cliente_id, 'casar', l.id, l.valor, public._fn_conc_estado_do_lancamento(l.id) || jsonb_build_object('extrato_id', p_extrato_id),
          '{}'::jsonb, CASE WHEN p_origem = 'gatilho' THEN 'gatilho' ELSE 'conserto' END, 'antes do casar', auth.uid());
END;
$function$;

-- (5) R2: a linha da diferença da NF (juros/multa a mais; desconto obtido a menos, sem caixa), presa à NF pela trilha das baixas
CREATE OR REPLACE FUNCTION public._fn_conc_linha_da_nf(p_nf uuid, p_tipo text, p_valor numeric, p_data date, p_extrato_id uuid, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE l public.financeiro_lancamentos_v2; v_plano uuid; v_novo uuid; v_uid uuid := auth.uid(); v_nro text; v_conta uuid;
  v_desc boolean := p_tipo = 'desconto'; v_valor numeric := round(abs(coalesce(p_valor, 0)), 2);
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), CASE WHEN p_tipo = 'desconto' THEN 'desconto' ELSE 'juros/multa' END);
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('juros', 'desconto') OR v_valor <= 0 THEN
    RAISE EXCEPTION 'Linha da NF: tipo ou valor inválido (% / %). Nada foi gravado.', coalesce(p_tipo, '-'), coalesce(p_valor::text, '-') USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_nf;
  IF NOT FOUND OR l.cancelado IS TRUE OR l.tipo_operacao NOT LIKE '2-%' THEN
    RAISE EXCEPTION 'A linha de juros/desconto só nasce de uma nota de saída viva. Nada foi gravado.' USING ERRCODE = 'P0001', DETAIL = p_nf::text;
  END IF;
  SELECT pc.id INTO v_plano FROM public.financeiro_plano_contas pc
   WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.subcentro = CASE WHEN v_desc THEN 'Desconto obtido' ELSE 'Juros/multa por atraso' END;
  IF v_plano IS NULL THEN
    RAISE EXCEPTION 'A conta "%" não está no plano de contas. Nada foi gravado.', CASE WHEN v_desc THEN 'Desconto obtido' ELSE 'Juros/multa por atraso' END
      USING ERRCODE = 'P0001';
  END IF;
  -- o nº da NF: o do lançamento; sem ele, o da nota anexada
  v_nro := coalesce(nullif(btrim(l.numero_documento), ''),
                    (SELECT nullif(btrim(d.numero), '') FROM public.vw_lancamento_documentos d
                      WHERE d.lancamento_id = l.id AND d.cancelado IS NOT TRUE AND d.especie LIKE 'nf%' AND nullif(btrim(d.numero), '') IS NOT NULL
                      ORDER BY d.uploaded_em NULLS LAST LIMIT 1),
                    's/nº');
  v_conta := coalesce(l.conta_bancaria_id, (SELECT e.conta_bancaria_id FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id));
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, ano_mes, valor, tipo_operacao, sinal, descricao, status_transacao,
      data_pagamento, conta_bancaria_id, conta_destino_id, data_competencia, data_vencimento, plano_conta_id, favorecido_id, cenario,
      origem_lancamento, origem_tipo, numero_documento, sem_movimentacao_caixa, forma_pagamento, observacao, created_by, updated_by)
  VALUES (l.cliente_id, l.fazenda_id, to_char(p_data, 'YYYY-MM'), v_valor,
          CASE WHEN v_desc THEN '1-Entradas' ELSE l.tipo_operacao END, CASE WHEN v_desc THEN '1' ELSE '-1' END,
          format('%s da NF nº %s', CASE WHEN v_desc THEN 'Desconto obtido' ELSE 'Juros/multa' END, v_nro), 'realizado',
          p_data, CASE WHEN v_desc THEN NULL ELSE v_conta END, CASE WHEN v_desc THEN v_conta ELSE NULL END, p_data, p_data, v_plano,
          l.favorecido_id, coalesce(l.cenario, 'realizado'), 'conciliacao', 'conc:' || p_tipo, l.numero_documento, v_desc,
          CASE WHEN v_desc THEN NULL ELSE l.forma_pagamento END,
          format('%s de %s da NF nº %s (lançamento %s), no casar com o extrato de %s. Motivo: %s',
                 CASE WHEN v_desc THEN 'Desconto obtido' ELSE 'Juros/multa' END, public._fn_oc_brl(v_valor), v_nro, l.id,
                 public._fn_oc_data(p_data), v_motivo),
          v_uid, v_uid)
  RETURNING id INTO v_novo;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, irmao_id, valor_original, valor_aplicado, antes, depois,
      origem, motivo, feita_por)
  VALUES (l.cliente_id, p_tipo, l.id, v_novo, l.valor, v_valor, '{}'::jsonb,
          jsonb_build_object('linha_id', v_novo, 'extrato_id', p_extrato_id, 'data', p_data), 'conserto', v_motivo, v_uid);
  RETURN v_novo;
END;
$function$;

-- (6) R3: o gatilho que guarda o ANTES em TODO vínculo novo (o 1:1 e o grupo de outras telas, o "Ligar com o valor real")
CREATE OR REPLACE FUNCTION public._fn_trg_conc_guardar_antes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  PERFORM public._fn_conc_guardar_antes(NEW.lancamento_id, NEW.extrato_id, 'gatilho');
  RETURN NEW;
END;
$function$;

-- (7) R3: o gatilho que DEVOLVE o antes quando o lançamento fica sem vínculo vivo (depois do "juntar" da divisão)
CREATE OR REPLACE FUNCTION public._fn_trg_conc_voltar_ao_desfazer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE b public.financeiro_baixas_no_vinculo; x public.financeiro_baixas_no_vinculo; l public.financeiro_lancamentos_v2;
  v_uid uuid := auth.uid(); v_agora jsonb; v_set jsonb := '{}'::jsonb; v_mantidos text[] := '{}'; f text; v_a text; v_b text; v_igual boolean;
  v_motivo text := coalesce(nullif(btrim(NEW.desfeito_motivo), ''), 'vínculo desfeito');
BEGIN
  IF EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = NEW.lancamento_id AND c.desfeito_em IS NULL) THEN
    RETURN NULL;
  END IF;
  -- (a) as linhas que o casar CRIOU para a NF saem (canceladas com o motivo; a casa não apaga)
  FOR x IN SELECT * FROM public.financeiro_baixas_no_vinculo
            WHERE lancamento_id = NEW.lancamento_id AND tipo IN ('juros', 'desconto') AND desfeita_em IS NULL FOR UPDATE LOOP
    PERFORM set_config('app.conc_dividindo', 'on', true);
    UPDATE public.financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
           cancelado_motivo = format('%s da NF desfeito junto com o casar (%s).', CASE WHEN x.tipo = 'juros' THEN 'Juros/multa' ELSE 'Desconto obtido' END, v_motivo),
           updated_at = now(), updated_by = coalesce(v_uid, updated_by)
     WHERE id = x.irmao_id AND cancelado IS NOT TRUE;
    PERFORM set_config('app.conc_dividindo', 'off', true);
    UPDATE public.financeiro_baixas_no_vinculo SET desfeita_em = now(), desfeita_por = v_uid, desfeita_motivo = v_motivo WHERE id = x.id;
  END LOOP;
  -- (b) o ANTES do casar volta. D4-a (i): o campo que não está mais com o valor que o casar pôs (editado depois) fica com a edição.
  SELECT * INTO b FROM public.financeiro_baixas_no_vinculo
   WHERE lancamento_id = NEW.lancamento_id AND tipo = 'casar' AND desfeita_em IS NULL ORDER BY feita_em DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id FOR UPDATE;
  IF l.cancelado IS NOT TRUE THEN
    v_agora := public._fn_conc_estado_do_lancamento(l.id);
    FOREACH f IN ARRAY ARRAY['valor', 'status_transacao', 'data_pagamento', 'plano_conta_id', 'conta_bancaria_id', 'conta_destino_id', 'conciliado_em'] LOOP
      v_a := v_agora->>f; v_b := b.antes->>f;
      v_igual := CASE f WHEN 'valor' THEN v_a::numeric IS NOT DISTINCT FROM v_b::numeric
                        WHEN 'conciliado_em' THEN v_a::timestamptz IS NOT DISTINCT FROM v_b::timestamptz
                        ELSE v_a IS NOT DISTINCT FROM v_b END;
      CONTINUE WHEN v_igual;
      v_b := b.depois->>f;
      IF b.depois = '{}'::jsonb
         OR (CASE f WHEN 'valor' THEN v_a::numeric IS NOT DISTINCT FROM v_b::numeric
                    WHEN 'conciliado_em' THEN v_a::timestamptz IS NOT DISTINCT FROM v_b::timestamptz
                    ELSE v_a IS NOT DISTINCT FROM v_b END) THEN
        v_set := v_set || jsonb_build_object(f, b.antes->f);
      ELSE
        v_mantidos := v_mantidos || f;
      END IF;
    END LOOP;
    -- só realizado tem data de pagamento: o status que volta para aberto leva a data de antes junto
    IF v_set ? 'status_transacao' AND v_set->>'status_transacao' NOT IN ('realizado', 'conciliado') THEN
      v_set := v_set || jsonb_build_object('data_pagamento', b.antes->'data_pagamento');
      v_mantidos := array_remove(v_mantidos, 'data_pagamento');
    END IF;
    IF v_set <> '{}'::jsonb THEN
      PERFORM set_config('app.conc_dividindo', 'on', true);
      UPDATE public.financeiro_lancamentos_v2 t
         SET valor             = CASE WHEN v_set ? 'valor' THEN (v_set->>'valor')::numeric ELSE t.valor END,
             status_transacao  = CASE WHEN v_set ? 'status_transacao' THEN v_set->>'status_transacao' ELSE t.status_transacao END,
             data_pagamento    = CASE WHEN v_set ? 'data_pagamento' THEN (v_set->>'data_pagamento')::date ELSE t.data_pagamento END,
             plano_conta_id    = CASE WHEN v_set ? 'plano_conta_id' THEN (v_set->>'plano_conta_id')::uuid ELSE t.plano_conta_id END,
             conta_bancaria_id = CASE WHEN v_set ? 'conta_bancaria_id' THEN (v_set->>'conta_bancaria_id')::uuid ELSE t.conta_bancaria_id END,
             conta_destino_id  = CASE WHEN v_set ? 'conta_destino_id' THEN (v_set->>'conta_destino_id')::uuid ELSE t.conta_destino_id END,
             conciliado_em     = CASE WHEN v_set ? 'conciliado_em' THEN (v_set->>'conciliado_em')::timestamptz ELSE t.conciliado_em END,
             valor_do_mes_em     = CASE WHEN v_set ? 'valor' THEN (b.antes->>'valor_do_mes_em')::timestamptz ELSE t.valor_do_mes_em END,
             valor_do_mes_origem = CASE WHEN v_set ? 'valor' THEN b.antes->>'valor_do_mes_origem' ELSE t.valor_do_mes_origem END,
             updated_at = now(), updated_by = coalesce(v_uid, t.updated_by)
       WHERE t.id = l.id;
      PERFORM set_config('app.conc_dividindo', 'off', true);
    END IF;
  END IF;
  UPDATE public.financeiro_baixas_no_vinculo
     SET desfeita_em = now(), desfeita_por = v_uid,
         desfeita_motivo = v_motivo || CASE WHEN cardinality(v_mantidos) > 0
                                            THEN ' · ficou como foi editado depois do casar: ' || array_to_string(v_mantidos, ', ') ELSE '' END
   WHERE id = b.id;
  RETURN NULL;
END;
$function$;

-- ninguém de fora chama as internas (FUNCAO NOVA NASCE FECHADA)
REVOKE ALL ON FUNCTION public._fn_lancamento_tem_nf(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_conc_estado_do_lancamento(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_conc_guardar_antes(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_conc_linha_da_nf(uuid, text, numeric, date, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_trg_conc_guardar_antes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_trg_conc_voltar_ao_desfazer() FROM PUBLIC, anon, authenticated;

-- (8) os gatilhos (curtos; `trg_0_` roda antes dos outros BEFORE; `trg_zzzz_` depois do `trg_zzz_conc_juntar_ao_desfazer`)
SET LOCAL lock_timeout = '2s';
CREATE TRIGGER trg_0_conc_guardar_antes BEFORE INSERT ON public.conciliacao_bancaria_itens
  FOR EACH ROW WHEN (NEW.desfeito_em IS NULL) EXECUTE FUNCTION public._fn_trg_conc_guardar_antes();
CREATE TRIGGER trg_zzzz_conc_voltar_ao_desfazer AFTER UPDATE OF desfeito_em ON public.conciliacao_bancaria_itens
  FOR EACH ROW WHEN ((OLD.desfeito_em IS NULL) AND (NEW.desfeito_em IS NOT NULL)) EXECUTE FUNCTION public._fn_trg_conc_voltar_ao_desfazer();

-- (9) as funções de hoje, por patch guardado por md5 do corpo
CREATE FUNCTION pg_temp.m115540_troca(p_def text, p_de text, p_para text, p_nome text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int := (length(p_def) - length(replace(p_def, p_de, ''))) / greatest(length(p_de), 1);
BEGIN
  IF n <> 1 THEN RAISE EXCEPTION 'm115540: a âncora % casa % vez(es) (esperado 1). Nada gravado.', p_nome, n; END IF;
  RETURN replace(p_def, p_de, p_para);
END $f$;
CREATE FUNCTION pg_temp.m115540_corpo(p_fn text, p_md5 text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE d text := pg_get_functiondef(p_fn::regprocedure);
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION 'm115540: % mudou (md5 % <> %). Nada gravado.', p_fn, md5(d), p_md5; END IF;
  RETURN d;
END $f$;

DO $m$
DECLARE d text;
BEGIN
  -- 9.1 fn_espelho_casar ("Casar com o banco"): R2 + o ANTES + as linhas da NF
  d := pg_temp.m115540_corpo('public.fn_espelho_casar(uuid,jsonb,boolean,text)', '5ce9bd94d4b4001ea7a17671770b83ea');
  d := pg_temp.m115540_troca(d, $a$v_trocas jsonb := '[]'::jsonb; v_conta_atual uuid; v_troca jsonb;$a$,
$a$v_trocas jsonb := '[]'::jsonb; v_conta_atual uuid; v_troca jsonb;
  -- CONC-DESCONCILIAR-EDSON-01 (R2): as linhas da NF (juros/desconto), as NFs que nao mudam de valor, a pergunta da diferenca
  v_nf_extras jsonb := '[]'::jsonb; v_manter uuid[] := '{}'; v_perg_nf jsonb; v_dest text; v_dif numeric; v_x jsonb; v_novo uuid;$a$, 'E1 declare');
  d := pg_temp.m115540_troca(d, $a$-- CONC-VALOR-CERTO-ACEITA-01: o item MAIOR que o lancamento de valor certo$a$,
$a$-- CONC-DESCONCILIAR-EDSON-01 (R2): nota de SAIDA com NF nunca muda de valor. Diferenca acima de R$ 1,00 (D3-a) so' casa com o destino:
    -- a mais = 'juros' (a NF casa inteira + linha de juros/multa no mesmo extrato); a menos = 'desconto' (com motivo) ou 'parcial' (divide).
    v_dest := NULL; v_dif := 0;
    IF v_lan.tipo_operacao LIKE '2-%' AND abs(v_val - abs(v_lan.valor)) > 1.005
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = v_lid AND pt.cancelada IS NOT TRUE)
       AND public._fn_lancamento_tem_nf(v_lid) THEN
      v_dest := nullif(btrim(coalesce(v_item->>'destino', '')), '');
      IF v_val > abs(v_lan.valor) AND v_dest = 'juros' THEN
        v_dif := round(v_val - abs(v_lan.valor), 2); v_val := round(abs(v_lan.valor), 2);
      ELSIF v_val < abs(v_lan.valor) AND v_dest = 'desconto' AND nullif(btrim(coalesce(v_item->>'motivo_desconto', '')), '') IS NOT NULL THEN
        v_manter := v_manter || v_lid;
        v_nf_extras := v_nf_extras || jsonb_build_array(jsonb_build_object('nf', v_lid, 'tipo', 'desconto',
          'valor', round(abs(v_lan.valor) - v_val, 2), 'motivo', btrim(v_item->>'motivo_desconto')));
      ELSIF v_val < abs(v_lan.valor) AND v_dest = 'parcial' THEN
        IF v_lan.financiamento_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.financiamento_parcelas fp WHERE v_lid IN (fp.lancamento_id, fp.lancamento_juros_id)) THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'parcial_parcela', 'lancamento_id', v_lid,
            'frase', 'Parcela de compra parcelada não aceita pagamento parcial no casar: diga se a diferença é desconto, ou ajuste a parcela.');
        END IF;
        v_manter := v_manter || v_lid;
      ELSE
        IF v_perg_nf IS NULL THEN
          v_perg_nf := jsonb_build_object('lancamento_id', v_lid, 'numero_documento', v_lan.numero_documento,
            'valor_nf', round(abs(v_lan.valor), 2), 'valor_extrato', round(v_val, 2), 'diferenca', round(v_val - abs(v_lan.valor), 2),
            'sentido', CASE WHEN v_val > abs(v_lan.valor) THEN 'a_mais' ELSE 'a_menos' END,
            'opcoes', CASE WHEN v_val > abs(v_lan.valor) THEN '["juros"]'::jsonb ELSE '["desconto","parcial"]'::jsonb END,
            'frase', CASE WHEN v_dest = 'desconto' AND v_val < abs(v_lan.valor)
                          THEN format('Para dar desconto de %s na NF nº %s, escreva o motivo.', public._fn_oc_brl(abs(v_lan.valor) - v_val),
                                      coalesce(nullif(btrim(v_lan.numero_documento), ''), 's/nº'))
                          ELSE format('A NF nº %s vale %s e o banco pagou %s: o valor da NF não muda. Diga o que é a diferença de %s: %s.',
                                      coalesce(nullif(btrim(v_lan.numero_documento), ''), 's/nº'), public._fn_oc_brl(abs(v_lan.valor)),
                                      public._fn_oc_brl(v_val), public._fn_oc_brl(abs(v_val - abs(v_lan.valor))),
                                      CASE WHEN v_val > abs(v_lan.valor) THEN 'juros/multa' ELSE 'desconto (com o motivo) ou pagamento parcial' END) END);
        END IF;
        v_dest := NULL;
      END IF;
    END IF;
    -- CONC-VALOR-CERTO-ACEITA-01: o item MAIOR que o lancamento de valor certo$a$, 'E2 regra R2');
  d := pg_temp.m115540_troca(d, $a$v_ids := v_ids || v_lid; v_vals := v_vals || v_val; v_soma := v_soma + v_dir * v_val; v_n := v_n + 1;$a$,
$a$v_ids := v_ids || v_lid; v_vals := v_vals || v_val; v_soma := v_soma + v_dir * v_val; v_n := v_n + 1;
    IF v_dest = 'juros' AND v_dif > 0 THEN
      v_soma := v_soma + v_dir * v_dif;
      v_nf_extras := v_nf_extras || jsonb_build_array(jsonb_build_object('nf', v_lid, 'tipo', 'juros', 'valor', v_dif));
    END IF;$a$, 'E3 soma dos juros');
  d := pg_temp.m115540_troca(d, $a$|| CASE WHEN v_perg IS NOT NULL THEN jsonb_build_object('pergunta', v_perg) ELSE '{}'::jsonb END;$a$,
$a$|| CASE WHEN v_perg IS NOT NULL THEN jsonb_build_object('pergunta', v_perg) ELSE '{}'::jsonb END
           || CASE WHEN v_perg_nf IS NOT NULL THEN jsonb_build_object('pergunta_nf', v_perg_nf) ELSE '{}'::jsonb END
           || CASE WHEN jsonb_array_length(v_nf_extras) > 0 THEN jsonb_build_object('linhas_da_nf', v_nf_extras) ELSE '{}'::jsonb END;$a$, 'E4 simular');
  d := pg_temp.m115540_troca(d, $a$-- CONC-VALOR-CERTO-ACEITA-01: gravar sem a confirmacao nao grava nada — volta a pergunta$a$,
$a$-- CONC-DESCONCILIAR-EDSON-01 (R2): NF com diferenca sem destino nao grava nada — volta a pergunta da NF
  IF v_perg_nf IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nf_diferenca', 'pergunta_nf', v_perg_nf, 'frase', v_perg_nf->>'frase');
  END IF;
  -- CONC-VALOR-CERTO-ACEITA-01: gravar sem a confirmacao nao grava nada — volta a pergunta$a$, 'E5 recusa da NF');
  d := pg_temp.m115540_troca(d, $a$-- P153b (D3): a troca de conta pedida, na MESMA transacao do casar$a$,
$a$-- CONC-DESCONCILIAR-EDSON-01 (R3): o ANTES de cada lancamento, ANTES de qualquer troca (conta, valor do extrato, valor, status)
  FOR i IN 1..v_n LOOP
    PERFORM public._fn_conc_guardar_antes(v_ids[i], p_extrato_id);
  END LOOP;
  -- P153b (D3): a troca de conta pedida, na MESMA transacao do casar$a$, 'E6 antes');
  d := pg_temp.m115540_troca(d, $a$THEN valor ELSE v_vals[i] END,$a$,
$a$THEN valor WHEN v_ids[i] = ANY(v_manter) THEN valor ELSE v_vals[i] END,$a$, 'E7 NF mantem o valor');
  d := pg_temp.m115540_troca(d, $a$IF v_n = 1 THEN$a$,
$a$-- CONC-DESCONCILIAR-EDSON-01 (R2): as linhas da NF; a de juros entra no MESMO casamento, a de desconto e' sem caixa
  FOR v_x IN SELECT * FROM jsonb_array_elements(v_nf_extras) LOOP
    v_novo := public._fn_conc_linha_da_nf((v_x->>'nf')::uuid, v_x->>'tipo', (v_x->>'valor')::numeric, v_ext.data_movimento, p_extrato_id,
                                          coalesce(v_x->>'motivo', p_motivo));
    IF v_x->>'tipo' = 'juros' THEN
      v_ids := v_ids || v_novo; v_vals := v_vals || (v_x->>'valor')::numeric; v_n := v_n + 1;
    END IF;
  END LOOP;

  IF v_n = 1 THEN$a$, 'E8 linhas da NF');
  d := pg_temp.m115540_troca(d, $a$'ids', to_jsonb(v_ids), 'trocas_conta', v_trocas);$a$,
$a$'ids', to_jsonb(v_ids), 'trocas_conta', v_trocas, 'linhas_da_nf', v_nf_extras);$a$, 'E9 retorno');
  EXECUTE d;

  -- 9.2 o nucleo da baixa: o desconto obtido da NF conta como quitado (pago + desconto = NF; nao divide)
  d := pg_temp.m115540_corpo('public._fn_conc_baixa_no_vinculo(uuid,text,text)', 'a767e8a2f41d6eca3f2653c5d3e785ae');
  d := pg_temp.m115540_troca(d, $a$v_total := abs(l.valor);$a$,
$a$v_total := abs(l.valor);
  -- CONC-DESCONCILIAR-EDSON-01 (R2): o desconto obtido da NF (linha sem caixa) quita a parte que o banco nao pagou
  v_ap := v_ap + coalesce((SELECT sum(abs(b.valor_aplicado)) FROM public.financeiro_baixas_no_vinculo b
                            WHERE b.lancamento_id = l.id AND b.tipo = 'desconto' AND b.desfeita_em IS NULL), 0);$a$, 'N1 desconto quita');
  EXECUTE d;

  -- 9.3 o gatilho do fim da transacao: guarda o DEPOIS do casar (para o desfazer saber o que foi editado depois)
  d := pg_temp.m115540_corpo('public._fn_trg_conc_baixa_no_vinculo()', '9333068895de106ebf388a3a303801a9');
  d := pg_temp.m115540_troca(d, $a$-- TRAVA: vinculo vivo exige baixa$a$,
$a$-- CONC-DESCONCILIAR-EDSON-01 (R3): o DEPOIS do casar (uma vez), para o desfazer manter o que for editado depois (D4-a i)
  UPDATE public.financeiro_baixas_no_vinculo b SET depois = public._fn_conc_estado_do_lancamento(NEW.lancamento_id)
   WHERE b.lancamento_id = NEW.lancamento_id AND b.tipo = 'casar' AND b.desfeita_em IS NULL AND b.depois = '{}'::jsonb;
  -- TRAVA: vinculo vivo exige baixa$a$, 'G1 depois');
  EXECUTE d;

  -- 9.4 o 1:1 e o grupo: o ANTES antes de trocarem a conta do lancamento (o gatilho cobre o resto)
  d := pg_temp.m115540_corpo('public.fn_vincular_extrato_lancamento(uuid,uuid,numeric,boolean)', '2d68b4d6178da8f7c46dbb02bcd9e6ed');
  d := pg_temp.m115540_troca(d, $a$UPDATE financeiro_lancamentos_v2$a$,
$a$PERFORM public._fn_conc_guardar_antes(p_lancamento_id, p_extrato_id);  -- CONC-DESCONCILIAR-EDSON-01 (R3)
    UPDATE financeiro_lancamentos_v2$a$, 'V1 antes do 1:1');
  EXECUTE d;
  d := pg_temp.m115540_corpo('public.fn_vincular_grupo_conciliacao(uuid,uuid[],numeric[],text)', '81dedb5ca2dc3b054089ba9c23aa548d');
  d := pg_temp.m115540_troca(d, $a$UPDATE financeiro_lancamentos_v2$a$,
$a$PERFORM public._fn_conc_guardar_antes(v_lanc, p_extrato_id);  -- CONC-DESCONCILIAR-EDSON-01 (R3)
      UPDATE financeiro_lancamentos_v2$a$, 'V2 antes do grupo');
  EXECUTE d;

  -- 9.5 o desfazer do grupo (Espelho) diz o que voltou e o que ficou com a edicao
  d := pg_temp.m115540_corpo('public.fn_desfazer_grupo_conciliacao(uuid,text)', '27a26a9c387673b655fe97ca5497fd0b');
  d := pg_temp.m115540_troca(d, $a$'extratos_afetados', v_extratos);$a$,
$a$'extratos_afetados', v_extratos,
                            -- CONC-DESCONCILIAR-EDSON-01 (R3): os lancamentos que voltaram ao antes do casar
                            'voltaram', (SELECT coalesce(jsonb_agg(jsonb_build_object('lancamento_id', b.lancamento_id, 'frase', b.desfeita_motivo)
                                                                   ORDER BY b.feita_em), '[]'::jsonb)
                                           FROM financeiro_baixas_no_vinculo b
                                          WHERE b.tipo = 'casar' AND b.desfeita_em = now()
                                            AND b.lancamento_id IN (SELECT c.lancamento_id FROM conciliacao_bancaria_itens c WHERE c.grupo_id = p_grupo_id)));$a$, 'D1 voltaram');
  EXECUTE d;

  -- 9.6 "Ligar com o valor real" (1:1 da linha do extrato): a NF nunca sobe para o valor do banco
  d := pg_temp.m115540_corpo('public.fn_conc_ligar_com_valor_real(uuid,uuid,text,boolean)', '9e81f943e8e4791ad85fd7fb6e1878b8');
  d := pg_temp.m115540_troca(d, $a$IF NOT coalesce(p_aceitar_valor_extrato, false) THEN$a$,
$a$-- CONC-DESCONCILIAR-EDSON-01 (R2): nota com NF nao assume o valor do banco; a diferenca e' juros/multa, pelo "Casar com o banco"
    IF l.tipo_operacao LIKE '2-%' AND v_ext > v_livre + 1.005 AND public._fn_lancamento_tem_nf(l.id) THEN
      RAISE EXCEPTION 'O extrato de % é maior que a NF (% em aberto) e o valor da NF não muda. Case pelo "Casar com o banco" e diga que a diferença é juros/multa. Nada foi gravado.',
        public._fn_oc_brl(v_ext), public._fn_oc_brl(v_livre) USING ERRCODE = 'P0001', DETAIL = l.id::text;
    END IF;
    IF NOT coalesce(p_aceitar_valor_extrato, false) THEN$a$, 'L1 NF nao sobe');
  EXECUTE d;
END $m$;
