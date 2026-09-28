-- 20261027162000_cache_rrcc_2021_01.sql
-- CACHE-RRCC-2021-01: rematerializa tres (fazenda, ano) que estavam SEM LINHA NENHUMA no `zoot_mensal_cache`, com 12 meses de
-- fechamento cada. Migration de DADO: nenhuma funcao, gatilho ou tabela muda; a rotina e' a oficial, `refresh_zoot_cache`.
--   RRCC        Faz. Ursa Maior  2021   (69e8e39b-7781-435e-8d9d-d4c2f330a0d8)
--   NJ Pecuaria Faz. Sta. Luzia  2020   (37e1641a-74c8-41a4-9ab2-a2b39c49f833)
--   NJ Pecuaria Faz. Sta. Luzia  2022   (37e1641a-74c8-41a4-9ab2-a2b39c49f833)
--
-- A CAUSA: os gatilhos `trg_invalidate_zoot_cache*` (lancamentos, fechamento_pastos, fechamento_pasto_itens, saldos_iniciais)
-- APAGAM o (fazenda, ano) inteiro e NAO reconstroem; so' o hook `useZootCategoriaMensal` reconstroi, quando alguem abre aquele
-- ano; o DRE le' o cache sem garantir. RRCC 2021: as duas vendas de 05/06/2021 recriadas em 26/09 (10:01-11:19). Sta. Luzia
-- 2020: o cancelamento de 25/09 16:35 da venda antiga da OC 6a808c4c. Sta. Luzia 2022: NAO DETERMINADA — nenhuma gravacao
-- auditada de 2022 depois da reconstrucao de 24/09 (RECLASS-PESO-BACKFILL-01, que refez o NJ inteiro).
--
-- ⚠ MUDA NUMERO: com a Sta. Luzia 2020 sem cache, o P0 dela caia em 'zero' e o rebanho inteiro (1.124 cab) virava producao.
--   NJ 2020: VBP 12.800.620,52 -> 10.316.601,75; Lucro operacional 7.853.972,91 -> 5.369.954,15; Lucro liquido
--   11.136.599,70 -> 8.873.657,32 (o homologado do CATEGORIA-DESCARTE-01). RRCC 2021 e NJ 2022: resultado igual; producao,
--   custo por @, GMD e ponte passam a existir. Vizinhos (NJ 2021/2023, RRCC 2022): so' `cab_media` e centavos de rateio por
--   fazenda. Meta: VBP e resultado iguais. Provado em rollback no proto em 28/09/2026 (FASE 0).
--
-- GUARDA: aborta se QUALQUER dos tres ja tiver linha no cache (reexecutar nao refaz nada) e confere, depois, 12 meses
-- realizados em cada um.

do $mig$
declare
  r record; n int;
begin
  for r in select * from (values
      ('69e8e39b-7781-435e-8d9d-d4c2f330a0d8'::uuid, 2021),
      ('37e1641a-74c8-41a4-9ab2-a2b39c49f833'::uuid, 2020),
      ('37e1641a-74c8-41a4-9ab2-a2b39c49f833'::uuid, 2022)) v(fid, ano)
  loop
    select count(*) into n from public.zoot_mensal_cache where fazenda_id = r.fid and ano = r.ano;
    if n > 0 then
      raise exception 'CACHE-RRCC-2021-01: (%, %) ja tem % linhas no cache; nada a rematerializar', r.fid, r.ano, n;
    end if;
  end loop;

  for r in select * from (values
      ('69e8e39b-7781-435e-8d9d-d4c2f330a0d8'::uuid, 2021),
      ('37e1641a-74c8-41a4-9ab2-a2b39c49f833'::uuid, 2020),
      ('37e1641a-74c8-41a4-9ab2-a2b39c49f833'::uuid, 2022)) v(fid, ano)
  loop
    perform public.refresh_zoot_cache(r.fid, r.ano);
    select count(distinct mes) into n from public.zoot_mensal_cache
     where fazenda_id = r.fid and ano = r.ano and cenario = 'realizado';
    if n <> 12 then
      raise exception 'CACHE-RRCC-2021-01: (%, %) ficou com % meses realizados; esperado 12', r.fid, r.ano, n;
    end if;
  end loop;
end $mig$;
