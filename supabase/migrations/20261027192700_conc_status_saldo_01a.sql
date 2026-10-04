-- PR-CONC-STATUS-SALDO-01a — o status do mes e' o SALDO; o extrato importado e' segunda prova (aviso)
--
-- POR QUE (decisao do Gabriel, 03/10): "conciliado" passa a dizer UMA coisa — o saldo informado da conta bate com o saldo do
-- sistema. O que o extrato importado diz (nao fecha com o informado, dia com diferenca, mes sem extrato, linha sem par) continua
-- sendo medido e mostrado, mas como AVISO: nao reprova o mes.
--
-- O QUE MUDA
-- 1. Linha de CONTA: status pelo saldo PROPRIO — 'conciliado' = informado e `proprio.diferenca` = 0 (ao centavo, a tolerancia
--    que o dono ja' usava: zero exato sobre valores arredondados a 2 casas); 'nao_conciliado' = informado e diferente (motivo
--    'saldo_diverge' + valor); 'pendente' = falta saldo ('saldo_nao_informado' + falta). `motivos` so' leva o que decide.
-- 2. Coluna nova `avisos` jsonb, NO FIM, a mesma forma dos motivos: 'sem_extrato' · 'dias_com_diferenca' {qtde, dias} ·
--    'extrato_nao_fecha' {valor} · 'extratos_sem_par' {qtde, valor} · 'lancamentos_sem_par' {qtde, valor} · 'conferida_com'
--    {conta_id, conta_nome} (na interna, a mae). Sem aviso = [].
-- 3. PAR: cada conta julgada pelo SEU saldo proprio. `par_status` continua = o status da mae, mas nao decide o da interna.
--    Os avisos de extrato da mae seguem no consolidado.
-- 4. Subtotal e total: qualquer 'nao_conciliado' derruba; 'pendente' so' conta; nenhuma conciliada = 'pendente'. TODA conta
--    entra uma vez com o SEU status, a INTERNA inclusive, no subtotal do tipo e no total (antes ela ficava fora do total); as
--    SOMAS de saldo, entradas e saidas dos agregados nao mudam. `avisos` = [{motivo:'contas_com_aviso', qtde,
--    qtde_alem_sem_extrato, por_aviso: {<aviso>: n contas}}] sobre as mesmas contas ('conferida_com' fora). As contas citadas em 'contas_nao_conciliadas' levam
--    tambem `avisos`. 'lancamentos_sem_conta' segue como estava: motivo INFORMATIVO na linha do total, nao muda o status.
-- 5. `posicao` ganha `diferenca_propria_na_data` (saldo informado da conta − sistema proprio na data). COM POSICAO declarada
--    antes do fim do mes o status julga ESSA diferenca ('saldo_diverge' leva `posicao` = a data); sem posicao, a do fim do mes.
--    Aviso novo 'realizados_apos_posicao' {qtde, valor, data} quando ha' realizado depois da posicao.
-- 7. DIFERENCA (decisao 2): `diferenca`, `proprio.diferenca` e as duas da posicao = round(extrato, 2) − round(sistema, 2), os
--    numeros que a tela mostra; a tolerancia segue zero exato. Causa: lancamentos com 3 casas (fila VALOR-3-CASAS) davam 0,01 com
--    os dois saldos iguais na tela. O dado NAO e' consertado aqui.
-- 8. SALDO INICIAL (decisao 3): sem saldo final do mes anterior, `saldo_inicial` e `proprio.saldo_inicial` usam o saldo inicial
--    INFORMADO na linha do mes (o primeiro mes da conta no sistema); `_fn_conciliacao_dias_conta` idem no proprio da mae.
-- 6. `fn_conciliacao_status_ano` devolve `avisos` por linha (as omitidas somam em 'contas_com_aviso', como em 'contas_pendentes').
-- Fora os itens 7 e 8, nenhum campo de SALDO muda. As tres funcoes de retorno novo caem e renascem (DROP + CREATE); ACL, SECURITY DEFINER,
-- search_path, plan_cache_mode e tenant_ok mantidos e conferidos no fim. Nenhuma escrita em dado.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])'::regprocedure)
       IS DISTINCT FROM '25aa2ac47b2bec06c951377cb2cecc84'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure)
       IS DISTINCT FROM '0c30b64769b0fdcd39ce9c846ec0790d'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)'::regprocedure)
       IS DISTINCT FROM 'bb71a135061912696d56e604b1b8596e' THEN
    RAISE EXCEPTION 'resumo publico, status do ano ou dias da conta fora do corpo esperado. Migration abortada.';
  END IF;
END $guarda$;

-- ═══ o helper dos dias (mesma assinatura): o saldo inicial proprio da mae no primeiro mes ═══
DO $mig$
DECLARE
  v_src text; v_def text; v_novo text; v_depois text; a0 text; b0 text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO v_src, v_def FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)'::regprocedure;
  IF md5(v_src) <> 'bb71a135061912696d56e604b1b8596e' THEN
    RAISE EXCEPTION 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric): corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a0 := $a0$    v_si_prop := (SELECT a.saldo_final FROM financeiro_saldos_bancarios_v2 a
                   WHERE a.conta_bancaria_id = p_conta AND a.cliente_id = p_cliente
                     AND a.ano_mes = to_char(p_de - interval '1 month', 'YYYY-MM'));
$a0$;
  b0 := $b0$    -- PR-CONC-STATUS-SALDO-01a (D3): sem saldo final do mes anterior, o saldo inicial INFORMADO na linha do mes
    v_si_prop := coalesce((SELECT a.saldo_final FROM financeiro_saldos_bancarios_v2 a
                   WHERE a.conta_bancaria_id = p_conta AND a.cliente_id = p_cliente
                     AND a.ano_mes = to_char(p_de - interval '1 month', 'YYYY-MM')),
                  (SELECT m.saldo_inicial FROM financeiro_saldos_bancarios_v2 m
                   WHERE m.conta_bancaria_id = p_conta AND m.cliente_id = p_cliente
                     AND m.ano_mes = to_char(p_de, 'YYYY-MM')));
$b0$;
  IF (length(v_def) - length(replace(v_def, a0, ''))) / length(a0) <> 1 THEN
    RAISE EXCEPTION 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric): ancora nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_def, a0, b0);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)'::regprocedure;
  IF md5(v_depois) <> 'cbd60a5e66d6d70963f96df036c78ae1' THEN
    RAISE EXCEPTION 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric): corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
END $mig$;

-- ═══ a interna do resumo (patch guardado por md5; o retorno ganha `avisos`: as duas que a chamam caem antes) ═══
DROP FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]);
DROP FUNCTION public.fn_conciliacao_status_ano(uuid, integer);

DO $mig$
DECLARE
  v_src text; v_def text; v_novo text; v_depois text; a text; a0 text; b0 text; a1 text; b1 text; a2 text; b2 text; a3 text; b3 text; a4 text; b4 text; a5 text; b5 text; a6 text; b6 text; a7 text; b7 text; a8 text; b8 text; a9 text; b9 text; a10 text; b10 text; a11 text; b11 text; a12 text; b12 text; a13 text; b13 text; a14 text; b14 text; a15 text; b15 text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO v_src, v_def FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  IF md5(v_src) <> '68c2e274fa8d1fe34bac081553e6633c' THEN
    RAISE EXCEPTION 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean): corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a0 := $a0$proprio jsonb, par_conta_id uuid, par_status text, internas jsonb)
 LANGUAGE plpgsql$a0$;
  b0 := $b0$proprio jsonb, par_conta_id uuid, par_status text, internas jsonb, avisos jsonb)
 LANGUAGE plpgsql$b0$;
  a1 := $a1$-- TOTAL. `p_detalhe` NULO = automatico (uma conta so'); `p_sem_conta` poe na linha do total os lancamentos sem conta.
$a1$;
  b1 := $b1$-- TOTAL. `p_detalhe` NULO = automatico (uma conta so'); `p_sem_conta` poe na linha do total os lancamentos sem conta.
-- PR-CONC-STATUS-SALDO-01a (Gabriel, 03/10): O STATUS DO MES E' O SALDO. Cada conta e' julgada pelo saldo PROPRIO:
-- 'conciliado' = saldo informado e `proprio.diferenca` = 0 (ao centavo, a tolerancia de sempre); 'nao_conciliado' = informado e
-- diferente (motivo 'saldo_diverge' + valor); 'pendente' = saldo nao informado ('saldo_nao_informado'). O que vem do EXTRATO
-- IMPORTADO e' segunda prova e vira AVISO (coluna `avisos`, a mesma forma dos motivos): 'sem_extrato', 'dias_com_diferenca',
-- 'extrato_nao_fecha', 'extratos_sem_par', 'lancamentos_sem_par' e, na interna, 'conferida_com' (a mae). Nenhum aviso muda o
-- 'realizados_apos_posicao'. Nenhum aviso muda o status. `par_status` continua sendo o status da MAE, mas nao decide o da interna.
-- Com POSICAO declarada antes do fim do mes, o status julga a diferenca PROPRIA NA POSICAO; sem ela, a do fim do mes.
-- DIFERENCA (D2) = round(extrato, 2) − round(sistema, 2): os dois numeros que a tela mostra (valores de 3 casas davam 0,01 com os
-- dois lados iguais na tela). SALDO INICIAL (D3) = saldo final do mes anterior; sem ele, o saldo inicial INFORMADO na linha do mes.
$b1$;
  a2 := $a2$  v_te numeric; v_ts numeric; v_par_status text; v_status_conta jsonb := '{}'::jsonb;
$a2$;
  b2 := $b2$  v_te numeric; v_ts numeric; v_par_status text; v_status_conta jsonb := '{}'::jsonb;
  -- PR-CONC-STATUS-SALDO-01a
  v_avi jsonb; v_pdif numeric; v_pfim numeric; v_navi int; v_nalem int; v_poravi jsonb; v_ppos numeric; v_jul numeric; v_tem_pos boolean;
$b2$;
  a3 := $a3$    v_mot := '[]'::jsonb;
    IF NOT (v->>'tem_extrato')::boolean THEN
      -- mes sem extrato: o status de hoje, sem inventar
      v_status := v_leg_status;
      v_mot := jsonb_build_array(jsonb_build_object('motivo', 'sem_extrato'));
    ELSE
      IF jsonb_array_length(v_dias) > 0 THEN
        v_mot := v_mot || jsonb_build_object('motivo', 'dias_com_diferenca', 'qtde', jsonb_array_length(v_dias),
                   'dias', (SELECT jsonb_agg(x->>'data' ORDER BY x->>'data') FROM jsonb_array_elements(v_dias) x));
      END IF;
      IF v_falta_saldo THEN
        v_mot := v_mot || jsonb_build_object('motivo', 'saldo_nao_informado',
                   'falta', CASE WHEN v_ini IS NULL AND v_fim IS NULL THEN 'inicial e final' WHEN v_ini IS NULL THEN 'inicial' ELSE 'final' END);
      ELSE
        IF v_dif <> 0 THEN v_mot := v_mot || jsonb_build_object('motivo', 'saldo_diverge', 'valor', v_dif); END IF;
        IF v_naofecha <> 0 THEN v_mot := v_mot || jsonb_build_object('motivo', 'extrato_nao_fecha', 'valor', v_naofecha); END IF;
      END IF;
      v_status := CASE WHEN v_falta_saldo THEN 'pendente'
                       WHEN jsonb_array_length(v_mot) = 0 THEN 'conciliado' ELSE 'nao_conciliado' END;
    END IF;

    -- PR-CONC-INTERNA-SEPARADA-01a (D2): a interna e' julgada COM a mae (o par vale uma vez): o status do PAR e o motivo
    -- 'conferida_com'. A mae ja' calculada nesta chamada responde pelo mapa; senao, uma chamada so' com ela.
    v_par_status := NULL;
    IF c.cons IS NOT NULL THEN
      v_par_status := v_status_conta->>(c.cons::text);
      IF v_par_status IS NULL THEN
        SELECT r.status INTO v_par_status
          FROM public._fn_conciliacao_resumo(p_cliente_id, p_ano_mes, ARRAY[c.cons], false, false) r
         WHERE r.nivel = 'conta' AND r.conta_id = c.cons;
      END IF;
      IF v_par_status IS NOT NULL THEN
        v_status := v_par_status;
        v_mot := jsonb_build_array(jsonb_build_object('motivo', 'conferida_com', 'conta_id', c.cons,
                   'conta_nome', (SELECT coalesce(m.nome_exibicao, m.nome_conta) FROM financeiro_contas_bancarias m WHERE m.id = c.cons)));
      END IF;
    END IF;
    v_status_conta := v_status_conta || jsonb_build_object(c.id::text, v_status);
$a3$;
  b3 := $b3$    -- ═══ PR-CONC-STATUS-SALDO-01a: o status e' o SALDO PROPRIO; o extrato importado e' aviso ═══
    -- o saldo informado e a diferenca PROPRIOS (os mesmos numeros de `proprio`): sem interna (e na interna) = os da conta; na
    -- mae = o inicial e o extrato DELA e o movimento dela com as transferencias com a interna.
    v_pfim := CASE WHEN v_internas IS NULL THEN v_fim ELSE v_fim_conta END;
    v_pdif := CASE WHEN v_ini_prop IS NULL OR v_pfim IS NULL THEN NULL
                   WHEN v_internas IS NULL THEN v_dif
                   ELSE round(v_pfim, 2) - round(v_ini_prop + v_mov_prop, 2) END;
    -- com POSICAO declarada antes do fim do mes, julga-se a diferenca propria NA POSICAO (o saldo informado e' o daquela data)
    v_tem_pos := v_data IS NOT NULL AND v_data < v_d2 AND v_pos_prop IS NOT NULL;
    v_ppos := CASE WHEN v_tem_pos AND v_ini_prop IS NOT NULL AND v_pfim IS NOT NULL
                   THEN round(v_pfim, 2) - round(v_ini_prop + v_pos_prop, 2) END;
    v_jul := CASE WHEN v_tem_pos THEN v_ppos ELSE v_pdif END;
    v_mot := '[]'::jsonb;
    IF v_jul IS NULL THEN
      v_status := 'pendente';
      v_mot := v_mot || jsonb_build_object('motivo', 'saldo_nao_informado',
                 'falta', CASE WHEN v_ini_prop IS NULL AND v_pfim IS NULL THEN 'inicial e final' WHEN v_ini_prop IS NULL THEN 'inicial' ELSE 'final' END);
    ELSIF v_jul <> 0 THEN
      v_status := 'nao_conciliado';
      v_mot := v_mot || jsonb_strip_nulls(jsonb_build_object('motivo', 'saldo_diverge', 'valor', v_jul,
                 'posicao', CASE WHEN v_tem_pos THEN v_data END));
    ELSE
      v_status := 'conciliado';
    END IF;

    -- AVISOS: a segunda prova. Nunca mudam o status. Os do extrato da mae seguem no consolidado (o arquivo dela fecha contra o par).
    v_avi := '[]'::jsonb;
    IF NOT (v->>'tem_extrato')::boolean THEN
      v_avi := v_avi || jsonb_build_object('motivo', 'sem_extrato');
    ELSE
      IF jsonb_array_length(v_dias) > 0 THEN
        v_avi := v_avi || jsonb_build_object('motivo', 'dias_com_diferenca', 'qtde', jsonb_array_length(v_dias),
                   'dias', (SELECT jsonb_agg(x->>'data' ORDER BY x->>'data') FROM jsonb_array_elements(v_dias) x));
      END IF;
      IF v_naofecha <> 0 THEN v_avi := v_avi || jsonb_build_object('motivo', 'extrato_nao_fecha', 'valor', v_naofecha); END IF;
      IF (v->'extratos_sem_par'->>'qtde')::int > 0 THEN
        v_avi := v_avi || jsonb_build_object('motivo', 'extratos_sem_par', 'qtde', (v->'extratos_sem_par'->>'qtde')::int,
                   'valor', (v->'extratos_sem_par'->>'valor')::numeric);
      END IF;
      IF (v->'lancamentos_sem_par'->>'qtde')::int > 0 THEN
        v_avi := v_avi || jsonb_build_object('motivo', 'lancamentos_sem_par', 'qtde', (v->'lancamentos_sem_par'->>'qtde')::int,
                   'valor', (v->'lancamentos_sem_par'->>'valor')::numeric);
      END IF;
    END IF;

    IF v_tem_pos AND (v->'apos'->>'qtde')::int > 0 THEN
      v_avi := v_avi || jsonb_build_object('motivo', 'realizados_apos_posicao', 'qtde', (v->'apos'->>'qtde')::int,
                 'valor', round((v->'apos'->>'valor')::numeric, 2), 'data', v_data);
    END IF;

    -- o PAR: cada conta e' julgada pelo SEU saldo. `par_status` (na interna) segue sendo o status da MAE — informacao, nao
    -- decide mais o da interna —, e a interna leva o aviso 'conferida_com' apontando a mae.
    v_par_status := NULL;
    IF c.cons IS NOT NULL THEN
      v_par_status := v_status_conta->>(c.cons::text);
      IF v_par_status IS NULL THEN
        SELECT r.status INTO v_par_status
          FROM public._fn_conciliacao_resumo(p_cliente_id, p_ano_mes, ARRAY[c.cons], false, false) r
         WHERE r.nivel = 'conta' AND r.conta_id = c.cons;
      END IF;
      IF v_par_status IS NOT NULL THEN
        v_avi := v_avi || jsonb_build_object('motivo', 'conferida_com', 'conta_id', c.cons,
                   'conta_nome', (SELECT coalesce(m.nome_exibicao, m.nome_conta) FROM financeiro_contas_bancarias m WHERE m.id = c.cons));
      END IF;
    END IF;
    v_status_conta := v_status_conta || jsonb_build_object(c.id::text, v_status);
$b3$;
  a4 := $a4$    dias_com_diferenca := v_dias; status := v_status; motivos := v_mot;
$a4$;
  b4 := $b4$    dias_com_diferenca := v_dias; status := v_status; motivos := v_mot; avisos := v_avi;
$b4$;
  a5 := $a5$                 'saldo_sistema_proprio_na_data', CASE WHEN v_ini_prop IS NULL THEN NULL ELSE round(v_ini_prop + v_pos_prop, 2) END,
$a5$;
  b5 := $b5$                 'saldo_sistema_proprio_na_data', CASE WHEN v_ini_prop IS NULL THEN NULL ELSE round(v_ini_prop + v_pos_prop, 2) END,
                 -- PR-CONC-STATUS-SALDO-01a: a diferenca PROPRIA na data (o saldo informado da conta − o sistema proprio na data)
                 'diferenca_propria_na_data', CASE WHEN v_ini_prop IS NULL OR v_pfim IS NULL THEN NULL
                                                   ELSE round(v_pfim, 2) - round(v_ini_prop + v_pos_prop, 2) END,
$b5$;
  a6 := $a6$      'status', v_status, 'motivos', v_mot, 'saldo_inicial', saldo_inicial,$a6$;
  b6 := $b6$      'status', v_status, 'motivos', v_mot, 'avisos', v_avi, 'saldo_inicial', saldo_inicial,$b6$;
  a7 := $a7$      jsonb_agg(jsonb_build_object('conta_id', y->'conta_id', 'conta_nome', y->'conta_nome', 'status', y->'status',
                                   'motivos', y->'motivos') ORDER BY i)$a7$;
  b7 := $b7$      jsonb_agg(jsonb_build_object('conta_id', y->'conta_id', 'conta_nome', y->'conta_nome', 'status', y->'status',
                                   'motivos', y->'motivos', 'avisos', y->'avisos') ORDER BY i)$b7$;
  a8 := $a8$    conta_id := NULL; conta_nome := g.rot; consolida_em_conta_id := NULL; saldo_extrato_data := NULL;
    dias_com_diferenca := NULL; status := v_status; motivos := v_mot; legado := NULL;
$a8$;
  b8 := $b8$    -- PR-CONC-STATUS-SALDO-01a: os AVISOS do agregado — quantas contas tem aviso e quantas por aviso, sobre as MESMAS contas do
    -- status. 'conferida_com' e' ponteiro, nao conta como aviso. No TOTAL a interna so' entra na contagem quando tem aviso ALEM
    -- de 'sem_extrato' (ela nunca tem extrato: conta'-la sempre mudaria o total de todo mes); no subtotal do tipo, entra sempre.
    -- `qtde_alem_sem_extrato`: as contas com algum aviso ALEM de 'sem_extrato' (conta sem arquivo importado e' o caso comum).
    SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(y->'avisos') w WHERE w->>'motivo' <> 'conferida_com')),
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(y->'avisos') w
                                           WHERE w->>'motivo' NOT IN ('conferida_com', 'sem_extrato')))
      INTO v_navi, v_nalem
      FROM jsonb_array_elements(v_contas) y
     WHERE ((g.k IS NULL AND (NOT (y->>'interna')::boolean
                                 OR EXISTS (SELECT 1 FROM jsonb_array_elements(y->'avisos') w2
                                             WHERE w2->>'motivo' NOT IN ('conferida_com', 'sem_extrato'))))
            OR y->>'grupo' = g.k);
    SELECT jsonb_object_agg(k.mot, k.qt) INTO v_poravi
      FROM (SELECT w->>'motivo' AS mot, count(*) AS qt
              FROM jsonb_array_elements(v_contas) y CROSS JOIN LATERAL jsonb_array_elements(y->'avisos') w
             WHERE ((g.k IS NULL AND (NOT (y->>'interna')::boolean
                                 OR EXISTS (SELECT 1 FROM jsonb_array_elements(y->'avisos') w2
                                             WHERE w2->>'motivo' NOT IN ('conferida_com', 'sem_extrato'))))
            OR y->>'grupo' = g.k) AND w->>'motivo' <> 'conferida_com'
             GROUP BY 1) k;
    avisos := CASE WHEN v_navi > 0
                   THEN jsonb_build_array(jsonb_build_object('motivo', 'contas_com_aviso', 'qtde', v_navi,
                                                             'qtde_alem_sem_extrato', v_nalem, 'por_aviso', v_poravi))
                   ELSE '[]'::jsonb END;
    conta_id := NULL; conta_nome := g.rot; consolida_em_conta_id := NULL; saldo_extrato_data := NULL;
    dias_com_diferenca := NULL; status := v_status; motivos := v_mot; legado := NULL;
$b8$;
  a9 := $a9$    SELECT CASE WHEN count(*) FILTER (WHERE s.saldo_final IS NULL) > 0 OR count(s.conta_bancaria_id) < count(*) THEN NULL
                ELSE sum(s.saldo_final) END
      INTO v_ini
      FROM (SELECT x.id FROM financeiro_contas_bancarias x WHERE x.id = c.id OR (x.consolida_em_conta_id = c.id AND x.cliente_id = p_cliente_id)) k
      LEFT JOIN financeiro_saldos_bancarios_v2 s ON s.conta_bancaria_id = k.id AND s.cliente_id = p_cliente_id AND s.ano_mes = v_ant;
$a9$;
  b9 := $b9$    -- PR-CONC-STATUS-SALDO-01a (D3): sem saldo final do mes anterior, vale o saldo inicial INFORMADO na linha do mes
    SELECT CASE WHEN count(*) FILTER (WHERE coalesce(s.saldo_final, m.saldo_inicial) IS NULL) > 0 THEN NULL
                ELSE sum(coalesce(s.saldo_final, m.saldo_inicial)) END
      INTO v_ini
      FROM (SELECT x.id FROM financeiro_contas_bancarias x WHERE x.id = c.id OR (x.consolida_em_conta_id = c.id AND x.cliente_id = p_cliente_id)) k
      LEFT JOIN financeiro_saldos_bancarios_v2 s ON s.conta_bancaria_id = k.id AND s.cliente_id = p_cliente_id AND s.ano_mes = v_ant
      LEFT JOIN financeiro_saldos_bancarios_v2 m ON m.conta_bancaria_id = k.id AND m.cliente_id = p_cliente_id AND m.ano_mes = p_ano_mes;
$b9$;
  a10 := $a10$      v_ini_prop := (SELECT a.saldo_final FROM financeiro_saldos_bancarios_v2 a
                      WHERE a.conta_bancaria_id = c.id AND a.cliente_id = p_cliente_id AND a.ano_mes = v_ant);
$a10$;
  b10 := $b10$      v_ini_prop := coalesce((SELECT a.saldo_final FROM financeiro_saldos_bancarios_v2 a
                      WHERE a.conta_bancaria_id = c.id AND a.cliente_id = p_cliente_id AND a.ano_mes = v_ant),
                    (SELECT m.saldo_inicial FROM financeiro_saldos_bancarios_v2 m
                      WHERE m.conta_bancaria_id = c.id AND m.cliente_id = p_cliente_id AND m.ano_mes = p_ano_mes));
$b10$;
  a11 := $a11$    v_dif := CASE WHEN v_ini IS NULL OR v_fim IS NULL THEN NULL ELSE round(v_fim - (v_ini + v_sis), 2) END;
$a11$;
  b11 := $b11$    -- PR-CONC-STATUS-SALDO-01a (D2): a diferenca dos dois numeros que a tela mostra
    v_dif := CASE WHEN v_ini IS NULL OR v_fim IS NULL THEN NULL ELSE round(v_fim, 2) - round(v_ini + v_sis, 2) END;
$b11$;
  a12 := $a12$ELSE round(v_fim - (v_ini + v_pos_cons), 2) END,$a12$;
  b12 := $b12$ELSE round(v_fim, 2) - round(v_ini + v_pos_cons, 2) END,$b12$;
  a13 := $a13$ELSE round(v_fim_conta - (v_ini_prop + v_mov_prop), 2) END,$a13$;
  b13 := $b13$ELSE round(v_fim_conta, 2) - round(v_ini_prop + v_mov_prop, 2) END,$b13$;
  a14 := $a14$      -- D3: no TOTAL o PAR vale uma vez — a interna (status do par) nao conta como conta. No SUBTOTAL do tipo ela conta, com o
      -- status do par e o motivo 'conferida_com': o tipo dela reflete o veredito do par (o tipo cuja unica conta e' a interna
      -- herda o status do par, nunca 'pendente' sem motivo).
      count(*) FILTER (WHERE y->>'status' = 'conciliado' AND (g.k IS NOT NULL OR NOT (y->>'interna')::boolean)),
      count(*) FILTER (WHERE y->>'status' = 'nao_conciliado' AND (g.k IS NOT NULL OR NOT (y->>'interna')::boolean)),
$a14$;
  b14 := $b14$      -- PR-CONC-STATUS-SALDO-01a: cada conta e' julgada pelo SEU saldo, e o agregado e' o pior veredito das contas que ele
      -- mostra. A INTERNA tem linha propria e entra UMA vez, com o status dela, no subtotal do tipo E no total (antes ficava fora
      -- do total: "o par vale uma vez"). As SOMAS de saldo, entradas e saidas nao mudam.
      count(*) FILTER (WHERE y->>'status' = 'conciliado'),
      count(*) FILTER (WHERE y->>'status' = 'nao_conciliado'),
$b14$;
  a15 := $a15$        FILTER (WHERE y->>'status' = 'nao_conciliado' AND (g.k IS NOT NULL OR NOT (y->>'interna')::boolean)),
      count(*) FILTER (WHERE y->>'status' = 'pendente' AND (g.k IS NOT NULL OR NOT (y->>'interna')::boolean))
$a15$;
  b15 := $b15$        FILTER (WHERE y->>'status' = 'nao_conciliado'),
      count(*) FILTER (WHERE y->>'status' = 'pendente')
$b15$;
  FOREACH a IN ARRAY ARRAY[a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15] LOOP
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean): ancora nao casa exatamente 1x: %', left(a, 80);
    END IF;
  END LOOP;
  v_novo := replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(v_def, a0, b0), a1, b1), a2, b2), a3, b3), a4, b4), a5, b5), a6, b6), a7, b7), a8, b8), a9, b9), a10, b10), a11, b11), a12, b12), a13, b13), a14, b14), a15, b15);
  DROP FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  IF md5(v_depois) <> '26f4a6df7c9db5bf546984bb4f422705' THEN
    RAISE EXCEPTION 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean): corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
END $mig$;
REVOKE ALL ON FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean) TO service_role;

-- ═══ a publica: mesmo corpo, `avisos` no fim ═══
CREATE FUNCTION public.fn_conciliacao_resumo_mes(p_cliente_id uuid, p_ano_mes text, p_conta_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(conta_id uuid, conta_nome text, consolida_em_conta_id uuid, tem_extrato boolean, saldo_inicial numeric, entradas numeric, saidas numeric, saldo_sistema numeric, saldo_extrato numeric, saldo_extrato_data date, diferenca numeric, banco jsonb, extratos_sem_par jsonb, lancamentos_sem_par jsonb, retido_em_depositos jsonb, dias_com_diferenca jsonb, status text, motivos jsonb, legado jsonb, nivel text, tipo_conta text, entradas_terceiros numeric, entradas_transferencias numeric, saidas_terceiros numeric, saidas_transferencias numeric, saldo_inicial_origem text, posicao jsonb, dias jsonb, linhas_sistema jsonb, sem_conta jsonb, diferenca_entradas numeric, diferenca_saidas numeric, proprio jsonb, par_conta_id uuid, par_status text, internas jsonb, avisos jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-CONC-SALDO-UMA-REGUA-01 / 01b — o RESUMO DA CONTA NO MES: uma linha por conta (NULL = todas as do cliente), um
-- subtotal por tipo e o total. Com UMA conta, tambem os dias e a lista do sistema. O corpo e' `_fn_conciliacao_resumo`.
BEGIN
  IF p_cliente_id IS NULL OR p_ano_mes !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'p_cliente_id e p_ano_mes (YYYY-MM) obrigatorios'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  RETURN QUERY SELECT * FROM public._fn_conciliacao_resumo(p_cliente_id, p_ano_mes, p_conta_ids, NULL, p_conta_ids IS NULL);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]) TO authenticated, service_role;

-- ═══ o status do ano (corpo integral): `avisos` por linha ═══
CREATE FUNCTION public.fn_conciliacao_status_ano(p_cliente_id uuid, p_ano integer)
 RETURNS TABLE(ano_mes text, nivel text, conta_id uuid, conta_nome text, tipo_conta text, status text, motivos jsonb, avisos jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-CONC-SALDO-UMA-REGUA-01b (D7) — o selo dos 12 meses: por mes, o status e os motivos de cada conta que teve extrato
-- ou lancamento no mes, e o do TOTAL do mes. Sai da MESMA interna do resumo (`_fn_conciliacao_resumo`), sem detalhe.
-- Ajuste do D3 (20261027191800): o total olha TODAS as contas, com ou sem extrato. Por isso a interna recebe tambem a
-- conta com SALDO INFORMADO no mes (a unica que, sem extrato e sem lancamento, pode sair 'conciliado' ou 'nao_conciliado'
-- pela regua de hoje); as demais contas do cliente sao 'pendente' por construcao (sem extrato e sem saldo informado = a
-- regua de hoje diz 'pendente') e entram SO' na contagem `contas_pendentes` do total — o mesmo numero do resumo.
-- PR-CONC-INTERNA-SEPARADA-01a (D4): a conta INTERNA e' julgada com a mae (o par vale uma vez): ela sai da contagem de contas do
-- total (como no resumo) e aparece em todo mes em que a mae aparece, com o status do par.
-- PR-CONC-STATUS-SALDO-01a: o status e' o do SALDO PROPRIO de cada conta (a interna com o dela) e a linha ganha `avisos` (a
-- segunda prova, do extrato importado). As contas omitidas (sem extrato, sem lancamento e sem saldo no mes) tem, no resumo, um
-- aviso so' — 'sem_extrato' — e somam-se a `contas_com_aviso` do total, como se somam a `contas_pendentes`. A INTERNA conta
-- como conta no total (o status dela, proprio), no universo das omitidas inclusive.
#variable_conflict use_column
DECLARE v_mov jsonb; v_sal jsonb; v_mes text; v_ids uuid[]; v_calc uuid[]; v_omit int; v_total int; v_omit_av int;
BEGIN
  IF p_cliente_id IS NULL OR p_ano IS NULL THEN RAISE EXCEPTION 'p_cliente_id e p_ano obrigatorios'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  -- as contas com movimento em cada mes do ano: extrato vivo, ou lancamento nao cancelado pago no mes (qualquer ponta)
  SELECT jsonb_object_agg(m.mes, m.contas) INTO v_mov
    FROM (SELECT x.mes, jsonb_agg(DISTINCT x.conta) AS contas
            FROM (SELECT to_char(e.data_movimento, 'YYYY-MM') AS mes, e.conta_bancaria_id AS conta
                    FROM extrato_bancario_v2 e
                   WHERE e.cliente_id = p_cliente_id AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
                     AND e.data_movimento BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)
                  UNION
                  SELECT to_char(l.data_pagamento, 'YYYY-MM'), k.conta
                    FROM financeiro_lancamentos_v2 l
                    CROSS JOIN LATERAL (VALUES (l.conta_bancaria_id), (l.conta_destino_id)) k(conta)
                   WHERE l.cliente_id = p_cliente_id AND l.cancelado = false
                     AND l.data_pagamento BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)
                     AND k.conta IS NOT NULL) x
           WHERE x.conta IS NOT NULL
           GROUP BY x.mes) m;
  -- as contas com saldo informado em cada mes do ano
  SELECT jsonb_object_agg(m.mes, m.contas) INTO v_sal
    FROM (SELECT s.ano_mes AS mes, jsonb_agg(DISTINCT s.conta_bancaria_id) AS contas
            FROM financeiro_saldos_bancarios_v2 s
           WHERE s.cliente_id = p_cliente_id AND s.ano_mes LIKE p_ano::text || '-%' AND s.conta_bancaria_id IS NOT NULL
           GROUP BY s.ano_mes) m;
  FOR i IN 1..12 LOOP
    v_mes := p_ano::text || '-' || lpad(i::text, 2, '0');
    v_ids := coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_mov->v_mes, '[]'::jsonb))::uuid), '{}'::uuid[]);
    -- PR-CONC-SALDO-UMA-REGUA-01c: o universo do mes e' o do resumo sem `p_conta_ids` — conta ATIVA e ja' existente no mes
    SELECT count(*) INTO v_total FROM financeiro_contas_bancarias b
     WHERE b.cliente_id = p_cliente_id AND b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= v_mes);
    v_calc := ARRAY(SELECT b.id FROM financeiro_contas_bancarias b
                     WHERE b.cliente_id = p_cliente_id AND b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= v_mes)
                       AND (b.id = ANY (v_ids)
                            OR b.id IN (SELECT jsonb_array_elements_text(coalesce(v_sal->v_mes, '[]'::jsonb))::uuid)
                            OR b.consolida_em_conta_id = ANY (v_ids)));
    -- PR-CONC-STATUS-SALDO-01a: a interna conta como conta no total (as pendentes); nos AVISOS do total a interna omitida (so'
    -- 'sem_extrato') nao entra — `v_omit_av` e' o numero das omitidas que NAO sao internas
    v_omit := v_total - cardinality(v_calc);
    v_omit_av := v_omit - (SELECT count(*) FROM financeiro_contas_bancarias b
                            WHERE b.cliente_id = p_cliente_id AND b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= v_mes)
                              AND b.consolida_em_conta_id IS NOT NULL AND NOT (b.id = ANY (v_calc)));
    RETURN QUERY
      SELECT v_mes, r.nivel, r.conta_id, r.conta_nome, r.tipo_conta, r.status,
             CASE WHEN r.nivel <> 'total' OR v_omit = 0 THEN r.motivos
                  -- as omitidas somam-se a' contagem de pendentes, na MESMA posicao em que o resumo a escreve
                  WHEN r.motivos @> '[{"motivo": "contas_pendentes"}]'::jsonb THEN
                    (SELECT jsonb_agg(CASE WHEN x.m->>'motivo' = 'contas_pendentes'
                                           THEN jsonb_set(x.m, '{qtde}', to_jsonb((x.m->>'qtde')::int + v_omit)) ELSE x.m END
                                      ORDER BY x.o)
                       FROM jsonb_array_elements(r.motivos) WITH ORDINALITY AS x(m, o))
                  ELSE
                    (SELECT jsonb_agg(z.m ORDER BY z.k)
                       FROM (SELECT x.m, x.o::numeric AS k FROM jsonb_array_elements(r.motivos) WITH ORDINALITY AS x(m, o)
                             UNION ALL
                             SELECT jsonb_build_object('motivo', 'contas_pendentes', 'qtde', v_omit),
                                    coalesce((SELECT x.o FROM jsonb_array_elements(r.motivos) WITH ORDINALITY AS x(m, o)
                                               WHERE x.m->>'motivo' = 'lancamentos_sem_conta'), 1000000) - 0.5) z)
             END,
             CASE WHEN r.nivel <> 'total' OR v_omit_av = 0 THEN r.avisos
                  WHEN r.avisos @> '[{"motivo": "contas_com_aviso"}]'::jsonb THEN
                    (SELECT jsonb_agg(CASE WHEN x.m->>'motivo' = 'contas_com_aviso'
                                           THEN jsonb_set(jsonb_set(x.m, '{qtde}', to_jsonb((x.m->>'qtde')::int + v_omit_av)),
                                                          '{por_aviso,sem_extrato}',
                                                          to_jsonb(coalesce((x.m#>>'{por_aviso,sem_extrato}')::int, 0) + v_omit_av))
                                           ELSE x.m END ORDER BY x.o)
                       FROM jsonb_array_elements(r.avisos) WITH ORDINALITY AS x(m, o))
                  ELSE jsonb_build_array(jsonb_build_object('motivo', 'contas_com_aviso', 'qtde', v_omit_av, 'qtde_alem_sem_extrato', 0,
                                                            'por_aviso', jsonb_build_object('sem_extrato', v_omit_av)))
             END
        FROM public._fn_conciliacao_resumo(p_cliente_id, v_mes, v_calc, false, true) r
       WHERE (r.nivel = 'conta' AND (r.conta_id = ANY (v_ids) OR r.par_conta_id = ANY (v_ids))) OR r.nivel = 'total';
  END LOOP;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_conciliacao_status_ano(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_status_ano(uuid, integer) TO authenticated, service_role;

-- ═══ guardas de destino ═══
DO $guarda$
DECLARE r record; f text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])'::regprocedure)
       IS DISTINCT FROM '25aa2ac47b2bec06c951377cb2cecc84'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure)
       IS DISTINCT FROM '35db738dfce0923a764f3d1fd2361177'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure)
       IS DISTINCT FROM '26f4a6df7c9db5bf546984bb4f422705'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)'::regprocedure)
       IS DISTINCT FROM 'cbd60a5e66d6d70963f96df036c78ae1' THEN
    RAISE EXCEPTION 'corpo de destino inesperado';
  END IF;
  FOREACH f IN ARRAY ARRAY['public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)', 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)',
                           'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])',
                           'public.fn_conciliacao_status_ano(uuid, integer)'] LOOP
    SELECT p.oid, p.proconfig, p.prosecdef INTO r FROM pg_proc p WHERE p.oid = f::regprocedure;
    IF NOT ('plan_cache_mode=force_custom_plan' = ANY (r.proconfig)) OR NOT ('search_path=pg_catalog, public' = ANY (r.proconfig))
       OR NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') <> (f NOT LIKE 'public.\_fn%')
       OR EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = r.oid)) x WHERE x.grantee = 0) THEN
      RAISE EXCEPTION '%: config/ACL inesperados (%)', f, r.proconfig;
    END IF;
  END LOOP;
END $guarda$;
