-- P171 REPASSE-TERCEIROS-01 (parte B) — O ESCRITOR UNICO DOS SUBCENTROS DO CLIENTE: AS PUBLICAS (Gabriel, 29/10/2026).
-- Decisoes do Gabriel (29/10): D1 so' a SAIDA (sem par de entrada); D2 a venda entra INTEIRA no DRE, nada se divide; D3 SEM nome de
-- pessoa no subcentro (o funcionario e' o FAVORECIDO do lancamento); D4 o centro e' "Repasses a terceiros"; D5 o MESMO molde dos
-- dividendos: conta do cliente em `financeiro_plano_contas`, escritor unico com simular, `compoe_dre false`, escopo administrativo.
-- O MOLDE (parte A, `_fn_subcentro_cliente_molde`): 2-Saídas › Saída Financeira › Outras Saídas › Repasses a terceiros › <nome livre>,
--   ordem 16006 (entre Ajustes 16005 e Amortizações 16010). Fora do DRE pela linha (`compoe_dre false`, copiada ao lancamento por
--   `materializar_dre_lcdpr_from_plano`) e pelo macro (`fn_compoe_dre_por_macro`). `grupo_fluxo` vem do gatilho do plano.
--   Sem linha geral: o centro aparece no cliente quando o consultor cria o primeiro subcentro dele.
-- QUEM ESCREVE: SO' O ADMIN AGROINBLUE (`is_admin_agroinblue(auth.uid())`); membro do cliente (qualquer perfil) e' recusado com 42501.
--   ⚠ Diferente dos dividendos (`_fn_dividendo_rodar` pede so' `tenant_ok`): pendencia registrada, os dividendos NAO mudam aqui.
-- REGRAS DO NOME: sem espaco nas pontas, nao vazio, ate' 60 letras; nenhuma outra conta ATIVA do plano do cliente (geral ou dele, de
--   qualquer centro) com o mesmo nome (sem caixa) — o seletor mostra o subcentro pelo nome; criar com um INATIVO de mesmo nome no centro
--   recusa ("reative-o").
-- OPERACOES: criar (cliente, molde, nome), renomear (id, nome), inativar (id), reativar (id). Nao ha' excluir (`trg_sem_delete_direto`).
--   Renomear: o gatilho `trg_propagar_plano_para_lancamentos` leva o nome novo ao texto dos lancamentos da conta (a chave
--   `plano_conta_id` nao muda); `lancamentos_tocados` e' a contagem. Inativar: os lancamentos ficam na conta, intactos.
--   Conta que nao e' do molde (geral, de dividendo, qualquer outra) e' recusada: so' se altera pelo plano de contas.
-- SIMULACAO = GRAVACAO: `p_simular` executa o MESMO caminho e desfaz (SQLSTATE 'SCSIM'). Recusa = 'SCREC' no corpo; na simulacao volta
--   em `recusa {motivo, frase}`, na gravacao vira P0001 com a frase + "Nada foi gravado.". Retorno: {antes, depois, recusa}.
-- TRILHA: `trg_trilha_registro` grava no `audit_log` (autor = quem esta' logado; motivo "P171 subcentro do cliente: <op>").
-- NESTA MIGRATION: 0 linhas do plano, 0 lancamentos. DRE, caixa e dividendos com os mesmos numeros antes x depois.
-- GESTO CONTRARIO: DROP das quatro `fn_subcentro_cliente_*` e de `_fn_subcentro_cliente_rodar` (e a parte A). Contas ja' criadas
--   ficam (inativar pelo plano), porque nada se apaga do plano.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- a casca: so' o admin, simulacao que desfaz, recusa em frase
CREATE FUNCTION public._fn_subcentro_cliente_rodar(p_op text, p_a jsonb, p_simular boolean) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
declare v jsonb; v_frase text; v_motivo text; v_hint text;
begin
  if not coalesce(public.is_admin_agroinblue(auth.uid()), false) then
    raise exception using errcode = '42501', message = 'Só o consultor AGROinBLUE cria e altera os subcentros do cliente.';
  end if;
  begin
    v := public._fn_subcentro_cliente_executar(p_op, p_a);
    if coalesce(p_simular, false) then raise exception using errcode = 'SCSIM', message = v::text; end if;
    return v;
  exception
    when sqlstate 'SCSIM' then
      return sqlerrm::jsonb;
    when sqlstate 'SCREC' then
      get stacked diagnostics v_frase = message_text, v_motivo = pg_exception_detail, v_hint = pg_exception_hint;
    when unique_violation then
      v_frase := 'Já existe uma conta do plano com esta classificação e este nome.'; v_motivo := 'banco'; v_hint := 'null';
  end;
  if coalesce(p_simular, false) then
    return jsonb_build_object('antes', v_hint::jsonb, 'depois', null, 'recusa', jsonb_build_object('motivo', v_motivo, 'frase', v_frase));
  end if;
  raise exception using errcode = 'P0001', message = v_frase || ' Nada foi gravado.';
end $f$;

CREATE FUNCTION public.fn_subcentro_cliente_criar(p_cliente_id uuid, p_molde text, p_nome text, p_simular boolean DEFAULT false) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select public._fn_subcentro_cliente_rodar('criar', jsonb_build_object('cliente_id', p_cliente_id, 'molde', p_molde, 'nome', p_nome), p_simular) $f$;
CREATE FUNCTION public.fn_subcentro_cliente_renomear(p_id uuid, p_nome text, p_simular boolean DEFAULT false) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select public._fn_subcentro_cliente_rodar('renomear', jsonb_build_object('id', p_id, 'nome', p_nome), p_simular) $f$;
CREATE FUNCTION public.fn_subcentro_cliente_inativar(p_id uuid, p_simular boolean DEFAULT false) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select public._fn_subcentro_cliente_rodar('inativar', jsonb_build_object('id', p_id), p_simular) $f$;
CREATE FUNCTION public.fn_subcentro_cliente_reativar(p_id uuid, p_simular boolean DEFAULT false) RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
  select public._fn_subcentro_cliente_rodar('reativar', jsonb_build_object('id', p_id), p_simular) $f$;

REVOKE ALL ON FUNCTION public._fn_subcentro_cliente_rodar(text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_subcentro_cliente_criar(uuid, text, text, boolean), public.fn_subcentro_cliente_renomear(uuid, text, boolean),
  public.fn_subcentro_cliente_inativar(uuid, boolean), public.fn_subcentro_cliente_reativar(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_subcentro_cliente_criar(uuid, text, text, boolean), public.fn_subcentro_cliente_renomear(uuid, text, boolean),
  public.fn_subcentro_cliente_inativar(uuid, boolean), public.fn_subcentro_cliente_reativar(uuid, boolean) TO authenticated, service_role;

-- ── guarda de destino: as publicas abertas so' a `authenticated`, as internas fechadas; nenhuma linha do plano mudou ──
DO $acl$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f, p.proname FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.proname ~ '^_?fn_subcentro_cliente_' LOOP
    v_n := v_n + 1;
    IF has_function_privilege('anon', r.f, 'EXECUTE')
       OR (r.proname LIKE '\_%') = has_function_privilege('authenticated', r.f, 'EXECUTE') THEN
      RAISE EXCEPTION 'P171: ACL inesperada em %', r.f;
    END IF;
  END LOOP;
  IF v_n <> 10 THEN RAISE EXCEPTION 'P171: esperava 10 funcoes fn_subcentro_cliente, ha'' %.', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_plano_contas WHERE centro_custo = 'Repasses a terceiros') THEN
    RAISE EXCEPTION 'P171: ja'' ha'' conta "Repasses a terceiros" no plano (estado declarado: nenhuma).';
  END IF;
END
$acl$;
