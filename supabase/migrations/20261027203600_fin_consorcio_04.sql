-- FIN-CONSORCIO-04 — o consórcio montado pelas FAIXAS em R$ (copiadas do termo / boleto) ou pelas REGRAS em %, com conferência.
-- Decisões do Gabriel (20/10/2026): mesmo gerador, novo modo (proibido segundo gerador); tipo da faixa a pagar | adiada | na adesão;
-- reajuste no modo faixas reescreve as faixas gravadas pelas parcelas; o Regerar só conta (e só regrava) o que muda.
--   1. `fn_consorcio_cronograma` (f1c4342b… -> destino abaixo): `regras.modo = 'faixas'` + `regras.faixas` [{de, ate, fundo_comum,
--      taxa_adm, fundo_reserva, seguro, tipo}] viram as parcelas: a pagar mensais pela 1ª parcela, adiadas sem vencimento (datadas pela
--      contemplação), na adesão na data de adesão. Recusa (com `faixa_erro`, o índice da faixa): buraco, sobreposição, faixa além do prazo
--      ou aquém dele, tipo inválido, "na adesão" depois de outro tipo, adiada antes de a pagar com transcorridas adiadas, valor negativo,
--      faixa sem valor. As faixas digitadas são a verdade: sem ajuste de centavos; o seguro é o da faixa. Nos DOIS modos o retorno ganha
--      `confere` [{chave, ok, texto}]: fundo comum × carta; taxa adm. × % total (quando informado); 1ª parcela × `primeira_parcela_termo`
--      (quando informada); reserva × % total (quando informado). Âmbar na tela, nunca corrige, não impede salvar.
--   2. `_fn_consorcio_faixas_das_parcelas(fin, faixas_antes)` (nova, interna): as faixas das parcelas gravadas (seguidas, mesmos componentes,
--      mesmo tipo — o tipo vem das faixas de antes; sem elas, adiada ou a pagar).
--   3. `_fn_consorcio_reajustar_exec` (e2c7ad1d… -> destino): no modo faixas, as faixas gravadas passam a ser as das parcelas reajustadas.
--   4. `_fn_consorcio_regerar_exec` (d3394bea… -> destino): parcela em aberto que voltaria idêntica (os 4 componentes e o vencimento) não é
--      regravada e não conta como trocada (`iguais` no retorno).
-- Patch guardado por md5 (origem, cada âncora 1x, destino); assinaturas, SECURITY, volatilidade e ACL iguais. Nenhum dado muda.

set local lock_timeout = '2s';

create or replace function pg_temp._troca(t text, a text, b text, rotulo text) returns text language plpgsql as $f$
begin
  if (length(t) - length(replace(t, a, ''))) / length(a) <> 1 then raise exception 'ancora % nao casa 1x', rotulo; end if;
  return replace(t, a, b);
end $f$;

-- 2. a função nova (interna, fechada)
create or replace function public._fn_consorcio_faixas_das_parcelas(p_fin uuid, p_antes jsonb) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  with q as (
    select x.numero_parcela n, coalesce(x.valor_fundo_comum, 0) fc, coalesce(x.valor_taxa_adm, 0) adm, coalesce(x.valor_fundo_reserva, 0) res,
           coalesce(x.valor_seguro, 0) seg,
           coalesce((select coalesce(nullif(f->>'tipo', ''), case when (f->>'adiada')::boolean then 'adiada' else 'a_pagar' end)
                       from jsonb_array_elements(coalesce(p_antes, '[]'::jsonb)) f
                      where x.numero_parcela between (f->>'de')::int and (f->>'ate')::int limit 1),
                    case when x.adiada then 'adiada' else 'a_pagar' end) tipo
      from public.financiamento_parcelas x where x.financiamento_id = p_fin and coalesce(x.status, '') <> 'cancelado'),
  g as (select q.*, q.n - row_number() over (partition by q.fc, q.adm, q.res, q.seg, q.tipo order by q.n) grp from q)
  select coalesce(jsonb_agg(jsonb_build_object('de', t.de, 'ate', t.ate, 'fundo_comum', t.fc, 'taxa_adm', t.adm, 'fundo_reserva', t.res,
           'seguro', t.seg, 'tipo', t.tipo) order by t.de), '[]'::jsonb)
    from (select min(g.n) de, max(g.n) ate, g.fc, g.adm, g.res, g.seg, g.tipo from g group by g.grp, g.fc, g.adm, g.res, g.seg, g.tipo) t
$$;
revoke all on function public._fn_consorcio_faixas_das_parcelas(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._fn_consorcio_faixas_das_parcelas(uuid, jsonb) to service_role;

do $mig$
declare v_oid oid; v_src text; v_new text;
begin
  ---------------------------------------------------------------------------------------------------------------------------------
  -- 1. o gerador
  v_oid := 'public.fn_consorcio_cronograma(jsonb)'::regprocedure;
  select prosrc into v_src from pg_proc where oid = v_oid;
  if md5(v_src) = 'c53050bd3b82c324b9c4dcc39c9dcee9' then raise notice 'fn_consorcio_cronograma ja no destino'; else
    if md5(v_src) <> 'f1c4342b16ccb7417b03dfedc0a675b3' then raise exception 'fn_consorcio_cronograma: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    v_new := pg_temp._troca(v_new, $a$v_soma numeric; v_aj numeric; v_cnt int; v_aj_num int;$a$,
      $a$v_soma numeric; v_aj numeric; v_cnt int; v_aj_num int;
  v_fxm boolean := coalesce(nullif(p->>'modo', ''), 'regras') = 'faixas'; v_fxs jsonb := coalesce(p->'faixas', '[]'::jsonb); fx jsonb;
  v_idx int := 0; v_de int; v_ate int; v_tipo text; v_esp int := 1; v_tipo_ant text := null; v_jp int := 0; v_ja int := 0;
  v_conf jsonb := '[]'::jsonb; v_pri numeric; v_termo numeric := round(nullif(p->>'primeira_parcela_termo', '')::numeric, 2); v_rpct numeric;$a$, 'G1');

    v_new := pg_temp._troca(v_new, $a$  v_n := v_prazo - v_t;                              -- as que se pagam agora, mes a mes$a$,
      $a$  if v_fxm then
    -- FIN-CONSORCIO-04 — as faixas em R$ (copiadas do termo / boleto) são a verdade: cada uma vira parcelas; o banco só confere
    if jsonb_typeof(v_fxs) <> 'array' or jsonb_array_length(v_fxs) = 0 then
      return jsonb_build_object('recusa', 'Informe as faixas: de, até e os valores de cada uma.', 'faixa_erro', 0, 'linhas', '[]'::jsonb);
    end if;
    v_adesao := 0; v_n := 0; v_a := 0;
    v_adm_pct := nullif(v_adm->>'total_pct', '')::numeric;
    v_adm_total := case when v_adm_pct is not null then round(v_carta * v_adm_pct / 100, 2) end;
    if v_contemp is not null then
      v_m0 := (extract(year from v_contemp)::int * 12 + extract(month from v_contemp)::int + 1) - (extract(year from v_d1)::int * 12 + extract(month from v_d1)::int);
    end if;
    for fx in select * from jsonb_array_elements(v_fxs) loop
      v_de := nullif(fx->>'de', '')::int; v_ate := nullif(fx->>'ate', '')::int;
      v_tipo := coalesce(nullif(fx->>'tipo', ''), case when (fx->>'adiada')::boolean then 'adiada' else 'a_pagar' end);
      if v_de is null or v_ate is null or v_de < 1 or v_ate < v_de then
        return jsonb_build_object('recusa', format('Faixa %s: informe de e até (até não menor que de).', v_idx + 1), 'faixa_erro', v_idx, 'linhas', '[]'::jsonb);
      end if;
      if v_tipo not in ('a_pagar', 'adiada', 'adesao') then
        return jsonb_build_object('recusa', format('Faixa %s a %s: o tipo é a pagar, adiada ou na adesão.', v_de, v_ate), 'faixa_erro', v_idx, 'linhas', '[]'::jsonb);
      end if;
      if v_de > v_esp then
        return jsonb_build_object('recusa', format('Faixas: %s em nenhuma faixa.', case when v_de - 1 = v_esp then format('a parcela %s não está', v_esp)
          else format('as parcelas %s a %s não estão', v_esp, v_de - 1) end), 'faixa_erro', v_idx, 'linhas', '[]'::jsonb);
      end if;
      if v_de < v_esp then
        return jsonb_build_object('recusa', format('Faixas: a parcela %s está em duas faixas.', v_de), 'faixa_erro', v_idx, 'linhas', '[]'::jsonb);
      end if;
      if v_ate > v_prazo then
        return jsonb_build_object('recusa', format('Faixas: a faixa %s a %s passa do prazo do grupo (%s).', v_de, v_ate, v_prazo), 'faixa_erro', v_idx, 'linhas', '[]'::jsonb);
      end if;
      if v_tipo = 'adesao' and v_tipo_ant is not null and v_tipo_ant <> 'adesao' then
        return jsonb_build_object('recusa', format('Faixas: "na adesão" (%s a %s) só antes das a pagar.', v_de, v_ate), 'faixa_erro', v_idx, 'linhas', '[]'::jsonb);
      end if;
      if v_trat = 'adiadas' and ((v_tipo = 'a_pagar' and v_tipo_ant = 'adiada') or (v_tipo = 'adiada' and v_jp = 0)) then
        return jsonb_build_object('recusa', format('Faixas: com transcorridas adiadas, as adiadas vêm depois das a pagar (%s a %s).', v_de, v_ate),
          'faixa_erro', v_idx, 'linhas', '[]'::jsonb);
      end if;
      v_vfc := round(coalesce(nullif(fx->>'fundo_comum', '')::numeric, 0), 2); v_vadm := round(coalesce(nullif(fx->>'taxa_adm', '')::numeric, 0), 2);
      v_vres := round(coalesce(nullif(fx->>'fundo_reserva', '')::numeric, 0), 2); v_vseg := round(coalesce(nullif(fx->>'seguro', '')::numeric, 0), 2);
      if least(v_vfc, v_vadm, v_vres, v_vseg) < 0 then
        return jsonb_build_object('recusa', format('Faixa %s a %s: nenhum valor negativo.', v_de, v_ate), 'faixa_erro', v_idx, 'linhas', '[]'::jsonb);
      end if;
      if v_vfc + v_vadm + v_vres + v_vseg = 0 then
        return jsonb_build_object('recusa', format('Faixa %s a %s: informe ao menos um valor.', v_de, v_ate), 'faixa_erro', v_idx, 'linhas', '[]'::jsonb);
      end if;
      for v_i in v_de..v_ate loop
        v_k := v_k + 1;
        if v_tipo = 'a_pagar' then
          v_jp := v_jp + 1; v_n := v_n + 1; v_venc := (v_d1 + make_interval(months => v_jp - 1))::date;
        elsif v_tipo = 'adiada' then
          v_ja := v_ja + 1; v_a := v_a + 1; v_venc := case when v_contemp is not null then (v_d1 + make_interval(months => v_m0 + v_ja - 1))::date end;
        else
          v_venc := coalesce(nullif(p->>'data_adesao', '')::date, (v_d1 - interval '1 month')::date);
        end if;
        v_lin := v_lin || jsonb_build_object('numero', v_k, 'vencimento', v_venc, 'fundo_comum', v_vfc, 'taxa_adm', v_vadm, 'fundo_reserva', v_vres,
          'seguro', v_vseg, 'adiada', v_tipo = 'adiada', 'adesao', v_tipo = 'adesao');
      end loop;
      v_esp := v_ate + 1; v_tipo_ant := v_tipo; v_idx := v_idx + 1;
    end loop;
    if v_jp = 0 then
      return jsonb_build_object('recusa', 'Faixas: informe ao menos uma faixa a pagar.', 'faixa_erro', v_idx - 1, 'linhas', '[]'::jsonb);
    end if;
    if v_esp - 1 < v_prazo then
      return jsonb_build_object('recusa', format('Faixas: %s em nenhuma faixa (o prazo do grupo é %s).', case when v_esp = v_prazo then format('a parcela %s não está', v_esp)
        else format('as parcelas %s a %s não estão', v_esp, v_prazo) end, v_prazo), 'faixa_erro', v_idx - 1, 'linhas', '[]'::jsonb);
    end if;
  else
  v_n := v_prazo - v_t;                              -- as que se pagam agora, mes a mes$a$, 'G2');

    v_new := pg_temp._troca(v_new, $a$
  -- FIN-CONSORCIO-03b — os centavos da divisão do próprio gerador$a$, $a$
  end if;

  -- FIN-CONSORCIO-03b — os centavos da divisão do próprio gerador$a$, 'G3');

    v_new := pg_temp._troca(v_new, $a$  if v_aj <> 0 and abs(v_aj) < v_cnt * 0.01 then$a$,
      $a$  if not v_fxm and v_aj <> 0 and abs(v_aj) < v_cnt * 0.01 then   -- FIN-CONSORCIO-04: nas faixas digitadas, nenhum ajuste$a$, 'G4');

    v_new := pg_temp._troca(v_new, $a$    v_vseg := case when coalesce(v_seg->>'inicio', 'primeira') = 'contemplacao'$a$,
      $a$    v_vseg := case when v_fxm then coalesce(nullif(e->>'seguro', '')::numeric, 0)
                   when coalesce(v_seg->>'inicio', 'primeira') = 'contemplacao'$a$, 'G5');

    v_new := pg_temp._troca(v_new, $a$  return jsonb_build_object('linhas', v_out, 'faixas', v_faixas, 'parcelas', v_k,$a$,
      $a$  -- FIN-CONSORCIO-04 — a conferência dos dois modos, lida pela tela (âmbar; nunca corrige, não impede salvar)
  v_conf := v_conf || jsonb_build_object('chave', 'fundo_comum', 'ok', v_tfc = v_carta, 'texto',
    case when v_tfc = v_carta then 'fundo comum = valor da carta'
         else format('fundo comum %s × carta %s (%s%s)', public._fn_brl(v_tfc), public._fn_brl(v_carta),
                     case when v_tfc > v_carta then '+' else '−' end, public._fn_brl(abs(v_tfc - v_carta))) end);
  if v_adm_total is not null and v_forma <> 'manual' then
    v_conf := v_conf || jsonb_build_object('chave', 'taxa_adm', 'ok', (v_tadm - coalesce(v_adesao, 0)) = v_adm_total, 'texto',
      case when (v_tadm - coalesce(v_adesao, 0)) = v_adm_total
           then format('taxa adm. = %s%% da carta', translate(to_char(v_adm_pct, 'FM9990.00'), '.', ','))
           else format('taxa adm. %s × %s%% da carta %s', public._fn_brl(v_tadm - coalesce(v_adesao, 0)), translate(to_char(v_adm_pct, 'FM9990.00'), '.', ','),
                       public._fn_brl(v_adm_total)) end);
  end if;
  if v_termo is not null then
    v_pri := (select (x->>'total')::numeric from jsonb_array_elements(v_out) x
               where not coalesce((x->>'adiada')::boolean, false) and not coalesce((x->>'adesao')::boolean, false) order by (x->>'numero')::int limit 1);
    v_conf := v_conf || jsonb_build_object('chave', 'primeira_parcela', 'ok', v_pri = v_termo, 'texto',
      case when v_pri = v_termo then format('1ª parcela %s = termo', public._fn_brl(v_pri))
           else format('1ª parcela %s × termo %s', public._fn_brl(coalesce(v_pri, 0)), public._fn_brl(v_termo)) end);
  end if;
  v_rpct := nullif(v_res->>'total_pct', '')::numeric;
  if v_rpct is not null and (v_fxm or coalesce(v_res->>'modo', '') <> 'pct_total') then
    v_conf := v_conf || jsonb_build_object('chave', 'reserva', 'ok', v_tres = round(v_carta * v_rpct / 100, 2), 'texto',
      case when v_tres = round(v_carta * v_rpct / 100, 2) then format('reserva = %s%% da carta', translate(to_char(v_rpct, 'FM9990.00'), '.', ','))
           else format('reserva %s × %s%% da carta %s', public._fn_brl(v_tres), translate(to_char(v_rpct, 'FM9990.00'), '.', ','),
                       public._fn_brl(round(v_carta * v_rpct / 100, 2))) end);
  end if;

  return jsonb_build_object('linhas', v_out, 'faixas', v_faixas, 'parcelas', v_k,$a$, 'G6');

    v_new := pg_temp._troca(v_new, $a$  if v_tfc <> v_carta then$a$, $a$  if not v_fxm and v_tfc <> v_carta then$a$, 'G8a');
    v_new := pg_temp._troca(v_new, $a$  if v_adm_total is not null and v_forma <> 'manual' and (v_tadm - v_adesao) <> v_adm_total then$a$,
      $a$  if not v_fxm and v_adm_total is not null and v_forma <> 'manual' and (v_tadm - v_adesao) <> v_adm_total then$a$, 'G8b');
    v_new := pg_temp._troca(v_new, $a$  if nullif(v_res->>'total_pct', '') is not null and coalesce(v_res->>'modo', '') <> 'pct_total'$a$,
      $a$  if not v_fxm and nullif(v_res->>'total_pct', '') is not null and coalesce(v_res->>'modo', '') <> 'pct_total'$a$, 'G8c');

    v_new := pg_temp._troca(v_new, $a$'avisos', v_avisos, 'recusa', null);$a$, $a$'avisos', v_avisos, 'confere', v_conf, 'modo', case when v_fxm then 'faixas' else 'regras' end, 'recusa', null);$a$, 'G7');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> 'c53050bd3b82c324b9c4dcc39c9dcee9' then raise exception 'fn_consorcio_cronograma: destino inesperado %', md5(v_src); end if;
  end if;

  ---------------------------------------------------------------------------------------------------------------------------------
  -- 3. o reajuste
  v_oid := 'public._fn_consorcio_reajustar_exec(uuid, numeric, date, text)'::regprocedure;
  select prosrc into v_src from pg_proc where oid = v_oid;
  if md5(v_src) = '8d1fe2bef74530103ad6f4f593426bde' then raise notice 'reajustar ja no destino'; else
    if md5(v_src) <> 'e2c7ad1d1f8777f72c7416eb4d2a4c2a' then raise exception '_fn_consorcio_reajustar_exec: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    v_new := pg_temp._troca(v_new, $a$  v_fecho := public._fn_parcelas_credito_fechar(p_id);
  perform public._fn_consorcio_faixas(p_id);
  v_op := public._fn_parcelas_operacao_registrar(p_id, 'reajuste', null, v_antes);$a$,
      $a$  -- FIN-CONSORCIO-04 — no modo faixas, as faixas gravadas passam a ser as das parcelas reajustadas (o Regerar depois não desfaz o reajuste)
  if coalesce(c.regras->>'modo', 'regras') = 'faixas' then
    update public.financiamento_consorcio set regras = jsonb_set(regras, '{faixas}', public._fn_consorcio_faixas_das_parcelas(p_id, c.regras->'faixas'))
     where financiamento_id = p_id;
  end if;
  v_fecho := public._fn_parcelas_credito_fechar(p_id);
  perform public._fn_consorcio_faixas(p_id);
  v_op := public._fn_parcelas_operacao_registrar(p_id, 'reajuste', null, v_antes);$a$, 'R1');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '8d1fe2bef74530103ad6f4f593426bde' then raise exception '_fn_consorcio_reajustar_exec: destino inesperado %', md5(v_src); end if;
  end if;

  ---------------------------------------------------------------------------------------------------------------------------------
  -- 4. o regerar: o que volta idêntico não é regravado nem contado
  v_oid := 'public._fn_consorcio_regerar_exec(uuid, text)'::regprocedure;
  select prosrc into v_src from pg_proc where oid = v_oid;
  if md5(v_src) = '2898ccb1585ac2aa0c1786a04518be26' then raise notice 'regerar ja no destino'; else
    if md5(v_src) <> 'd3394bead0b449bfd8cdc169313380d9' then raise exception '_fn_consorcio_regerar_exec: origem inesperada %', md5(v_src); end if;
    v_new := pg_get_functiondef(v_oid);
    v_new := pg_temp._troca(v_new, $a$v_mantidas int := 0; v_trocadas int := 0; v_novas int := 0; v_retiradas int := 0;$a$,
      $a$v_mantidas int := 0; v_trocadas int := 0; v_novas int := 0; v_retiradas int := 0; v_iguais int := 0;$a$, 'E1');
    v_new := pg_temp._troca(v_new, $a$        perform public._fn_consorcio_parcela_gravar(p_id, f.cliente_id, q.id, v_lin[v_i], v_venc);
        v_trocadas := v_trocadas + 1;$a$,
      $a$        -- FIN-CONSORCIO-04 — a parcela que voltaria idêntica (componentes e vencimento) não é regravada nem conta como trocada
        if q.valor_fundo_comum is not distinct from (v_lin[v_i]->>'fundo_comum')::numeric
           and q.valor_taxa_adm is not distinct from (v_lin[v_i]->>'taxa_adm')::numeric
           and q.valor_fundo_reserva is not distinct from (v_lin[v_i]->>'fundo_reserva')::numeric
           and q.valor_seguro is not distinct from (v_lin[v_i]->>'seguro')::numeric
           and q.data_vencimento is not distinct from v_venc then
          v_iguais := v_iguais + 1;
        else
          perform public._fn_consorcio_parcela_gravar(p_id, f.cliente_id, q.id, v_lin[v_i], v_venc);
          v_trocadas := v_trocadas + 1;
        end if;$a$, 'E2');
    v_new := pg_temp._troca(v_new, $a$message = 'Nenhuma parcela em aberto para regerar.'; end if;$a$,
      $a$message = case when v_iguais > 0 then 'Nada muda: as parcelas em aberto já estão como o cadastro diz.' else 'Nenhuma parcela em aberto para regerar.' end; end if;$a$, 'E3');
    v_new := pg_temp._troca(v_new, $a$'novas', v_novas, 'retiradas', v_retiradas), 'cronograma'$a$,
      $a$'novas', v_novas, 'retiradas', v_retiradas, 'iguais', v_iguais), 'cronograma'$a$, 'E4');
    execute v_new;
    select prosrc into v_src from pg_proc where oid = v_oid;
    if md5(v_src) <> '2898ccb1585ac2aa0c1786a04518be26' then raise exception '_fn_consorcio_regerar_exec: destino inesperado %', md5(v_src); end if;
  end if;

  ---------------------------------------------------------------------------------------------------------------------------------
  if (select proacl::text from pg_proc where oid = 'public.fn_consorcio_cronograma(jsonb)'::regprocedure)
       <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
     or (select proacl::text from pg_proc where oid = 'public._fn_consorcio_reajustar_exec(uuid, numeric, date, text)'::regprocedure)
       <> '{postgres=X/postgres,service_role=X/postgres}'
     or (select proacl::text from pg_proc where oid = 'public._fn_consorcio_regerar_exec(uuid, text)'::regprocedure)
       <> '{postgres=X/postgres,service_role=X/postgres}' then
    raise exception 'ACL mudou';
  end if;
end $mig$;
