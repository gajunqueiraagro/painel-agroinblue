-- SEM-CADASTRO-02 (Gabriel, 21/10/2026) — a aba "Sem cadastro" de Cadastros › Fornecedores: o texto so' conta como "fornecedor escrito" se
-- vier da COLUNA DE FORNECEDOR DA PLANILHA importada (staging `excel_fornecedor`) ou da DESCRICAO DO EXTRATO bancario (`origem_lancamento`
-- 'extrato' ou 'ofx'). A descricao de TXT/Excel de produto e de lancamento manual sai — o caso que motivou: um cliente de conta virtual
-- com TXT so' de produto, 870 grupos / 2.705 lancamentos cujo "fornecedor" era o nome do produto ou da despesa.
-- Redefine so' `_fn_sem_cadastro_base` (a leitura, o ligar e o desfazer da aba leem dela); o resto da 20261028110000 fica.
CREATE OR REPLACE FUNCTION public._fn_sem_cadastro_base(p_cliente uuid)
RETURNS TABLE(lancamento_id uuid, texto text, chave text, origem text, valor numeric, data date, descricao text, fazenda_id uuid,
              status text, rateio boolean)
LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT l.id, t.texto, public._fn_normalizar_texto(t.texto), t.origem, abs(l.valor),
         coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia), l.descricao, l.fazenda_id, l.status_transacao,
         (t.texto ~* '^\s*pec\.3m-')
    FROM public.financeiro_lancamentos_v2 l
    LEFT JOIN LATERAL (SELECT btrim(s.excel_fornecedor) txt FROM public.financeiro_classificacao_staging s
                        WHERE s.match_lancamento_id = l.id AND nullif(btrim(s.excel_fornecedor), '') IS NOT NULL
                          AND btrim(s.excel_fornecedor) <> '-'
                        ORDER BY s.created_at DESC LIMIT 1) p ON true
    CROSS JOIN LATERAL (SELECT coalesce(p.txt, btrim(l.descricao)) texto, CASE WHEN p.txt IS NOT NULL THEN 'planilha' ELSE 'descricao' END origem) t
   WHERE l.cliente_id = p_cliente AND l.favorecido_id IS NULL AND l.cancelado IS NOT TRUE
     AND coalesce(l.tipo_operacao, '') NOT LIKE '3-%' AND l.financiamento_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes z WHERE z.financeiro_lancamento_id = l.id AND z.cancelada = false)
     AND public._fn_normalizar_texto(t.texto) IS NOT NULL
     -- FORN-01b: so' o cenario REALIZADO (Meta nao vai para o financeiro); lancamento GERADO PELO SISTEMA (origem_tipo) fica fora.
     -- SEM-CADASTRO-02 (Gabriel 21/10): "fornecedor escrito" = (1) a coluna de fornecedor da PLANILHA importada, ou (2) a descricao do
     -- EXTRATO bancario (`extrato`, `ofx`). A descricao de lancamento manual, de TXT ou de Excel de produto (`importacao_incremental`,
     -- `excel`, `mesa_excel`, `mesa_split`, `migracao`, `manual`…) NUNCA.
     AND l.cenario = 'realizado' AND l.origem_tipo IS NULL
     AND (t.origem = 'planilha' OR l.origem_lancamento IN ('extrato', 'ofx'))
$f$;
