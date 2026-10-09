-- DIVIDENDO-ESCRITOR-UNICO-01 (passo 2, parte A) — AS FUNCOES INTERNAS DO ESCRITOR UNICO DO CADASTRO DE DIVIDENDOS (Gabriel, 09/10/2026).
-- So' funcoes FECHADAS (`_fn_dividendo_*`): nenhuma tela as chama e nenhum dado e' escrito aqui. As publicas, a unicidade do
-- cadastro, a trava de escrita direta e o backfill estao na parte B (20261027195400), com a regra inteira no cabecalho.
-- (Duas migrations porque o canal de escrita recusa carga acima de ~13 KB.)
-- GESTO CONTRARIO: DROP das seis funcoes `_fn_dividendo_*` desta migration.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

CREATE FUNCTION public._fn_dividendo_subcentro(p_nome text) RETURNS text
 LANGUAGE sql IMMUTABLE AS $f$ select 'Dividendos ' || btrim(p_nome) $f$;

-- a conta que o nome usa: a do cliente ATIVA; na falta, a geral ativa; na falta, a do cliente inativa
CREATE FUNCTION public._fn_dividendo_conta_atual(p_cliente uuid, p_sub text) RETURNS uuid
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select p.id from public.financeiro_plano_contas p
   where p.macro_custo = 'Dividendos' and p.subcentro = p_sub
     and (p.cliente_id = p_cliente or (p.cliente_id is null and p.ativo))
   order by case when p.cliente_id is not null and p.ativo then 0 when p.cliente_id is null then 1 else 2 end, p.created_at desc, p.id
   limit 1 $f$;

CREATE FUNCTION public._fn_dividendo_foto(p_id uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select jsonb_build_object(
    'dividendo', jsonb_build_object('id', d.id, 'nome', d.nome, 'ativo', d.ativo, 'ordem_exibicao', d.ordem_exibicao),
    'conta', (select jsonb_build_object('id', p.id, 'subcentro', p.subcentro, 'ativo', p.ativo, 'geral', p.cliente_id is null,
                'lancamentos_vivos', (select count(*) from public.financeiro_lancamentos_v2 l
                                       where l.cliente_id = d.cliente_id and l.plano_conta_id = p.id and not coalesce(l.cancelado, false)))
                from public.financeiro_plano_contas p
               where p.id = public._fn_dividendo_conta_atual(d.cliente_id, public._fn_dividendo_subcentro(d.nome))))
    from public.financeiro_dividendos d where d.id = p_id $f$;

CREATE FUNCTION public._fn_dividendo_recusar(p_motivo text, p_frase text, p_antes jsonb DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql AS $f$
begin
  raise exception using errcode = 'DVREC', message = p_frase, detail = p_motivo, hint = coalesce(p_antes::text, 'null');
end $f$;

-- garante a conta do nome: a geral (D1), a do cliente, a do cliente reativada, ou uma nova no molde
CREATE FUNCTION public._fn_dividendo_garantir_conta(p_cliente uuid, p_sub text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
declare v uuid;
begin
  select p.id into v from public.financeiro_plano_contas p
   where p.ativo and p.cliente_id is null and p.macro_custo = 'Dividendos' and p.subcentro = p_sub order by p.created_at, p.id limit 1;
  if v is not null then return v; end if;
  select p.id into v from public.financeiro_plano_contas p
   where p.ativo and p.cliente_id = p_cliente and p.macro_custo = 'Dividendos' and p.subcentro = p_sub limit 1;
  if v is not null then return v; end if;
  select p.id into v from public.financeiro_plano_contas p
   where p.ativo is not true and p.cliente_id = p_cliente and p.macro_custo = 'Dividendos' and p.subcentro = p_sub
   order by p.created_at desc, p.id limit 1;
  if v is not null then
    update public.financeiro_plano_contas set ativo = true where id = v;
    return v;
  end if;
  insert into public.financeiro_plano_contas
    (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao, compoe_dre)
  values (p_cliente, '2-Saídas', 'Dividendos', 'Dividendos', 'Dividendos', p_sub, 'administrativo', true,
          greatest(coalesce((select max(x.ordem_exibicao) from public.financeiro_plano_contas x
                              where x.cliente_id = p_cliente and x.macro_custo = 'Dividendos'), 0), 17150) + 10, false)
  returning id into v;
  return v;
end $f$;

CREATE FUNCTION public._fn_dividendo_executar(p_op text, p_a jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
declare
  v_id uuid := nullif(p_a->>'id', '')::uuid;
  v_nome text := btrim(coalesce(p_a->>'nome', ''));
  v_cli uuid; d public.financeiro_dividendos; v_sub text; v_sub_ant text; v_conta uuid; v_antes jsonb; v_n int := 0;
  v_fora text; v_acao text; v_ids uuid[];
begin
  if p_op in ('criar', 'reordenar') then
    v_cli := (p_a->>'cliente_id')::uuid;
  else
    select x.cliente_id into v_cli from public.financeiro_dividendos x where x.id = v_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dividendo|' || v_cli::text, 0));

  -- ── reordenar (D4): so' a ordem do cadastro ──
  if p_op = 'reordenar' then
    v_ids := array(select e::uuid from jsonb_array_elements_text(coalesce(p_a->'ids', '[]'::jsonb)) e);
    v_antes := (select coalesce(jsonb_agg(x.id order by x.ordem_exibicao, x.created_at, x.id), '[]'::jsonb)
                  from public.financeiro_dividendos x where x.cliente_id = v_cli);
    if (select count(*) from public.financeiro_dividendos x where x.cliente_id = v_cli) <> coalesce(array_length(v_ids, 1), 0)
       or (select count(distinct u) from unnest(v_ids) u) <> coalesce(array_length(v_ids, 1), 0)
       or exists (select 1 from unnest(v_ids) u
                   where not exists (select 1 from public.financeiro_dividendos x where x.id = u and x.cliente_id = v_cli)) then
      perform public._fn_dividendo_recusar('lista_diferente', 'A lista não é a dos dividendos deste cliente: recarregue a tela e tente de novo.', v_antes);
    end if;
    perform set_config('app.dividendo_escritor', 'on', true);
    update public.financeiro_dividendos x set ordem_exibicao = o.pos - 1
      from unnest(v_ids) with ordinality o(id, pos)
     where x.id = o.id and x.cliente_id = v_cli and x.ordem_exibicao is distinct from o.pos - 1;
    perform set_config('app.dividendo_escritor', 'off', true);
    return jsonb_build_object('antes', v_antes, 'recusa', null, 'depois',
      (select coalesce(jsonb_agg(x.id order by x.ordem_exibicao, x.created_at, x.id), '[]'::jsonb)
         from public.financeiro_dividendos x where x.cliente_id = v_cli));
  end if;

  if p_op <> 'criar' then
    select * into d from public.financeiro_dividendos x where x.id = v_id for update;
    v_antes := public._fn_dividendo_foto(v_id);
    v_sub_ant := public._fn_dividendo_subcentro(d.nome);
    if p_op in ('inativar', 'reativar') then v_nome := btrim(d.nome); end if;
  end if;
  v_sub := public._fn_dividendo_subcentro(v_nome);

  -- ── o nome (criar, renomear, reativar): vazio, D3 e D2 ──
  if p_op in ('criar', 'renomear', 'reativar') then
    if v_nome = '' then perform public._fn_dividendo_recusar('nome_vazio', 'Informe o nome do dividendo.', v_antes); end if;
    if p_op = 'renomear' and v_nome = d.nome then perform public._fn_dividendo_recusar('mesmo_nome', 'O nome não mudou.', v_antes); end if;
    if p_op = 'reativar' and d.ativo then perform public._fn_dividendo_recusar('ja_ativo', 'Este dividendo já está ativo.', v_antes); end if;
    if exists (select 1 from public.financeiro_dividendos x
                where x.cliente_id = v_cli and x.ativo and lower(btrim(x.nome)) = lower(v_nome) and x.id is distinct from v_id) then
      perform public._fn_dividendo_recusar('nome_repetido',
        case when p_op = 'reativar' then 'Já existe um dividendo ativo com este nome: este não pode ser reativado.'
             else 'Já existe um dividendo ativo com este nome.' end, v_antes);
    end if;
    select p.subcentro into v_fora from public.financeiro_plano_contas p
     where p.ativo and p.macro_custo <> 'Dividendos' and (p.cliente_id is null or p.cliente_id = v_cli)
       and lower(btrim(p.subcentro)) = lower(v_sub) limit 1;
    if v_fora is not null then
      perform public._fn_dividendo_recusar('nome_de_outra_conta',
        format('O plano de contas já tem a conta «%s», que não é de dividendos: escolha outro nome.', v_fora), v_antes);
    end if;
  end if;

  if p_op = 'criar' then
    perform public._fn_dividendo_garantir_conta(v_cli, v_sub);
    perform set_config('app.dividendo_escritor', 'on', true);
    insert into public.financeiro_dividendos (cliente_id, nome, ativo, ordem_exibicao)
    values (v_cli, v_nome, true, coalesce((select max(x.ordem_exibicao) from public.financeiro_dividendos x where x.cliente_id = v_cli), -1) + 1)
    returning id into v_id;
    perform set_config('app.dividendo_escritor', 'off', true);
    return jsonb_build_object('antes', null, 'depois', public._fn_dividendo_foto(v_id), 'recusa', null);

  elsif p_op = 'renomear' then
    v_conta := public._fn_dividendo_conta_atual(v_cli, v_sub_ant);
    if exists (select 1 from public.financeiro_plano_contas p where p.id = v_conta and p.cliente_id is null) then      -- D5
      perform public._fn_dividendo_recusar('usa_conta_geral', 'Este dividendo usa uma conta geral do plano e ainda não pode ser renomeado.', v_antes);
    end if;
    if exists (select 1 from public.financeiro_plano_contas p
                where p.ativo and p.cliente_id is null and p.macro_custo = 'Dividendos' and p.subcentro = v_sub) then
      perform public._fn_dividendo_recusar('nome_de_conta_geral', 'Já existe uma conta geral do plano com este nome: o dividendo não pode ser renomeado para ele.', v_antes);
    end if;
    if exists (select 1 from public.financeiro_plano_contas p
                where p.ativo and p.cliente_id = v_cli and p.macro_custo = 'Dividendos' and p.subcentro = v_sub and p.id is distinct from v_conta) then
      perform public._fn_dividendo_recusar('nome_em_uso_no_plano', 'Já existe no plano deste cliente uma conta de dividendos com este nome, de um dividendo inativo que ainda tem lançamentos.', v_antes);
    end if;
    if v_conta is not null then
      select count(*) into v_n from public.financeiro_lancamentos_v2 l where l.plano_conta_id = v_conta and l.subcentro is distinct from v_sub;
      update public.financeiro_plano_contas set subcentro = v_sub where id = v_conta;
    end if;
    if d.ativo then perform public._fn_dividendo_garantir_conta(v_cli, v_sub); end if;
    perform set_config('app.dividendo_escritor', 'on', true);
    update public.financeiro_dividendos set nome = v_nome where id = v_id;
    perform set_config('app.dividendo_escritor', 'off', true);
    return jsonb_build_object('antes', v_antes, 'depois', public._fn_dividendo_foto(v_id), 'recusa', null, 'lancamentos_tocados', v_n);

  elsif p_op = 'inativar' then
    if not d.ativo then perform public._fn_dividendo_recusar('ja_inativo', 'Este dividendo já está inativo.', v_antes); end if;
    perform set_config('app.dividendo_escritor', 'on', true);
    update public.financeiro_dividendos set ativo = false where id = v_id;
    perform set_config('app.dividendo_escritor', 'off', true);
    select p.id into v_conta from public.financeiro_plano_contas p
     where p.ativo and p.cliente_id = v_cli and p.macro_custo = 'Dividendos' and p.subcentro = v_sub_ant limit 1;
    if v_conta is null then
      v_acao := case when (v_antes->'conta'->>'geral')::boolean then 'geral' else 'sem_conta' end;
    else
      select count(*) into v_n from public.financeiro_lancamentos_v2 l where l.plano_conta_id = v_conta and not coalesce(l.cancelado, false);
      if v_n = 0 then
        update public.financeiro_plano_contas set ativo = false where id = v_conta;
        v_acao := 'inativada';
      else
        v_acao := 'mantida';
      end if;
    end if;
    return jsonb_build_object('antes', v_antes, 'depois', public._fn_dividendo_foto(v_id), 'recusa', null,
                              'conta_acao', v_acao, 'lancamentos_que_seguram', v_n);

  elsif p_op = 'reativar' then
    perform public._fn_dividendo_garantir_conta(v_cli, v_sub);
    perform set_config('app.dividendo_escritor', 'on', true);
    update public.financeiro_dividendos set ativo = true where id = v_id;
    perform set_config('app.dividendo_escritor', 'off', true);
    return jsonb_build_object('antes', v_antes, 'depois', public._fn_dividendo_foto(v_id), 'recusa', null);
  end if;
  raise exception 'operacao desconhecida: %', p_op;
end $f$;
