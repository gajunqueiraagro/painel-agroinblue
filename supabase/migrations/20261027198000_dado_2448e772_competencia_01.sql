-- DADO-2448E772-COMPETENCIA-01 (Gabriel, 14/10/2026) — restauro da competencia de UM recebimento do NJ. DADOS, nao schema.
--   O lancamento 2448e772 ("Abate 36 Vacas", R$ 213.150,75, pago 13/07/2026) foi ligado por engano a' OC 1645ba75 em 12/10
--   (evento 9d6a4db2): a competencia foi de 10/06/2026 para 14/10/2026 e o `movimentacao_rebanho_id` (5e92f3b2, o abate de 36
--   vacas de 10/06/2026) foi a nulo. O desvincular de 14/10 (evento c66e4759) nao restaurou: "sem snapshot", restaurado false.
--   Aqui volta: data_competencia 2026-10-14 -> 2026-06-10 e movimentacao_rebanho_id NULL -> 5e92f3b2.
--   `ano_mes` vai a 2026-06 pelo gatilho `trg_00_ano_mes_from_competencia` (o 2026-07 de antes do vinculo era divergencia
--   antiga; decisao do Gabriel, 14/10). `updated_by` = NULL: o autor e' a migration (o audit_log automatico tambem registra).
--   Nenhum outro campo muda: valor, pagamento, vencimento, contas, plano, conciliacao, `editado_manual` e hash ficam (sem
--   `lote_importacao_id`, os gatilhos de editado-a-mao e de hash nao agem).
-- GUARDAS: o recebimento, a movimentacao e os dois eventos que contam a historia tem de ser os medidos; o UPDATE casa
--   EXATAMENTE 1 linha (id + competencia 2026-10-14 + valor 213150.75 + movimentacao nula), senao aborta.
-- REEXECUTAR NAO FAZ NADA: ja' restaurado e com o registro no audit_log -> so' avisa.
-- Trilha: `audit_log` (modulo financeiro, acao 'restaurar_competencia') com antes/depois e o motivo.
-- Efeito medido (fn_dre_pecuaria real, em rollback): DRE pecuaria NJ jun/26 +213.150,75 e out/26 -213.150,75; os outros meses
--   e a conciliacao da conta 7f39d18f (jun, jul, out/26) iguais.

SET LOCAL lock_timeout = '2s';

do $dado$
declare
  c_lanc constant uuid := '2448e772-0aec-44bc-b66c-4f76c9493729';
  c_mov  constant uuid := '5e92f3b2-5be0-4c03-a15b-b997210658a9';
  c_cli  constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_ev_vinc  constant uuid := '9d6a4db2-f934-4a11-beb1-816627ea480e';
  c_ev_desv  constant uuid := 'c66e4759-ee7a-41d1-823f-ffd7ad88b2fd';
  c_motivo constant text := 'restauro — vínculo errado à OC 1645ba75 em 12/10, desvinculado sem snapshot em 14/10; autorizado pelo Gabriel em 14/10';
  l public.financeiro_lancamentos_v2; d public.financeiro_lancamentos_v2; v_rc int;
begin
  select * into l from public.financeiro_lancamentos_v2 where id = c_lanc;
  if not found or l.cliente_id is distinct from c_cli then
    raise exception 'DADO-2448E772: lancamento ausente ou de outro cliente. Abortado.'; end if;

  -- ja' aplicado: estado restaurado e o registro no audit_log -> nada a fazer
  if l.data_competencia = date '2026-06-10' and l.movimentacao_rebanho_id is not distinct from c_mov
     and exists (select 1 from public.audit_log a where a.registro_id = c_lanc and a.acao = 'restaurar_competencia') then
    raise notice 'DADO-2448E772: ja'' restaurado; nada a fazer.';
    return;
  end if;

  -- a movimentacao: viva, do NJ, abate de 36 cabecas em 10/06/2026, na fazenda do lancamento
  if not exists (select 1 from public.lancamentos m
                  where m.id = c_mov and m.cliente_id = c_cli and m.tipo = 'abate' and m.data = date '2026-06-10'
                    and m.quantidade = 36 and m.cancelado is not true and m.fazenda_id is not distinct from l.fazenda_id) then
    raise exception 'DADO-2448E772: movimentacao 5e92f3b2 nao confere (viva, NJ, abate 36 cab em 10/06/2026). Abortado.'; end if;

  -- a historia: o vinculo de 12/10 guardou competencia 10/06 e a movimentacao; o desvincular de 14/10 nao restaurou
  if not exists (select 1 from public.zoo_operacao_eventos e
                  where e.id = c_ev_vinc and e.acao = 'vincular_lancamento' and (e.detalhes->>'lancamento_id')::uuid = c_lanc
                    and e.detalhes->>'competencia_anterior' = '2026-06-10'
                    and (e.detalhes->>'movimentacao_rebanho_id_anterior')::uuid = c_mov) then
    raise exception 'DADO-2448E772: evento do vinculo (9d6a4db2) nao confere. Abortado.'; end if;
  if not exists (select 1 from public.zoo_operacao_eventos e
                  where e.id = c_ev_desv and e.acao = 'desvincular_lancamento' and (e.detalhes->>'lancamento_id')::uuid = c_lanc
                    and (e.detalhes->'competencia_restauro'->>'restaurado')::boolean is false) then
    raise exception 'DADO-2448E772: evento do desvincular (c66e4759) nao confere. Abortado.'; end if;
  if exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = c_lanc and not p.cancelada) then
    raise exception 'DADO-2448E772: o lancamento voltou a ter parte viva de OC. Abortado.'; end if;

  -- o restauro: exatamente 1 linha
  update public.financeiro_lancamentos_v2
     set data_competencia = date '2026-06-10', movimentacao_rebanho_id = c_mov, updated_at = now(), updated_by = null
   where id = c_lanc and data_competencia = date '2026-10-14' and valor = 213150.75 and movimentacao_rebanho_id is null;
  get diagnostics v_rc = row_count;
  if v_rc <> 1 then raise exception 'DADO-2448E772: o UPDATE casou % linha(s), nao 1. Abortado.', v_rc; end if;

  -- conferencia: so' os dois campos (e o ano_mes do gatilho) mudaram
  select * into d from public.financeiro_lancamentos_v2 where id = c_lanc;
  if d.data_competencia is distinct from date '2026-06-10' or d.ano_mes is distinct from '2026-06'
     or d.movimentacao_rebanho_id is distinct from c_mov
     or (to_jsonb(d) - array['data_competencia','ano_mes','movimentacao_rebanho_id','updated_at','updated_by'])
        is distinct from (to_jsonb(l) - array['data_competencia','ano_mes','movimentacao_rebanho_id','updated_at','updated_by']) then
    raise exception 'DADO-2448E772: o lancamento ficou diferente do esperado. Abortado.'; end if;

  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo,
                                dados_anteriores, dados_novos)
  values (c_cli, l.fazenda_id, null, 'financeiro', 'restaurar_competencia', 'financeiro_lancamentos_v2', c_lanc,
    'DADO-2448E772-COMPETENCIA-01: ' || c_motivo,
    jsonb_build_object('data_competencia', l.data_competencia, 'ano_mes', l.ano_mes, 'movimentacao_rebanho_id', l.movimentacao_rebanho_id),
    jsonb_build_object('data_competencia', d.data_competencia, 'ano_mes', d.ano_mes, 'movimentacao_rebanho_id', d.movimentacao_rebanho_id,
                       'motivo', c_motivo, 'evento_vinculo', c_ev_vinc, 'evento_desvincular', c_ev_desv,
                       'ano_mes_antes_do_vinculo', '2026-07'));

  raise notice 'DADO-2448E772: competencia 14/10/2026 -> 10/06/2026, ano_mes % -> %, movimentacao -> 5e92f3b2.', l.ano_mes, d.ano_mes;
end $dado$;
