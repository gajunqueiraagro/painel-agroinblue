-- VINCULAR-FIX-01c — o vincular NAO julga repeticao (decisao do Gabriel, 26/09/2026 05:38), e a janela do boitel
-- deixa de EXCLUIR o que vem antes do inicio.
--
-- ⚠ REGRA PERMANENTE: vincular nao mexe em valor, pagamento nem conciliacao — so' da' uma OC a um lancamento
--   orfao. O operador vincula quantos quiser (5, 10, 20 Fundersul/Iagro/frete iguais numa OC). Nada de aviso,
--   nada de confirmacao extra: sem compromisso livre do item, "criar item" e' acao NEUTRA.
--
-- 1. SAI O AVISO `componente_ja_liquidado` do 01b ("Ja existe ... liquidado nesta OC; este e outro pagamento"):
--    o bloco volta a ser exatamente o de antes do 01b. O resto do 01b FICA — contar so' compromisso livre, o
--    `p_criar_novo` respeitado com varios livres, e a lista de escolha com "criar item".
-- 2. A UNICA RECUSA de compromisso continua sendo a DIRECAO do plano dele (e a OC cancelada/rascunho, que nem
--    entra na lista). Direcao recusa o COMPROMISSO, nunca a OC: a OC sem compromisso na direcao do lancamento
--    segue candidata, com "criar item".
-- 3. JANELA DO BOITEL: antes do inicio, a distancia e' ate' o inicio — NAO fica de fora. ⚠ ERA REGRESSAO,
--    medida numa varredura de 45 lancamentos reais de 6 clientes contra as funcoes de ANTES do FIX-01 (reconstruidas
--    em rollback pelo patch reverso, md5 c6885a66 conferido): sumiram 4 pares, todos de boitel — `3b2cd648` e
--    `ed4488e1` (Vera, vendas de desmama em 04/05/2026) perderam b58bf556 e 7f7de76f, cujo inicio (a data da OC,
--    13-14/05) vinha 9 dias DEPOIS. A regra velha os mostrava a 9 dias; o 01b os cortava por "antes do envio".
--
-- ⚠ PATCH GUARDADO POR md5 sobre o corpo do 01b (9e06563f). Reexecutar FALHA na guarda de origem.
--   ⚠ REGISTRADA como `20260926085107` pelo apply_migration (timestamp do dia), nao com o do nome.
--
-- VARREDURA (26/09/2026): 45 lancamentos reais de 6 clientes; candidatas das funcoes de antes do FIX-01 (patch reverso
-- em rollback, md5 c6885a66 conferido) x depois. Com o 01b: 84 x 83 pares, 4 sumidos (os de boitel acima). Com este:
-- 84 x 87, ZERO sumidos. O frete 37a2f86a devolve os mesmos 4 abates da BMG antes e depois — como `postgres` e como
-- `authenticated` com o usuario do Gabriel —, entao a lista vazia relatada NAO se reproduziu aqui.
-- PROVAS EM ROLLBACK: tres iguais na f93f1a2b -> tres vinculos, `avisos = []`; direcao ainda recusa o compromisso de
-- saida 6b349b87 num lancamento de entrada, e a OC c80ebe9e segue candidata.

CREATE OR REPLACE FUNCTION public._oc_vinculo_dist_janela(p_data date, p_ini date, p_fim date)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Distancia de uma data a uma janela [ini, fim]: 0 dentro, dias ate' o inicio antes dela, dias depois do fim.
  -- VINCULAR-FIX-01c: antes do inicio NAO e' "fora" — a janela de dias decide, como na regra de antes.
  SELECT CASE WHEN p_data IS NULL OR p_ini IS NULL THEN NULL
              WHEN p_data < p_ini THEN p_ini - p_data
              WHEN p_data <= coalesce(p_fim, p_ini) THEN 0
              ELSE p_data - coalesce(p_fim, p_ini) END;
$function$;

DO $patch$
DECLARE
  v_oid oid; v_src text; v_def text; v_novo text; v_n int;
  v_ancora text := $a1$  -- VINCULAR-FIX-01b (c): compromisso CRIADO agora ao lado de outro do mesmo componente ja' pago — nao e'
  -- repeticao, e' outro pagamento (regra da pecuaria). O aviso so' diz, para o operador confirmar.
  IF v_comp_antes IS NULL THEN
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'valor_total', c.valor_total, 'descricao', c.descricao) ORDER BY c.created_at)
      INTO v_lista
      FROM public.zoo_operacao_compromissos c
     WHERE c.operacao_id = p_operacao_id AND c.natureza = v_natureza AND c.componente = v_componente
       AND c.status <> 'cancelado' AND c.id <> v_comp.id AND public._oc_vinculo_compromisso_liquidado(c.id);
    IF v_lista IS NOT NULL THEN
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object('codigo', 'componente_ja_liquidado',
        'componente', v_componente, 'compromissos', v_lista));
    END IF;
  END IF;
  IF v_natureza = 'principal' THEN
    SELECT b.base INTO v_base$a1$;
  v_troca text := $t1$  IF v_natureza = 'principal' THEN
    SELECT b.base INTO v_base$t1$;
BEGIN
  SELECT p.oid, p.prosrc INTO v_oid, v_src FROM pg_proc p WHERE p.proname = 'oc_vincular_lancamento';
  IF md5(v_src) <> '9e06563f1ae4486ad60c49c61d38078a' THEN
    RAISE EXCEPTION 'oc_vincular_lancamento: md5 de origem % nao e o esperado', md5(v_src); END IF;
  v_n := (length(v_src) - length(replace(v_src, v_ancora, ''))) / length(v_ancora);
  IF v_n <> 1 THEN RAISE EXCEPTION 'oc_vincular_lancamento: ancora casa % vezes', v_n; END IF;
  v_novo := replace(v_src, v_ancora, v_troca);
  v_def := replace(pg_get_functiondef(v_oid), v_ancora, v_troca);
  EXECUTE v_def;
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = v_oid;
  IF v_src IS DISTINCT FROM v_novo OR md5(v_src) <> 'e40fe082bb45fc6cce296f7168539a0f' THEN
    RAISE EXCEPTION 'oc_vincular_lancamento: md5 de destino % nao e o esperado (igual ao patch: %)', md5(v_src), v_src IS NOT DISTINCT FROM v_novo; END IF;
END $patch$;
