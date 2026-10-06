-- DRE-RATEIO-MODAL-01 — a aba Rateio do modal de valor mostra o TOTAL do administrativo, para onde foi, e a prova (Gabriel, 06/10/2026).
--
-- POR QUE
--   "Toda vez que eu vejo um rateio, eu abro aquele modalzinho e ele tem que me mostrar claramente qual e' o total, o que esta'
--   rateando para pecuaria ou agricultura […] tem que ter um encontro de contas ali que prova que esta' sendo feito corretamente."
--   `fn_painel_rateio_detalhe` (ramo 'admin') devolvia a parte de cada atividade arredondada sozinha (`fatias_atividade`), sem o
--   bruto, sem o mes a mes e sem a conta fechada: a soma das fatias podia diferir do total em centavos, e a tela nao tinha de onde
--   ler a prova.
--
-- ESTADO ANTERIOR (medido em 06/10/2026)
--   fn_painel_rateio_detalhe(uuid, uuid, text, text, text, text, text, text, text)  md5(prosrc) = 7472a39323ab4528aac56c04727824ef
--     plpgsql, SECURITY DEFINER, search_path = pg_catalog, public, ACL {postgres, service_role, authenticated}.
--
-- O QUE MUDA (ADITIVO: tres chaves NO FIM do retorno; nenhuma chave de antes muda — provado em 156 saidas, 7 clientes)
--   `resumo`        { bruto, partes [ {destino: pecuaria|agricultura|silvicultura|nao_alocado, valor, pct} ], soma, diferenca,
--                     agricultura_por_safra [ {safra_id, safra, valor} ] (so' na lavoura com safra) }
--   `por_mes`       [ {ano_mes, bruto, pecuaria, agricultura, silvicultura, nao_alocado, pct_pecuaria, pct_agricultura, diferenca
--                     (+ agricultura_safra na lavoura com safra)} ] — um por mes do periodo, inclusive os sem lancamento.
--   `por_mes_total` a soma das colunas de `por_mes` (= `resumo`, por construcao).
--   Fora do ramo 'admin' as tres vem nulas.
--   REGRA DO ARREDONDAMENTO (2 casas):
--     · a parte da atividade PEDIDA (`p_atividade`; na lavoura com safra, a parte da SAFRA) e' PROTEGIDA: arredondamento
--       ACUMULADO mes a mes, de modo que a coluna soma round(pool, 2) — o numero que o DRE mostra;
--     · o residuo do arredondamento de cada mes vai para a MAIOR das OUTRAS partes daquele mes (so' cai na protegida quando ela
--       e' a unica parte do mes). ⚠ O briefing dizia "na maior parte"; se a maior for a da atividade aberta, a tela mostraria um
--       centavo a menos que o DRE (NJ 2025: 886.574,03 x 886.574,04) — por isso a protegida fica fora;
--     · `diferenca` = bruto − soma das partes calculada do CRU e arredondada: se o cru nao fecha, ela aparece (nunca "fazer bater");
--     · `resumo` = soma das colunas do mes a mes; `pct` sobre o bruto, 1 casa.
--   ⚠ `agricultura_por_safra` TEM DUAS LINHAS, NAO UMA POR SAFRA: a safra pedida e "outras safras" (o resto da agricultura). O
--     dono dos pesos (`fn_rateio_admin_mes`) so' abre a parte de UMA safra por chamada; abrir todas pediria uma chamada por safra
--     (ou copiar a regra de area para ca'). Uma leitura so', a que o ramo ja' fazia.
-- NAO MUDA: `fn_rateio_admin_mes`, `fn_dre_pecuaria`, `fn_dre_lavoura`, assinatura, retorno (jsonb), SECURITY DEFINER,
--   search_path e ACL (`CREATE OR REPLACE` as preserva; conferidas no fim).
-- PATCH GUARDADO POR md5 (origem, 3 ancoras exatamente 1x, destino) — a regra do CLAUDE.md para corpo grande. O CONCEITO foi
--   contado antes: o corpo tem UM `return jsonb_build_object` e UM `into … v_nao_aloc` (o ramo admin).

DO $mig$
DECLARE
  v_oid oid := 'public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text, text, text, text, text)'::regprocedure;
  v_src text; v_novo text; v_a text; v_b text; v_acl text; v_def boolean; v_cfg text;
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) <> '7472a39323ab4528aac56c04727824ef' THEN
    RAISE EXCEPTION 'DRE-RATEIO-MODAL-01: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;

  -- ancora 1
  v_a := $a1$v_grupos jsonb; v_nao_aloc jsonb;$a1$;
  v_b := $b1$v_grupos jsonb; v_nao_aloc jsonb; v_extra jsonb;
  v_abre boolean := coalesce(p_atividade='agricultura' and p_safra_id is not null, false);$b1$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'DRE-RATEIO-MODAL-01: ancora 1 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 2
  v_a := $a2$         from ram)
      into v_pool, v_bruto, v_lanc, v_grupos, v_fat_atv, v_nao_aloc;$a2$;
  v_b := $b2$         from ram),
      -- DRE-RATEIO-MODAL-01: o RESUMO e o MES A MES do administrativo, da MESMA leitura (`ram`). Valores a 2 casas; a parte da
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
              || case when v_abre then jsonb_build_object('agricultura_safra', tt.agricultura_safra) else '{}'::jsonb end from tt)))
      into v_pool, v_bruto, v_lanc, v_grupos, v_fat_atv, v_nao_aloc, v_extra;$b2$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'DRE-RATEIO-MODAL-01: ancora 2 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  -- ancora 3
  v_a := $a3$'nao_alocado',v_nao_aloc);$a3$;
  v_b := $b3$'nao_alocado',v_nao_aloc,'resumo',v_extra->'resumo','por_mes',v_extra->'por_mes','por_mes_total',v_extra->'por_mes_total');$b3$;
  IF (length(v_novo) - length(replace(v_novo, v_a, ''))) / length(v_a) <> 1 THEN RAISE EXCEPTION 'DRE-RATEIO-MODAL-01: ancora 3 nao casa exatamente 1x'; END IF;
  v_novo := replace(v_novo, v_a, v_b);

  IF md5(v_novo) <> '83bdfd55cd9fe15ee8eda29e82f427c2' THEN
    RAISE EXCEPTION 'DRE-RATEIO-MODAL-01: corpo de destino inesperado (md5 %)', md5(v_novo);
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
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) <> '83bdfd55cd9fe15ee8eda29e82f427c2' THEN
    RAISE EXCEPTION 'DRE-RATEIO-MODAL-01: ACL, SECURITY DEFINER, search_path ou corpo diferentes do esperado depois do replace';
  END IF;
END
$mig$;
