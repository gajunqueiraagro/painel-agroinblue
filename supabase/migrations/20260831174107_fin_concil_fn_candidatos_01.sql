-- FIN-CONCIL-PORTAR-01 — fn_candidatos_conciliacao, PRIMEIRA aplicacao.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO E JA SUPERADO. Registro 20260831174107,
-- substituido no mesmo dia por 20260831174716 (a janela-mes do Gabriel e o
-- `cb.nome_conta`). Este arquivo existe porque o REGISTRO tem as duas linhas:
-- sem ele, a lista local diverge da remota e o proximo `db push` nao fecha.
--
-- ⚠ CORPO NAO PROVADO POR ORACULO, e a limitacao esta declarada: o objeto que
-- este arquivo criou nao existe mais. Ele e' o corpo da 174716 SEM as duas
-- correcoes que ela trouxe — a janela-mes (nas duas ocorrencias) e o
-- `cb.nome_conta` no lugar de `cb.nome`, que era o 400 desta aqui.
-- APLICAR ESTE ARQUIVO ISOLADAMENTE REPRODUZ O DEFEITO, e e' o esperado: a
-- 174716 vem logo depois. Ver o cabecalho dela para o corpo vigente.
--
-- Nao ha SQL aqui de proposito: reconstruir um corpo que ninguem pode conferir
-- seria dar aparencia de fato a uma suposicao. O registro fica; a definicao
-- vigente e' a da 174716.

do $$ begin
  raise notice 'fin_concil_fn_candidatos_01: superada por 20260831174716 (janela-mes + nome_conta). Sem efeito.';
end $$;
