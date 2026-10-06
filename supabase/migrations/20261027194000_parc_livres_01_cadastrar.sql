-- PARC-LIVRES-01 (passo 1) — parcelas com valor e vencimento LIVRES ao criar o parcelamento (Gabriel, 06/10/2026).
--
-- `fn_parcelamento_cadastrar(p_payload jsonb)` ganha a chave OPCIONAL `parcelas`: lista de {numero, data_vencimento, valor}.
--   · SEM a chave: o corpo de antes, identico (N parcelas iguais, mensais, a ultima com a sobra do arredondamento).
--   · COM a chave: grava EXATAMENTE a lista (parcela, lancamento programado e vencimento de cada uma) e RECUSA, com frase e sem
--     gravar nada (22023): lista vazia; `total_parcelas` diferente do tamanho da lista; numeracao que nao vai de 1 a N; data
--     vazia; valor zero, negativo ou com mais de duas casas; SOMA EM CENTAVOS diferente de `valor_total`.
--     `data_primeira_parcela` do contrato = o vencimento da parcela 1 da lista.
-- ⚠ DEFEITO ANTIGO CONSERTADO JUNTO: as quatro recusas que a funcao ja' tinha usavam `raise exception 'x' using ..., message='y'`,
--   que o PL/pgSQL recusa em tempo de execucao ("RAISE option already specified: MESSAGE", 42601) — a frase nunca chegou a' tela.
--   Passam a `raise exception using errcode, message` (mesmos codigos; frases em portugues legivel). So' muda o caminho de erro.
-- Caso que motivou: NJ, NF 000.000.518 (Somak), 110.000,00 em sete duplicatas — entrada de 33.000,00 e as demais a cada 28 dias.
-- PATCH GUARDADO POR md5 (origem 6bf9d80bb515574614f7460b441375a9, 7 ancoras exatamente 1x, destino 7d9874b07474ca8a88df77cabc5706df). Assinatura, retorno, SECURITY DEFINER,
-- search_path e ACL nao mudam.

DO $mig$
DECLARE
  v_oid oid := 'public.fn_parcelamento_cadastrar(jsonb)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_a text[]; v_b text[];
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '6bf9d80bb515574614f7460b441375a9' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  -- ancora 1
  v_a := v_a || $a1$  i             int;
begin
$a1$::text;
  v_b := v_b || $b1$  i             int;
  -- PARC-LIVRES-01: a lista OPCIONAL de parcelas livres [{numero, data_vencimento, valor}]
  v_parc        jsonb := p_payload->'parcelas';
  v_livre       boolean := false;
  v_soma_cent   bigint;
begin
$b1$::text;
  -- ancora 2
  v_a := v_a || $a2$  if v_n < 1 or v_total_val is null or v_total_val <= 0 then
$a2$::text;
  v_b := v_b || $b2$  -- PARC-LIVRES-01 (Gabriel, 06/10/2026): COM a chave `parcelas` a funcao grava EXATAMENTE a lista — o sistema nao fixa dia nem
  -- valor de parcela — e RECUSA, sem gravar nada, lista vazia, numeracao repetida ou faltando, valor zero/negativo ou com mais
  -- de duas casas, data vazia e SOMA EM CENTAVOS diferente do valor total (nunca arredonda nem engole diferenca). SEM a chave,
  -- o corpo segue como era: N parcelas iguais, mensais, a ultima com a sobra.
  v_livre := v_parc is not null and jsonb_typeof(v_parc) <> 'null';
  if v_livre then
    if jsonb_typeof(v_parc) <> 'array' or jsonb_array_length(v_parc) < 1 then
      raise exception using errcode='22023', message='Informe ao menos uma parcela.';
    end if;
    if v_n is not null and v_n <> jsonb_array_length(v_parc) then
      raise exception using errcode='22023',
        message=format('O número de parcelas (%s) não bate com a lista (%s).', v_n, jsonb_array_length(v_parc));
    end if;
    v_n := jsonb_array_length(v_parc);
    if exists (select 1 from jsonb_array_elements(v_parc) e where coalesce(e->>'numero','') !~ '^[0-9]+$')
       or (select array_agg((e->>'numero')::int order by (e->>'numero')::int) from jsonb_array_elements(v_parc) e)
          is distinct from (select array_agg(g) from generate_series(1, v_n) g) then
      raise exception using errcode='22023',
        message=format('A numeração das parcelas tem de ir de 1 a %s, sem repetir nem pular.', v_n);
    end if;
    if exists (select 1 from jsonb_array_elements(v_parc) e where coalesce(e->>'data_vencimento','') = '') then
      raise exception using errcode='22023', message='Há parcela sem data de vencimento.';
    end if;
    if exists (select 1 from jsonb_array_elements(v_parc) e
                where coalesce(e->>'valor','') = '' or (e->>'valor')::numeric <= 0) then
      raise exception using errcode='22023', message='Há parcela com valor zero ou negativo.';
    end if;
    if exists (select 1 from jsonb_array_elements(v_parc) e where (e->>'valor')::numeric <> round((e->>'valor')::numeric, 2)) then
      raise exception using errcode='22023', message='Valor de parcela com mais de duas casas decimais.';
    end if;
    select sum(round((e->>'valor')::numeric * 100))::bigint into v_soma_cent from jsonb_array_elements(v_parc) e;
    if v_total_val is null or v_soma_cent <> round(v_total_val * 100)::bigint then
      raise exception using errcode='22023',
        message=format('A soma das parcelas (R$ %s) não fecha com o valor da compra (R$ %s). Nada foi gravado.',
                       translate(to_char(v_soma_cent / 100.0, 'FM999,999,999,990.00'), ',.', '.,'),
                       translate(to_char(coalesce(v_total_val, 0), 'FM999,999,999,990.00'), ',.', '.,'));
    end if;
    -- a "1a parcela" do contrato e' o vencimento da parcela 1 da lista
    v_primeira := (select (e->>'data_vencimento')::date from jsonb_array_elements(v_parc) e where (e->>'numero')::int = 1);
  end if;
  if v_n < 1 or v_total_val is null or v_total_val <= 0 then
$b2$::text;
  -- ancora 3
  v_a := v_a || $a3$    v_venc := v_primeira + make_interval(months => (i-1) * v_intervalo);
    v_val_i := case when i = v_n then v_total_val - v_val_base * (v_n - 1) else v_val_base end;
$a3$::text;
  v_b := v_b || $b3$    if v_livre then
      select (e->>'data_vencimento')::date, (e->>'valor')::numeric into v_venc, v_val_i
        from jsonb_array_elements(v_parc) e where (e->>'numero')::int = i;
    else
    v_venc := v_primeira + make_interval(months => (i-1) * v_intervalo);
    v_val_i := case when i = v_n then v_total_val - v_val_base * (v_n - 1) else v_val_base end;
    end if;
$b3$::text;
  -- ancora 4
  v_a := v_a || $a4$    raise exception 'sem acesso ao cliente' using errcode='42501', message='Sem acesso ao cliente informado';
$a4$::text;
  v_b := v_b || $b4$    raise exception using errcode='42501', message='Sem acesso ao cliente informado';
$b4$::text;
  -- ancora 5
  v_a := v_a || $a5$    raise exception 'parametros invalidos' using errcode='22023', message='total_parcelas e valor_total obrigatorios';
$a5$::text;
  v_b := v_b || $b5$    raise exception using errcode='22023', message='Informe o valor total e o número de parcelas.';
$b5$::text;
  -- ancora 6
  v_a := v_a || $a6$    raise exception 'parametros invalidos' using errcode='22023', message='plano, fazenda, competencia e primeira parcela obrigatorios';
$a6$::text;
  v_b := v_b || $b6$    raise exception using errcode='22023', message='Informe a classificação, a fazenda, a competência e o vencimento da 1ª parcela.';
$b6$::text;
  -- ancora 7
  v_a := v_a || $a7$    raise exception 'tipo_operacao invalido' using errcode='22023', message='tipo_operacao deve comecar com 1- ou 2-';
$a7$::text;
  v_b := v_b || $b7$    raise exception using errcode='22023', message='Tipo de operação inválido: deve ser entrada (1-) ou saída (2-).';
$b7$::text;
  FOR i IN 1..array_length(v_a, 1) LOOP
    IF (length(v_src) - length(replace(v_src, v_a[i], ''))) / length(v_a[i]) <> 1 THEN
      RAISE EXCEPTION 'PARC-LIVRES-01: a ancora % nao casa exatamente 1x', i;
    END IF;
    v_novo := replace(v_novo, v_a[i], v_b[i]);
  END LOOP;
  IF md5(v_novo) <> '7d9874b07474ca8a88df77cabc5706df' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_parcelamento_cadastrar(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> '7d9874b07474ca8a88df77cabc5706df' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01: ACL, SECURITY DEFINER, configuracao ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;
