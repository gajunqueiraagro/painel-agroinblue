-- FIN-CONCIL-PORTAR-01 — fn_sugestoes_extrato, PRIMEIRA aplicacao.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO E JA SUPERADO. Registro 20260831174332,
-- substituido por 20260831174734, que acrescentou o `where not vencido limit 1`
-- no LATERAL — como no original. Sem ele, um vencido de outro mes viraria "a
-- melhor sugestao" do movimento, porque ele vem primeiro no `order by` da
-- funcao de candidatos.
--
-- ⚠ CORPO NAO PROVADO POR ORACULO: o objeto nao existe mais. Mesmo criterio da
-- 174107 — o registro fica, a definicao vigente e' a da 174734.

do $$ begin
  raise notice 'fin_concil_fn_sugestoes_01 (174332): superada por 20260831174734 (where not vencido). Sem efeito.';
end $$;
