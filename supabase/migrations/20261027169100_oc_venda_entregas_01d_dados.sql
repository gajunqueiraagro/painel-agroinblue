-- 20261027169100_oc_venda_entregas_01d_dados.sql
-- OC-VENDA-ENTREGAS-01d (A1, dado) — as descricoes das 7 entregas da 232c05aa (Santa Rita, Helder Hofig) passam do CODIGO da
-- categoria ao NOME ("Entrega 193 cab desmama_m" -> "Entrega 193 cab Desmama M"), como o `oc_sincronizar_entregas` corrigido na
-- 20261027169000 ja' grava as novas.
--
-- ⚠ SO' O TEXTO AUTOMATICO MUDA: titulo ou parte cuja descricao NAO e' exatamente "Entrega <cab> cab <codigo>" fica como esta'.
--   Medido: o titulo f3ef425a diz "Entrega 193 DM" (editado a mao) e NAO e' tocado; a parte dele (25f2a243) e' automatica e muda.
--   Resultado esperado: 7 partes e 6 titulos.
-- ⚠ Valor, datas, conta, hash (as entregas nao tem hash de importacao) e conciliacao NAO mudam. A auditoria do financeiro fica
--   ligada; o evento 'corrigir_descricao_entregas' na OC guarda de/para, sem subir a versao (a negociacao nao mudou).

do $mig$
declare
  c_cli constant uuid := (select cliente_id from public.zoo_operacoes_comerciais where id = '232c05aa-e531-4f91-a4ba-a61e791d4d56');
  c_oc  constant uuid := '232c05aa-e531-4f91-a4ba-a61e791d4d56';
  v_partes jsonb; v_titulos jsonb; v_np int; v_nt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'oc_sincronizar_entregas'
                   and md5(prosrc) = 'ddfff259242144df3a93205fadea37cf') then
    raise exception 'OC-VENDA-ENTREGAS-01d dado: a correcao do sincronizar (20261027169000) tem de estar aplicada antes'; end if;
  if (select count(*) from public.zoo_operacao_partes where operacao_id = c_oc and origem = 'entrega' and cancelada = false) <> 7 then
    raise exception 'OC-VENDA-ENTREGAS-01d dado: a 232c05aa deveria ter 7 entregas vivas'; end if;

  select jsonb_agg(jsonb_build_object('parte_id', p.id, 'de', p.descricao,
           'para', format('Entrega %s cab %s', split_part(p.descricao, ' ', 2), public._oc_rotulo_categoria(lo.categoria_negociada))))
    into v_partes
    from public.zoo_operacao_partes p join public.zoo_operacao_lotes lo on lo.id = p.lote_id
   where p.operacao_id = c_oc and p.origem = 'entrega' and p.cancelada = false
     and p.descricao = format('Entrega %s cab %s', split_part(p.descricao, ' ', 2), lo.categoria_negociada);
  select jsonb_agg(jsonb_build_object('titulo_id', f.id, 'de', f.descricao,
           'para', format('Entrega %s cab %s', split_part(f.descricao, ' ', 2), public._oc_rotulo_categoria(lo.categoria_negociada))))
    into v_titulos
    from public.zoo_operacao_partes p join public.zoo_operacao_lotes lo on lo.id = p.lote_id
    join public.financeiro_lancamentos_v2 f on f.id = p.financeiro_lancamento_id and f.cancelado is not true
   where p.operacao_id = c_oc and p.origem = 'entrega' and p.cancelada = false
     and f.descricao = format('Entrega %s cab %s', split_part(f.descricao, ' ', 2), lo.categoria_negociada);
  v_np := coalesce(jsonb_array_length(v_partes), 0); v_nt := coalesce(jsonb_array_length(v_titulos), 0);
  if v_np <> 7 or v_nt <> 6 then
    raise exception 'OC-VENDA-ENTREGAS-01d dado: esperadas 7 partes e 6 titulos automaticos, achadas % e %', v_np, v_nt; end if;

  update public.zoo_operacao_partes p set descricao = x->>'para', updated_at = now()
    from jsonb_array_elements(v_partes) x where p.id = (x->>'parte_id')::uuid;
  update public.financeiro_lancamentos_v2 f set descricao = x->>'para', updated_at = now()
    from jsonb_array_elements(v_titulos) x where f.id = (x->>'titulo_id')::uuid;

  insert into public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  values (c_cli, c_oc, 'corrigir_descricao_entregas',
          jsonb_build_object('motivo', 'OC-VENDA-ENTREGAS-01d: nome da categoria no lugar do codigo', 'partes', v_partes,
                             'titulos', v_titulos),
          '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'migration');

  if exists (select 1 from public.zoo_operacao_partes p join public.zoo_operacao_lotes lo on lo.id = p.lote_id
              where p.operacao_id = c_oc and p.origem = 'entrega' and p.cancelada = false
                and p.descricao like '%' || lo.categoria_negociada) then
    raise exception 'OC-VENDA-ENTREGAS-01d dado: sobrou parte com o codigo'; end if;
end $mig$;
