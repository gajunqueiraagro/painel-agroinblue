-- OC-DOC-ESPECIE-01 (b) — o 14o documento, nascido do mesmo defeito DEPOIS da FASE 0
--
-- 3be1da9a ("nf 119306", Vera, 25/09/2026 18:52): criado com arquivo num gesto so', enquanto o conserto
-- do front nao subia, e o anexo trocou a especie por 'outro'. Mesmo criterio da migration
-- 20261027151000 (decisao do Gabriel): o nome automatico da `fin_documento_registrar`
-- (`especie || ' ' || numero`) e' a especie escolhida na criacao.
-- ⚠ Varredura antes de escrever: era o UNICO documento vivo em 'outro' com nome de outra especie.
-- GUARDA e TRILHA iguais as da migration (a): em 'outro', vivo, nome medido, senao ABORTA; reexecutar
--   aborta (a linha ja' nao esta' em 'outro'). Uma linha em `audit_log`.

do $mig$
declare
  v_motivo constant text := 'OC-DOC-ESPECIE-01: especie sobrescrita no anexo';
  v_id constant uuid := '3be1da9a-c860-49c0-9ea2-8253633c8c68';
begin
  if not exists (select 1 from public.financeiro_lancamento_documentos d
                  where d.id = v_id and d.especie = 'outro' and d.cancelado is not true and d.nome = 'nf 119306') then
    raise exception 'Documento % nao esta como medido (outro, vivo, nome "nf 119306"). Migration abortada.', v_id;
  end if;

  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  select d.cliente_id, null, 'financeiro', 'editou', 'financeiro_lancamento_documentos', d.id, v_motivo,
         jsonb_build_object('especie', d.especie, 'versao', d.versao),
         jsonb_build_object('especie', 'nf', 'versao', d.versao + 1, 'motivo', v_motivo)
    from public.financeiro_lancamento_documentos d where d.id = v_id;

  update public.financeiro_lancamento_documentos
     set especie = 'nf', versao = versao + 1, updated_at = now()
   where id = v_id;
end $mig$;
