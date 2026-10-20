-- CONC-BLOCO-SINAL-MISTO-01 item 2 — a competencia dos lancamentos de uma parcela ACOMPANHA o vencimento quando ele e' ajustado
-- (Gabriel, 20/10/2026). Nasce do consorcio 002122: a parcela 1 foi ajustada a' mao de 17/07 para 17/06 e os dois lancamentos dela
-- ficaram com o vencimento novo e a competencia antiga (17/07), levando a taxa adm. ao DRE de julho.
--   O dono e' o motor das parcelas de credito e de consorcio, `fn_reconciliar_parcela_financiamento` (c77919c7… -> 1df9f3c1…): todo
--   gesto que muda o vencimento da parcela (editar parcelas, o lapis, regerar, prorrogar, o consorcio) passa por ele, e ele trocava so'
--   o `data_vencimento` do lancamento. Agora troca a competencia junto, no MESMO UPDATE (o `ano_mes` acompanha pelo gatilho; a trilha
--   e' a do proprio gesto — `financiamento_parcelas_operacoes` — e o `audit_log` do lancamento). Lancamento cujo vencimento nao muda
--   nao e' tocado: as competencias antigas diferentes do vencimento ficam como estao (a contagem esta' no relatorio).
--   ⚠ COMPRA PARCELADA FICA FORA: o escritor dela e' `fn_parcelamento_editar_parcelas`, e a competencia da parcela de compra e' a data da
--   COMPRA (280 de 280 lancamentos medidos em 20/10) — decisao do Gabriel pendente.
-- Patch guardado por md5 (origem, a ancora 1x, destino); assinatura, SECURITY e ACL iguais.

set local lock_timeout = '2s';

create or replace function pg_temp._troca(t text, a text, b text, rotulo text) returns text language plpgsql as $f$
begin
  if (length(t) - length(replace(t, a, ''))) / length(a) <> 1 then raise exception 'ancora % nao casa 1x', rotulo; end if;
  return replace(t, a, b);
end $f$;

do $mig$
declare v_oid oid; v_src text; v_new text; v_acl text;
begin
  v_oid := 'public.fn_reconciliar_parcela_financiamento(uuid, boolean, boolean, uuid)'::regprocedure;
  select prosrc, proacl::text into v_src, v_acl from pg_proc where oid = v_oid;
  if md5(v_src) <> '1df9f3c17c98fd40b065724b450cd42a' then
    if md5(v_src) <> 'c77919c73c7b979332df16727f9a725d' then raise exception 'motor: origem inesperada %', md5(v_src); end if;
    v_new := pg_temp._troca(pg_get_functiondef(v_oid),
      $a$            UPDATE financeiro_lancamentos_v2 SET data_vencimento = NULLIF(v_depois,'')::date WHERE id = v_alvo;$a$,
      $a$            -- CONC-BLOCO-SINAL-MISTO-01 item 2: a competencia ACOMPANHA o vencimento da parcela (ajuste a' mao, regerar, prorrogar)
            UPDATE financeiro_lancamentos_v2 SET data_vencimento = NULLIF(v_depois,'')::date,
                   data_competencia = COALESCE(NULLIF(v_depois,'')::date, data_competencia) WHERE id = v_alvo;$a$, 'M1');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '1df9f3c17c98fd40b065724b450cd42a' then raise exception 'motor: destino inesperado %', md5(v_src); end if;
    if (select proacl::text from pg_proc where oid = v_oid) is distinct from v_acl then raise exception 'motor: ACL mudou'; end if;
  end if;
end $mig$;
