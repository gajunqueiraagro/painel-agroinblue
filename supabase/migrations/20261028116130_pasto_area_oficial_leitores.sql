-- PASTO-AREA-OFICIAL-01 · 116130 — os LEITORES do banco pedem a área OFICIAL DO MÊS (`fn_pasto_area_no_mes`, 116120), não a de hoje.
-- Sem isto, adotar a área do mapa de um mês em diante mudaria também os meses de antes (a lotação e a DRE liam `pastos.area_produtiva_ha`,
-- que é a área de hoje, para qualquer mês). PATCHES GUARDADOS POR MD5 do corpo conferido em 01/11 e pela contagem exata da troca:
--   * fn_pastos_aplicaveis_mes (os pastos do mês que o P1 congela em `fechamento_pastos_membros.area_considerada_ha`): 1 troca;
--   * fn_lotacao_do_mes (FECH-ROTACAO-01, Code 1): a área do pasto no rateio do lote, na coluna e no UA/ha: 12 trocas;
--   * fn_dre_pecuaria (o `areap`, a área pecuária por fazenda × mês): 2 trocas.
-- Os meses já fechados têm a área congelada no snapshot (P1) — estes leitores só deixam de reescrever os meses abertos de antes da mudança.
-- Corpo mudado por outro Code depois de 01/11 = a migration PARA (md5), e a troca se refaz sobre o corpo novo.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

do $patch$
declare
  c record; d text; n int;
begin
  for c in select * from (values
      ('public.fn_pastos_aplicaveis_mes(uuid,text)'::regprocedure, 'd2f64f93ec3daa4fbb2f63348a3a17ee',
       'coalesce(p.area_produtiva_ha, p.area) AS area_considerada_ha',
       'coalesce(public.fn_pasto_area_no_mes(p.id, p_ano_mes), p.area) AS area_considerada_ha', 1),
      ('public.fn_lotacao_do_mes(uuid,text)'::regprocedure, '496550050d7523b3ed2f32d2b8f39083',
       'p.area_produtiva_ha', 'public.fn_pasto_area_no_mes(p.id, p_ano_mes)', 12),
      ('public.fn_dre_pecuaria(uuid,text,text,text)'::regprocedure, 'b011bbc823b417fdd1e505fe9e365666',
       'pa.area_produtiva_ha', 'public.fn_pasto_area_no_mes(pa.id, fp.ano_mes)', 2)
    ) t(f, md5, de, para, vezes) loop
    if (select md5(p.prosrc) from pg_proc p where p.oid = c.f) is distinct from c.md5 then
      raise exception '116130: o corpo de % nao e'' o conferido em 01/11 (md5 %)', c.f, (select md5(p.prosrc) from pg_proc p where p.oid = c.f);
    end if;
    d := pg_get_functiondef(c.f);
    n := (length(d) - length(replace(d, c.de, ''))) / length(c.de);
    if n <> c.vezes then raise exception '116130: em % esperava % ocorrencia(s) de "%", achei %', c.f, c.vezes, c.de, n; end if;
    execute replace(d, c.de, c.para);
    if (select p.prosrc like '%' || c.de || '%' from pg_proc p where p.oid = c.f) then
      raise exception '116130: % ainda le a area de hoje', c.f;
    end if;
  end loop;
end $patch$;
