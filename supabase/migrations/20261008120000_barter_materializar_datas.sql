-- PR-BARTER — o lancamento materializado nasce com vencimento e pagamento.
--
-- ⚠ FUNCAO E BACKFILL JA APLICADOS NO PROTO quando esta migration foi escrita. E' REGISTRO
--   HISTORICO, para que um banco novo, replayando as migrations, chegue ao mesmo estado.
--   Nao foi reaplicada.
-- ⚠ O CORPO DA FUNCAO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em
--   base64 e conferido pelo md5 do texto decodificado —
--       78443b5e802593abd11c31346409b7ef  (4.219 bytes)
--
-- O QUE MUDOU: os dois INSERT em `financeiro_lancamentos_v2` passam a preencher
--   `data_vencimento` e `data_pagamento` — o primeiro com `rec.data_operacao` (a data da venda),
--   o segundo com `rec.dt` (o recebimento do insumo, ou a abertura do contrato quando ele nao
--   tem data).
--
-- ⚠ VENCIMENTO = PAGAMENTO = COMPETENCIA, E ISSO NAO E' PREGUICA. O barter nao passa por caixa:
--   os lancamentos ja' nascem `sem_movimentacao_caixa = true`, `status_transacao = 'realizado'` e
--   na CONTA DE PERMUTA, que e' o deve/tem com o parceiro. Nao ha' um vencimento futuro a
--   esperar nem um pagamento a conciliar — a troca ja' aconteceu quando o grao saiu e o insumo
--   entrou. As tres datas coincidirem e' a descricao fiel de uma permuta.
-- ⚠ E O CAMPO NULO ERA UM PROBLEMA REAL, nao cosmetico: a tela do lancamento mostra vencimento e
--   pagamento, e os 28 lancamentos de barter apareciam sem nenhum dos dois — justamente os dois
--   campos que o atalho novo da lista de insumos existe para mostrar.
--
-- O BACKFILL abaixo e' IDEMPOTENTE e cobre os lancamentos gerados antes desta versao. Medido no
--   Proto depois de aplicado: 28 lancamentos com `origem_lancamento='barter'`, ZERO ainda sem
--   data. Rodar de novo nao altera nenhuma linha.
--
-- ⚠ O QUE ESTA MIGRATION NAO CONTEM, e e' deliberado: os acertos pontuais daquele contrato — as
--   datas por nota fiscal dos 26 insumos e a conta bancaria da receita. Aquilo foi CORRECAO DE
--   DADO de um contrato especifico, nao estrutura, e versiona-lo faria um banco novo nascer com
--   os numeros de uma fazenda dentro do codigo.
-- ⚠ CONSEQUENCIA A SABER NUM REPLAY: num banco novo, este backfill deixa venc = pag =
--   competencia em TODOS os lancamentos antigos de barter. No Proto, 26 deles tem hoje datas
--   diferentes da competencia porque receberam aquele acerto por-NF depois. O backfill nao
--   reproduz o estado atual do Proto — ele reproduz o estado CORRETO por construcao, que e' o
--   que uma migration deve fazer.
--
-- ⚠ GRANTS: a funcao ja' e' auth-only e o `create or replace` preserva os privilegios. O revoke
--   antes do grant esta aqui pelo banco NOVO, onde o default-privilege global concede EXECUTE a
--   PUBLIC. Medido no Proto: anon=false, authenticated=true.

CREATE OR REPLACE FUNCTION public.agri_barter_materializar_contrato(p_contrato_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_c public.agri_barter_contratos;
  v_conta uuid; v_gerados int := 0; v_lanc_id uuid; rec record;
begin
  select * into v_c from public.agri_barter_contratos where id = p_contrato_id and ativo;
  if not found then raise exception 'Contrato % nao encontrado', p_contrato_id using errcode='P0001'; end if;
  if v_c.status = 'cancelado' then raise exception 'Contrato cancelado nao materializa' using errcode='P0001'; end if;
  if v_c.conta_permuta_id is null then raise exception 'Contrato sem conta de permuta' using errcode='P0001'; end if;
  v_conta := v_c.conta_permuta_id;

  for rec in
    select p.id parte_id, p.natureza, p.valor, p.plano_conta_id, p.macro_custo, p.grupo_custo, p.centro_custo, p.subcentro,
           o.safra_id, o.fazenda_id, o.data_operacao, coalesce(o.cultura, v_c.cultura) cultura
    from public.agri_oc_partes p
    join public.agri_operacoes_comerciais o on o.id = p.operacao_id
    where o.contrato_barter_id = p_contrato_id and p.financeiro_lancamento_id is null and coalesce(p.valor,0) <> 0
  loop
    insert into public.financeiro_lancamentos_v2
      (valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_bancaria_id, sem_movimentacao_caixa,
       status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id,
       plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, created_by)
    values
      (rec.valor,
       case when rec.natureza='receita_venda' then '1' else '-1' end,
       case when rec.natureza='receita_venda' then '1-Entradas' else '2-Saídas' end,
       rec.data_operacao, rec.data_operacao, rec.data_operacao, to_char(rec.data_operacao,'YYYY-MM'), v_conta, true,
       'realizado', 'barter', 'barter:'||rec.natureza, 'agricultura', rec.cultura, v_c.parceiro_fornecedor_id,
       rec.plano_conta_id, rec.macro_custo, rec.grupo_custo, rec.centro_custo, rec.subcentro,
       rec.safra_id, rec.fazenda_id, v_c.cliente_id,
       case when rec.natureza='receita_venda' then 'Venda '||coalesce(rec.cultura,'grao')||' (barter)'
            when rec.natureza='imposto' then 'Imposto s/ venda (barter)'
            when rec.natureza='desconto' then 'Desconto s/ venda (barter)'
            when rec.natureza='frete' then 'Frete s/ venda (barter)'
            else rec.natureza||' (barter)' end,
       v_actor)
    returning id into v_lanc_id;
    update public.agri_oc_partes set financeiro_lancamento_id = v_lanc_id where id = rec.parte_id;
    v_gerados := v_gerados + 1;
  end loop;

  -- INSUMO: usa data_recebimento (nao current_date), cultura e favorecido do contrato
  for rec in
    select i.id insumo_id, i.valor, i.plano_conta_id, i.safra_id, i.produto,
           coalesce(i.data_recebimento, v_c.data_abertura) dt
    from public.agri_oc_insumos i
    where i.contrato_barter_id = p_contrato_id and i.ativo and i.financeiro_lancamento_id is null and coalesce(i.valor,0) <> 0
  loop
    insert into public.financeiro_lancamentos_v2
      (valor, sinal, tipo_operacao, data_competencia, data_vencimento, data_pagamento, ano_mes, conta_bancaria_id, sem_movimentacao_caixa,
       status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id,
       plano_conta_id, safra_id, fazenda_id, cliente_id, descricao, created_by)
    values
      (rec.valor, '-1', '2-Saídas', rec.dt, rec.dt, rec.dt, to_char(rec.dt,'YYYY-MM'), v_conta, true,
       'realizado', 'barter', 'barter:insumo', 'agricultura', v_c.cultura, v_c.parceiro_fornecedor_id,
       rec.plano_conta_id, rec.safra_id, v_c.fazenda_id, v_c.cliente_id, 'Insumo '||coalesce(rec.produto,'')||' (barter)', v_actor)
    returning id into v_lanc_id;
    update public.agri_oc_insumos set financeiro_lancamento_id = v_lanc_id where id = rec.insumo_id;
    v_gerados := v_gerados + 1;
  end loop;

  return jsonb_build_object('ok', true, 'lancamentos_gerados', v_gerados, 'conta_permuta', v_conta);
end $function$;

-- ── BACKFILL (idempotente) ──
update public.financeiro_lancamentos_v2
  set data_vencimento = coalesce(data_vencimento, data_competencia),
      data_pagamento  = coalesce(data_pagamento,  data_competencia)
where origem_lancamento = 'barter'
  and (data_vencimento is null or data_pagamento is null);

revoke all on function public.agri_barter_materializar_contrato(uuid) from public;
grant execute on function public.agri_barter_materializar_contrato(uuid) to authenticated;
