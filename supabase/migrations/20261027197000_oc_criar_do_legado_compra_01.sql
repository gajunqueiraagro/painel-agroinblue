-- OC-CRIAR-DO-LEGADO-COMPRA-01 (Gabriel, 12/10/2026): "Criar OC a partir deste lancamento" passa a cobrir a COMPRA.
-- Venda e compra sao a mesma operacao espelhada; o orquestrador continua UM (`oc_criar_do_legado`) e so' deixa de fixar 'venda'.
--   D1 o TIPO da OC vem do LANCAMENTO: saida (2-Saídas) = compra; o resto = venda, como sempre. Combinacao que nao vale e'
--      recusada pelo dono do motivo, com erro primario.
--   D2 o MODELO e' do dono (`_oc_modelo_ao_nascer`, OC-CC-PADRAO-NOVAS-01a). O passo 4 do criar vira CONFERENCIA: se a OC nao
--      nasceu em conta corrente, erro; o criar NUNCA converte.
--   D3 candidata na compra = ENTRADA de compra (lancamentos.tipo = 'compra'), mesma janela (-60 a +120 dias), qualquer fazenda;
--      a semelhanca compara a `fazenda_origem` com o favorecido. A chave 'destino' do retorno leva, na compra, a ORIGEM do gado.
--   D4 criterios espelhados: na compra 'pagamentos' = 'recebimentos' e 'entradas' = 'saidas' ('outro' igual).
--   D5 comissao e frete do modal antigo (`compra_rebanho:comissao` / `compra_rebanho:frete`, mesma movimentacao) entram como
--      despesa da operacao pelo Vincular de sempre — o espelho de `venda:comissao`.
--   D6 regra 1 ("ja esta ligado a uma operacao") herdada sem mudar; regra 2 (anti-dobra) espelhada: entrada marcada com OUTRO
--      pagamento de compra vivo do modal antigo, fora dos escolhidos, recusa com "some-o aos pagamentos".
--   D7 "pague primeiro": pagamento do modal antigo so' entra realizado/conciliado.
--   D8 NADA MUDA PARA A VENDA: mesmas frases, mesmos passos; o retorno e o evento so' GANHAM a chave 'tipo'.
--   Categoria da entrada fora de `_oc_subcentro_compra`: erro primario nomeando a categoria.
-- (1) `_oc_legado_motivo_recebimento(uuid, p_lado text DEFAULT NULL)` — DROP + CREATE (a assinatura ganha o lado; nulo deriva do
--     proprio lancamento; chamada de um argumento segue valendo). Continua SQL, STABLE, INVOKER; a ACL e' reconcedida aqui.
--     prosrc cdc6dbbda19061d1bd887a927c4ee171 -> fb6f1bfd4eede66ea055914ee519914e
-- (2) e (3) por PATCH GUARDADO POR md5 (origem, cada ancora 1x, destino); reexecutar sobre o corpo ja' corrigido nao faz nada.
--     oc_criar_do_legado_sugestoes  8fab586dcf3f272b3910498d8d22a327 -> f989b2f44a00e777a917d4bbe00b1e89   (INVOKER, como era)
--     oc_criar_do_legado            0206457bb46a349de358c70fc05f5ff2 -> 87c71b689913ef705c8d987446ea279c (SECURITY DEFINER, como era)
-- NENHUM DADO E' ALTERADO. SECURITY, volatilidade, search_path e ACL das tres preservados.

DROP FUNCTION IF EXISTS public._oc_legado_motivo_recebimento(uuid);
CREATE OR REPLACE FUNCTION public._oc_legado_motivo_recebimento(p_lancamento_id uuid, p_lado text DEFAULT NULL)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- NULL = serve. `p_lado` ('venda' | 'compra') e' o lado ESPERADO; nulo = o do proprio lancamento (saida = compra).
  select case
    when l.id is null or l.cancelado is true then 'Lancamento cancelado ou inexistente'
    when d.lado = 'compra' and l.tipo_operacao is distinct from '2-Saídas' then 'Pagamento tem de ser uma saida'
    when d.lado <> 'compra' and l.tipo_operacao is distinct from '1-Entradas' then 'Recebimento tem de ser uma entrada'
    when coalesce(l.sem_movimentacao_caixa, false)
      then case when d.lado = 'compra' then 'Lancamento sem caixa nao e pagamento' else 'Lancamento sem caixa nao e recebimento' end
    -- OC-CRIAR-DO-LEGADO-01b: o modal antigo JA REALIZADO entra (a saida dele e' adotada, nunca recriada).
    when l.origem_lancamento = 'movimentacao_rebanho'
         and not (l.status_transacao in ('realizado', 'conciliado') or l.conciliado_em is not null)
      then case when d.lado = 'compra' then 'Pague primeiro: lancamento do modal antigo ainda programado.'
                else 'Receba primeiro: lancamento do modal antigo ainda programado.' end
    when d.lado = 'compra' and (pc.id is null or pc.tipo_operacao <> '2-Saídas'
                                or pc.subcentro not in ('Investimento Compra Bovinos Fêmeas', 'Investimento Compra Bovinos Machos'))
      then 'Conta fora das compras de gado'
    when d.lado <> 'compra' and (pc.id is null or pc.ordem_exibicao not between 1110 and 1140 or pc.tipo_operacao <> '1-Entradas')
      then 'Conta fora das vendas de gado (1110 a 1140); boitel fica de fora'
    when exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and p.cancelada = false)
      then 'Lancamento ja esta ligado a uma operacao'
  end
  from (select p_lancamento_id as id) x
  left join public.financeiro_lancamentos_v2 l on l.id = x.id
  left join public.financeiro_plano_contas pc on pc.id = l.plano_conta_id
  cross join lateral (select coalesce(nullif(p_lado, ''), case when l.tipo_operacao = '2-Saídas' then 'compra' else 'venda' end) as lado) d
$function$;
REVOKE ALL ON FUNCTION public._oc_legado_motivo_recebimento(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._oc_legado_motivo_recebimento(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp._oc_legado_compra_patch(p_nome text, p_origem text, p_destino text, p_pares text[])
 RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_src text; v_def text; v_novo text; i int; v_n int;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO STRICT v_src, v_def FROM pg_proc p
   WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) = p_destino THEN RETURN; END IF;   -- ja' aplicado
  IF md5(v_src) <> p_origem THEN
    RAISE EXCEPTION 'OC-CRIAR-DO-LEGADO-COMPRA-01: % com corpo de origem inesperado (md5 %)', p_nome, md5(v_src); END IF;
  v_novo := v_src;
  FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
    v_n := (length(v_novo) - length(replace(v_novo, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'OC-CRIAR-DO-LEGADO-COMPRA-01: %, ancora % casa % vez(es), nao 1', p_nome, i, v_n; END IF;
    v_novo := replace(v_novo, p_pares[2 * i - 1], p_pares[2 * i]);
  END LOOP;
  IF md5(v_novo) <> p_destino THEN
    RAISE EXCEPTION 'OC-CRIAR-DO-LEGADO-COMPRA-01: % com corpo de destino inesperado (md5 %)', p_nome, md5(v_novo); END IF;
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'OC-CRIAR-DO-LEGADO-COMPRA-01: %: corpo nao localizado na definicao', p_nome; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
END $patch$;

SELECT pg_temp._oc_legado_compra_patch('oc_criar_do_legado_sugestoes', '8fab586dcf3f272b3910498d8d22a327', 'f989b2f44a00e777a917d4bbe00b1e89', ARRAY[
$a$v_saidas jsonb;
begin$a$,
$b$v_saidas jsonb; v_tipo text;
begin$b$,
$a$  select min(coalesce(l.data_pagamento, l.data_competencia)) into v_dt$a$,
$b$  -- OC-CRIAR-DO-LEGADO-COMPRA-01 (D1): o lado vem do lancamento — saida = compra; o resto = venda
  v_tipo := case when v_primeiro.tipo_operacao = '2-Saídas' then 'compra' else 'venda' end;
  select min(coalesce(l.data_pagamento, l.data_competencia)) into v_dt$b$,
$a$'motivo', public._oc_legado_motivo_recebimento(l.id))$a$,
$b$'motivo', public._oc_legado_motivo_recebimento(l.id, v_tipo))$b$,
$a$and public._oc_legado_motivo_recebimento(l.id) is null;$a$,
$b$and public._oc_legado_motivo_recebimento(l.id, v_tipo) is null;$b$,
$a$'destino', s.fazenda_destino,$a$,
$b$'destino', case when v_tipo = 'compra' then s.fazenda_origem else s.fazenda_destino end,$b$,
$a$lower(public.unaccent(coalesce(s.fazenda_destino, ''))),$a$,
$b$lower(public.unaccent(coalesce(case when v_tipo = 'compra' then s.fazenda_origem else s.fazenda_destino end, ''))),$b$,
$a$and s.tipo = 'venda' and s.cancelado is not true$a$,
$b$and s.tipo = v_tipo and s.cancelado is not true$b$,
$a$  return jsonb_build_object('recebimentos', v_rec, 'irmas', v_irmas, 'saidas', v_saidas,$a$,
$b$  return jsonb_build_object('tipo', v_tipo, 'recebimentos', v_rec, 'irmas', v_irmas, 'saidas', v_saidas,$b$]);

SELECT pg_temp._oc_legado_compra_patch('oc_criar_do_legado', '0206457bb46a349de358c70fc05f5ff2', '87c71b689913ef705c8d987446ea279c', ARRAY[
$a$  v_rec uuid; v_fazendas_saidas uuid[];$a$,
$b$  v_rec uuid; v_fazendas_saidas uuid[];
  v_tipo text; v_ctp text := 'comprador'; v_pg text := 'recebimento'; v_mv text := 'saida';$b$,
$a$  -- ── erros primarios, todos de uma vez ──$a$,
$b$  -- OC-CRIAR-DO-LEGADO-COMPRA-01 (D1): o tipo da OC vem do LANCAMENTO — saida = compra; o resto = venda, como sempre
  v_tipo := case when (select l.tipo_operacao from public.financeiro_lancamentos_v2 l where l.id = p_recebimentos[1]) = '2-Saídas'
                 then 'compra' else 'venda' end;
  if v_tipo = 'compra' then
    v_ctp := 'fornecedor'; v_pg := 'pagamento'; v_mv := 'entrada';
    v_criterio := case v_criterio when 'pagamentos' then 'recebimentos' when 'entradas' then 'saidas' else v_criterio end;   -- D4
  end if;

  -- ── erros primarios, todos de uma vez ──$b$,
$a$'Informe o comprador'::text$a$,
$b$('Informe o ' || v_ctp)$b$,
$a$format('As saídas marcadas são de fazendas diferentes (%s): uma OC por fazenda — desmarque as de uma delas',$a$,
$b$format(case when v_tipo = 'compra' then 'As entradas' else 'As saídas' end || ' marcadas são de fazendas diferentes (%s): uma OC por fazenda — desmarque as de uma delas',$b$,
$a$'Escolha ao menos um recebimento'::text$a$,
$b$('Escolha ao menos um ' || v_pg)$b$,
$a$'Marque ao menos uma saida de gado'::text$a$,
$b$('Marque ao menos uma ' || v_mv || ' de gado')$b$,
$a$'Comprador fora do cadastro deste cliente'::text$a$,
$b$(initcap(v_ctp) || ' fora do cadastro deste cliente')$b$,
$a$'Informe o total da venda'::text$a$,
$b$('Informe o total da ' || v_tipo)$b$,
$a$'Recebimento repetido'::text$a$,
$b$(initcap(v_pg) || ' repetido')$b$,
$a$public._oc_legado_motivo_recebimento(l.id) motivo$a$,
$b$public._oc_legado_motivo_recebimento(l.id, v_tipo) motivo$b$,
$a$format('Recebimento %s nao encontrado neste cliente', left(r.pedido::text, 8))$a$,
$b$format('%s %s nao encontrado neste cliente', initcap(v_pg), left(r.pedido::text, 8))$b$,
$a$format('Recebimento %s: %s', left(r.id::text, 8), r.motivo)$a$,
$b$format('%s %s: %s', initcap(v_pg), left(r.id::text, 8), r.motivo)$b$,
$a$'Os recebimentos tem favorecidos diferentes; uma OC por comprador'::text$a$,
$b$format('Os %ss tem favorecidos diferentes; uma OC por %s', v_pg, v_ctp)$b$,
$a$'Saida repetida'::text$a$,
$b$(initcap(v_mv) || ' repetida')$b$,
$a$for r in select s.id, s.cliente_id, s.fazenda_id, s.quantidade, s.cancelado, x.value->>'lancamento_id' pedido$a$,
$b$for r in select s.id, s.cliente_id, s.fazenda_id, s.quantidade, s.cancelado, s.categoria, x.value->>'lancamento_id' pedido$b$,
$a$format('Saida %s nao encontrada neste cliente', left(coalesce(r.pedido, '?'), 8))$a$,
$b$format('%s %s nao encontrada neste cliente', initcap(v_mv), left(coalesce(r.pedido, '?'), 8))$b$,
$a$v_pend := v_pend || format('Saida %s sem cabecas', left(r.id::text, 8)); end if;$a$,
$b$v_pend := v_pend || format('%s %s sem cabecas', initcap(v_mv), left(r.id::text, 8)); end if;
      -- OC-CRIAR-DO-LEGADO-COMPRA-01: categoria que o dono das contas de compra nao conhece nao entra
      if v_tipo = 'compra' and public._oc_subcentro_compra(r.categoria) is null then
        v_pend := v_pend || format('Entrada %s: categoria %s sem conta de compra no plano', left(r.id::text, 8), coalesce(r.categoria, 'vazia'));
      end if;$b$,
$a$and f.tipo_operacao = '1-Entradas' and pc.ordem_exibicao between 1110 and 1140$a$,
$b$-- OC-CRIAR-DO-LEGADO-COMPRA-01 (D6): na compra, o espelho — outro PAGAMENTO de compra vivo do modal antigo
              and ((v_tipo = 'venda' and f.tipo_operacao = '1-Entradas' and pc.ordem_exibicao between 1110 and 1140)
                or (v_tipo = 'compra' and f.tipo_operacao = '2-Saídas'
                    and pc.subcentro in ('Investimento Compra Bovinos Fêmeas', 'Investimento Compra Bovinos Machos')))$b$,
$a$format('Saida %s tem outro recebimento do modal antigo fora desta OC (%s, R$ %s): some-o aos recebimentos',$a$,
$b$format('%4$s %1$s tem outro %5$s do modal antigo fora desta OC (%2$s, R$ %3$s): some-o aos %5$ss',$b$,
$a$replace(round(r.valor, 2)::text, '.', ','));$a$,
$b$replace(round(r.valor, 2)::text, '.', ','), initcap(v_mv), v_pg);$b$,
$a$'O total da venda deu zero'::text$a$,
$b$('O total da ' || v_tipo || ' deu zero')$b$,
$a$'tipo_operacao', 'venda', 'fazenda_id', v_fazenda$a$,
$b$'tipo_operacao', v_tipo, 'fazenda_id', v_fazenda$b$,
$a$    -- OC-CC-PADRAO-NOVAS-01a: so' quando a OC ainda nao nasceu em conta corrente (hoje ela nasce; o trecho fica como rede)$a$,
$b$    -- OC-CRIAR-DO-LEGADO-COMPRA-01 (D2): CONFERENCIA. O modelo e' do dono (_oc_modelo_ao_nascer); o criar nunca converte.$b$,
$a$    update public.zoo_operacoes_comerciais set modelo_financeiro = 'conta_corrente', versao = versao + 1, updated_at = now(),
           updated_by = v_actor where id = v_op;
    insert into public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
    values (p_cliente_id, v_op, 'definir_modelo_financeiro', jsonb_build_object('modelo_financeiro', 'titulo'),
            jsonb_build_object('modelo_financeiro', 'conta_corrente'),
            jsonb_build_object('motivo', v_motivo, 'versao_anterior', v_ver, 'versao_nova', v_ver + 1), v_actor, 'rpc');$a$,
$b$      raise exception 'Modelo inesperado ao nascer (%): a OC criada do legado tem de nascer em conta corrente',
        (select o.modelo_financeiro from public.zoo_operacoes_comerciais o where o.id = v_op) using errcode = 'P0001';$b$,
$a$raise exception 'Recebimento %: %', left(v_rec::text, 8),$a$,
$b$raise exception '% %: %', initcap(v_pg), left(v_rec::text, 8),$b$,
$a$    for r in select f.id
               from jsonb_array_elements(v_lotes) l$a$,
$b$    -- OC-CRIAR-DO-LEGADO-COMPRA-01 (D5): na compra, comissao E frete do modal antigo (compra_rebanho:comissao / :frete)
    for r in select f.id, split_part(f.origem_tipo, ':', 2) componente
               from jsonb_array_elements(v_lotes) l$b$,
$a$and f.origem_tipo = 'venda:comissao'$a$,
$b$and f.origem_tipo = any (case when v_tipo = 'compra' then array['compra_rebanho:comissao', 'compra_rebanho:frete']
                                                           else array['venda:comissao'] end)$b$,
$a$v_x := public.oc_vincular_lancamento(v_op, v_ver, r.id, 'comissao', v_motivo);$a$,
$b$v_x := public.oc_vincular_lancamento(v_op, v_ver, r.id, r.componente, v_motivo);$b$,
$a$raise exception 'Comissao %: %', left(r.id::text, 8),$a$,
$b$raise exception '% %: %', initcap(r.componente), left(r.id::text, 8),$b$,
$a$jsonb_build_object('criterio_valor', v_criterio, 'total', v_total, 'recebimentos', to_jsonb(p_recebimentos),$a$,
$b$jsonb_build_object('tipo', v_tipo, 'criterio_valor', v_criterio, 'total', v_total, 'recebimentos', to_jsonb(p_recebimentos),$b$,
$a$      'criterio_valor', v_criterio, 'total', v_total, 'lotes', v_lotes,$a$,
$b$      'tipo', v_tipo, 'criterio_valor', v_criterio, 'total', v_total, 'lotes', v_lotes,$b$]);

DROP FUNCTION pg_temp._oc_legado_compra_patch(text, text, text, text[]);

DO $confere$
declare r record;
begin
  if md5((select p.prosrc from pg_proc p where p.oid = 'public._oc_legado_motivo_recebimento(uuid, text)'::regprocedure))
     is distinct from 'fb6f1bfd4eede66ea055914ee519914e' then
    raise exception 'OC-CRIAR-DO-LEGADO-COMPRA-01: _oc_legado_motivo_recebimento com corpo inesperado'; end if;
  for r in select p.oid, p.proname, p.prosecdef, p.provolatile from pg_proc p where p.pronamespace = 'public'::regnamespace
            and p.proname in ('_oc_legado_motivo_recebimento', 'oc_criar_do_legado_sugestoes', 'oc_criar_do_legado') loop
    if has_function_privilege('anon', r.oid, 'EXECUTE') or not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      raise exception 'OC-CRIAR-DO-LEGADO-COMPRA-01: ACL de % mudou', r.proname; end if;
    if r.prosecdef is distinct from (r.proname = 'oc_criar_do_legado') then
      raise exception 'OC-CRIAR-DO-LEGADO-COMPRA-01: SECURITY de % mudou', r.proname; end if;
  end loop;
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '_oc_legado_motivo_recebimento') <> 1 then
    raise exception 'OC-CRIAR-DO-LEGADO-COMPRA-01: sobrou uma segunda _oc_legado_motivo_recebimento'; end if;
end
$confere$;
