-- LOTES-05 (decisão do Gabriel 08/11/2026) — na cria o lote é o CARIMBO do mês; o banco só ganha o que a tela precisa:
--   · o carimbo aceita a ressincronização: 7.1, 7.2 … e 7R, 7R.2 (o "R" é o lote de ressinc. do mês; 7R = 7R.1).
--     Mudam a regra da coluna (`rebanho_lotes_carimbo_check`) e a da `fn_lote_salvar` (remendo de texto guardado pelo md5).
--   · o "Nome no caderno" (`fechamento_pastos.lote_mes`) passa a ter trilha: toda troca vai ao `audit_log` com o autor e o texto de
--     antes (o botão "Usar o lote" do modal troca o texto do campeiro pelo lote; o antigo fica aqui).
--   · o `codigo` (ATIV-CAT-RAÇA-NN) NÃO muda: segue único na fazenda e na busca. Mostrar "7.1" no lugar do código é da tela.
-- Volta: o bloco VOLTA no fim (regra antiga, corpo antigo da função pelo md5, sem o gatilho).
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $remendo$
declare
  v_def text := pg_get_functiondef('public.fn_lote_salvar(uuid, uuid, jsonb, integer, text, boolean)'::regprocedure);
  v_velha text := $r$n.carimbo !~ '^(1[0-2]|[1-9])\.[1-9][0-9]?$'$r$;
  v_nova text := $r$n.carimbo !~ '^(1[0-2]|[1-9])(\.[1-9][0-9]?|R(\.[1-9][0-9]?)?)$'$r$;
  v_msg_velha text := $r$'Carimbo: mês.lote, ex.: 7.1 (nascidos em julho, 1º lote do mês).'$r$;
  v_msg_nova text := $r$'Carimbo: mês.lote, ex.: 7.1 (julho, 1º lote) ou 7R (ressinc. de julho).'$r$;
begin
  if md5(v_def) <> 'ccb73d1c9ebe1ba60d0d269dcbec22cf' then
    raise exception 'LOTES-05: fn_lote_salvar não é a da 113200 (md5 %); nada gravado', md5(v_def);
  end if;
  if (length(v_def) - length(replace(v_def, v_velha, ''))) / length(v_velha) <> 1
     or (length(v_def) - length(replace(v_def, v_msg_velha, ''))) / length(v_msg_velha) <> 1 then
    raise exception 'LOTES-05: a regra do carimbo não aparece 1 vez na fn_lote_salvar; nada gravado';
  end if;
  execute replace(replace(v_def, v_velha, v_nova), v_msg_velha, v_msg_nova);
end
$remendo$;

alter table public.rebanho_lotes drop constraint rebanho_lotes_carimbo_check;
alter table public.rebanho_lotes add constraint rebanho_lotes_carimbo_check
  check (carimbo is null or carimbo ~ '^(1[0-2]|[1-9])(\.[1-9][0-9]?|R(\.[1-9][0-9]?)?)$');

/* a trilha do "Nome no caderno" */
create function public._fn_trilha_lote_mes() returns trigger
language plpgsql security definer set search_path to 'pg_catalog', 'public' as $f$
begin
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
  values (new.cliente_id, new.fazenda_id, auth.uid(), 'fechamento', 'editou', 'fechamento_pastos', new.id,
          'nome no caderno: ' || coalesce('"' || old.lote_mes || '"', 'vazio') || ' → ' || coalesce('"' || new.lote_mes || '"', 'vazio'),
          jsonb_build_object('lote_mes', old.lote_mes), jsonb_build_object('lote_mes', new.lote_mes));
  return new;
end
$f$;
revoke all on function public._fn_trilha_lote_mes() from public, anon, authenticated;
create trigger trg_trilha_lote_mes after update of lote_mes on public.fechamento_pastos
  for each row when (old.lote_mes is distinct from new.lote_mes) execute function public._fn_trilha_lote_mes();

-- VOLTA (só com a palavra do Gabriel; antes, nenhum lote pode ter carimbo com R):
-- drop trigger trg_trilha_lote_mes on public.fechamento_pastos; drop function public._fn_trilha_lote_mes();
-- alter table public.rebanho_lotes drop constraint rebanho_lotes_carimbo_check;
-- alter table public.rebanho_lotes add constraint rebanho_lotes_carimbo_check check (carimbo is null or carimbo ~ '^(1[0-2]|[1-9])\.[1-9][0-9]?$');
-- e o remendo ao contrário na fn_lote_salvar (troca v_nova → v_velha e v_msg_nova → v_msg_velha; o md5 volta a ccb73d1c…).
