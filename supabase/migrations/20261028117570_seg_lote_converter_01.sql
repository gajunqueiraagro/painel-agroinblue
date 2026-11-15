-- SEG-LOTE-CONVERTER-01 (Chat 12/11 12:33; teste guardaDeClienteNasMigrations) — a _fn_lote_codigo_curto_converter (117550) recebe o
-- cliente e é SECURITY DEFINER sem guarda no corpo. Risco medido: EXECUTE só de postgres/service_role (anon e authenticated: permission
-- denied), nenhum chamador no banco nem na tela. Defesa em profundidade: a mesma função, com o corpo da 117550 byte a byte e SÓ a guarda
-- acrescentada no início (sessão postgres = a migration, ou o admin AgroinBlue; senão 42501). A NJ (fatia própria) segue podendo usá-la.
set local lock_timeout = '2s';

create or replace function public._fn_lote_codigo_curto_converter(p_cliente uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_cad jsonb; v_set jsonb; v_conf text; v_rep text;
begin
  /* SEG (Chat 12/11 12:33): só a migration (sessão postgres) ou o admin AgroinBlue; o EXECUTE já é só de postgres/service_role */
  if not (session_user = 'postgres' or public.is_admin_agroinblue(auth.uid())) then
    raise exception using errcode = '42501', message = 'sem acesso a esta conversão';
  end if;
  select string_agg(x.sigla || ' (' || x.nome || ')', ', ') into v_conf
    from public.rebanho_lote_cadastros x
   where x.cliente_id = p_cliente and x.tipo = 'atividade' and x.sigla in ('C', 'R', 'E')
     and exists (select 1 from public.rebanho_lote_cadastros y where y.cliente_id = p_cliente and y.tipo = 'atividade'
                  and y.sigla = case x.sigla when 'C' then 'CRI' when 'R' then 'REC' else 'ENG' end);
  if v_conf is not null then
    raise exception using errcode = 'P0001', message = format('O cliente já tem a atividade %s: nada foi gravado.', v_conf);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'antes', c.sigla, 'depois', m.nova, 'nome', c.nome) order by c.sigla), '[]'::jsonb)
    into v_cad
    from public.rebanho_lote_cadastros c join (values ('CRI', 'C'), ('REC', 'R'), ('ENG', 'E')) m(velha, nova) on m.velha = c.sigla
   where c.cliente_id = p_cliente and c.tipo = 'atividade';

  with l as (
    select r.id, r.fazenda_id, r.codigo, r.situacao, r.codigo_regra, a.sigla as ativ_antes,
           coalesce(m.nova, a.sigla) || '-' || c.sigla || '-' || ra.sigla || coalesce('-' || nullif(btrim(r.carimbo), ''), '') as base
      from public.rebanho_lotes r
      join public.rebanho_lote_cadastros a on a.id = r.atividade_id
      join public.rebanho_lote_cadastros c on c.id = r.categoria_id
      join public.rebanho_lote_cadastros ra on ra.id = r.raca_id
      left join (values ('CRI', 'C'), ('REC', 'R'), ('ENG', 'E')) m(velha, nova) on m.velha = a.sigla
     where r.cliente_id = p_cliente and r.situacao <> 'cancelado'),
  /* quem já está na regra nova com o código-alvo (só a sigla da atividade muda) fica com ele; depois os ativos; depois o código de antes */
  n as (select l.*, row_number() over (partition by l.fazenda_id, l.base
          order by (l.codigo_regra = 'etapas' and l.base = split_part(l.base, '-', 1) || substr(l.codigo, length(l.ativ_antes) + 1)) desc,
                   l.situacao <> 'ativo', l.codigo) as k from l)
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'fazenda_id', n.fazenda_id, 'situacao', n.situacao, 'antes', n.codigo,
           'depois', case when n.k = 1 then n.base else n.base || '-' || lpad(n.k::text, 2, '0') end) order by n.codigo), '[]'::jsonb)
    into v_set from n;
  if exists (select 1 from jsonb_to_recordset(v_set) t(depois text) where t.depois ~ '-[0-9]{3}$') then
    raise exception using errcode = 'P0001', message = 'Mais de 99 lotes com o mesmo código numa fazenda: nada foi gravado.';
  end if;
  /* o código novo não pode bater com um lote vivo que fica de fora (nenhum fica, mas a guarda prova) */
  select string_agg(t.depois, ', ') into v_rep
    from jsonb_to_recordset(v_set) t(id uuid, fazenda_id uuid, depois text)
   where exists (select 1 from public.rebanho_lotes x where x.fazenda_id = t.fazenda_id and x.codigo = t.depois and x.situacao <> 'cancelado'
                   and not exists (select 1 from jsonb_to_recordset(v_set) y(id uuid) where y.id = x.id));
  if v_rep is not null then raise exception using errcode = 'P0001', message = format('Código repetido: %s. Nada foi gravado.', v_rep); end if;
  /* um UPDATE só (uma linha de trilha por lote): o código novo de um não pode ser o de antes de OUTRO da mesma fazenda */
  select string_agg(t.depois, ', ') into v_rep
    from jsonb_to_recordset(v_set) t(id uuid, fazenda_id uuid, depois text)
   where exists (select 1 from jsonb_to_recordset(v_set) y(id uuid, fazenda_id uuid, antes text)
                  where y.id <> t.id and y.fazenda_id = t.fazenda_id and y.antes = t.depois);
  if v_rep is not null then raise exception using errcode = 'P0001', message = format('Código novo = código de antes de outro lote: %s. Nada foi gravado.', v_rep); end if;

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'cadastros', v_cad, 'lotes', v_set);
  end if;
  perform set_config('app.lote_escritor', '1', true);
  perform set_config('app.motivo', 'LOTE-CODIGO-CURTO-01: código curto (atividade C/R/E; ATIV-CAT-RAÇA[-carimbo])', true);
  update public.rebanho_lote_cadastros c set sigla = t.depois, atualizado_em = now()
    from jsonb_to_recordset(v_cad) t(id uuid, depois text) where t.id = c.id;
  update public.rebanho_lotes l
     set codigo = t.depois, codigo_regra = 'etapas', atualizado_em = now(),
         codigos_antigos = array_remove(array_remove(l.codigos_antigos, t.antes) || t.antes, t.depois)
    from jsonb_to_recordset(v_set) t(id uuid, antes text, depois text) where t.id = l.id;
  perform set_config('app.motivo', '', true);
  perform set_config('app.lote_escritor', '', true);
  return jsonb_build_object('ok', true, 'simulado', false, 'cadastros', v_cad, 'lotes', v_set);
end $$;
revoke all on function public._fn_lote_codigo_curto_converter(uuid, boolean) from public, anon, authenticated;
