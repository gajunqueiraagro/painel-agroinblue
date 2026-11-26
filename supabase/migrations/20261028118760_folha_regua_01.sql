-- FOLHA-REGUA-01 (Gabriel 26/11 08:13 e 08:14) — lote 118760. Duas funções que JÁ EXISTEM; nenhum objeto novo, nenhum dado mudado.
-- (1) fn_folha_funcionario_ficha: "Últimos pagamentos ligados" mostrava os 5 de data mais ALTA — os previstos de 2027 vinham na frente.
--     Agora 'ultimos_pagamentos' = só os REALIZADOS com data até hoje, do mais recente para trás (5); e a chave nova 'proximos_pagamentos' =
--     os NÃO realizados com vencimento de hoje em diante, do mais perto (3). O previsto JÁ VENCIDO e não pago não entra em nenhum dos dois
--     (103 no proto em 26/11 — decisão do Gabriel se ganha um bloco "em atraso").
-- (2) fn_folha_atuacao_gravar: a vigência NOVA igual à que já vale na data (mesmas fazendas, atividades e %) é RECUSADA (P0001) — foi assim que
--     nasceram as 20 vigências repetidas (a carga + a regravada pela tela). Regravar a MESMA data com OUTRO conteúdo continua permitido.
-- ⚠ Guardado: só aplica sobre o corpo conhecido de cada função (md5 do pg_get_functiondef); a ACL fica (CREATE OR REPLACE a preserva).
do $guarda$
begin
  if md5(pg_get_functiondef('public.fn_folha_funcionario_ficha(uuid)'::regprocedure)) <> 'a06f27c5711ddc1685d392aeda7751be' then
    raise exception 'FOLHA-REGUA-01: fn_folha_funcionario_ficha mudou desde a leitura (md5) — reler antes de aplicar';
  end if;
  if md5(pg_get_functiondef('public.fn_folha_atuacao_gravar(uuid,date,jsonb,boolean)'::regprocedure)) <> '109b97b4e36dd1e2ad5d44e2f107f10c' then
    raise exception 'FOLHA-REGUA-01: fn_folha_atuacao_gravar mudou desde a leitura (md5) — reler antes de aplicar';
  end if;
end $guarda$;

CREATE OR REPLACE FUNCTION public.fn_folha_funcionario_ficha(p_funcionario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f public.folha_funcionarios; v jsonb;
begin
  select * into f from folha_funcionarios where id = p_funcionario;
  if not found or not folha_ok(f.cliente_id) then raise exception 'sem acesso a este registro' using errcode = '42501'; end if;
  select jsonb_build_object(
    'funcionario', to_jsonb(f) - 'criado_por' - 'atualizado_por',
    'pagamento', (select jsonb_build_object('favorecido_id', ff.id, 'favorecido', ff.nome, 'tipo_recebimento', ff.tipo_recebimento,
                    'pix_tipo_chave', ff.pix_tipo_chave, 'pix_chave', ff.pix_chave, 'banco', ff.banco, 'agencia', ff.agencia, 'conta', ff.conta,
                    'tipo_conta', ff.tipo_conta, 'telefone', ff.telefone, 'celular', ff.celular, 'email', ff.email)
                    from financeiro_fornecedores ff where ff.id = f.favorecido_id),
    'salarios', coalesce((select jsonb_agg(jsonb_build_object('desde', s.desde, 'salario', s.salario, 'parte_pct', s.parte_pct, 'motivo', s.motivo) order by s.desde desc)
                    from folha_funcionario_salarios s where s.funcionario_id = f.id), '[]'::jsonb),
    'atuacoes', coalesce((select jsonb_agg(jsonb_build_object('desde', a.desde, 'fazenda_id', a.fazenda_id, 'fazenda', z.nome, 'atividade', a.atividade, 'pct', a.pct)
                    order by a.desde desc, a.pct desc) from folha_funcionario_atuacao a join fazendas z on z.id = a.fazenda_id where a.funcionario_id = f.id), '[]'::jsonb),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'especie', d.especie, 'nome', d.nome, 'bucket', 'folha-documentos',
                    'storage_path', d.storage_path, 'tipo', d.tipo, 'tamanho_bytes', d.tamanho_bytes, 'data_documento', d.data_documento,
                    'vencimento', d.vencimento, 'dias', d.vencimento - current_date, 'lancamento_id', d.lancamento_id, 'criado_em', d.criado_em)
                    order by coalesce(d.data_documento, d.criado_em::date) desc)
                    from folha_documentos d where d.funcionario_id = f.id and d.cancelado_em is null), '[]'::jsonb),
    -- FOLHA-REGUA-01: só o REALIZADO com data até hoje, do mais recente para trás
    'ultimos_pagamentos', coalesce((select jsonb_agg(x order by x->>'data' desc) from (
                    select jsonb_build_object('lancamento_id', l.id, 'descricao', l.descricao, 'valor', abs(l.valor), 'status', l.status_transacao,
                      'data', coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia), 'competencia', l.data_competencia) x
                      from financeiro_lancamentos_v2 l where l.funcionario_id = f.id and not coalesce(l.cancelado, false)
                       and l.status_transacao = 'realizado' and coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) <= current_date
                     order by coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) desc limit 5) y), '[]'::jsonb),
    -- FOLHA-REGUA-01: o que ainda vai ser pago, de hoje em diante, do mais perto
    'proximos_pagamentos', coalesce((select jsonb_agg(x order by x->>'data') from (
                    select jsonb_build_object('lancamento_id', l.id, 'descricao', l.descricao, 'valor', abs(l.valor), 'status', l.status_transacao,
                      'data', coalesce(l.data_vencimento, l.data_competencia), 'competencia', l.data_competencia) x
                      from financeiro_lancamentos_v2 l where l.funcionario_id = f.id and not coalesce(l.cancelado, false)
                       and l.status_transacao <> 'realizado' and coalesce(l.data_vencimento, l.data_competencia) >= current_date
                     order by coalesce(l.data_vencimento, l.data_competencia) limit 3) y), '[]'::jsonb),
    'ferias', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'aquisitivo_inicio', p.aquisitivo_inicio, 'aquisitivo_fim', p.aquisitivo_fim,
                    'vencimento', p.vencimento, 'ultimo_prazo', p.ultimo_prazo, 'dias', p.ultimo_prazo - current_date, 'dias_pagos', p.dias_pagos,
                    'saldo_dias', p.saldo_dias, 'faltas', p.faltas, 'documento_id', p.documento_id, 'lido_em', p.lido_em) order by p.aquisitivo_inicio desc)
                    from folha_ferias_periodos p where p.funcionario_id = f.id), '[]'::jsonb))
    into v;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_folha_atuacao_gravar(p_funcionario uuid, p_desde date, p_itens jsonb, p_simular boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f public.folha_funcionarios := _fn_folha_funcionario(p_funcionario); v_antes jsonb; v_soma numeric; v_n int; v_desde_ant date;
begin
  if p_desde is null or p_simular is null or jsonb_typeof(p_itens) <> 'array' then raise exception 'Folha: pedido inválido.' using errcode = '22023'; end if;
  select count(*), coalesce(sum((i->>'pct')::numeric), 0) into v_n, v_soma from jsonb_array_elements(p_itens) i;
  if v_n > 0 and v_soma <> 100 then raise exception 'A atuação soma % (tem de dar 100%%).', v_soma using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(p_itens) i where coalesce((i->>'pct')::numeric, 0) <= 0
                or i->>'atividade' not in ('pecuaria', 'agricultura', 'silvicultura', 'administrativo')
                or not exists (select 1 from fazendas z where z.id = nullif(i->>'fazenda_id', '')::uuid and z.cliente_id = f.cliente_id)) then
    raise exception 'Cada linha da atuação precisa de fazenda deste cliente, atividade e %%.' using errcode = 'P0001';
  end if;
  -- FOLHA-REGUA-01: a vigência que já vale em p_desde (a anterior mais recente) com o MESMO conteúdo → nada a gravar
  select max(desde) into v_desde_ant from folha_funcionario_atuacao where funcionario_id = f.id and desde < p_desde;
  if v_n > 0 and v_desde_ant is not null
     and (select string_agg(fazenda_id::text || '|' || atividade || '|' || round(pct, 2)::text, ';' order by fazenda_id, atividade, pct)
            from folha_funcionario_atuacao where funcionario_id = f.id and desde = v_desde_ant)
       = (select string_agg((i->>'fazenda_id') || '|' || (i->>'atividade') || '|' || round((i->>'pct')::numeric, 2)::text, ';'
                            order by (i->>'fazenda_id')::uuid, i->>'atividade', round((i->>'pct')::numeric, 2))
            from jsonb_array_elements(p_itens) i) then
    raise exception 'Essa atuação já vale desde % — nada a gravar.', to_char(v_desde_ant, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('fazenda_id', fazenda_id, 'atividade', atividade, 'pct', pct) order by fazenda_id, atividade), '[]')
    into v_antes from folha_funcionario_atuacao where funcionario_id = f.id and desde = p_desde;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'antes', v_antes, 'depois', p_itens); end if;
  delete from folha_funcionario_atuacao where funcionario_id = f.id and desde = p_desde;
  insert into folha_funcionario_atuacao (cliente_id, funcionario_id, desde, fazenda_id, atividade, pct, criado_por)
  select f.cliente_id, f.id, p_desde, (i->>'fazenda_id')::uuid, i->>'atividade', round((i->>'pct')::numeric, 2), auth.uid()
    from jsonb_array_elements(p_itens) i;
  perform _fn_folha_trilha(f.cliente_id, 'folha_funcionario_atuacao', f.id, 'gravar', jsonb_build_object('desde', p_desde, 'itens', v_antes),
    jsonb_build_object('desde', p_desde, 'itens', p_itens), null);
  return jsonb_build_object('ok', true, 'simulado', false);
end $function$;
