-- O CHECK DE `papel` PASSA A ACEITAR OS QUATRO PAPEIS QUE A RPC JA' GRAVA.
--
-- ⚠ ISTO E' CONSERTO DE CAMINHO QUEBRADO EM PRODUCAO, nao melhoria. Em 21/09/2026 a
--   `agri_carga_mandioca_registrar` passou a gravar `trator`, `mao_obra`, `inss` e
--   `icms_transporte` (migration 20261027123800, aplicada as 08:56). O CHECK desta tabela nunca
--   soube deles: ele aceitava seis papeis, e nenhum dos quatro novos estava na lista.
--   Resultado: registrar uma carga com trator, mao de obra, INSS ou ICMS do frete estoura
--   `23514 check constraint violation` — e como a RPC e' UMA transacao, a carga INTEIRA nao grava.
--   O frete passava (ja' estava na lista); os outros tres, nao.
--
-- ⚠ NAO APARECEU PORQUE NINGUEM REGISTROU CARGA NOVA desde entao: as 21 que existem sao do
--   backfill de 16/09, com os nomes antigos. O defeito estava no ar, calado, esperando a primeira
--   carga de verdade.
-- ⚠ E A FASE 3 DEPENDE DISTO: o payload completo que vai destravar o `corrigir` manda justamente
--   esses quatro papeis.
--
-- OS DEZ PAPEIS, e por que os antigos FICAM:
--   venda                                   — a receita da carga
--   icms, icms_transporte, funrural, inss   — os impostos (o de transporte e' custo, nao deducao)
--   frete, trator, mao_obra                 — os tres servicos do modelo novo
--   arranquio, carregamento                 — os nomes ANTIGOS de mao_obra e trator
-- ⚠ OS DOIS ANTIGOS NAO SAIEM, e tirar seria quebrar o que existe: os 42 lancamentos do backfill
--   ainda os usam (42 linhas de cada, medido). A reclassificacao de 20261027124100 moveu o PLANO
--   DE CONTAS deles, nao o papel — o papel e' o elo, e reescreve-lo exigiria migration propria,
--   com o front acompanhando. Enquanto os dois nomes convivem, a leitura ja' os trata como um so'
--   (`compromissosDaCarga.ts` mapeia ambos para "Mao de obra" e "Trator", com teste).
--
-- ESTADO MEDIDO 21/09/2026, em TODAS as linhas da tabela (o CHECK vale para linha inativa
-- tambem, e por isso a contagem nao filtra `ativo`):
--   venda 43 + carregamento 42 + frete 42 + arranquio 42 + icms 11 + funrural 1   = 181 linhas
--   SEIS papeis distintos, os SEIS dentro da lista nova. O ADD nao encontra violacao.
--   (as 43 de venda incluem 1 inativa — sobra da carga corrigida e revertida nesta manha.)
--
-- ⚠ A VERIFICACAO ABAIXO E' REDUNDANTE COM O PROPRIO ADD, de proposito. O Postgres recusaria
--   sozinho, mas com "is violated by some row" — sem dizer QUAL papel nem QUANTAS linhas. Num
--   banco onde este arquivo rode daqui a um ano, saber o nome do papel intruso e' a diferenca
--   entre consertar em um minuto e abrir uma investigacao.
--
-- IDEMPOTENTE: `DROP ... IF EXISTS` seguido do `ADD`. Rodar de novo recria o mesmo CHECK.

BEGIN;

DO $$
DECLARE v_fora text;
BEGIN
  SELECT string_agg(DISTINCT papel || ' (' || n || ')', ', ')
    INTO v_fora
    FROM (SELECT papel, count(*) n FROM public.agri_colheita_lancamentos
           WHERE papel <> ALL (ARRAY['venda','icms','icms_transporte','funrural','inss',
                                     'frete','trator','mao_obra','arranquio','carregamento'])
           GROUP BY papel) x;
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'Papel fora da lista nova, o CHECK nao pode entrar: %', v_fora
      USING ERRCODE = 'P0001';
  END IF;
END $$;

ALTER TABLE public.agri_colheita_lancamentos
  DROP CONSTRAINT IF EXISTS agri_colheita_lancamentos_papel_check;

ALTER TABLE public.agri_colheita_lancamentos
  ADD CONSTRAINT agri_colheita_lancamentos_papel_check
  CHECK (papel = ANY (ARRAY[
    'venda'::text,
    'icms'::text, 'icms_transporte'::text, 'funrural'::text, 'inss'::text,
    'frete'::text, 'trator'::text, 'mao_obra'::text,
    'arranquio'::text, 'carregamento'::text
  ]));

COMMIT;
