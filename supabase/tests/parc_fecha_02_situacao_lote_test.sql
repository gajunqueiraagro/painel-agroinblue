-- PARC-FECHA-02 (item 2) — `fn_financiamentos_situacao_lote`: o lote e' o dono, contrato a contrato.
-- Roda depois da 20261027194500, numa transacao que TERMINA EM RAISE. So' leitura; admin simulado.
-- L1 para TODO contrato de cada cliente, lote[id] = fn_financiamento_situacao(id) (jsonb igual), e o conjunto de ids e' o do cliente;
--    a contagem comparada e' dita e nao pode ser zero. L2 cliente nulo e sem usuario: 42501. L3 a cancelada nao entra (pelo dono).
set local statement_timeout = '90s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE r record; v_l jsonb; v_n int := 0; v_dif int := 0; v_cli int := 0; v_canc int;
BEGIN
  FOR r IN select c.id, c.nome from clientes c where exists (select 1 from financiamentos f where f.cliente_id = c.id) LOOP
    v_l := fn_financiamentos_situacao_lote(r.id, date '2026-10-06');
    v_cli := v_cli + 1;
    IF (select count(*) from jsonb_object_keys(v_l)) <> (select count(*) from financiamentos f where f.cliente_id = r.id) THEN
      RAISE EXCEPTION 'L1: % — o lote nao tem todos os contratos do cliente', r.nome; END IF;
    select count(*), count(*) filter (where v_l -> f.id::text is distinct from fn_financiamento_situacao(f.id, date '2026-10-06'))
      into v_n, v_dif from financiamentos f where f.cliente_id = r.id;
    IF v_dif <> 0 THEN RAISE EXCEPTION 'L1: % — % de % contratos diferem do dono', r.nome, v_dif, v_n; END IF;
  END LOOP;
  IF v_cli = 0 THEN RAISE EXCEPTION 'L1: nenhum cliente comparado (conjunto vazio nao prova nada)'; END IF;
  -- L3: nenhuma parcela 'cancelado' aparece no lote
  select count(*) into v_canc from financiamentos f, jsonb_array_elements(fn_financiamentos_situacao_lote(f.cliente_id, date '2026-10-06') -> f.id::text -> 'parcelas') e
   where f.id in (select q.financiamento_id from financiamento_parcelas q where q.status = 'cancelado')
     and (e->>'id')::uuid in (select q.id from financiamento_parcelas q where q.status = 'cancelado');
  IF v_canc <> 0 THEN RAISE EXCEPTION 'L3: % parcela(s) cancelada(s) no lote', v_canc; END IF;
  -- L2
  BEGIN perform fn_financiamentos_situacao_lote(null, current_date); RAISE EXCEPTION 'L2: cliente nulo devolveu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  perform set_config('request.jwt.claims', '', true);
  BEGIN perform fn_financiamentos_situacao_lote('f2d67cd4-24d0-456f-a079-a3281dcce7fd', current_date); RAISE EXCEPTION 'L2: sem usuario devolveu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE EXCEPTION 'OK parc_fecha_02_situacao_lote (L1-L3; % clientes)', v_cli;
END $t$;
