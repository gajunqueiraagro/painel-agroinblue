-- DRE-RATEIO-MODAL-01-fix1 — cada parcela do encontro de contas e' o arredondamento DELA; o centavo que sobra aparece
-- (Gabriel, 06/10/2026: nunca arredondar para "fazer bater", nunca engolir diferenca; o numero de uma atividade e' o MESMO em
-- qualquer tela).
--
-- O DEFEITO (da 20261027193700): no NJ, safra 24/25, o modal da lavoura mostrava pecuaria 860.293,07 e silvicultura 61.449,53,
--   e o cru arredondado e' 860.293,09 e 61.449,51; em 2025 pela porta da pecuaria, agricultura 316.633,58 com cru 316.633,585.
--   Dois mecanismos somados: (1) as parcelas nao protegidas eram arredondadas MES A MES e o resumo SOMAVA as linhas (a
--   silvicultura da safra 24/25 somada mes a mes da' 61.449,53); (2) o residuo de cada mes ia para a MAIOR DAS OUTRAS parcelas
--   (a pecuaria, pela porta da lavoura; a agricultura, pela da pecuaria), que absorvia o oposto.
--
-- ESTADO ANTERIOR: fn_painel_rateio_detalhe(uuid, uuid, text, text, text, text, text, text, text)
--   md5(prosrc) = 83bdfd55cd9fe15ee8eda29e82f427c2 (o da 20261027193700).
--
-- REGRA NOVA (substitui "parte protegida + residuo na maior das outras"):
--   · em `resumo.partes`, em `agricultura_por_safra` e em cada linha de `por_mes`, cada valor = round(cru, 2) DA PROPRIA PARCELA;
--     nenhum residuo e' redistribuido;
--   · `soma` = a soma das parcelas JA' ARREDONDADAS; `arredondamento` (chave nova, no resumo, em cada mes e no total) =
--     round(bruto, 2) - soma; `diferenca` continua = bruto - soma das parcelas do CRU, arredondada (a prova: e' ela que e' 0);
--   · `por_mes_total` = round do TOTAL CRU de cada coluna (nao a soma das linhas arredondadas), e `resumo` = `por_mes_total`;
--   · `agricultura_por_safra` ganha `pct` em cada linha ("outras safras" inclusive); os `pct` saem do cru, 1 casa.
-- NAO MUDA: as chaves de antes da 193700 (156 saidas, 7 clientes, identicas no ensaio), assinatura, retorno, SECURITY DEFINER,
--   search_path e ACL.
-- ⚠ O QUE ESTA REGRA NAO FECHA (divida DRE-RATEIO-TOTAL-CENTAVO-01, proximo PR de banco): `total.rateio_adm` de
--   `fn_dre_pecuaria` (o numero da grade) e' a soma das celulas grupo x fazenda ja' arredondadas e fica 0,01 fora de round(pool)
--   em NJ 2020, NJ 2023, NJ jul/25-jun/26 e Vera 2024. A parte da pecuaria deste resumo = round(`rateio_adm.pool`, 2).
-- PATCH GUARDADO POR md5 (origem, UMA ancora exatamente 1x — o bloco inteiro do resumo, que so' existe uma vez —, destino).

DO $mig$
DECLARE
  v_oid oid := 'public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text, text, text, text, text)'::regprocedure;
  v_src text; v_novo text; v_a text; v_b text; v_acl text; v_def boolean; v_cfg text;
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '83bdfd55cd9fe15ee8eda29e82f427c2' THEN
    RAISE EXCEPTION 'DRE-RATEIO-MODAL-01-fix1: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;

  v_a := $a1$      -- DRE-RATEIO-MODAL-01: o RESUMO e o MES A MES do administrativo, da MESMA leitura (`ram`). Valores a 2 casas; a parte da
      -- atividade pedida (na lavoura com safra, a da SAFRA) e' PROTEGIDA: arredondamento acumulado mes a mes, para a coluna somar
      -- round(pool, 2) — o numero do DRE. O residuo do arredondamento de cada mes vai para a MAIOR das outras partes do mes; a
      -- `diferenca` e' do CRU (bruto - soma das partes), nunca "feita bater". O resumo e' a soma das colunas do mes a mes.
      (with cal as (select to_char(g,'YYYY-MM') am from generate_series(date_trunc('month', v_ini)::date, v_fim, interval '1 month') g),
            m0 as (select ano_mes am, sum(valor) b, sum(valor*peso_pecuaria) p, sum(valor*peso_agricultura_mes) a,
                          sum(valor*peso_agricultura) af, sum(valor*peso_silvicultura) s, sum(valor*peso_nao_alocado) n
                     from ram group by 1),
            m as (select c.am, coalesce(m0.b,0) b, coalesce(m0.p,0) p, coalesce(m0.a,0) a, coalesce(m0.af,0) af,
                         coalesce(m0.s,0) s, coalesce(m0.n,0) n
                    from cal c left join m0 on m0.am = c.am),
            u as (select m.am, m.b, k.k, k.ord, k.cru, k.prot
                    from m cross join lateral (values
                      ('pecuaria'::text, 1, m.p, coalesce(p_atividade='pecuaria', false)),
                      ('agri_safra', 2, case when v_abre then m.af else 0 end, v_abre),
                      ('agri_outras', 3, case when v_abre then m.a - m.af else m.a end, coalesce(p_atividade='agricultura', false) and not v_abre),
                      ('silvicultura', 4, m.s, coalesce(p_atividade='silvicultura', false)),
                      ('nao_alocado', 5, m.n, false)) k(k, ord, cru, prot)),
            u2 as (select u.*, sum(u.cru) over (partition by u.k order by u.am) ccru, sum(u.b) over (partition by u.k order by u.am) cb from u),
            u3 as (select u2.*, round(u2.cb,2) - round(u2.cb - u2.b,2) rb,
                          case when u2.prot then round(u2.ccru,2) - round(u2.ccru - u2.cru,2) else round(u2.cru,2) end v0
                     from u2),
            u4 as (select u3.*, round(u3.b - sum(u3.cru) over (partition by u3.am), 2) dif,
                          row_number() over (partition by u3.am
                            order by (case when not u3.prot and u3.cru <> 0 then 0 when u3.prot then 1 else 2 end), abs(u3.cru) desc, u3.ord) rn,
                          sum(u3.v0) over (partition by u3.am) sv0
                     from u3),
            u5 as (select u4.am, u4.k, u4.rb, u4.dif, u4.cru, u4.v0 + case when u4.rn = 1 then u4.rb - u4.dif - u4.sv0 else 0 end v from u4),
            pm as (select u5.am, max(u5.rb) bruto, max(u5.dif) diferenca,
                          sum(u5.v) filter (where u5.k='pecuaria') pecuaria,
                          sum(u5.v) filter (where u5.k in ('agri_safra','agri_outras')) agricultura,
                          sum(u5.v) filter (where u5.k='agri_safra') agricultura_safra,
                          sum(u5.v) filter (where u5.k='agri_outras') agricultura_outras,
                          sum(u5.v) filter (where u5.k='silvicultura') silvicultura,
                          sum(u5.v) filter (where u5.k='nao_alocado') nao_alocado
                     from u5 group by u5.am),
            tt as (select coalesce(sum(pm.bruto),0) bruto, coalesce(sum(pm.pecuaria),0) pecuaria, coalesce(sum(pm.agricultura),0) agricultura,
                          coalesce(sum(pm.agricultura_safra),0) agricultura_safra, coalesce(sum(pm.agricultura_outras),0) agricultura_outras,
                          coalesce(sum(pm.silvicultura),0) silvicultura, coalesce(sum(pm.nao_alocado),0) nao_alocado,
                          coalesce(sum(pm.diferenca),0) dif_meses,
                          round(coalesce((select sum(m.b) - sum(m.p + m.a + m.s + m.n) from m),0), 2) diferenca
                     from pm)
       select jsonb_build_object(
         'resumo', (select jsonb_build_object('bruto', tt.bruto,
              'partes', jsonb_build_array(
                 jsonb_build_object('destino','pecuaria','valor',tt.pecuaria,'pct',round(100*tt.pecuaria/nullif(tt.bruto,0),1)),
                 jsonb_build_object('destino','agricultura','valor',tt.agricultura,'pct',round(100*tt.agricultura/nullif(tt.bruto,0),1)),
                 jsonb_build_object('destino','silvicultura','valor',tt.silvicultura,'pct',round(100*tt.silvicultura/nullif(tt.bruto,0),1)),
                 jsonb_build_object('destino','nao_alocado','valor',tt.nao_alocado,'pct',round(100*tt.nao_alocado/nullif(tt.bruto,0),1))),
              'soma', tt.pecuaria + tt.agricultura + tt.silvicultura + tt.nao_alocado,
              'diferenca', tt.diferenca,
              'agricultura_por_safra', case when v_abre then
                 jsonb_build_array(jsonb_build_object('safra_id', p_safra_id,
                     'safra', (select fs.nome from financeiro_safras fs where fs.id = p_safra_id), 'valor', tt.agricultura_safra))
                 || case when tt.agricultura_outras <> 0 then jsonb_build_array(jsonb_build_object('safra_id', null, 'safra', 'outras safras', 'valor', tt.agricultura_outras)) else '[]'::jsonb end
                 end) from tt),
         'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('ano_mes', pm.am, 'bruto', pm.bruto, 'pecuaria', pm.pecuaria,
              'agricultura', pm.agricultura, 'silvicultura', pm.silvicultura, 'nao_alocado', pm.nao_alocado,
              'pct_pecuaria', round(100*pm.pecuaria/nullif(pm.bruto,0),1), 'pct_agricultura', round(100*pm.agricultura/nullif(pm.bruto,0),1),
              'diferenca', pm.diferenca)
              || case when v_abre then jsonb_build_object('agricultura_safra', pm.agricultura_safra) else '{}'::jsonb end
              order by pm.am), '[]'::jsonb) from pm),
         'por_mes_total', (select jsonb_build_object('bruto', tt.bruto, 'pecuaria', tt.pecuaria, 'agricultura', tt.agricultura,
              'silvicultura', tt.silvicultura, 'nao_alocado', tt.nao_alocado,
              'pct_pecuaria', round(100*tt.pecuaria/nullif(tt.bruto,0),1), 'pct_agricultura', round(100*tt.agricultura/nullif(tt.bruto,0),1),
              'diferenca', tt.dif_meses)
              || case when v_abre then jsonb_build_object('agricultura_safra', tt.agricultura_safra) else '{}'::jsonb end from tt)))$a1$;
  v_b := $b1$      -- DRE-RATEIO-MODAL-01 (fix1): o RESUMO e o MES A MES do administrativo, da MESMA leitura (`ram`). CADA PARCELA E' O
      -- ARREDONDAMENTO DELA: round(cru, 2), no mes e no total — nenhum residuo e' redistribuido, e o numero de uma atividade e' o
      -- mesmo em qualquer porta (pecuaria, agricultura, safra). O total de cada coluna e' o round do TOTAL CRU, nao a soma das
      -- linhas arredondadas. `soma` = as parcelas ja' arredondadas; `arredondamento` = round(bruto, 2) - soma (o centavo que sobra,
      -- A' VISTA); `diferenca` = bruto - soma das parcelas do CRU, arredondada (a prova da conta: e' ela que tem de ser 0).
      (with cal as (select to_char(g,'YYYY-MM') am from generate_series(date_trunc('month', v_ini)::date, v_fim, interval '1 month') g),
            m0 as (select ano_mes am, sum(valor) b, sum(valor*peso_pecuaria) p, sum(valor*peso_agricultura_mes) a,
                          sum(valor*peso_agricultura) af, sum(valor*peso_silvicultura) s, sum(valor*peso_nao_alocado) n
                     from ram group by 1),
            m as (select c.am, coalesce(m0.b,0) b, coalesce(m0.p,0) p, coalesce(m0.a,0) a, coalesce(m0.af,0) af,
                         coalesce(m0.s,0) s, coalesce(m0.n,0) n
                    from cal c left join m0 on m0.am = c.am),
            c as (select m.am, m.b, m.p, m.a, m.af, m.s, m.n from m
                  union all
                  select null, coalesce(sum(m.b),0), coalesce(sum(m.p),0), coalesce(sum(m.a),0), coalesce(sum(m.af),0),
                         coalesce(sum(m.s),0), coalesce(sum(m.n),0) from m),
            r as (select c.am, round(c.b,2) bruto, round(c.p,2) pecuaria, round(c.a,2) agricultura,
                         round(c.af,2) agricultura_safra, round(c.a - c.af,2) agricultura_outras,
                         round(c.s,2) silvicultura, round(c.n,2) nao_alocado,
                         round(c.b - (c.p + c.a + c.s + c.n), 2) diferenca,
                         round(100*c.p/nullif(c.b,0),1) pct_pecuaria, round(100*c.a/nullif(c.b,0),1) pct_agricultura,
                         round(100*c.s/nullif(c.b,0),1) pct_silvicultura, round(100*c.n/nullif(c.b,0),1) pct_nao_alocado,
                         round(100*c.af/nullif(c.b,0),1) pct_safra, round(100*(c.a - c.af)/nullif(c.b,0),1) pct_outras
                    from c),
            x as (select r.*, r.pecuaria + r.agricultura + r.silvicultura + r.nao_alocado soma,
                         r.bruto - (r.pecuaria + r.agricultura + r.silvicultura + r.nao_alocado) arredondamento
                    from r)
       select jsonb_build_object(
         'resumo', (select jsonb_build_object('bruto', x.bruto,
              'partes', jsonb_build_array(
                 jsonb_build_object('destino','pecuaria','valor',x.pecuaria,'pct',x.pct_pecuaria),
                 jsonb_build_object('destino','agricultura','valor',x.agricultura,'pct',x.pct_agricultura),
                 jsonb_build_object('destino','silvicultura','valor',x.silvicultura,'pct',x.pct_silvicultura),
                 jsonb_build_object('destino','nao_alocado','valor',x.nao_alocado,'pct',x.pct_nao_alocado)),
              'soma', x.soma,
              'arredondamento', x.arredondamento,
              'diferenca', x.diferenca,
              'agricultura_por_safra', case when v_abre then
                 jsonb_build_array(jsonb_build_object('safra_id', p_safra_id,
                     'safra', (select fs.nome from financeiro_safras fs where fs.id = p_safra_id), 'valor', x.agricultura_safra, 'pct', x.pct_safra))
                 || case when x.agricultura_outras <> 0 then jsonb_build_array(jsonb_build_object('safra_id', null, 'safra', 'outras safras', 'valor', x.agricultura_outras, 'pct', x.pct_outras)) else '[]'::jsonb end
                 end) from x where x.am is null),
         'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('ano_mes', x.am, 'bruto', x.bruto, 'pecuaria', x.pecuaria,
              'agricultura', x.agricultura, 'silvicultura', x.silvicultura, 'nao_alocado', x.nao_alocado,
              'pct_pecuaria', x.pct_pecuaria, 'pct_agricultura', x.pct_agricultura,
              'arredondamento', x.arredondamento, 'diferenca', x.diferenca)
              || case when v_abre then jsonb_build_object('agricultura_safra', x.agricultura_safra) else '{}'::jsonb end
              order by x.am), '[]'::jsonb) from x where x.am is not null),
         'por_mes_total', (select jsonb_build_object('bruto', x.bruto, 'pecuaria', x.pecuaria, 'agricultura', x.agricultura,
              'silvicultura', x.silvicultura, 'nao_alocado', x.nao_alocado,
              'pct_pecuaria', x.pct_pecuaria, 'pct_agricultura', x.pct_agricultura,
              'arredondamento', x.arredondamento, 'diferenca', x.diferenca)
              || case when v_abre then jsonb_build_object('agricultura_safra', x.agricultura_safra) else '{}'::jsonb end from x where x.am is null)))$b1$;
  IF (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'DRE-RATEIO-MODAL-01-fix1: a ancora nao casa exatamente 1x'; END IF;
  v_novo := replace(v_src, v_a, v_b);

  IF md5(v_novo) <> '983ac728a260ea02c168731f1c497dd3' THEN
    RAISE EXCEPTION 'DRE-RATEIO-MODAL-01-fix1: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;
  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.fn_painel_rateio_detalhe(p_cliente uuid, p_safra_id uuid, p_cultura text, p_tipo text, p_chave text, p_atividade text DEFAULT 'agricultura'::text, p_de text DEFAULT NULL::text, p_ate text DEFAULT NULL::text, p_cenario text DEFAULT 'realizado'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS %L$f$, v_novo);
  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> '983ac728a260ea02c168731f1c497dd3' THEN
    RAISE EXCEPTION 'DRE-RATEIO-MODAL-01-fix1: ACL, SECURITY DEFINER, search_path ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;
