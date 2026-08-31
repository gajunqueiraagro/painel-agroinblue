-- PR-OC-VIEW-RESUMO-POR-SENTIDO-02 — o rollup passa a saber de que lado o dinheiro anda.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831125146. VIGENTE.
--
-- POR QUE ELA EXISTE. A celula Financeiro da Central somava os DOIS SENTIDOS: na b58bf556,
-- entradas 686.857,46 mais saidas 107.150,94 davam 794.008,40 — um numero que nao e' nem o
-- que entra, nem o que sai, nem o liquido. O sentido sempre foi derivavel
-- (`financeiro_plano_contas.tipo_operacao` via `zoo_operacao_compromissos.plano_conta_id`),
-- mas recompor o rollup no cliente e' proibido pela regra escrita no topo da propria
-- Central: "Eixos Financeiro/Recebimento/Liquidacao vem das views existentes (nunca somados
-- no React)". Entao o sentido tinha de nascer AQUI.
-- Medido depois da view: entrada 686.857,46 · saida 107.150,94 · LIQUIDO 579.706,52.
--
-- ⚠ O QUE A v01 ERRAVA, e vale registrar porque a licao e' geral: os literais. O
-- `tipo_operacao` guarda '1-Entradas' e '2-Saidas', com prefixo numerico e acento; a v01
-- filtrou por 'entrada'/'saida' e os oito FILTERs casaram ZERO linhas. Nao houve erro nem
-- tela quebrada — as oito colunas novas devolveram 0,00 em todas as operacoes, e zero
-- passa por resposta. Literal de dominio se MEDE na tabela antes de escrever o filtro.
--
-- ⚠ AS OITO COLUNAS VAO NO FIM, e nao junto das irmas: `CREATE OR REPLACE VIEW` exige que
-- as colunas anteriores fiquem na MESMA ordem e com os MESMOS tipos. Inserir
-- `entrada_obrigacao` ao lado de `obrigacao_total` obrigaria a derrubar a view — e derrubar
-- perde os GRANTs.
-- ⚠ QUATRO NIVEIS x DOIS SENTIDOS, e nao um liquido pronto: quem escolhe o nivel e' o
-- consumidor (`finResumo` tem a precedencia liquidado > materializado > programado >
-- obrigacao), e cravar a subtracao aqui obrigaria a view a conhecer a regra da tela.
-- ⚠ `LEFT JOIN`, nao `JOIN`: compromisso sem plano de contas existe, e um INNER o faria
-- sumir dos totais GERAIS tambem — o rollup inteiro mudaria de valor por causa de uma
-- coluna nova. Sem plano, ele entra nos totais e fica fora dos dois sentidos.
--
-- ⚠⚠ ATENCAO — REGRESSAO DE SEGURANCA HERDADA DESTE REPLACE, MEDIDA NESTA SESSAO:
-- a view perdeu `security_invoker`. `pg_class.reloptions` esta NULO nela, enquanto a irma
-- `vw_oc_compromissos_resumo` — criada no MESMO arquivo original (20260803190000) e com o
-- mesmo `WITH (security_invoker = true)` — continua com a opcao. Sem `security_invoker` a
-- view roda com os privilegios do DONO e nao aplica o RLS de quem chama; ela tem SELECT
-- para `authenticated` e serve 35 linhas de 4 clientes distintos.
-- ESTE ARQUIVO REPRODUZ O APLICADO, defeito incluso, porque o versionamento e' registro e
-- nao correcao. A correcao e' migration propria, pendente de GO:
--     ALTER VIEW public.vw_oc_operacao_compromissos_resumo SET (security_invoker = true);
-- NAO aplicar este arquivo em ambiente novo sem aplicar a correcao junto.
--
-- ⚠ CORPO CONFERIDO PELO ORACULO: e' o `pg_get_viewdef(..., true)` vigente, copiado
-- verbatim — md5 feeab99415ef2d4319c12bfd25eeac3d, 4024 caracteres.

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
            COALESCE(sum(r.valor_compromisso) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = '1-Entradas'::text), 0::numeric) AS entrada_obrigacao,
            COALESCE(sum(r.valor_compromisso) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = '2-Saídas'::text), 0::numeric) AS saida_obrigacao,
            COALESCE(sum(r.total_liquidado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = '1-Entradas'::text), 0::numeric) AS entrada_liquidado,
            COALESCE(sum(r.total_liquidado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = '2-Saídas'::text), 0::numeric) AS saida_liquidado,
            COALESCE(sum(r.total_materializado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = '1-Entradas'::text), 0::numeric) AS entrada_materializado,
            COALESCE(sum(r.total_materializado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = '2-Saídas'::text), 0::numeric) AS saida_materializado,
            COALESCE(sum(r.total_programado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = '1-Entradas'::text), 0::numeric) AS entrada_programado,
            COALESCE(sum(r.total_programado) FILTER (WHERE r.status <> 'cancelado'::text AND pc.tipo_operacao = '2-Saídas'::text), 0::numeric) AS saida_programado
           FROM vw_oc_compromissos_resumo r
             LEFT JOIN financeiro_plano_contas pc ON pc.id = r.plano_conta_id
          WHERE r.operacao_id = o.id) cr ON true
     LEFT JOIN LATERAL ( SELECT (EXISTS ( SELECT 1
                   FROM zoo_operacao_partes pt
                  WHERE pt.operacao_id = o.id AND pt.cancelada = false AND pt.programacao_parcela_id IS NULL)) AS tem_partes_legadas) leg ON true;
