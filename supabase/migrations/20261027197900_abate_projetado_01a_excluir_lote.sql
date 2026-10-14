-- ABATE-PROJETADO-01a (Gabriel, 14/10/2026) — `oc_excluir_lote`: A SIMULACAO E A GRAVACAO DAO O MESMO RESULTADO.
--   O defeito (medido na FASE 0, NJ 1645ba75, "Abate 036 N"): a simulacao devolvia ok e a gravacao caia em 23503 no
--   `DELETE FROM zoo_operacao_lotes` — a RPC cancela as partes do lote mas deixa o `lote_id` nelas, e a FK
--   `zoo_operacao_partes_lote_fk` recusa. Na mesma FK irma, `zoo_operacao_compromissos_lote_fk`, ficam os compromissos JA'
--   CANCELADOS (o laco so' solta o lote dos que ele cancela agora): 78 hoje no proto, que barrariam o DELETE logo depois.
--   (a) antes do DELETE, solta o `lote_id` de TODAS as partes do lote (vivas e canceladas) e dos compromissos que ainda o
--       apontam; o evento 'excluir_lote' guarda `lote_id`, `partes_soltas` [{parte_id, cancelada}] e `compromissos_soltos`
--       [ids] — o historico nao perde de qual lote a parte veio (o lote inteiro ja' vai em `dados_anteriores`).
--   (b) o valor do rol em pt-BR, na forma da casa: translate(to_char(v,'FM999,999,999,990.00'), ',.', '.,') — o
--       'FM999G999G990D00' saia no locale do servidor ("R$ 228,400.00").
--   NADA MAIS MUDA NA REGRA: guardas (versao, motivo, acesso, saida ativa / adotada, titulo conciliado), rol, ordem dos
--   passos e retorno iguais. O UPDATE de `lote_id` nao dispara gatilho (os dois de `zoo_operacao_partes` sao por outras
--   colunas) e nao cruza indice unico (`zoo_operacao_partes_identidade_lote` so' vale com `lote_id` nao nulo).
-- PATCH GUARDADO POR md5 (origem, cada ancora 1x, destino); reexecutar sobre o corpo ja' corrigido nao faz nada.
--   oc_excluir_lote 8a61566dec2880806215f877e3354384 -> d9a07242f1698f595bd7bc3e1152c588
-- So' o corpo troca: ACL, SECURITY DEFINER e search_path preservados. Nenhum DDL em tabela, nenhum dado.

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION pg_temp._abate_projetado_01a_patch(p_nome text, p_origem text, p_destino text, p_pares text[])
 RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_src text; v_def text; v_novo text; i int; v_n int; v_acl text; v_sec boolean; v_cfg text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proacl::text, p.prosecdef, p.proconfig::text
    INTO STRICT v_src, v_def, v_acl, v_sec, v_cfg FROM pg_proc p
   WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) = p_destino THEN RETURN; END IF;   -- ja' aplicado
  IF md5(v_src) <> p_origem THEN
    RAISE EXCEPTION 'ABATE-PROJETADO-01a: % com corpo de origem inesperado (md5 %)', p_nome, md5(v_src); END IF;
  v_novo := v_src;
  FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
    v_n := (length(v_novo) - length(replace(v_novo, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'ABATE-PROJETADO-01a: %, ancora % casa % vez(es), nao 1', p_nome, i, v_n; END IF;
    v_novo := replace(v_novo, p_pares[2 * i - 1], p_pares[2 * i]);
  END LOOP;
  IF md5(v_novo) <> p_destino THEN
    RAISE EXCEPTION 'ABATE-PROJETADO-01a: % com corpo de destino inesperado (md5 %)', p_nome, md5(v_novo); END IF;
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'ABATE-PROJETADO-01a: %: corpo nao localizado na definicao', p_nome; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM p_destino
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_acl
     OR (SELECT p.prosecdef FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_sec
     OR (SELECT p.proconfig::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_cfg THEN
    RAISE EXCEPTION 'ABATE-PROJETADO-01a: %: destino, ACL, SECURITY ou search_path nao conferem depois da troca', p_nome; END IF;
END $patch$;

SELECT pg_temp._abate_projetado_01a_patch('oc_excluir_lote', '8a61566dec2880806215f877e3354384', 'd9a07242f1698f595bd7bc3e1152c588', ARRAY[
$a$  r record; v_nova int; v_acordado numeric; v_qtd_rest int; v_adot text; v_reg text;$a$,
$b$  r record; v_nova int; v_acordado numeric; v_qtd_rest int; v_adot text; v_reg text;
  v_partes jsonb := '[]'::jsonb; v_comps jsonb := '[]'::jsonb;   -- ABATE-PROJETADO-01a: o que solta o lote$b$,
$a$to_char(r.valor_total,'FM999G999G990D00')$a$,
$b$translate(to_char(r.valor_total,'FM999,999,999,990.00'), ',.', '.,')$b$,
$a$  DELETE FROM public.zoo_operacao_documento_lotes WHERE operacao_lote_id = p_lote_id;$a$,
$b$  -- ABATE-PROJETADO-01a: partes (vivas e canceladas) e compromissos ja' cancelados ainda apontam para o lote, e as duas FKs
  -- recusavam o DELETE (23503) depois de a simulacao dizer ok. Solta o `lote_id`; o evento guarda de qual lote vieram.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('parte_id', p.id, 'cancelada', p.cancelada) ORDER BY p.id), '[]'::jsonb)
    INTO v_partes FROM public.zoo_operacao_partes p WHERE p.lote_id = p_lote_id;
  UPDATE public.zoo_operacao_partes SET lote_id = NULL WHERE lote_id = p_lote_id;
  SELECT COALESCE(jsonb_agg(c.id ORDER BY c.id), '[]'::jsonb)
    INTO v_comps FROM public.zoo_operacao_compromissos c WHERE c.lote_id = p_lote_id;
  UPDATE public.zoo_operacao_compromissos SET lote_id = NULL WHERE lote_id = p_lote_id;
  DELETE FROM public.zoo_operacao_documento_lotes WHERE operacao_lote_id = p_lote_id;$b$,
$a$jsonb_build_object('motivo', btrim(p_motivo), 'rol', v_rol, 'versao_anterior'$a$,
$b$jsonb_build_object('motivo', btrim(p_motivo), 'rol', v_rol, 'lote_id', p_lote_id, 'partes_soltas', v_partes,
                             'compromissos_soltos', v_comps, 'versao_anterior'$b$]);
