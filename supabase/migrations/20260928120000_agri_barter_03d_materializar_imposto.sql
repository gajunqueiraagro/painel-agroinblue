-- AGRI-BARTER-03D — o materializador passa a levar a DEDUÇÃO ao DRE.
--
-- JÁ APLICADA NO PROTO pelo arquiteto; este arquivo VERSIONA o que está vivo.
-- Corpo extraído de pg_get_functiondef em 13/09/2026, não redigitado.
-- md5(prosrc) conferido = 6a309d2c6d6ea148b26658945eed771b
--
-- ⚠ RESOLVE A PENDÊNCIA BLOQUEANTE que o PR-AGRI-BARTER-TELA-C deixou anotada em
--   src/hooks/useBarterVenda.ts. O laço da venda varria SOMENTE natureza='receita_venda';
--   com a receita gravada em BRUTO, o Senar não virava lançamento e a receita do barter saía
--   superestimada. Agora o laço varre TODAS as partes da OC e decide o sinal pela natureza:
--     receita_venda        -> sinal '1',  tipo_operacao '1-Entradas'
--     imposto/desconto/frete -> sinal '-1', tipo_operacao '2-Saídas'
--   e a descrição nomeia cada uma ("Imposto s/ venda (barter)").
--
-- ⚠ escopo_negocio='agricultura' PASSOU A SER EXPLÍCITO nos dois inserts, e não é enfeite: o
--   trigger de FIN-ESCOPO-SAFRA-01 exige que a atividade do lançamento bata com a da safra
--   agrícola. Sem a coluna, o insert FALHA — a migration anterior não a mandava porque a
--   receita era o único lançamento e o trigger ainda não cobria este caminho.
--
-- ⚠ VALOR ZERO NÃO MATERIALIZA, nas duas pernas (coalesce(valor,0) <> 0). Um lançamento de
--   R$ 0,00 no DRE é ruído que ninguém sabe de onde veio.
--
-- ⚠ O ESTORNO NÃO MUDOU e não precisou mudar: agri_barter_estornar_contrato apaga por
--   origem_lancamento='barter', então pega as saídas novas junto, sem saber delas.
--
-- Medido no barter real 23/24 (Casul): 28 lançamentos — receita 420.017,50, saídas 396.552,85
-- (Senar + 26 insumos), líquido 23.464,65, o crédito remanescente ao centavo.

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
           o.safra_id, o.fazenda_id, o.data_operacao, o.cultura
    from public.agri_oc_partes p
    join public.agri_operacoes_comerciais o on o.id = p.operacao_id
    where o.contrato_barter_id = p_contrato_id and p.financeiro_lancamento_id is null and coalesce(p.valor,0) <> 0
  loop
    insert into public.financeiro_lancamentos_v2
      (valor, sinal, tipo_operacao, data_competencia, ano_mes, conta_bancaria_id, sem_movimentacao_caixa,
       status_transacao, origem_lancamento, origem_tipo, escopo_negocio, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro,
       safra_id, fazenda_id, cliente_id, descricao, created_by)
    values
      (rec.valor,
       case when rec.natureza='receita_venda' then '1' else '-1' end,
       case when rec.natureza='receita_venda' then '1-Entradas' else '2-Saídas' end,
       rec.data_operacao, to_char(rec.data_operacao,'YYYY-MM'), v_conta, true,
       'realizado', 'barter', 'barter:'||rec.natureza, 'agricultura', rec.plano_conta_id, rec.macro_custo, rec.grupo_custo, rec.centro_custo, rec.subcentro,
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

  for rec in
    select i.id insumo_id, i.valor, i.plano_conta_id, i.safra_id, i.produto
    from public.agri_oc_insumos i
    where i.contrato_barter_id = p_contrato_id and i.ativo and i.financeiro_lancamento_id is null and coalesce(i.valor,0) <> 0
  loop
    insert into public.financeiro_lancamentos_v2
      (valor, sinal, tipo_operacao, data_competencia, ano_mes, conta_bancaria_id, sem_movimentacao_caixa,
       status_transacao, origem_lancamento, origem_tipo, escopo_negocio, plano_conta_id, safra_id, fazenda_id, cliente_id, descricao, created_by)
    values
      (rec.valor, '-1', '2-Saídas', current_date, to_char(current_date,'YYYY-MM'), v_conta, true,
       'realizado', 'barter', 'barter:insumo', 'agricultura', rec.plano_conta_id, rec.safra_id, v_c.fazenda_id, v_c.cliente_id, 'Insumo '||coalesce(rec.produto,'')||' (barter)', v_actor)
    returning id into v_lanc_id;
    update public.agri_oc_insumos set financeiro_lancamento_id = v_lanc_id where id = rec.insumo_id;
    v_gerados := v_gerados + 1;
  end loop;

  return jsonb_build_object('ok', true, 'lancamentos_gerados', v_gerados, 'conta_permuta', v_conta);
end $function$;


-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant. O default-privilege global do banco concede
--   EXECUTE a PUBLIC em função nova; sem o revoke, o `anon` — o papel do visitante não
--   autenticado — poderia materializar o barter de qualquer contrato. Medido depois de
--   aplicada: anon=false, authenticated=true (has_function_privilege).
revoke all on function public.agri_barter_materializar_contrato(uuid) from public;
grant execute on function public.agri_barter_materializar_contrato(uuid) to authenticated;
