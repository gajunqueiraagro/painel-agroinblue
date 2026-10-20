-- FIN-POS-FIXADO-01b (Gabriel, 20/10/2026) — o juro real da parcela pos-fixada entra quando o extrato e' casado.
-- Em contrato pos o banco debita principal + juro real; o juro programado e' estimativa (a marca do 01a).
-- (1) DONO NOVO `fn_financiamento_parcela_pos_pagar(extrato, parcela, simular)`: parcela de contrato `tipo_taxa = 'pos'`, com o principal e
--     os juros programados, casada com UMA linha de debito do extrato. Juro real = |extrato| − principal − encargos da parcela. O principal
--     nunca muda. Negativo recusa ("o extrato é menor que o principal da parcela; case como pagamento parcial"). Reaproveita
--     `fn_espelho_casar` (vinculo e realizacao); o valor dos juros chega a' parcela pelo gatilho de sempre (`_fn_parcela_acompanha_lancamento`)
--     e a parcela fica paga pelo gatilho do FIN-PARCELA-STATUS-01 — o dono NAO grava status nem quita. `ajustada` nao e' tocada.
--     TRILHA FORA de `financiamento_parcelas_operacoes` (para nao entrar no "Desfazer a ultima"): uma linha em `audit_log` (acao
--     'juro_real_pelo_extrato', tabela 'financiamento_parcelas') com o motivo "juro real pelo extrato de dd/mm/aaaa" no resumo e em
--     `dados_novos.motivo` — o audit_log nao tem coluna de motivo; a convencao da casa e' o resumo (AUDIT-DELETE-01a). Autor = quem esta'
--     logado (gatilho `trg_trilha_autor`). Simulacao = gravacao (SQLSTATE 'PPSIM').
-- (2) `fn_conciliar_bloco` (patch guardado por md5): bloco com lancamento de parcela pos com juros estimado e soma diferente recusa com
--     "parcela_pos: Parcela de contrato pós-fixado: case pelo modal da linha do extrato para gravar o juro real." (antes das recusas de
--     soma). Bloco que fecha ao centavo segue como era.
set local lock_timeout = '2s';

create or replace function public.fn_financiamento_parcela_pos_pagar(p_extrato_id uuid, p_parcela_id uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $f$
declare
  v_ext record; v_par record; v_fin record; v_lp record; v_lj record; v_dep record;
  v_principal numeric; v_encargos numeric; v_juro numeric;
  v_rec_m text; v_rec_f text; v_base jsonb; v_casar jsonb; v_motivo text; v_ret jsonb;
begin
  perform public._fn_exigir_tenant_das_linhas(array[(select e.cliente_id from public.extrato_bancario_v2 e where e.id = p_extrato_id),
                                                    (select q.cliente_id from public.financiamento_parcelas q where q.id = p_parcela_id)]);
  select * into v_ext from public.extrato_bancario_v2 where id = p_extrato_id;
  select * into v_par from public.financiamento_parcelas where id = p_parcela_id;
  select * into v_fin from public.financiamentos where id = v_par.financiamento_id;
  select * into v_lp from public.financeiro_lancamentos_v2 where id = v_par.lancamento_id;
  select * into v_lj from public.financeiro_lancamentos_v2 where id = v_par.lancamento_juros_id;
  v_principal := abs(v_lp.valor); v_encargos := coalesce(v_par.valor_encargos, 0);
  v_juro := round(abs(v_ext.valor) - coalesce(v_principal, 0) - v_encargos, 2);

  if v_fin.tipo_taxa is distinct from 'pos' then
    v_rec_m := 'nao_pos'; v_rec_f := 'Só vale para parcela de contrato pós-fixado.';
  elsif v_par.status in ('pago', 'cancelado') then
    v_rec_m := 'parcela_fechada'; v_rec_f := format('A parcela %s já está %s.', v_par.numero_parcela, case when v_par.status = 'pago' then 'paga' else 'cancelada' end);
  elsif v_lp.id is null or v_lj.id is null or coalesce(v_lp.cancelado, false) or coalesce(v_lj.cancelado, false) then
    v_rec_m := 'sem_lancamentos'; v_rec_f := format('A parcela %s precisa do lançamento do principal e do de juros, vivos.', v_par.numero_parcela);
  elsif v_lp.status_transacao in ('realizado', 'conciliado') or v_lj.status_transacao in ('realizado', 'conciliado') then
    v_rec_m := 'ja_realizado'; v_rec_f := format('O principal ou os juros da parcela %s já estão realizados.', v_par.numero_parcela);
  elsif v_ext.id is null or v_ext.cancelado_em is not null then
    v_rec_m := 'extrato_inativo'; v_rec_f := 'O extrato não existe ou está cancelado.';
  elsif v_ext.valor >= 0 then
    v_rec_m := 'extrato_nao_debito'; v_rec_f := 'O extrato tem de ser um débito (saída) para pagar a parcela.';
  elsif exists (select 1 from public.conciliacao_bancaria_itens c where c.extrato_id = p_extrato_id and c.desfeito_em is null) then
    v_rec_m := 'extrato_ja_conciliado'; v_rec_f := 'Este extrato já está conciliado.';
  elsif v_encargos <> 0 then
    v_rec_m := 'encargos'; v_rec_f := format('A parcela %s tem encargos sem lançamento próprio: ainda não se casa por aqui.', v_par.numero_parcela);
  elsif v_juro < 0 then
    v_rec_m := 'extrato_menor'; v_rec_f := 'o extrato é menor que o principal da parcela; case como pagamento parcial';
  elsif v_juro = 0 then
    v_rec_m := 'sem_juro'; v_rec_f := 'o extrato é igual ao principal da parcela: não há juro a gravar; case como pagamento parcial';
  end if;

  v_base := jsonb_build_object(
    'parcela', jsonb_build_object('id', v_par.id, 'numero', v_par.numero_parcela, 'principal_id', v_lp.id, 'juros_id', v_lj.id,
                                  'principal', v_principal, 'juros_estimado', abs(v_lj.valor), 'encargos', v_encargos, 'juro_real', v_juro),
    'extrato', jsonb_build_object('id', v_ext.id, 'data', v_ext.data_movimento, 'valor', v_ext.valor),
    'no_extrato', v_ext.valor);
  if v_rec_m is not null then
    if p_simular then
      return v_base || jsonb_build_object('ok', false, 'simulado', true, 'recusa', jsonb_build_object('motivo', v_rec_m, 'frase', v_rec_f));
    end if;
    raise exception using errcode = 'P0001', message = v_rec_f || ' Nada foi gravado.';
  end if;

  v_motivo := 'juro real pelo extrato de ' || to_char(v_ext.data_movimento, 'DD/MM/YYYY');
  begin
    v_casar := public.fn_espelho_casar(p_extrato_id, jsonb_build_array(
                 jsonb_build_object('lancamento_id', v_lp.id, 'valor', v_principal),
                 jsonb_build_object('lancamento_id', v_lj.id, 'valor', v_juro)), false, 'juro_real_pos_fixado');
    if not coalesce((v_casar->>'ok')::boolean, false) then
      raise exception using errcode = 'P0001', message = format('O casamento foi recusado (%s). Nada foi gravado.', coalesce(v_casar->>'motivo', '-'));
    end if;
    select * into v_dep from public.financiamento_parcelas where id = p_parcela_id;
    insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos)
    values (v_par.cliente_id, v_lj.fazenda_id, auth.uid(), 'financeiro', 'juro_real_pelo_extrato', 'financiamento_parcelas', v_par.id,
            'motivo: ' || v_motivo,
            jsonb_build_object('valor_principal', v_par.valor_principal, 'valor_juros', v_par.valor_juros, 'valor_total', v_par.valor_total,
                               'status', v_par.status, 'lancamento_juros_valor', abs(v_lj.valor)),
            jsonb_build_object('valor_principal', v_dep.valor_principal, 'valor_juros', v_dep.valor_juros, 'valor_total', v_dep.valor_total,
                               'status', v_dep.status, 'lancamento_juros_valor', v_juro, 'extrato_id', p_extrato_id, 'motivo', v_motivo));
    v_ret := v_base || jsonb_build_object('ok', true, 'simulado', p_simular, 'soma', v_ext.valor, 'motivo', v_motivo,
               'depois', jsonb_build_object('status', v_dep.status, 'valor_principal', v_dep.valor_principal, 'valor_juros', v_dep.valor_juros,
                                            'valor_total', v_dep.valor_total, 'data_pagamento', v_dep.data_pagamento));
    if p_simular then raise exception using errcode = 'PPSIM', message = v_ret::text; end if;
  exception when sqlstate 'PPSIM' then
    return sqlerrm::jsonb;
  end;
  return v_ret;
end $f$;
revoke all on function public.fn_financiamento_parcela_pos_pagar(uuid, uuid, boolean) from public, anon;
grant execute on function public.fn_financiamento_parcela_pos_pagar(uuid, uuid, boolean) to authenticated, service_role;

do $mig$
declare v_oid oid := 'public.fn_conciliar_bloco(uuid[], uuid[], text, boolean)'::regprocedure; v_src text; v_new text; v_acl text;
        a1 text := $a$  c_tol constant numeric := 0.005;
$a$;
        a2 text := $a$    l_id := l_id || r.id; l_desc := l_desc || coalesce(r.descricao, ''); l_saldo := l_saldo || r.saldo_livre;
$a$;
        a3 text := $a$  -- ── a regra
$a$;
begin
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '719372f3833c21aa4dc88b5f7f9b9045' then
    if md5(v_src) <> '8a108ebfa54d5502308983b7c99965b2' then raise exception 'bloco: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    if (length(v_new) - length(replace(v_new, a1, ''))) / length(a1) <> 1 then raise exception 'ancora A1 nao casa 1x'; end if;
    if (length(v_new) - length(replace(v_new, a2, ''))) / length(a2) <> 1 then raise exception 'ancora A2 nao casa 1x'; end if;
    if (length(v_new) - length(replace(v_new, a3, ''))) / length(a3) <> 1 then raise exception 'ancora A3 nao casa 1x'; end if;
    v_new := replace(v_new, a1, a1 || $a$  v_tem_pos boolean := false;  -- FIN-POS-FIXADO-01b: ha' lancamento de parcela pos com juros estimado no bloco
$a$);
    v_new := replace(v_new, a2, $a$    IF NOT v_tem_pos AND EXISTS (SELECT 1 FROM financiamento_parcelas fp JOIN financiamentos ff ON ff.id = fp.financiamento_id
                                   LEFT JOIN financeiro_lancamentos_v2 fj ON fj.id = fp.lancamento_juros_id
                                  WHERE r.id IN (fp.lancamento_id, fp.lancamento_juros_id)
                                    AND public._fn_juros_estimado(ff.tipo_taxa, fp.status, fj.status_transacao)) THEN
      v_tem_pos := true;
    END IF;
$a$ || a2);
    v_new := replace(v_new, a3, $a$  -- FIN-POS-FIXADO-01b: o juro real da parcela pos se grava pelo modal da linha do extrato (fn_financiamento_parcela_pos_pagar);
  -- o bloco nao muda juros, e com soma diferente deixaria a parcela parcial com a falta em aberto
  IF v_tem_pos AND abs(v_soma_ext - v_soma_lan) > c_tol THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'parcela_pos: Parcela de contrato pós-fixado: case pelo modal da linha do extrato para gravar o juro real.';
  END IF;
$a$ || a3);
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '719372f3833c21aa4dc88b5f7f9b9045' then raise exception 'bloco: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'bloco: ACL mudou'; end if;
  end if;
end $mig$;
