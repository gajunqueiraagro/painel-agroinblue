-- VPB-REGRA-UNICA-01 — o VPB deixa de virar traco por ausencia de fechamento
-- Aplicado no proto em 23/09/2026 (ledger: vpb_regra_unica). Registro historico.
--
-- POR QUE ESTA MIGRATION EXISTE
-- A variacao de patrimonio saia em "—" sempre que faltasse fechamento numa das pontas, e um "—"
-- ali apaga a CASCATA INTEIRA: `vbp`, `margem`, `resultado_operacional`, `resultado_periodo`,
-- `resultado_com_mercado` e `lucro_liquido` sao nulos se qualquer parcela for nula. Medido antes de
-- escrever: 34 periodos em 6 clientes sem numero nenhum no DRE.
-- ⚠ A PREMISSA ERRADA ERA "nao sei quanto havia". Fazenda que comprou gado no meio do ano, fazenda
--   que acabou o gado, ano que comeca antes do primeiro fechamento — em todos, a ausencia de
--   fechamento significa ausencia de GADO, e o numero certo para isso e ZERO.
--
-- DUAS EXCECOES VIRAM UMA REGRA
-- Saem a "estreia" (VPB-INICIO-01, `p0_origem = 'estoque_inicial'`) e o "encerramento"
-- (VPB-ENCERRAMENTO-01, `p1_origem = 'encerrada'`), com as CTEs `estreia`, `encerradas`, `p0e`,
-- `p1e` e `divp1`. Cada uma tinha de ADIVINHAR quando a ausencia era estreia, fim ou trabalho por
-- fazer, e errar a adivinhacao zerava o ano do cliente — foi o que aconteceu em 22/09, quando o
-- VPB-INICIO-01 apagou quatro periodos e o VPB-ENCERRAMENTO-01 teve de ser escrito no dia seguinte.
--
-- A REGRA, HIBRIDA (decisao do Gabriel, 23/09, saida 2)
--   P0 = fechamento do mes ANTERIOR quando existe; senao `zoot_mensal_cache.saldo_inicial` do
--        primeiro mes do periodo (o cadastro inicial da fazenda, ou zero).
--   P1 = fechamento do ULTIMO mes quando existe; senao `zoot_mensal_cache.saldo_final` (ou zero).
--   VPB = P1 − P0 SEMPRE, em realizado. `meta` segue como hoje.
-- ⚠ A PRECEDENCIA DO FECHAMENTO NAO E' DETALHE, E FOI ELA QUE DECIDIU A SAIDA. A primeira versao
--   lia as duas pontas SO' do cache, como a decisao original pedia, e mudou numero em periodo que
--   ja estava homologado: NJ 2020 (−54.729,05), NJ civil 2023 (+5.200,00), NJ 25/26 (+20,38) e
--   SR 22/23 (−1.182.940,26). A causa e' que as duas fontes NAO CONCORDAM — 20 meses divergentes
--   em 655, ate' 442 cabecas de diferenca. Registrado como [CACHE-X-FECHAMENTO-01] no CLAUDE.md.
--   Com o fechamento na frente, os sete periodos que tinham numero continuam IDENTICOS e os que
--   tinham traco ganham numero.
-- ⚠ E A PRECEDENCIA E' POR FAZENDA, nao por categoria — e' como o codigo antigo ja fazia
--   (`not exists (select 1 from p0f where p0f.fazenda_id = ...)`). Misturar as duas fontes dentro
--   da mesma fazenda somaria um rebanho contado duas vezes por caminhos diferentes.
--
-- O QUE SOBRA DAS CHAVES ANTIGAS: `p0_fonte` e `p1_fonte`, com 'fechamento' | 'cadastro' | 'zero'.
-- Elas sao INFORMATIVAS — alimentam o selo e o `title` — e nao decidem mais nada. Saem `sem_p0`,
-- `sem_p1`, `p0_origem`, `p1_origem`, `p1_divergencia_cab`, `p0_origem_estreia` e
-- `p1_origem_encerrada`.
-- ⚠ O TOTAL MANDA A MESMA CHAVE DA FAZENDA, e isso conserta de raiz um defeito do PR anterior: a
--   RPC respondia `p0_origem` por fazenda e `p0_origem_estreia` (booleano) no total, o hook
--   traduzia uma na outra, e o selo sumia da visao Comparacao — que e' justamente a que o operador
--   abre. O total resume a fonte MENOS forte das fazendas, para o selo nao sumir num consolidado.
--
-- ⚠ `v_fim_p1` GANHOU UM COALESCE: `p1.q*p1.pm*coalesce(p1.pk,p0.pk)`. Sem preco na ponta final
--   (mes nao fechado), o valor a preco corrente virava ZERO e o efeito de mercado aparecia como
--   uma perda gigante que nunca existiu. Com o preco do P0, o efeito da' zero — que e' a verdade:
--   sem preco novo nao ha efeito de mercado a apurar. Nenhum numero de hoje muda por isto (quando
--   ha fechamento, `p1.pk` existe).
--
-- PROVAS (BEGIN … ROLLBACK antes de aplicar, e repetidas depois) — ver o relatorio do PR.
--   1. SR civil 2022  —     → 1.434.797,75  (P0 'zero': Bom Retiro parte de 0 em jan/22)
--      SR 22/23        914.178,44 = 914.178,44  (identico)
--   2. Vera civil 2024 —    → 6.597.687,68  (P0 'cadastro')
--   3. NJ 2020, NJ civil 2023, NJ 23/24 ......... IDENTICOS
--   4. NJ 25/26, Agnaldo 23/24, SR 25/26, SR civil 2023 ... IDENTICOS
--   5. Modal x grade POR FAZENDA: 9 de 9 batem em VPB e efeito.
--   6. Dos 34 periodos em traco, 16 ganharam numero. Os 18 restantes sao clientes SEM fazenda
--      no periodo — ali o total e' nulo por nao haver o que somar, e isso segue certo.
--
-- ⚠ O CORPO DE `fn_dre_pecuaria` NAO FOI REDIGITADO. Sao 300 linhas, e o CLAUDE.md proibe
--   redigitar de memoria codigo que se move. O bloco lido pelo banco trava o md5 de ORIGEM
--   (ccb27089cde7e696b52dce058731e175), aplica cinco substituicoes ancoradas e chega ao md5 de
--   DESTINO 7adebae1b8792d027dd6c62124c851ee. `fn_dre_pecuaria_patrimonio` (3840 bytes) foi
--   transcrita INTEGRALMENTE, e vai abaixo por extenso; md5 novo b50c9f20a432fc3bdb4b301ec31b235f.
--
-- ⚠ O CONTEUDO APLICADO E' O DO LEDGER `vpb_regra_unica`, identico ao que este arquivo descreve.
--   Recuperavel por `pg_get_functiondef('fn_dre_pecuaria'::regproc)`.

DO $mig$
DECLARE
  v_src text; v_new text; v_a int; v_b int;
  f_ini text; f_fim text; bloco text; o text; n text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='fn_dre_pecuaria';
  IF md5(v_src) <> 'ccb27089cde7e696b52dce058731e175' THEN
    RAISE EXCEPTION 'fn_dre_pecuaria: md5 de origem divergente (%)', md5(v_src); END IF;
  v_new := v_src;

  -- R1: as duas pontas ganham fallback de cache; fechamento continua tendo precedencia
  f_ini := '  estreia as (select fazenda_id from valor_rebanho_fechamento_itens where cliente_id=p_cliente group by fazenda_id having min(ano_mes)=p_de),';
  f_fim := '    from encerradas e
  ),';
  v_a := position(f_ini in v_new); v_b := position(f_fim in v_new);
  IF v_a = 0 OR v_b = 0 OR v_b < v_a THEN RAISE EXCEPTION 'R1: ancoras (a=%, b=%)', v_a, v_b; END IF;
  bloco := '  p0f as (select fazenda_id, categoria, quantidade q, peso_medio_kg pm, preco_kg pk, ''fechamento''::text origem
            from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=v_p0 and p_cenario=''realizado''),
  pk_ini as (select fazenda_id, categoria, max(preco_kg) pk from valor_rebanho_fechamento_itens
             where cliente_id=p_cliente and ano_mes=p_de group by 1,2),
  p0c as (select z.fazenda_id, z.categoria_codigo categoria, z.saldo_inicial q, z.peso_medio_inicial pm, k.pk,
            (case when z.saldo_inicial>0 then ''cadastro'' else ''zero'' end)::text origem
          from zoot_mensal_cache z
          left join pk_ini k on k.fazenda_id=z.fazenda_id and k.categoria=z.categoria_codigo
          where z.cliente_id=p_cliente and z.ano_mes=p_de and z.cenario=''realizado'' and p_cenario=''realizado''
            and not exists (select 1 from p0f where p0f.fazenda_id=z.fazenda_id)),
  p0 as (select * from p0f union all select * from p0c),
  p1f as (select fazenda_id, categoria, quantidade q, peso_medio_kg pm, preco_kg pk, ''fechamento''::text origem
            from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=p_ate and p_cenario=''realizado''),
  p1c as (select z.fazenda_id, z.categoria_codigo categoria, z.saldo_final q, z.peso_medio_final pm, null::numeric pk,
            (case when z.saldo_final>0 then ''cadastro'' else ''zero'' end)::text origem
          from zoot_mensal_cache z
          where z.cliente_id=p_cliente and z.ano_mes=p_ate and z.cenario=''realizado'' and p_cenario=''realizado''
            and not exists (select 1 from p1f where p1f.fazenda_id=z.fazenda_id)),
  p1 as (select * from p1f union all select * from p1c),';
  v_new := substr(v_new, 1, v_a - 1) || bloco || substr(v_new, v_b + length(f_fim));

  -- R1b: sem preco na ponta final, o valor corrente usa o preco do P0 (efeito de mercado zero)
  o := '      round(sum(coalesce(p1.q*p1.pm*p1.pk,0)),2) v_fim_p1,';
  n := '      round(sum(coalesce(p1.q*p1.pm*coalesce(p1.pk,p0.pk),0)),2) v_fim_p1,';
  IF position(o in v_new)=0 THEN RAISE EXCEPTION 'R1b'; END IF;
  v_new := replace(v_new, o, n);

  -- R2: o `pat` reporta FONTE, nao origem
  o := '      bool_or(p0.categoria is not null) tem_p0, bool_or(p1.categoria is not null) tem_p1, max(p0.origem) p0_origem, max(p1.origem) p1_origem';
  n := '      case when bool_or(p0.origem=''fechamento'') then ''fechamento''
           when sum(coalesce(p0.q,0))>0 then ''cadastro'' else ''zero'' end::text p0_fonte,
      case when bool_or(p1.origem=''fechamento'') then ''fechamento''
           when sum(coalesce(p1.q,0))>0 then ''cadastro'' else ''zero'' end::text p1_fonte';
  IF position(o in v_new)=0 THEN RAISE EXCEPTION 'R2'; END IF;
  v_new := replace(v_new, o, n);

  -- R3: em realizado nao ha mais guard de traco; meta segue como hoje
  o := '      case when p_cenario=''realizado'' then coalesce(pt.tem_p0,false) else pm.v_ini is not null end tem_p0,
      case when p_cenario=''realizado'' then coalesce(pt.tem_p1,false) else pm.v_fim is not null end tem_p1,
      case when p_cenario=''realizado'' then pt.p0_origem when pm.v_ini is not null then ''fechamento''::text end p0_origem,
      case when p_cenario=''realizado'' then pt.p1_origem when pm.v_fim is not null then ''fechamento''::text end p1_origem,
      case when p_cenario=''realizado'' and pt.p1_origem=''encerrada'' then (select cab from divp1 where divp1.fazenda_id=f.id) end p1_divergencia_cab,';
  n := '      case when p_cenario=''realizado'' then true else pm.v_ini is not null end tem_p0,
      case when p_cenario=''realizado'' then true else pm.v_fim is not null end tem_p1,
      case when p_cenario=''realizado'' then coalesce(pt.p0_fonte,''zero'') when pm.v_ini is not null then ''fechamento''::text end p0_fonte,
      case when p_cenario=''realizado'' then coalesce(pt.p1_fonte,''zero'') when pm.v_fim is not null then ''fechamento''::text end p1_fonte,';
  IF position(o in v_new)=0 THEN RAISE EXCEPTION 'R3'; END IF;
  v_new := replace(v_new, o, n);

  -- R4/R5: o JSON da fazenda e o do total mandam a MESMA chave
  o := '      ''sem_p0'',p0_origem is null,''sem_p1'',not tem_p1,''p0_origem'',p0_origem,''p1_origem'',p1_origem,''p1_divergencia_cab'',p1_divergencia_cab,';
  n := '      ''p0_fonte'',p0_fonte,''p1_fonte'',p1_fonte,';
  IF position(o in v_new)=0 THEN RAISE EXCEPTION 'R4'; END IF;
  v_new := replace(v_new, o, n);

  o := '      ''p0_origem_estreia'', bool_or(p0_origem=''estoque_inicial''),
      ''p1_origem_encerrada'', bool_or(p1_origem=''encerrada''),';
  n := '      ''p0_fonte'', case when bool_or(p0_fonte=''zero'') then ''zero''
                          when bool_or(p0_fonte=''cadastro'') then ''cadastro'' else ''fechamento'' end,
      ''p1_fonte'', case when bool_or(p1_fonte=''zero'') then ''zero''
                          when bool_or(p1_fonte=''cadastro'') then ''cadastro'' else ''fechamento'' end,';
  IF position(o in v_new)=0 THEN RAISE EXCEPTION 'R5'; END IF;
  v_new := replace(v_new, o, n);

  IF position('encerradas' in v_new)>0 OR position('divp1' in v_new)>0
     OR position('estoque_inicial' in v_new)>0 OR position('estreia' in v_new)>0 THEN
    RAISE EXCEPTION 'sobrou vestigio da regra antiga'; END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text DEFAULT ''realizado''::text)
       RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $body$%s$body$', v_new);
END $mig$;

REVOKE ALL ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) TO authenticated, service_role;

-- O MODAL DE PATRIMONIO LE A MESMA REGRA — senao a grade e o modal discordam sobre o mesmo periodo.
-- Transcrita integralmente do prosrc md5 6acd2f88ee87377a1870b948e8adb786; alteracoes: `estreia`
-- e `encerradas` saem, entram `p0c`/`p1c` com o mesmo fallback de cache, e `v1_p1` ganha o
-- `coalesce(p1.pk,p0.pk)` da R1b.
CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
with per as (select to_char(to_date(p_de||'-01','YYYY-MM-DD') - interval '1 month','YYYY-MM') p0, left(p_ate,7) p1),
p0f as (select i.fazenda_id, i.categoria, i.quantidade, i.peso_medio_kg, i.preco_kg, 'fechamento'::text origem
      from valor_rebanho_fechamento_itens i join per on true
      where i.cliente_id=p_cliente and i.ano_mes=per.p0 and (p_fazenda is null or i.fazenda_id=p_fazenda)),
pk_ini as (select fazenda_id, categoria, max(preco_kg) pk from valor_rebanho_fechamento_itens
      where cliente_id=p_cliente and ano_mes=left(p_de,7) group by 1,2),
p0c as (select z.fazenda_id, z.categoria_codigo, z.saldo_inicial, z.peso_medio_inicial, k.pk,
      (case when z.saldo_inicial>0 then 'cadastro' else 'zero' end)::text origem
      from zoot_mensal_cache z
      left join pk_ini k on k.fazenda_id=z.fazenda_id and k.categoria=z.categoria_codigo
      where z.cliente_id=p_cliente and z.ano_mes=left(p_de,7) and z.cenario='realizado'
        and (p_fazenda is null or z.fazenda_id=p_fazenda)
        and not exists (select 1 from p0f where p0f.fazenda_id=z.fazenda_id)),
p0u as (select * from p0f union all select * from p0c),
p0 as (select categoria, sum(quantidade) q, case when sum(quantidade)>0 then sum(quantidade*peso_medio_kg)/sum(quantidade) end pm, case when sum(quantidade*peso_medio_kg)>0 then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg) end pk
      from p0u group by 1),
p1f as (select i.fazenda_id, i.categoria, i.quantidade, i.peso_medio_kg, i.preco_kg, 'fechamento'::text origem
      from valor_rebanho_fechamento_itens i join per on true
      where i.cliente_id=p_cliente and i.ano_mes=per.p1 and (p_fazenda is null or i.fazenda_id=p_fazenda)),
p1c as (select z.fazenda_id, z.categoria_codigo, z.saldo_final, z.peso_medio_final, null::numeric,
      (case when z.saldo_final>0 then 'cadastro' else 'zero' end)::text origem
      from zoot_mensal_cache z join per on true
      where z.cliente_id=p_cliente and z.ano_mes=per.p1 and z.cenario='realizado'
        and (p_fazenda is null or z.fazenda_id=p_fazenda)
        and not exists (select 1 from p1f where p1f.fazenda_id=z.fazenda_id)),
p1u as (select * from p1f union all select * from p1c),
p1 as (select categoria, sum(quantidade) q, case when sum(quantidade)>0 then sum(quantidade*peso_medio_kg)/sum(quantidade) end pm, case when sum(quantidade*peso_medio_kg)>0 then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg) end pk
      from p1u group by 1),
k as (select categoria from p0 union select categoria from p1),
c as (
  select k.categoria, coalesce(p0.q,0) q0, round(p0.pm,2) pm0, round(p0.pk,4) pk0, round(coalesce(p0.q*p0.pm*p0.pk,0),2) v0,
         coalesce(p1.q,0) q1, round(p1.pm,2) pm1, round(p1.pk,4) pk1,
         round(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,p1.pk),2) v1_p0,
         round(coalesce(p1.q*p1.pm*coalesce(p1.pk,p0.pk),0),2) v1_p1
  from k left join p0 on p0.categoria=k.categoria left join p1 on p1.categoria=k.categoria)
select jsonb_build_object('p0', (select p0 from per), 'p1', (select p1 from per),
  'p0_fonte', (select case when bool_or(origem='fechamento') then 'fechamento'
                           when sum(coalesce(quantidade,0))>0 then 'cadastro' else 'zero' end from p0u),
  'p1_fonte', (select case when bool_or(origem='fechamento') then 'fechamento'
                           when sum(coalesce(quantidade,0))>0 then 'cadastro' else 'zero' end from p1u),
  'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria',categoria,'q0',q0,'pm0',pm0,'pk0',pk0,'v0',v0,'q1',q1,'pm1',pm1,'pk1',pk1,'v1_p0',v1_p0,'v1_p1',v1_p1,'vpb',v1_p0-v0,'efeito',v1_p1-v1_p0) order by categoria) from c),'[]'::jsonb),
  'total', (select jsonb_build_object('q0',sum(q0),'v0',sum(v0),'q1',sum(q1),'v1_p0',sum(v1_p0),'v1_p1',sum(v1_p1),'vpb',sum(v1_p0-v0),'efeito',sum(v1_p1-v1_p0)) from c))
$function$;

REVOKE ALL ON FUNCTION public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) TO authenticated, service_role;

-- ⚠ O CACHE PRECISOU SER REMATERIALIZADO em 9 pares (fazenda, ano) que tinham fechamento e
--   NENHUMA linha em `zoot_mensal_cache` — e isso importa agora, porque a regra nova LE o cache
--   quando nao ha fechamento. Um deles era real (Bom Retiro 2023, 51 linhas depois do refresh);
--   os outros oito sao fazendas sem gado no ano (Sta. Luzia 2024-26, Retiro Agricultura 2025-26,
--   Bom Retiro 2024-26), e ali `fn_zoot_categoria_mensal` devolve zero linhas de proposito —
--   linha inteiramente zerada nao entra no cache. Zero legitimo, nao ausencia.
DO $ref$
DECLARE r record;
BEGIN
  FOR r IN
    select distinct fp.fazenda_id, left(fp.ano_mes,4)::int ano
    from fechamento_pastos fp where fp.status='fechado'
      and not exists (select 1 from zoot_mensal_cache z
                       where z.fazenda_id=fp.fazenda_id and z.cenario='realizado'
                         and left(z.ano_mes,4)::int = left(fp.ano_mes,4)::int)
  LOOP
    PERFORM public.refresh_zoot_cache(r.fazenda_id, r.ano);
  END LOOP;
END $ref$;
