-- 20261027170100_fin_v2_sem_caixa_01_dados.sql
-- FIN-V2-SEM-CAIXA-01 (adendo, item 8, dado) — as 7 entregas da 232c05aa (Santa Rita, Helder Hofig) passam a "Venda <cab:3>
-- <sigla>", como o `oc_sincronizar_entregas` corrigido na 20261027170000 ja' grava as novas: "Entrega 183 cab Desmama M" ->
-- "Venda 183 DM", "Entrega 6 cab Garrotes" -> "Venda 006 G".
--
-- ⚠ 7 TITULOS E 7 PARTES, INCLUSIVE a f3ef425a ("Entrega 193 DM", editada a mao) -> "Venda 193 DM": autorizado pelo Gabriel em
--   28/09/2026. Fora ela, so' muda o texto automatico do 01d ("Entrega <cab> cab <nome da categoria>"); a guarda exige
--   exatamente esse estado e aborta se qualquer descricao estiver diferente.
-- ⚠ Valor, datas, conta, hash e status NAO mudam. Auditoria do financeiro ligada; o evento 'corrigir_descricao_entregas' guarda
--   de/para, sem subir a versao (a negociacao nao mudou).

do $mig$
declare
  c_oc  constant uuid := '232c05aa-e531-4f91-a4ba-a61e791d4d56';
  c_editado constant text := 'f3ef425a';
  c_cli uuid;
  v_partes jsonb; v_titulos jsonb; v_np int; v_nt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  select cliente_id into c_cli from public.zoo_operacoes_comerciais where id = c_oc;

  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'oc_sincronizar_entregas'
                   and md5(prosrc) = 'de36ab1e6cf6480d359da66bcf69b7de') then
    raise exception 'FIN-V2-SEM-CAIXA-01 dado: a correcao do sincronizar (20261027170000) tem de estar aplicada antes'; end if;
  if (select count(*) from public.zoo_operacao_partes where operacao_id = c_oc and origem = 'entrega' and cancelada = false) <> 7 then
    raise exception 'FIN-V2-SEM-CAIXA-01 dado: a 232c05aa deveria ter 7 entregas vivas'; end if;

  select jsonb_agg(jsonb_build_object('parte_id', p.id, 'de', p.descricao,
           'para', format('Venda %s %s', lpad(split_part(p.descricao, ' ', 2), greatest(3, length(split_part(p.descricao, ' ', 2))), '0'),
                          public._oc_sigla_categoria(lo.categoria_negociada))))
    into v_partes
    from public.zoo_operacao_partes p join public.zoo_operacao_lotes lo on lo.id = p.lote_id
   where p.operacao_id = c_oc and p.origem = 'entrega' and p.cancelada = false
     and p.descricao = format('Entrega %s cab %s', split_part(p.descricao, ' ', 2), public._oc_rotulo_categoria(lo.categoria_negociada));
  select jsonb_agg(jsonb_build_object('titulo_id', f.id, 'de', f.descricao,
           'para', format('Venda %s %s', lpad(split_part(f.descricao, ' ', 2), greatest(3, length(split_part(f.descricao, ' ', 2))), '0'),
                          public._oc_sigla_categoria(lo.categoria_negociada))))
    into v_titulos
    from public.zoo_operacao_partes p join public.zoo_operacao_lotes lo on lo.id = p.lote_id
    join public.financeiro_lancamentos_v2 f on f.id = p.financeiro_lancamento_id and f.cancelado is not true
   where p.operacao_id = c_oc and p.origem = 'entrega' and p.cancelada = false
     and (f.descricao = format('Entrega %s cab %s', split_part(f.descricao, ' ', 2), public._oc_rotulo_categoria(lo.categoria_negociada))
          or (left(f.id::text, 8) = c_editado and f.descricao = 'Entrega 193 DM'));
  v_np := coalesce(jsonb_array_length(v_partes), 0); v_nt := coalesce(jsonb_array_length(v_titulos), 0);
  if v_np <> 7 or v_nt <> 7 then
    raise exception 'FIN-V2-SEM-CAIXA-01 dado: esperadas 7 partes e 7 titulos no estado medido, achadas % e %', v_np, v_nt; end if;

  update public.zoo_operacao_partes p set descricao = x->>'para', updated_at = now()
    from jsonb_array_elements(v_partes) x where p.id = (x->>'parte_id')::uuid;
  update public.financeiro_lancamentos_v2 f set descricao = x->>'para', updated_at = now()
    from jsonb_array_elements(v_titulos) x where f.id = (x->>'titulo_id')::uuid;

  insert into public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  values (c_cli, c_oc, 'corrigir_descricao_entregas',
          jsonb_build_object('motivo', 'FIN-V2-SEM-CAIXA-01: descricao "Venda <cab> <sigla>" (f3ef425a autorizado pelo Gabriel)',
                             'partes', v_partes, 'titulos', v_titulos),
          '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'migration');

  if exists (select 1 from public.zoo_operacao_partes p left join public.financeiro_lancamentos_v2 f on f.id = p.financeiro_lancamento_id
              where p.operacao_id = c_oc and p.origem = 'entrega' and p.cancelada = false
                and (p.descricao not like 'Venda %' or f.descricao not like 'Venda %')) then
    raise exception 'FIN-V2-SEM-CAIXA-01 dado: sobrou entrega fora do formato novo'; end if;
end $mig$;
