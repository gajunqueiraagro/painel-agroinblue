-- FISCAL · 20261028115370 — ANTECIPAR o início da composição de uma fazenda (pedido do Code 4 14/11 19:55; Chat 20:35, lote 4).
-- Caso: a Vera tem a composição gravada desde 01/11/2026 (o dia em que foi cadastrada), mas é dona das 3 fazendas desde antes. A porta
-- de gravar (`fn_fiscal_fazenda_titulares_gravar`) recusa começar ANTES da versão viva ("nada no meio de uma vigência já gravada") —
-- certo para uma composição nova, mas não há como dizer "esta mesma composição já valia antes".
-- · Só com UMA versão viva (as mesmas pessoas, a mesma data): a mesma composição passa a valer desde a data nova; nada mais muda
--   (participação, condição, o que o financeiro registra e o fim ficam). Com mais de uma versão: recusa, corrige-se pela composição.
-- · Nada se apaga: as linhas de antes ficam substituídas (substituida_em) e entram cópias com o início novo; trilha no audit_log com o
--   motivo; o desfazer devolve o início de antes (só enquanto a composição não mudou depois).
-- · Aviso (não bloqueio): LCDPR já ENTREGUE de um titular desta fazenda num ano que a antecipação alcança — o livro daquele ano muda.
set local lock_timeout = '2s';

create or replace function public.fn_fiscal_fazenda_titulares_antecipar(p_fazenda_id uuid, p_novo_inicio date, p_motivo text,
  p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare f public.fazendas; v_motivo text := btrim(coalesce(p_motivo, '')); v_n int; v_ini date; v_fim date; v_lista jsonb;
  v_ids_antes jsonb; v_ids_novos jsonb; v_avisos jsonb := '[]'::jsonb; v_aud uuid; v_frase text;
begin
  select * into f from public.fazendas where id = p_fazenda_id;
  if f.id is null or not coalesce(public.tenant_ok(f.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta fazenda.';
  end if;
  if p_novo_inicio is null or p_novo_inicio < date '2000-01-01' then raise exception 'Informe a data nova do início.'; end if;
  if length(v_motivo) < 3 then raise exception 'Diga por que antecipa (pelo menos 3 letras).'; end if;
  select count(distinct vigencia_inicio), min(vigencia_inicio), min(vigencia_fim) into v_n, v_ini, v_fim
    from public.fiscal_fazenda_titulares where fazenda_id = f.id and substituida_em is null;
  if v_n = 0 then raise exception '%', format('%s ainda não tem composição: grave pela composição.', f.nome); end if;
  if v_n > 1 then
    raise exception '%', format('A composição de %s tem %s versões: antecipar só vale quando há uma só (corrija pela composição).', f.nome, v_n);
  end if;
  if p_novo_inicio >= v_ini then
    raise exception '%', format('A composição de %s já vale desde %s: a data nova precisa ser antes.', f.nome, to_char(v_ini, 'DD/MM/YYYY'));
  end if;
  select jsonb_agg(jsonb_build_object('titular_id', ft.titular_id, 'nome', x.nome, 'participacao', ft.participacao, 'condicao', ft.condicao,
                                      'registra', ft.registra) order by x.nome),
         jsonb_agg(to_jsonb(ft.id) order by ft.id)
    into v_lista, v_ids_antes
    from public.fiscal_fazenda_titulares ft join public.fiscal_titulares x on x.id = ft.titular_id
   where ft.fazenda_id = f.id and ft.substituida_em is null;
  -- o livro de um ano já entregue muda: avisa (quem entregou decide se retifica)
  select coalesce(jsonb_agg(to_jsonb(format('LCDPR %s de %s já foi entregue: o livro desse ano muda (veja se precisa retificar).', e.ano, x.nome))
                            order by e.ano, x.nome), '[]'::jsonb)
    into v_avisos
    from public.fiscal_lcdpr_entregas e join public.fiscal_titulares x on x.id = e.titular_id
   where e.situacao = 'entregue' and e.ano between extract(year from p_novo_inicio)::int and extract(year from v_ini - 1)::int
     and e.titular_id in (select ft.titular_id from public.fiscal_fazenda_titulares ft where ft.fazenda_id = f.id and ft.substituida_em is null);
  v_frase := format('%s: a mesma composição passa a valer desde %s (era desde %s); nada mais muda.', f.nome,
                    to_char(p_novo_inicio, 'DD/MM/YYYY'), to_char(v_ini, 'DD/MM/YYYY'));
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'fazenda', f.nome, 'inicio_antes', v_ini, 'inicio_novo', p_novo_inicio,
      'fim', v_fim, 'titulares', v_lista, 'avisos', v_avisos, 'frase', v_frase);
  end if;
  update public.fiscal_fazenda_titulares set substituida_em = now() where fazenda_id = f.id and substituida_em is null;
  with novos as (
    insert into public.fiscal_fazenda_titulares (cliente_id, fazenda_id, titular_id, participacao, vigencia_inicio, vigencia_fim, condicao, registra)
    select ft.cliente_id, ft.fazenda_id, ft.titular_id, ft.participacao, p_novo_inicio, ft.vigencia_fim, ft.condicao, ft.registra
      from public.fiscal_fazenda_titulares ft
     where ft.id in (select (j #>> '{}')::uuid from jsonb_array_elements(v_ids_antes) j)
    returning id)
  select jsonb_agg(to_jsonb(id) order by id) into v_ids_novos from novos;
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo,
                                dados_anteriores, dados_novos, via)
  values (f.cliente_id, f.id, auth.uid(), 'fiscal', 'editou', 'fiscal_fazenda_titulares', f.id,
          format('%s · composição antecipada para %s (era %s)', f.nome, to_char(p_novo_inicio, 'DD/MM/YYYY'), to_char(v_ini, 'DD/MM/YYYY')),
          jsonb_build_object('gesto', 'antecipar', 'inicio', v_ini, 'ids', v_ids_antes, 'titulares', v_lista),
          jsonb_build_object('gesto', 'antecipar', 'inicio', p_novo_inicio, 'ids', v_ids_novos, 'motivo', v_motivo, 'avisos', v_avisos),
          public._fn_trilha_via())
  returning id into v_aud;
  return jsonb_build_object('simulado', false, 'gravado', true, 'antecipacao_id', v_aud, 'fazenda', f.nome, 'inicio_antes', v_ini,
    'inicio_novo', p_novo_inicio, 'avisos', v_avisos, 'frase', v_frase);
end $$;

create or replace function public.fn_fiscal_fazenda_titulares_antecipar_desfazer(p_antecipacao_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare a public.audit_log; f public.fazendas; v_motivo text := btrim(coalesce(p_motivo, '')); v_ini date; v_vivos jsonb; v_frase text;
begin
  select * into a from public.audit_log where id = p_antecipacao_id and tabela_origem = 'fiscal_fazenda_titulares'
     and dados_novos->>'gesto' = 'antecipar';
  if a.id is null or not coalesce(public.tenant_ok(a.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Antecipação não encontrada (ou sem acesso).';
  end if;
  select * into f from public.fazendas where id = a.fazenda_id;
  if exists (select 1 from public.audit_log d where d.tabela_origem = 'fiscal_fazenda_titulares' and d.registro_id = a.fazenda_id
               and d.dados_novos->>'desfaz' = a.id::text) then
    raise exception 'Esta antecipação já foi desfeita.';
  end if;
  if length(v_motivo) < 3 then raise exception 'Diga por que desfaz (pelo menos 3 letras).'; end if;
  select coalesce(jsonb_agg(to_jsonb(id) order by id), '[]'::jsonb) into v_vivos
    from public.fiscal_fazenda_titulares where fazenda_id = a.fazenda_id and substituida_em is null;
  if v_vivos <> a.dados_novos->'ids' then
    raise exception '%', format('A composição de %s mudou depois da antecipação: corrija pela composição.', f.nome);
  end if;
  v_ini := (a.dados_anteriores->>'inicio')::date;
  v_frase := format('%s: a composição volta a valer desde %s.', f.nome, to_char(v_ini, 'DD/MM/YYYY'));
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'fazenda', f.nome, 'inicio_volta', v_ini,
      'inicio_hoje', a.dados_novos->>'inicio', 'frase', v_frase);
  end if;
  update public.fiscal_fazenda_titulares set substituida_em = now() where fazenda_id = a.fazenda_id and substituida_em is null;
  insert into public.fiscal_fazenda_titulares (cliente_id, fazenda_id, titular_id, participacao, vigencia_inicio, vigencia_fim, condicao, registra)
  select ft.cliente_id, ft.fazenda_id, ft.titular_id, ft.participacao, v_ini, ft.vigencia_fim, ft.condicao, ft.registra
    from public.fiscal_fazenda_titulares ft where ft.id in (select (j #>> '{}')::uuid from jsonb_array_elements(v_vivos) j);
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo,
                                dados_anteriores, dados_novos, via)
  values (a.cliente_id, a.fazenda_id, auth.uid(), 'fiscal', 'desfez', 'fiscal_fazenda_titulares', a.fazenda_id,
          format('%s · desfez a antecipação (volta a %s)', f.nome, to_char(v_ini, 'DD/MM/YYYY')),
          jsonb_build_object('inicio', a.dados_novos->>'inicio', 'ids', v_vivos),
          jsonb_build_object('desfaz', a.id::text, 'inicio', v_ini, 'motivo', v_motivo), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'fazenda', f.nome, 'inicio_volta', v_ini, 'frase', v_frase);
end $$;

revoke all on function public.fn_fiscal_fazenda_titulares_antecipar(uuid, date, text, boolean) from public, anon;
revoke all on function public.fn_fiscal_fazenda_titulares_antecipar_desfazer(uuid, text, boolean) from public, anon;
grant execute on function public.fn_fiscal_fazenda_titulares_antecipar(uuid, date, text, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_fazenda_titulares_antecipar_desfazer(uuid, text, boolean) to authenticated, service_role;
