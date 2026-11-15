-- DRE-PRECO-REF-01 (decisão do Gabriel 11/11 08:45, sobre a FASE 0 de 07:05): o PREÇO DE REFERÊNCIA da ponta inicial passa a ser
--   fechamento de P0 → tabela do mês de P0 (valor_rebanho_mensal) → só se não houver nenhum dos dois, o preço de P1 (e isso vira
--   aviso na tela: `preco_ref_do_fim` = as categorias que caíram no preço do fim).
-- Antes a ordem era fechamento de P0 → P1: a categoria SEM estoque em P0 (ex.: desmama M da Pureza, 0 → 927 cab) era valorada ao
-- preço de set/26 (R$ 480/@) e não ao de dez/25 da tabela (R$ 420/@), e a alta de PREÇO entrava como produção (vpb) e como ágio.
-- Vale para:
--   (1) fn_dre_pecuaria_patrimonio: o `v1_p0` de cada categoria (cf) e o preço de referência do ágio (evr);
--   (2) fn_dre_pecuaria: o `v_fim_p0` do realizado (a "Variação por produção" do DRE) — a meta não muda.
-- O total (v1_p1 − v0) NÃO muda: o que sai da produção entra no efeito de mercado.
-- PATCH GUARDADO POR MD5 (corpo grande): confere o corpo de hoje, troca só as âncoras (cada uma tem de casar 1 vez) e recria a função
-- a partir do próprio texto do banco — nada redigitado. CREATE OR REPLACE mantém dono, SECURITY DEFINER e os GRANTs.
do $patch$
declare
  d text; n text;
begin
  ---------------------------------------------------------------- (1) fn_dre_pecuaria_patrimonio
  d := pg_get_functiondef('public.fn_dre_pecuaria_patrimonio(uuid,uuid,text,text)'::regprocedure);
  if md5(d) <> 'fd9f4e597f75d5c1d7aefb6597494b0f' then
    raise exception 'DRE-PRECO-REF-01: fn_dre_pecuaria_patrimonio mudou desde o ensaio (md5 %)', md5(d);
  end if;
  n := d;
  -- a tabela do mês de P0, por fazenda × categoria
  if (select count(*) from regexp_matches(n, 'kf as \(select fazenda_id, categoria from pf0 union select fazenda_id, categoria from pf1\),', 'g')) <> 1 then
    raise exception 'DRE-PRECO-REF-01: âncora kf não casa 1 vez'; end if;
  n := replace(n, 'kf as (select fazenda_id, categoria from pf0 union select fazenda_id, categoria from pf1),',
    'kf as (select fazenda_id, categoria from pf0 union select fazenda_id, categoria from pf1),' || E'\n'
    || '/* DRE-PRECO-REF-01: a tabela de preços do mês de P0 — o 2º degrau do preço de referência da ponta inicial */' || E'\n'
    || 'tabp0 as (select m.fazenda_id, m.categoria, max(m.preco_kg) pk from valor_rebanho_mensal m join per on true' || E'\n'
    || '          where m.cliente_id=p_cliente and m.ano_mes=per.p0 and m.preco_kg is not null and (p_fazenda is null or m.fazenda_id=p_fazenda)' || E'\n'
    || '          group by 1,2),');
  -- v1_p0: fechamento de P0 → tabela de P0 → P1 (e a marca de quem caiu no fim)
  if (select count(*) from regexp_matches(n, 'coalesce\(b\.q\*b\.pm,0\)\*coalesce\(a\.pk,b\.pk\) v1_p0,', 'g')) <> 1 then
    raise exception 'DRE-PRECO-REF-01: âncora v1_p0 não casa 1 vez'; end if;
  n := replace(n, 'coalesce(b.q*b.pm,0)*coalesce(a.pk,b.pk) v1_p0,',
    'coalesce(b.q*b.pm,0)*coalesce(a.pk,t.pk,b.pk) v1_p0,' || E'\n'
    || '         (a.pk is null and t.pk is null and b.pk is not null and coalesce(b.q,0)>0) pk0_do_fim,');
  if (select count(*) from regexp_matches(n, 'left join pf1 b on b\.fazenda_id=kf\.fazenda_id and b\.categoria=kf\.categoria\),', 'g')) <> 1 then
    raise exception 'DRE-PRECO-REF-01: âncora do join do cf não casa 1 vez'; end if;
  n := replace(n, 'left join pf1 b on b.fazenda_id=kf.fazenda_id and b.categoria=kf.categoria),',
    'left join pf1 b on b.fazenda_id=kf.fazenda_id and b.categoria=kf.categoria' || E'\n'
    || '               left join tabp0 t on t.fazenda_id=kf.fazenda_id and t.categoria=kf.categoria),');
  -- o ágio: o mesmo preço de referência, na mesma ordem
  if (select count(*) from regexp_matches(n, 'coalesce\(a\.pk, b\.pk,\n', 'g')) <> 1
     or (select count(*) from regexp_matches(n, 'm\.ano_mes=per\.p0\)\) pref', 'g')) <> 1 then
    raise exception 'DRE-PRECO-REF-01: âncoras do evr não casam 1 vez'; end if;
  n := replace(n, 'coalesce(a.pk, b.pk,' || E'\n', 'coalesce(a.pk,' || E'\n');
  n := replace(n, 'm.ano_mes=per.p0)) pref', 'm.ano_mes=per.p0), b.pk) pref');
  -- o aviso no total: as categorias que caíram no preço do fim
  if (select count(*) from regexp_matches(n, '''agio_sem_preco'',coalesce\(\(select bool_or\(agio is null and kg<>0\) from evp\),false\)\)', 'g')) <> 1 then
    raise exception 'DRE-PRECO-REF-01: âncora do total não casa 1 vez'; end if;
  n := replace(n, '''agio_sem_preco'',coalesce((select bool_or(agio is null and kg<>0) from evp),false))',
    '''agio_sem_preco'',coalesce((select bool_or(agio is null and kg<>0) from evp),false),'
    || '''preco_ref_do_fim'',coalesce((select jsonb_agg(distinct x.categoria) from cf x where x.pk0_do_fim),''[]''::jsonb))');
  execute n;

  ---------------------------------------------------------------- (2) fn_dre_pecuaria (realizado)
  d := pg_get_functiondef('public.fn_dre_pecuaria(uuid,text,text,text)'::regprocedure);
  if md5(d) <> '2b212d165afb78d936a43e739e9c3733' then
    raise exception 'DRE-PRECO-REF-01: fn_dre_pecuaria mudou desde o ensaio (md5 %)', md5(d);
  end if;
  n := d;
  if (select count(*) from regexp_matches(n, '\n  pat as \(\n', 'g')) <> 1 then
    raise exception 'DRE-PRECO-REF-01: âncora pat não casa 1 vez'; end if;
  n := replace(n, E'\n  pat as (\n',
    E'\n  /* DRE-PRECO-REF-01: a tabela de preços do mês de P0 — o 2º degrau do preço de referência (só o realizado) */'
    || E'\n  tabp0 as (select fazenda_id, categoria, max(preco_kg) pk from valor_rebanho_mensal'
    || E'\n            where cliente_id=p_cliente and ano_mes=v_p0 and preco_kg is not null and p_cenario=''realizado'' group by 1,2),'
    || E'\n  pat as (\n');
  if (select count(*) from regexp_matches(n, 'round\(sum\(coalesce\(p1\.q\*p1\.pm,0\)\*coalesce\(p0\.pk,p1\.pk\)\),2\) v_fim_p0,', 'g')) <> 1 then
    raise exception 'DRE-PRECO-REF-01: âncora v_fim_p0 não casa 1 vez'; end if;
  n := replace(n, 'round(sum(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,p1.pk)),2) v_fim_p0,',
    'round(sum(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,t0.pk,p1.pk)),2) v_fim_p0,');
  if (select count(*) from regexp_matches(n, '    left join p1 on p1\.fazenda_id=k\.fazenda_id and p1\.categoria=k\.categoria\n    group by 1\n  \),', 'g')) <> 1 then
    raise exception 'DRE-PRECO-REF-01: âncora do join do pat não casa 1 vez'; end if;
  n := replace(n, E'    left join p1 on p1.fazenda_id=k.fazenda_id and p1.categoria=k.categoria\n    group by 1\n  ),',
    E'    left join p1 on p1.fazenda_id=k.fazenda_id and p1.categoria=k.categoria\n'
    || E'    left join tabp0 t0 on t0.fazenda_id=k.fazenda_id and t0.categoria=k.categoria\n    group by 1\n  ),');
  execute n;
end
$patch$;
