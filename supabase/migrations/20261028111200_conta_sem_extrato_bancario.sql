-- CONC-TRANSF-DUAS-PONTAS-01b (Gabriel 22/10/2026 09h41) — a marca "conta sem extrato bancario" no cadastro da conta. Investimento,
-- CDB/LCA/VGBL, poupanca, capital social, cartao, caixa, permuta: a conta nunca tera' extrato do banco, e a ponta da transferencia nela
-- deixa de ser exigida — a transferencia fica "conciliada" quando a ponta da conta COM extrato esta' ligada, e a Conferencia nao diz mais
-- "falta o …". So' a leitura das pontas muda: nenhum vinculo e' criado ou desfeito. A marca e' editavel no cadastro e nasce desligada
-- (marcar so' com o OK do Gabriel, conta a conta).

ALTER TABLE public.financeiro_contas_bancarias ADD COLUMN IF NOT EXISTS sem_extrato_bancario boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.financeiro_contas_bancarias.sem_extrato_bancario IS
  'Conta sem extrato do banco (investimento, cartao, caixa): a ponta de transferencia nela nao e'' exigida na conciliacao.';

CREATE OR REPLACE FUNCTION public._fn_conc_transf_pontas(p_lanc uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN NOT public._fn_conc_eh_transf(p_lanc) THEN NULL ELSE (
    SELECT jsonb_build_object(
      'origem', ol OR od, 'destino', dl OR dd, 'origem_sem_extrato', od, 'destino_sem_extrato', dd,
      'frase', CASE
        WHEN od AND dd THEN 'as duas contas são sem extrato bancário'
        WHEN (ol OR od) AND (dl OR dd) THEN
          CASE WHEN od THEN format('conciliado no %s (%s sem extrato bancário)', no_, no_o)
               WHEN dd THEN format('conciliado no %s (%s sem extrato bancário)', no_o, no_)
               ELSE 'conciliado nas duas pontas' END
        WHEN ol THEN format('conciliado no %s · falta o %s', no_o, no_)
        WHEN dl THEN format('conciliado no %s · falta o %s', no_, no_o)
        WHEN od THEN format('falta o %s (%s sem extrato bancário)', no_, no_o)
        WHEN dd THEN format('falta o %s (%s sem extrato bancário)', no_o, no_)
        ELSE format('falta conciliar no %s e no %s', no_o, no_) END)
      FROM financeiro_lancamentos_v2 l,
           LATERAL (SELECT public._fn_conc_ligado_na_conta(l.id, l.conta_bancaria_id) AS ol,
                           public._fn_conc_ligado_na_conta(l.id, l.conta_destino_id) AS dl,
                           coalesce((SELECT c.sem_extrato_bancario FROM financeiro_contas_bancarias c WHERE c.id = l.conta_bancaria_id), false) AS od,
                           coalesce((SELECT c.sem_extrato_bancario FROM financeiro_contas_bancarias c WHERE c.id = l.conta_destino_id), false) AS dd,
                           public._fn_conc_conta_txt(l.conta_bancaria_id) AS no_o,
                           public._fn_conc_conta_txt(l.conta_destino_id) AS no_) x
     WHERE l.id = p_lanc) END
$$;
REVOKE ALL ON FUNCTION public._fn_conc_transf_pontas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_conc_transf_pontas(uuid) TO authenticated;
