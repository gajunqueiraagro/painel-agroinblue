-- CONC-SPLIT-SUBSTITUIR-FILHO-01 — o desmembramento vale ENQUANTO os filhos dele estao ligados ao extrato (Gabriel 21/10/2026, cliente
-- travado: extrato Bradesco 21/09 R$ 4.061,74 desmembrado em 03/10 em Diesel 1/2 R$ 3.225 + Honorarios R$ 836,74; em 21/10 o usuario
-- desconciliou e reconciliou com o parcelado NOVO do diesel + os honorarios; o split antigo continuou vivo e o Diesel antigo, ja' fora do
-- extrato, nao se cancelava: "Um filho nao se cancela sozinho", a soma o contava vivo e o desfazer dizia "linha 68 ... grupo ou bloco").
-- CAUSA: `_fn_split_vivo_do_lancamento` (o dono da pergunta, lido pela trava `guard_split_filho_cancelar` e por `fn_split_do_lancamento`)
-- so' olhava `desfeito_em` do split, nunca o vinculo ATUAL; e nada encerrava o split quando o extrato era reconciliado com outros.
--   1. `_fn_split_vivo_do_lancamento`: o filho so' e' "de split vivo" se ainda tem item ATIVO de conciliacao no extrato do split.
--   2. `_fn_split_encerrar(split, simular)`: o split cujo extrato foi reconciliado com lancamento que NAO e' filho dele fica ENCERRADO,
--      com trilha (`desfeito_em/por`, `desfeito_motivo` = "substituído por reconciliação em dd/mm/aaaa"); os filhos que sairam viram
--      lancamentos comuns. Nada mais e' mexido (nem lancamento, nem conciliacao, nem a importacao).
--   3. `fn_split_encerrar_substituido(split, simular)`: a porta (tenant_ok) — o conserto dos casos antigos, um por um.
--   4. gatilho em `conciliacao_bancaria_itens`: dali em diante, reconciliar o extrato com outro lancamento encerra o split na hora.
--      O split criado na MESMA transacao nao conta (`criado_em < now()`), nem o escritor do split (`app.split_escritor`).
--   5. `fn_classificacao_desfazer_split`: as frases "da linha N ... outra linha do extrato / grupo ou bloco" viram frase pronta com o
--      lancamento (descricao, data, R$), o extrato (data, R$) e o caminho.
-- Os casos antigos (FASE 0: 3 splits em 2 clientes) NAO sao encerrados aqui: so' o do caso real, pela porta, depois do apply.

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'CONC-SPLIT-SUBSTITUIR-FILHO-01: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'CONC-SPLIT-SUBSTITUIR-FILHO-01: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

-- ═══════════════════ 1. O DONO DA PERGUNTA OLHA O VINCULO ATUAL ═══════════════════
DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_split_vivo_do_lancamento(uuid)'::regprocedure) <> '6621ae6ac5612d3d717e0fe2786ae9eb' THEN
    RAISE EXCEPTION 'CONC-SPLIT-SUBSTITUIR-FILHO-01: _fn_split_vivo_do_lancamento divergente';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public._fn_split_vivo_do_lancamento(p_lancamento_id uuid)
 RETURNS TABLE(split_id uuid, extrato_id uuid, staging_id uuid)
 LANGUAGE sql
 STABLE
AS $function$
  -- CONC-SPLIT-SUBSTITUIR-FILHO-01: o filho so' e' de split VIVO enquanto esta' ligado (item ativo) ao extrato do split
  select s.id, s.extrato_id, i.staging_id
    from public.classificacao_split_itens i
    join public.classificacao_splits s on s.id = i.split_id
   where i.filho_id = p_lancamento_id and s.desfeito_em is null
     and exists (select 1 from public.conciliacao_bancaria_itens c
                  where c.lancamento_id = i.filho_id and c.extrato_id = s.extrato_id and c.desfeito_em is null)
   order by s.criado_em desc
   limit 1
$function$;

-- ═══════════════════ 2. ENCERRAR O SPLIT SUBSTITUIDO (interna) ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_split_encerrar(p_split_id uuid, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sp public.classificacao_splits%ROWTYPE; v_desde timestamptz; v_motivo text; v_sairam jsonb; v_uid uuid;
BEGIN
  SELECT * INTO v_sp FROM public.classificacao_splits WHERE id = p_split_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_split', 'mensagem', 'Desmembramento não encontrado.');
  END IF;
  IF v_sp.desfeito_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_encerrado', 'mensagem', 'Este desmembramento já foi desfeito ou encerrado.');
  END IF;
  -- substituido = o extrato tem item ATIVO com lancamento que nao e' filho deste split (nem o consolidado)
  SELECT min(c.created_at) INTO v_desde
    FROM public.conciliacao_bancaria_itens c
   WHERE c.extrato_id = v_sp.extrato_id AND c.desfeito_em IS NULL AND c.lancamento_id IS DISTINCT FROM v_sp.consolidado_id
     AND NOT EXISTS (SELECT 1 FROM public.classificacao_split_itens i WHERE i.split_id = v_sp.id AND i.filho_id = c.lancamento_id);
  IF v_desde IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ainda_vale',
      'mensagem', 'O extrato não foi reconciliado com outros lançamentos: o desmembramento ainda vale.');
  END IF;
  v_motivo := 'substituído por reconciliação em ' || to_char(v_desde AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
  SELECT coalesce(jsonb_agg(jsonb_build_object('lancamento_id', i.filho_id, 'descricao', f.descricao, 'valor', abs(f.valor),
           'cancelado', coalesce(f.cancelado, false)) ORDER BY abs(f.valor) DESC), '[]'::jsonb) INTO v_sairam
    FROM public.classificacao_split_itens i LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = i.filho_id
   WHERE i.split_id = v_sp.id
     AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c
                      WHERE c.lancamento_id = i.filho_id AND c.extrato_id = v_sp.extrato_id AND c.desfeito_em IS NULL);
  IF NOT coalesce(p_simular, false) THEN
    BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
    UPDATE public.classificacao_splits SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = v_motivo WHERE id = v_sp.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, false), 'split_id', v_sp.id, 'extrato_id', v_sp.extrato_id,
    'motivo', v_motivo, 'filhos_que_sairam', v_sairam);
END
$function$;
REVOKE ALL ON FUNCTION public._fn_split_encerrar(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ═══════════════════ 3. A PORTA (os casos antigos, um por um) ═══════════════════
CREATE OR REPLACE FUNCTION public.fn_split_encerrar_substituido(p_split_id uuid, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_cli uuid := (SELECT s.cliente_id FROM public.classificacao_splits s WHERE s.id = p_split_id);
BEGIN
  IF v_cli IS NULL OR NOT coalesce(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  RETURN public._fn_split_encerrar(p_split_id, p_simular);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_split_encerrar_substituido(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_split_encerrar_substituido(uuid, boolean) TO authenticated, service_role;

-- ═══════════════════ 4. DALI EM DIANTE: RECONCILIAR COM OUTRO ENCERRA ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_trg_split_substituido_ao_conciliar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF coalesce(current_setting('app.split_escritor', true), 'off') = 'on' THEN
    RETURN NULL;
  END IF;
  FOR v_id IN
    SELECT s.id FROM public.classificacao_splits s
     WHERE s.extrato_id = NEW.extrato_id AND s.desfeito_em IS NULL AND s.criado_em < now()
       AND NEW.lancamento_id IS DISTINCT FROM s.consolidado_id
       AND NOT EXISTS (SELECT 1 FROM public.classificacao_split_itens i WHERE i.split_id = s.id AND i.filho_id = NEW.lancamento_id)
  LOOP
    PERFORM public._fn_split_encerrar(v_id, false);
  END LOOP;
  RETURN NULL;
END
$function$;
REVOKE ALL ON FUNCTION public._fn_trg_split_substituido_ao_conciliar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_split_substituido_ao_conciliar
  AFTER INSERT ON public.conciliacao_bancaria_itens
  FOR EACH ROW WHEN (NEW.desfeito_em IS NULL)
  EXECUTE FUNCTION public._fn_trg_split_substituido_ao_conciliar();

-- ═══════════════════ 5. AS FRASES DO DESFAZER: O LANCAMENTO E O CAMINHO, NAO "A LINHA N" ═══════════════════
SELECT pg_temp._trocar('public.fn_classificacao_desfazer_split(uuid, text, boolean)'::regprocedure, '088982bfc08964d87975158b365a6d34', ARRAY[
  $a$  SELECT string_agg(DISTINCT s.excel_linha_origem::text, ', ') INTO v_txt
    FROM classificacao_split_itens i JOIN financeiro_classificacao_staging s ON s.staging_id = i.staging_id
    JOIN conciliacao_bancaria_itens c ON c.lancamento_id = i.filho_id AND c.desfeito_em IS NULL
   WHERE i.split_id = v_sp.id AND c.extrato_id <> v_sp.extrato_id;
  IF v_txt IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'filho_outro_extrato',
      'mensagem', format('O lançamento da linha %s está vinculado a outra linha do extrato: desvincule antes.', v_txt));
  END IF;$a$,
  $a$  -- CONC-SPLIT-SUBSTITUIR-FILHO-01: a frase diz o lancamento e o extrato (data, R$) e o caminho, nao "a linha N"
  SELECT string_agg(DISTINCT format('"%s" (%s) está conciliado com o extrato de %s (R$ %s)', coalesce(f.descricao, 'sem descrição'),
           'R$ ' || translate(to_char(abs(f.valor), 'FM999,999,999,990.00'), ',.', '.,'), to_char(x.data_movimento, 'DD/MM/YYYY'),
           translate(to_char(abs(x.valor), 'FM999,999,999,990.00'), ',.', '.,')), '; ') INTO v_txt
    FROM classificacao_split_itens i
    JOIN financeiro_lancamentos_v2 f ON f.id = i.filho_id
    JOIN conciliacao_bancaria_itens c ON c.lancamento_id = i.filho_id AND c.desfeito_em IS NULL
    JOIN extrato_bancario_v2 x ON x.id = c.extrato_id
   WHERE i.split_id = v_sp.id AND c.extrato_id <> v_sp.extrato_id;
  IF v_txt IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'filho_outro_extrato',
      'mensagem', format('O lançamento %s, outra linha do extrato. Desvincule em Financeiro › Conciliação e desfaça o desmembramento depois.', v_txt));
  END IF;$a$,
  $b$  SELECT string_agg(DISTINCT s.excel_linha_origem::text, ', ') INTO v_txt
    FROM classificacao_split_itens i JOIN financeiro_classificacao_staging s ON s.staging_id = i.staging_id
    JOIN conciliacao_bancaria_itens c ON c.lancamento_id = i.filho_id AND c.desfeito_em IS NULL
   WHERE i.split_id = v_sp.id AND c.grupo_id IS NOT NULL AND c.grupo_id IS DISTINCT FROM v_sp.grupo_id;
  IF v_txt IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'filho_em_grupo',
      'mensagem', format('O lançamento da linha %s está num grupo ou bloco de conciliação: desfaça-o antes.', v_txt));
  END IF;$b$,
  $b$  SELECT string_agg(DISTINCT format('"%s" (%s) está conciliado em outro grupo com o extrato de %s (R$ %s)', coalesce(f.descricao, 'sem descrição'),
           'R$ ' || translate(to_char(abs(f.valor), 'FM999,999,999,990.00'), ',.', '.,'), to_char(x.data_movimento, 'DD/MM/YYYY'),
           translate(to_char(abs(x.valor), 'FM999,999,999,990.00'), ',.', '.,')), '; ') INTO v_txt
    FROM classificacao_split_itens i
    JOIN financeiro_lancamentos_v2 f ON f.id = i.filho_id
    JOIN conciliacao_bancaria_itens c ON c.lancamento_id = i.filho_id AND c.desfeito_em IS NULL
    JOIN extrato_bancario_v2 x ON x.id = c.extrato_id
   WHERE i.split_id = v_sp.id AND c.grupo_id IS NOT NULL AND c.grupo_id IS DISTINCT FROM v_sp.grupo_id;
  IF v_txt IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'filho_em_grupo',
      'mensagem', format('O lançamento %s. Desfaça essa conciliação em Financeiro › Conciliação e desfaça o desmembramento depois.', v_txt));
  END IF;$b$
]);

DO $confere$
BEGIN
  IF position('c.desfeito_em is null' in pg_get_functiondef('public._fn_split_vivo_do_lancamento(uuid)'::regprocedure)) = 0
     OR position('outro grupo com o extrato' in pg_get_functiondef('public.fn_classificacao_desfazer_split(uuid, text, boolean)'::regprocedure)) = 0
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_split_substituido_ao_conciliar') THEN
    RAISE EXCEPTION 'CONC-SPLIT-SUBSTITUIR-FILHO-01: conferencia final falhou';
  END IF;
END $confere$;
