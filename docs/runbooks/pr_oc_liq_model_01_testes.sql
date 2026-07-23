-- PR-OC-LIQ-MODEL-01 — Suíte de testes (BEGIN/ROLLBACK).
-- Executar sob SESSÃO AUTENTICADA (auth.uid() válido, cliente acessível) na
-- homologação runtime — as RPCs são SECURITY DEFINER com guarda de tenant e
-- dependem de auth.uid(); o canal MCP read-only (actor nulo) valida apenas
-- estrutura/compilação (ver dry-run no relatório), não comportamento.
--
-- Pré-requisitos do fixture (substituir pelos IDs reais do tenant de teste):
--   :cliente  = cliente_id acessível pelo ator
--   :forn     = financeiro_fornecedores.id (contraparte)  [tenant-safe]
--   :op       = operação fechada (status_comercial='fechada', rascunho=false)
-- Sugestão: criar a operação via oc_criar_rascunho + oc_editar_negociacao +
--   oc_salvar_lotes + oc_confirmar antes dos casos abaixo.

BEGIN;

-- ---------------------------------------------------------------------------
-- Caso IDEMPOTÊNCIA + J (despesa com desembolso, materializa título)
-- ---------------------------------------------------------------------------
SELECT public.oc_gerar_obrigacoes(:op, :cliente, (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=:op),
  jsonb_build_object('obrigacoes', jsonb_build_array(
    jsonb_build_object('natureza_fluxo','pagar','natureza','deducao','componente','frete',
      'valor', 1000, 'data_vencimento', '2026-08-10', 'materializar', true,
      'chave_idempotencia','t-frete-1')
  )));
-- Reexecução com a MESMA chave: não deve duplicar (idempotente).
SELECT public.oc_gerar_obrigacoes(:op, :cliente, (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=:op),
  jsonb_build_object('obrigacoes', jsonb_build_array(
    jsonb_build_object('natureza_fluxo','pagar','natureza','deducao','componente','frete',
      'valor', 1000, 'materializar', true, 'chave_idempotencia','t-frete-1')
  )));
-- ASSERT: exatamente 1 obrigação com essa chave e 1 título FINV2 (programado).
SELECT 'IDEMP+J' teste,
  (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=:op AND chave_idempotencia='t-frete-1') AS n_obrig,
  (SELECT count(*) FROM public.financeiro_lancamentos_v2 f
     JOIN public.zoo_operacao_partes pt ON pt.financeiro_lancamento_id=f.id
    WHERE pt.chave_idempotencia='t-frete-1' AND f.status_transacao='programado' AND f.cancelado IS NOT TRUE) AS n_titulo;
-- Esperado: n_obrig=1, n_titulo=1.

-- ---------------------------------------------------------------------------
-- Caso I (retenção sem caixa NUNCA gera título bancário)
-- ---------------------------------------------------------------------------
SELECT public.oc_gerar_obrigacoes(:op, :cliente, (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=:op),
  jsonb_build_object('obrigacoes', jsonb_build_array(
    jsonb_build_object('natureza_fluxo','pagar','natureza','deducao','componente','funrural',
      'valor', 250, 'sem_movimentacao_caixa', true, 'materializar', true, 'chave_idempotencia','t-ret-1')
  )));
-- ASSERT: obrigação existe, SEM título (materializar foi forçado a false).
SELECT 'RETENCAO_I' teste,
  (SELECT financeiro_lancamento_id IS NULL FROM public.zoo_operacao_partes WHERE chave_idempotencia='t-ret-1') AS sem_titulo,
  (SELECT estado FROM public.vw_oc_obrigacoes WHERE obrigacao_id=(SELECT id FROM public.zoo_operacao_partes WHERE chave_idempotencia='t-ret-1')) AS estado;
-- Esperado: sem_titulo=true, estado='sem_caixa'.

-- ---------------------------------------------------------------------------
-- Caso D + F (título liquidado por várias liquidações, parcial→quitado)
-- ---------------------------------------------------------------------------
-- título alvo = o do frete (t-frete-1)
SELECT public.oc_registrar_liquidacao(:op, :cliente, jsonb_build_object(
  'data','2026-08-11','natureza','pagamento','forma','pix','valor',400,
  'financeiro_lancamento_id',(SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes WHERE chave_idempotencia='t-frete-1')));
SELECT 'PARCIAL_F' teste, estado, total_liquidado_monetario, saldo_titulo
  FROM public.vw_oc_titulos_liquidacao
 WHERE titulo_id=(SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes WHERE chave_idempotencia='t-frete-1');
-- Esperado: estado='parcial', total_liquidado_monetario=400, saldo_titulo=600.

-- ---------------------------------------------------------------------------
-- Caso L + K (permuta e compensação = liquidação NÃO monetária)
-- ---------------------------------------------------------------------------
SELECT public.oc_registrar_liquidacao(:op, :cliente, jsonb_build_object(
  'data','2026-08-12','natureza','pagamento','forma','compensacao','valor',600,
  'financeiro_lancamento_id',(SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes WHERE chave_idempotencia='t-frete-1')));
SELECT 'NAO_MONETARIO' teste, estado, total_liquidado_monetario, total_liquidado_nao_monetario, saldo_titulo
  FROM public.vw_oc_titulos_liquidacao
 WHERE titulo_id=(SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes WHERE chave_idempotencia='t-frete-1');
-- Esperado: estado='quitado', monetario=400, nao_monetario=600, saldo=0 (tol R$0,01).

-- ---------------------------------------------------------------------------
-- Caso ESCOPO: edição de negociação NÃO apaga obrigações documento/manual
-- ---------------------------------------------------------------------------
SELECT public.oc_alterar_parcelas(:op, :cliente, (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id=:op),
  '[{"natureza":"principal","componente":"principal","valor":50000}]'::jsonb);
SELECT 'ESCOPO' teste,
  (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=:op AND origem<>'negociacao') AS obrig_preservadas,
  (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id=:op AND origem='negociacao') AS negoc;
-- Esperado: obrig_preservadas>=2 (frete+retenção), negoc=1 (só principal).

-- ---------------------------------------------------------------------------
-- Caso N (cancelamento de obrigação preserva histórico; protegido bloqueia)
-- ---------------------------------------------------------------------------
-- título 'programado' (não protegido) => cancela
SELECT public.oc_cancelar_obrigacao(
  (SELECT id FROM public.zoo_operacao_partes WHERE chave_idempotencia='t-frete-1'), :cliente, 'teste cancelamento');
SELECT 'CANCELA_N' teste,
  (SELECT cancelada FROM public.zoo_operacao_partes WHERE chave_idempotencia='t-frete-1') AS parte_cancelada,
  (SELECT cancelado FROM public.financeiro_lancamentos_v2 WHERE id=(
     SELECT financeiro_lancamento_id FROM public.zoo_operacao_partes WHERE chave_idempotencia='t-frete-1')) AS titulo_cancelado,
  (SELECT count(*) FROM public.zoo_operacao_liquidacoes WHERE operacao_id=:op AND estornado=false) AS liq_preservadas;
-- Esperado: parte_cancelada=true, titulo_cancelado=true, liq_preservadas>0 (histórico intacto).

ROLLBACK;
