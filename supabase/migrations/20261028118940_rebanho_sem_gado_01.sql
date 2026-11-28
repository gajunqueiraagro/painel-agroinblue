-- REBANHO-SEM-GADO-01 (Gabriel 27/11 16:43, "já pedi 1000 vezes") — A FAZENDA SÓ ENTRA NO FECHAMENTO DO REBANHO DE UM MÊS SE, NAQUELE MÊS,
-- TIVER PASTO CADASTRADO OU SALDO DE REBANHO > 0 OU MOVIMENTAÇÃO DE REBANHO. Universal e automático: nenhuma marca manual decide
-- (a `fazendas.tem_pecuaria` segue existindo, sem dado apagado, mas não decide pendência).
--   1. `_fn_fazenda_rebanho_no_mes(fazenda, 'AAAA-MM')` — A REGRA, num lugar só:
--        pasto  = pasto ativo e vigente no mês (`fn_pasto_vigente_no_mes`), fora a conta técnica de ajuste ('divergencia');
--        saldo  = o saldo do rebanho no INÍCIO (o fim do último mês do cache ANTES deste) e no FIM (o fim do último mês do cache ATÉ este)
--                 — mês sem linha no cache herda o último que existe (nunca vira "sem saldo" por falta de cálculo);
--        mov    = lançamento zootécnico REALIZADO vivo com data no mês.
--      Zerou o gado e não tem pasto → no mês seguinte não entra (saldo 0, sem movimento); voltou gado → o movimento o põe de volta.
--   2. `_fn_status_pilares_fechamento` (a autoridade de todas as telas: faixa e modal da Visão geral, régua do ano, pendências, aviso do
--      mês anterior, P1 do lançamento): fazenda FORA do mês → os dois pilares 'nao_aplicavel' (a tela já lê esse par como "sem gado");
--      "valor do rebanho" só é pedido com saldo > 0 no fim do mês (sem gado = 'nao_aplicavel', inclusive no mês ainda não aberto).
--      O resto do corpo e a ordem do p2 são os de hoje (patch guardado pelo md5 da definição: 65fce486…).
-- Medido antes (proto, 2026, todos os clientes): sai do fechamento SÓ a Faz. São João (Santa Rita) nos 11 meses; deixam de pedir o valor
-- (saldo 0) Sta. Luzia e Bom Retiro em nov/26 e a Teste Cana; nenhuma fazenda com gado muda. NADA aqui altera linha de dado.
set lock_timeout = '2s';

do $$
begin
  if md5(pg_get_functiondef('public._fn_status_pilares_fechamento'::regproc)) <> '65fce486e5034a771a8de117d22176f1' then
    raise exception 'REBANHO-SEM-GADO-01: _fn_status_pilares_fechamento mudou desde a leitura de 27/11: refazer o patch.';
  end if;
  if to_regprocedure('public._fn_fazenda_rebanho_no_mes(uuid, text)') is not null then
    raise exception 'REBANHO-SEM-GADO-01: _fn_fazenda_rebanho_no_mes já existe: refazer.';
  end if;
end $$;

-- ═══ 1. a regra ═══
create function public._fn_fazenda_rebanho_no_mes(_fazenda_id uuid, _ano_mes text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ini date := to_date(_ano_mes || '-01', 'YYYY-MM-DD');
  v_fim date := (to_date(_ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_pasto boolean; v_mov boolean; v_saldo_ini integer; v_saldo_fim integer;
begin
  select exists (select 1 from pastos p where p.fazenda_id = _fazenda_id and p.tipo_uso is distinct from 'divergencia'
                   and public.fn_pasto_vigente_no_mes(p.ativo, p.data_inicio, p.data_fim, _ano_mes))
    into v_pasto;
  select exists (select 1 from lancamentos l where l.fazenda_id = _fazenda_id and l.cenario = 'realizado' and not coalesce(l.cancelado, false)
                   and l.data between v_ini and v_fim)
    into v_mov;
  select coalesce(sum(z.saldo_final), 0) into v_saldo_fim from zoot_mensal_cache z
   where z.fazenda_id = _fazenda_id and z.cenario = 'realizado'
     and z.ano_mes = (select max(y.ano_mes) from zoot_mensal_cache y where y.fazenda_id = _fazenda_id and y.cenario = 'realizado' and y.ano_mes <= _ano_mes);
  select coalesce(sum(z.saldo_final), 0) into v_saldo_ini from zoot_mensal_cache z
   where z.fazenda_id = _fazenda_id and z.cenario = 'realizado'
     and z.ano_mes = (select max(y.ano_mes) from zoot_mensal_cache y where y.fazenda_id = _fazenda_id and y.cenario = 'realizado' and y.ano_mes < _ano_mes);
  return jsonb_build_object('no_fechamento', v_pasto or v_mov or v_saldo_ini > 0 or v_saldo_fim > 0,
    'pasto', v_pasto, 'movimento', v_mov, 'saldo_inicio', v_saldo_ini, 'saldo_fim', v_saldo_fim);
end $$;
revoke all on function public._fn_fazenda_rebanho_no_mes(uuid, text) from public, anon, authenticated;

-- ═══ 2. a autoridade do fechamento lê a regra ═══
CREATE OR REPLACE FUNCTION public._fn_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
      _cards_no_mes    int;
      _total_pastos    int;
      _pastos_fechados int;
      _pastos_pecuaria int;
      _p1_status       text;
      _p2_status       text;
      _mes_ini         date;
      _mes_fim         date;
      _rebanho         jsonb;
    BEGIN
      _mes_ini := to_date(_ano_mes || '-01', 'YYYY-MM-DD');
      _mes_fim := (_mes_ini + interval '1 month - 1 day')::date;

      /* REBANHO-SEM-GADO-01: sem pasto, sem saldo e sem movimentação no mês = fora do fechamento (os 2 pilares 'nao_aplicavel') */
      _rebanho := public._fn_fazenda_rebanho_no_mes(_fazenda_id, _ano_mes);
      IF NOT (_rebanho->>'no_fechamento')::boolean THEN
        RETURN jsonb_build_object(
          'fazenda_id',               _fazenda_id,
          'ano_mes',                  _ano_mes,
          'p1_mapa_pastos',           jsonb_build_object('status', 'nao_aplicavel'),
          'p2_valor_rebanho',         jsonb_build_object('status', 'nao_aplicavel'),
          'p3_financeiro_caixa',      jsonb_build_object('status', 'nao_implementado'),
          'p4_competencia',           jsonb_build_object('status', 'nao_implementado'),
          'p5_economico_consolidado', jsonb_build_object('status', 'nao_implementado')
        );
      END IF;

      SELECT count(*)
        INTO _cards_no_mes
        FROM fechamento_pastos
       WHERE fazenda_id = _fazenda_id
         AND ano_mes    = _ano_mes;

      SELECT
        count(*),
        count(*) FILTER (WHERE fp.status = 'fechado')
      INTO _total_pastos, _pastos_fechados
      FROM fechamento_pastos fp
      JOIN pastos p ON p.id = fp.pasto_id
      WHERE fp.fazenda_id = _fazenda_id
        AND fp.ano_mes    = _ano_mes
        AND p.ativo
        AND p.tipo_uso IS DISTINCT FROM 'divergencia'
        AND public._fn_pai_do_piquete(p.id) IS NULL AND NOT public._fn_pasto_e_area_da_fazenda(p.tipo_uso, _ano_mes)
        AND (p.data_inicio IS NULL OR p.data_inicio <= _mes_fim)
        AND (p.data_fim    IS NULL OR p.data_fim    >= _mes_ini);

      IF _cards_no_mes = 0 THEN
        _p1_status := 'nao_iniciado';
      ELSIF _total_pastos > 0 AND _pastos_fechados = _total_pastos THEN
        _p1_status := 'oficial';
      ELSE
        _p1_status := 'pendente';
      END IF;

      SELECT count(*)
        INTO _pastos_pecuaria
        FROM fechamento_pastos fp
        JOIN pastos p ON p.id = fp.pasto_id
       WHERE fp.fazenda_id = _fazenda_id
         AND fp.ano_mes    = _ano_mes
         AND p.ativo
         AND coalesce(fp.tipo_uso_mes, p.tipo_uso) = ANY (public._fn_tipos_uso_com_rebanho());

      /* REBANHO-SEM-GADO-01: o valor do rebanho só é pedido com saldo > 0 no fim do mês (a ordem de antes, mais esse teste) */
      IF _cards_no_mes = 0 THEN
        _p2_status := CASE WHEN (_rebanho->>'saldo_fim')::int > 0 THEN 'nao_iniciado' ELSE 'nao_aplicavel' END;
      ELSIF EXISTS (
        SELECT 1 FROM valor_rebanho_fechamento
         WHERE fazenda_id = _fazenda_id
           AND ano_mes    = _ano_mes
           AND status     = 'fechado'
      ) THEN
        _p2_status := 'oficial';
      ELSIF _pastos_pecuaria = 0 OR (_rebanho->>'saldo_fim')::int <= 0 THEN
        _p2_status := 'nao_aplicavel';
      ELSE
        _p2_status := 'pendente';
      END IF;

      RETURN jsonb_build_object(
        'fazenda_id',               _fazenda_id,
        'ano_mes',                  _ano_mes,
        'p1_mapa_pastos',           jsonb_build_object('status', _p1_status),
        'p2_valor_rebanho',         jsonb_build_object('status', _p2_status),
        'p3_financeiro_caixa',      jsonb_build_object('status', 'nao_implementado'),
        'p4_competencia',           jsonb_build_object('status', 'nao_implementado'),
        'p5_economico_consolidado', jsonb_build_object('status', 'nao_implementado')
      );
    END;
    $function$;
