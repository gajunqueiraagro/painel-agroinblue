-- PR0.A · Mesa Operacional v2 · Setting de modo e função helper
-- 3 estados de operação das triggers de defesa: off | log | enforce.

-- Setting da sessão atual (não persiste no nível de database).
-- Persistência é via aplicação via SET ao iniciar conexão, OU via ALTER DATABASE
-- por DBA fora deste fluxo. Esta abordagem evita falha por permissão no Supabase.
DO $$
BEGIN
  PERFORM set_config('app.mesa_v2_triggers_enforce', 'log', false);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Não foi possível setar app.mesa_v2_triggers_enforce: %', SQLERRM;
END $$;

-- Função helper que lê o setting com fallback seguro.
-- O segundo argumento `true` em current_setting() retorna NULL se não existir
-- em vez de lançar exception — cobre o caso da nova conexão antes de SET.
CREATE OR REPLACE FUNCTION fn_get_mesa_v2_mode()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE v_mode TEXT;
BEGIN
  v_mode := current_setting('app.mesa_v2_triggers_enforce', true);
  IF v_mode IS NULL OR v_mode NOT IN ('off','log','enforce') THEN
    RETURN 'log';
  END IF;
  RETURN v_mode;
END $$;

COMMENT ON FUNCTION fn_get_mesa_v2_mode() IS
'Mesa Operacional v2. Lê o setting app.mesa_v2_triggers_enforce com fallback
seguro para "log". Valores válidos: off / log / enforce.
- off:     bypass total, trigger não executa lógica de defesa (emergência).
- log:     trigger registra warning em conciliacao_audit_log, NÃO bloqueia.
- enforce: trigger bloqueia operação ilegal com RAISE EXCEPTION.
Setting é por sessão. Para persistir globalmente, DBA executa
ALTER DATABASE postgres SET app.mesa_v2_triggers_enforce = ''log''
fora do fluxo de migration. Criada PR0.A.';

-- Função de TTL: expira stagings antigos
CREATE OR REPLACE FUNCTION fn_expirar_stagings_antigos()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE qtd INTEGER;
BEGIN
  UPDATE extrato_bancario_staging
  SET status = 'expirado', descartado_em = now()
  WHERE status = 'aberto' AND expira_em < now();
  GET DIAGNOSTICS qtd = ROW_COUNT;
  RETURN qtd;
END $$;

COMMENT ON FUNCTION fn_expirar_stagings_antigos() IS
'Mesa Operacional v2. Marca como expirados os stagings abertos com expira_em
ultrapassado. Idempotente. Agendamento via pg_cron em PR0.A.
Retorna número de stagings expirados nesta execução. Criada PR0.A.';

-- Cron job diário (3h da manhã UTC). Determinístico: só agenda se não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'mesa_v2_expirar_stagings'
  ) THEN
    PERFORM cron.schedule(
      'mesa_v2_expirar_stagings',
      '0 3 * * *',
      $cron$SELECT fn_expirar_stagings_antigos()$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron.schedule não disponível ou erro ao agendar: %', SQLERRM;
END $$;
