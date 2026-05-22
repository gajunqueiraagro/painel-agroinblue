-- PR0.A · Mesa Operacional v2 · Extensions
-- Habilita pg_trgm (busca textual da Mesa) e pg_cron (TTL staging futuro).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_cron;
