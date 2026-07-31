-- PR-PARTES-SIMETRIA-01 — amplia 2 CHECKs de zoo_operacao_partes (pre-requisito da materializacao).
--
--   MOTIVO: o CATALOGO-01 estendeu natureza='obrigacao' nos CHECKs de zoo_componentes_financeiros e
--   zoo_operacao_compromissos, mas NAO tocou zoo_operacao_partes. Restou uma assimetria: a parte
--   (snapshot congelado do compromisso) precisa espelhar natureza='obrigacao' e, vinda de uma
--   programacao, origem='programacao' — mas ambos os CHECKs desta tabela ainda rejeitam esses valores.
--   Sem esta correcao, o futuro writer de materializacao falha em runtime ao materializar qualquer
--   obrigacao (frete/comissao/taxa) — o caso central do modelo de Compromissos.
--
--   ESCOPO (minimo, so 2 CHECKs): AMPLIAR (nao substituir), preservando todos os valores existentes.
--     1. natureza_check: + 'obrigacao'   (par (obrigacao,frete/comissao/taxa_aquisicao) ja existe no
--        catalogo; o FK (natureza,componente)->zoo_componentes_financeiros passa a aceita-los).
--     2. origem_check:   + 'programacao'
--   Sem writer/RPC/trigger/TS/React; sem migracao de dados; sem UPDATE em partes existentes (as 14
--   legadas usam valores que permanecem na lista ampliada); nao toca o Financeiro; nao cria a RPC de
--   materializacao. Padrao DROP+ADD (mesmos nomes) como o CATALOGO-01.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

-- 1) natureza em PARTES: estende o CHECK (mesmo nome), preservando principal/deducao/acrescimo.
ALTER TABLE public.zoo_operacao_partes
  DROP CONSTRAINT IF EXISTS zoo_operacao_partes_natureza_check;
ALTER TABLE public.zoo_operacao_partes
  ADD CONSTRAINT zoo_operacao_partes_natureza_check
  CHECK (natureza IN ('principal','deducao','acrescimo','obrigacao'));

-- 2) origem em PARTES: estende o CHECK (mesmo nome), preservando negociacao/documento/manual.
ALTER TABLE public.zoo_operacao_partes
  DROP CONSTRAINT IF EXISTS zoo_operacao_partes_origem_check;
ALTER TABLE public.zoo_operacao_partes
  ADD CONSTRAINT zoo_operacao_partes_origem_check
  CHECK (origem IN ('negociacao','documento','manual','programacao'));

-- ROLLBACK documentado (NAO executar aqui):
--   ALTER TABLE public.zoo_operacao_partes DROP CONSTRAINT zoo_operacao_partes_origem_check;
--   ALTER TABLE public.zoo_operacao_partes ADD CONSTRAINT zoo_operacao_partes_origem_check CHECK (origem IN ('negociacao','documento','manual'));
--   ALTER TABLE public.zoo_operacao_partes DROP CONSTRAINT zoo_operacao_partes_natureza_check;
--   ALTER TABLE public.zoo_operacao_partes ADD CONSTRAINT zoo_operacao_partes_natureza_check CHECK (natureza IN ('principal','deducao','acrescimo'));
