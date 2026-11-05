-- FIN-LISTA-SEM-CAIXA-FILTROS-01 — todos os filtros da barra valem igual com "Sem caixa" Ocultar, Mostrar e Só c/ DRE, e nenhum
-- recorte passa do tempo do `authenticated` (8 s; a tela ficava com a página anterior). NJ, 2021–2026, dimensão financeira.
-- Admin simulado; só leitura; termina em RAISE 'OK'.
--   F  cada filtro (tipo ×3, status ×3, fazenda, conta, subcentro — a fazenda, a conta e o subcentro mais usados) × cada modo: TODA
--      linha da página (até 500) casa com o filtro e com o modo (Ocultar/Mostrar = só com caixa; Só c/ DRE = sem caixa e compõe DRE).
--   M  Ocultar e Mostrar têm a MESMA grade (total e linhas) e a MESMA seção sem caixa; o modo não muda o recorte, só a grade.
--   T  cada chamada abaixo de 4 s (o plano que estourava com o Tipo levava 9,7 s; o conserto, 0,65 s).
--   A  auto-teste: a conferência de "Entradas" sobre a página de "Saídas" acha linhas fora (a busca sabe achar).
set local statement_timeout = '50s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.casa(p_k text, p_v text, x jsonb) returns boolean language sql immutable as $f$
  select case p_k
    when 'tipo_operacao' then case when p_v like '3-%' then btrim(coalesce(x->>'tipo_operacao', '')) in ('3-Transferências', '3-Transferência')
                                   else btrim(coalesce(x->>'tipo_operacao', '')) = p_v end
    when 'status'        then case p_v when 'conciliado_real' then x->>'status_transacao' = 'realizado' and (x->>'conciliado')::boolean
                                       when 'realizado' then x->>'status_transacao' = 'realizado' and not (x->>'conciliado')::boolean
                                       else x->>'status_transacao' = p_v end
    when 'fazenda_id'    then x->>'fazenda_id' = p_v
    when 'conta_origem'  then x->>'conta_bancaria_id' = p_v
    when 'subcentro'     then x->>'subcentro' = p_v
  end
$f$;

DO $t$
DECLARE
  c_cli constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  base jsonb := '{"dimensao":"financeira","anos":[2021,2022,2023,2024,2025,2026]}';
  o jsonb := '{"campo":"default","dir":"asc","nivel":"centro"}';
  v_faz text; v_conta text; v_sub text; fl record; m text; filtro jsonb; r jsonb; t timestamptz; seg numeric; maxseg numeric := 0;
  por_modo jsonb; n int := 0; linhas int := 0; falhas text := ''; fora int;
BEGIN
  select fazenda_id::text into v_faz from public.financeiro_lancamentos_v2 where cliente_id = c_cli and not cancelado and fazenda_id is not null
   group by 1 order by count(*) desc limit 1;
  select conta_bancaria_id::text into v_conta from public.financeiro_lancamentos_v2 where cliente_id = c_cli and not cancelado and conta_bancaria_id is not null
   group by 1 order by count(*) desc limit 1;
  select subcentro into v_sub from public.financeiro_lancamentos_v2 where cliente_id = c_cli and not cancelado and subcentro is not null
   group by 1 order by count(*) desc limit 1;
  if v_faz is null or v_conta is null or v_sub is null then raise exception 'conjunto vazio: sem fazenda/conta/subcentro'; end if;

  for fl in select * from (values
    ('tipo_operacao', '2-Saídas'), ('tipo_operacao', '1-Entradas'), ('tipo_operacao', '3-Transferências'),
    ('status', 'realizado'), ('status', 'conciliado_real'), ('status', 'previsto'),
    ('fazenda_id', v_faz), ('conta_origem', v_conta), ('subcentro', v_sub)) x(k, v) loop
    por_modo := '{}';
    foreach m in array array['ocultar', 'mostrar', 'so_dre'] loop
      filtro := base || jsonb_build_object('modo_sem_caixa', m)
                     || case when fl.k = 'status' then jsonb_build_object('status', jsonb_build_array(fl.v)) else jsonb_build_object(fl.k, fl.v) end;
      t := clock_timestamp();
      r := public.fn_fin_v2_lista_pagina(c_cli, filtro, o, 0, 500);
      seg := extract(epoch from clock_timestamp() - t); maxseg := greatest(maxseg, seg);
      if seg >= 4 then raise exception 'T: % = % em % s (o limite do authenticated é 8 s)', fl.k, fl.v, round(seg, 2) using hint = m; end if;
      select count(*) into fora from jsonb_array_elements(r->'linhas') x where not coalesce(pg_temp.casa(fl.k, fl.v, x), false);
      if fora > 0 then falhas := falhas || format(' F[%s=%s %s]: %s linhas fora do filtro;', fl.k, left(fl.v, 12), m, fora); end if;
      select count(*) into fora from jsonb_array_elements(r->'linhas') x
       where case when m = 'so_dre' then not ((x->>'sem_movimentacao_caixa')::boolean is true and (x->>'compoe_dre')::boolean is true)
                  else (x->>'sem_movimentacao_caixa')::boolean is true end;
      if fora > 0 then falhas := falhas || format(' F[%s=%s %s]: %s linhas fora do modo;', fl.k, left(fl.v, 12), m, fora); end if;
      -- A: a página de Saídas conferida como Entradas tem que ter linhas fora
      if fl.k = 'tipo_operacao' and fl.v = '2-Saídas' and m = 'ocultar' then
        if jsonb_array_length(r->'linhas') = 0 then raise exception 'A: página de Saídas vazia (prova inválida)'; end if;
        select count(*) into fora from jsonb_array_elements(r->'linhas') x where not pg_temp.casa('tipo_operacao', '1-Entradas', x);
        if fora = 0 then falhas := falhas || ' A: a conferência não achou Saídas fora de "Entradas";'; end if;
      end if;
      por_modo := por_modo || jsonb_build_object(m, jsonb_build_object('total', r->'total_linhas', 'linhas', r->'linhas', 'sem_caixa', r->'sem_caixa'));
      n := n + 1; linhas := linhas + jsonb_array_length(r->'linhas');
    end loop;
    if por_modo->'ocultar' <> por_modo->'mostrar' then falhas := falhas || format(' M[%s=%s]: Ocultar e Mostrar diferem;', fl.k, left(fl.v, 12)); end if;
    if por_modo->'ocultar'->'sem_caixa' <> por_modo->'so_dre'->'sem_caixa' then
      falhas := falhas || format(' M[%s=%s]: a seção sem caixa muda com o Só c/ DRE;', fl.k, left(fl.v, 12));
    end if;
  end loop;
  if n <> 27 or linhas = 0 then raise exception 'conjunto incompleto (% chamadas, % linhas)', n, linhas; end if;
  if falhas <> '' then raise exception 'F/M/A:%', falhas; end if;
  RAISE EXCEPTION 'OK (% chamadas, % linhas conferidas, maior tempo % s)', n, linhas, round(maxseg, 2);
END $t$;
