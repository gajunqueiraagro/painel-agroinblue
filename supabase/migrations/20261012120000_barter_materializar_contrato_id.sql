-- PR-BARTER-EXTRATO-POR-CONTRATO — o lancamento materializado passa a gravar `contrato_id`.
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO. Nao reaplicada.
-- ⚠ MIGRATION NOVA, e a `20261008120000` fica onde esta': ela ja' esta' no historico e ja' rodou
--   no deploy. Reescrever um arquivo que ja' foi aplicado em outro ambiente e' mentir sobre o que
--   aquele ambiente executou. Aqui o diario ganha uma pagina, nao uma rasura.
-- ⚠ O CORPO NAO FOI REDIGITADO: extraido do banco vivo com `pg_get_functiondef` em base64 e
--   conferido pelo md5 do texto decodificado —
--       385329348dc18e86c4d3af6211f63ffc  (4.275 bytes)
--   O md5 anterior (78443b5e..., da 20261008120000) esta' obsoleto.
--
-- O QUE MUDOU: quatro linhas. Os DOIS `insert` em `financeiro_lancamentos_v2` passam a listar
--   `contrato_id` e a gravar `p_contrato_id`. Nada mais.
--
-- ⚠ O PARAMETRO EXISTIA E SO' NAO ERA GRAVADO — e esse e' o tipo de defeito que nao aparece em
--   teste nenhum enquanto houver um contrato so'. `p_contrato_id` era usado para BUSCAR as partes
--   e os insumos; os lancamentos nasciam com `contrato_id` NULO, e ninguem sentiu falta porque o
--   extrato de permuta filtrava por CONTA e havia uma conta por contrato.
-- ⚠ O DEFEITO APARECEU NO SEGUNDO CONTRATO DA MESMA COOPERATIVA. Dois barters do mesmo parceiro
--   compartilham a conta de permuta — ela e' o deve/tem COM O PARCEIRO, nao com o contrato —,
--   entao o extrato do contrato novo, sem nenhum lancamento proprio, mostrava os 28 do contrato
--   anterior e um saldo que nao era dele. Medido no Proto: os dois contratos de amendoim (23/24 e
--   24/25) apontam para `conta_permuta_id` 69370449..., o 23/24 tem 28 lancamentos e saldo
--   23.464,65, e o 24/25 tem ZERO — mas via 28.
-- ⚠ O CONSERTO E' DE DOIS LADOS: a funcao passa a gravar o vinculo (aqui) e a tela passa a
--   filtrar por ele. So' um dos dois nao resolve — gravar sem filtrar nao muda o que se ve', e
--   filtrar sem gravar esvaziaria TODOS os extratos.
--
-- ⚠ OS LANCAMENTOS ANTIGOS FORAM CORRIGIDOS POR DADO, e esse update NAO esta aqui: ele nomeia um
--   contrato especifico do NJ. Correcao de dado nao se versiona — um banco novo nao tem aqueles
--   lancamentos para corrigir. A partir desta versao, todo barter nasce com o vinculo.
--
-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: `create or replace` preserva privilegios, mas num
--   banco novo a funcao nasce com EXECUTE para PUBLIC por default-privilege global.
--   Medido no Proto: anon=false, authenticated=true.

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
       plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, contrato_id, descricao, created_by)
    values
      (rec.valor,
       case when rec.natureza='receita_venda' then '1' else '-1' end,
       case when rec.natureza='receita_venda' then '1-Entradas' else '2-Saídas' end,
       rec.data_operacao, rec.data_operacao, rec.data_operacao, to_char(rec.data_operacao,'YYYY-MM'), v_conta, true,
       'realizado', 'barter', 'barter:'||rec.natureza, 'agricultura', rec.cultura, v_c.parceiro_fornecedor_id,
       rec.plano_conta_id, rec.macro_custo, rec.grupo_custo, rec.centro_custo, rec.subcentro,
       rec.safra_id, rec.fazenda_id, v_c.cliente_id, p_contrato_id,
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
       plano_conta_id, safra_id, fazenda_id, cliente_id, contrato_id, descricao, created_by)
    values
      (rec.valor, '-1', '2-Saídas', rec.dt, rec.dt, rec.dt, to_char(rec.dt,'YYYY-MM'), v_conta, true,
       'realizado', 'barter', 'barter:insumo', 'agricultura', v_c.cultura, v_c.parceiro_fornecedor_id,
       rec.plano_conta_id, rec.safra_id, v_c.fazenda_id, v_c.cliente_id, p_contrato_id, 'Insumo '||coalesce(rec.produto,'')||' (barter)', v_actor)
    returning id into v_lanc_id;
    update public.agri_oc_insumos set financeiro_lancamento_id = v_lanc_id where id = rec.insumo_id;
    v_gerados := v_gerados + 1;
  end loop;

  return jsonb_build_object('ok', true, 'lancamentos_gerados', v_gerados, 'conta_permuta', v_conta);
end $function$;

revoke all on function public.agri_barter_materializar_contrato(uuid) from public;
grant execute on function public.agri_barter_materializar_contrato(uuid) to authenticated;
