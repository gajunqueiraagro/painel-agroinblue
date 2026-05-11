-- ============================================================================
-- Migration: fix_ordem_custo_variavel_pec
-- Data: 2026-05-11
-- Autor: Renumeração estrutural do plano de contas global
-- ============================================================================
--
-- CONTEXTO
-- O grupo "Custo Variável Pecuária" do plano de contas global (cliente_id IS NULL)
-- estava com `ordem_exibicao` caoticamente atribuída: subcentros de centros
-- diferentes estavam intercalados na sequência, e 3 ordens (8010, 8020, 8030)
-- tinham 2 subcentros cada — colisões de ordering.
--
-- IMPACTO DO BUG
-- Qualquer agregação que faça MIN(ordem_exibicao) por centro_custo retornava
-- empate entre centros distintos, quebrando ordenação executiva em:
--   - Cockpit anual da Visão Geral Planejamento (em construção)
--   - Telas de importação financeira
--   - Grid de planejamento META
--   - Futuras DRE, PDFs, exportações, benchmarks
--
-- CORREÇÃO
-- Renumeração completa dos 14 subcentros do grupo, agrupando-os por centro
-- na sequência oficial:
--   8010-8030: Nutrição (Cria, Recria, Engorda)
--   8040-8050: Sanidade (Outros Serviços, Vacinas)
--   8060-8080: Reprodução (Outros Serviços, Sêmen e IATF, Veterinário)
--   8090-8100: Pastagem (Arrendamento, Manutenção)
--   8110-8120: Identificação (Brincos, Outros Itens)
--   8130:      Comercial (Despesas Comerciais)
--   8140:      Transferências (Transferência de Gado entre Fazendas)
--
-- IDEMPOTÊNCIA
-- Todos os UPDATEs filtram por (subcentro + grupo_custo + cliente_id IS NULL)
-- para garantir atualização exata da linha alvo. Re-execução é segura.
--
-- AFETA APENAS
-- Plano global (cliente_id IS NULL). Não toca em planos customizados de cliente.
-- Não toca em lançamentos. `ordem_exibicao` é só ordering display — não é PK,
-- FK ou UNIQUE.
-- ============================================================================

BEGIN;

-- Centro Nutrição
UPDATE financeiro_plano_contas SET ordem_exibicao = 8010
  WHERE subcentro = 'Nutrição Cria'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

UPDATE financeiro_plano_contas SET ordem_exibicao = 8020
  WHERE subcentro = 'Nutrição Recria'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

UPDATE financeiro_plano_contas SET ordem_exibicao = 8030
  WHERE subcentro = 'Nutrição Engorda'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

-- Centro Sanidade
UPDATE financeiro_plano_contas SET ordem_exibicao = 8040
  WHERE subcentro = 'Outros Serviços de Sanidade'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

UPDATE financeiro_plano_contas SET ordem_exibicao = 8050
  WHERE subcentro = 'Vacinas e Vermífugos'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

-- Centro Reprodução
UPDATE financeiro_plano_contas SET ordem_exibicao = 8060
  WHERE subcentro = 'Outros Serviços de Reprodução'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

UPDATE financeiro_plano_contas SET ordem_exibicao = 8070
  WHERE subcentro = 'Sêmen e IATF'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

UPDATE financeiro_plano_contas SET ordem_exibicao = 8080
  WHERE subcentro = 'Veterinário Reprodução'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

-- Centro Pastagem
UPDATE financeiro_plano_contas SET ordem_exibicao = 8090
  WHERE subcentro = 'Custo com Arrendamento de Pasto'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

UPDATE financeiro_plano_contas SET ordem_exibicao = 8100
  WHERE subcentro = 'Manutenção de Pasto'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

-- Centro Identificação
UPDATE financeiro_plano_contas SET ordem_exibicao = 8110
  WHERE subcentro = 'Brincos de Identificação'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

UPDATE financeiro_plano_contas SET ordem_exibicao = 8120
  WHERE subcentro = 'Outros Itens de Identificação'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

-- Centro Comercial
UPDATE financeiro_plano_contas SET ordem_exibicao = 8130
  WHERE subcentro = 'Despesas Comerciais Pecuária'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

-- Centro Transferências
UPDATE financeiro_plano_contas SET ordem_exibicao = 8140
  WHERE subcentro = 'Transferência de Gado entre Fazendas'
    AND grupo_custo = 'Custo Variável Pecuária'
    AND cliente_id IS NULL;

-- Validação inline: garantir 0 colisões pós-renumeração
DO $$
DECLARE
  v_count_colisoes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count_colisoes
  FROM (
    SELECT ordem_exibicao
    FROM financeiro_plano_contas
    WHERE cliente_id IS NULL
      AND grupo_custo = 'Custo Variável Pecuária'
    GROUP BY ordem_exibicao
    HAVING COUNT(*) > 1
  ) AS colisoes;

  IF v_count_colisoes > 0 THEN
    RAISE EXCEPTION 'Migration fix_ordem_custo_variavel_pec: % colisões detectadas pós-renumeração', v_count_colisoes;
  END IF;
END $$;

COMMIT;
