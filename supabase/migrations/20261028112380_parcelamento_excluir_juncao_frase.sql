-- P96a (Gabriel 26/10/2026) — a recusa do CANCELAR A COMPRA juntada diz o CAMINHO: "Esta compra junta N lançamentos (X pagos). Para
-- excluir, primeiro use "Desfazer a junção"." (a 112370 dizia só 'use "Desfazer a junção"'). Patch guardado por md5 da função no ar.
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

SELECT pg_temp._troca_texto('public.fn_parcelamento_excluir(uuid,text,boolean)', 'c3070f504d94e2644119bbde59c40bcc', ARRAY[
  $p$  if f.juncao_original is not null then
    if not coalesce(p_simular, false) then
      raise exception using errcode = '22023', message = 'Esta compra foi juntada de lançamentos soltos: use "Desfazer a junção" (os lançamentos ficam). Nada foi gravado.';
    end if;
    return jsonb_build_object('ok', false, 'financiamento_id', f.id, 'simulado', true,
      'contrato', jsonb_build_object('id', f.id, 'descricao', f.descricao), 'lancamentos', 0, 'parcelas', 0,
      'recusa', jsonb_build_object('motivo', 'juncao', 'frase', 'Esta compra foi juntada de lançamentos soltos: use "Desfazer a junção" (os lançamentos ficam).'));
  end if;
$p$,
  $r$  if f.juncao_original is not null then
    /* P96a — a frase diz o caminho: quantos a compra junta, quantos já pagos, e o "Desfazer a junção" antes de excluir */
    select count(*), count(*) filter (where public._fn_parcela_de_parcelamento_paga(q.status, q.lancamento_id))
      into v_parc, v_lanc
      from public.financiamento_parcelas q
     where q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado';
    v_recusa := jsonb_build_object('motivo', 'juncao', 'frase', format('Esta compra junta %s lançamentos (%s). Para excluir, primeiro use "Desfazer a junção".',
      v_parc, case v_lanc when 0 then 'nenhum pago' when 1 then '1 pago' else v_lanc || ' pagos' end));
    if not coalesce(p_simular, false) then
      raise exception using errcode = '22023', message = (v_recusa->>'frase') || ' Nada foi gravado.';
    end if;
    return jsonb_build_object('ok', false, 'financiamento_id', f.id, 'simulado', true,
      'contrato', jsonb_build_object('id', f.id, 'descricao', f.descricao), 'lancamentos', 0, 'parcelas', 0, 'recusa', v_recusa);
  end if;
$r$, '1']);
