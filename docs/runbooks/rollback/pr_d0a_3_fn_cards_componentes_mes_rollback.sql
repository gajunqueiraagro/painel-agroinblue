-- ROLLBACK R3 (Migração 3). Funcao nova -> drop puro. Rodar APOS R4 (fn_composicao nao
--   depende de fn_cards, mas manter ordem 6->1 e seguro).
DROP FUNCTION IF EXISTS public.fn_cards_componentes_mes(uuid, text);
