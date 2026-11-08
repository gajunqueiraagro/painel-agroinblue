-- FECH-PASTO-UNIDADE-01 · F1 banco 2/4 (Gabriel 07/11/2026, modelo A): dividir em piquetes NÃO encerra mais o pai — ele segue sendo o
-- pasto e o card de todo mês (os piquetes são subáreas dele, com início e área próprios). A regra "campeiro → piquete A" (o card do pai ia
-- inteiro ao 1º piquete) SAI. Remendos guardados pelo md5 do corpo VIVO, cada trecho casando 1 vez:
--   · fn_piquetes_concluir: não recusa mais o pai com card no mês (o card fica nele) e não grava `data_fim` no pai (só a observação);
--   · fn_piquetes_desfazer: aceita o pai sem fim (a divisão nova não encerra; o desfazer restaura o fim de ANTES da divisão, nulo);
--   · fn_piquetes_mudar_inicio: não encerra o pai, não leva card a piquete; adiar só recusa se houver linha marcada num piquete nos meses
--     que saem dele; as frases dizem que o pai segue sendo o pasto;
--   · fn_piquetes_mudar_inicio_desfazer: aceita o pai sem fim e não devolve fim ao pai.
-- A trilha das divisões feitas ANTES (dados_novos.pai_data_fim) segue como registro do que foi feito.
set local lock_timeout = '2s';

-- o remendo de corpo grande/de outra frente: confere o md5 do corpo VIVO, cada trecho casa 1 vez, recria pelo pg_get_functiondef
-- (dono, SECURITY, search_path e as permissões ficam como estão: CREATE OR REPLACE não mexe no ACL)
create or replace function pg_temp.fpu_patch(p_fn regprocedure, p_md5 text, p_de text[], p_para text[]) returns text language plpgsql as $f$
declare v_src text; v_def text; i int; n int;
begin
  select prosrc into v_src from pg_proc where oid = p_fn;
  if md5(v_src) <> p_md5 then
    raise exception 'FECH-PASTO-UNIDADE-01: o corpo de % mudou (md5 %, esperado %). Nada foi gravado.', p_fn, md5(v_src), p_md5;
  end if;
  v_def := pg_get_functiondef(p_fn);
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(v_def) - length(replace(v_def, p_de[i], ''))) / length(p_de[i]);
    if n <> 1 then
      raise exception 'FECH-PASTO-UNIDADE-01: o trecho % de % aparece % vez(es), esperado 1. Nada foi gravado.', i, p_fn, n;
    end if;
    v_def := replace(v_def, p_de[i], p_para[i]);
  end loop;
  execute v_def;
  select prosrc into v_src from pg_proc where oid = p_fn;
  return md5(v_src);
end $f$;

-- concluir: o pai segue vigente
select pg_temp.fpu_patch('public.fn_piquetes_concluir(uuid, uuid[], date, boolean, jsonb)'::regprocedure, '29d3b7cac3899b886868ba1c4f44f89f',
  array[$a0$  SELECT format('O pasto %s tem fechamento de %s (%s): os piquetes começam depois dele. Nada foi gravado.', pai.nome,
                to_char(to_date(fp.ano_mes || '-01', 'YYYY-MM-DD'), 'MM/YYYY'), fp.status)
    INTO v_frase FROM public.fechamento_pastos fp
   WHERE fp.pasto_id = pai.id AND fp.ano_mes >= to_char(v_mes, 'YYYY-MM') ORDER BY fp.ano_mes DESC LIMIT 1;$a0$,
        $a1$     SET data_fim = v_fim,
         observacoes = concat_ws(' · ', nullif(btrim(coalesce(observacoes, '')), ''), format('virou o grupo %s em %s', pai.nome, v_mm))$a1$],
  array[$b0$  v_frase := NULL;  -- FECH-PASTO-UNIDADE-01: o pai segue sendo o pasto e o card; o card dele não impede os piquetes$b0$,
        $b1$     SET observacoes = concat_ws(' · ', nullif(btrim(coalesce(observacoes, '')), ''), format('dividido nos piquetes do grupo %s em %s', pai.nome, v_mm))$b1$]);

-- desfazer a divisão: o pai pode estar sem fim
select pg_temp.fpu_patch('public.fn_piquetes_desfazer(uuid, text, boolean)'::regprocedure, 'b5750779f9fafa70c3b1bdde99cb2b64',
  array[$a0$    IF pai.data_fim IS DISTINCT FROM (v_conc.dados_novos->>'pai_data_fim')::date THEN
$a0$],
  array[$b0$    IF pai.data_fim IS NOT NULL AND pai.data_fim IS DISTINCT FROM (v_conc.dados_novos->>'pai_data_fim')::date THEN  -- FECH-PASTO-UNIDADE-01
$b0$]);

-- mudar o mês de início: o pai não se encerra e o card não vai ao 1º piquete
select pg_temp.fpu_patch('public.fn_piquetes_mudar_inicio(uuid, date, text, boolean, boolean)'::regprocedure, 'b33cd43e0b5bfc4a5710109dd3cf526e',
  array[$a0$  if pai.data_fim is distinct from (v_antes - 1) then
$a0$,
        $a1$    if exists (select 1 from public.fechamento_pastos f where f.pasto_id = pai.id and f.ano_mes >= v_de and f.ano_mes < v_ate) then
      v_recusas := v_recusas || format('%s já tem card entre %s e %s',$a1$,
        $a2$    for c in select * from public.fechamento_pastos x where x.pasto_id = pai.id and x.ano_mes >= v_de and x.ano_mes < v_ate order by x.ano_mes loop
$a2$,
        $a3$     set data_fim = v_mes - 1,
         observacoes = concat_ws($a3$,
        $a4$'piquetes de %s passam a começar em %s (eram %s); %s encerrado em %s; %s cab do card de %s passam ao grupo'$a4$,
        $a5$  if v_cab_depois <> v_cab_antes
     or exists (select 1 from public.fechamento_pastos f where f.pasto_id = pai.id and f.ano_mes >= v_de and f.ano_mes < v_ate) then
$a5$,
        $a6$'%s: os %s piquetes passam a começar em %s; %s volta a valer até %s (%s ha); nenhum card muda.'$a6$,
        $a7$        format('%s: os %s piquetes passam a começar em %s; %s fica encerrado em %s; %s card(s) de %s (%s cab, %s kg, %s UA) passam %s; lotação do grupo %s UA/ha (%s ha), de %s %s UA/ha (%s ha).',
          gr.nome, cardinality(v_pastos), to_char(v_mes, 'MM/YYYY'), pai.nome, to_char(v_mes - 1, 'DD/MM/YYYY'),
          jsonb_array_length(v_cards), pai.nome, v_cab_antes, round(v_kg), round(v_ua, 1),
          case when p_alocar then format('a %s com o lote alocado aos %s piquetes', v_destino_nome, cardinality(v_pastos))
               else format('inteiros a %s', v_destino_nome) end,
          v_lotacao->>'ua_ha_grupo', v_area_grupo, v_destino_nome, v_lotacao->>'ua_ha_piquete', v_area_destino)
$a7$,
        $a8$'fim_antes', pai.data_fim, 'fim_depois', v_mes - 1),$a8$,
        $a9$'pai_encerrado_em', v_mes - 1,$a9$],
  array[$b0$  if pai.data_fim is not null and pai.data_fim is distinct from (v_antes - 1) then  -- FECH-PASTO-UNIDADE-01: o pai não se encerra mais
$b0$,
        $b1$    -- FECH-PASTO-UNIDADE-01: o pai tem card em todo mês; o que não pode é linha marcada num piquete nos meses que saem dele
    if exists (select 1 from public.fechamento_pastos f join public.fechamento_pasto_itens i on i.fechamento_id = f.id
                where f.pasto_id = pai.id and f.ano_mes >= v_de and f.ano_mes < v_ate and i.piquete_id is not null) then
      v_recusas := v_recusas || format('%s tem lançamento por piquete entre %s e %s',$b1$,
        $b2$    -- FECH-PASTO-UNIDADE-01: o card do pai FICA nele (a regra "campeiro → piquete A" saiu): nenhum card entra na lista
    for c in select * from public.fechamento_pastos x where x.pasto_id = pai.id and x.ano_mes >= v_de and x.ano_mes < v_ate and false order by x.ano_mes loop
$b2$,
        $b3$     set observacoes = concat_ws($b3$,
        $b4$'piquetes de %s passam a começar em %s (eram %s); %s segue sendo o pasto (não se encerra em %s); %s cab seguem no card de %s'$b4$,
        $b5$  if v_cab_depois <> v_cab_antes then
$b5$,
        $b6$'%s: os %s piquetes passam a começar em %s; %s segue sendo o pasto (sem piquetes até %s; %s ha); nenhum card muda.'$b6$,
        $b7$        format('%s: os %s piquetes passam a começar em %s; %s segue sendo o pasto e o card de cada mês (%s ha); nenhum card muda.',
          gr.nome, cardinality(v_pastos), to_char(v_mes, 'MM/YYYY'), pai.nome, public.fn_pasto_area_no_mes(pai.id, v_de))
$b7$,
        $b8$'fim_antes', pai.data_fim, 'fim_depois', pai.data_fim),$b8$,
        $b9$'pai_encerrado_em', null::date,$b9$]);

-- desfazer a mudança de início: o fim do pai não volta
select pg_temp.fpu_patch('public.fn_piquetes_mudar_inicio_desfazer(uuid, text, boolean)'::regprocedure, '4f2c7d2461ea871ed8c19d29aee9a8a7',
  array[$a0$  if pai.data_fim is distinct from (v_para - 1) then
$a0$,
        $a1$    if exists (select 1 from public.fechamento_pastos f where f.pasto_id = pai.id and f.ano_mes >= v_de and f.ano_mes < v_ate) then
      v_recusas := v_recusas || format('%s ganhou card entre$a1$,
        $a2$     set data_fim = (t.dados_anteriores->'pai'->>'data_fim')::date,
         observacoes = t.dados_anteriores->'pai'->>'observacoes'
$a2$],
  array[$b0$  if pai.data_fim is not null and pai.data_fim is distinct from (v_para - 1) then  -- FECH-PASTO-UNIDADE-01: o pai não se encerra mais
$b0$,
        $b1$    -- FECH-PASTO-UNIDADE-01: o pai tem card em todo mês; a linha marcada num piquete só existe no mês em que ele vale (gatilho)
    if false then
      v_recusas := v_recusas || format('%s ganhou card entre$b1$,
        $b2$     set observacoes = t.dados_anteriores->'pai'->>'observacoes'  -- FECH-PASTO-UNIDADE-01: o fim do pai não volta (ele segue sendo o pasto)
$b2$]);
