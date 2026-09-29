-- DRE-META-PATRIMONIO-01 — Variacao por producao e Efeito de mercado no cenario META, com o P0 REAL.
--
-- CASO: Raul Juliato, DRE pecuaria, Safra 25/26, coluna Meta — "Variacao por producao" e "Efeito de mercado" em "—".
-- fn_dre_pecuaria(raul,'2025-07','2026-06','meta') devolvia patrimonio {v_ini_p0: 0, cab_ini: 0, cab_fim: 0, v_fim_p0: null,
-- v_fim_p1: 3466271.5}: o P0 da meta era lido de valor_rebanho_meta_validada em v_p0 (2025-06), que so' existe de 2026-01 a
-- 2026-12; o real validado de 2025-06 existe (3.295.828,72).
--
-- REGRA (Gabriel, 29/09/2026 — decorre da regra unica P0/P1 de 23/09):
--   P0 da meta = P0 REAL (valor_rebanho_realizado_validado do mes anterior ao inicio); sem ele, zero.
--   P1 da meta = valor_rebanho_meta_validada em p_ate (como ja' era).
--   v_fim_p0 = itens da meta em p_ate (cabecas x peso por categoria) x preco_kg do fechamento P0 real (sem preco P0 da
--     categoria, o da propria meta — a mesma conta do realizado).
--   producao = v_fim_p0 - v_ini_p0; mercado = v_fim_p1 - v_fim_p0 (antes: meta usava a "variacao total" e anulava o mercado).
--   cab_ini = cabecas do fechamento P0 real; cab_fim = cabecas da meta em p_ate.
--   criterio 'producao + mercado (P0 real)' substitui 'variacao total (PC-100)'. Fazenda COM GADO (P0 real > 0 ou meta
--     validada em algum mes do periodo) sem meta validada em p_ate: sem_p1 = true e motivo_p1 'meta AAAA não validada' (na
--     fazenda e no total), producao e mercado nulos — nunca null silencioso. Fazenda SEM GADO (ex.: Administrativo, que entra
--     no DRE pelo custo fixo): P1 = 0 e fonte 'zero', sem sem_p1 — como o realizado pela regra unica (Gabriel, 29/09/2026:
--     sem isso a NJ meta 25/26 ficava com o total em "—" por causa da Administrativo).
--
-- O QUE NAO MUDA: o cenario realizado (JSON identico, provado em rollback para Raul e NJ 25/26 — as trocas no realizado sao
-- expressoes de mesmo valor); as demais linhas do DRE meta (vendas, custos, rateio; a cascata da meta segue com coalesce do VPB);
-- fn_dre_pecuaria_patrimonio (o modal) — fica para o DRE-META-PATRIMONIO-02, com p_cenario e front.
--
-- METODO: patch guardado por md5 do prosrc (guarda de origem, 11 ancoras exatamente 1x cada, guarda de destino calculada NO BANCO
-- com a mesma cadeia de replace). Conceito contado: o criterio 'variacao total (PC-100)' aparece 2x (fazenda e total) e os dois
-- sao trocados; `p_cenario='realizado'` aparece em muitas linhas e so' as do patrimonio sao tocadas.
--   fn_dre_pecuaria  md5 prosrc ANTES 6ec910d872a62b767fc66b9929e0bc82 (functiondef 26b24bd5)  DEPOIS 4d9be6b0dd17407b18a4440392c0f608
-- ACL refeita igual a' medida: {postgres, service_role, authenticated}; SECURITY DEFINER, STABLE, search_path pg_catalog, public.
--

do $mig$
declare v_antes text; v_novo text; v_depois text;
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_pecuaria' and n.nspname = 'public';
  if md5(v_antes) <> '6ec910d872a62b767fc66b9929e0bc82' then
    raise exception 'fn_dre_pecuaria nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes); end if;
  if (length(v_antes) - length(replace(v_antes, $a$  patm as (
    select f.id fazenda_id,
      round((case when extract(month from v_ini)=1
        then (select sum(r.valor_total) from valor_rebanho_realizado_validado r
              where r.cliente_id=p_cliente and r.fazenda_id=f.id and r.ano_mes=v_p0 and r.status='validado')
        else (select sum(m.valor_total) from valor_rebanho_meta_validada m
              where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=v_p0) end)::numeric, 2) v_ini,
      round((select sum(m.valor_total) from valor_rebanho_meta_validada m
             where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=p_ate)::numeric, 2) v_fim
    from faz f where p_cenario<>'realizado'
  ),
$a$, ''))) / length($a$  patm as (
    select f.id fazenda_id,
      round((case when extract(month from v_ini)=1
        then (select sum(r.valor_total) from valor_rebanho_realizado_validado r
              where r.cliente_id=p_cliente and r.fazenda_id=f.id and r.ano_mes=v_p0 and r.status='validado')
        else (select sum(m.valor_total) from valor_rebanho_meta_validada m
              where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=v_p0) end)::numeric, 2) v_ini,
      round((select sum(m.valor_total) from valor_rebanho_meta_validada m
             where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=p_ate)::numeric, 2) v_fim
    from faz f where p_cenario<>'realizado'
  ),
$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 1 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      case when p_cenario='realizado' then coalesce(pt.v_fim_p0,0) end v_fim_p0,
$a$, ''))) / length($a$      case when p_cenario='realizado' then coalesce(pt.v_fim_p0,0) end v_fim_p0,
$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 2 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      coalesce(pt.cab_ini,0) cab_ini, coalesce(pt.cab_fim,0) cab_fim, coalesce(cm.cab_media,0) cab_media,
$a$, ''))) / length($a$      coalesce(pt.cab_ini,0) cab_ini, coalesce(pt.cab_fim,0) cab_fim, coalesce(cm.cab_media,0) cab_media,
$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 3 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      case when p_cenario='realizado' then true else pm.v_ini is not null end tem_p0,
$a$, ''))) / length($a$      case when p_cenario='realizado' then true else pm.v_ini is not null end tem_p0,
$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 4 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      case when p_cenario='realizado' then coalesce(pt.p0_fonte,'zero') when pm.v_ini is not null then 'fechamento'::text end p0_fonte,
$a$, ''))) / length($a$      case when p_cenario='realizado' then coalesce(pt.p0_fonte,'zero') when pm.v_ini is not null then 'fechamento'::text end p0_fonte,
$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 5 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$        (case when p_cenario='realizado' then b.v_fim_p0 - b.v_ini_p0 else b.v_fim_p1 - b.v_ini_p0 end) else null end vpb_operacional,
$a$, ''))) / length($a$        (case when p_cenario='realizado' then b.v_fim_p0 - b.v_ini_p0 else b.v_fim_p1 - b.v_ini_p0 end) else null end vpb_operacional,
$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 6 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      case when b.tem_p0 and b.tem_p1 and p_cenario='realizado' then b.v_fim_p1 - b.v_fim_p0 else null end efeito_mercado
$a$, ''))) / length($a$      case when b.tem_p0 and b.tem_p1 and p_cenario='realizado' then b.v_fim_p1 - b.v_fim_p0 else null end efeito_mercado
$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 7 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      case when p_cenario='realizado' then true else pm.v_fim is not null end tem_p1,
$a$, ''))) / length($a$      case when p_cenario='realizado' then true else pm.v_fim is not null end tem_p1,
$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 8 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$      case when p_cenario='realizado' then coalesce(pt.p1_fonte,'zero') when pm.v_fim is not null then 'fechamento'::text end p1_fonte,
$a$, ''))) / length($a$      case when p_cenario='realizado' then coalesce(pt.p1_fonte,'zero') when pm.v_fim is not null then 'fechamento'::text end p1_fonte,
$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 9 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$'cab_ini',cab_ini,'cab_fim',cab_fim,'cab_media',cab_media)
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,$a$, ''))) / length($a$'cab_ini',cab_ini,'cab_fim',cab_fim,'cab_media',cab_media)
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 10 nao casa exatamente 1x. Migration abortada.'; end if;
  if (length(v_antes) - length(replace(v_antes, $a$'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim),'cab_media',sum(cab_media))
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,$a$, ''))) / length($a$'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim),'cab_media',sum(cab_media))
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,$a$) <> 1 then
    raise exception 'fn_dre_pecuaria: a ancora 11 nao casa exatamente 1x. Migration abortada.'; end if;
  v_novo := replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(v_antes, $a$  patm as (
    select f.id fazenda_id,
      round((case when extract(month from v_ini)=1
        then (select sum(r.valor_total) from valor_rebanho_realizado_validado r
              where r.cliente_id=p_cliente and r.fazenda_id=f.id and r.ano_mes=v_p0 and r.status='validado')
        else (select sum(m.valor_total) from valor_rebanho_meta_validada m
              where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=v_p0) end)::numeric, 2) v_ini,
      round((select sum(m.valor_total) from valor_rebanho_meta_validada m
             where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=p_ate)::numeric, 2) v_fim
    from faz f where p_cenario<>'realizado'
  ),
$a$, $a$  /* DRE-META-PATRIMONIO-01 (Gabriel, 29/09/2026): a meta parte do rebanho que EXISTIA. P0 = P0 REAL (valor validado do
     fechamento do mes anterior ao inicio; sem ele, zero — regra unica P0/P1). P1 = meta validada em p_ate. v_fim_p0 = rebanho
     da meta em p_ate (itens: cabecas x peso) ao preco/kg do fechamento P0 real — a mesma conta do realizado (sem preco P0 da
     categoria, o da propria meta). Criterio 'producao + mercado (P0 real)'; aposenta a 'variacao total (PC-100)'. */
  pk_p0m as (select fazenda_id, categoria, max(preco_kg) pk from valor_rebanho_fechamento_itens
             where cliente_id=p_cliente and ano_mes=v_p0 and p_cenario<>'realizado' group by 1,2),
  metai as (select mt.fazenda_id, mi.categoria, mi.quantidade q, mi.peso_medio_kg pm, mi.preco_kg pk
            from valor_rebanho_meta mt join valor_rebanho_meta_itens mi on mi.meta_id=mt.id
            where mt.cliente_id=p_cliente and mt.ano_mes=p_ate and mt.status='validado' and p_cenario<>'realizado'),
  patm as (
    select f.id fazenda_id,
      round(coalesce((select sum(r.valor_total) from valor_rebanho_realizado_validado r
              where r.cliente_id=p_cliente and r.fazenda_id=f.id and r.ano_mes=v_p0 and r.status='validado'), 0)::numeric, 2) v_ini,
      round((select sum(m.valor_total) from valor_rebanho_meta_validada m
             where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=p_ate)::numeric, 2) v_fim,
      (select round(sum(i.q*i.pm*coalesce(k.pk, i.pk)), 2) from metai i
         left join pk_p0m k on k.fazenda_id=i.fazenda_id and k.categoria=i.categoria where i.fazenda_id=f.id) v_fim_p0,
      coalesce((select sum(fi.quantidade) from valor_rebanho_fechamento_itens fi
                 where fi.cliente_id=p_cliente and fi.fazenda_id=f.id and fi.ano_mes=v_p0), 0) cab_ini,
      coalesce((select sum(i.q) from metai i where i.fazenda_id=f.id), 0) cab_fim,
      exists (select 1 from valor_rebanho_realizado_validado r
               where r.cliente_id=p_cliente and r.fazenda_id=f.id and r.ano_mes=v_p0 and r.status='validado') tem_fech_p0,
      -- fazenda COM GADO: P0 real > 0 ou meta validada em algum mes do periodo. So' ela pode ficar sem P1 (sem_p1); a sem gado
      -- (ex.: Administrativo, que entra no DRE pelo custo) tem P1 = 0, como no realizado pela regra unica.
      (exists (select 1 from valor_rebanho_realizado_validado r
                where r.cliente_id=p_cliente and r.fazenda_id=f.id and r.ano_mes=v_p0 and r.status='validado' and r.valor_total > 0)
       or exists (select 1 from valor_rebanho_meta_validada m
                   where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes between p_de and p_ate)) tem_gado
    from faz f where p_cenario<>'realizado'
  ),
$a$), $a$      case when p_cenario='realizado' then coalesce(pt.v_fim_p0,0) end v_fim_p0,
$a$, $a$      case when p_cenario='realizado' then coalesce(pt.v_fim_p0,0) when pm.tem_gado then pm.v_fim_p0 else 0 end v_fim_p0,
$a$), $a$      coalesce(pt.cab_ini,0) cab_ini, coalesce(pt.cab_fim,0) cab_fim, coalesce(cm.cab_media,0) cab_media,
$a$, $a$      case when p_cenario='realizado' then coalesce(pt.cab_ini,0) else coalesce(pm.cab_ini,0) end cab_ini,
      case when p_cenario='realizado' then coalesce(pt.cab_fim,0) else coalesce(pm.cab_fim,0) end cab_fim, coalesce(cm.cab_media,0) cab_media,
$a$), $a$      case when p_cenario='realizado' then true else pm.v_ini is not null end tem_p0,
$a$, $a$      true tem_p0,  -- DRE-META-PATRIMONIO-01: o P0 real sempre existe (sem fechamento validado, zero pela regra unica)
$a$), $a$      case when p_cenario='realizado' then coalesce(pt.p0_fonte,'zero') when pm.v_ini is not null then 'fechamento'::text end p0_fonte,
$a$, $a$      case when p_cenario='realizado' then coalesce(pt.p0_fonte,'zero') when pm.tem_fech_p0 then 'fechamento'::text else 'zero'::text end p0_fonte,
$a$), $a$        (case when p_cenario='realizado' then b.v_fim_p0 - b.v_ini_p0 else b.v_fim_p1 - b.v_ini_p0 end) else null end vpb_operacional,
$a$, $a$        (b.v_fim_p0 - b.v_ini_p0) else null end vpb_operacional,  -- DRE-META-PATRIMONIO-01: producao nos dois cenarios
$a$), $a$      case when b.tem_p0 and b.tem_p1 and p_cenario='realizado' then b.v_fim_p1 - b.v_fim_p0 else null end efeito_mercado
$a$, $a$      case when b.tem_p0 and b.tem_p1 then b.v_fim_p1 - b.v_fim_p0 else null end efeito_mercado
$a$), $a$      case when p_cenario='realizado' then true else pm.v_fim is not null end tem_p1,
$a$, $a$      case when p_cenario='realizado' then true else (pm.v_fim is not null or not pm.tem_gado) end tem_p1,
$a$), $a$      case when p_cenario='realizado' then coalesce(pt.p1_fonte,'zero') when pm.v_fim is not null then 'fechamento'::text end p1_fonte,
$a$, $a$      case when p_cenario='realizado' then coalesce(pt.p1_fonte,'zero') when pm.v_fim is not null then 'fechamento'::text
           when not pm.tem_gado then 'zero'::text end p1_fonte,
$a$), $a$'cab_ini',cab_ini,'cab_fim',cab_fim,'cab_media',cab_media)
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,$a$, $a$'cab_ini',cab_ini,'cab_fim',cab_fim,'cab_media',cab_media)
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','producao + mercado (P0 real)','sem_p1',not tem_p1,
             'motivo_p1',case when not tem_p1 then 'meta '||left(p_ate,4)||' não validada' end) else '{}'::jsonb end,$a$), $a$'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim),'cab_media',sum(cab_media))
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,$a$, $a$'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim),'cab_media',sum(cab_media))
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','producao + mercado (P0 real)','sem_p1',bool_or(not tem_p1),
             'motivo_p1',case when bool_or(not tem_p1) then 'meta '||left(p_ate,4)||' não validada' end) else '{}'::jsonb end,$a$);
  execute 'CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text DEFAULT ''realizado''::text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_pecuaria' and n.nspname = 'public';
  if md5(v_depois) <> '4d9be6b0dd17407b18a4440392c0f608' then
    raise exception 'fn_dre_pecuaria: corpo resultante inesperado (md5 %). Esperado 4d9be6b0dd17407b18a4440392c0f608.', md5(v_depois); end if;
end $mig$;
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text) TO authenticated, service_role;
