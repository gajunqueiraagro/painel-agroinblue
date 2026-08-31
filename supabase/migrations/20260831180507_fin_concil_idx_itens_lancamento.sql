-- FIN-CONCIL-PORTAR-01 — o indice do outro lado do motor.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831180507.
--
-- POR QUE ELE EXISTE. `fn_candidatos_conciliacao` calcula `ja_conciliado` e
-- `saldo` por candidato com um LEFT JOIN LATERAL sobre
-- `conciliacao_bancaria_itens` — uma vez por lancamento do pool, e o pool tem
-- centenas. O predicado e' sempre o mesmo par: `lancamento_id = ?` com
-- `desfeito_em is null`.
--
-- ⚠ JA HAVIA UM INDICE EM `lancamento_id` (idx_conciliacao_itens_lancamento), e
-- ele NAO e' o mesmo: aquele guarda TUDO, inclusive os vinculos desfeitos —
-- medido, 647 de 3.407 estao desfeitos. Este e' PARCIAL pela mesma condicao que
-- a consulta usa, entao o indice ja chega filtrado e nao ha recheck.
-- Os dois convivem de proposito: quem consulta o historico (auditoria, desfazer)
-- continua servido pelo indice cheio.
--
-- ⚠ E ELE SERVE TAMBEM A TELA, nao so' ao motor: `useConciliacaoDoMes` soma os
-- `valor_aplicado` ATIVOS por movimento, e `useVinculosDoMovimento` lista os
-- ativos de um. As duas leituras batem neste mesmo par.

create index if not exists idx_concil_itens_lancamento_ativo
  on public.conciliacao_bancaria_itens using btree (lancamento_id)
  where (desfeito_em is null);
