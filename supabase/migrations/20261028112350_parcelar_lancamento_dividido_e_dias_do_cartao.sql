-- P74 (NOTA-CARTAO-PARCELADO-01, Gabriel 23/10/2026; decisoes de 24/10) — duas pecas do banco:
-- (1) `fn_parcelamento_a_partir_do_lancamento` (o "Atualizar e parcelar" da nota e o "Parcelar este lancamento" do Editar): o
--     lancamento DIVIDIDO vira a 1/N e as N parcelas levam AS MESMAS PARTES NA MESMA PROPORCAO, na MESMA transacao. Medido na FASE 0:
--     a 1/N ficava dividida e as 2..N nasciam com uma conta so'. Agora, depois das parcelas, as partes do lancamento (por percentual)
--     vao para o cadastro pela `fn_financiamento_dividir_classificacao` — a mesma do 01b/01c, que divide TODAS as parcelas e grava
--     `classificacao_partes` no cadastro. Lancamento nao dividido: nada muda.
-- (2) `fn_cartao_dias_de_vencimento`: os dias do mes em que vencem os lancamentos nao cancelados de UM cartao num periodo (quantos e o
--     ultimo) — a 1a fatura sugerida e' o dia MAIS FREQUENTE dos ultimos 12 meses (empate: o mais recente), escolhido na tela.
--     SECURITY INVOKER: a RLS por tenant (ACESSOS-01) filtra; nasce fechada para PUBLIC/anon.
-- Patch do corpo vivo guardado pelo md5, por TEXTO literal (cada trecho com a contagem exata).
CREATE OR REPLACE FUNCTION pg_temp._troca_texto(p_fn regprocedure, p_md5 text, p_pares text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); i int; n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  FOR i IN 1..array_length(p_pares, 1) / 3 LOOP
    n := (length(d) - length(replace(d, p_pares[3*i-2], ''))) / length(p_pares[3*i-2]);
    IF n <> p_pares[3*i]::int THEN RAISE EXCEPTION '% trecho %: % ocorrencias, esperado %', p_fn, i, n, p_pares[3*i]; END IF;
    d := replace(d, p_pares[3*i-2], p_pares[3*i-1]);
  END LOOP;
  EXECUTE d;
END $$;

SELECT pg_temp._troca_texto('public.fn_parcelamento_a_partir_do_lancamento(uuid,jsonb,boolean)', 'a4825098510fa2e3d28fc12c0b8d47a9', ARRAY[
  $p$  v_ret         jsonb;$p$,
  $r$  v_ret         jsonb;
  v_partes      jsonb;$r$, '1',
  $p$    perform public._fn_financiamento_status_pelas_parcelas(v_fin_id);
$p$,
  $r$    perform public._fn_financiamento_status_pelas_parcelas(v_fin_id);

    /* P74 — A CLASSIFICACAO DIVIDIDA VAI PARA AS N, na mesma transacao: as partes do lancamento, por percentual, no cadastro
       (a mesma funcao do 01b/01c divide todas as parcelas e grava `classificacao_partes`). Sem divisao, nada muda. */
    if l.classificacao_dividida then
      select jsonb_agg(jsonb_build_object('plano_conta_id', p.plano_conta_id, 'percentual', p.percentual, 'safra_id', p.safra_id,
               'cultura', p.cultura, 'fase', p.fase) order by p.ordem)
        into v_partes from public.financeiro_lancamento_partes p where p.lancamento_id = p_lancamento;
      if jsonb_array_length(coalesce(v_partes, '[]'::jsonb)) >= 2 then
        perform public.fn_financiamento_dividir_classificacao(v_fin_id, v_partes, 'parcelado a partir do lançamento dividido', false);
      end if;
    end if;
$r$, '1']);

CREATE OR REPLACE FUNCTION public.fn_cartao_dias_de_vencimento(p_conta uuid, p_desde date, p_ate date)
RETURNS TABLE(dia int, lancamentos int, ultimo date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT extract(day FROM l.data_vencimento)::int, count(*)::int, max(l.data_vencimento)
    FROM public.financeiro_lancamentos_v2 l
    JOIN public.financeiro_contas_bancarias c ON c.id = l.conta_bancaria_id AND c.tipo_conta = 'cartao'
   WHERE l.conta_bancaria_id = p_conta AND l.cancelado IS NOT TRUE AND l.data_vencimento BETWEEN p_desde AND p_ate
   GROUP BY 1
$$;
REVOKE ALL ON FUNCTION public.fn_cartao_dias_de_vencimento(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cartao_dias_de_vencimento(uuid, date, date) TO authenticated;
