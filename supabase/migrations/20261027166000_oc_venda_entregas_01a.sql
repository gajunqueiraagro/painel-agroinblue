-- 20261027166000_oc_venda_entregas_01a.sql
-- OC-VENDA-ENTREGAS-01a: um lote da OC ADOTA uma saida de gado que ja existe no zootecnico, em vez de criar outra; e a
-- trava de lotes passa a olhar so' saida ATIVA. Decisoes do Gabriel (28/09/2026), mock docs/mocks/oc_venda_entregas_mock_v2.html.
--
-- O QUE MUDA:
--   1. `zoo_operacao_movimentacoes.origem` ('registrada' | 'adotada'; as existentes ficam 'registrada'). Adotar so' cria o
--      vinculo lote -> movimentacao: nao cria, nao altera e nao apaga animal, e o valor da saida adotada nunca e' reescrito.
--   2. `_oc_motivo_nao_adotavel(operacao, lote, lancamento)`: a regra UNICA de quem pode ser adotado — a listagem filtra por
--      ela e a gravacao recusa com ela. Mesma fazenda da OC, tipo da OC (venda/abate adotam SAIDA, compra adota ENTRADA),
--      mesma categoria do lote, realizada e ativa, comprador vazio ou igual a' contraparte, sem OC, e sem financeiro
--      PROGRAMADO do modal antigo (`origem_lancamento = 'movimentacao_rebanho'` nao realizado — D4b).
--   3. `oc_saidas_adotaveis(operacao, lote)` (INVOKER, so' leitura), `oc_adotar_movimentacao` e `oc_desvincular_movimentacao`
--      (SECURITY DEFINER, versao + 1, evento). Genericas por tipo de OC (D4a); a tela liga so' na venda.
--   4. GUARDAS por origem, para que nada trate a saida adotada como se a OC a tivesse criado:
--        oc_estornar_movimentacao   recusa a adotada ("use Desvincular");
--        _oc_estorno_mov            pula a adotada (o estorno TOTAL de recebimento nao a cancela);
--        oc_excluir_lote            so' desfaz o vinculo da adotada, nunca a cancela;
--        oc_revalorar_lote          nao reescreve o valor da adotada;
--        _oc_sync_abate_lancamento  nao reescreve a adotada (abate);
--        oc_salvar_lotes            nao propaga categoria para a adotada;
--        oc_cancelar                a adotada bloqueia com "saida adotada (desvincule na aba Entrega)".
--      ⚠ `_oc_estorno_mov` e `_oc_sync_abate_lancamento` NAO estavam na lista do D5: sem eles, o "Estornar recebimento" e o
--        abate reescreveriam a saida adotada — o contrario do D1/D4d.
--   5. TRAVA DE LOTES (D1): `oc_salvar_lotes` decide "tem recebimento" por saida ATIVA — o vinculo de um lancamento estornado
--      nao conta mais. No caminho B: incluir lote NUNCA trava; remover trava so' o lote com saida ativa e a mensagem diz qual
--      lote e qual saida (data, cab); quantidade e peso travam so' no lote com saida ativa. Lote removido sem saida ativa leva
--      os vinculos mortos dele (senao a FK RESTRICT recusa), nos dois caminhos — cada estorno ja' tem o seu evento
--      `estornar_movimentacao`, e o evento `salvar_lotes` leva o id de cada vinculo apagado (`vinculos_estornados_removidos`).
--      O desvincular nao pede motivo; o evento leva usuario e data (OK do Gabriel, 28/09).
--      ⚠ DEFEITO PRE-EXISTENTE CORRIGIDO JUNTO: no caminho B o `v_grav` da propagacao de categoria era o da ULTIMA volta do laco
--        de checagem, nao o do lote corrente — a categoria corrigida ia para o lancamento de outro lote.
--
-- PATCH GUARDADO POR md5 (origem -> destino):
--   oc_estornar_movimentacao   760e08f2 -> 27a56ed5      oc_salvar_lotes   cc94c75d -> eac052cd
--   _oc_estorno_mov            2bf8b312 -> bed55f09      oc_cancelar       e7ea1fae -> 21da1015
--   oc_excluir_lote            a3fce559 -> f08aefe8      oc_revalorar_lote 4b3a1ca6 -> 7b48df6a
--   _oc_sync_abate_lancamento  77253245 -> 0f4c0ab4
-- PROVA (rollback no proto, 28/09/2026, como o usuario do Gabriel, OC 232c05aa): incluidos os 2 lotes de garrotes (caminho A,
--   so' vinculos mortos) e adotadas as 7 saidas historicas -> entrega 779/779 (7 lotes completos), valor acordado 2.323.514,68
--   -> 2.366.601,26, versao 9 -> 17; lancamentos da Faz. Sta. Rita, zoot_mensal_cache 2025 (172 linhas) e fn_dre_pecuaria
--   Santa Rita 2025 IDENTICOS; `zoot_cache_sujo` 0; as 5 saidas estornadas no PASSO A fora do seletor. Valor da saida intacto
--   (d6ce7648 574.041,83 x lote 574.046,85; 5293daf3 18.031,09 x lote 18.030,34). Recusas: adotar de novo, adotar estornada,
--   estornar adotada ("use Desvincular"), cancelar com adotada, remover lote com saida ativa ("Lote desmama_m (ordem 1) tem
--   saida ativa: 19/03/2025 · 178 cab ..."), mudar quantidade de lote com saida ativa. Passam: incluir lote com saidas ativas
--   na OC, remover lote sem saida, desvincular (a saida segue ativa e volta ao seletor; entrega 601/779).
--   D4b (rollback separado): a 81e41593 estava no seletor do lote de garrotes e SAIU quando um financeiro programado real do
--   modal antigo foi ligado a ela, com o motivo "Saida com financeiro programado do modal antigo"; os 8 zoot realizados com
--   financeiro nao realizado do modal antigo chegam todos a essa regra. O seletor ordena pela distancia a' data da OC (sem
--   comprador no historico ele traz a categoria inteira — 50 saidas no lote de desmama).
--   TRILHA (rollback separado): remover o lote 5 da 232c05aa (so' com o vinculo estornado 83ecacf8) passa; o vinculo sai e o
--   evento `salvar_lotes` o registra em `vinculos_estornados_removidos`, e o `estornar_movimentacao` do lancamento 86da927f
--   continua na trilha.

-- ── guarda de origem ──
do $g$
declare r record;
begin
  for r in select * from (values
      ('oc_estornar_movimentacao',   '760e08f2a9b596a60986d455f7ff2737'),
      ('_oc_estorno_mov',            '2bf8b3120365dd3994da7adacb3bfa96'),
      ('oc_excluir_lote',            'a3fce559cbd4ab56ebbf83e7c63d9a28'),
      ('oc_revalorar_lote',          '4b3a1ca6a79dcfd537b986d7795986d1'),
      ('_oc_sync_abate_lancamento',  '77253245d3de7c52393f00177d4413f1'),
      ('oc_salvar_lotes',            'cc94c75d6868ca4288a8c5bcfe1ffefe'),
      ('oc_cancelar',                'e7ea1fae581bee99c0f8a78f8fa2f2aa')) v(n, m)
  loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.n) <> 1
       or not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.n and md5(p.prosrc) = r.m) then
      raise exception 'OC-VENDA-ENTREGAS-01a: % fora do corpo esperado', r.n;
    end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
               and table_name = 'zoo_operacao_movimentacoes' and column_name = 'origem') then
    raise exception 'OC-VENDA-ENTREGAS-01a: zoo_operacao_movimentacoes.origem ja existe';
  end if;
end $g$;

-- ── 1. a origem do vinculo ──
alter table public.zoo_operacao_movimentacoes
  add column origem text not null default 'registrada'
  constraint zoo_operacao_mov_origem_chk check (origem in ('registrada', 'adotada'));

-- ── 2. helpers ──
create or replace function public._oc_saidas_ativas_do_lote(p_lote_id uuid)
returns text language sql stable security invoker set search_path to 'pg_catalog', 'public'
as $f$
  select string_agg(to_char(l.data, 'DD/MM/YYYY') || ' · ' || l.quantidade || ' cab', ', ' order by l.data, l.id)
    from public.zoo_operacao_movimentacoes m
    join public.lancamentos l on l.id = m.movimentacao_id
   where m.operacao_lote_id = p_lote_id and l.cancelado is not true
$f$;
revoke all on function public._oc_saidas_ativas_do_lote(uuid) from public, anon, authenticated;

create or replace function public._oc_motivo_nao_adotavel(p_operacao_id uuid, p_lote_id uuid, p_lancamento_id uuid)
returns text language sql stable security invoker set search_path to 'pg_catalog', 'public'
as $f$
  -- NULL = adotavel. A listagem (`oc_saidas_adotaveis`) filtra por esta funcao e a gravacao (`oc_adotar_movimentacao`)
  -- recusa com ela: uma regra so'.
  select case
    when o.id is null then 'Operacao nao encontrada'
    when lo.id is null then 'Lote nao pertence a operacao'
    when l.id is null or l.cliente_id is distinct from o.cliente_id then 'Lancamento nao encontrado neste cliente'
    when l.cancelado is true then 'Saida cancelada'
    when l.cenario is distinct from 'realizado' or l.status_operacional is distinct from 'realizado'
      then 'So saida realizada pode ser adotada'
    when l.fazenda_id is distinct from o.fazenda_id then 'Saida de outra fazenda'
    when l.tipo is distinct from (case o.tipo_operacao when 'compra' then 'compra' when 'venda' then 'venda'
                                                       when 'abate' then 'abate' end)
      then format('Tipo %s nao casa com a operacao (%s)', l.tipo, o.tipo_operacao)
    when l.categoria is distinct from lo.categoria_negociada
      then format('Categoria %s nao casa com o lote (%s)', l.categoria, coalesce(lo.categoria_negociada, 'sem categoria'))
    when l.fornecedor_id is not null and l.fornecedor_id is distinct from o.contraparte_id
      then 'Contraparte do lancamento diferente da operacao'
    when exists (select 1 from public.zoo_operacao_movimentacoes m where m.movimentacao_id = l.id)
      then 'Saida ja pertence a uma operacao comercial'
    when exists (select 1 from public.financeiro_lancamentos_v2 f
                  where f.movimentacao_rebanho_id = l.id and f.origem_lancamento = 'movimentacao_rebanho'
                    and coalesce(f.cancelado, false) = false and f.status_transacao is distinct from 'realizado')
      then 'Saida com financeiro programado do modal antigo'
  end
  from (select p_operacao_id as id) x
  left join public.zoo_operacoes_comerciais o on o.id = x.id
  left join public.zoo_operacao_lotes lo on lo.id = p_lote_id and lo.operacao_id = o.id
  left join public.lancamentos l on l.id = p_lancamento_id
$f$;
revoke all on function public._oc_motivo_nao_adotavel(uuid, uuid, uuid) from public, anon;
grant execute on function public._oc_motivo_nao_adotavel(uuid, uuid, uuid) to authenticated, service_role;

-- ── 3. as tres RPCs ──
create or replace function public.oc_saidas_adotaveis(p_operacao_id uuid, p_lote_id uuid)
returns table (lancamento_id uuid, data date, categoria text, quantidade integer, peso_medio_kg numeric,
               valor_total numeric, origem_registro text, created_at timestamptz)
language sql stable security invoker set search_path to 'pg_catalog', 'public'
as $f$
  select l.id, l.data, l.categoria, l.quantidade, l.peso_medio_kg, l.valor_total, l.origem_registro, l.created_at
    from public.zoo_operacoes_comerciais o
    join public.zoo_operacao_lotes lo on lo.id = p_lote_id and lo.operacao_id = o.id
    join public.lancamentos l
      on l.cliente_id = o.cliente_id and l.fazenda_id = o.fazenda_id and l.categoria = lo.categoria_negociada
     and l.tipo = case o.tipo_operacao when 'compra' then 'compra' when 'venda' then 'venda' when 'abate' then 'abate' end
   where o.id = p_operacao_id
     and public._oc_motivo_nao_adotavel(p_operacao_id, p_lote_id, l.id) is null
   -- a mais perto da data da OC primeiro: sem comprador gravado no historico, a lista traz a categoria inteira
   order by abs(l.data - o.data_operacao), l.data, l.created_at
$f$;
revoke all on function public.oc_saidas_adotaveis(uuid, uuid) from public, anon;
grant execute on function public.oc_saidas_adotaveis(uuid, uuid) to authenticated, service_role;

create or replace function public.oc_adotar_movimentacao(p_operacao_id uuid, p_cliente_id uuid, p_lote_id uuid,
                                                         p_lancamento_id uuid, p_versao_esperada integer)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $f$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_lanc public.lancamentos;
  v_motivo text;
  v_link uuid;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.rascunho OR v_op.status_comercial = 'rascunho' THEN
    RAISE EXCEPTION 'Rascunho (tecnico ou legado) nao permite movimentacao' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.entrega_encerrada THEN RAISE EXCEPTION 'Entrega ja encerrada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  SELECT * INTO v_lanc FROM public.lancamentos WHERE id = p_lancamento_id AND cliente_id = p_cliente_id FOR UPDATE;
  v_motivo := public._oc_motivo_nao_adotavel(p_operacao_id, p_lote_id, p_lancamento_id);
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION 'Saida nao pode ser adotada: %', v_motivo USING ERRCODE = 'P0001'; END IF;

  -- ⚠ SO' O VINCULO: o lancamento nao e' tocado (valor, data, categoria, cabecas ficam como estavam).
  INSERT INTO public.zoo_operacao_movimentacoes (cliente_id, operacao_id, operacao_lote_id, movimentacao_id, created_by, origem)
  VALUES (p_cliente_id, p_operacao_id, p_lote_id, p_lancamento_id, v_actor, 'adotada') RETURNING id INTO v_link;

  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'adotar_movimentacao',
          jsonb_build_object('movimentacao_id', v_link, 'lancamento_id', p_lancamento_id, 'lote_id', p_lote_id,
                             'data', v_lanc.data, 'categoria', v_lanc.categoria, 'quantidade', v_lanc.quantidade,
                             'valor_total', v_lanc.valor_total), v_actor, 'rpc');
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1,
                            'movimentacao_id', v_link, 'lancamento_id', p_lancamento_id);
END;
$f$;
revoke all on function public.oc_adotar_movimentacao(uuid, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.oc_adotar_movimentacao(uuid, uuid, uuid, uuid, integer) to authenticated, service_role;

create or replace function public.oc_desvincular_movimentacao(p_movimentacao_id uuid, p_cliente_id uuid,
                                                              p_versao_esperada integer, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $f$
DECLARE
  v_actor uuid := auth.uid();
  v_link public.zoo_operacao_movimentacoes;
  v_op public.zoo_operacoes_comerciais;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_link FROM public.zoo_operacao_movimentacoes WHERE id = p_movimentacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimentacao % nao encontrada', p_movimentacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_link.origem <> 'adotada' THEN
    RAISE EXCEPTION 'Saida registrada pela OC nao se desvincula: use Estornar' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = v_link.operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao nao encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.entrega_encerrada THEN RAISE EXCEPTION 'Entrega ja encerrada; reabra a entrega para desvincular' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  -- ⚠ SO' O VINCULO: a saida continua no zootecnico, ativa, como estava antes de ser adotada.
  DELETE FROM public.zoo_operacao_movimentacoes WHERE id = p_movimentacao_id;
  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = v_op.id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, v_op.id, 'desvincular_movimentacao', to_jsonb(v_link),
          jsonb_build_object('lancamento_id', v_link.movimentacao_id, 'lote_id', v_link.operacao_lote_id,
                             'motivo', NULLIF(btrim(coalesce(p_motivo, '')), ''),
                             'desvinculado_por', v_actor, 'desvinculado_em', now()), v_actor, 'rpc');
  RETURN jsonb_build_object('ok', true, 'operacao_id', v_op.id, 'versao', v_op.versao + 1,
                            'lancamento_id', v_link.movimentacao_id);
END;
$f$;
revoke all on function public.oc_desvincular_movimentacao(uuid, uuid, integer, text) from public, anon;
grant execute on function public.oc_desvincular_movimentacao(uuid, uuid, integer, text) to authenticated, service_role;

-- ── 4 e 5. patch das funcoes existentes, guardado por ancora (cada uma casa 1x) ──
-- `@entre`: troca o trecho do inicio do 1o marcador ate' o inicio do 2o (cada um casa 1x) — o bloco de checagem do caminho B.
create function pg_temp._oc01a_patch(p_nome text, p_trocas jsonb) returns void language plpgsql as $p$
declare v_oid oid; v_def text; t jsonb; v_a text; v_b text; v_n int; v_i int; v_j int;
begin
  select oid into v_oid from pg_proc where pronamespace = 'public'::regnamespace and proname = p_nome;
  v_def := pg_get_functiondef(v_oid);
  for t in select value from jsonb_array_elements(p_trocas) loop
    if t->>0 = '@entre' then
      v_a := t->>1; v_b := t->>2;
      if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1
         or (length(v_def) - length(replace(v_def, v_b, ''))) / length(v_b) <> 1 then
        raise exception 'OC-VENDA-ENTREGAS-01a: marcadores de % nao casam 1x', p_nome; end if;
      v_i := strpos(v_def, v_a); v_j := strpos(v_def, v_b);
      if v_j <= v_i then raise exception 'OC-VENDA-ENTREGAS-01a: marcadores de % fora de ordem', p_nome; end if;
      v_def := left(v_def, v_i - 1) || (t->>3) || substr(v_def, v_j);
    else
      v_a := t->>0;
      v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
      if v_n <> 1 then raise exception 'OC-VENDA-ENTREGAS-01a: ancora de % casa % vezes: %', p_nome, v_n, left(v_a, 80); end if;
      v_def := replace(v_def, v_a, t->>1);
    end if;
  end loop;
  execute v_def;
end $p$;

select pg_temp._oc01a_patch('oc_estornar_movimentacao', jsonb_build_array(jsonb_build_array(
$a$IF NOT FOUND THEN RAISE EXCEPTION 'Movimentacao % nao encontrada', p_movimentacao_id USING ERRCODE = 'P0002'; END IF;$a$,
$b$IF NOT FOUND THEN RAISE EXCEPTION 'Movimentacao % nao encontrada', p_movimentacao_id USING ERRCODE = 'P0002'; END IF;
  -- OC-VENDA-ENTREGAS-01a: a saida ADOTADA ja existia no zootecnico — pela OC desfaz-se so' o vinculo, nunca o animal.
  IF v_link.origem = 'adotada' THEN
    RAISE EXCEPTION 'Saida adotada nao se estorna pela OC: use Desvincular (a saida continua no zootecnico)' USING ERRCODE = 'P0001'; END IF;$b$)));

select pg_temp._oc01a_patch('_oc_estorno_mov', jsonb_build_array(jsonb_build_array(
$a$SELECT * INTO v_lanc FROM public.lancamentos WHERE id = v_link.movimentacao_id AND cliente_id = p_cliente_id;$a$,
$b$IF v_link.origem = 'adotada' THEN RETURN NULL; END IF;  -- OC-VENDA-ENTREGAS-01a: a adotada nao e' cancelada pelo estorno da OC
  SELECT * INTO v_lanc FROM public.lancamentos WHERE id = v_link.movimentacao_id AND cliente_id = p_cliente_id;$b$)));

select pg_temp._oc01a_patch('oc_excluir_lote', jsonb_build_array(
  jsonb_build_array(
$a$SELECT m.id AS mov_id, l.id AS lanc_id, l.quantidade, l.categoria, l.data, l.cancelado$a$,
$b$SELECT m.id AS mov_id, l.id AS lanc_id, l.quantidade, l.categoria, l.data, l.cancelado, m.origem$b$),
  jsonb_build_array(
$a$    IF r.cancelado IS NOT TRUE THEN$a$,
$b$    IF r.cancelado IS NOT TRUE AND r.origem = 'adotada' THEN
      -- OC-VENDA-ENTREGAS-01a: a saida adotada ja existia no zootecnico — excluir o lote so' desfaz o vinculo.
      v_rol := v_rol || jsonb_build_object('tipo','desvinculo','descricao', format('desvincula a saida adotada de %s %s (%s); ela continua no zootecnico', r.quantidade, r.categoria, to_char(r.data,'DD/MM/YYYY')), 'id', r.lanc_id);
    ELSIF r.cancelado IS NOT TRUE THEN$b$)));

select pg_temp._oc01a_patch('oc_revalorar_lote', jsonb_build_array(jsonb_build_array(
$a$   WHERE m.movimentacao_id = l.id AND m.operacao_lote_id = p_lote_id AND m.operacao_id = p_operacao_id$a$,
$b$   WHERE m.movimentacao_id = l.id AND m.operacao_lote_id = p_lote_id AND m.operacao_id = p_operacao_id AND m.origem = 'registrada'$b$)));

select pg_temp._oc01a_patch('_oc_sync_abate_lancamento', jsonb_build_array(jsonb_build_array(
$a$     WHERE m.movimentacao_id = l.id AND m.operacao_id = p_operacao_id$a$,
$b$     WHERE m.movimentacao_id = l.id AND m.operacao_id = p_operacao_id AND m.origem = 'registrada'$b$)));

select pg_temp._oc01a_patch('oc_cancelar', jsonb_build_array(
  jsonb_build_array(
$a$v_mov_ativa boolean; v_titulo_ativo boolean;$a$,
$b$v_mov_ativa boolean; v_adotada boolean; v_titulo_ativo boolean;$b$),
  jsonb_build_array(
$a$WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE) INTO v_mov_ativa;$a$,
$b$WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE AND m.origem = 'registrada') INTO v_mov_ativa;
  -- OC-VENDA-ENTREGAS-01a: a saida adotada nao se estorna — desvincula-se; a mensagem diz o caminho certo.
  SELECT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m
                   JOIN public.lancamentos l ON l.id = m.movimentacao_id
                  WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE AND m.origem = 'adotada') INTO v_adotada;$b$),
  jsonb_build_array(
$a$  IF v_mov_ativa OR v_titulo_ativo OR v_liq_ativa THEN$a$,
$b$  IF v_mov_ativa OR v_adotada OR v_titulo_ativo OR v_liq_ativa THEN$b$),
  jsonb_build_array(
$a$      CASE WHEN v_mov_ativa    THEN 'recebimento ativo' END,$a$,
$b$      CASE WHEN v_mov_ativa    THEN 'recebimento ativo' END,
      CASE WHEN v_adotada      THEN 'saída adotada (desvincule na aba Entrega)' END,$b$)));

select pg_temp._oc01a_patch('oc_salvar_lotes', jsonb_build_array(
  jsonb_build_array(
$a$  v_grav public.zoo_operacao_lotes;$a$,
$b$  v_grav public.zoo_operacao_lotes;
  v_saidas text;
  v_vinc_mortos jsonb;$b$),
  jsonb_build_array(
$a$  v_tem_receb := EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id);$a$,
$b$  /* OC-VENDA-ENTREGAS-01a (D1): so' saida ATIVA conta. O estorno e' append-only e mantem o vinculo, e contar o vinculo
     morto mandava "estornar o recebimento" que ja estava estornado — a operacao ficava travada sem saida. */
  v_tem_receb := EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id
                          WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE);
  /* Os vinculos MORTOS (lancamento estornado) dos lotes que saem do payload: o lote so' sai se nao tiver saida ativa, e
     leva estes junto. Cada estorno ja' tem o seu evento `estornar_movimentacao`; o id de cada vinculo apagado vai tambem
     no evento `salvar_lotes` abaixo, para a trilha ligar um ao outro. */
  SELECT jsonb_agg(jsonb_build_object('movimentacao_id', m.id, 'lancamento_id', m.movimentacao_id,
                                      'lote_id', m.operacao_lote_id, 'ordem', lo.ordem) ORDER BY lo.ordem, m.id)
    INTO v_vinc_mortos
    FROM public.zoo_operacao_movimentacoes m
    JOIN public.zoo_operacao_lotes lo ON lo.id = m.operacao_lote_id
    JOIN public.lancamentos l ON l.id = m.movimentacao_id
   WHERE lo.operacao_id = p_operacao_id AND lo.cliente_id = p_cliente_id AND l.cancelado IS TRUE
     AND lo.ordem NOT IN (SELECT (x->>'ordem')::int FROM jsonb_array_elements(COALESCE(p_lotes,'[]'::jsonb)) x);$b$),
  jsonb_build_array(
$a$    DELETE FROM public.zoo_operacao_lotes
$a$,
$b$    -- OC-VENDA-ENTREGAS-01a: sem saida ativa, o lote que sai leva os vinculos mortos (estornados) dele — senao a FK recusa.
    DELETE FROM public.zoo_operacao_movimentacoes m
     USING public.zoo_operacao_lotes lo
     WHERE m.operacao_lote_id = lo.id AND lo.operacao_id = p_operacao_id AND lo.cliente_id = p_cliente_id
       AND lo.ordem NOT IN (SELECT (x->>'ordem')::int FROM jsonb_array_elements(COALESCE(p_lotes,'[]'::jsonb)) x);
    DELETE FROM public.zoo_operacao_lotes
$b$),
  jsonb_build_array('@entre',
$a$    SELECT count(*) INTO v_lotes_gravados$a$,
$a$    /* Passou a verificacao: UPDATE apenas do economico.$a$,
$b$    /* OC-VENDA-ENTREGAS-01a (D1): INCLUIR lote nunca trava. REMOVER trava so' o lote com saida ATIVA, e a mensagem diz qual
       lote e qual saida. Quantidade e peso travam so' no lote com saida ativa (sao eles que mudam o rebanho). */
    FOR v_grav IN SELECT * FROM public.zoo_operacao_lotes lo
                   WHERE lo.operacao_id = p_operacao_id AND lo.cliente_id = p_cliente_id
                     AND lo.ordem NOT IN (SELECT (x->>'ordem')::int FROM jsonb_array_elements(COALESCE(p_lotes,'[]'::jsonb)) x)
    LOOP
      v_saidas := public._oc_saidas_ativas_do_lote(v_grav.id);
      IF v_saidas IS NOT NULL THEN
        RAISE EXCEPTION 'Lote % (ordem %) tem saida ativa: %. Para remover o lote, estorne ou desvincule a saida primeiro.',
          COALESCE(v_grav.categoria_negociada, 'sem categoria'), v_grav.ordem, v_saidas USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
    DELETE FROM public.zoo_operacao_movimentacoes m
     USING public.zoo_operacao_lotes lo
     WHERE m.operacao_lote_id = lo.id AND lo.operacao_id = p_operacao_id AND lo.cliente_id = p_cliente_id
       AND lo.ordem NOT IN (SELECT (x->>'ordem')::int FROM jsonb_array_elements(COALESCE(p_lotes,'[]'::jsonb)) x);
    DELETE FROM public.zoo_operacao_lotes lo
     WHERE lo.operacao_id = p_operacao_id AND lo.cliente_id = p_cliente_id
       AND lo.ordem NOT IN (SELECT (x->>'ordem')::int FROM jsonb_array_elements(COALESCE(p_lotes,'[]'::jsonb)) x);

    FOR v_lote IN SELECT value FROM jsonb_array_elements(COALESCE(p_lotes, '[]'::jsonb))
    LOOP
      v_ordem := (v_lote->>'ordem')::int;
      SELECT * INTO v_grav FROM public.zoo_operacao_lotes
       WHERE operacao_id = p_operacao_id AND cliente_id = p_cliente_id AND ordem = v_ordem;
      IF NOT FOUND THEN
        INSERT INTO public.zoo_operacao_lotes (
          cliente_id, operacao_id, ordem, categoria_negociada, qtd_negociada,
          peso_medio_negociado_kg, criterio_valor, valor_informado, observacao, created_by, updated_by)
        VALUES (
          p_cliente_id, p_operacao_id, v_ordem, NULLIF(v_lote->>'categoria_negociada',''),
          NULLIF(v_lote->>'qtd_negociada','')::int, NULLIF(v_lote->>'peso_medio_negociado_kg','')::numeric,
          NULLIF(v_lote->>'criterio_valor',''), NULLIF(v_lote->>'valor_informado','')::numeric,
          NULLIF(v_lote->>'observacao',''), v_actor, v_actor);
        CONTINUE;
      END IF;
      v_saidas := public._oc_saidas_ativas_do_lote(v_grav.id);
      IF v_saidas IS NOT NULL AND (
           NULLIF(v_lote->>'qtd_negociada','')::int IS DISTINCT FROM v_grav.qtd_negociada
        OR NULLIF(v_lote->>'peso_medio_negociado_kg','')::numeric IS DISTINCT FROM v_grav.peso_medio_negociado_kg) THEN
        RAISE EXCEPTION 'Lote % (ordem %) tem saida ativa: %. Quantidade e peso nao mudam (categoria e observacao podem); estorne ou desvincule a saida para alterar.',
          COALESCE(v_grav.categoria_negociada, 'sem categoria'), v_grav.ordem, v_saidas USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

$b$),
  jsonb_build_array(
$a$         SET criterio_valor  = NULLIF(v_lote->>'criterio_valor',''),$a$,
$b$         SET criterio_valor  = NULLIF(v_lote->>'criterio_valor',''),
             qtd_negociada   = NULLIF(v_lote->>'qtd_negociada','')::int,
             peso_medio_negociado_kg = NULLIF(v_lote->>'peso_medio_negociado_kg','')::numeric,$b$),
  jsonb_build_array(
$a$      -- REALIZADO E SOBERANO tambem contra o re-save (bug pego pelo produtor, 31/08):$a$,
$b$      -- OC-VENDA-ENTREGAS-01a: o lote DESTA volta. Antes o `v_grav` era o da ultima volta do laco de checagem, e a
      -- categoria corrigida ia para o lancamento de outro lote.
      SELECT * INTO v_grav FROM public.zoo_operacao_lotes
       WHERE operacao_id = p_operacao_id AND cliente_id = p_cliente_id AND ordem = (v_lote->>'ordem')::int;
      -- REALIZADO E SOBERANO tambem contra o re-save (bug pego pelo produtor, 31/08):$b$),
  jsonb_build_array(
$a$         WHERE m.movimentacao_id = l.id AND m.operacao_lote_id = v_grav.id$a$,
$b$         WHERE m.movimentacao_id = l.id AND m.operacao_lote_id = v_grav.id AND m.origem = 'registrada'$b$),
  jsonb_build_array(
$a$jsonb_build_object('lotes', p_lotes, 'valor_acordado', NULLIF(v_total_acordado, 0), 'qtd_negociada', NULLIF(v_total_qtd,0)), v_actor, 'rpc');$a$,
$b$jsonb_build_object('lotes', p_lotes, 'valor_acordado', NULLIF(v_total_acordado, 0), 'qtd_negociada', NULLIF(v_total_qtd,0),
                             'vinculos_estornados_removidos', v_vinc_mortos), v_actor, 'rpc');$b$)));

-- ── guarda de destino ──
do $g$
declare r record;
begin
  for r in select * from (values
      ('oc_estornar_movimentacao',   '27a56ed50136669535e779a3fe88c9b4'),
      ('_oc_estorno_mov',            'bed55f09663fb206eb7c6b826a7b844a'),
      ('oc_excluir_lote',            'f08aefe8ff19d5f4886ae295f0607d30'),
      ('oc_revalorar_lote',          '7b48df6ae3927801bc88567b8a49a01b'),
      ('_oc_sync_abate_lancamento',  '0f4c0ab4f50597ed79726a5ea2d69540'),
      ('oc_salvar_lotes',            'eac052cdb984db75d9828f605e6b825d'),
      ('oc_cancelar',                '21da101500761358ac62417d9f59cfcf')) v(n, m)
  loop
    if not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                                           and p.proname = r.n and md5(p.prosrc) = r.m) then
      raise exception 'OC-VENDA-ENTREGAS-01a: % com destino inesperado', r.n;
    end if;
  end loop;
end $g$;
