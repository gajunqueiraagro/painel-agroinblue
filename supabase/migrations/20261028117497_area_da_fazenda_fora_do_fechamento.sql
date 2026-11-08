-- MAPA-PIQUETE-SUBAREA-01 item 7 · decisão C1 (Gabriel 08/11/2026, corte nov/26): Reserva Legal, APP e Benfeitorias (pastos com uso
-- 'reserva', 'app' ou 'benfeitorias') seguem no cadastro como ÁREA da fazenda — é ali que a soma com a matrícula mora (resumo de áreas, Áreas,
-- Fazendas) —, mas a partir de 11/2026 saem do FECHAMENTO: não ganham card, não entram no conjunto do mês nem no P1. O histórico (os cards
-- fechados até 10/2026) fica como está. Os 3 polígonos de reserva ligados a um desses pastos (EXP, LUZ e PUR "Reserva Legal", tipo 'pasto')
-- voltam a ser ÁREA ('reserva_legal'), com trilha de cada um. O mapa de pastos deixa de listá-los na tela (o leitor do front).
-- Remendos guardados por md5 do corpo vivo (o mesmo `fpu_patch` da 117450): cada trecho casa 1 vez; ACL e SECURITY ficam como estão.
create or replace function pg_temp.fpu_patch(p_fn regprocedure, p_md5 text, p_de text[], p_para text[]) returns text language plpgsql as $f$
declare v_src text; v_def text; i int; n int;
begin
  select prosrc into v_src from pg_proc where oid = p_fn;
  if md5(v_src) <> p_md5 then
    raise exception 'AREA-DA-FAZENDA: o corpo de % mudou (md5 %, esperado %). Nada foi gravado.', p_fn, md5(v_src), p_md5;
  end if;
  v_def := pg_get_functiondef(p_fn);
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(v_def) - length(replace(v_def, p_de[i], ''))) / length(p_de[i]);
    if n <> 1 then
      raise exception 'AREA-DA-FAZENDA: o trecho % de % aparece % vez(es), esperado 1. Nada foi gravado.', i, p_fn, n;
    end if;
    v_def := replace(v_def, p_de[i], p_para[i]);
  end loop;
  execute v_def;
  select prosrc into v_src from pg_proc where oid = p_fn;
  return md5(v_src);
end $f$;

-- 1) a regra, num lugar só (o front tem o espelho: src/lib/pastos/areaDaFazenda.ts)
create or replace function public._fn_pasto_e_area_da_fazenda(p_tipo_uso text, p_ano_mes text)
returns boolean language sql immutable set search_path to 'pg_catalog', 'public' as $$
  select coalesce(p_tipo_uso in ('reserva', 'app', 'benfeitorias') and p_ano_mes >= '2026-11', false)
$$;
revoke all on function public._fn_pasto_e_area_da_fazenda(text, text) from public, anon;
-- o gatilho do card roda com os privilégios de quem grava (authenticated): a função do gatilho precisa de EXECUTE
grant execute on function public._fn_pasto_e_area_da_fazenda(text, text) to authenticated;

-- 2) o conjunto do mês (snapshot do P1, a área regenerada) e o status do P1: sem a área da fazenda desde 11/2026
select pg_temp.fpu_patch('public.fn_pastos_aplicaveis_mes(uuid, text)'::regprocedure, '5762edc455c42422465b2a64a2655d8a',
  array['AND public._fn_pai_do_piquete(p.id) IS NULL'],
  array['AND public._fn_pai_do_piquete(p.id) IS NULL AND NOT public._fn_pasto_e_area_da_fazenda(p.tipo_uso, p_ano_mes)']);
select pg_temp.fpu_patch('public._fn_status_pilares_fechamento(uuid, text)'::regprocedure, 'b75a0651f53650cd37a14d7f9f491026',
  array['AND public._fn_pai_do_piquete(p.id) IS NULL'],
  array['AND public._fn_pai_do_piquete(p.id) IS NULL AND NOT public._fn_pasto_e_area_da_fazenda(p.tipo_uso, _ano_mes)']);

-- 3) o card: nenhum dos três criadores (um, lote, conjunto) cria card de área da fazenda desde 11/2026 — a recusa mora no gatilho do card
select pg_temp.fpu_patch('public.trg_fn_fechamento_pasto_vigencia()'::regprocedure, 'b6529b496edb8ee3187559ab0f3b1a34',
  array['DECLARE v_nome text;',
        'SELECT p.nome, p.data_inicio, p.data_fim INTO v_nome, v_ini, v_fim',
        '  RETURN NEW;'],
  array['DECLARE v_tipo text; v_nome text;',
        'SELECT p.nome, p.data_inicio, p.data_fim, p.tipo_uso INTO v_nome, v_ini, v_fim, v_tipo',
        '  IF public._fn_pasto_e_area_da_fazenda(v_tipo, NEW.ano_mes) THEN
    RAISE EXCEPTION USING ERRCODE=''23514'',
      MESSAGE=format(''%s é área da fazenda desde 11/2026 (reserva, APP ou benfeitorias): não tem card no fechamento.'', v_nome);
  END IF;
  RETURN NEW;']);

-- 4) os 3 polígonos de reserva ligados a pasto voltam a ser área + a trilha do corte (um registro por pasto e por polígono)
do $m$
declare g record; v_n int := 0; v_lista jsonb;
begin
  -- sem usuário (migration) o escritor do mapa recusa pelo tenant: o UPDATE é direto (os gatilhos do polígono rodam) e cada um tem trilha
  for g in select x.id, x.nome_original, x.cliente_id, x.fazenda_id, x.pasto_id, f.codigo, p.nome pasto from public.fazenda_geometrias x
             join public.pastos p on p.id = x.pasto_id join public.fazendas f on f.id = p.fazenda_id
            where p.tipo_uso = 'reserva' and p.ativo and x.tipo = 'pasto' order by f.codigo loop
    update public.fazenda_geometrias set tipo = 'reserva_legal', pasto_id = null where id = g.id;
    insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
    values (g.cliente_id, g.fazenda_id, null, 'mapa', 'area_da_fazenda_poligono', 'fazenda_geometrias', g.id,
            format('O polígono "%s" da %s (%s) volta a ser área (reserva legal): a reserva é área da fazenda desde 11/2026', g.nome_original, g.pasto, g.codigo),
            jsonb_build_object('tipo', 'pasto', 'pasto_id', g.pasto_id), jsonb_build_object('tipo', 'reserva_legal', 'pasto_id', null),
            'sistema:MAPA-PIQUETE-SUBAREA-01');
    v_n := v_n + 1;
  end loop;
  if v_n <> 3 then raise exception 'AREA-DA-FAZENDA: esperava 3 polígonos de reserva ligados a pasto, achei %. Nada foi gravado.', v_n; end if;
  select jsonb_agg(jsonb_build_object('fazenda', f.codigo, 'pasto', p.nome, 'tipo_uso', p.tipo_uso, 'area_ha', p.area_produtiva_ha) order by f.codigo, p.nome)
    into v_lista from public.pastos p join public.fazendas f on f.id = p.fazenda_id where p.ativo and p.tipo_uso in ('reserva', 'app', 'benfeitorias');
  if jsonb_array_length(v_lista) <> 21 then raise exception 'AREA-DA-FAZENDA: esperava 21 pastos de área, achei %. Nada foi gravado.', jsonb_array_length(v_lista); end if;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  select p.cliente_id, p.fazenda_id, null, 'cadastros', 'area_da_fazenda_corte', 'pastos', p.id,
         format('%s é área da fazenda: sai do fechamento desde 11/2026 (segue no cadastro, %s ha)', p.nome, p.area_produtiva_ha),
         jsonb_build_object('no_fechamento', true, 'tipo_uso', p.tipo_uso), jsonb_build_object('no_fechamento_desde', null, 'fora_desde', '2026-11'),
         'sistema:MAPA-PIQUETE-SUBAREA-01'
    from public.pastos p where p.ativo and p.tipo_uso in ('reserva', 'app', 'benfeitorias');
end $m$;
