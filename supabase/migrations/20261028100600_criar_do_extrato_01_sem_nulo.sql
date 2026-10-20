-- CRIAR-DO-EXTRATO-01 (Gabriel, 20/10/2026) — PARTE C, antes da trava: as três funções que podiam GRAVAR vencimento nulo num
-- lançamento vivo deixam de poder. (A trava vem na 20261028100610.)
--
--   · fn_reconciliar_parcela_financiamento — o ajuste do vencimento da parcela (`NULLIF(v_depois,'')`): valor novo vazio MANTÉM o
--       vencimento que a linha já tem; sem ele, a data da parcela; sem ela (34 parcelas sem vencimento em 20/10), a competência.
--   · fn_extrato_desfazer_arquivo — o desfazer do "OFX substituiu" restaura a foto do audit_log: lançamento VIVO cuja foto tinha
--       vencimento nulo volta com pagamento > competência (os da foto; sem eles, a competência da linha). CANCELADO restaura como estava.
--   · _fn_lancamento_programado_gravar (escritor do Lucro Rural: `_fn_lr_sync_aplicar_exec` e `_fn_lr_sync_desfazer_exec`) —
--       vencimento vazio é RECUSADO com a frase do modal, "Informe o vencimento.", no criar e no atualizar que o traz.
--
-- COMO: o mesmo da 20261028100500 — cada função reescrita da PRÓPRIA definição viva, trocando só o trecho; cada trecho tem de
-- aparecer exatamente UMA vez (senão aborta e nada muda); troca já feita é pulada. `CREATE OR REPLACE` mantém dono e GRANTs.

create or replace function pg_temp.trocar(p_fn regprocedure, p_trocas text[][]) returns void
language plpgsql as $f$
declare d text := pg_get_functiondef(p_fn); i int; a text; b text; n int;
begin
  for i in 1 .. array_length(p_trocas, 1) loop
    a := p_trocas[i][1]; b := p_trocas[i][2];
    if position(b in d) > 0 then continue; end if;          -- já trocado
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    if n <> 1 then
      raise exception 'CRIAR-DO-EXTRATO-01: % — trecho % achado % vez(es) (esperado 1)', p_fn, i, n;
    end if;
    d := replace(d, a, b);
  end loop;
  execute d;
end $f$;

select pg_temp.trocar('public.fn_reconciliar_parcela_financiamento(uuid, boolean, boolean, uuid)'::regprocedure, array[
  array['UPDATE financeiro_lancamentos_v2 SET data_vencimento = NULLIF(v_depois,'''')::date,',
        'UPDATE financeiro_lancamentos_v2 SET data_vencimento = COALESCE(NULLIF(v_depois,'''')::date, data_vencimento, v_parcela.data_vencimento, data_competencia),']
]);

select pg_temp.trocar('public.fn_extrato_desfazer_arquivo(uuid, text, boolean)'::regprocedure, array[
  array['data_vencimento = (v_aud->>''data_vencimento'')::date,',
        'data_vencimento = CASE WHEN COALESCE(cancelado, false) THEN (v_aud->>''data_vencimento'')::date
                     ELSE COALESCE((v_aud->>''data_vencimento'')::date, (v_aud->>''data_pagamento'')::date, (v_aud->>''data_competencia'')::date, data_competencia) END,']
]);

select pg_temp.trocar('public._fn_lancamento_programado_gravar(text, uuid, jsonb)'::regprocedure, array[
  array['BEGIN
  IF p_op = ''criar'' THEN',
        'BEGIN
  -- CRIAR-DO-EXTRATO-01: vencimento vazio nao grava (a frase do modal)
  IF (p_op = ''criar'' OR p_campos ? ''data_vencimento'')
     AND nullif(btrim(coalesce(p_campos ->> ''data_vencimento'', '''')), '''') IS NULL THEN
    RAISE EXCEPTION ''Informe o vencimento.'' USING ERRCODE = ''P0001'';
  END IF;
  IF p_op = ''criar'' THEN']
]);
