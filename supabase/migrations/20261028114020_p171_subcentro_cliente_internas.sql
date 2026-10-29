-- P171 REPASSE-TERCEIROS-01 (parte A) — AS INTERNAS DO ESCRITOR UNICO DOS SUBCENTROS DO CLIENTE (Gabriel, 29/10/2026).
-- O mesmo molde dos dividendos (D5): o subcentro e' uma CONTA DO CLIENTE em `financeiro_plano_contas` (cliente_id preenchido), na
-- hierarquia fixa do molde; nada de tabela paralela e nada de linha geral. So' funcoes FECHADAS (`_fn_subcentro_cliente_*`): nenhuma
-- tela as chama e nenhum dado e' escrito aqui. As publicas, com a regra inteira no cabecalho, estao na parte B (20261028114030).
-- (Duas migrations porque o canal de escrita recusa carga acima de ~13 KB.)
-- GESTO CONTRARIO: DROP das cinco funcoes `_fn_subcentro_cliente_*` desta migration.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- os moldes: um centro passa a aceitar subcentro do cliente com UMA linha aqui (por migration)
CREATE FUNCTION public._fn_subcentro_cliente_molde(p_molde text)
 RETURNS TABLE (tipo_operacao text, macro_custo text, grupo_custo text, centro_custo text, escopo_negocio text, compoe_dre boolean, ordem_exibicao int)
 LANGUAGE sql IMMUTABLE AS $f$
  select m.tipo_operacao, m.macro_custo, m.grupo_custo, m.centro_custo, m.escopo_negocio, m.compoe_dre, m.ordem_exibicao from (values
    ('repasses_terceiros', '2-Saídas', 'Saída Financeira', 'Outras Saídas', 'Repasses a terceiros', 'administrativo', false, 16006)
  ) m(chave, tipo_operacao, macro_custo, grupo_custo, centro_custo, escopo_negocio, compoe_dre, ordem_exibicao)
  where m.chave = p_molde $f$;

-- a chave do molde de uma conta do cliente (nula = a conta nao e' de molde nenhum)
CREATE FUNCTION public._fn_subcentro_cliente_molde_da_conta(p_id uuid) RETURNS text
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select k.chave from public.financeiro_plano_contas p
   cross join (values ('repasses_terceiros')) k(chave)
   cross join lateral public._fn_subcentro_cliente_molde(k.chave) m
   where p.id = p_id and p.cliente_id is not null
     and p.tipo_operacao = m.tipo_operacao and p.macro_custo = m.macro_custo
     and coalesce(p.grupo_custo, '') = m.grupo_custo and p.centro_custo = m.centro_custo
   limit 1 $f$;

CREATE FUNCTION public._fn_subcentro_cliente_foto(p_id uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select jsonb_build_object('id', p.id, 'cliente_id', p.cliente_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'ativo', p.ativo,
           'lancamentos_vivos', (select count(*) from public.financeiro_lancamentos_v2 l
                                  where l.cliente_id = p.cliente_id and l.plano_conta_id = p.id and not coalesce(l.cancelado, false)))
    from public.financeiro_plano_contas p where p.id = p_id $f$;

CREATE FUNCTION public._fn_subcentro_cliente_recusar(p_motivo text, p_frase text, p_antes jsonb DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql AS $f$
begin
  raise exception using errcode = 'SCREC', message = p_frase, detail = p_motivo, hint = coalesce(p_antes::text, 'null');
end $f$;

CREATE FUNCTION public._fn_subcentro_cliente_executar(p_op text, p_a jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
declare
  v_id uuid := nullif(p_a->>'id', '')::uuid;
  v_nome text := btrim(coalesce(p_a->>'nome', ''));
  v_chave text; v_cli uuid; m record; c public.financeiro_plano_contas; v_antes jsonb; v_outra text; v_n int := 0;
begin
  if p_op = 'criar' then
    v_chave := p_a->>'molde';
    v_cli := (p_a->>'cliente_id')::uuid;
    if not exists (select 1 from public.clientes x where x.id = v_cli) then
      perform public._fn_subcentro_cliente_recusar('cliente_inexistente', 'Cliente não encontrado.');
    end if;
  else
    select * into c from public.financeiro_plano_contas x where x.id = v_id;
    v_chave := public._fn_subcentro_cliente_molde_da_conta(v_id);
    if v_chave is null then
      perform public._fn_subcentro_cliente_recusar('nao_e_subcentro_do_cliente', 'Esta conta não é um subcentro do cliente: ela só se altera pelo plano de contas.');
    end if;
    v_cli := c.cliente_id;
  end if;
  select * into m from public._fn_subcentro_cliente_molde(v_chave);
  if m.centro_custo is null then
    perform public._fn_subcentro_cliente_recusar('molde_desconhecido', 'Este centro não aceita subcentro do cliente.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('subcentro_cliente|' || v_cli::text || '|' || v_chave, 0));
  if p_op <> 'criar' then
    select * into c from public.financeiro_plano_contas x where x.id = v_id for update;
    v_antes := public._fn_subcentro_cliente_foto(v_id);
    if p_op in ('inativar', 'reativar') then v_nome := btrim(c.subcentro); end if;
  end if;

  -- o nome (criar, renomear, reativar)
  if p_op in ('criar', 'renomear', 'reativar') then
    if v_nome = '' then perform public._fn_subcentro_cliente_recusar('nome_vazio', 'Informe o nome do subcentro.', v_antes); end if;
    if length(v_nome) > 60 then perform public._fn_subcentro_cliente_recusar('nome_longo', 'O nome do subcentro tem no máximo 60 letras.', v_antes); end if;
    if p_op = 'renomear' and v_nome = c.subcentro then perform public._fn_subcentro_cliente_recusar('mesmo_nome', 'O nome não mudou.', v_antes); end if;
    if p_op = 'reativar' and c.ativo then perform public._fn_subcentro_cliente_recusar('ja_ativo', 'Este subcentro já está ativo.', v_antes); end if;
    if p_op = 'criar' and exists (select 1 from public.financeiro_plano_contas p
                where p.cliente_id = v_cli and p.ativo is not true and p.tipo_operacao = m.tipo_operacao and p.macro_custo = m.macro_custo
                  and p.grupo_custo = m.grupo_custo and p.centro_custo = m.centro_custo and lower(btrim(p.subcentro)) = lower(v_nome)) then
      perform public._fn_subcentro_cliente_recusar('existe_inativo', 'Já existe um subcentro inativo com este nome neste centro: reative-o.', v_antes);
    end if;
    -- o seletor mostra o subcentro pelo nome: nenhuma outra conta ativa do plano deste cliente (geral ou dele) pode ter o mesmo
    select p.subcentro into v_outra from public.financeiro_plano_contas p
     where p.ativo and (p.cliente_id is null or p.cliente_id = v_cli) and p.id is distinct from v_id
       and lower(btrim(p.subcentro)) = lower(v_nome) limit 1;
    if v_outra is not null then
      perform public._fn_subcentro_cliente_recusar('nome_em_uso',
        format('O plano de contas deste cliente já tem a conta «%s»: escolha outro nome.', v_outra), v_antes);
    end if;
  end if;

  perform set_config('app.motivo', 'P171 subcentro do cliente: ' || p_op, true);
  if p_op = 'criar' then
    insert into public.financeiro_plano_contas
      (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao, compoe_dre)
    values (v_cli, m.tipo_operacao, m.macro_custo, m.grupo_custo, m.centro_custo, v_nome, m.escopo_negocio, true, m.ordem_exibicao, m.compoe_dre)
    returning id into v_id;
    return jsonb_build_object('antes', null, 'depois', public._fn_subcentro_cliente_foto(v_id), 'recusa', null);
  elsif p_op = 'renomear' then
    -- o gatilho `trg_propagar_plano_para_lancamentos` leva o nome novo aos lancamentos da conta (so' o texto; a chave nao muda)
    select count(*) into v_n from public.financeiro_lancamentos_v2 l where l.plano_conta_id = v_id and l.subcentro is distinct from v_nome;
    update public.financeiro_plano_contas set subcentro = v_nome where id = v_id;
    return jsonb_build_object('antes', v_antes, 'depois', public._fn_subcentro_cliente_foto(v_id), 'recusa', null, 'lancamentos_tocados', v_n);
  elsif p_op = 'inativar' then
    if not c.ativo then perform public._fn_subcentro_cliente_recusar('ja_inativo', 'Este subcentro já está inativo.', v_antes); end if;
    -- os lancamentos da conta ficam nela, intactos; o seletor deixa de oferece^-la
    update public.financeiro_plano_contas set ativo = false where id = v_id;
    return jsonb_build_object('antes', v_antes, 'depois', public._fn_subcentro_cliente_foto(v_id), 'recusa', null);
  elsif p_op = 'reativar' then
    update public.financeiro_plano_contas set ativo = true where id = v_id;
    return jsonb_build_object('antes', v_antes, 'depois', public._fn_subcentro_cliente_foto(v_id), 'recusa', null);
  end if;
  raise exception 'operacao desconhecida: %', p_op;
end $f$;

REVOKE ALL ON FUNCTION public._fn_subcentro_cliente_molde(text), public._fn_subcentro_cliente_molde_da_conta(uuid),
  public._fn_subcentro_cliente_foto(uuid), public._fn_subcentro_cliente_recusar(text, text, jsonb),
  public._fn_subcentro_cliente_executar(text, jsonb) FROM PUBLIC, anon, authenticated;
