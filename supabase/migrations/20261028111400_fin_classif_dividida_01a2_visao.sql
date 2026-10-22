-- FIN-CLASSIF-DIVIDIDA-01a-2 (Gabriel 22/10/2026) — parte 1: a visao de leitura unica ganha TODAS as colunas do lancamento, com os mesmos
-- nomes (`id` = o lancamento), no fim (CREATE OR REPLACE so' acrescenta). Assim cada leitor que soma por classificacao troca
-- `financeiro_lancamentos_v2` por `vw_fin_classificacao_por_parte` e continua igual: o `valor` e as colunas de classificacao sao as da
-- PARTE (lancamento sem divisao = ele mesmo, uma linha). As linhas sao do lancamento: quem conta lancamentos usa `count(DISTINCT id)`.

CREATE OR REPLACE VIEW public.vw_fin_classificacao_por_parte WITH (security_invoker = true) AS
SELECT l.id AS lancamento_id, l.cliente_id, l.fazenda_id,
       coalesce(p.ordem, 1)::int AS parte_ordem,
       -- subconsulta (e nao janela): o filtro de quem le (cliente, datas) desce ate' a tabela
       CASE WHEN p.id IS NULL THEN 1 ELSE (SELECT count(*) FROM public.financeiro_lancamento_partes p2 WHERE p2.lancamento_id = l.id) END::int AS partes_total,
       CASE WHEN p.id IS NULL THEN l.valor ELSE sign(l.valor) * p.valor END AS valor,
       l.valor AS valor_lancamento,
       coalesce(p.percentual, 100)::numeric AS percentual,
       l.classificacao_dividida,
       CASE WHEN p.id IS NULL THEN l.plano_conta_id ELSE p.plano_conta_id END AS plano_conta_id,
       CASE WHEN p.id IS NULL THEN l.macro_custo    ELSE p.macro_custo    END AS macro_custo,
       CASE WHEN p.id IS NULL THEN l.grupo_custo    ELSE p.grupo_custo    END AS grupo_custo,
       CASE WHEN p.id IS NULL THEN l.centro_custo   ELSE p.centro_custo   END AS centro_custo,
       CASE WHEN p.id IS NULL THEN l.subcentro      ELSE p.subcentro      END AS subcentro,
       CASE WHEN p.id IS NULL THEN l.escopo_negocio ELSE p.escopo_negocio END AS escopo_negocio,
       CASE WHEN p.id IS NULL THEN l.safra_id       ELSE p.safra_id       END AS safra_id,
       CASE WHEN p.id IS NULL THEN l.cultura        ELSE p.cultura        END AS cultura,
       CASE WHEN p.id IS NULL THEN l.fase           ELSE p.fase           END AS fase,
       CASE WHEN p.id IS NULL THEN l.compoe_dre     ELSE p.compoe_dre     END AS compoe_dre,
       CASE WHEN p.id IS NULL THEN l.gera_lcdpr     ELSE p.gera_lcdpr     END AS gera_lcdpr,
       l.sinal, l.tipo_operacao, l.data_competencia, l.data_pagamento, l.data_vencimento, l.ano_mes, l.status_transacao,
       l.cancelado, l.cenario, l.sem_movimentacao_caixa, l.conta_bancaria_id, l.conta_destino_id, l.favorecido_id,
       l.descricao, l.historico, l.origem_lancamento, l.numero_documento,
       -- FIN-CLASSIF-DIVIDIDA-01a-2: as demais colunas do lancamento, com os MESMOS nomes: o leitor troca a tabela pela visao e nada mais
       l.id, l.created_at, l.updated_at, l.documento, l.lote_importacao_id, l.transferencia_grupo_id, l.conciliado_em,
       l.observacao, l.created_by, l.updated_by, l.forma_pagamento, l.dados_pagamento, l.contrato_id, l.cancelado_em,
       l.cancelado_por, l.editado_manual, l.hash_importacao, l.movimentacao_rebanho_id, l.origem_tipo, l.boitel_id,
       l.grupo_geracao_id, l.boitel_lote_id, l.tipo_documento, l.importado_duplicado, l.status_duplicidade, l.duplicado_de_id,
       l.nivel_duplicidade, l.financiamento_id, l.origem_apontamento, l.orfao_definitivo, l.orfao_definitivo_motivo,
       l.orfao_definitivo_por, l.orfao_definitivo_em, l.staging_id, l.cancelado_motivo, l.recorrencia_id, l.conta_efetiva_id,
       l.valor_do_mes_em, l.valor_do_mes_origem, l.saldo_de_id
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_lancamento_partes p ON p.lancamento_id = l.id AND l.classificacao_dividida;
