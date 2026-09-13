-- AGRI-BARTER-04 — a cultura do contrato, o favorecido e a data do insumo no lançamento.
--
-- JÁ APLICADA NO PROTO pelo arquiteto; este arquivo VERSIONA o que está vivo em 13/09/2026.
-- Corpos extraídos de pg_get_functiondef, não redigitados. md5(prosrc) conferidos:
--   agri_barter_abrir_contrato         = 0d587aa4c0b2cc225f086ec37f3ea9fa
--   agri_barter_materializar_contrato  = ba99dd9b3b768480ac80521116a196fa
--
-- ⚠ POR QUE A CULTURA MORA NO CONTRATO, e não só na venda. O barter tem DUAS pernas e só uma
--   delas sabe a cultura: a venda declara "amendoim", o insumo não declara nada — semente,
--   adubo e defensivo chegam sem dizer para que lavoura vão. Sem a coluna, os 26 lançamentos de
--   insumo iam ao DRE por cultura SEM cultura e caíam em "Não apropriado", com a receita
--   sozinha do outro lado: o resultado da lavoura aparecia partido ao meio.
-- ⚠ E O CAMINHO ALTERNATIVO SERIA RATEAR, que é pior. Ratear o insumo entre as culturas da
--   safra espalharia por milho e mandioca um custo que é do amendoim — inventando precisão onde
--   o contrato já tem a resposta escrita.
-- ⚠ A PRECEDÊNCIA É `coalesce(operacao.cultura, contrato.cultura)`: a venda, que sabe, manda; o
--   contrato é o padrão de quem não sabe. Uma venda de milho dentro de um contrato de amendoim
--   continua indo para o milho.
--
-- ⚠ `favorecido_id` = `contrato.parceiro_fornecedor_id`, nas duas pernas. Sem ele os 28
--   lançamentos nasciam sem fornecedor, e a cooperativa — contraparte de tudo que há neste
--   contrato — não aparecia em relatório nenhum por favorecido.
--
-- ⚠ A DATA DO INSUMO É A DO RECEBIMENTO, NÃO A DE HOJE. O laço usava `current_date`: os 26
--   insumos da safra 23/24 entravam no DRE com a competência do dia em que alguém clicou em
--   materializar. Um custo de abril de 2025 caindo em setembro de 2026 desloca o resultado de
--   DOIS exercícios de uma vez — tira do ano que o gerou e põe num que não teve nada com ele.
--   Agora é `coalesce(insumo.data_recebimento, contrato.data_abertura)`: a data da NF manda, e a
--   abertura do contrato é o padrão de quem ainda não informou — nunca mais o relógio.
--   Medido: os 26 insumos do 23/24 estão com data_recebimento = 2025-04-01.
--
-- ⚠ O DROP DA ASSINATURA ANTIGA VEM ANTES DO CREATE, e não é zelo: `agri_barter_abrir_contrato`
--   ganhou um 5º parâmetro, e em PL/pgSQL a assinatura faz parte da identidade. Um
--   `create or replace` com cinco parâmetros NÃO substitui a função de quatro — cria uma
--   SEGUNDA. Num `db reset` a partir destas migrations as duas existiriam, o PostgREST veria um
--   overload e a chamada com quatro argumentos nomeados continuaria caindo na versão velha, que
--   não grava cultura. O banco vivo já tem só a de cinco (medido: uma linha em pg_proc).

alter table public.agri_barter_contratos add column if not exists cultura text;
comment on column public.agri_barter_contratos.cultura is 'cultura do barter (ex amendoim); receita e insumos herdam para cair na cultura certa no DRE, sem ratear';

alter table public.agri_oc_insumos add column if not exists data_recebimento date;
comment on column public.agri_oc_insumos.data_recebimento is 'data em que o insumo foi recebido (da NF); usada como competencia do lancamento no DRE';

drop function if exists public.agri_barter_abrir_contrato(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.agri_barter_abrir_contrato(p_parceiro_fornecedor_id uuid, p_nome text, p_fazenda_id uuid DEFAULT NULL::uuid, p_descricao text DEFAULT NULL::text, p_cultura text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_cli uuid; v_forn_nome text; v_conta uuid; v_contrato uuid; v_criada boolean := false;
begin
  if v_actor is null then raise exception 'Sem usuario autenticado' using errcode='P0001'; end if;
  select cliente_id, nome into v_cli, v_forn_nome from public.financeiro_fornecedores where id = p_parceiro_fornecedor_id;
  if v_cli is null then raise exception 'Fornecedor % nao encontrado', p_parceiro_fornecedor_id using errcode='P0001'; end if;
  select id into v_conta from public.financeiro_contas_bancarias
    where cliente_id = v_cli and tipo_conta = 'permuta' and nome_exibicao = 'Permuta · '||v_forn_nome and ativa limit 1;
  if v_conta is null then
    insert into public.financeiro_contas_bancarias (cliente_id, fazenda_id, nome_conta, nome_exibicao, banco, tipo_conta, ativa)
      values (v_cli, p_fazenda_id, 'Permuta · '||v_forn_nome, 'Permuta · '||v_forn_nome, 'Permuta', 'permuta', true)
      returning id into v_conta;
    v_criada := true;
  end if;
  insert into public.agri_barter_contratos (cliente_id, fazenda_id, parceiro_fornecedor_id, conta_permuta_id, nome, descricao, cultura, created_by)
    values (v_cli, p_fazenda_id, p_parceiro_fornecedor_id, v_conta, p_nome, p_descricao, p_cultura, v_actor)
    returning id into v_contrato;
  return jsonb_build_object('ok', true, 'contrato_id', v_contrato, 'conta_permuta_id', v_conta, 'conta_criada', v_criada);
end $function$;


revoke all on function public.agri_barter_abrir_contrato(uuid, text, uuid, text, text) from public;
grant execute on function public.agri_barter_abrir_contrato(uuid, text, uuid, text, text) to authenticated;

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
      (valor, sinal, tipo_operacao, data_competencia, ano_mes, conta_bancaria_id, sem_movimentacao_caixa,
       status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id,
       plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, safra_id, fazenda_id, cliente_id, descricao, created_by)
    values
      (rec.valor,
       case when rec.natureza='receita_venda' then '1' else '-1' end,
       case when rec.natureza='receita_venda' then '1-Entradas' else '2-Saídas' end,
       rec.data_operacao, to_char(rec.data_operacao,'YYYY-MM'), v_conta, true,
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
      (valor, sinal, tipo_operacao, data_competencia, ano_mes, conta_bancaria_id, sem_movimentacao_caixa,
       status_transacao, origem_lancamento, origem_tipo, escopo_negocio, cultura, favorecido_id,
       plano_conta_id, safra_id, fazenda_id, cliente_id, descricao, created_by)
    values
      (rec.valor, '-1', '2-Saídas', rec.dt, to_char(rec.dt,'YYYY-MM'), v_conta, true,
       'realizado', 'barter', 'barter:insumo', 'agricultura', v_c.cultura, v_c.parceiro_fornecedor_id,
       rec.plano_conta_id, rec.safra_id, v_c.fazenda_id, v_c.cliente_id, 'Insumo '||coalesce(rec.produto,'')||' (barter)', v_actor)
    returning id into v_lanc_id;
    update public.agri_oc_insumos set financeiro_lancamento_id = v_lanc_id where id = rec.insumo_id;
    v_gerados := v_gerados + 1;
  end loop;

  return jsonb_build_object('ok', true, 'lancamentos_gerados', v_gerados, 'conta_permuta', v_conta);
end $function$;


-- ⚠ A ACL VEM JUNTO NAS DUAS, e o revoke ANTES do grant: o default-privilege global concede
--   EXECUTE a PUBLIC em função nova, e sem o revoke o papel `anon` — visitante não autenticado —
--   poderia abrir e materializar barter de qualquer contrato. Medido depois de aplicadas, por
--   has_function_privilege: anon=false, authenticated=true nas três funções do barter.
revoke all on function public.agri_barter_materializar_contrato(uuid) from public;
grant execute on function public.agri_barter_materializar_contrato(uuid) to authenticated;
