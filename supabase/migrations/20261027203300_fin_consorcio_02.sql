-- FIN-CONSORCIO-02 (Gabriel 19/10/2026, mock "Cadastro de Consorcio" 16:55) — o CONSORCIO como natureza propria, UNIVERSAL: qualquer
-- administradora, bem, indice e forma de cobranca. Evolui o contrato existente (`financiamentos` natureza 'consorcio' +
-- `financiamento_consorcio`); nada paralelo:
--   · a PARCELA guarda os componentes (fundo comum, taxa adm., fundo de reserva, seguro), a faixa e se e' ADIADA (sem vencimento ate'
--     a contemplacao). O "principal" da parcela = fundo comum + reserva; os "juros" = taxa adm. + seguro — a MESMA divisao que o motor
--     (`fn_reconciliar_parcela_financiamento`) ja' grava em dois lancamentos e dois planos: o principal em "Consorcio a contemplar"
--     (fora do DRE) e os juros no plano escolhido (padrao "Juros de Financiamento <atividade>").
--   · o GERADOR UNIVERSAL e' `fn_consorcio_cronograma(p)` (puro): cada componente aceita % por parcela, % do contrato ou valor fixo, e
--     usa exatamente o que foi informado — o que nao fecha vira AVISO, nunca correcao.
--   · editar / regerar / desfazer sao as funcoes do financiamento (EDITAR v2), com um desvio para o consorcio; a trilha e' a mesma
--     (`financiamento_parcelas_operacoes`, agora com reajuste e contemplacao e a foto do contrato para o desfazer).
--   · devolucao numa parcela: vinculo de papel 'devolucao' (o desvincular de sempre o desfaz).
-- Um escritor so' do consorcio: `_fn_consorcio_salvar_exec` (o `fn_financiamento_criar` antigo delega a ele).
SET LOCAL lock_timeout = '2s';

-- 1. Estrutura ----------------------------------------------------------------------------------------------------------------------
alter table public.financiamento_parcelas
  add column if not exists valor_fundo_comum numeric(14,2),
  add column if not exists valor_taxa_adm numeric(14,2),
  add column if not exists valor_fundo_reserva numeric(14,2),
  add column if not exists valor_seguro numeric(14,2),
  add column if not exists faixa integer,
  add column if not exists adiada boolean not null default false;
comment on column public.financiamento_parcelas.adiada is
  'FIN-CONSORCIO-02: parcela de consorcio adiada ate'' a contemplacao (vencimento nulo ate'' la''; o motor nao a lanca).';

alter table public.financiamento_consorcio
  add column if not exists tipo_bem text,
  add column if not exists regras jsonb not null default '{}'::jsonb,
  add column if not exists lance_tipo text,
  add column if not exists carta_recebida numeric(14,2);
alter table public.financiamento_consorcio drop constraint if exists financiamento_consorcio_lance_tipo_check;
alter table public.financiamento_consorcio add constraint financiamento_consorcio_lance_tipo_check
  check (lance_tipo is null or lance_tipo in ('proprio', 'embutido'));

alter table public.financiamento_parcelas_operacoes add column if not exists contrato_antes jsonb;
alter table public.financiamento_parcelas_operacoes drop constraint financiamento_parcelas_operacoes_tipo_check;
alter table public.financiamento_parcelas_operacoes add constraint financiamento_parcelas_operacoes_tipo_check
  check (tipo = any (array['editar', 'regerar', 'reajuste', 'contemplar']));

alter table public.financiamento_parcela_vinculos drop constraint financiamento_parcela_vinculos_papel_check;
alter table public.financiamento_parcela_vinculos add constraint financiamento_parcela_vinculos_papel_check
  check (papel = any (array['principal', 'juros', 'total', 'devolucao']));

-- 2. Pecas puras --------------------------------------------------------------------------------------------------------------------
create or replace function public._fn_brl(v numeric) returns text language sql immutable set search_path = pg_catalog as $$
  select translate(to_char(round(v, 2), 'FM999,999,999,990.00'), ',.', '.,')
$$;

/* o valor de um componente por parcela: % por parcela, % do contrato dividido nas parcelas, ou valor fixo — nulo se nao informado */
create or replace function public._fn_consorcio_valor(p_spec jsonb, p_carta numeric, p_n integer) returns numeric
language sql immutable set search_path = pg_catalog as $$
  select case coalesce(p_spec->>'modo', '')
    when 'pct_parcela' then round(p_carta * (p_spec->>'valor')::numeric / 100, 2)
    when 'pct_total' then case when coalesce(p_n, 0) > 0 then round(p_carta * (p_spec->>'valor')::numeric / 100 / p_n, 2) end
    when 'valor' then round((p_spec->>'valor')::numeric, 2)
  end
$$;

/* o seguro de UMA parcela sobre a base pedida (credito; credito e taxas; saldo devedor): o mesmo dono no gerador e na contemplacao */
create or replace function public._fn_consorcio_seguro_valor(p_seguro jsonb, p_base numeric) returns numeric
language sql immutable set search_path = pg_catalog as $$
  select case coalesce(p_seguro->>'modo', '')
    when 'pct_mes' then round(coalesce(p_base, 0) * coalesce(nullif(p_seguro->>'valor', '')::numeric, 0) / 100, 2)
    when 'valor' then round(coalesce(nullif(p_seguro->>'valor', '')::numeric, 0), 2)
    else 0 end
$$;

/* O GERADOR UNIVERSAL. Entrada: carta, primeira_parcela, prazo_grupo, ja_transcorridas, transcorridas (diluidas | adiadas | adesao),
   data_adesao, fundo_comum {modo auto|pct_parcela|pct_total|valor, valor}, taxa_adm {total_pct, forma igual|antecipada|manual,
   pct_parcela, primeiras, valor_parcela}, taxa_adesao_pct, fundo_reserva {modo, valor, total_pct}, seguro {modo pct_mes|valor, valor,
   base credito|credito_e_taxas|saldo_devedor, inicio primeira|contemplacao}, contemplacao_data.
   Saida: linhas (numero, vencimento — nulo na adiada —, os quatro componentes, total, adiada, faixa), faixas, totais, avisos, recusa. */
create or replace function public.fn_consorcio_cronograma(p jsonb) returns jsonb
language plpgsql immutable security definer set search_path = pg_catalog, public as $$
declare
  v_carta numeric := round(coalesce(nullif(p->>'carta', '')::numeric, 0), 2);
  v_d1 date := nullif(p->>'primeira_parcela', '')::date;
  v_prazo int := coalesce(nullif(p->>'prazo_grupo', '')::int, 0);
  v_t int := coalesce(nullif(p->>'ja_transcorridas', '')::int, 0);
  v_trat text := coalesce(nullif(p->>'transcorridas', ''), 'diluidas');
  v_fcs jsonb := coalesce(p->'fundo_comum', '{}'::jsonb);
  v_adm jsonb := coalesce(p->'taxa_adm', '{}'::jsonb);
  v_res jsonb := coalesce(p->'fundo_reserva', '{}'::jsonb);
  v_seg jsonb := coalesce(p->'seguro', '{}'::jsonb);
  v_contemp date := nullif(p->>'contemplacao_data', '')::date;
  v_n int; v_a int := 0; v_fc numeric; v_fc_a numeric; v_resto numeric; v_res_v numeric; v_adm_total numeric; v_adm_pct numeric;
  v_forma text := coalesce(nullif(v_adm->>'forma', ''), 'igual'); v_prim int; v_adm_1 numeric; v_adm_2 numeric; v_adesao numeric;
  v_lin jsonb := '[]'::jsonb; v_k int := 0; v_i int; v_venc date; v_vadm numeric; v_vfc numeric; v_vres numeric; v_vseg numeric;
  v_adiada boolean; v_avisos jsonb := '[]'::jsonb; v_m0 int; v_j int := 0; v_base numeric; v_saldo numeric;
  v_tfc numeric := 0; v_tadm numeric := 0; v_tres numeric := 0; v_tseg numeric := 0;
  v_faixas jsonb := '[]'::jsonb; e jsonb; v_chave text; v_ult text := null; v_fx int := 0; v_out jsonb := '[]'::jsonb;
begin
  if v_carta <= 0 or v_d1 is null or v_prazo < 1 or v_prazo > 600 then
    return jsonb_build_object('recusa', 'Informe a carta de crédito, a 1ª parcela e o prazo do grupo (1 a 600 meses).', 'linhas', '[]'::jsonb);
  end if;
  if v_trat not in ('diluidas', 'adiadas', 'adesao') then
    return jsonb_build_object('recusa', 'Transcorridas: diluídas, adiadas até a contemplação ou pagas na adesão.', 'linhas', '[]'::jsonb);
  end if;
  if v_t < 0 or v_t >= v_prazo then
    return jsonb_build_object('recusa', 'Parcelas já transcorridas: de 0 a uma a menos que o prazo do grupo.', 'linhas', '[]'::jsonb);
  end if;
  v_n := v_prazo - v_t;                              -- as que se pagam agora, mes a mes
  if v_trat = 'adiadas' then v_a := v_t; end if;     -- as transcorridas adiadas ate' a contemplacao

  -- fundo comum das parcelas a pagar agora: o informado; sem informar, a carta dividida (diluidas: nas que se pagam; senao: no prazo)
  v_fc := public._fn_consorcio_valor(v_fcs, v_carta, v_n);
  if v_fc is null then v_fc := round(v_carta / case when v_trat = 'diluidas' then v_n else v_prazo end, 2); end if;
  v_resto := v_carta - v_n * v_fc;                   -- o que falta do fundo comum (adiadas ou adesao)
  if v_trat = 'adiadas' and v_a > 0 then v_fc_a := round(v_resto / v_a, 2); end if;

  -- taxa de administracao
  v_adm_pct := nullif(v_adm->>'total_pct', '')::numeric;
  v_adm_total := case when v_adm_pct is not null then round(v_carta * v_adm_pct / 100, 2) end;
  if v_forma = 'antecipada' then
    v_prim := coalesce(nullif(v_adm->>'primeiras', '')::int, 0);
    if v_prim < 1 or v_prim >= v_n or nullif(v_adm->>'pct_parcela', '') is null or v_adm_pct is null then
      return jsonb_build_object('recusa', 'Taxa antecipada: informe a taxa total, o % por parcela e em quantas das primeiras (menos que as parcelas a pagar).', 'linhas', '[]'::jsonb);
    end if;
    if (v_adm->>'pct_parcela')::numeric * v_prim > v_adm_pct then
      return jsonb_build_object('recusa', 'Taxa antecipada: o % das primeiras passa da taxa total.', 'linhas', '[]'::jsonb);
    end if;
    v_adm_1 := round(v_carta * (v_adm->>'pct_parcela')::numeric / 100, 2);
    v_adm_2 := round(v_carta * (v_adm_pct - (v_adm->>'pct_parcela')::numeric * v_prim) / 100 / (v_n - v_prim), 2);
  elsif v_forma = 'manual' then
    v_adm_1 := 0; v_adm_2 := 0; v_prim := 0;
    v_avisos := v_avisos || to_jsonb('taxa de administração manual: informe a taxa em cada parcela (Parcelas, lápis).'::text);
  elsif v_forma = 'igual' then
    v_prim := 0;
    v_adm_2 := coalesce(round(nullif(v_adm->>'valor_parcela', '')::numeric, 2),
                        case when nullif(v_adm->>'pct_parcela', '') is not null then round(v_carta * (v_adm->>'pct_parcela')::numeric / 100, 2) end,
                        case when v_adm_pct is not null then round(v_carta * v_adm_pct / 100 / v_n, 2) end, 0);
    v_adm_1 := v_adm_2;
  else
    return jsonb_build_object('recusa', 'Cobrança da taxa: igual em todas, antecipada ou manual.', 'linhas', '[]'::jsonb);
  end if;
  v_adesao := case when nullif(p->>'taxa_adesao_pct', '') is not null then round(v_carta * (p->>'taxa_adesao_pct')::numeric / 100, 2) else 0 end;

  -- fundo de reserva: em todas as parcelas (as a pagar e as adiadas)
  v_res_v := coalesce(public._fn_consorcio_valor(v_res, v_carta, v_n + v_a), 0);

  -- as linhas: a adesao (se for o caso), as a pagar, as adiadas
  if v_trat = 'adesao' and v_t > 0 then
    v_k := v_k + 1;
    v_lin := v_lin || jsonb_build_object('numero', v_k, 'vencimento', coalesce(nullif(p->>'data_adesao', '')::date, (v_d1 - interval '1 month')::date),
      'fundo_comum', round(v_resto, 2), 'taxa_adm', 0, 'fundo_reserva', 0, 'seguro', 0, 'adiada', false, 'adesao', true);
  end if;
  for v_i in 1..v_n loop
    v_k := v_k + 1;
    v_vadm := case when v_i <= v_prim then v_adm_1 else v_adm_2 end + case when v_i = 1 then v_adesao else 0 end;
    v_lin := v_lin || jsonb_build_object('numero', v_k, 'vencimento', (v_d1 + make_interval(months => v_i - 1))::date,
      'fundo_comum', v_fc, 'taxa_adm', v_vadm, 'fundo_reserva', v_res_v, 'seguro', 0, 'adiada', false);
  end loop;
  if v_contemp is not null then
    v_m0 := (extract(year from v_contemp)::int * 12 + extract(month from v_contemp)::int + 1) - (extract(year from v_d1)::int * 12 + extract(month from v_d1)::int);
  end if;
  for v_i in 1..v_a loop
    v_k := v_k + 1;
    v_venc := case when v_contemp is not null then (v_d1 + make_interval(months => v_m0 + v_i - 1))::date end;
    v_lin := v_lin || jsonb_build_object('numero', v_k, 'vencimento', v_venc, 'fundo_comum', v_fc_a, 'taxa_adm', 0, 'fundo_reserva', v_res_v,
      'seguro', 0, 'adiada', true);
  end loop;

  -- o seguro (precisa do saldo devedor: fundo comum + taxa desta parcela em diante)
  v_saldo := (select coalesce(sum((x->>'fundo_comum')::numeric + (x->>'taxa_adm')::numeric), 0) from jsonb_array_elements(v_lin) x);
  for e in select * from jsonb_array_elements(v_lin) loop
    v_venc := nullif(e->>'vencimento', '')::date;
    v_base := case coalesce(v_seg->>'base', 'credito_e_taxas') when 'credito' then v_carta
                when 'saldo_devedor' then v_saldo else v_carta + coalesce(v_adm_total, 0) end;
    v_vseg := case when coalesce(v_seg->>'inicio', 'primeira') = 'contemplacao'
                    and (v_contemp is null or v_venc is null or v_venc < date_trunc('month', v_contemp)::date) then 0
                   else public._fn_consorcio_seguro_valor(v_seg, v_base) end;
    v_saldo := v_saldo - (e->>'fundo_comum')::numeric - (e->>'taxa_adm')::numeric;
    v_vfc := (e->>'fundo_comum')::numeric; v_vadm := (e->>'taxa_adm')::numeric; v_vres := (e->>'fundo_reserva')::numeric;
    v_adiada := (e->>'adiada')::boolean;
    -- a faixa: parcelas seguidas com os mesmos componentes
    v_chave := concat_ws('|', v_vfc, v_vadm, v_vres, v_vseg, v_adiada);
    if v_chave is distinct from v_ult then v_fx := v_fx + 1; v_ult := v_chave; end if;
    v_out := v_out || (e || jsonb_build_object('seguro', v_vseg, 'total', v_vfc + v_vadm + v_vres + v_vseg, 'faixa', v_fx));
    v_tfc := v_tfc + v_vfc; v_tadm := v_tadm + v_vadm; v_tres := v_tres + v_vres; v_tseg := v_tseg + v_vseg;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('faixa', g.faixa, 'de', g.de, 'ate', g.ate, 'parcelas', g.n, 'adiada', g.adiada,
           'fundo_comum', g.fc, 'taxa_adm', g.adm, 'fundo_reserva', g.res, 'seguro', g.seg, 'total', g.fc + g.adm + g.res + g.seg) order by g.faixa), '[]'::jsonb)
    into v_faixas
    from (select (x->>'faixa')::int faixa, min((x->>'numero')::int) de, max((x->>'numero')::int) ate, count(*) n, bool_and((x->>'adiada')::boolean) adiada,
                 min((x->>'fundo_comum')::numeric) fc, min((x->>'taxa_adm')::numeric) adm, min((x->>'fundo_reserva')::numeric) res, min((x->>'seguro')::numeric) seg
            from jsonb_array_elements(v_out) x group by 1) g;

  -- o que nao fecha vira AVISO (nunca correcao)
  if v_tfc <> v_carta then
    v_avisos := v_avisos || to_jsonb(format('fundo comum: %s nas parcelas x %s da carta (%s%s, arredondamento)', public._fn_brl(v_tfc),
      public._fn_brl(v_carta), case when v_tfc > v_carta then '+' else '−' end, public._fn_brl(abs(v_tfc - v_carta))));
  end if;
  if v_adm_total is not null and v_forma <> 'manual' and (v_tadm - v_adesao) <> v_adm_total then
    v_avisos := v_avisos || to_jsonb(format('taxa de administração: %s nas parcelas x %s pelo %% total', public._fn_brl(v_tadm - v_adesao), public._fn_brl(v_adm_total)));
  end if;
  if nullif(v_res->>'total_pct', '') is not null and coalesce(v_res->>'modo', '') <> 'pct_total'
     and v_tres <> round(v_carta * (v_res->>'total_pct')::numeric / 100, 2) then
    v_avisos := v_avisos || to_jsonb(format('reserva: %s pelo %% por parcela x %s pelo %% total', public._fn_brl(v_tres),
      public._fn_brl(round(v_carta * (v_res->>'total_pct')::numeric / 100, 2))));
  end if;

  return jsonb_build_object('linhas', v_out, 'faixas', v_faixas, 'parcelas', v_k, 'a_pagar_agora', v_n, 'adiadas', v_a,
    'totais', jsonb_build_object('fundo_comum', v_tfc, 'taxa_adm', v_tadm, 'fundo_reserva', v_tres, 'seguro', v_tseg,
      'total', v_tfc + v_tadm + v_tres + v_tseg),
    'vencimento_final', (select max(nullif(x->>'vencimento', '')::date) from jsonb_array_elements(v_out) x),
    'avisos', v_avisos, 'recusa', null);
end $$;

-- 3. Pecas do contrato --------------------------------------------------------------------------------------------------------------
/* a entrada do gerador a partir do que o contrato guarda */
create or replace function public._fn_consorcio_regras_do_contrato(p_fin uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select c.regras || jsonb_build_object('carta', f.valor_total, 'primeira_parcela', f.data_primeira_parcela,
           'contemplacao_data', case when c.contemplado then c.data_contemplacao end)
    from public.financiamentos f join public.financiamento_consorcio c on c.financiamento_id = f.id where f.id = p_fin
$$;

/* a faixa das parcelas vivas: seguidas (pelo numero) com os mesmos componentes */
create or replace function public._fn_consorcio_faixas(p_fin uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare q record; v_ult text := null; v_fx int := 0; v_ch text;
begin
  for q in select id, valor_fundo_comum, valor_taxa_adm, valor_fundo_reserva, valor_seguro, adiada from public.financiamento_parcelas
            where financiamento_id = p_fin and coalesce(status, '') <> 'cancelado' order by numero_parcela, id loop
    v_ch := concat_ws('|', q.valor_fundo_comum, q.valor_taxa_adm, q.valor_fundo_reserva, q.valor_seguro, q.adiada);
    if v_ch is distinct from v_ult then v_fx := v_fx + 1; v_ult := v_ch; end if;
    update public.financiamento_parcelas set faixa = v_fx where id = q.id and faixa is distinct from v_fx;
  end loop;
end $$;

/* a foto do contrato (o que o reajuste e a contemplacao mudam fora das parcelas) e a volta dela */
create or replace function public._fn_consorcio_contrato_foto(p_fin uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('valor_total', f.valor_total, 'consorcio', to_jsonb(c) - 'created_at')
    from public.financiamentos f join public.financiamento_consorcio c on c.financiamento_id = f.id where f.id = p_fin
$$;
create or replace function public._fn_consorcio_contrato_restaurar(p_fin uuid, p_antes jsonb) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare c jsonb := p_antes->'consorcio'; q record; v_l uuid;
begin
  update public.financiamentos set valor_total = (p_antes->>'valor_total')::numeric, updated_at = now() where id = p_fin;
  update public.financiamento_consorcio set regras = c->'regras', contemplado = (c->>'contemplado')::boolean,
         data_contemplacao = nullif(c->>'data_contemplacao', '')::date, forma_contemplacao = nullif(c->>'forma_contemplacao', ''),
         lance_tipo = nullif(c->>'lance_tipo', ''), lance_valor = nullif(c->>'lance_valor', '')::numeric,
         carta_recebida = nullif(c->>'carta_recebida', '')::numeric
   where financiamento_id = p_fin;
  -- a parcela que voltou a ficar SEM vencimento (desfazer a contemplacao) perde os lancamentos em aberto (o motor pula a adiada)
  for q in select x.id, x.lancamento_id, x.lancamento_juros_id from public.financiamento_parcelas x
            where x.financiamento_id = p_fin and x.data_vencimento is null and (x.lancamento_id is not null or x.lancamento_juros_id is not null) loop
    foreach v_l in array array_remove(array[q.lancamento_id, q.lancamento_juros_id], null) loop
      if exists (select 1 from public.financeiro_lancamentos_v2 l where l.id = v_l and not coalesce(l.cancelado, false)) then
        perform public.fn_cancelar_lancamento_auditoria(v_l, 'desfeita a contemplação do consórcio');
      end if;
    end loop;
    update public.financiamento_parcelas set lancamento_id = null, lancamento_juros_id = null, updated_at = now() where id = q.id;
  end loop;
end $$;

/* grava as linhas do gerador numa parcela (nova ou existente): o principal e os juros saem dos componentes */
create or replace function public._fn_consorcio_parcela_gravar(p_fin uuid, p_cliente uuid, p_id uuid, x jsonb, p_venc date) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_p numeric := (x->>'fundo_comum')::numeric + (x->>'fundo_reserva')::numeric;
        v_j numeric := (x->>'taxa_adm')::numeric + (x->>'seguro')::numeric; v_id uuid := p_id;
        v_tipo text := case when v_p = 0 then 'juros_carencia' when v_j = 0 then 'amortizacao' else 'mista' end;
begin
  if v_id is null then
    insert into public.financiamento_parcelas (cliente_id, financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros,
      valor_total, valor_fundo_comum, valor_taxa_adm, valor_fundo_reserva, valor_seguro, faixa, adiada, status, tipo, ajustada)
    values (p_cliente, p_fin, (x->>'numero')::int, p_venc, v_p, v_j, v_p + v_j, (x->>'fundo_comum')::numeric, (x->>'taxa_adm')::numeric,
      (x->>'fundo_reserva')::numeric, (x->>'seguro')::numeric, (x->>'faixa')::int, (x->>'adiada')::boolean, 'pendente', v_tipo, false)
    returning id into v_id;
  else
    update public.financiamento_parcelas set data_vencimento = p_venc, valor_principal = v_p, valor_juros = v_j, valor_total = v_p + v_j,
           valor_fundo_comum = (x->>'fundo_comum')::numeric, valor_taxa_adm = (x->>'taxa_adm')::numeric,
           valor_fundo_reserva = (x->>'fundo_reserva')::numeric, valor_seguro = (x->>'seguro')::numeric, faixa = (x->>'faixa')::int,
           adiada = (x->>'adiada')::boolean, tipo = v_tipo, ajustada = false, updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end $$;

-- 4. O escritor do consorcio (criar e editar o cabecalho) ---------------------------------------------------------------------------
create or replace function public._fn_consorcio_salvar_exec(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  f public.financiamentos%rowtype; c public.financiamento_consorcio%rowtype; v_cli uuid; v_ativ text; v_falta text[] := '{}';
  v_regras jsonb; v_cron jsonb; x jsonb; v_fin uuid; v_plano_p uuid; v_plano_j uuid; v_fecho jsonb; v_mudou boolean := false;
begin
  if p_id is not null then
    f := public._fn_contrato_do_usuario(p_id);
    if f.natureza <> 'consorcio' then raise exception using errcode = 'P0001', message = 'Este contrato não é consórcio.'; end if;
    if coalesce(f.status, '') not in ('ativo', 'prorrogado') then
      raise exception using errcode = 'P0001', message = format('Consórcio %s: o cadastro não muda mais.', f.status);
    end if;
    v_cli := f.cliente_id;
    select * into c from public.financiamento_consorcio where financiamento_id = p_id for update;
  else
    v_cli := nullif(p->>'cliente_id', '')::uuid;
    if v_cli is null or not coalesce(public.tenant_ok(v_cli), false) then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  end if;

  v_ativ := coalesce(nullif(p->>'atividade', ''), f.tipo_financiamento, 'pecuaria');
  if v_ativ not in ('pecuaria', 'agricultura') then raise exception using errcode = 'P0001', message = 'Escolha a atividade: pecuária ou agricultura.'; end if;
  v_regras := case when p ? 'regras' then coalesce(p->'regras', '{}'::jsonb) - 'reajustes' || jsonb_build_object('reajustes', coalesce(c.regras->'reajustes', '[]'::jsonb))
                   else c.regras end;
  if p_id is null then
    if nullif(btrim(coalesce(p->>'descricao', '')), '') is null then v_falta := array_append(v_falta, 'descrição'::text); end if;
    if nullif(p->>'credor_id', '') is null then v_falta := array_append(v_falta, 'administradora'::text); end if;
    if nullif(p->>'conta_bancaria_id', '') is null then v_falta := array_append(v_falta, 'conta de pagamento'::text); end if;
    if nullif(p->>'fazenda_id', '') is null then v_falta := array_append(v_falta, 'fazenda'::text); end if;
    if coalesce(array_length(v_falta, 1), 0) > 0 then raise exception using errcode = 'P0001', message = 'Falta: ' || array_to_string(v_falta, ', ') || '.'; end if;
  end if;
  -- os cadastros pedidos sao do cliente
  if (p ? 'credor_id' and not exists (select 1 from public.financeiro_fornecedores w where w.id = nullif(p->>'credor_id', '')::uuid and w.cliente_id = v_cli))
     or (p ? 'conta_bancaria_id' and not exists (select 1 from public.financeiro_contas_bancarias w where w.id = nullif(p->>'conta_bancaria_id', '')::uuid and w.cliente_id = v_cli))
     or (p ? 'fazenda_id' and not exists (select 1 from public.fazendas w where w.id = nullif(p->>'fazenda_id', '')::uuid and w.cliente_id = v_cli)) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  -- os planos: fundo comum + reserva sempre em "Consorcio a contemplar"; taxas e seguro no escolhido (padrao: juros de financiamento da atividade)
  select id into v_plano_p from public.financeiro_plano_contas where cliente_id is null and subcentro = 'Consórcio a contemplar' and ativo;
  v_plano_j := coalesce(nullif(p->>'plano_juros_id', '')::uuid, f.plano_juros_id,
    (select id from public.financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '2-Saídas'
       and subcentro = case v_ativ when 'agricultura' then 'Juros de Financiamento Agricultura' else 'Juros de Financiamento Pecuária' end));
  if v_plano_p is null or v_plano_j is null
     or not exists (select 1 from public.financeiro_plano_contas w where w.id = v_plano_j and w.ativo and (w.cliente_id is null or w.cliente_id = v_cli)) then
    raise exception using errcode = 'P0001', message = 'Plano de contas das taxas e do seguro não é deste cliente.';
  end if;

  v_cron := public.fn_consorcio_cronograma(v_regras);
  if v_cron->>'recusa' is not null then raise exception using errcode = 'P0001', message = v_cron->>'recusa'; end if;

  if p_id is null then
    insert into public.financiamentos (cliente_id, natureza, status, descricao, credor_id, numero_contrato, data_contrato, data_inicio, valor_total,
      fazenda_id, conta_bancaria_id, plano_principal_id, plano_juros_id, observacao, periodicidade, total_parcelas, data_primeira_parcela,
      vencimento_final, tipo_financiamento, taxa_juros, taxa_juros_mensal, created_by)
    values (v_cli, 'consorcio', 'ativo', btrim(p->>'descricao'), (p->>'credor_id')::uuid,
      nullif(concat_ws(' / ', nullif(btrim(coalesce(p->>'grupo', '')), ''), nullif(btrim(coalesce(p->>'cota', '')), '')), ''),
      coalesce(nullif(p->>'data_adesao', '')::date, (v_regras->>'primeira_parcela')::date),
      coalesce(nullif(p->>'data_adesao', '')::date, (v_regras->>'primeira_parcela')::date),
      round((v_regras->>'carta')::numeric, 2), (p->>'fazenda_id')::uuid, (p->>'conta_bancaria_id')::uuid, v_plano_p, v_plano_j,
      nullif(btrim(coalesce(p->>'observacao', '')), ''), 'mensal', (v_cron->>'parcelas')::int, (v_regras->>'primeira_parcela')::date,
      (v_cron->>'vencimento_final')::date, v_ativ, 0, 0, auth.uid())
    returning id into v_fin;
    insert into public.financiamento_consorcio (financiamento_id, cliente_id, grupo, cota, tipo_bem, regras, taxa_adm_pct, fundo_reserva_pct,
      seguro_pct_mes, reajuste, contemplado)
    values (v_fin, v_cli, nullif(btrim(coalesce(p->>'grupo', '')), ''), nullif(btrim(coalesce(p->>'cota', '')), ''), nullif(btrim(coalesce(p->>'tipo_bem', '')), ''),
      v_regras || jsonb_build_object('reajustes', '[]'::jsonb), coalesce(nullif(v_regras->'taxa_adm'->>'total_pct', '')::numeric, 0),
      coalesce(nullif(v_regras->'fundo_reserva'->>'total_pct', '')::numeric, 0),
      case when v_regras->'seguro'->>'modo' = 'pct_mes' then coalesce(nullif(v_regras->'seguro'->>'valor', '')::numeric, 0) else 0 end,
      nullif(v_regras->'reajuste'->>'indice', ''), false);
    for x in select * from jsonb_array_elements(v_cron->'linhas') loop
      perform public._fn_consorcio_parcela_gravar(v_fin, v_cli, null, x, nullif(x->>'vencimento', '')::date);
    end loop;
  else
    v_fin := p_id;
    v_mudou := v_regras is distinct from c.regras;
    update public.financiamentos set
      descricao = case when p ? 'descricao' then coalesce(nullif(btrim(p->>'descricao'), ''), descricao) else descricao end,
      credor_id = case when p ? 'credor_id' then (p->>'credor_id')::uuid else credor_id end,
      fazenda_id = case when p ? 'fazenda_id' then (p->>'fazenda_id')::uuid else fazenda_id end,
      conta_bancaria_id = case when p ? 'conta_bancaria_id' then (p->>'conta_bancaria_id')::uuid else conta_bancaria_id end,
      plano_principal_id = v_plano_p, plano_juros_id = v_plano_j, tipo_financiamento = v_ativ,
      observacao = case when p ? 'observacao' then nullif(btrim(coalesce(p->>'observacao', '')), '') else observacao end,
      numero_contrato = case when p ? 'grupo' or p ? 'cota' then nullif(concat_ws(' / ',
        nullif(btrim(coalesce(case when p ? 'grupo' then p->>'grupo' else c.grupo end, '')), ''),
        nullif(btrim(coalesce(case when p ? 'cota' then p->>'cota' else c.cota end, '')), '')), '') else numero_contrato end,
      valor_total = round((v_regras->>'carta')::numeric, 2), data_primeira_parcela = (v_regras->>'primeira_parcela')::date, updated_at = now()
     where id = p_id;
    update public.financiamento_consorcio set
      grupo = case when p ? 'grupo' then nullif(btrim(coalesce(p->>'grupo', '')), '') else grupo end,
      cota = case when p ? 'cota' then nullif(btrim(coalesce(p->>'cota', '')), '') else cota end,
      tipo_bem = case when p ? 'tipo_bem' then nullif(btrim(coalesce(p->>'tipo_bem', '')), '') else tipo_bem end,
      regras = v_regras
     where financiamento_id = p_id;
  end if;
  -- numero na ordem do vencimento (as adiadas no fim), total e vencimento final, e o MOTOR nas vivas (o de sempre)
  v_fecho := public._fn_parcelas_credito_fechar(v_fin);
  perform public._fn_consorcio_faixas(v_fin);
  return jsonb_build_object('financiamento_id', v_fin, 'cronograma', v_cron - 'linhas', 'cronograma_mudou', v_mudou, 'fecho', v_fecho,
    'lancamentos', (select count(*) from public.financeiro_lancamentos_v2 l where l.financiamento_id = v_fin and not coalesce(l.cancelado, false)));
end $$;

/* o cadastro antigo (FIN-FINANC-28 passo 7) manda as chaves dele: traduzidas para as regras, e o escritor e' um so' */
create or replace function public._fn_consorcio_do_cadastro(p jsonb) returns jsonb
language sql immutable set search_path = pg_catalog as $$
  select p || jsonb_build_object('data_adesao', p->>'data_contrato', 'regras', jsonb_build_object(
    'carta', p->'valor_total', 'primeira_parcela', p->>'primeiro_vencimento', 'prazo_grupo', p->'prazo', 'ja_transcorridas', 0,
    'transcorridas', 'diluidas', 'fundo_comum', jsonb_build_object('modo', 'auto'),
    'taxa_adm', jsonb_build_object('total_pct', coalesce(nullif(p->>'taxa_adm_pct', ''), '0'), 'forma', 'igual'),
    'fundo_reserva', jsonb_build_object('modo', 'pct_total', 'valor', coalesce(nullif(p->>'fundo_reserva_pct', ''), '0')),
    'seguro', jsonb_build_object('modo', 'pct_mes', 'valor', coalesce(nullif(p->>'seguro_pct_mes', ''), '0'), 'base', 'credito', 'inicio', 'primeira'),
    'reajuste', jsonb_build_object('indice', coalesce(nullif(p->>'reajuste', ''), 'nenhum'))))
$$;

-- 5. Parcelas: editar (consorcio), regerar (consorcio), reajuste, contemplacao, devolucao -------------------------------------------
create or replace function public._fn_consorcio_parcelas_editar_exec(p_id uuid, m jsonb, p_antes jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare x jsonb; q public.financiamento_parcelas%rowtype; v_trava text; v_d date; v_fc numeric; v_adm numeric; v_res numeric; v_seg numeric;
        v_alt int := 0; v_fecho jsonb; v_op uuid;
begin
  if coalesce(jsonb_array_length(m->'acrescentar'), 0) + coalesce(jsonb_array_length(m->'retirar'), 0) > 0 then
    raise exception using errcode = 'P0001', message = 'Consórcio: as parcelas não se acrescentam nem se retiram; use Regerar em aberto.';
  end if;
  if coalesce(jsonb_array_length(m->'alterar'), 0) = 0 then raise exception using errcode = 'P0001', message = 'Nenhuma mudança nas parcelas.'; end if;
  for x in select * from jsonb_array_elements(m->'alterar') loop
    select * into q from public.financiamento_parcelas where id = (x->>'id')::uuid and financiamento_id = p_id and coalesce(status, '') <> 'cancelado';
    if not found then raise exception using errcode = 'P0001', message = 'Parcela não pertence a este contrato.'; end if;
    v_trava := public._fn_parcela_credito_trava(q.id);
    if v_trava is not null then raise exception using errcode = 'P0001', message = v_trava; end if;
    v_d := case when x ? 'data_vencimento' then nullif(x->>'data_vencimento', '')::date else q.data_vencimento end;
    v_fc := round(coalesce(nullif(x->>'valor_fundo_comum', '')::numeric, q.valor_fundo_comum, 0), 2);
    v_adm := round(coalesce(nullif(x->>'valor_taxa_adm', '')::numeric, q.valor_taxa_adm, 0), 2);
    v_res := round(coalesce(nullif(x->>'valor_fundo_reserva', '')::numeric, q.valor_fundo_reserva, 0), 2);
    v_seg := round(coalesce(nullif(x->>'valor_seguro', '')::numeric, q.valor_seguro, 0), 2);
    if (v_d is null and not q.adiada) or least(v_fc, v_adm, v_res, v_seg) < 0 or v_fc + v_adm + v_res + v_seg = 0 then
      raise exception using errcode = 'P0001', message = format('Parcela %s: informe o vencimento e ao menos um componente (nenhum negativo).', q.numero_parcela);
    end if;
    update public.financiamento_parcelas set data_vencimento = v_d, valor_fundo_comum = v_fc, valor_taxa_adm = v_adm, valor_fundo_reserva = v_res,
           valor_seguro = v_seg, valor_principal = v_fc + v_res, valor_juros = v_adm + v_seg, valor_total = v_fc + v_adm + v_res + v_seg,
           ajustada = true, updated_at = now() where id = q.id;
    v_alt := v_alt + 1;
  end loop;
  v_fecho := public._fn_parcelas_credito_fechar(p_id);
  perform public._fn_consorcio_faixas(p_id);
  v_op := public._fn_parcelas_operacao_registrar(p_id, 'editar', null, p_antes);
  return jsonb_build_object('operacao_id', v_op, 'alteradas', v_alt, 'acrescentadas', 0, 'retiradas', 0, 'fecho', v_fecho,
    'antes', p_antes, 'depois', public._fn_parcelas_foto(p_id), 'diferenca_do_saldo', null);
end $$;

/* Regerar em aberto: as linhas do gerador ocupam as parcelas que nao ficam, na ordem, separadas em "a pagar" e "adiadas"; fica a paga,
   a travada e (manter_ajustes) a ajustada. A adiada ja' datada pela contemplacao guarda o vencimento dela. */
create or replace function public._fn_consorcio_regerar_exec(p_id uuid, p_modo text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  f public.financiamentos%rowtype; v_antes jsonb; v_cron jsonb; v_grupo boolean; v_ids uuid[]; v_lin jsonb[]; v_i int; q record; x jsonb;
  v_mantidas int := 0; v_trocadas int := 0; v_novas int := 0; v_retiradas int := 0; v_fecho jsonb; v_op uuid; v_venc date;
begin
  select * into f from public.financiamentos where id = p_id;
  v_antes := public._fn_parcelas_foto(p_id);
  v_cron := public.fn_consorcio_cronograma(public._fn_consorcio_regras_do_contrato(p_id));
  if v_cron->>'recusa' is not null then raise exception using errcode = 'P0001', message = v_cron->>'recusa'; end if;
  foreach v_grupo in array array[false, true] loop
    -- as linhas do gerador deste grupo, na ordem, MENOS a posicao das que ficam
    select coalesce(array_agg(x2.id order by x2.numero_parcela, x2.id), '{}') into v_ids from public.financiamento_parcelas x2
     where x2.financiamento_id = p_id and coalesce(x2.status, '') <> 'cancelado' and x2.adiada = v_grupo;
    select coalesce(array_agg(e order by (e->>'numero')::int), '{}') into v_lin from jsonb_array_elements(v_cron->'linhas') e
     where (e->>'adiada')::boolean = v_grupo;
    v_i := 0;
    for q in select x2.* from public.financiamento_parcelas x2 where x2.id = any(v_ids) order by x2.numero_parcela, x2.id loop
      v_i := v_i + 1;
      if public._fn_parcela_credito_trava(q.id) is not null or (p_modo = 'manter_ajustes' and q.ajustada) then
        v_mantidas := v_mantidas + 1;
      elsif v_i <= coalesce(array_length(v_lin, 1), 0) then
        v_venc := case when v_grupo and q.data_vencimento is not null then q.data_vencimento else nullif(v_lin[v_i]->>'vencimento', '')::date end;
        perform public._fn_consorcio_parcela_gravar(p_id, f.cliente_id, q.id, v_lin[v_i], v_venc);
        v_trocadas := v_trocadas + 1;
      else
        perform public._fn_parcela_credito_retirar(q.id, 'parcela retirada ao regerar o consórcio');
        v_retiradas := v_retiradas + 1;
      end if;
    end loop;
    while v_i < coalesce(array_length(v_lin, 1), 0) loop
      v_i := v_i + 1;
      perform public._fn_consorcio_parcela_gravar(p_id, f.cliente_id, null, v_lin[v_i] || jsonb_build_object('numero', 9000 + v_i), nullif(v_lin[v_i]->>'vencimento', '')::date);
      v_novas := v_novas + 1;
    end loop;
  end loop;
  if v_trocadas + v_novas + v_retiradas = 0 then raise exception using errcode = 'P0001', message = 'Nenhuma parcela em aberto para regerar.'; end if;
  v_fecho := public._fn_parcelas_credito_fechar(p_id);
  perform public._fn_consorcio_faixas(p_id);
  v_op := public._fn_parcelas_operacao_registrar(p_id, 'regerar', p_modo, v_antes);
  return jsonb_build_object('operacao_id', v_op, 'modo', p_modo, 'base', jsonb_build_object('mantidas', v_mantidas, 'trocadas', v_trocadas,
      'novas', v_novas, 'retiradas', v_retiradas), 'cronograma', v_cron - 'linhas', 'fecho', v_fecho, 'antes', v_antes,
    'depois', public._fn_parcelas_foto(p_id), 'diferenca_do_saldo', null);
end $$;

create or replace function public._fn_consorcio_reajustar_exec(p_id uuid, p_pct numeric, p_a_partir_de date, p_indice text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  f public.financiamentos%rowtype; c public.financiamento_consorcio%rowtype; v_teto numeric; v_ap numeric; v_antes jsonb; v_cantes jsonb;
  q record; v_n int := 0; v_fat numeric; v_carta numeric; v_fecho jsonb; v_op uuid; v_fc numeric; v_adm numeric; v_res numeric; v_seg numeric;
begin
  f := public._fn_contrato_credito_vigente(p_id);
  if f.natureza <> 'consorcio' then raise exception using errcode = 'P0001', message = 'Reajuste é do consórcio.'; end if;
  perform 1 from public.financiamentos where id = p_id for update;
  select * into c from public.financiamento_consorcio where financiamento_id = p_id for update;
  if p_pct is null or p_pct <= -100 then raise exception using errcode = 'P0001', message = 'Informe o % do índice.'; end if;
  if p_a_partir_de is null then raise exception using errcode = 'P0001', message = 'Informe a partir de quando o reajuste vale.'; end if;
  v_teto := nullif(c.regras->'reajuste'->>'teto_pct', '')::numeric;
  v_ap := case when v_teto is not null and p_pct > v_teto then v_teto else p_pct end;
  v_fat := 1 + v_ap / 100;
  v_antes := public._fn_parcelas_foto(p_id); v_cantes := public._fn_consorcio_contrato_foto(p_id);
  for q in select x.* from public.financiamento_parcelas x where x.financiamento_id = p_id and coalesce(x.status, '') <> 'cancelado'
            and (x.data_vencimento >= p_a_partir_de or (x.adiada and x.data_vencimento is null)) order by x.numero_parcela loop
    if public._fn_parcela_credito_trava(q.id) is null then
      v_fc := round(coalesce(q.valor_fundo_comum, 0) * v_fat, 2); v_adm := round(coalesce(q.valor_taxa_adm, 0) * v_fat, 2);
      v_res := round(coalesce(q.valor_fundo_reserva, 0) * v_fat, 2); v_seg := round(coalesce(q.valor_seguro, 0) * v_fat, 2);
      update public.financiamento_parcelas set valor_fundo_comum = v_fc, valor_taxa_adm = v_adm, valor_fundo_reserva = v_res, valor_seguro = v_seg,
             valor_principal = v_fc + v_res, valor_juros = v_adm + v_seg, valor_total = v_fc + v_adm + v_res + v_seg, updated_at = now() where id = q.id;
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then
    raise exception using errcode = 'P0001', message = format('Nenhuma parcela em aberto a partir de %s.', to_char(p_a_partir_de, 'DD/MM/YYYY'));
  end if;
  v_carta := round(f.valor_total * v_fat, 2);
  update public.financiamentos set valor_total = v_carta, updated_at = now() where id = p_id;
  update public.financiamento_consorcio set regras = jsonb_set(regras, '{carta}', to_jsonb(v_carta))
           || jsonb_build_object('reajustes', coalesce(regras->'reajustes', '[]'::jsonb) || jsonb_build_object('em', now(), 'indice',
             coalesce(nullif(p_indice, ''), regras->'reajuste'->>'indice'), 'pct_informado', p_pct, 'pct_aplicado', v_ap, 'a_partir_de', p_a_partir_de,
             'carta_antes', f.valor_total, 'carta_depois', v_carta))
   where financiamento_id = p_id;
  v_fecho := public._fn_parcelas_credito_fechar(p_id);
  perform public._fn_consorcio_faixas(p_id);
  v_op := public._fn_parcelas_operacao_registrar(p_id, 'reajuste', null, v_antes);
  update public.financiamento_parcelas_operacoes set contrato_antes = v_cantes where id = v_op;
  return jsonb_build_object('operacao_id', v_op, 'pct_informado', p_pct, 'pct_aplicado', v_ap, 'limitado_pelo_teto', v_ap <> p_pct,
    'parcelas', v_n, 'carta_antes', f.valor_total, 'carta_depois', v_carta, 'fecho', v_fecho, 'antes', v_antes, 'depois', public._fn_parcelas_foto(p_id));
end $$;

create or replace function public._fn_consorcio_contemplar_exec(p_id uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  f public.financiamentos%rowtype; c public.financiamento_consorcio%rowtype; v_data date := nullif(d->>'data', '')::date;
  v_forma text := nullif(d->>'forma', ''); v_lt text := nullif(d->>'lance_tipo', ''); v_antes jsonb; v_cantes jsonb; v_m0 int; v_j int := 0;
  q record; v_seg jsonb; v_base numeric; v_saldo numeric; v_s numeric; v_nseg int := 0; v_fecho jsonb; v_op uuid; v_adm_total numeric;
begin
  f := public._fn_contrato_credito_vigente(p_id);
  if f.natureza <> 'consorcio' then raise exception using errcode = 'P0001', message = 'Contemplação é do consórcio.'; end if;
  perform 1 from public.financiamentos where id = p_id for update;
  select * into c from public.financiamento_consorcio where financiamento_id = p_id for update;
  if c.contemplado then raise exception using errcode = 'P0001', message = format('Já contemplado em %s.', to_char(c.data_contemplacao, 'DD/MM/YYYY')); end if;
  if v_data is null then raise exception using errcode = 'P0001', message = 'Informe a data da contemplação.'; end if;
  if v_forma is null or v_forma not in ('sorteio', 'lance') then raise exception using errcode = 'P0001', message = 'Forma: sorteio ou lance.'; end if;
  if v_forma = 'lance' and (v_lt is null or v_lt not in ('proprio', 'embutido')) then
    raise exception using errcode = 'P0001', message = 'Lance: próprio ou embutido.';
  end if;
  v_antes := public._fn_parcelas_foto(p_id); v_cantes := public._fn_consorcio_contrato_foto(p_id);
  -- as adiadas ganham vencimento mensal a partir do mes seguinte a' contemplacao (o dia da 1a parcela)
  v_m0 := (extract(year from v_data)::int * 12 + extract(month from v_data)::int + 1)
        - (extract(year from f.data_primeira_parcela)::int * 12 + extract(month from f.data_primeira_parcela)::int);
  for q in select x.id from public.financiamento_parcelas x where x.financiamento_id = p_id and coalesce(x.status, '') <> 'cancelado'
            and x.adiada and x.data_vencimento is null order by x.numero_parcela, x.id loop
    update public.financiamento_parcelas set data_vencimento = (f.data_primeira_parcela + make_interval(months => v_m0 + v_j))::date, updated_at = now()
     where id = q.id;
    v_j := v_j + 1;
  end loop;
  -- o seguro que comeca na contemplacao passa a entrar nas parcelas em aberto daqui em diante
  v_seg := c.regras->'seguro';
  if coalesce(v_seg->>'inicio', 'primeira') = 'contemplacao' and coalesce(v_seg->>'modo', '') in ('pct_mes', 'valor') then
    v_adm_total := round(f.valor_total * coalesce(nullif(c.regras->'taxa_adm'->>'total_pct', '')::numeric, 0) / 100, 2);
    select coalesce(sum(coalesce(x.valor_fundo_comum, 0) + coalesce(x.valor_taxa_adm, 0)), 0) into v_saldo from public.financiamento_parcelas x
     where x.financiamento_id = p_id and coalesce(x.status, '') <> 'cancelado' and x.data_vencimento >= date_trunc('month', v_data)::date;
    for q in select x.* from public.financiamento_parcelas x where x.financiamento_id = p_id and coalesce(x.status, '') <> 'cancelado'
              and x.data_vencimento >= date_trunc('month', v_data)::date order by x.data_vencimento, x.numero_parcela loop
      v_base := case coalesce(v_seg->>'base', 'credito_e_taxas') when 'credito' then f.valor_total when 'saldo_devedor' then v_saldo
                  else f.valor_total + v_adm_total end;
      if public._fn_parcela_credito_trava(q.id) is null then
        v_s := public._fn_consorcio_seguro_valor(v_seg, v_base);
        update public.financiamento_parcelas set valor_seguro = v_s, valor_juros = coalesce(valor_taxa_adm, 0) + v_s,
               valor_total = coalesce(valor_fundo_comum, 0) + coalesce(valor_taxa_adm, 0) + coalesce(valor_fundo_reserva, 0) + v_s, updated_at = now()
         where id = q.id;
        v_nseg := v_nseg + 1;
      end if;
      v_saldo := v_saldo - coalesce(q.valor_fundo_comum, 0) - coalesce(q.valor_taxa_adm, 0);
    end loop;
  end if;
  update public.financiamento_consorcio set contemplado = true, data_contemplacao = v_data, forma_contemplacao = v_forma,
         lance_tipo = case when v_forma = 'lance' then v_lt end, lance_valor = nullif(d->>'lance_valor', '')::numeric,
         carta_recebida = nullif(d->>'carta_recebida', '')::numeric
   where financiamento_id = p_id;
  v_fecho := public._fn_parcelas_credito_fechar(p_id);
  perform public._fn_consorcio_faixas(p_id);
  v_op := public._fn_parcelas_operacao_registrar(p_id, 'contemplar', null, v_antes);
  update public.financiamento_parcelas_operacoes set contrato_antes = v_cantes where id = v_op;
  return jsonb_build_object('operacao_id', v_op, 'adiadas_datadas', v_j, 'seguro_recalculado', v_nseg, 'fecho', v_fecho,
    'antes', v_antes, 'depois', public._fn_parcelas_foto(p_id));
end $$;

create or replace function public._fn_consorcio_devolucao_exec(p_parcela_id uuid, p_lancamento_id uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare q public.financiamento_parcelas%rowtype; f public.financiamentos%rowtype; l public.financeiro_lancamentos_v2%rowtype; v_id uuid;
begin
  select * into q from public.financiamento_parcelas where id = p_parcela_id;
  if not found then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  f := public._fn_contrato_do_usuario(q.financiamento_id);
  if f.natureza <> 'consorcio' then raise exception using errcode = 'P0001', message = 'Devolução numa parcela é do consórcio.'; end if;
  if q.status = 'cancelado' then raise exception using errcode = 'P0001', message = 'Esta parcela foi retirada do contrato.'; end if;
  select * into l from public.financeiro_lancamentos_v2 where id = p_lancamento_id;
  if not found or l.cliente_id <> f.cliente_id then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  if coalesce(l.cancelado, false) then raise exception using errcode = 'P0001', message = 'O lançamento escolhido está cancelado.'; end if;
  if coalesce(l.tipo_operacao, '') not like '1-%' then raise exception using errcode = 'P0001', message = 'A devolução tem de ser uma entrada.'; end if;
  if exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and not p.cancelada) then
    raise exception using errcode = 'P0001', message = 'Este lançamento é de operação comercial: desvincule-o na OC antes.';
  end if;
  if exists (select 1 from public.financiamento_parcela_vinculos v where v.lancamento_id = l.id and v.desfeito_em is null) then
    raise exception using errcode = 'P0001', message = 'Este lançamento já está ligado a uma parcela.';
  end if;
  if l.financiamento_id is not null and l.financiamento_id <> f.id then raise exception using errcode = 'P0001', message = 'Este lançamento pertence a outro contrato.'; end if;
  if exists (select 1 from public.financiamento_parcela_vinculos v where v.parcela_id = q.id and v.papel = 'devolucao' and v.desfeito_em is null) then
    raise exception using errcode = 'P0001', message = format('A parcela %s já tem devolução ligada: desvincule antes.', q.numero_parcela);
  end if;
  insert into public.financiamento_parcela_vinculos (cliente_id, financiamento_id, parcela_id, lancamento_id, papel, antes, vinculado_por)
  values (f.cliente_id, f.id, q.id, l.id, 'devolucao', jsonb_build_object('parcela', null, 'lancamento', jsonb_build_object('financiamento_id', l.financiamento_id)), auth.uid())
  returning id into v_id;
  update public.financeiro_lancamentos_v2 set financiamento_id = f.id where id = l.id and financiamento_id is distinct from f.id;
  return jsonb_build_object('vinculo_id', v_id, 'parcela_id', q.id, 'numero', q.numero_parcela, 'lancamento_id', l.id, 'devolvido', round(abs(l.valor), 2));
end $$;

-- 6. Leituras: os saldos (um dono) e a tela ------------------------------------------------------------------------------------------
create or replace function public._fn_consorcio_saldo(p_fin uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'carta', f.valor_total,
    'fundo_comum_pago', coalesce(sum(q.valor_fundo_comum) filter (where public._fn_parcela_esta_paga(q.id)), 0),
    'fundo_comum_a_pagar', coalesce(sum(q.valor_fundo_comum) filter (where not public._fn_parcela_esta_paga(q.id) and q.data_vencimento is not null), 0),
    'fundo_comum_adiado', coalesce(sum(q.valor_fundo_comum) filter (where not public._fn_parcela_esta_paga(q.id) and q.data_vencimento is null), 0),
    'a_pagar', coalesce(sum(q.valor_total) filter (where not public._fn_parcela_esta_paga(q.id)), 0),
    'taxa_adm', coalesce(sum(q.valor_taxa_adm), 0), 'fundo_reserva', coalesce(sum(q.valor_fundo_reserva), 0), 'seguro', coalesce(sum(q.valor_seguro), 0),
    'custo', coalesce(sum(coalesce(q.valor_taxa_adm, 0) + coalesce(q.valor_fundo_reserva, 0) + coalesce(q.valor_seguro, 0)), 0),
    'total', coalesce(sum(q.valor_total), 0),
    'ultima_a_pagar', max(q.data_vencimento) filter (where not public._fn_parcela_esta_paga(q.id)),
    'pagas', count(*) filter (where public._fn_parcela_esta_paga(q.id)), 'parcelas', count(q.id),
    'adiadas_sem_data', count(*) filter (where q.adiada and q.data_vencimento is null))
  from public.financiamentos f left join public.financiamento_parcelas q on q.financiamento_id = f.id and coalesce(q.status, '') <> 'cancelado'
  where f.id = p_fin group by f.id, f.valor_total
$$;

create or replace function public.fn_consorcio_tela(p_id uuid, p_hoje date default current_date) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare f public.financiamentos%rowtype; c public.financiamento_consorcio%rowtype; v_parc jsonb; v_op jsonb;
begin
  f := public._fn_contrato_do_usuario(p_id);
  if f.natureza <> 'consorcio' then raise exception using errcode = 'P0001', message = 'Este contrato não é consórcio.'; end if;
  select * into c from public.financiamento_consorcio where financiamento_id = p_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'numero', q.numero_parcela, 'vencimento', q.data_vencimento,
           'fundo_comum', q.valor_fundo_comum, 'taxa_adm', q.valor_taxa_adm, 'fundo_reserva', q.valor_fundo_reserva, 'seguro', q.valor_seguro,
           'total', q.valor_total, 'faixa', q.faixa, 'adiada', q.adiada, 'ajustada', coalesce(q.ajustada, false),
           'situacao', case when public._fn_parcela_esta_paga(q.id) then 'paga' when q.data_vencimento is null then 'adiada'
                            when q.data_vencimento < p_hoje then 'a_ligar' else 'a_vencer' end,
           'trava', public._fn_parcela_credito_trava(q.id), 'lancamento_id', q.lancamento_id, 'lancamento_juros_id', q.lancamento_juros_id,
           'pago', pg.pago, 'devolvido', dv.devolvido, 'liquido', case when pg.pago is not null then pg.pago - coalesce(dv.devolvido, 0) end)
           order by q.numero_parcela), '[]'::jsonb)
    into v_parc
    from public.financiamento_parcelas q
    left join lateral (select nullif(sum(abs(l.valor)), 0) pago from public.financeiro_lancamentos_v2 l
                        where l.id in (q.lancamento_id, q.lancamento_juros_id) and not coalesce(l.cancelado, false)
                          and l.status_transacao in ('realizado', 'conciliado')) pg on true
    left join lateral (select nullif(sum(abs(l.valor)), 0) devolvido from public.financiamento_parcela_vinculos v
                        join public.financeiro_lancamentos_v2 l on l.id = v.lancamento_id
                        where v.parcela_id = q.id and v.papel = 'devolucao' and v.desfeito_em is null and not coalesce(l.cancelado, false)) dv on true
   where q.financiamento_id = p_id and coalesce(q.status, '') <> 'cancelado';
  select jsonb_build_object('id', o.id, 'tipo', o.tipo, 'feita_em', o.feita_em) into v_op from public.financiamento_parcelas_operacoes o
   where o.financiamento_id = p_id and o.desfeita_em is null order by o.feita_em desc, o.id desc limit 1;
  return jsonb_build_object(
    'contrato', jsonb_build_object('id', f.id, 'status', f.status, 'descricao', f.descricao, 'credor_id', f.credor_id,
      'credor_nome', (select w.nome from public.financeiro_fornecedores w where w.id = f.credor_id), 'fazenda_id', f.fazenda_id,
      'conta_bancaria_id', f.conta_bancaria_id, 'plano_principal_id', f.plano_principal_id, 'plano_juros_id', f.plano_juros_id,
      'atividade', f.tipo_financiamento, 'carta', f.valor_total, 'primeira_parcela', f.data_primeira_parcela, 'data_adesao', f.data_contrato,
      'observacao', f.observacao, 'grupo', c.grupo, 'cota', c.cota, 'tipo_bem', c.tipo_bem, 'regras', c.regras, 'contemplado', c.contemplado,
      'data_contemplacao', c.data_contemplacao, 'forma_contemplacao', c.forma_contemplacao, 'lance_tipo', c.lance_tipo, 'lance_valor', c.lance_valor,
      'carta_recebida', c.carta_recebida),
    'parcelas', v_parc,
    'faixas', (select coalesce(jsonb_agg(jsonb_build_object('faixa', g.faixa, 'de', g.de, 'ate', g.ate, 'parcelas', g.n, 'adiada', g.adiada,
                 'fundo_comum', g.fc, 'taxa_adm', g.adm, 'fundo_reserva', g.res, 'seguro', g.seg, 'total', g.tot) order by g.faixa), '[]'::jsonb)
               from (select q.faixa, min(q.numero_parcela) de, max(q.numero_parcela) ate, count(*) n, bool_and(q.adiada) adiada,
                            min(q.valor_fundo_comum) fc, min(q.valor_taxa_adm) adm, min(q.valor_fundo_reserva) res, min(q.valor_seguro) seg, min(q.valor_total) tot
                       from public.financiamento_parcelas q where q.financiamento_id = p_id and coalesce(q.status, '') <> 'cancelado' group by q.faixa) g),
    'saldo', public._fn_consorcio_saldo(p_id),
    'cronograma', public.fn_consorcio_cronograma(public._fn_consorcio_regras_do_contrato(p_id)) - 'linhas',
    'ultima_operacao', v_op,
    'documentos', (select count(*) from public.financiamento_documentos d where d.financiamento_id = p_id and d.cancelado_em is null));
end $$;

-- 7. As publicas: guarda, simulacao (SQLSTATE 'CSSIM'), recusa ------------------------------------------------------------------------
create or replace function public._fn_consorcio_simular(p_sql text, p_args jsonb, p_simular boolean) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare r jsonb;
begin
  if coalesce(p_simular, true) then
    begin
      execute p_sql into r using p_args;
      raise exception using errcode = 'CSSIM', message = r::text;
    exception
      when sqlstate 'CSSIM' then return sqlerrm::jsonb || jsonb_build_object('simulado', true, 'recusa', null);
      when sqlstate 'P0001' then return jsonb_build_object('simulado', true, 'recusa', sqlerrm);
    end;
  end if;
  execute p_sql into r using p_args;
  return r || jsonb_build_object('simulado', false, 'recusa', null);
end $$;

create or replace function public.fn_consorcio_salvar(p_id uuid, p_dados jsonb, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_id is not null then perform public._fn_contrato_do_usuario(p_id);
  elsif not coalesce(public.tenant_ok(nullif(p_dados->>'cliente_id', '')::uuid), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return public._fn_consorcio_simular('select public._fn_consorcio_salvar_exec(nullif($1->>''id'', '''')::uuid, $1->''dados'')',
    jsonb_build_object('id', p_id, 'dados', p_dados), p_simular);
end $$;

create or replace function public.fn_consorcio_reajustar(p_id uuid, p_pct numeric, p_a_partir_de date, p_indice text default null, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public._fn_contrato_do_usuario(p_id);
  return public._fn_consorcio_simular('select public._fn_consorcio_reajustar_exec(($1->>''id'')::uuid, ($1->>''pct'')::numeric, ($1->>''de'')::date, $1->>''indice'')',
    jsonb_build_object('id', p_id, 'pct', p_pct, 'de', p_a_partir_de, 'indice', p_indice), p_simular);
end $$;

create or replace function public.fn_consorcio_contemplar(p_id uuid, p_dados jsonb, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public._fn_contrato_do_usuario(p_id);
  return public._fn_consorcio_simular('select public._fn_consorcio_contemplar_exec(($1->>''id'')::uuid, $1->''dados'')',
    jsonb_build_object('id', p_id, 'dados', p_dados), p_simular);
end $$;

create or replace function public.fn_consorcio_devolucao_vincular(p_parcela_id uuid, p_lancamento_id uuid, p_simular boolean default true) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  perform public._fn_contrato_do_usuario((select q.financiamento_id from public.financiamento_parcelas q where q.id = p_parcela_id));
  return public._fn_consorcio_simular('select public._fn_consorcio_devolucao_exec(($1->>''parcela'')::uuid, ($1->>''lancamento'')::uuid)',
    jsonb_build_object('parcela', p_parcela_id, 'lancamento', p_lancamento_id), p_simular);
end $$;

-- 8. As funcoes do financiamento ganham o desvio do consorcio (patch guardado por md5: origem, ancora 1x, destino) --------------------
create or replace function pg_temp.patch(p_sig text, p_antes text, p_depois text, p_trocas text[]) returns void language plpgsql as $$
declare v_src text; v_def text; i int;
begin
  select prosrc into v_src from pg_proc where oid = p_sig::regprocedure;
  if md5(v_src) <> p_antes then raise exception '%: corpo nao e o esperado (%)', p_sig, md5(v_src); end if;
  v_def := pg_get_functiondef(p_sig::regprocedure);
  i := 1;
  while i < array_length(p_trocas, 1) loop
    if (length(v_src) - length(replace(v_src, p_trocas[i], ''))) / length(p_trocas[i]) <> 1 then raise exception '%: ancora % nao casa 1x', p_sig, i; end if;
    v_def := replace(v_def, p_trocas[i], p_trocas[i + 1]);
    i := i + 2;
  end loop;
  execute v_def;
  select prosrc into v_src from pg_proc where oid = p_sig::regprocedure;
  if p_depois is not null and md5(v_src) <> p_depois then raise exception '%: destino divergente (%)', p_sig, md5(v_src); end if;
end $$;

-- o motor: a parcela adiada (sem vencimento) nao tem lancamento
select pg_temp.patch('public.fn_reconciliar_parcela_financiamento(uuid,boolean,boolean,uuid)', 'ca34e617bfe992d6ae101b265e18f35a', 'c77919c73c7b979332df16727f9a725d', array[
  E'\n  -- PR-FIN-CPR-01 (1a): conta desejada = override do operador',
  E'\n  -- FIN-CONSORCIO-02: parcela ADIADA de consorcio (sem vencimento ate'' a contemplacao) nao tem lancamento\n'
  || E'  IF v_parcela.data_vencimento IS NULL THEN\n'
  || E'    RETURN jsonb_build_object(''skip'',''parcela_sem_vencimento'',''parcela_id'',p_parcela_id,''financiamento_id'',v_contrato.id);\n'
  || E'  END IF;\n\n  -- PR-FIN-CPR-01 (1a): conta desejada = override do operador']);

-- o cadastro antigo: consorcio vai ao escritor do consorcio
select pg_temp.patch('public._fn_financiamento_criar_exec(jsonb)', '961c3d1d1976fd1541af924bc097a7fe', '8e9332fc003923ae08f5f66d2cae9f06', array[
  E'\n  if v_ativ not in (''pecuaria'', ''agricultura'') then',
  E'\n  -- FIN-CONSORCIO-02: o consorcio tem um escritor so''\n'
  || E'  if v_nat = ''consorcio'' then return public._fn_consorcio_salvar_exec(null, public._fn_consorcio_do_cadastro(p)); end if;\n'
  || E'  if v_ativ not in (''pecuaria'', ''agricultura'') then']);

-- editar e regerar: o desvio do consorcio
select pg_temp.patch('public._fn_financiamento_parcelas_editar_exec(uuid,jsonb)', '8144a7a4e9daa46beab18e7db6213c1a', '0b49a410f351986969c9d37db5f9f249', array[
  E'\n  if coalesce(jsonb_array_length(m->''alterar''), 0) + coalesce(jsonb_array_length(m->''acrescentar''), 0)',
  E'\n  if f.natureza = ''consorcio'' then return public._fn_consorcio_parcelas_editar_exec(p_id, m, v_antes); end if;\n'
  || E'  if coalesce(jsonb_array_length(m->''alterar''), 0) + coalesce(jsonb_array_length(m->''acrescentar''), 0)']);
select pg_temp.patch('public._fn_financiamento_parcelas_regerar_exec(uuid,text)', '68545e4bca8e43a369da153e20ff1ee6', '65790a2f26bcbfcf78df726d1f45b015', array[
  E'if f.natureza = ''consorcio'' then raise exception using errcode = ''P0001'', message = ''Consórcio: o cronograma vem da carta e do prazo; edite as parcelas.''; end if;',
  E'if f.natureza = ''consorcio'' then return public._fn_consorcio_regerar_exec(p_id, p_modo); end if;']);

-- desfazer: volta tambem os componentes, a faixa, a adiada e (reajuste, contemplacao) o contrato
select pg_temp.patch('public._fn_financiamento_parcelas_desfazer_exec(uuid,text)', 'cfa5e624f0179608034286f69f3f6ef3', '24ba36c0eee758acfeb315150f1ab987', array[
  E'valor_total = (x->>''valor_total'')::numeric,\n',
  E'valor_total = (x->>''valor_total'')::numeric,\n'
  || E'             valor_fundo_comum = (x->>''valor_fundo_comum'')::numeric, valor_taxa_adm = (x->>''valor_taxa_adm'')::numeric,\n'
  || E'             valor_fundo_reserva = (x->>''valor_fundo_reserva'')::numeric, valor_seguro = (x->>''valor_seguro'')::numeric,\n'
  || E'             faixa = (x->>''faixa'')::int, adiada = coalesce((x->>''adiada'')::boolean, false),\n',
  E'\n  v_fecho := public._fn_parcelas_credito_fechar(o.financiamento_id);',
  E'\n  if o.contrato_antes is not null then perform public._fn_consorcio_contrato_restaurar(o.financiamento_id, o.contrato_antes); end if;\n'
  || E'  v_fecho := public._fn_parcelas_credito_fechar(o.financiamento_id);']);

-- desvincular: a devolucao nao mexe na parcela
select pg_temp.patch('public._fn_financiamento_parcela_desvincular_exec(uuid,text)', '12de13982fa49072e0d258e438766c1b', 'ea383bf3e041e4a90e880eeb845102d0', array[
  E'\n  -- a parcela volta como estava (o lugar do pagamento fica vazio',
  E'\n  if v.papel <> ''devolucao'' then\n  -- a parcela volta como estava (o lugar do pagamento fica vazio',
  E'   where id = v.parcela_id;\n',
  E'   where id = v.parcela_id;\n  end if;\n']);

-- a foto das parcelas leva os componentes (corpo integral, guardado pela origem)
do $$ begin
  if md5((select prosrc from pg_proc where oid = 'public._fn_parcelas_foto(uuid)'::regprocedure)) <> '0d9db02c67cb591a243e3b4e185954bb' then
    raise exception '_fn_parcelas_foto: corpo nao e o esperado';
  end if;
end $$;
create or replace function public._fn_parcelas_foto(p_fin uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'numero_parcela', q.numero_parcela, 'data_vencimento', q.data_vencimento,
           'valor_principal', q.valor_principal, 'valor_juros', q.valor_juros, 'valor_total', q.valor_total, 'status', q.status,
           'ajustada', q.ajustada, 'tipo', q.tipo, 'valor_fundo_comum', q.valor_fundo_comum, 'valor_taxa_adm', q.valor_taxa_adm,
           'valor_fundo_reserva', q.valor_fundo_reserva, 'valor_seguro', q.valor_seguro, 'faixa', q.faixa, 'adiada', q.adiada)
           order by q.numero_parcela, q.data_vencimento, q.id), '[]'::jsonb)
  from public.financiamento_parcelas q where q.financiamento_id = p_fin
$$;

-- 9. ACL: as internas fechadas; as publicas para a tela -----------------------------------------------------------------------------
do $$
declare s text;
begin
  foreach s in array array['public._fn_brl(numeric)', 'public._fn_consorcio_valor(jsonb,numeric,integer)', 'public._fn_consorcio_seguro_valor(jsonb,numeric)',
    'public._fn_consorcio_regras_do_contrato(uuid)', 'public._fn_consorcio_faixas(uuid)', 'public._fn_consorcio_contrato_foto(uuid)',
    'public._fn_consorcio_contrato_restaurar(uuid,jsonb)', 'public._fn_consorcio_parcela_gravar(uuid,uuid,uuid,jsonb,date)',
    'public._fn_consorcio_salvar_exec(uuid,jsonb)', 'public._fn_consorcio_do_cadastro(jsonb)', 'public._fn_consorcio_parcelas_editar_exec(uuid,jsonb,jsonb)',
    'public._fn_consorcio_regerar_exec(uuid,text)', 'public._fn_consorcio_reajustar_exec(uuid,numeric,date,text)',
    'public._fn_consorcio_contemplar_exec(uuid,jsonb)', 'public._fn_consorcio_devolucao_exec(uuid,uuid)', 'public._fn_consorcio_saldo(uuid)',
    'public._fn_consorcio_simular(text,jsonb,boolean)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', s);
    execute format('grant execute on function %s to service_role', s);
  end loop;
  foreach s in array array['public.fn_consorcio_cronograma(jsonb)', 'public.fn_consorcio_tela(uuid,date)', 'public.fn_consorcio_salvar(uuid,jsonb,boolean)',
    'public.fn_consorcio_reajustar(uuid,numeric,date,text,boolean)', 'public.fn_consorcio_contemplar(uuid,jsonb,boolean)',
    'public.fn_consorcio_devolucao_vincular(uuid,uuid,boolean)'] loop
    execute format('revoke all on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated, service_role', s);
  end loop;
end $$;
