-- 20260630_pr_f_reverter_desconsideracao.sql
-- PR F (problema A) — reverter a desconsideração de um extrato.
--
-- Causa-raiz: a ação "Ignorar" faz UPDATE direto em extrato_bancario_v2.status='ignorado'
-- sem tocar o CBI; a Auditoria soberana joga 'ignorado' no bucket "Desconsiderados" sem
-- caminho de volta. Esta RPC recalcula o status a partir do CBI ativo (único UPDATE em
-- extrato_bancario_v2.status). NÃO desfaz vínculo, NÃO cria lançamento, NÃO toca o índice
-- único nem reconcilia — escopo é só o problema A (reverter o status preso).
--
-- Validada em BEGIN/ROLLBACK (T1 caso real 3075f236 -> 'conciliado'; T2 sem CBI ->
-- 'nao_conciliado'; T3 status != ignorado -> RAISE). Forward-only (repo não usa par *_down).

CREATE OR REPLACE FUNCTION fn_reverter_desconsideracao_extrato(p_extrato_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ext     record;
  v_alvo    text;
  v_tem_cbi boolean;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'extrato % nao encontrado', p_extrato_id;
  END IF;

  IF v_ext.status IS DISTINCT FROM 'ignorado' THEN
    RAISE EXCEPTION 'extrato % nao esta desconsiderado (status atual: %)',
      p_extrato_id, v_ext.status;
  END IF;

  v_tem_cbi := EXISTS(
    SELECT 1 FROM conciliacao_bancaria_itens
    WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL
  );

  v_alvo := CASE WHEN v_tem_cbi THEN 'conciliado' ELSE 'nao_conciliado' END;

  UPDATE extrato_bancario_v2 SET status = v_alvo WHERE id = p_extrato_id;

  RETURN v_alvo;
END
$fn$;

GRANT EXECUTE ON FUNCTION fn_reverter_desconsideracao_extrato(uuid) TO authenticated;
