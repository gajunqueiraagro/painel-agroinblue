-- CUSTEIO-HASH-01 — conserto de dado do cliente a6793f65 (set/26): o F.G.T.S em dobro sai e os 23 lancados pelo custeio
-- ganham o hash. EXECUTAR SO' com o SIM do Gabriel, DEPOIS da migration 20261027197200 aplicada (sem ela o gatilho apaga o
-- hash no proprio UPDATE). Um bloco, uma transacao; qualquer guarda que falhe aborta tudo.
-- ⚠ EXECUTADO em 13/10/2026, com o SIM do Gabriel, pelo MCP de escrita do proto: 1 cancelado, 23 com hash (23 distintos),
--   `editado_manual` intocado. Fica como registro; reexecutar cai na guarda B1.
--
-- B1  cancela 5c1d3c94-0d96-4134-9fad-6fa71538445e (o segundo "F.G.T.S - FAZENDA 971,09", criado 12 s depois do primeiro) pelo
--     dono `fn_cancelar_lancamento_auditoria`; fica 89dbc18d-819c-4217-a795-0bbf50869f72. No TXT ha' um so'.
-- B2  grava `hash_importacao` nos 23 vivos de set/26 criados em 13/10/2026 (UTC), origem 'manual', sem lote e sem hash — o hash
--     do custeio (espelho de `hashItemCusteio.ts`: cliente|AAAA-MM|valor com 2 casas|descricao sem acento, espacos colapsados,
--     trim, MAIUSCULA; SHA-256 em hexadecimal).
-- O QUE MAIS MUDA: `updated_at` e uma linha de `audit_log` por lancamento (os gatilhos de sempre). `editado_manual` NAO muda
--     (`mark_financeiro_lancamento_v2_editado_manual` so' age em lancamento com lote, e nao compara o hash).
-- GESTO CONTRARIO:
--     B2: update public.financeiro_lancamentos_v2 set hash_importacao = null
--          where cliente_id = 'a6793f65-7005-458f-95e5-d195f8cf7631' and hash_importacao is not null and lote_importacao_id is null
--            and data_competencia >= '2026-09-01' and data_competencia < '2026-10-01'
--            and created_at >= '2026-10-13' and created_at < '2026-10-14';
--     B1: descancelar nao tem dono geral — update … set cancelado = false, cancelado_em = null, cancelado_por = null,
--          cancelado_motivo = null where id = '5c1d3c94-0d96-4134-9fad-6fa71538445e' (so' com decisao do Gabriel).
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $conserto$
declare
  c_cli   constant uuid := 'a6793f65-7005-458f-95e5-d195f8cf7631';
  c_fica  constant uuid := '89dbc18d-819c-4217-a795-0bbf50869f72';
  c_sai   constant uuid := '5c1d3c94-0d96-4134-9fad-6fa71538445e';
  c_motivo constant text := 'Lançado em dobro pelo custeio em 13/10/2026 (F.G.T.S - FAZENDA 971,09; fica 89dbc18d) — CUSTEIO-HASH-01';
  v_n int; v_d int; v_rel text;
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.set_financeiro_lancamento_v2_hash()'::regprocedure)
     is distinct from '0db2f21916a79511aac98bc534131691' then
    raise exception 'a migration 20261027197200 nao esta'' aplicada: o gatilho apagaria o hash';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);

  -- B1: guarda de estado — os dois vivos, iguais, sem hash
  select count(*) into v_n from public.financeiro_lancamentos_v2
   where id in (c_fica, c_sai) and cliente_id = c_cli and coalesce(cancelado, false) = false
     and descricao = 'F.G.T.S - FAZENDA' and valor = 971.09 and data_competencia = date '2026-09-30'
     and hash_importacao is null and lote_importacao_id is null;
  if v_n is distinct from 2 then raise exception 'B1 guarda: esperava os 2 F.G.T.S vivos, iguais e sem hash; achei %', v_n; end if;
  perform public.fn_cancelar_lancamento_auditoria(c_sai, c_motivo);
  if (select cancelado from public.financeiro_lancamentos_v2 where id = c_sai) is distinct from true
     or (select coalesce(cancelado, false) from public.financeiro_lancamentos_v2 where id = c_fica) is distinct from false then
    raise exception 'B1: o cancelamento nao ficou como esperado';
  end if;

  -- B2: guarda de estado — exatamente 23
  select count(*) into v_n from public.financeiro_lancamentos_v2
   where cliente_id = c_cli and coalesce(cancelado, false) = false
     and data_competencia >= '2026-09-01' and data_competencia < '2026-10-01'
     and created_at >= '2026-10-13' and created_at < '2026-10-14'
     and origem_lancamento = 'manual' and lote_importacao_id is null and hash_importacao is null;
  if v_n is distinct from 23 then raise exception 'B2 guarda: esperava 23 lancamentos sem hash; achei %', v_n; end if;

  update public.financeiro_lancamentos_v2 l
     set hash_importacao = encode(extensions.digest(
           l.cliente_id::text || '|' || to_char(l.data_competencia, 'YYYY-MM') || '|' || to_char(l.valor, 'FM999999990.00') || '|'
           || upper(public.unaccent(trim(regexp_replace(l.descricao, '\s+', ' ', 'g')))), 'sha256'), 'hex')
   where l.cliente_id = c_cli and coalesce(l.cancelado, false) = false
     and l.data_competencia >= '2026-09-01' and l.data_competencia < '2026-10-01'
     and l.created_at >= '2026-10-13' and l.created_at < '2026-10-14'
     and l.origem_lancamento = 'manual' and l.lote_importacao_id is null and l.hash_importacao is null;
  get diagnostics v_n = row_count;
  if v_n is distinct from 23 then raise exception 'B2: o UPDATE tocou % linhas, esperado 23', v_n; end if;

  -- depois: 23 com hash, 23 hashes distintos, e nenhum outro lancamento tocado nesta transacao (23 + o cancelado)
  select count(*), count(distinct hash_importacao) into v_n, v_d from (
    select hash_importacao from public.financeiro_lancamentos_v2
     where cliente_id = c_cli and coalesce(cancelado, false) = false
       and data_competencia >= '2026-09-01' and data_competencia < '2026-10-01'
       and created_at >= '2026-10-13' and created_at < '2026-10-14'
       and lote_importacao_id is null and hash_importacao is not null and length(hash_importacao) = 64) s;
  if v_n is distinct from 23 or v_d is distinct from 23 then raise exception 'B2 depois: % com hash, % distintos (esperado 23 e 23)', v_n, v_d; end if;
  -- `updated_at` e' carimbado pelo gatilho com o instante da transacao: quem foi tocado aqui tem updated_at >= now()
  select count(*) into v_n from public.financeiro_lancamentos_v2 where updated_at >= now();
  if v_n is distinct from 24 then raise exception 'linhas de lancamento tocadas nesta transacao: %, esperado 24 (23 + o cancelado)', v_n; end if;
  if (select hash_importacao from public.financeiro_lancamentos_v2 where id = c_sai) is not null then
    raise exception 'o cancelado nao deveria ganhar hash';
  end if;

  select string_agg(left(id::text, 8) || ' ' || left(hash_importacao, 8), ', ' order by created_at, id) into v_rel
    from public.financeiro_lancamentos_v2
   where cliente_id = c_cli and coalesce(cancelado, false) = false and hash_importacao is not null and lote_importacao_id is null
     and data_competencia >= '2026-09-01' and data_competencia < '2026-10-01';
  raise notice 'CUSTEIO-HASH-01 conserto: 1 cancelado (5c1d3c94), 23 com hash — %', v_rel;
end
$conserto$;
COMMIT;
