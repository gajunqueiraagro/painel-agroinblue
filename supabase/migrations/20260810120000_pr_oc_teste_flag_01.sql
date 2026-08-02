-- PR-OC-TESTE-FLAG-01 — separação definitiva entre operações REAIS e massa de teste/homologação.
--   Adiciona zoo_operacoes_comerciais.is_teste (NOT NULL DEFAULT false) e faz o backfill das 20 OCs da janela
--   de desenvolvimento identificadas na auditoria PR-OC-RESET-TESTES-01. NÃO cria RPC/DELETE; não altera fluxo/UI.
--   Novas operações nascem is_teste=false (reais); ambiente de dev deve marcar is_teste=true na criação.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.zoo_operacoes_comerciais
  ADD COLUMN IF NOT EXISTS is_teste boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.zoo_operacoes_comerciais.is_teste IS
  'true = massa de teste/homologação (não é operação real). Default false. Backfill inicial: 20 OCs da janela de dev (auditoria PR-OC-RESET-TESTES-01).';

-- Backfill: as 20 OCs de desenvolvimento identificadas na auditoria (lista explícita e auditável).
UPDATE public.zoo_operacoes_comerciais SET is_teste = true
 WHERE id IN (
   '3493b6a9-3964-41e1-9dfa-14fde697d49b', '6fe43d6d-c09c-4b2a-bca5-9b714c72db0f',
   '825b9ac6-0e72-4e02-990d-d3f6c8785213', '48dd0aaa-b2b7-4bef-9fc2-306ecde67ba2',
   'a3c124aa-7a95-4645-8974-ca51cb6ef3a9', 'd152d48a-0406-4f2c-92d6-0cbb5fb7c8b6',
   'f2ecc13c-6c54-482d-96b4-afa257530a17', '05da817e-d10e-49de-b507-5b628e9c1fa2',
   'aed22763-e88d-4964-a8dd-7bc9555ee6d5', '5e2b86e0-6861-467e-84a8-c81a7680a196',
   '2805f54c-332a-4456-83e7-5cdeda4e501c', 'a298abc6-f144-4669-b5fa-9fa7a0d6de52',
   '8394e7e7-d616-4315-89c7-2f23e89ed66e', '5dafbec4-9ab9-46a5-ad39-2be6dbc44cba',
   '9144e361-b692-4520-97c3-cb1bc4278d1b', '954e9eb6-8277-42eb-ad67-b0a22934744b',
   'e9dd4c78-b621-4d4f-8496-f48c0dbf1581', '0f6547a3-77a7-4d85-885f-a05cb1ebb655',
   'a016cc36-e9ff-4c70-8a8a-065defe74a27', 'd39b796e-e67f-4139-b960-2c51ea46e490'
 );
