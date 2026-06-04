-- PR-PesoAtualizado-Check / FASE 1 — coluna boolean por pasto×categoria×mês.
-- Marca "peso conferido/atualizado pelo operador" no Mapa de Pastos.
-- false = peso projetado/estimado/não validado (default seguro para backfill).
-- Novos INSERT default false; copiarMesAnterior força false.
-- Guard de P2 (trg_guard_pasto_itens_snapshot, BEFORE UPDATE) cobre a alteração
-- automaticamente — toggle só é editável em mês aberto/reaberto.

ALTER TABLE fechamento_pasto_itens
  ADD COLUMN peso_atualizado boolean NOT NULL DEFAULT false;
