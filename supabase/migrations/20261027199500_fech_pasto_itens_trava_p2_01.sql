-- FECH-PASTO-SALVAR-TRANSACAO-01 parte 2 (Gabriel 16/10/2026) — a trava P2 dos itens do pasto passa a valer tambem em INSERT e DELETE.
-- Antes o gatilho `trg_guard_pasto_itens_snapshot` era so' BEFORE UPDATE, e quem troca itens por DELETE + INSERT (o salvar do
-- modal, a importacao do mapa) passava por cima de mes com Valor do Rebanho validado ou P2 fechado. A FUNCAO do gatilho nao muda
-- (ja' tratava DELETE pelo OLD): so' o gatilho e' recriado, com a mesma funcao e a mesma frase.
-- ⚠ DDL EM TABELA DE USO: aplicar so' antes das 07h ou depois das 20h (regra do Gabriel). ⚠ `ON DELETE CASCADE` do card: apagar um
--   card de mes travado passa a ser recusado tambem (nenhum escritor apaga card hoje).
SET LOCAL lock_timeout = '2s';

DO $g$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'guard_pasto_itens_snapshot') IS DISTINCT FROM '00b3e96b8b68889d403955ae450204a1' THEN
    RAISE EXCEPTION 'FECH-PASTO-SALVAR-TRANSACAO-01 parte 2: guard_pasto_itens_snapshot fora do md5 medido. Abortado.';
  END IF;
END $g$;

DROP TRIGGER trg_guard_pasto_itens_snapshot ON public.fechamento_pasto_itens;
CREATE TRIGGER trg_guard_pasto_itens_snapshot BEFORE INSERT OR UPDATE OR DELETE ON public.fechamento_pasto_itens
  FOR EACH ROW EXECUTE FUNCTION public.guard_pasto_itens_snapshot();
