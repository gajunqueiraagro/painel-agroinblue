-- AGNALDO-DEDUP-01b — o programado do modal legado duplicava o DRE do Agnaldo.
--
-- ⚠ REGISTRADA NO LEDGER COMO `20260925102033`, e nao com o timestamp do nome do arquivo.
-- E' o mesmo descasamento ja' anotado no CLAUDE.md para a `reclass_peso_backfill_01` e a
-- `reclass_peso_guard_01`: o `apply_migration` carimba a hora de hoje. Quem auditar o
-- historico procura pelo NOME.
--
-- ⚠ DOIS FINANCEIROS PARA O MESMO ABATE. Os lancamentos criados pelo modal
-- (`origem_lancamento = 'movimentacao_rebanho'`) nasciam 'programado', nunca foram
-- conciliados e NAO afetam conciliacao nenhuma — mas `fn_dre_pecuaria` os soma junto com o
-- legado realizado que veio do extrato. A receita do Agnaldo aparecia DUAS VEZES em
-- 2022-2025. Decisao do Gabriel (25/09/2026): o legado conciliado e' soberano em valor e
-- pagamento; os 28 programados do passado sao cancelados (soft, com motivo).
--
-- ⚠ O LEGADO NAO E' VINCULADO AO MOVIMENTO, de proposito. `movimentacao_rebanho_id` fica
-- NULL: legado realizado COM vinculo cai em `guard_zoo_financeiro_cancelamento_realizado` e
-- vira nao-cancelavel, o que travaria a migracao futura para OC. Uma versao anterior deste
-- trabalho (DEDUP-01) vinculava, e foi descartada sem ser aplicada.
--
-- ⚠ NADA EM `lancamentos`, E ISSO DISPENSA O DESLIGAMENTO DO `set_lancamento_audit`. O
-- trigger apaga `updated_by` quando `auth.uid()` e' nulo (licao do RECLASS-PESO-BACKFILL-01),
-- mas ele so' alcanca quem escreve naquela tabela — e este bloco nao escreve. A versao
-- DEDUP-01 ajustava `valor_total` de 12 movimentos SEM desligar o trigger: teria apagado o
-- autor dos 12. Medido antes de aplicar; foi uma das razoes de ela ser descartada.
--
-- ⚠ SO' A COMPETENCIA DO LEGADO MUDA, onde o par com o movimento zootecnico e' certo. Valor,
-- vencimento, pagamento, status e conta ficam INTACTOS. Dois efeitos de trigger sao aceitos e
-- sao VERDADE: `ano_mes` e' re-derivado (`fn_ano_mes_from_competencia`) e `editado_manual`
-- vira true (`mark_financeiro_lancamento_v2_editado_manual`), porque a linha veio de
-- importacao e a competencia de fato foi editada a mao.
--
-- ⚠ 15 COMPETENCIAS MUDAM, E O BRIEFING DIZIA 16. Sao 17 pares, e DOIS ja' estavam na data do
-- movimento: `c7797c23` (o G2, previsto) e `3fed7781` "Abate 027 vacas (parceria)",
-- 2024-02-22, que ninguem tinha contado. O teste em rollback mediu 15 ANTES de aplicar e o
-- GO foi refeito sobre o numero medido — a expectativa e' que estava errada, nao o dado.
-- `cruzam_ano = 1` e' a unica compra da lista, "Compra 054 Bez (Comp.2020)",
-- 2021-01-11 -> 2020-12-15. Nenhum dos 16 abates cruza ano, entao o DRE ANUAL de 2022-2025 so'
-- perde o que foi cancelado; a visao MENSAL muda em 3 linhas (a maior: R$ 645.802,82 de
-- jul/22 para jun/22).
--
-- ⚠ TRIGGERS MEDIDOS ANTES, e nenhum produziu efeito colateral indesejado:
--   `trg_cbi_desfazer_on_cancelamento` — os 28 tem `conciliado_em is null`, entao nao ha item
--      de conciliacao a desfazer; inerte, confirmado no teste.
--   `trg_financeiro_lancamento_v2_unique_hash` — o hash e' recalculado com a competencia nova;
--      nenhuma violacao.
--   `trg_guard_zoo_financeiro_cancelamento_realizado` — nao barrou os 28 cancelamentos.
--   `trg_oc_sync_liquidacao_financeiro` — o Agnaldo nao tem OC antes de 2026; inerte.
--
-- PROVA rodada em rollback antes de aplicar, e conferida no banco depois:
--   cancelados=28 R$ 4448790.91 | competencias_alteradas=15 | cruzam_ano=1
--   programados do passado ainda ativos = 0 · legados com vinculo = 0 · 2026 intocados = 26
--
-- Guardas: aborta se os programados nao forem EXATAMENTE 28 / R$ 4.448.790,91, se os pares
-- nao forem 17, ou se os 17 legados nao estiverem no estado esperado. Reexecutar sobre o
-- estado ja' corrigido FALHA na primeira guarda — que e' o comportamento certo.

set local dedup.aplicar = 'sim';
do $body$
declare n int; v numeric; x int; msg text;
begin
select count(*), coalesce(sum(valor),0) into n, v from financeiro_lancamentos_v2
 where cliente_id='a2d41cda-eb1e-4527-a6cf-a1b9663339e2' and origem_lancamento='movimentacao_rebanho'
   and movimentacao_rebanho_id is not null and status_transacao='programado' and conciliado_em is null
   and coalesce(cancelado,false)=false and cenario='realizado' and data_competencia < date '2026-01-01';
if n<>28 or v<>4448790.91 then raise exception 'DEDUP-01b abortado: programados = % / R$ % (esperado 28 / 4448790.91)', n, v; end if;
update financeiro_lancamentos_v2 set cancelado=true, cancelado_em=now(),
  cancelado_motivo='AGNALDO-DEDUP-01b: programado do modal legado, duplicava o DRE com o financeiro conciliado'
 where cliente_id='a2d41cda-eb1e-4527-a6cf-a1b9663339e2' and origem_lancamento='movimentacao_rebanho'
   and movimentacao_rebanho_id is not null and status_transacao='programado' and conciliado_em is null
   and coalesce(cancelado,false)=false and cenario='realizado' and data_competencia < date '2026-01-01';
get diagnostics n = row_count; if n<>28 then raise exception 'passo A %', n; end if;
create temp table _c(leg uuid, nova date) on commit drop;
insert into _c values
('0f367251-4bad-4d83-8cbd-d470941c75b8','2023-04-09'),('af2a2426-910d-4f4c-9984-853d228c5fe0','2023-11-26'),
('3013c089-2e7e-46ae-b141-bf4825c68dbb','2024-01-15'),('072cbc0a-c237-4f0b-b53c-8fe254f0c60b','2024-02-05'),
('3fed7781-9fae-4289-9f46-e253501930b1','2024-02-22'),('5b8f27eb-61dc-4e56-95fb-8a75cc60adaa','2024-04-07'),
('3c577168-a3e7-452f-a15c-9dd6054e3c10','2024-07-07'),('c6d1dd5d-4fba-4bbc-9746-85cc27c787ca','2024-08-06'),
('5d2ec059-bef0-44f4-802c-2da25c142bd6','2024-08-07'),('b81db896-9b4a-404d-8b72-b4f0844b15f4','2025-02-04'),
('cb1439e5-95ae-4ffa-a05b-66163487a03d','2025-02-04'),('b81e5105-5a79-4f80-8a9a-a0769f3454df','2025-03-18'),
('23e57c0f-bddc-4c2a-9acc-c394df374bff','2025-07-16'),('14020ba9-8f60-4fbe-80c6-e41daa18d570','2022-06-20'),
('c7797c23-3fb0-4a68-9bd7-bfc50ae2cea3','2024-05-21'),('6b4a10e0-425d-41e9-89b0-57b38c8f16b4','2025-07-08');
insert into _c select id, date '2020-12-15' from financeiro_lancamentos_v2
 where cliente_id='a2d41cda-eb1e-4527-a6cf-a1b9663339e2' and left(id::text,8)='2ce73625'
   and valor=143000 and data_competencia=date '2021-01-11';
select count(*) into n from _c; if n<>17 then raise exception 'DEDUP-01b abortado: pares = % (esperado 17)', n; end if;
select count(*) into n from financeiro_lancamentos_v2 f join _c on f.id=_c.leg
 where f.cliente_id='a2d41cda-eb1e-4527-a6cf-a1b9663339e2' and f.status_transacao='realizado'
   and coalesce(f.cancelado,false)=false and f.movimentacao_rebanho_id is null and f.cenario='realizado';
if n<>17 then raise exception 'DEDUP-01b abortado: legados no estado esperado = % (esperado 17)', n; end if;
select count(*) into x from financeiro_lancamentos_v2 f join _c on f.id=_c.leg
 where extract(year from f.data_competencia) <> extract(year from _c.nova);
update financeiro_lancamentos_v2 f set data_competencia=_c.nova,
  observacao=concat_ws(' | ', nullif(f.observacao,''), 'AGNALDO-DEDUP-01b: competencia '||f.data_competencia||' -> '||_c.nova||' (data do movimento zootecnico)')
 from _c where f.id=_c.leg and f.data_competencia is distinct from _c.nova;
get diagnostics n = row_count;
msg := 'cancelados=28 R$ 4448790.91 | competencias_alteradas='||n||' | cruzam_ano='||x
  ||' | legados valor total R$ '||(select sum(valor) from financeiro_lancamentos_v2 where id in (select leg from _c));
if current_setting('dedup.aplicar', true) is distinct from 'sim' then
  raise exception 'TESTE_OK (rollback): %', msg;
end if;
raise notice '%', msg;
end
$body$;
