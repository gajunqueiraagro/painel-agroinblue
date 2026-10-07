-- PARC-FECHA-02 (item 2) — A SITUACAO DOS CONTRATOS DE UM CLIENTE, EM LOTE, PELO MESMO DONO (Gabriel, 06/10/2026).
--
-- O DEFEITO: a lista "Parcelamentos e Financiamentos" e os paineis de endividamento liam `financiamento_parcelas.status`, que
-- ninguem atualiza quando a parcela e' paga pelo Financeiro. No NJ a lista dizia saldo devedor 110.000,00 no "Reboque Agrícola"
-- e 35.700,00 no "Lascas Eucalipto Tratado"; os contratos, pela leitura nova, 25.666,66 e 17.850,00 a vencer.
-- O CONSERTO: `fn_financiamentos_situacao_lote(cliente, hoje)` devolve `{ <financiamento_id>: <o retorno de
-- fn_financiamento_situacao> }` para TODO contrato do cliente. NAO REPETE A REGRA: chama o dono contrato a contrato — a
-- situacao de uma parcela na lista e' a MESMA do contrato, por construcao. Uma chamada por tela, nunca uma por linha.
-- So' leitura; SECURITY DEFINER com `tenant_ok` e 42501; EXECUTE para `authenticated` (funcao nova nasce fechada).
-- Nenhuma coluna e' apagada nem escrita.

CREATE OR REPLACE FUNCTION public.fn_financiamentos_situacao_lote(p_cliente_id uuid, p_hoje date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return coalesce((
    select jsonb_object_agg(f.id::text, public.fn_financiamento_situacao(f.id, p_hoje))
      from public.financiamentos f
     where f.cliente_id = p_cliente_id
  ), '{}'::jsonb);
end
$function$;
REVOKE ALL ON FUNCTION public.fn_financiamentos_situacao_lote(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financiamentos_situacao_lote(uuid, date) TO authenticated, service_role;
