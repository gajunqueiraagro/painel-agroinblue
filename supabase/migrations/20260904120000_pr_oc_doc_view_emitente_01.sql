-- PR-OC-DOC-VIEW-EMITENTE-01 — versiona a recriacao de `vw_oc_documentos` com o emitente.
--
--   ⚠ POR QUE ESTE ARQUIVO EXISTE. A view foi recriada no proto ao lado de
--   20260903120000, e a recriacao NAO ficou em migration nenhuma: a ultima que a define e
--   20260722230000, SEM as colunas do emitente. O proto estava a frente do repositorio —
--   reconstruir o banco pelas migrations devolveria a view antiga, e a coluna "Emitente"
--   da tabela de documentos (PR-OC-DOCUMENTOS-02) quebraria por ler campo inexistente.
--
--   ⚠ REPRODUCAO FIEL DO APLICADO, conferida por md5 de pg_get_viewdef:
--   4c2373cb058f3037285d620d5373042c, 2004 chars. Grants tambem conferidos:
--   `authenticated=r` e `service_role=r`, iguais aos da irma `vw_oc_operacao_liquidacao`.
--
--   ── TRES ARMADILHAS, todas ja pagas uma vez ──
--
--   1. `security_invoker = true` EXPLICITO. Sem a clausula, a view nasce com o default e
--      passa a rodar com os direitos do DONO — acesso entre clientes em silencio. Mesma
--      armadilha de PR-OC-LIQUIDACAO-REGUA-01, onde `CREATE OR REPLACE VIEW` sem `WITH`
--      teria rebaixado a view de liquidacao.
--
--   2. DROP + CREATE, e nao CREATE OR REPLACE. `CREATE OR REPLACE VIEW` so aceita colunas
--      NOVAS NO FIM da lista; as tres do emitente ficam ANTES de `cancelado`, e o replace
--      recusa com 42P16 ("cannot change name of view column"). Trocar a ordem para agradar
--      o replace mudaria o contrato de quem le por posicao — pior que o drop.
--      ⚠ DROP SEM CASCADE, de proposito: se um dia outra view passar a ler esta, o drop
--      FALHA ALTO em vez de destruir a dependencia em silencio.
--
--   3. GRANTS. Objeto recriado por drop+create NASCE COM PRIVILEGIOS LARGOS — incluindo
--      `anon`, ou seja acesso ANONIMO a documento fiscal de cliente, e escrita para
--      `authenticated`. Foi exatamente o que aconteceu no proto e precisou ser corrigido
--      a mao. Por isso o REVOKE e o GRANT abaixo sao EXPLICITOS: sem eles, quem
--      reconstruir o banco pelas migrations recria o buraco sem perceber.
--
--   Requer PROTO (binbcdfbisgscrifztia). NAO aplicar em producao.

DROP VIEW IF EXISTS public.vw_oc_documentos;

CREATE VIEW public.vw_oc_documentos
WITH (security_invoker = true) AS
 SELECT d.cliente_id,
    d.operacao_id,
    d.id AS documento_id,
    d.especie,
    d.numero,
    d.serie,
    d.chave_acesso,
    d.data_emissao,
    d.url,
    d.documento_origem_id,
    d.observacao,
    d.emitente_id,
    d.emitente_nome,
    d.emitente_documento,
    d.cancelado,
        CASE
            WHEN d.cancelado THEN 'cancelado'::text
            ELSE 'ativo'::text
        END AS situacao,
    COALESCE(v.total_acrescimos, 0::numeric) AS total_acrescimos,
    COALESCE(v.total_descontos_comerciais, 0::numeric) AS total_descontos_comerciais,
    COALESCE(v.total_retencoes_sem_caixa, 0::numeric) AS total_retencoes_sem_caixa,
    COALESCE(v.total_despesas_desembolso, 0::numeric) AS total_despesas_desembolso,
    COALESCE(v.total_acrescimos, 0::numeric) - COALESCE(v.total_descontos_comerciais, 0::numeric) - COALESCE(v.total_retencoes_sem_caixa, 0::numeric) - COALESCE(v.total_despesas_desembolso, 0::numeric) AS valor_liquido,
    COALESCE(cc.qtd_componentes, 0::bigint) AS qtd_componentes,
    COALESCE(ll.qtd_lotes, 0::bigint) AS qtd_lotes
   FROM zoo_operacao_documentos d
     LEFT JOIN LATERAL ( SELECT sum(c.valor) FILTER (WHERE c.natureza = 'acrescimo'::text) AS total_acrescimos,
            sum(c.valor) FILTER (WHERE c.natureza = 'desconto_comercial'::text) AS total_descontos_comerciais,
            sum(c.valor) FILTER (WHERE c.natureza = 'retencao_sem_caixa'::text) AS total_retencoes_sem_caixa,
            sum(c.valor) FILTER (WHERE c.natureza = 'despesa_desembolso'::text) AS total_despesas_desembolso
           FROM zoo_operacao_documento_componentes c
          WHERE c.documento_id = d.id AND c.cancelado = false) v ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS qtd_componentes
           FROM zoo_operacao_documento_componentes c
          WHERE c.documento_id = d.id AND c.cancelado = false) cc ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS qtd_lotes
           FROM zoo_operacao_documento_lotes l
          WHERE l.documento_id = d.id) ll ON true;

-- Documento fiscal e dado de cliente: `anon` nao le. Leitura apenas, como a irma
-- `vw_oc_operacao_liquidacao` — view nao e' porta de escrita.
REVOKE ALL ON public.vw_oc_documentos FROM anon;
GRANT SELECT ON public.vw_oc_documentos TO authenticated, service_role;

COMMENT ON VIEW public.vw_oc_documentos IS
  'PR-OC-DOC-VIEW-EMITENTE-01: expoe emitente_id/nome/documento (20260903120000) alem do cabecalho e dos totais por natureza. security_invoker=true — isolamento por RLS da tabela-base.';
