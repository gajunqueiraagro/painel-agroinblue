-- FIN-REGRA-MODAL-02 (Gabriel 21/11 08:25, Vera: "ficou burra, não permite arrumar") — a SUGESTÃO e a CONTA ADMINISTRATIVA do modal
-- "Fazenda fora da regra da conta". Só leitura: troca o corpo da `fn_lancamentos_regra_fazenda_pendentes` (mesma assinatura, mesmo retorno
-- + `sugestao.origem` com o código novo) e cria a interna `_fn_fazenda_citada`. Nenhum lançamento muda aqui.
--   (c) a sugestão, na ordem: 1) a fazenda CITADA na descrição; 2) a citada no fornecedor ("Pec.3M-…"); 3) ITR (regra PLANO-ITR, Gabriel 18/11):
--       a ÚNICA fazenda produtiva, senão a de MAIOR área — e, se nenhuma decide, SEM sugestão (o histórico do fornecedor "Receita Federal" é de
--       todas as fazendas: foi ele que deu Baia Grande no ITR 3M); 4) o histórico do fornecedor (como antes, "k de N"); 5) nada = "você decide".
--       Citar = o CÓDIGO da fazenda como palavra, em maiúsculas exatas ("3M", "BG"; "Sr." não é "SR"), ou o NOME sem "Faz./Fazenda/Sítio/Estância"
--       (≥ 4 letras, sem acento/caixa), ou um dos apelidos. Só vale se citar UMA fazenda e ela passar na regra da conta.
--   (b) a conta administrativa equivalente (só no custo FIXO de atividade): a do mesmo centro com o nome trocado ("… Pecuária" → "… Administrativo"),
--       senão a ÚNICA administrativa de custo fixo, do mesmo centro e do mesmo tipo (nunca uma receita): ("Taxas e Impostos Fixos Pecuária" → "Taxas e Impostos Administrativos"; antes o nome não
--       batia e o seletor só oferecia fazenda).

create or replace function public._fn_fazenda_citada(p_cliente uuid, p_texto text, p_plano uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then min(f.id::text)::uuid end
    from fazendas f
   where f.cliente_id = p_cliente and not coalesce(f.eh_administrativa, false) and coalesce(f.status_operacional, 'ativa') <> 'inativa'
     and coalesce(p_texto, '') <> ''
     and _fn_regra_fazenda_da_conta(p_plano, f.id) is null
     and (
       (length(coalesce(f.codigo, '')) >= 2 and p_texto ~ ('(^|[^A-Za-z0-9])' || regexp_replace(f.codigo, '([^A-Za-z0-9])', '\\\1', 'g') || '([^A-Za-z0-9]|$)'))
       or (length(_fn_normalizar_texto(regexp_replace(f.nome, '^\s*(faz\.?|fazenda|s[ií]tio|est[aâ]ncia)\s+', '', 'i'))) >= 4
           and position(_fn_normalizar_texto(regexp_replace(f.nome, '^\s*(faz\.?|fazenda|s[ií]tio|est[aâ]ncia)\s+', '', 'i')) in _fn_normalizar_texto(p_texto)) > 0)
       or exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(f.aliases) = 'array' then f.aliases else '[]'::jsonb end) a
                   where length(_fn_normalizar_texto(a)) >= 3 and position(_fn_normalizar_texto(a) in _fn_normalizar_texto(p_texto)) > 0)
     )
$$;
revoke all on function public._fn_fazenda_citada(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.fn_lancamentos_regra_fazenda_pendentes(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = public set plan_cache_mode = force_custom_plan as $$
declare v jsonb;
begin
  if not tenant_ok(p_cliente) then raise exception 'Sem acesso a este cliente.' using errcode = '42501'; end if;
  with base as (
    select l.id, l.data_competencia, l.valor, l.descricao, l.status_transacao, l.favorecido_id, l.fazenda_id, l.plano_conta_id, l.financiamento_id,
           pc.subcentro, pc.centro_custo, pc.macro_custo, pc.escopo_negocio, pc.grupo_custo, pc.tipo_operacao,
           _fn_regra_fazenda_da_conta(l.plano_conta_id, l.fazenda_id) frase,
           (select f.nome from financeiro_fornecedores f where f.id = l.favorecido_id) fornecedor
      from financeiro_lancamentos_v2 l join financeiro_plano_contas pc on pc.id = l.plano_conta_id
     where l.cliente_id = p_cliente and not l.cancelado),
  pend as (select * from base where frase is not null),
  prod as (select f.id, f.area_total from fazendas f
            where f.cliente_id = p_cliente and not coalesce(f.eh_administrativa, false) and coalesce(f.status_operacional, 'ativa') <> 'inativa'),
  sug as (
    select p.id,
           _fn_fazenda_citada(p_cliente, p.descricao, p.plano_conta_id) cit_desc,
           _fn_fazenda_citada(p_cliente, p.fornecedor, p.plano_conta_id) cit_forn,
           (_fn_normalizar_texto(coalesce(p.descricao, '')) ~ '(^|[^a-z0-9])i\.?t\.?r\.?([^a-z0-9]|$)' or p.subcentro ~* '(^|[^a-z])itr([^a-z]|$)') itr,
           (select case when count(*) = 1 then min(x.id::text)::uuid end from prod x where _fn_regra_fazenda_da_conta(p.plano_conta_id, x.id) is null) unica,
           (select x.id from prod x where x.area_total is not null and _fn_regra_fazenda_da_conta(p.plano_conta_id, x.id) is null
              and x.area_total > coalesce((select max(y.area_total) from prod y where y.id <> x.id and y.area_total is not null
                                             and _fn_regra_fazenda_da_conta(p.plano_conta_id, y.id) is null), -1)) maior
      from pend p)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'competencia', p.data_competencia, 'valor', p.valor, 'descricao', p.descricao, 'status', p.status_transacao,
      'fornecedor', p.fornecedor,
      'subcentro', p.subcentro, 'grupo_custo', p.grupo_custo, 'fazenda_id', p.fazenda_id, 'regra', p.frase, 'financiamento_id', p.financiamento_id,
      'conciliado', exists (select 1 from conciliacao_bancaria_itens c where c.lancamento_id = p.id and c.desfeito_em is null),
      'mes_fechado', exists (select 1 from financeiro_fechamentos f where f.cliente_id = p_cliente and f.status_fechamento = 'fechado'
                               and f.ano_mes = to_char(p.data_competencia, 'YYYY-MM') and f.fazenda_id = p.fazenda_id),
      'sugestao', case
        when s.cit_desc is not null then jsonb_build_object('fazenda_id', s.cit_desc, 'vezes', 0, 'de', 0, 'origem', 'descricao')
        when s.cit_forn is not null then jsonb_build_object('fazenda_id', s.cit_forn, 'vezes', 0, 'de', 0, 'origem', 'fornecedor')
        when s.itr and s.unica is not null then jsonb_build_object('fazenda_id', s.unica, 'vezes', 0, 'de', 0, 'origem', 'itr_unica')
        when s.itr and s.maior is not null then jsonb_build_object('fazenda_id', s.maior, 'vezes', 0, 'de', 0, 'origem', 'itr_maior')
        when s.itr then null
        else (select jsonb_build_object('fazenda_id', h.fazenda_id, 'vezes', h.n, 'de', h.total, 'origem', 'historico')
                from (select o.fazenda_id, count(*) n, sum(count(*)) over () total
                        from financeiro_lancamentos_v2 o join fazendas fz on fz.id = o.fazenda_id
                       where o.cliente_id = p_cliente and o.favorecido_id = p.favorecido_id and o.id <> p.id and not o.cancelado
                         and _fn_regra_fazenda_da_conta(p.plano_conta_id, o.fazenda_id) is null
                       group by o.fazenda_id order by count(*) desc limit 1) h)
      end,
      'conta_adm', case when p.grupo_custo like 'Custo Fixo %' then
        (select jsonb_build_object('plano_conta_id', a.id, 'subcentro', a.subcentro)
           from (select c.id, c.subcentro, c.cliente_id,
                        lower(c.subcentro) = lower(regexp_replace(p.subcentro, '\s+(Pecuária|Agricultura|Silvicultura)$', ' Administrativo')) pelo_nome,
                        count(*) over () n
                   from financeiro_plano_contas c
                  where c.ativo and (c.cliente_id = p_cliente or c.cliente_id is null) and c.escopo_negocio = 'administrativo'
                    and c.centro_custo = p.centro_custo
                    and c.grupo_custo like 'Custo Fixo %' and c.tipo_operacao is not distinct from p.tipo_operacao) a
          where a.pelo_nome or a.n = 1
          order by a.pelo_nome desc, a.cliente_id nulls last limit 1) end
    ) order by p.data_competencia), '[]'::jsonb) into v
  from pend p join sug s on s.id = p.id;
  return v;
end $$;
revoke all on function public.fn_lancamentos_regra_fazenda_pendentes(uuid) from public, anon;
grant execute on function public.fn_lancamentos_regra_fazenda_pendentes(uuid) to authenticated;
