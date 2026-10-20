-- CONC-BLOCO-SINAL-MISTO-01 — o bloco da conciliacao aceita extrato com entrada E saida quando a soma COM SINAL fecha (pagamento a mais +
-- reembolso, estorno, tarifa devolvida, PIX devolvido). Gabriel, 20/10/2026. Caso: Agnaldo, Bradesco, consorcio 002122 (77c502f0) parcela 1:
-- 19/06 PIX ENVIADO −2.893,37 + 23/06 PIX RECEBIDO +89,71 = −2.803,66 = os dois lancamentos da parcela (−2.309,64 e −494,02).
--   1. `fn_conciliar_bloco` (bfa36381… -> destino abaixo; corpo INTEIRO guardado por md5 de origem e de destino): na regra 'exato' os extratos
--      podem ter sinais diferentes; a direcao do bloco e' a do LIQUIDO do extrato e a soma e' com sinal; liquido zero recusa ("o bloco soma
--      zero: entrada e saída se anulam — use o par de estorno"). O extrato CONTRA a direcao (o reembolso) vincula inteiro ao lancamento mais
--      antigo da direcao com `valor_aplicado` NEGATIVO — o aplicado e' sempre na direcao do lancamento (como o leem `fn_caixa_sistema_pontas`
--      e a mesa do dia: sinal do lancamento × aplicado), e este dinheiro voltou. Cada extrato fica aplicado pelo valor inteiro, cada lancamento
--      fecha no valor dele; o valor do lancamento nunca muda. 'mais_antigo_primeiro': uma direcao so', a recusa em portugues. O resumo ganha as
--      somas COM SINAL. O quitado e' promovido tambem de 'previsto' (o N:1 do Espelho, `fn_espelho_casar_n1`, ja' promove qualquer status). O
--      status do extrato le' o modulo da soma (a linha do reembolso e' a unica negativa dele).
--   2. `fn_desfazer_bloco` (a6c5e860… -> destino): o status do extrato pelo modulo da soma (o reembolso volta a 'nao_conciliado').
--   3. `_fn_lancamento_aplicado_vivo` (bd223771… -> destino): soma COM SINAL (era a soma dos modulos: o reembolso contaria a mais).
--   4. `fn_lancamentos_parciais` (978802b0… -> destino): a parte de cada extrato com o sinal dela.
-- Hoje NENHUMA linha de `conciliacao_bancaria_itens` tem `valor_aplicado` negativo (medido em 20/10): para todo bloco de sinal unico o
-- resultado e' o de antes. Assinaturas, SECURITY, search_path e ACL iguais. Nenhum dado muda.

set local lock_timeout = '2s';

create or replace function pg_temp._troca(t text, a text, b text, rotulo text) returns text language plpgsql as $f$
begin
  if (length(t) - length(replace(t, a, ''))) / length(a) <> 1 then raise exception 'ancora % nao casa 1x', rotulo; end if;
  return replace(t, a, b);
end $f$;

do $mig$
declare v_oid oid; v_src text; v_new text; v_acl text;
begin
  -- 1. o bloco (corpo inteiro)
  v_oid := 'public.fn_conciliar_bloco(uuid[], uuid[], text, boolean)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '8a108ebfa54d5502308983b7c99965b2' then
    if md5(v_src) <> 'bfa36381d5362caffdf752d0042ed2c3' then raise exception 'fn_conciliar_bloco: origem inesperada %', md5(v_src); end if;
    execute $novo$CREATE OR REPLACE FUNCTION public.fn_conciliar_bloco(p_extratos uuid[], p_lancamentos uuid[], p_regra text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cli uuid; v_conta uuid; v_sinal_ext int; v_n_ext int; v_n_lan int;
  r record;
  -- extratos e lancamentos na ORDEM da alocacao
  e_id uuid[] := '{}'; e_data date[] := '{}'; e_valor numeric[] := '{}'; e_rest numeric[] := '{}'; e_sval numeric[] := '{}'; e_dir int[] := '{}';
  v_liquido numeric := 0; v_misto boolean := false; v_k int; i0 int; j0 int;
  l_id uuid[] := '{}'; l_desc text[] := '{}'; l_saldo numeric[] := '{}'; l_rest numeric[] := '{}'; l_quitou date[] := '{}';
  l_dir int[] := '{}'; v_d int;
  i int := 1; j int := 1; m numeric;
  v_soma_ext numeric := 0; v_soma_lan numeric := 0;
  v_matriz jsonb := '[]'::jsonb; v_quitados jsonb := '[]'::jsonb; v_parcial jsonb := NULL; v_resumo jsonb; v_ret jsonb;
  v_bloco uuid; v_estado jsonb := '{}'::jsonb; v_soma numeric; v_status text;
  c_tol constant numeric := 0.005;
BEGIN
  IF p_regra IS NULL OR p_regra NOT IN ('exato', 'mais_antigo_primeiro') THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('regra_invalida: a regra %s nao existe (exato | mais_antigo_primeiro).', coalesce(p_regra, '-'));
  END IF;
  v_n_ext := coalesce(array_length(p_extratos, 1), 0);
  v_n_lan := coalesce(array_length(p_lancamentos, 1), 0);
  IF v_n_ext = 0 OR v_n_lan = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'bloco_vazio: o bloco precisa de pelo menos um extrato e um lancamento.';
  END IF;
  IF v_n_ext <> (SELECT count(DISTINCT x) FROM unnest(p_extratos) x) OR v_n_lan <> (SELECT count(DISTINCT x) FROM unnest(p_lancamentos) x) THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'membro_repetido: o mesmo extrato ou lancamento aparece duas vezes no bloco.';
  END IF;

  -- ── extratos, por data (desempate id)
  FOR r IN SELECT e.* FROM extrato_bancario_v2 e WHERE e.id = ANY(p_extratos) ORDER BY e.data_movimento, e.id LOOP
    IF r.cancelado_em IS NOT NULL OR r.ignorado_em IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('extrato_inativo: o extrato de %s (%s) esta cancelado ou ignorado.', to_char(r.data_movimento, 'DD/MM'), r.valor);
    END IF;
    IF v_cli IS NULL THEN v_cli := r.cliente_id; v_conta := r.conta_bancaria_id; v_sinal_ext := sign(r.valor); END IF;
    IF sign(r.valor) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('extrato_zero: o extrato de %s tem valor zero.', to_char(r.data_movimento, 'DD/MM'));
    END IF;
    IF r.cliente_id IS DISTINCT FROM v_cli THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'cliente_divergente: os extratos do bloco sao de clientes diferentes.';
    END IF;
    IF r.conta_bancaria_id IS DISTINCT FROM v_conta THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('conta_diferente: o extrato de %s (%s) e'' de outra conta bancaria — um bloco e'' de uma conta so''.', to_char(r.data_movimento, 'DD/MM'), r.valor);
    END IF;
    -- CONC-BLOCO-SINAL-MISTO-01: na regra 'exato' o bloco aceita entrada e saida do banco (pagamento a mais + reembolso, estorno,
    -- tarifa devolvida): a conta do extrato passa a ser COM SINAL. No 'mais_antigo_primeiro', uma direcao so'.
    IF sign(r.valor) <> v_sinal_ext THEN
      IF p_regra <> 'exato' THEN
        RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'direcao_mista: Mais antigo primeiro aceita só saídas ou só entradas; para saída + reembolso use Soma exata.';
      END IF;
      v_misto := true;
    END IF;
    IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = r.id AND c.desfeito_em IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('extrato_ja_vinculado: o extrato de %s (%s) ja tem vinculo — desfaca antes.', to_char(r.data_movimento, 'DD/MM'), r.valor);
    END IF;
    e_id := e_id || r.id; e_data := e_data || r.data_movimento; e_valor := e_valor || abs(r.valor); e_rest := e_rest || abs(r.valor);
    e_sval := e_sval || r.valor; v_liquido := v_liquido + r.valor;
  END LOOP;
  -- a direcao do bloco e' a do LIQUIDO do extrato; cada extrato e' da direcao (1) ou contra ela (-1)
  IF abs(v_liquido) <= c_tol THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'liquido_zero: o bloco soma zero: entrada e saída se anulam — use o par de estorno.';
  END IF;
  v_sinal_ext := sign(v_liquido)::int;
  v_soma_ext := abs(v_liquido);
  FOR v_k IN 1..coalesce(array_length(e_id, 1), 0) LOOP e_dir := e_dir || (sign(e_sval[v_k])::int * v_sinal_ext); END LOOP;
  IF coalesce(array_length(e_id, 1), 0) <> v_n_ext THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'extrato_nao_encontrado: algum extrato do bloco nao existe.';
  END IF;
  IF NOT public.tenant_ok(v_cli) THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;

  -- ── lancamentos, por competencia (desempate vencimento, created_at, maior valor, id), com o SALDO LIVRE (abs(valor) - aplicado vivo)
  FOR r IN
    SELECT l.*, abs(l.valor) - coalesce((SELECT sum(c.valor_aplicado) FROM conciliacao_bancaria_itens c
                                          WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL), 0) AS saldo_livre
      FROM financeiro_lancamentos_v2 l WHERE l.id = ANY(p_lancamentos)
     -- CONC-BLOCOS-TELA-01 (decisao do Gabriel, 01/10): competencia -> vencimento -> created_at (a ordem real de
     -- lancamento das cargas do modal) -> MAIOR valor (as 10 NFs do backfill de 16/09 empatam no created_at) -> id.
     ORDER BY l.data_competencia NULLS LAST, l.data_vencimento NULLS LAST, l.created_at NULLS LAST, abs(l.valor) DESC, l.id
  LOOP
    IF r.cancelado IS TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('lancamento_cancelado: "%s" esta cancelado.', coalesce(r.descricao, r.id::text));
    END IF;
    IF r.cliente_id IS DISTINCT FROM v_cli THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('cliente_divergente: "%s" e'' de outro cliente.', coalesce(r.descricao, r.id::text));
    END IF;
    IF coalesce(r.cenario, 'realizado') = 'meta' THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('lancamento_meta: "%s" e'' do cenario meta — meta nao se concilia.', coalesce(r.descricao, r.id::text));
    END IF;
    IF r.conta_efetiva_id IS DISTINCT FROM v_conta THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('conta_diferente: "%s" e'' de outra conta bancaria (a conta dele, pela direcao, nao e'' a do extrato).', coalesce(r.descricao, r.id::text));
    END IF;
    -- MANDIOCA-RETENCAO-NF-01: na regra 'exato' o lancamento de SINAL OPOSTO entra (a retencao da NF contra o deposito
    -- liquido: venda + e Funrural - no mesmo bloco); a conta passa a ser com sinal. No 'mais_antigo_primeiro', uma direcao so'.
    v_d := CASE WHEN (v_sinal_ext < 0 AND r.sinal = '-1') OR (v_sinal_ext > 0 AND r.sinal = '1') THEN 1
                WHEN (v_sinal_ext < 0 AND r.sinal = '1') OR (v_sinal_ext > 0 AND r.sinal = '-1') THEN -1
                ELSE 0 END;
    IF v_d = 0 OR (v_d = -1 AND p_regra <> 'exato') THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('direcao_incoerente: "%s" e'' %s e o extrato e'' %s.', coalesce(r.descricao, r.id::text),
        CASE WHEN r.sinal = '1' THEN 'entrada' ELSE 'saida' END, CASE WHEN v_sinal_ext > 0 THEN 'entrada' ELSE 'saida' END);
    END IF;
    IF EXISTS (SELECT 1 FROM financeiro_fechamentos f WHERE f.cliente_id = r.cliente_id AND f.fazenda_id = r.fazenda_id
                AND f.ano_mes = r.ano_mes AND f.status_fechamento = 'fechado') THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('mes_fechado: "%s" e'' da competencia %s, mes fechado.', coalesce(r.descricao, r.id::text), r.ano_mes);
    END IF;
    IF r.saldo_livre <= c_tol THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('sem_saldo_livre: "%s" ja esta inteiro conciliado.', coalesce(r.descricao, r.id::text));
    END IF;
    l_id := l_id || r.id; l_desc := l_desc || coalesce(r.descricao, ''); l_saldo := l_saldo || r.saldo_livre;
    l_rest := l_rest || r.saldo_livre; l_quitou := l_quitou || NULL::date; l_dir := l_dir || v_d;
    v_estado := v_estado || jsonb_build_object(r.id::text, jsonb_build_object('status_transacao', r.status_transacao, 'data_pagamento', r.data_pagamento));
    v_soma_lan := v_soma_lan + v_d * r.saldo_livre;
  END LOOP;
  IF coalesce(array_length(l_id, 1), 0) <> v_n_lan THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'lancamento_nao_encontrado: algum lancamento do bloco nao existe.';
  END IF;

  -- ── a regra
  IF p_regra = 'exato' AND abs(v_soma_ext - v_soma_lan) > c_tol THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('soma_diverge: os extratos somam %s e os lancamentos (saldo livre) %s — diferenca %s. A regra exato exige soma igual.',
      v_soma_ext, v_soma_lan, v_soma_ext - v_soma_lan);
  END IF;
  IF p_regra = 'mais_antigo_primeiro' AND v_soma_ext > v_soma_lan + c_tol THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('soma_extratos_maior: os extratos somam %s e os lancamentos so'' %s — sobrariam %s do banco sem lancamento. Acrescente o lancamento que falta.',
      v_soma_ext, v_soma_lan, v_soma_ext - v_soma_lan);
  END IF;

  -- ── CONC-BLOCO-SINAL-MISTO-01: o EXTRATO contra a direcao (o reembolso) vincula INTEIRO ao lancamento mais antigo da direcao,
  --    com valor_aplicado NEGATIVO (o aplicado e' na direcao do lancamento: este dinheiro voltou), e o lancamento passa a receber
  --    isso a mais dos extratos da direcao. Assim cada extrato fica aplicado pelo valor inteiro e cada lancamento fecha no valor dele.
  i0 := NULL; j0 := NULL;
  FOR v_k IN 1..v_n_ext LOOP IF e_dir[v_k] = 1 AND i0 IS NULL THEN i0 := v_k; END IF; END LOOP;
  FOR v_k IN 1..v_n_lan LOOP IF l_dir[v_k] = 1 AND j0 IS NULL THEN j0 := v_k; END IF; END LOOP;
  IF v_misto THEN
    IF j0 IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'sem_lancamento_da_direcao: nenhum lançamento na direção do líquido do extrato.';
    END IF;
    FOR v_k IN 1..v_n_ext LOOP
      IF e_dir[v_k] = -1 THEN
        v_matriz := v_matriz || jsonb_build_object('extrato_id', e_id[v_k], 'extrato_data', e_data[v_k], 'extrato_valor', e_valor[v_k],
                                                   'lancamento_id', l_id[j0], 'descricao', l_desc[j0], 'valor_aplicado', -round(e_rest[v_k], 2));
        l_rest[j0] := l_rest[j0] + e_rest[v_k]; e_rest[v_k] := 0;
      END IF;
    END LOOP;
  END IF;

  -- ── o sinal oposto (so' no 'exato'): cada um vincula INTEIRO ao extrato mais antigo do bloco e aumenta o que ele cobre
  --    (o deposito liquido + a retencao = o bruto das vendas). Assim a alocacao gulosa abaixo fecha com as vendas quitadas.
  FOR j IN 1..v_n_lan LOOP
    IF l_dir[j] = -1 THEN
      v_matriz := v_matriz || jsonb_build_object('extrato_id', e_id[i0], 'extrato_data', e_data[i0], 'extrato_valor', e_valor[i0],
                                                 'lancamento_id', l_id[j], 'descricao', l_desc[j], 'valor_aplicado', round(l_rest[j], 2));
      e_rest[i0] := e_rest[i0] + l_rest[j]; l_rest[j] := 0; l_quitou[j] := e_data[i0];
    END IF;
  END LOOP;
  j := 1;

  -- ── alocacao gulosa: extrato mais antigo no lancamento mais antigo
  WHILE i <= v_n_ext AND j <= v_n_lan LOOP
    m := least(e_rest[i], l_rest[j]);
    IF m > c_tol THEN
      v_matriz := v_matriz || jsonb_build_object('extrato_id', e_id[i], 'extrato_data', e_data[i], 'extrato_valor', e_valor[i],
                                                 'lancamento_id', l_id[j], 'descricao', l_desc[j], 'valor_aplicado', round(m, 2));
      e_rest[i] := e_rest[i] - m; l_rest[j] := l_rest[j] - m;
      IF l_rest[j] <= c_tol THEN l_quitou[j] := e_data[i]; END IF;
    END IF;
    IF e_rest[i] <= c_tol THEN i := i + 1; END IF;
    IF l_rest[j] <= c_tol THEN j := j + 1; END IF;
  END LOOP;

  FOR j IN 1..v_n_lan LOOP
    IF l_rest[j] <= c_tol THEN
      v_quitados := v_quitados || jsonb_build_object('lancamento_id', l_id[j], 'descricao', l_desc[j], 'data_pagamento', l_quitou[j]);
    ELSIF l_rest[j] >= l_saldo[j] - c_tol THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('lancamento_sem_alocacao: "%s" nao recebe nada destes extratos — tire-o do bloco.', l_desc[j]);
    ELSE
      v_parcial := jsonb_build_object('lancamento_id', l_id[j], 'descricao', l_desc[j], 'aplicado', round(l_saldo[j] - l_rest[j], 2), 'falta', round(l_rest[j], 2));
    END IF;
  END LOOP;

  v_resumo := jsonb_build_object('soma_extratos', v_soma_ext, 'soma_lancamentos', v_soma_lan, 'diferenca', v_soma_ext - v_soma_lan,
                                 'quitados', v_quitados, 'parcial', v_parcial,
                                 -- CONC-BLOCO-SINAL-MISTO-01: as somas COM SINAL (a tela mostra estas)
                                 'soma_extratos_com_sinal', v_liquido, 'soma_lancamentos_com_sinal', v_sinal_ext * v_soma_lan,
                                 'diferenca_com_sinal', v_liquido - v_sinal_ext * v_soma_lan, 'sinal_misto', v_misto);
  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'regra', p_regra, 'conta_bancaria_id', v_conta,
                              'matriz', v_matriz, 'resumo', v_resumo);
  IF coalesce(p_simular, true) THEN RETURN v_ret; END IF;

  -- ── gravacao
  INSERT INTO conciliacao_blocos (cliente_id, conta_bancaria_id, regra, criado_por, estado_anterior, resumo)
  VALUES (v_cli, v_conta, p_regra, v_uid, v_estado, v_ret) RETURNING id INTO v_bloco;

  PERFORM set_config('app.conciliar_bloco', 'on', true);
  INSERT INTO conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, grupo_id,
                                          criado_por, tipo_aprovacao, aprovado_por, aprovado_em)
  SELECT v_cli, (x->>'extrato_id')::uuid, (x->>'lancamento_id')::uuid, (x->>'valor_aplicado')::numeric, v_bloco,
         v_uid, 'agrupamento_manual', v_uid, now()
    FROM jsonb_array_elements(v_matriz) x;
  PERFORM set_config('app.conciliar_bloco', 'off', true);

  -- promove SO' o quitado, com a data do extrato que quitou; o parcial fica como estava. O valor NUNCA muda.
  UPDATE financeiro_lancamentos_v2 l
     SET status_transacao = 'realizado', data_pagamento = (q->>'data_pagamento')::date, updated_by = v_uid, updated_at = now()
    FROM jsonb_array_elements(v_quitados) q
   WHERE l.id = (q->>'lancamento_id')::uuid AND l.status_transacao IN ('previsto', 'programado', 'agendado')
     AND l.cancelado IS NOT TRUE AND coalesce(l.cenario, 'realizado') <> 'meta';

  FOR i IN 1..v_n_ext LOOP
    -- CONC-BLOCO-SINAL-MISTO-01: o reembolso tem UMA linha negativa (o dinheiro voltou): o modulo da soma conta (as demais nunca sao negativas)
    SELECT abs(coalesce(sum(valor_aplicado), 0)) INTO v_soma FROM conciliacao_bancaria_itens WHERE extrato_id = e_id[i] AND desfeito_em IS NULL;
    v_status := CASE WHEN v_soma <= 0 THEN 'nao_conciliado' WHEN v_soma + c_tol >= e_valor[i] THEN 'conciliado' ELSE 'parcial' END;
    UPDATE extrato_bancario_v2 SET status = v_status WHERE id = e_id[i] AND status IS DISTINCT FROM v_status;
  END LOOP;

  RETURN v_ret || jsonb_build_object('bloco_id', v_bloco);
END
$function$
$novo$;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '8a108ebfa54d5502308983b7c99965b2' then raise exception 'fn_conciliar_bloco: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'fn_conciliar_bloco: ACL mudou'; end if;
  end if;

  -- 2. o desfazer
  v_oid := 'public.fn_desfazer_bloco(uuid, text)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '6980866683e20dd34d511ec57a29e46b' then
    if md5(v_src) <> 'a6c5e860370fa686b9504c147c78d3c1' then raise exception 'fn_desfazer_bloco: origem inesperada %', md5(v_src); end if;
    v_new := pg_temp._troca(pg_get_functiondef(v_oid),
      $a$      SELECT coalesce(sum(valor_aplicado), 0) INTO v_soma FROM conciliacao_bancaria_itens WHERE extrato_id = r.id AND desfeito_em IS NULL;$a$,
      $a$      -- CONC-BLOCO-SINAL-MISTO-01: o modulo da soma (o reembolso tem uma linha negativa)
      SELECT abs(coalesce(sum(valor_aplicado), 0)) INTO v_soma FROM conciliacao_bancaria_itens WHERE extrato_id = r.id AND desfeito_em IS NULL;$a$, 'D1');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '6980866683e20dd34d511ec57a29e46b' then raise exception 'fn_desfazer_bloco: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'fn_desfazer_bloco: ACL mudou'; end if;
  end if;

  -- 3. o aplicado vivo do lancamento, com sinal
  v_oid := 'public._fn_lancamento_aplicado_vivo(uuid)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '09a9407029e2077f4feca246deb717d1' then
    if md5(v_src) <> 'bd2237713f9ff836691a85b20359a219' then raise exception '_fn_lancamento_aplicado_vivo: origem inesperada %', md5(v_src); end if;
    v_new := pg_temp._troca(pg_get_functiondef(v_oid), $a$  SELECT COALESCE(sum(abs(c.valor_aplicado)), 0)$a$,
      $a$  -- CONC-BLOCO-SINAL-MISTO-01: com sinal (o reembolso de um bloco de sinal misto entra negativo)
  SELECT COALESCE(sum(c.valor_aplicado), 0)$a$, 'A1');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '09a9407029e2077f4feca246deb717d1' then raise exception '_fn_lancamento_aplicado_vivo: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception '_fn_lancamento_aplicado_vivo: ACL mudou'; end if;
  end if;

  -- 4. as partes do parcial, com sinal
  v_oid := 'public.fn_lancamentos_parciais(uuid)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '2871a2bb3decca68b1117104d52e97b5' then
    if md5(v_src) <> '978802b013c33618c36aa60d5d28aef9' then raise exception 'fn_lancamentos_parciais: origem inesperada %', md5(v_src); end if;
    v_new := pg_temp._troca(pg_get_functiondef(v_oid), $a$'valor_aplicado', abs(c.valor_aplicado))$a$, $a$'valor_aplicado', c.valor_aplicado)$a$, 'P1');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '2871a2bb3decca68b1117104d52e97b5' then raise exception 'fn_lancamentos_parciais: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'fn_lancamentos_parciais: ACL mudou'; end if;
  end if;
end $mig$;
