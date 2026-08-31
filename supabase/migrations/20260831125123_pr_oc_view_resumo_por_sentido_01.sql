-- PR-OC-VIEW-RESUMO-POR-SENTIDO-01 — a PRIMEIRA tentativa, e ela estava errada.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO E JA SUPERADO. Registro 20260831125123, substituido
-- 23 segundos depois pela v02 (20260831125146). Este arquivo existe porque o REGISTRO tem
-- as duas linhas: sem ele, a lista local de migrations diverge da remota e o proximo
-- `db push` nao fecha. O historico registra o caminho, inclusive o passo errado.
--
-- O QUE ELA ERRAVA: os literais do sentido. `financeiro_plano_contas.tipo_operacao` guarda
-- '1-Entradas' e '2-Saidas' (com acento e com o prefixo numerico) — nao 'entrada'/'saida'.
-- Os oito FILTERs casavam com zero linhas, e as oito colunas novas devolviam 0,00 em TODAS
-- as operacoes. E' o pior tipo de defeito: nao levanta erro, nao quebra a tela, e o zero
-- passa por resposta. Medido e corrigido na v02.
--
-- ⚠ CORPO NAO PROVADO POR ORACULO, e a limitacao esta declarada de proposito: o objeto que
-- este arquivo criou nao existe mais (a v02 o substituiu), entao nao ha `pg_get_viewdef`
-- contra o que comparar. Reconstruido do viewdef VIGENTE trocando so' os dois literais nos
-- oito FILTERs — que e' exatamente a diferenca que a v02 declara ter corrigido. Aplicar
-- este arquivo isoladamente reproduz o defeito, e e' o esperado: a v02 vem logo depois.

CREATE OR REPLACE VIEW public.vw_oc_operacao_compromissos_resumo AS
 SELECT o.cliente_id,
    o.id AS operacao_id,
    COALESCE(cr.n_compromissos, 0::bigint) AS n_compromissos,
    COALESCE(cr.obrigacao_total, 0::numeric) AS obrigacao_total,
    COALESCE(cr.total_programado, 0::numeric) AS total_programado,
    COALESCE(cr.total_materializado, 0::numeric) AS total_materializado,
    COALESCE(cr.total_liquidado, 0::numeric) AS total_liquidado,
    COALESCE(cr.total_materializado, 0::numeric) - COALESCE(cr.total_liquidado, 0::numeric) AS saldo_financeiro,
    COALESCE(cr.n_compromissos, 0::bigint) > 0 AS tem_compromissos,
    leg.tem_partes_legadas,
        CASE
            WHEN COALESCE(cr.n_compromissos, 0::bigint) = 0 AND NOT leg.tem_partes_legadas THEN 'nova_vazia'::text
            WHEN COALESCE(cr.n_compromissos, 0::bigint) > 0 AND NOT leg.tem_partes_legadas THEN 'novo_modelo'::text
            WHEN COALESCE(cr.n_compromissos, 0::bigint) = 0 AND leg.tem_partes_legadas THEN 'legado'::text
            ELSE 'misto_inconsistente'::text
        END AS modo,
    COALESCE(cr.tem_divergencia, false) AS tem_divergencia,
    COALESCE(cr.entrada_obrigacao, 0::numeric) AS entrada_obrigacao,
    COALESCE(cr.saida_obrigacao, 0::numeric) AS saida_obrigacao,
    COALESCE(cr.entrada_liquidado, 0::numeric) AS entrada_liquidado,
    COALESCE(cr.saida_liquidado, 0::numeric) AS saida_liquidado,
    COALESCE(cr.entrada_materializado, 0::numeric) AS entrada_materializado,
    COALESCE(cr.saida_materializado, 0::numeric) AS saida_materializado,
    COALESCE(cr.entrada_programado, 0::numeric) AS entrada_programado,
    COALESCE(cr.saida_programado, 0::numeric) AS saida_programado
   FROM zoo_operacoes_comerciais o
     LEFT JOIN LATERAL ( SELECT count(*) AS n_compromissos,
            COALESCE(sum(r.valor_compromisso) FILTER (WHERE r.status <> 'cancelado'::text), 0::numeric) AS obrigacao_total,
            COALESCE(sum(r.total_programado) FILTER (WHERE r.status <> 'cancelado'::text), 0::numeric) AS total_programado,
            COALESCE(sum(r.total_materializado) FILTER (WHERE r.status <> 'cancelado'::text), 0::numeric) AS total_materializado,
            COALESCE(sum(r.total_liquidado) FILTER (WHERE r.status <> 'cancelado'::text), 0::numeric) AS total_liquidado,
            bool_or(r.tem_divergencia) AS tem_divergencia,
            COALESCE(sum(r.valor_compromisso) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = 'entrada'::text), 0::numeric) AS entrada_obrigacao,
            COALESCE(sum(r.valor_compromisso) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = 'saida'::text), 0::numeric) AS saida_obrigacao,
            COALESCE(sum(r.total_liquidado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = 'entrada'::text), 0::numeric) AS entrada_liquidado,
            COALESCE(sum(r.total_liquidado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = 'saida'::text), 0::numeric) AS saida_liquidado,
            COALESCE(sum(r.total_materializado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = 'entrada'::text), 0::numeric) AS entrada_materializado,
            COALESCE(sum(r.total_materializado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = 'saida'::text), 0::numeric) AS saida_materializado,
            COALESCE(sum(r.total_programado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = 'entrada'::text), 0::numeric) AS entrada_programado,
            COALESCE(sum(r.total_programado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = 'saida'::text), 0::numeric) AS saida_programado
           FROM vw_oc_compromissos_resumo r
             LEFT JOIN financeiro_plano_contas pc ON pc.id = r.plano_conta_id
          WHERE r.operacao_id = o.id) cr ON true
     LEFT JOIN LATERAL ( SELECT (EXISTS ( SELECT 1
                   FROM zoo_operacao_partes pt
                  WHERE pt.operacao_id = o.id AND pt.cancelada = false AND pt.programacao_parcela_id IS NULL)) AS tem_partes_legadas) leg ON true;
