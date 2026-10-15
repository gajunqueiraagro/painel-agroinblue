-- SEG-AGRI-TENANT-01 (Gabriel 15/10/2026) — guarda de cliente em 27 funcoes SECURITY DEFINER da agricultura e da auditoria.
-- Medido antes (Passo 1, transacao revertida, gestor so' do Agnaldo): 8 leituras devolviam dado do NJ e 9 escritas gravavam no NJ,
-- com a leitura direta das tabelas do NJ em 0 linhas (SECURITY DEFINER atravessa a RLS).
-- So' a guarda no inicio do corpo; tirando a guarda volta o corpo antigo EXATO (conferido aqui, funcao a funcao):
--   'cliente' (18): pelo parametro de cliente; plpgsql logo depois do `begin` (`BEGIN` na auditar_integridade);
--     LANGUAGE sql (5): primeira instrucao `select public._fn_exigir_tenant(<param>);` (a interna do SEG-DRE-TENANT-01).
--   'linha' (9, recebem so' o id): `perform public._fn_exigir_tenant_das_linhas(array[cliente de cada linha])`, molde 01A
--     (42501 se uma linha nao existe, se ha' clientes diferentes ou se tenant_ok e' falso); barter_abrir: fornecedor E fazenda.
-- Sem usuario tenant_ok e' falso: 42501. Admin passa. Nenhum cron, view ou edge function chama as 27; as chamadas entre elas
-- levam o JWT do usuario e rodam como o dono. ACL: sem PUBLIC/anon; authenticated + service_role, exceto
-- agri_venda_avulsa_registrar, agri_local_estoque_resolver e auditar_integridade_classificacao (sem chamador na tela): so' service_role.
-- Patch guardado por md5 (origem -> destino na lista); ancora 1x; assinatura, retorno, SECURITY DEFINER e search_path preservados.
-- GESTO CONTRARIO (escrito, nao executado): tirar a linha da guarda (ou o prefixo sql) conferindo o md5 de origem; reconceder
--   EXECUTE a authenticated nas tres.

SET LOCAL lock_timeout = '2s';

-- a guarda das que recebem so' o id (nasce fechada: so' postgres e service_role; quem a chama e' o dono das funcoes)
CREATE OR REPLACE FUNCTION public._fn_exigir_tenant_das_linhas(p_clientes uuid[])
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $f$
begin
  if coalesce(cardinality(p_clientes), 0) = 0
     or exists (select 1 from unnest(p_clientes) c where c is null)
     or (select count(distinct c) from unnest(p_clientes) c) <> 1
     or not coalesce(public.tenant_ok(p_clientes[1]), false) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
end
$f$;
REVOKE ALL ON FUNCTION public._fn_exigir_tenant_das_linhas(uuid[]) FROM PUBLIC, anon, authenticated;

DO $patch$
DECLARE
  -- nome, md5 origem, md5 destino, modo (cliente | linha), param (cliente) ou tabela:param[,tabela:param] (linha), so' service_role
  c_alvos constant text[][] := ARRAY[
    ['agri_carga_mandioca_registrar',     '5e04825cd17e6c748e59fff83ab84588', '4e2704564c44fb7ed5b6a7a8704e800c', 'cliente', 'p_cliente', ''],
    ['agri_venda_graos_registrar',        '2efafa0f9f1dd8f0c9e7287ff8d4106d', '18aee9da0ac3bce3e07d5bf47029f9b7', 'cliente', 'p_cliente', ''],
    ['agri_venda_graos_corrigir',         'a6ea6a3bb777758870fbedb9a11beae1', '34dd2b9353dac2751d69025160734135', 'cliente', 'p_cliente', ''],
    ['agri_quebra_registrar',             '6bd5e6308d55e1e9d8994f9689de4140', '4013bdab826e9f677f8fc2d1a82d100a', 'cliente', 'p_cliente', ''],
    ['agri_cotacao_graos_registrar',      '7b6b3f3ba903a43545db41312ee645c4', '8773c4b2a8cbd6d277ad9a9972dfb526', 'cliente', 'p_cliente', ''],
    ['agri_local_estoque_salvar',         'db10446910d7c0edb79b1c41d4f80c09', '0d4f79b996bd23507e7b814d6afdfd89', 'cliente', 'p_cliente', ''],
    ['agri_contrato_armazenagem_salvar',  'ed4d4ad0645e621a13b81ddae1f6c9ee', 'c6f05c96fb88efc72a662fa0cfca3ba7', 'cliente', 'p_cliente', ''],
    ['agri_venda_avulsa_registrar',       '8fdc3410ff0247b4aa57fe6c2e97f058', '23201cd15dc057b8352ba6f4c26467f6', 'cliente', 'p_cliente', 'S'],
    ['agri_local_estoque_resolver',       'daa8deefcb462a62bdd0b2dd4022a456', '5e3a482f311cc584a115c1107756307b', 'cliente', 'p_cliente', 'S'],
    ['fn_estoque_graos',                  'cc2855071053c82963d8fb33d4ad7f1c', '3a8374c53124a0133eeae24db69c89e3', 'cliente', 'p_cliente', ''],
    ['fn_estoque_graos_resumo',           '2adad44c9a2573e8d60dac67cbb4b587', '0b18681ccebe32b9b6977de44cee2881', 'cliente', 'p_cliente', ''],
    ['fn_estoque_graos_balanco',          'eea30132dc12f09eaf909359c2bd5f15', 'cd0634f5e8e09eb203c6fb1c9230dd8a', 'cliente', 'p_cliente', ''],
    ['fn_estoque_graos_por_local',        'd5d091031e17a98db60eb86697a69b0b', 'dcdaecd8b733f55464faaebe96a9e90d', 'cliente', 'p_cliente', ''],
    ['fn_locais_estoque',                 '5f3ac20913b8b4b1ce3b13e987529d80', 'a040f490ad518c125b7391b07e50e08a', 'cliente', 'p_cliente', ''],
    ['fn_vendas_graos',                   '04e7fbf530bf361e008be8e0b90a19ba', '5c02e652da13bda518d7e746fab793f7', 'cliente', 'p_cliente', ''],
    ['fn_estoque_movimentacoes',          '6bec8597d17bc037ee6eb05b39ec622e', '21cc078f4d7cdb3dc8a8e2b66585c8e2', 'cliente', 'p_cliente', ''],
    ['buscar_duplicados_retroativo',      'cf1d65f0cd4d55e262d355239bb5e28e', '4952190a62332b1ef5673e4df32b0246', 'cliente', '_cliente_id', ''],
    ['auditar_integridade_classificacao', 'b37813583241ca49e86c203a2f9d451c', '7f658b96052a544fcd34d086d3e546eb', 'cliente', '_cliente_id', 'S'],
    ['agri_carga_mandioca_cancelar',      '2b2ec10548ebd1c61011b4ebbfded565', '32f79c90d7072104a47d31503011b2c5', 'linha', 'agri_colheita:p_colheita_id', ''],
    ['agri_carga_mandioca_corrigir',      '978fc58c5c1720fb11d44d344bd0637c', '0510437016f540b1087d55a712ab03f0', 'linha', 'agri_colheita:p_colheita_id', ''],
    ['agri_quebra_cancelar',              '0849d3686072cc33214dc85953d2ea53', '2b3186cf1afe77c2f7b05cc1e6fe1fc6', 'linha', 'agri_estoque_movimentacoes:p_id', ''],
    ['agri_quebra_editar',                '8ce13f338b40c970324c9f24a657b0eb', 'b70c8c8ac0a5cd91f0198192c9ead239', 'linha', 'agri_estoque_movimentacoes:p_id', ''],
    ['agri_venda_avulsa_cancelar',        'fd7917de6ea56a9afea0c74cd1e37495', 'ac2f4f1d2fe1c6e39da882f138945ca3', 'linha', 'agri_operacoes_comerciais:p_op_id', ''],
    ['agri_venda_avulsa_editar',          'c621f06d97f074ab285fbde3b9b9f666', '369a2c293ab18fa7f577ff4ed65ace4d', 'linha', 'agri_operacoes_comerciais:p_op_id', ''],
    ['agri_barter_estornar_contrato',     'f39033a6cc9175e1db7aa46de78c43b0', '571a6a2b1ca2f9c325d86a4e6742a69c', 'linha', 'agri_barter_contratos:p_contrato_id', ''],
    ['agri_barter_materializar_contrato', 'bdb45b58497abb8ecdcab3f581e01588', 'e581e78fad1d38ac701b99998d67b0bd', 'linha', 'agri_barter_contratos:p_contrato_id', ''],
    ['agri_barter_abrir_contrato',        '0d587aa4c0b2cc225f086ec37f3ea9fa', '277c06097740475e8d7e55e5ca3f0c2b', 'linha', 'financeiro_fornecedores:p_parceiro_fornecedor_id,fazendas:p_fazenda_id', '']];
  i int; v_oid oid; v_src text; v_lang text; v_novo text; v_def text; v_sec boolean; v_cfg text[];
  v_anc text; v_guarda text; v_arr text;
BEGIN
  FOR i IN 1 .. array_length(c_alvos, 1) LOOP
    SELECT p.oid, p.prosrc, l.lanname, p.prosecdef, p.proconfig INTO v_oid, v_src, v_lang, v_sec, v_cfg
      FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = c_alvos[i][1];
    IF v_oid IS NULL THEN RAISE EXCEPTION 'SEG-AGRI-TENANT-01: % nao existe. Nada foi gravado.', c_alvos[i][1]; END IF;
    IF NOT v_sec THEN RAISE EXCEPTION 'SEG-AGRI-TENANT-01: % nao e'' SECURITY DEFINER', c_alvos[i][1]; END IF;
    IF c_alvos[i][4] = 'cliente' THEN
      v_guarda := format('if not coalesce(public.tenant_ok(%s), false) then raise exception ''acesso negado ao cliente'' using errcode = ''42501''; end if;', c_alvos[i][5]);
    ELSE
      SELECT string_agg(format('(select cliente_id from public.%I where id = %s)', split_part(x, ':', 1), split_part(x, ':', 2)), ', ')
        INTO v_arr FROM unnest(string_to_array(c_alvos[i][5], ',')) x;
      v_guarda := format('perform public._fn_exigir_tenant_das_linhas(array[%s]);', v_arr);
    END IF;
    v_anc := CASE WHEN c_alvos[i][1] = 'auditar_integridade_classificacao' THEN E'\nBEGIN\n' ELSE E'\nbegin\n' END;
    IF v_lang = 'plpgsql' THEN
      v_novo := replace(v_src, v_anc, v_anc || '  ' || v_guarda || E'\n');
    ELSIF v_lang = 'sql' AND c_alvos[i][4] = 'cliente' THEN
      v_novo := E'\nselect public._fn_exigir_tenant(' || c_alvos[i][5] || ');' || v_src;
    ELSE
      RAISE EXCEPTION 'SEG-AGRI-TENANT-01: linguagem % inesperada em %', v_lang, c_alvos[i][1];
    END IF;
    IF md5(v_src) IS DISTINCT FROM c_alvos[i][3] THEN
      IF md5(v_src) IS DISTINCT FROM c_alvos[i][2] THEN
        RAISE EXCEPTION 'SEG-AGRI-TENANT-01: corpo de % fora do estado medido (md5 %). Nada foi gravado.', c_alvos[i][1], md5(v_src); END IF;
      IF v_lang = 'plpgsql' AND (SELECT count(*) FROM regexp_matches(v_src, v_anc, 'g')) IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'SEG-AGRI-TENANT-01: ancora begin de % nao casa 1x', c_alvos[i][1]; END IF;
      IF md5(v_novo) IS DISTINCT FROM c_alvos[i][3] THEN
        RAISE EXCEPTION 'SEG-AGRI-TENANT-01: destino de % diverge (md5 %)', c_alvos[i][1], md5(v_novo); END IF;
      v_def := pg_get_functiondef(v_oid);
      IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'SEG-AGRI-TENANT-01: corpo de % nao aparece 1x na definicao', c_alvos[i][1]; END IF;
      EXECUTE replace(v_def, v_src, v_novo);
      -- conferencia: corpo, SECURITY DEFINER, search_path e o calculo (sem a guarda, o corpo antigo exato)
      IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM c_alvos[i][3]
         OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM true
         OR (SELECT proconfig FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
         OR md5((SELECT CASE WHEN v_lang = 'plpgsql' THEN replace(prosrc, v_anc || '  ' || v_guarda || E'\n', v_anc)
                             ELSE substr(prosrc, length(E'\nselect public._fn_exigir_tenant(' || c_alvos[i][5] || ');') + 1) END
                   FROM pg_proc WHERE oid = v_oid)) IS DISTINCT FROM c_alvos[i][2] THEN
        RAISE EXCEPTION 'SEG-AGRI-TENANT-01: conferencia de % falhou', c_alvos[i][1]; END IF;
    END IF;
    IF c_alvos[i][6] = 'S' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_oid::regprocedure);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_oid::regprocedure);
      IF has_function_privilege('anon', v_oid, 'EXECUTE') OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'SEG-AGRI-TENANT-01: ACL de % ', c_alvos[i][1]; END IF;
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_oid::regprocedure);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_oid::regprocedure);
      IF has_function_privilege('anon', v_oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'SEG-AGRI-TENANT-01: ACL de % ', c_alvos[i][1]; END IF;
    END IF;
  END LOOP;
END
$patch$;
