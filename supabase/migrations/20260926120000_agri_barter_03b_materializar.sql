-- 20260926120000_agri_barter_03b_materializar.sql
-- AGRI-BARTER-03B: materializar e estornar o barter — a mecânica que leva a permuta ao DRE.
--
-- ⚠ ESTE ARQUIVO VERSIONA O QUE JA' ESTA' VIVO NO PROTO. As duas funções foram aplicadas pelo
--   Chat via Management API sob GO; nao se reaplica por ele. Os corpos abaixo foram EXTRAIDOS
--   do banco (`pg_get_functiondef`, em base64, para não perder um byte), nao redigitados.
--   Conferência por construção, 13/09/2026 — md5(prosrc) do ARQUIVO contra o do banco:
--     agri_barter_materializar_contrato = 63a6368069daa18e7168e604178886f4
--     agri_barter_estornar_contrato     = f39033a6cc9175e1db7aa46de78c43b0
--
-- O QUE `materializar` FAZ: para cada parte de natureza `receita_venda` das OCs do contrato e
-- cada insumo do contrato AINDA SEM LANÇAMENTO, insere em `financeiro_lancamentos_v2` —
-- a venda com sinal '1' / `1-Entradas`, o insumo com '-1' / `2-Saídas`, os dois com
-- `sem_movimentacao_caixa = true`, `status_transacao = 'realizado'`,
-- `conta_bancaria_id` = a conta de permuta do contrato, `origem_lancamento = 'barter'` e
-- `origem_tipo` em `barter:venda` / `barter:insumo` — e grava o `financeiro_lancamento_id` de
-- volta na parte e no insumo (o vínculo 1:1 do razão).
-- ⚠ IDEMPOTENTE POR CONSTRUÇÃO, e não por flag: ela só enxerga o que tem
--   `financeiro_lancamento_id is null`. Rodar duas vezes não duplica nada — é o vínculo que
--   serve de trava, e por isso ele é gravado na mesma transação.
-- ⚠ TRÊS GUARDAS ANTES DE QUALQUER INSERT: contrato ativo, não cancelado, e COM conta de
--   permuta. Sem a conta não há onde pendurar o lançamento, e materializar num `cc` qualquer
--   inflaria o caixa — que é exatamente o que o tipo `permuta` existe para evitar.
--
-- O QUE `estornar` FAZ: apaga os lançamentos gerados — e SÓ os de `origem_lancamento='barter'`,
-- o que impede que um lançamento digitado à mão seja levado junto — e limpa o vínculo,
-- devolvendo o contrato ao estado não-materializado. Testado em rollback: saldo da permuta
-- +20.000 na materialização, zero depois do estorno.
--
-- ⚠ O `revoke ... from public` E' PARTE DA SEGURANCA, nao formalidade. Estas duas são
--   `SECURITY DEFINER` e uma delas APAGA lançamentos financeiros; o default do Postgres dá
--   EXECUTE a `PUBLIC`, e `PUBLIC` inclui `anon` — o visitante não autenticado. O revoke tira
--   esse direito e os grants o devolvem só a quem tem sessão.
-- ⚠ A CONFERENCIA E' POR `has_function_privilege`, NUNCA pela leitura visual da `proacl`.
--   Medido em 13/09/2026, nas duas funções: `public=false`, `anon=false`, `authenticated=true`,
--   `service_role=true`. A `proacl` é `postgres | service_role | authenticated` — sem PUBLIC.
--   A diferença importa: `proacl` é um texto que se interpreta (uma entrada que começa com `=`
--   É o PUBLIC, e é fácil ler errado ou ler num instante anterior); `has_function_privilege`
--   responde a pergunta que se quer fazer — "este papel pode executar?".

CREATE OR REPLACE FUNCTION public.agri_barter_materializar_contrato(p_contrato_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_c public.agri_barter_contratos;
  v_conta uuid;
  v_gerados int := 0;
  v_lanc_id uuid;
  rec record;
begin
  select * into v_c from public.agri_barter_contratos where id = p_contrato_id and ativo;
  if not found then raise exception 'Contrato % nao encontrado', p_contrato_id using errcode='P0001'; end if;
  if v_c.status = 'cancelado' then raise exception 'Contrato cancelado nao materializa' using errcode='P0001'; end if;
  if v_c.conta_permuta_id is null then raise exception 'Contrato sem conta de permuta' using errcode='P0001'; end if;
  v_conta := v_c.conta_permuta_id;

  -- PERNA VENDA: partes de natureza receita_venda das OCs deste contrato, ainda sem lancamento
  for rec in
    select p.id parte_id, p.valor, p.plano_conta_id, p.macro_custo, p.grupo_custo, p.centro_custo, p.subcentro,
           o.safra_id, o.fazenda_id, o.data_operacao, o.cultura
    from public.agri_oc_partes p
    join public.agri_operacoes_comerciais o on o.id = p.operacao_id
    where o.contrato_barter_id = p_contrato_id and p.natureza='receita_venda' and p.financeiro_lancamento_id is null
  loop
    insert into public.financeiro_lancamentos_v2
      (valor, sinal, tipo_operacao, data_competencia, ano_mes, conta_bancaria_id, sem_movimentacao_caixa,
       status_transacao, origem_lancamento, origem_tipo, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro,
       safra_id, fazenda_id, cliente_id, descricao, created_by)
    values
      (rec.valor, '1', '1-Entradas', rec.data_operacao, to_char(rec.data_operacao,'YYYY-MM'), v_conta, true,
       'realizado', 'barter', 'barter:venda', rec.plano_conta_id, rec.macro_custo, rec.grupo_custo, rec.centro_custo, rec.subcentro,
       rec.safra_id, rec.fazenda_id, v_c.cliente_id, 'Venda '||coalesce(rec.cultura,'grao')||' (barter)', v_actor)
    returning id into v_lanc_id;
    update public.agri_oc_partes set financeiro_lancamento_id = v_lanc_id where id = rec.parte_id;
    v_gerados := v_gerados + 1;
  end loop;

  -- PERNA INSUMO: insumos deste contrato, ainda sem lancamento
  for rec in
    select i.id insumo_id, i.valor, i.plano_conta_id, i.safra_id, i.produto
    from public.agri_oc_insumos i
    where i.contrato_barter_id = p_contrato_id and i.ativo and i.financeiro_lancamento_id is null
  loop
    insert into public.financeiro_lancamentos_v2
      (valor, sinal, tipo_operacao, data_competencia, ano_mes, conta_bancaria_id, sem_movimentacao_caixa,
       status_transacao, origem_lancamento, origem_tipo, plano_conta_id, safra_id, fazenda_id, cliente_id, descricao, created_by)
    values
      (rec.valor, '-1', '2-Saídas', current_date, to_char(current_date,'YYYY-MM'), v_conta, true,
       'realizado', 'barter', 'barter:insumo', rec.plano_conta_id, rec.safra_id, v_c.fazenda_id, v_c.cliente_id, 'Insumo '||coalesce(rec.produto,'')||' (barter)', v_actor)
    returning id into v_lanc_id;
    update public.agri_oc_insumos set financeiro_lancamento_id = v_lanc_id where id = rec.insumo_id;
    v_gerados := v_gerados + 1;
  end loop;

  return jsonb_build_object('ok', true, 'lancamentos_gerados', v_gerados, 'conta_permuta', v_conta);
end $function$;

CREATE OR REPLACE FUNCTION public.agri_barter_estornar_contrato(p_contrato_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_c public.agri_barter_contratos;
  v_estornados int := 0;
  rec record;
begin
  select * into v_c from public.agri_barter_contratos where id = p_contrato_id and ativo;
  if not found then raise exception 'Contrato % nao encontrado', p_contrato_id using errcode='P0001'; end if;

  -- estornar as pernas de venda: apagar o lancamento gerado e limpar o vinculo
  for rec in
    select p.id parte_id, p.financeiro_lancamento_id lanc
    from public.agri_oc_partes p
    join public.agri_operacoes_comerciais o on o.id = p.operacao_id
    where o.contrato_barter_id = p_contrato_id and p.financeiro_lancamento_id is not null
  loop
    delete from public.financeiro_lancamentos_v2 where id = rec.lanc and origem_lancamento='barter';
    update public.agri_oc_partes set financeiro_lancamento_id = null where id = rec.parte_id;
    v_estornados := v_estornados + 1;
  end loop;

  -- estornar as pernas de insumo
  for rec in
    select i.id insumo_id, i.financeiro_lancamento_id lanc
    from public.agri_oc_insumos i
    where i.contrato_barter_id = p_contrato_id and i.financeiro_lancamento_id is not null
  loop
    delete from public.financeiro_lancamentos_v2 where id = rec.lanc and origem_lancamento='barter';
    update public.agri_oc_insumos set financeiro_lancamento_id = null where id = rec.insumo_id;
    v_estornados := v_estornados + 1;
  end loop;

  return jsonb_build_object('ok', true, 'lancamentos_estornados', v_estornados);
end $function$;

revoke all on function public.agri_barter_materializar_contrato(uuid) from public;
revoke all on function public.agri_barter_estornar_contrato(uuid) from public;
grant execute on function public.agri_barter_materializar_contrato(uuid) to authenticated;
grant execute on function public.agri_barter_estornar_contrato(uuid) to authenticated;
