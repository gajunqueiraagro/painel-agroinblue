-- FIN-CLASSIF-DIVIDIDA-01a-2 — parte 2: os leitores do banco que SOMAM por classificacao passam a ler a visao unica (1 linha por parte):
-- DRE pecuaria (+ o "abrir a linha"), DRE lavoura, DRE agricola por safra, pendencias do DRE, painel de safra (+ comparativo), rateio
-- administrativo (mes e detalhe). Troca exata no corpo vivo (guardada por md5 e pela contagem): FROM/JOIN financeiro_lancamentos_v2 ->
-- vw_fin_classificacao_por_parte. Sem lancamento dividido, o resultado e' identico ao centavo (prova no ensaio, todos os clientes).
CREATE OR REPLACE FUNCTION pg_temp._troca_leitura(p_fn regprocedure, p_md5 text, p_n int)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  n := (SELECT count(*) FROM regexp_matches(d, '(FROM|JOIN)(\s+)(public\.)?financeiro_lancamentos_v2\M', 'gi'));
  IF n <> p_n THEN RAISE EXCEPTION '%: % leituras, esperado %', p_fn, n, p_n; END IF;
  EXECUTE regexp_replace(d, '(FROM|JOIN)(\s+)(public\.)?financeiro_lancamentos_v2\M', '\1\2public.vw_fin_classificacao_por_parte', 'gi');
END $$;

SELECT pg_temp._troca_leitura('public.fn_dre_pecuaria(uuid,text,text,text)', '7a3a2a3c8abb48626c1834ebf98ee0b7', 5);
SELECT pg_temp._troca_leitura('public.fn_dre_pecuaria_lancamentos(uuid,uuid,text,text,text,text,text)', 'cd20d2af929f7ac58bcfa531198c4ed0', 1);
SELECT pg_temp._troca_leitura('public.fn_dre_lavoura(uuid,uuid)', 'f0cd67e3b9ec2db2c4d83974312f70a3', 1);
SELECT pg_temp._troca_leitura('public.fn_dre_agricola_por_safra(uuid,uuid)', 'c801cb6558c18157b6e9626760abb5a5', 1);
SELECT pg_temp._troca_leitura('public.fn_dre_sem_classificacao(uuid,text,text,uuid,uuid,text)', '28d46193a131a0d5a385c65ec87f8c1a', 1);
SELECT pg_temp._troca_leitura('public.fn_painel_safra(uuid,uuid,text)', '6f00e5816cabc092140a4018ca76eda5', 3);
SELECT pg_temp._troca_leitura('public.fn_painel_safra_comparativo(uuid,text)', '38f38539e1eca8557e98ff10feffea93', 1);
SELECT pg_temp._troca_leitura('public.fn_painel_rateio_detalhe(uuid,uuid,text,text,text,text,text,text,text)', 'd8f4b2e81f5856f1b6b5160caf58f66f', 1);
SELECT pg_temp._troca_leitura('public.fn_rateio_admin_mes(uuid,text,text,text,uuid)', 'cc47ac43f524b4170214a682c71e90b3', 2);
