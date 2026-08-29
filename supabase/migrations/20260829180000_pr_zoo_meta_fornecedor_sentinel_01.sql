-- PR-ZOO-META-FORNECEDOR-SENTINEL-01
--
-- Cria UM fornecedor sentinel de META por cliente ativo, para que a compra em cenario
-- meta tenha o campo Fornecedor preenchido automaticamente sem depender dos 33 registros
-- dispersos que existem hoje.
--
-- POR QUE UM NOVO, E NAO REUSAR OS EXISTENTES
-- Medido no proto em 2026-08-29: ha 33 fornecedores chamados 'meta'/'Meta'/'META' (21 num
-- unico cliente) e um 'Planejamento'. Nao sao copias vazias — cada um tem lancamentos
-- apontando, um deles com 13 usos. Por isso NENHUM e' apagado, desativado ou repontado:
-- eles seguem servindo o historico. O sentinel e' um registro NOVO, distinguivel.
--
-- POR QUE O NOME TEM COLCHETE E NAO TEM ACENTO
--   * o colchete marca que nao e' fornecedor real e faz o item subir na lista ordenada;
--   * SEM ACENTO por medicao: a tabela tem DOIS triggers de normalizacao
--     (trg_normalizar_fornecedor e trg_normalize_fornecedor_nome). Eles rodam em ordem
--     alfabetica e o SEGUNDO sobrescreve o primeiro — e o segundo NAO trata acento,
--     trocando 'ç'/'ã' por espaco. 'Projeção' viraria 'PROJE O'. Nome sem acento faz os
--     dois triggers concordarem.
--   * `nome_normalizado` NAO e' escrito aqui: os triggers o preenchem. Escrever seria
--     redundante e divergiria na proxima alteracao do nome.
--
-- IDEMPOTENCIA POR NOT EXISTS, e nao por ON CONFLICT: a tabela NAO tem UNIQUE em
-- (cliente_id, nome) — os unicos UNIQUE sao (id) e (id, cliente_id). E' justamente essa
-- ausencia que permitiu os 33 duplicados nascerem. Rodar duas vezes nao cria segunda copia.
--
-- ESCOPO: so' INSERT. Nenhum lancamento e' tocado, nenhum fornecedor existente e' alterado.

BEGIN;

INSERT INTO public.financeiro_fornecedores (cliente_id, nome, tipo, ativo, observacao)
SELECT c.id,
       '[META] Planejamento',
       -- `tipo` fica no default do schema. Medido: as 6.772 linhas da tabela tem
       -- tipo='frigorifico' e escopo=NULL — a coluna nunca recebeu outro valor e nenhum
       -- consumidor filtra por ela. Inventar um tipo novo faria o sentinel ser a unica
       -- linha divergente, e qualquer filtro futuro por tipo o excluiria em silencio.
       'frigorifico',
       true,
       'Contraparte de lancamentos em cenario META. Registro de sistema — nao representa fornecedor real e nao deve ser usado em lancamento realizado.'
  FROM public.clientes c
 WHERE c.ativo
   AND NOT EXISTS (
     SELECT 1 FROM public.financeiro_fornecedores f
      WHERE f.cliente_id = c.id
        AND f.nome = '[META] Planejamento'
   );

COMMIT;
