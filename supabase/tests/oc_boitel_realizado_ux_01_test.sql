-- OC-BOITEL-REALIZADO-UX-01 — prova de `oc_salvar_boitel` (migration 20261027153000).
-- Roda em ROLLBACK: o bloco termina em RAISE 'OK ...' e nada fica gravado. Qualquer outra
-- mensagem e' falha.
-- Cobre: as QUATRO derivacoes do realizado a partir dos fatos (b58bf556, com morte e abate
-- parcial; 744c520e, sem morte), a recusa por fato faltante com os rotulos da tela (fato zerado
-- no payload; 8b211cae, que nunca teve peso vivo, arrobas nem diarias), e o PROJETADO intacto
-- (linha identica depois de salvar, e a recusa de sempre sem GMD).
-- A operacao e' posta em 'programada' dentro do bloco porque a funcao recusa 'fechada'.
do $do$
declare
  v_op record; v int; r jsonb; antes jsonb; depois jsonb; linha record; msg text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e','role','authenticated')::text, true);

  -- 1) b58bf556: 109 abatidas de 110 (1 morte), 104 dias
  select id, cliente_id into v_op from zoo_operacoes_comerciais where id = 'b58bf556-4dfd-4ab9-b6fe-60a4f1598d21';
  update zoo_operacoes_comerciais set status_comercial = 'programada' where id = v_op.id;
  select versao into v from zoo_operacoes_comerciais where id = v_op.id;
  select to_jsonb(b) - 'updated_at' - 'updated_by' into antes
    from zoo_operacao_boitel b where operacao_id = v_op.id and cenario = 'projetado';
  r := oc_salvar_boitel(v_op.id, v_op.cliente_id, v, 'realizado', '{}'::jsonb);
  select * into linha from zoo_operacao_boitel where operacao_id = v_op.id and cenario = 'realizado';
  if linha.preco_venda_arroba <> round(813771.01 / 2251.67, 2) then raise exception 'preco %', linha.preco_venda_arroba; end if;   -- 361,41
  if linha.custo_diaria <> round(214590.48 / (109 * 104), 2) then raise exception 'diaria %', linha.custo_diaria; end if;        -- 18,93
  if round(linha.rendimento_saida_pct, 2) <> 54.41 then raise exception 'rendimento %', linha.rendimento_saida_pct; end if;
  if round(linha.gmd, 3) <> round((62075.5 / 109 - linha.peso_saida_fazenda_kg) / 104, 3) then raise exception 'gmd %', linha.gmd; end if;

  -- 2) o projetado da mesma OC: salva e fica IDENTICO
  select versao into v from zoo_operacoes_comerciais where id = v_op.id;
  r := oc_salvar_boitel(v_op.id, v_op.cliente_id, v, 'projetado', '{}'::jsonb);
  select to_jsonb(b) - 'updated_at' - 'updated_by' into depois
    from zoo_operacao_boitel b where operacao_id = v_op.id and cenario = 'projetado';
  if antes is distinct from depois then raise exception 'projetado mudou'; end if;

  -- 3) projetado sem GMD: a recusa de sempre
  select versao into v from zoo_operacoes_comerciais where id = v_op.id;
  begin
    r := oc_salvar_boitel(v_op.id, v_op.cliente_id, v, 'projetado', '{"gmd": null}'::jsonb);
    raise exception 'projetado sem GMD NAO recusou';
  exception when others then
    if sqlerrm not like 'Projetado do boitel incompleto. Falta GMD:%' then raise exception 'projetado: %', sqlerrm; end if;
  end;

  -- 4) realizado com dois fatos apagados: recusa pelos rotulos da tela
  begin
    r := oc_salvar_boitel(v_op.id, v_op.cliente_id, v, 'realizado', '{"arrobas_totais_abate": null, "qtd_abatida": null}'::jsonb);
    raise exception 'realizado sem fatos NAO recusou';
  exception when others then
    if sqlerrm not like 'Realizado do boitel incompleto. Falta Cabeças abatidas, Arrobas:%' then raise exception 'realizado: %', sqlerrm; end if;
  end;

  -- 5) 8b211cae: realizado antigo sem peso vivo, arrobas e diarias — recusado ate' completar
  select id, cliente_id into v_op from zoo_operacoes_comerciais where id = '8b211cae-f2c2-4a0e-afc4-8d607308435e';
  update zoo_operacoes_comerciais set status_comercial = 'programada' where id = v_op.id;
  select versao into v from zoo_operacoes_comerciais where id = v_op.id;
  begin
    r := oc_salvar_boitel(v_op.id, v_op.cliente_id, v, 'realizado', '{}'::jsonb);
    raise exception '8b211cae NAO recusou';
  exception when others then
    if sqlerrm not like 'Realizado do boitel incompleto. Falta Peso vivo, Arrobas, Diárias:%' then raise exception '8b211cae: %', sqlerrm; end if;
  end;

  -- 6) 744c520e: 217 abatidas, sem morte
  select id, cliente_id into v_op from zoo_operacoes_comerciais where id = '744c520e-de27-42d4-9668-ceaa6dde2de0';
  update zoo_operacoes_comerciais set status_comercial = 'programada' where id = v_op.id;
  select versao into v from zoo_operacoes_comerciais where id = v_op.id;
  r := oc_salvar_boitel(v_op.id, v_op.cliente_id, v, 'realizado', '{}'::jsonb);
  select * into linha from zoo_operacao_boitel where operacao_id = v_op.id and cenario = 'realizado';
  if linha.preco_venda_arroba <> round(linha.valor_total_abate / linha.arrobas_totais_abate, 2)
     or linha.custo_diaria <> round(linha.valor_total_diarias / (linha.qtd_abatida * linha.dias), 2)
     or linha.rendimento_saida_pct <> linha.arrobas_totais_abate * 15 / linha.peso_vivo_total_abate * 100
     or linha.gmd <> (linha.peso_vivo_total_abate / linha.qtd_abatida - linha.peso_saida_fazenda_kg) / linha.dias
  then raise exception '744c520e derivados %', row_to_json(linha); end if;

  msg := format('OK preco=%s diaria=%s rend=%s gmd=%s', linha.preco_venda_arroba, linha.custo_diaria,
    round(linha.rendimento_saida_pct, 2), round(linha.gmd, 3));
  raise exception '%', msg;
end $do$;
