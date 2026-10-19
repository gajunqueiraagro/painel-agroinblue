-- FIN-CONSORCIO-03b — os centavos do fundo comum na ÚLTIMA parcela do grupo que recebe o resto (decisão do Gabriel, 19/10/2026).
--
-- O gerador (`fn_consorcio_cronograma`) divide a carta: o fundo comum das parcelas a pagar é o informado (ou a carta dividida) e o resto
-- vai às adiadas (ou à adesão). A divisão arredonda a centavos e a soma podia passar da carta por centavos (002122: 2.704,0365 x 34 =
-- +0,12), que viravam AVISO. Agora:
--   · o resto do arredondamento DO PRÓPRIO GERADOR vai na ÚLTIMA linha do grupo que recebe o resto — última adiada; tratamento
--     "adesão": a linha da adesão; "diluídas" (ou sem adiadas): a última a pagar;
--   · só quando |carta − soma| < (parcelas do grupo) × 0,01. Diferença maior (valor informado que não fecha com a carta) continua AVISO,
--     sem corrigir;
--   · a linha ajustada leva `ajuste_arredondamento` (o valor somado, com sinal), a faixa dela também (ela vira faixa própria, porque o
--     fundo comum dela difere); `fn_consorcio_tela` marca a parcela gravada cujo fundo comum é o do gerador.
-- Patch guardado por md5 (origem, cada âncora 1x, destino) nos dois corpos; assinatura, SECURITY, volatilidade, search_path e ACL iguais.
-- Nada de dado muda: as parcelas já gravadas só mudam quando o operador salva / regera.

set local lock_timeout = '2s';

do $mig$
declare
  v_oid oid; v_src text; v_def text; v_new text; v_dst text;
begin
  ---------------------------------------------------------------------------------------------------------------------------------
  -- 1. o gerador
  v_oid := 'public.fn_consorcio_cronograma(jsonb)'::regprocedure;
  select prosrc into v_src from pg_proc where oid = v_oid;
  if md5(v_src) = 'f1c4342b16ccb7417b03dfedc0a675b3' then raise notice 'fn_consorcio_cronograma ja no destino'; else
    if md5(v_src) <> '6e611819b9b479751a59434f2c9c8c83' then raise exception 'fn_consorcio_cronograma: origem inesperada %', md5(v_src); end if;
    v_def := pg_get_functiondef(v_oid);
    v_new := v_def;

    -- A1: as variáveis do ajuste
    if (length(v_new) - length(replace(v_new, $a$v_faixas jsonb := '[]'::jsonb; e jsonb; v_chave text; v_ult text := null; v_fx int := 0; v_out jsonb := '[]'::jsonb;$a$, ''))) /
       length($a$v_faixas jsonb := '[]'::jsonb; e jsonb; v_chave text; v_ult text := null; v_fx int := 0; v_out jsonb := '[]'::jsonb;$a$) <> 1 then raise exception 'A1'; end if;
    v_new := replace(v_new, $a$v_faixas jsonb := '[]'::jsonb; e jsonb; v_chave text; v_ult text := null; v_fx int := 0; v_out jsonb := '[]'::jsonb;$a$,
      $a$v_faixas jsonb := '[]'::jsonb; e jsonb; v_chave text; v_ult text := null; v_fx int := 0; v_out jsonb := '[]'::jsonb;
  v_soma numeric; v_aj numeric; v_cnt int; v_aj_num int;$a$);

    -- A2: o ajuste, antes do seguro
    if (length(v_new) - length(replace(v_new, $a$  -- o seguro (precisa do saldo devedor$a$, ''))) / length($a$  -- o seguro (precisa do saldo devedor$a$) <> 1 then raise exception 'A2'; end if;
    v_new := replace(v_new, $a$  -- o seguro (precisa do saldo devedor$a$,
      $a$  -- FIN-CONSORCIO-03b — os centavos da divisão do próprio gerador vão na ÚLTIMA linha do grupo que recebe o resto (última adiada;
  -- adesão: a linha da adesão; diluídas ou sem adiadas: a última a pagar), marcados; diferença maior que 1 centavo por parcela do grupo
  -- (valor informado que não fecha) segue como aviso, sem corrigir
  v_soma := (select coalesce(sum((x->>'fundo_comum')::numeric), 0) from jsonb_array_elements(v_lin) x);
  v_aj := v_carta - v_soma;
  v_cnt := case when v_trat = 'adiadas' and v_a > 0 then v_a when v_trat = 'adesao' and v_t > 0 then 1 else v_n end;
  v_aj_num := case when v_trat = 'adesao' and v_t > 0 then 1 else v_k end;
  if v_aj <> 0 and abs(v_aj) < v_cnt * 0.01 then
    v_lin := (select jsonb_agg(case when (x->>'numero')::int = v_aj_num
                                    then x || jsonb_build_object('fundo_comum', (x->>'fundo_comum')::numeric + v_aj, 'ajuste_arredondamento', v_aj)
                                    else x end order by (x->>'numero')::int)
                from jsonb_array_elements(v_lin) x);
  end if;

  -- o seguro (precisa do saldo devedor$a$);

    -- A3: a faixa diz o ajuste
    if (length(v_new) - length(replace(v_new, $a$'fundo_comum', g.fc, 'taxa_adm', g.adm, 'fundo_reserva', g.res, 'seguro', g.seg, 'total', g.fc + g.adm + g.res + g.seg) order by g.faixa)$a$, ''))) /
       length($a$'fundo_comum', g.fc, 'taxa_adm', g.adm, 'fundo_reserva', g.res, 'seguro', g.seg, 'total', g.fc + g.adm + g.res + g.seg) order by g.faixa)$a$) <> 1 then raise exception 'A3'; end if;
    v_new := replace(v_new, $a$'fundo_comum', g.fc, 'taxa_adm', g.adm, 'fundo_reserva', g.res, 'seguro', g.seg, 'total', g.fc + g.adm + g.res + g.seg) order by g.faixa)$a$,
      $a$'fundo_comum', g.fc, 'taxa_adm', g.adm, 'fundo_reserva', g.res, 'seguro', g.seg, 'total', g.fc + g.adm + g.res + g.seg,
           'ajuste_arredondamento', g.aj) order by g.faixa)$a$);

    -- A4: a soma do ajuste por faixa
    if (length(v_new) - length(replace(v_new, $a$min((x->>'fundo_reserva')::numeric) res, min((x->>'seguro')::numeric) seg$a$, ''))) /
       length($a$min((x->>'fundo_reserva')::numeric) res, min((x->>'seguro')::numeric) seg$a$) <> 1 then raise exception 'A4'; end if;
    v_new := replace(v_new, $a$min((x->>'fundo_reserva')::numeric) res, min((x->>'seguro')::numeric) seg$a$,
      $a$min((x->>'fundo_reserva')::numeric) res, min((x->>'seguro')::numeric) seg,
                 sum((x->>'ajuste_arredondamento')::numeric) aj$a$);

    execute v_new;
    select prosrc into v_dst from pg_proc where oid = v_oid;
    if md5(v_dst) <> 'f1c4342b16ccb7417b03dfedc0a675b3' then raise exception 'fn_consorcio_cronograma: destino inesperado %', md5(v_dst); end if;
  end if;

  ---------------------------------------------------------------------------------------------------------------------------------
  -- 2. a tela: a parcela gravada com o fundo comum do gerador leva a marca
  v_oid := 'public.fn_consorcio_tela(uuid, date)'::regprocedure;
  select prosrc into v_src from pg_proc where oid = v_oid;
  if md5(v_src) = '45092bc1a53b927e10d876137346d8fb' then raise notice 'fn_consorcio_tela ja no destino'; else
    if md5(v_src) <> '3b16754d70316151e764eaeb95062c33' then raise exception 'fn_consorcio_tela: origem inesperada %', md5(v_src); end if;
    v_def := pg_get_functiondef(v_oid);
    v_new := v_def;

    -- T1
    if (length(v_new) - length(replace(v_new, $a$c public.financiamento_consorcio%rowtype; v_parc jsonb; v_op jsonb;$a$, ''))) /
       length($a$c public.financiamento_consorcio%rowtype; v_parc jsonb; v_op jsonb;$a$) <> 1 then raise exception 'T1'; end if;
    v_new := replace(v_new, $a$c public.financiamento_consorcio%rowtype; v_parc jsonb; v_op jsonb;$a$,
      $a$c public.financiamento_consorcio%rowtype; v_parc jsonb; v_op jsonb; v_cron jsonb;$a$);
    -- T2
    if (length(v_new) - length(replace(v_new, $a$  select * into c from public.financiamento_consorcio where financiamento_id = p_id;$a$, ''))) /
       length($a$  select * into c from public.financiamento_consorcio where financiamento_id = p_id;$a$) <> 1 then raise exception 'T2'; end if;
    v_new := replace(v_new, $a$  select * into c from public.financiamento_consorcio where financiamento_id = p_id;$a$,
      $a$  select * into c from public.financiamento_consorcio where financiamento_id = p_id;
  v_cron := public.fn_consorcio_cronograma(public._fn_consorcio_regras_do_contrato(p_id));$a$);
    -- T3
    if (length(v_new) - length(replace(v_new, $a$'total', q.valor_total, 'faixa', q.faixa,$a$, ''))) / length($a$'total', q.valor_total, 'faixa', q.faixa,$a$) <> 1 then raise exception 'T3'; end if;
    v_new := replace(v_new, $a$'total', q.valor_total, 'faixa', q.faixa,$a$, $a$'total', q.valor_total, 'ajuste_arredondamento', ga.aj, 'faixa', q.faixa,$a$);
    -- T4
    if (length(v_new) - length(replace(v_new, $a$and v.desfeito_em is null and not coalesce(l.cancelado, false)) dv on true$a$, ''))) /
       length($a$and v.desfeito_em is null and not coalesce(l.cancelado, false)) dv on true$a$) <> 1 then raise exception 'T4'; end if;
    v_new := replace(v_new, $a$and v.desfeito_em is null and not coalesce(l.cancelado, false)) dv on true$a$,
      $a$and v.desfeito_em is null and not coalesce(l.cancelado, false)) dv on true
    left join lateral (select (x->>'ajuste_arredondamento')::numeric aj from jsonb_array_elements(coalesce(v_cron->'linhas', '[]'::jsonb)) x
                        where (x->>'numero')::int = q.numero_parcela and x ? 'ajuste_arredondamento'
                          and (x->>'fundo_comum')::numeric = q.valor_fundo_comum limit 1) ga on true$a$);
    -- T5
    if (length(v_new) - length(replace(v_new, $a$'fundo_comum', g.fc, 'taxa_adm', g.adm, 'fundo_reserva', g.res, 'seguro', g.seg, 'total', g.tot) order by g.faixa)$a$, ''))) /
       length($a$'fundo_comum', g.fc, 'taxa_adm', g.adm, 'fundo_reserva', g.res, 'seguro', g.seg, 'total', g.tot) order by g.faixa)$a$) <> 1 then raise exception 'T5'; end if;
    v_new := replace(v_new, $a$'fundo_comum', g.fc, 'taxa_adm', g.adm, 'fundo_reserva', g.res, 'seguro', g.seg, 'total', g.tot) order by g.faixa)$a$,
      $a$'fundo_comum', g.fc, 'taxa_adm', g.adm, 'fundo_reserva', g.res, 'seguro', g.seg, 'total', g.tot,
                 'ajuste_arredondamento', (select sum((pp->>'ajuste_arredondamento')::numeric) from jsonb_array_elements(v_parc) pp
                                            where (pp->>'faixa')::int = g.faixa)) order by g.faixa)$a$);
    -- T6
    if (length(v_new) - length(replace(v_new, $a$'cronograma', public.fn_consorcio_cronograma(public._fn_consorcio_regras_do_contrato(p_id)) - 'linhas',$a$, ''))) /
       length($a$'cronograma', public.fn_consorcio_cronograma(public._fn_consorcio_regras_do_contrato(p_id)) - 'linhas',$a$) <> 1 then raise exception 'T6'; end if;
    v_new := replace(v_new, $a$'cronograma', public.fn_consorcio_cronograma(public._fn_consorcio_regras_do_contrato(p_id)) - 'linhas',$a$,
      $a$'cronograma', v_cron - 'linhas',$a$);

    execute v_new;
    select prosrc into v_dst from pg_proc where oid = v_oid;
    if md5(v_dst) <> '45092bc1a53b927e10d876137346d8fb' then raise exception 'fn_consorcio_tela: destino inesperado %', md5(v_dst); end if;
  end if;

  ---------------------------------------------------------------------------------------------------------------------------------
  -- 3. ACL igual (CREATE OR REPLACE preserva; conferido)
  if (select proacl::text from pg_proc where oid = 'public.fn_consorcio_cronograma(jsonb)'::regprocedure)
       <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
     or (select proacl::text from pg_proc where oid = 'public.fn_consorcio_tela(uuid, date)'::regprocedure)
       <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' then
    raise exception 'ACL mudou';
  end if;
end $mig$;
