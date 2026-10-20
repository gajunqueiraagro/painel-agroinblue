-- FIN-POS-FIXADO-01b, guarda (Gabriel, 20/10/2026) — so' o dono grava o juro real da parcela pos-fixada.
-- `fn_espelho_casar` chamada direto com o lancamento de JUROS de parcela de contrato `tipo_taxa = 'pos'` ainda estimado
-- (`_fn_juros_estimado`) recusa: {ok: false, motivo: 'parcela_pos', frase: "Parcela de contrato pós-fixado: case pelo modal da linha do
-- extrato para gravar o juro real."}. O dono `fn_financiamento_parcela_pos_pagar` liga a marca `app.pos_pagar = 'on'` (local da transacao)
-- so' em volta da sua chamada e a desliga logo depois — o padrao de `app.parcelamento_escritor` / `app.dividendo_escritor`.
-- Patches guardados por md5 (origem, ancora 1x, destino); ACL, SECURITY e search_path iguais.
set local lock_timeout = '2s';
do $mig$
declare
  v_oid oid; v_src text; v_new text; v_acl text;
  a1 text := $a$    IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens WHERE lancamento_id = v_lid AND desfeito_em IS NULL) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_conciliado', 'lancamento_id', v_lid);
    END IF;
$a$;
  a2 text := $a$    v_casar := public.fn_espelho_casar(p_extrato_id, jsonb_build_array($a$;
  a3 text := $a$, false, 'juro_real_pos_fixado');
$a$;
begin
  -- (1) fn_espelho_casar
  v_oid := 'public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '2ba254315dc550f80f8580a76a284534' then
    if md5(v_src) <> 'c1bdf39a40301005af35971207dd184a' then raise exception 'casar: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    if (length(v_new) - length(replace(v_new, a1, ''))) / length(a1) <> 1 then raise exception 'ancora casar nao casa 1x'; end if;
    execute replace(v_new, a1, a1 || $a$    -- FIN-POS-FIXADO-01b: o juro de parcela pos-fixada so' se grava pelo dono (fn_financiamento_parcela_pos_pagar)
    IF coalesce(current_setting('app.pos_pagar', true), '') <> 'on' AND EXISTS (
         SELECT 1 FROM financiamento_parcelas fp JOIN financiamentos ff ON ff.id = fp.financiamento_id
          WHERE fp.lancamento_juros_id = v_lid AND public._fn_juros_estimado(ff.tipo_taxa, fp.status, v_lan.status_transacao)) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'parcela_pos', 'lancamento_id', v_lid,
        'frase', 'Parcela de contrato pós-fixado: case pelo modal da linha do extrato para gravar o juro real.');
    END IF;
$a$);
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '2ba254315dc550f80f8580a76a284534' then raise exception 'casar: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'casar: ACL mudou'; end if;
  end if;

  -- (2) o dono liga a marca
  v_oid := 'public.fn_financiamento_parcela_pos_pagar(uuid, uuid, boolean)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '57ca18e80dadac3f2cf0e92d2cc44b25' then
    if md5(v_src) <> 'c15da84d18b092d3c137ab4f16d2bb15' then raise exception 'dono: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    if (length(v_new) - length(replace(v_new, a2, ''))) / length(a2) <> 1 then raise exception 'ancora dono A2 nao casa 1x'; end if;
    if (length(v_new) - length(replace(v_new, a3, ''))) / length(a3) <> 1 then raise exception 'ancora dono A3 nao casa 1x'; end if;
    v_new := replace(v_new, a2, $a$    perform set_config('app.pos_pagar', 'on', true);  -- FIN-POS-FIXADO-01b: a marca do dono, so' em volta desta chamada
$a$ || a2);
    v_new := replace(v_new, a3, a3 || $a$    perform set_config('app.pos_pagar', '', true);
$a$);
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '57ca18e80dadac3f2cf0e92d2cc44b25' then raise exception 'dono: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'dono: ACL mudou'; end if;
  end if;
end $mig$;
