-- PARC-LIVRES-01 (passo 2A) — PARCELAMENTO TEM UM ESCRITOR SO' DOS SEUS LANCAMENTOS (Gabriel, 06/10/2026).
--
-- O DEFEITO (NJ, contrato "Protocolo IATF", 06/10 23:29 UTC): editar a parcela pela tela do contrato chamava o motor do
-- financiamento (`fn_reconciliar_parcela_financiamento`). O lancamento que `fn_parcelamento_cadastrar` cria nasce com
-- `origem_lancamento` NULO; o motor so' reconhece 'parcela_financiamento', tratava o lancamento como "origem invalida",
-- CANCELAVA-o e CRIAVA outro: nome "Parcela i/N Descricao", status derivado da parcela (previsto se vencida), sem safra, sem
-- cultura/fase, sem forma de pagamento e sem os documentos (que ficaram no cancelado).
-- O CONSERTO: (1) o motor devolve `skip` para contrato de natureza 'parcelamento', antes de qualquer leitura ou escrita de
-- lancamento — financiamento e emprestimo: corpo identico; (2) `fn_financiamento_pagar_pelo_extrato` recusa parcela de
-- parcelamento com a frase (0 usos ate' hoje): ele trocava o valor da parcela pelo do extrato e dependia do motor.
-- NENHUM DADO E' ALTERADO AQUI: o reparo do contrato ja' desfigurado e' script a' parte, com OK do Gabriel.
-- PATCH GUARDADO POR md5: motor 7af8dbfbff7fe49a2e3f90f109296924 -> d8063b41bc6b64bef78ba0afa79d14ab; pagar pelo extrato 3a642f9f4ff0cbc2d0e4971f778d416a -> 34d5a1e89cbe9c25faab8213b85f8f45.
-- Assinatura, retorno, SECURITY, search_path e ACL nao mudam.

DO $mig$
DECLARE
  v_oid oid := 'public.fn_reconciliar_parcela_financiamento(uuid, boolean, boolean, uuid)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_a text[]; v_b text[];
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '7af8dbfbff7fe49a2e3f90f109296924' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 2A motor: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  -- ancora 1
  v_a := v_a || $a1$  -- PR-FIN-CPR-01 (1a): conta desejada = override do operador → fallback do contrato.
$a1$::text;
  v_b := v_b || $b1$  -- PARC-LIVRES-01 passo 2A (Gabriel, 06/10/2026): PARCELAMENTO TEM UM ESCRITOR SO' DOS SEUS LANCAMENTOS — quem os cria e'
  -- fn_parcelamento_cadastrar e quem os edita e' fn_parcelamento_editar_parcelas. Este motor (o do financiamento com juros) NAO
  -- escreve em lancamento de contrato de natureza 'parcelamento': ele nao reconhecia o lancamento nascido do cadastro
  -- (origem_lancamento nulo), CANCELAVA-o e criava outro sem safra, forma de pagamento e documento, com outro nome e outro status.
  IF v_contrato.natureza = 'parcelamento' THEN
    RETURN jsonb_build_object('skip','parcelamento_tem_escritor_proprio',
      'parcela_id',p_parcela_id,'financiamento_id',v_contrato.id);
  END IF;

  -- PR-FIN-CPR-01 (1a): conta desejada = override do operador → fallback do contrato.
$b1$::text;
  FOR i IN 1..array_length(v_a, 1) LOOP
    IF (length(v_src) - length(replace(v_src, v_a[i], ''))) / length(v_a[i]) <> 1 THEN
      RAISE EXCEPTION 'PARC-LIVRES-01 2A motor: a ancora % nao casa exatamente 1x', i;
    END IF;
    v_novo := replace(v_novo, v_a[i], v_b[i]);
  END LOOP;
  IF md5(v_novo) <> 'd8063b41bc6b64bef78ba0afa79d14ab' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 2A motor: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_reconciliar_parcela_financiamento(p_parcela_id uuid, p_dry_run boolean DEFAULT true, p_recalcula_vt boolean DEFAULT false, p_conta_bancaria_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> 'd8063b41bc6b64bef78ba0afa79d14ab' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 2A motor: ACL, SECURITY DEFINER, configuracao ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;

DO $mig$
DECLARE
  v_oid oid := 'public.fn_financiamento_pagar_pelo_extrato(uuid, uuid, boolean)'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_a text[]; v_b text[];
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '3a642f9f4ff0cbc2d0e4971f778d416a' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 2A pagar: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  -- ancora 1
  v_a := v_a || $a1$  SELECT * INTO f FROM financiamentos WHERE id = p.financiamento_id;
$a1$::text;
  v_b := v_b || $b1$  SELECT * INTO f FROM financiamentos WHERE id = p.financiamento_id;
  -- PARC-LIVRES-01 passo 2A: a parcela de PARCELAMENTO ja' tem o lancamento dela (nascido com a classificacao, a safra e o
  -- documento do cadastro). Este gesto trocaria o valor da parcela pelo do extrato e criaria outro lancamento pelo motor: recusa
  -- e diz o caminho. Financiamento com juros segue como era.
  IF f.natureza = 'parcelamento' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='Parcela de parcelamento se paga pelo lançamento dela: desfaça este lançamento do extrato e concilie o extrato com o lançamento da parcela. Nada foi gravado.';
  END IF;
$b1$::text;
  FOR i IN 1..array_length(v_a, 1) LOOP
    IF (length(v_src) - length(replace(v_src, v_a[i], ''))) / length(v_a[i]) <> 1 THEN
      RAISE EXCEPTION 'PARC-LIVRES-01 2A pagar: a ancora % nao casa exatamente 1x', i;
    END IF;
    v_novo := replace(v_novo, v_a[i], v_b[i]);
  END LOOP;
  IF md5(v_novo) <> '34d5a1e89cbe9c25faab8213b85f8f45' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 2A pagar: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_financiamento_pagar_pelo_extrato(p_lancamento_cru_id uuid, p_parcela_id uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> '34d5a1e89cbe9c25faab8213b85f8f45' THEN
    RAISE EXCEPTION 'PARC-LIVRES-01 2A pagar: ACL, SECURITY DEFINER, configuracao ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;
