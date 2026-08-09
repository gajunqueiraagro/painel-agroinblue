#!/usr/bin/env bash
# ============================================================================
# PR-FIN-DATAS-VENCIMENTO-02E — TESTES NEGATIVOS N1, N2, N3   [KIT v3]
#
# Exigidos pelo parecer que reprovou o kit v1 (P1: idempotencia da funcao).
#
# ############################################################################
# #  ESTE SCRIPT DESTROI OBJETOS DE BANCO. SO PODE RODAR EM STACK LOCAL      #
# #  DESCARTAVEL. O GUARD ABAIXO E FAIL-CLOSED: na duvida, RECUSA.           #
# ############################################################################
#
# Ele cria e derruba `public.fn_ano_mes_from_competencia`, instala funcoes
# divergentes de proposito e cria um event trigger. Em um banco com dados
# reais isso seria destrutivo. Por isso NAO basta passar a URL certa: e
# preciso satisfazer, simultaneamente, todas as condicoes do guard.
#
# ---------------------------------------------------------------------------
# COMO RODAR
#
#   export CONFIRMO_STACK_LOCAL_DESCARTAVEL_02E='SIM-DESTRUIR-BANCO-LOCAL-EFEMERO-02E'
#   bash pr_fin_datas_vencimento_02e_negativos.sh <DB_URL_LOCAL> <caminho_migration>
#
# Pre-requisito: o setup do ensaio deve ter criado a ANCORA SINTETICA
# (seed deterministica + tabela marcadora). Ver §ANCORA. O script remove a
# marcadora ao final — ela nao sobrevive ao ensaio.
#
# ---------------------------------------------------------------------------
# MECANISMO DE CAPTURA DA FALHA ESPERADA
#
# N1 e N2 exigem que a migration ABORTE. Rodá-la dentro do mesmo bloco plpgsql
# do teste faria um handler EXCEPTION capturar o erro — e um gate vermelho
# poderia virar verde. Por isso cada negativo executa a migration em um
# PROCESSO psql SEPARADO, com ON_ERROR_STOP=1 e --single-transaction, e o gate
# le o CODIGO DE SAIDA:
#
#     exit code != 0  -> falha esperada ocorreu     -> PASS
#     exit code == 0  -> a migration NAO abortou    -> FAIL (gate vermelho)
#
# Nao ha bloco EXCEPTION em lugar nenhum deste arquivo.
#
# ---------------------------------------------------------------------------
# ISOLAMENTO
#
# As fixtures divergentes de N1 e N2 sao COMMITADAS, porque a migration precisa
# enxerga-las de outro processo — uma transacao aberta seria invisivel. Isso e
# aceitavel SOMENTE porque o guard ja provou que o alvo e um stack local
# efemero e sintetico. Nenhuma fixture toca linha de dados: sao objetos de
# catalogo criados e destruidos pelo proprio teste, com conferencia de residuo.
# ============================================================================
set -u

# ============================================================================
# GUARD FAIL-CLOSED — nada abaixo executa antes de todas as condicoes passarem
# ============================================================================
CONFIRMACAO_ESPERADA='SIM-DESTRUIR-BANCO-LOCAL-EFEMERO-02E'
PORTA_EXIGIDA='54322'
MAX_LINHAS=100
MARCADOR_TABELA='_ensaio_02e_marcador'
MARCADOR_TOKEN='ENSAIO-02E-STACK-EFEMERO'
PREFIXO_SINTETICO='00000000-0000-4000-8000-%'

recusar() {
  echo "GUARD 02E: RECUSADO — $1" >&2
  echo "GUARD 02E: nenhum comando destrutivo foi executado." >&2
  exit 90
}

# ---- FASE 0: validacao TEXTUAL. Roda ANTES de qualquer chamada a psql. -----
[ $# -ge 2 ] || recusar "uso: $0 <DB_URL_LOCAL> <caminho_migration>"
DB="$1"
MIG="$2"

[ "${CONFIRMO_STACK_LOCAL_DESCARTAVEL_02E:-}" = "$CONFIRMACAO_ESPERADA" ] \
  || recusar "variavel CONFIRMO_STACK_LOCAL_DESCARTAVEL_02E ausente ou diferente do valor literal exigido"

[ -f "$MIG" ] || recusar "arquivo de migration nao encontrado"

case "$DB" in
  postgres://*|postgresql://*) : ;;
  *) recusar "a URL nao e uma URL PostgreSQL valida" ;;
esac

# Extrai host/porta SEM tocar em usuario/senha, e sem nunca ecoar a DSN.
_sem_esquema="${DB#*://}"
_sem_credenciais="${_sem_esquema##*@}"
_autoridade="${_sem_credenciais%%/*}"
_autoridade="${_autoridade%%\?*}"
case "$_autoridade" in
  \[*\]:*) HOST="${_autoridade%%]*}"; HOST="${HOST#\[}"; PORTA="${_autoridade##*]:}" ;;
  \[*\])   HOST="${_autoridade%%]*}"; HOST="${HOST#\[}"; PORTA="" ;;
  *:*)     HOST="${_autoridade%%:*}";  PORTA="${_autoridade##*:}" ;;
  *)       HOST="$_autoridade";        PORTA="" ;;
esac

case "$HOST" in
  127.0.0.1|localhost|::1) : ;;
  *) recusar "host nao e local (recebido um host fora de {127.0.0.1, localhost, ::1})" ;;
esac

[ "$PORTA" = "$PORTA_EXIGIDA" ] \
  || recusar "porta diferente de $PORTA_EXIGIDA (recebida: '${PORTA:-vazia}')"

# Lista de negacao: nenhum ref/host conhecido de ambiente gerenciado.
for _proibido in binbcdfbisgscrifztia duttifnbxqtyyybjmouv sbwfacryawstuvhlaezm \
                 supabase.co supabase.com pooler.supabase supabase.in amazonaws.com; do
  case "$DB" in
    *"$_proibido"*) recusar "a URL contem um identificador de ambiente gerenciado — alvo proibido" ;;
  esac
done

echo "GUARD 02E fase 0 (textual) OK: host=$HOST porta=$PORTA  [DSN nao ecoada]"

# ---- FASE 1: validacao IN-BAND. Roda ANTES de qualquer DDL. ----------------
_q() { psql "$DB" -qAt -X -v ON_ERROR_STOP=1 -c "$1" 2>/dev/null; }

_vivo="$(_q 'select 1')" || true
[ "$_vivo" = "1" ] || recusar "nao consegui conectar ao banco"

_ro="$(_q 'show transaction_read_only')"
[ "$_ro" = "off" ] || recusar "sessao read-only (transaction_read_only=$_ro) — ambiente nao e o stack local de ensaio"

# O servidor nao pode estar em endereco publico. Atencao: o Postgres do stack
# local roda em container e reporta o IP da bridge Docker (ex.: 172.18.0.2),
# nao 127.0.0.1 — exigir loopback aqui produziria falso-vermelho e impediria o
# ensaio legitimo. A localidade do lado do cliente ja foi provada na fase 0;
# esta checagem serve para barrar servidor em IP roteavel.
_escopo="$(_q "select case
                 when inet_server_addr() is null then 'local'
                 when inet_server_addr() = inet '::1' then 'privado'
                 when inet_server_addr() << inet '127.0.0.0/8'
                   or inet_server_addr() << inet '10.0.0.0/8'
                   or inet_server_addr() << inet '172.16.0.0/12'
                   or inet_server_addr() << inet '192.168.0.0/16' then 'privado'
                 else 'publico' end")"
case "$_escopo" in
  local|privado) : ;;
  *) recusar "o servidor esta em endereco publico/roteavel — alvo proibido" ;;
esac

_existe_tabela="$(_q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='financeiro_lancamentos_v2'")"
[ "$_existe_tabela" = "1" ] || recusar "tabela financeiro_lancamentos_v2 ausente — alvo inesperado"

_linhas="$(_q 'select count(*) from public.financeiro_lancamentos_v2')"
case "$_linhas" in ''|*[!0-9]*) recusar "nao consegui medir a cardinalidade" ;; esac
[ "$_linhas" -le "$MAX_LINHAS" ] \
  || recusar "a tabela tem $_linhas linhas (limite $MAX_LINHAS) — parece base com dados reais"

# ANCORA SINTETICA — quatro provas independentes, todas obrigatorias.
# Nao dependemos apenas da cardinalidade.
_fora_do_prefixo="$(_q "select count(*) from public.financeiro_lancamentos_v2 where id::text not like '$PREFIXO_SINTETICO'")"
[ "$_fora_do_prefixo" = "0" ] \
  || recusar "$_fora_do_prefixo linha(s) com id fora do conjunto sintetico esperado"

_fora_da_descricao="$(_q "select count(*) from public.financeiro_lancamentos_v2 where descricao is distinct from null and descricao not like 'SEED 02E %'")"
[ "$_fora_da_descricao" = "0" ] \
  || recusar "$_fora_da_descricao linha(s) com descricao fora do padrao sintetico"

_cadastros="$(_q "select (select count(*) from public.clientes) + (select count(*) from public.fazendas)")"
case "$_cadastros" in ''|*[!0-9]*) recusar "nao consegui medir os cadastros" ;; esac
[ "$_cadastros" -le 4 ] \
  || recusar "$_cadastros cadastros de cliente/fazenda — base povoada, nao e stack de ensaio"

_marcador="$(_q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='$MARCADOR_TABELA'")"
[ "$_marcador" = "1" ] \
  || recusar "tabela marcadora public.$MARCADOR_TABELA ausente — o setup do ensaio nao rodou neste banco"

_token="$(_q "select coalesce(max(token),'') from public.$MARCADOR_TABELA")"
[ "$_token" = "$MARCADOR_TOKEN" ] \
  || recusar "token da tabela marcadora nao confere"

echo "GUARD 02E fase 1 (in-band) OK: linhas=$_linhas cadastros=$_cadastros ancora=4/4 marcador=presente"
echo "GUARD 02E: alvo aceito. Iniciando ensaio destrutivo."
echo

# ============================================================================
# ENSAIO — a partir daqui o guard ja autorizou
# ============================================================================
FALHAS=0
q() { psql "$DB" -qAt -c "$1"; }
ok()   { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FALHAS=$((FALHAS+1)); }

acl() {
  q "select coalesce(string_agg(coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type,',' order by 1),'(vazia)')
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where n.nspname='public' and p.proname='fn_ano_mes_from_competencia'"
}
corpo_md5() {
  q "select coalesce(md5(prosrc),'(ausente)') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='fn_ano_mes_from_competencia'"
}
fn_xmin() {
  q "select coalesce(p.xmin::text,'(ausente)') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='fn_ano_mes_from_competencia'"
}

echo "############ N3 — REAPLICACAO VERDADEIRA (no-op) ############"
if [ "$(q "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
            where c.relname='financeiro_lancamentos_v2' and t.tgname='trg_00_ano_mes_from_competencia'")" != "1" ]; then
  fail "N3 pre-condicao: 02E precisa estar aplicado antes de N3"
else
  # Um event trigger ddl_command_end enxerga CREATE / ALTER / COMMENT / GRANT /
  # REVOKE ainda que emitidos por EXECUTE dinamico dentro de um DO — que e
  # exatamente o furo do kit v1.
  psql "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE public._n3_ddl_log(tag text, obj text);
CREATE FUNCTION public._n3_cap() RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    INSERT INTO public._n3_ddl_log VALUES (tg_tag, coalesce(r.object_identity,'?'));
  END LOOP;
  IF NOT FOUND THEN INSERT INTO public._n3_ddl_log VALUES (tg_tag, '(sem objeto)'); END IF;
END $$;
CREATE EVENT TRIGGER _n3_et ON ddl_command_end EXECUTE FUNCTION public._n3_cap();
SQL
  XMIN_ANTES=$(fn_xmin); MD5_ANTES=$(corpo_md5); ACL_ANTES=$(acl)
  echo "--- log bruto da reaplicacao (stdout+stderr do psql) ---"
  psql "$DB" --single-transaction -v ON_ERROR_STOP=1 -q -f "$MIG" 2>&1 | sed 's/^/  | /'
  RC=${PIPESTATUS[0]}
  echo "--- fim do log bruto (exit=$RC) ---"
  DDL=$(q "select coalesce(string_agg(tag||' '||obj,' ; '),'(nenhum)') from public._n3_ddl_log")
  psql "$DB" -q -c "DROP EVENT TRIGGER _n3_et; DROP FUNCTION public._n3_cap(); DROP TABLE public._n3_ddl_log;"

  [ "$RC" = "0" ] && ok "N3.1 reaplicacao concluiu sem erro" || fail "N3.1 reaplicacao falhou (exit=$RC)"
  echo "  DDL capturado pelo event trigger: $DDL"
  if [ "$DDL" = "(nenhum)" ]; then
    ok "N3.2 nenhum comando DDL emitido — no-op verdadeiro comprovado no catalogo"
  else
    fail "N3.2 DDL emitido durante reaplicacao: $DDL"
  fi
  [ "$(fn_xmin)" = "$XMIN_ANTES" ] && ok "N3.3 pg_proc.xmin inalterado ($XMIN_ANTES) — linha de catalogo nao foi reescrita" \
                                   || fail "N3.3 pg_proc.xmin mudou: $XMIN_ANTES -> $(fn_xmin)"
  [ "$(corpo_md5)" = "$MD5_ANTES" ] && ok "N3.4 corpo inalterado ($MD5_ANTES)" || fail "N3.4 corpo mudou"
  [ "$(acl)" = "$ACL_ANTES" ] && ok "N3.5 ACL inalterada ($ACL_ANTES)" || fail "N3.5 ACL mudou"
fi

psql "$DB" -q -c "DROP TRIGGER IF EXISTS trg_00_ano_mes_from_competencia ON public.financeiro_lancamentos_v2;
                  DROP FUNCTION IF EXISTS public.fn_ano_mes_from_competencia();"

echo
echo "############ N1 — CORPO DIVERGENTE (deve abortar) ############"
# Mesmo nome/assinatura/atributos/owner/ACL/comentario; corpo DIFERENTE. E o
# caso que o CREATE OR REPLACE do kit v1 sobrescrevia em silencio.
psql "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE FUNCTION public.fn_ano_mes_from_competencia() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp' AS $x$
BEGIN
  NEW.ano_mes := '1999-01';
  RETURN NEW;
END
$x$;
REVOKE ALL ON FUNCTION public.fn_ano_mes_from_competencia() FROM PUBLIC, anon, authenticated, service_role;
-- Comentario canonico proposital: assim o UNICO eixo divergente e o CORPO,
-- e o aborto prova deteccao de corpo, nao de metadado acessorio.
COMMENT ON FUNCTION public.fn_ano_mes_from_competencia() IS
  'PR-FIN-DATAS-VENCIMENTO-02E. Deriva ano_mes de data_competencia no INSERT e quando a competencia muda; restaura OLD.ano_mes caso contrario. Competencia NULL resulta em ano_mes NULL (falha visivel sem recusa).';
SQL
MD5_N1=$(corpo_md5); ACL_N1=$(acl)
echo "  corpo divergente instalado: md5=$MD5_N1"
echo "--- log bruto (falha esperada) ---"
psql "$DB" --single-transaction -v ON_ERROR_STOP=1 -q -f "$MIG" 2>&1 | sed 's/^/  | /'
RC=${PIPESTATUS[0]}
echo "--- fim do log bruto (exit=$RC) ---"
[ "$RC" != "0" ] && ok "N1.1 migration abortou (exit=$RC)" || fail "N1.1 migration NAO abortou — corpo divergente foi aceito"
[ "$(corpo_md5)" = "$MD5_N1" ] && ok "N1.2 corpo divergente PRESERVADO (md5=$MD5_N1) — nada foi sobrescrito" \
                               || fail "N1.2 corpo divergente foi alterado: $MD5_N1 -> $(corpo_md5)"
[ "$(q "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
         where c.relname='financeiro_lancamentos_v2' and t.tgname='trg_00_ano_mes_from_competencia'")" = "0" ] \
  && ok "N1.3 trigger nao foi criado — abortou ANTES de qualquer alteracao" || fail "N1.3 trigger foi criado apesar do aborto"
psql "$DB" -q -c "DROP FUNCTION public.fn_ano_mes_from_competencia();"

echo
echo "############ N2 — ACL DIVERGENTE (deve abortar) ############"
# Corpo e atributos CORRETOS; apenas a ACL diverge, com EXECUTE para anon.
psql "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE FUNCTION public.fn_ano_mes_from_competencia() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp' AS $x$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Sempre derivar. O ano_mes enviado pelo cliente e ignorado.
    NEW.ano_mes := pg_catalog.to_char(NEW.data_competencia, 'YYYY-MM');
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  IF NEW.data_competencia IS DISTINCT FROM OLD.data_competencia THEN
    -- Mudanca efetiva da competencia: deriva do novo valor.
    NEW.ano_mes := pg_catalog.to_char(NEW.data_competencia, 'YYYY-MM');
  ELSE
    -- Competencia inalterada: restaura o valor anterior, descartando qualquer
    -- tentativa de alterar ano_mes diretamente. Preserva literalmente
    -- divergencias e NULLs historicos.
    NEW.ano_mes := OLD.ano_mes;
  END IF;

  RETURN NEW;
END
$x$;
REVOKE ALL ON FUNCTION public.fn_ano_mes_from_competencia() FROM PUBLIC, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_ano_mes_from_competencia() TO anon;
COMMENT ON FUNCTION public.fn_ano_mes_from_competencia() IS
  'PR-FIN-DATAS-VENCIMENTO-02E. Deriva ano_mes de data_competencia no INSERT e quando a competencia muda; restaura OLD.ano_mes caso contrario. Competencia NULL resulta em ano_mes NULL (falha visivel sem recusa).';
SQL
MD5_N2=$(corpo_md5); ACL_N2=$(acl)
echo "  fixture N2: corpo md5=$MD5_N2 (deve ser o canonico), ACL=$ACL_N2"
if echo "$ACL_N2" | grep -q 'anon:EXECUTE'; then ok "N2.0 fixture valida — anon tem EXECUTE"; else fail "N2.0 fixture nao instalou o grant a anon"; fi
echo "--- log bruto (falha esperada) ---"
psql "$DB" --single-transaction -v ON_ERROR_STOP=1 -q -f "$MIG" 2>&1 | sed 's/^/  | /'
RC=${PIPESTATUS[0]}
echo "--- fim do log bruto (exit=$RC) ---"
[ "$RC" != "0" ] && ok "N2.1 migration abortou (exit=$RC)" || fail "N2.1 migration NAO abortou — ACL divergente foi aceita"
if [ "$(acl)" = "$ACL_N2" ] && echo "$(acl)" | grep -q 'anon:EXECUTE'; then
  ok "N2.2 ACL divergente PRESERVADA, inclusive o grant a anon ($(acl))"
else
  fail "N2.2 ACL foi alterada: $ACL_N2 -> $(acl)"
fi
[ "$(corpo_md5)" = "$MD5_N2" ] && ok "N2.3 corpo intocado" || fail "N2.3 corpo alterado"
[ "$(q "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
         where c.relname='financeiro_lancamentos_v2' and t.tgname='trg_00_ano_mes_from_competencia'")" = "0" ] \
  && ok "N2.4 trigger nao foi criado" || fail "N2.4 trigger foi criado apesar do aborto"
psql "$DB" -q -c "DROP FUNCTION public.fn_ano_mes_from_competencia();"

echo
echo "############ LIMPEZA DAS FIXTURES ############"
# O marcador nao pode sobreviver ao ensaio.
psql "$DB" -q -c "DROP TABLE IF EXISTS public.$MARCADOR_TABELA;"
RES=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname in ('fn_ano_mes_from_competencia','_n3_cap')")
RES2=$(q "select count(*) from pg_class where relname in ('_n3_ddl_log','$MARCADOR_TABELA')")
RES3=$(q "select count(*) from pg_event_trigger where evtname='_n3_et'")
RES4=$(q "select count(*) from public.financeiro_lancamentos_v2")
[ "$RES" = "0" ] && [ "$RES2" = "0" ] && [ "$RES3" = "0" ] \
  && ok "LIMPEZA zero residuo (funcoes=$RES tabelas=$RES2 event_trigger=$RES3 marcador removido); linhas intactas=$RES4" \
  || fail "LIMPEZA residuo: funcoes=$RES tabelas=$RES2 event_trigger=$RES3"

echo
if [ "$FALHAS" = "0" ]; then echo "RESULTADO NEGATIVOS: TODOS OS GATES PASSARAM"; else echo "RESULTADO NEGATIVOS: $FALHAS GATE(S) VERMELHO(S)"; fi
exit $FALHAS
