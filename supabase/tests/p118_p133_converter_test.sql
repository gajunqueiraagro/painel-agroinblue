-- P118 + P133 (depois da 20261028112420) — converter os antigos com backup, e DESFAZER, cliente a cliente. Termina em RAISE 'OK'.
-- Transacao revertida. Clientes pequenos para caber no tempo do canal: RRCC (lancamentos em caixa alta, sem itens) e NJ (lancamentos E itens
-- da nota, e o P133). Na ORDEM REAL: P118 primeiro, P133 depois; o desfazer na ordem contraria.
--   V1 simular p118 no RRCC: devolve as contagens e NADA muda (md5 das descricoes do cliente igual; nenhum backup)
--   V2 aplicar p118 no RRCC: nenhuma descricao de lancamento vivo convertivel sobra; o backup tem cada uma
--   V3 aplicar p118 no NJ: nenhum lancamento NEM item da nota convertivel sobra; o backup tem cada item
--   V4 aplicar p133 no NJ: nenhum "NF n · " com o numero do documento sobra
--   V5 a Auditoria diz "sistema:p118-caixa-alta" (app.via) nos eventos da conversao
--   V6 desfazer p133 (NJ), p118 (NJ) e p118 (RRCC): o md5 das descricoes (lancamentos e itens) dos dois clientes volta a ser o de antes
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '55s';
DO $teste$
declare
  c_rrcc constant uuid := '537661af-a934-4c66-b138-f8dbc378a00f'; c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_md5_r text; v_md5_n text; v_md5_i text; v_r jsonb; v_n int;
begin
  select md5(string_agg(id::text || coalesce(descricao, '∅'), '|' order by id)) into v_md5_r from public.financeiro_lancamentos_v2 where cliente_id = c_rrcc;
  select md5(string_agg(id::text || coalesce(descricao, '∅'), '|' order by id)) into v_md5_n from public.financeiro_lancamentos_v2 where cliente_id = c_nj;
  select md5(string_agg(id::text || coalesce(descricao, '∅'), '|' order by id)) into v_md5_i from public.nota_fiscal_itens where cliente_id = c_nj;

  -- V1
  v_r := public.fn_texto_conversao_aplicar('p118-caixa-alta', c_rrcc, true);
  if (v_r->>'total')::int = 0 then raise exception 'V1 simulacao sem nada: %', v_r; end if;
  if (select md5(string_agg(id::text || coalesce(descricao, '∅'), '|' order by id)) from public.financeiro_lancamentos_v2 where cliente_id = c_rrcc) <> v_md5_r
    then raise exception 'V1 a simulacao mudou lancamentos'; end if;
  if exists (select 1 from public.texto_conversao_backup) then raise exception 'V1 a simulacao deixou backup'; end if;

  -- V2
  v_r := public.fn_texto_conversao_aplicar('p118-caixa-alta', c_rrcc, false);
  select count(*) into v_n from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c_rrcc and l.cancelado is not true and public._fn_descricao_caixa(l.descricao) is distinct from l.descricao;
  if v_n <> 0 then raise exception 'V2 sobraram % lancamentos em caixa alta', v_n; end if;
  if (select count(*) from public.texto_conversao_backup where operacao = 'p118-caixa-alta' and cliente_id = c_rrcc) <> (v_r->>'total')::int
    then raise exception 'V2 backup <> convertidos (%)', v_r; end if;

  -- V3
  v_r := public.fn_texto_conversao_aplicar('p118-caixa-alta', c_nj, false);
  select count(*) into v_n from public.nota_fiscal_itens i
   where i.cliente_id = c_nj and public._fn_descricao_caixa(i.descricao) is distinct from i.descricao;
  if v_n <> 0 then raise exception 'V3 sobraram % itens em caixa alta', v_n; end if;
  select count(*) into v_n from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c_nj and l.cancelado is not true and public._fn_descricao_caixa(l.descricao) is distinct from l.descricao;
  if v_n <> 0 then raise exception 'V3 sobraram % lancamentos em caixa alta', v_n; end if;
  select count(*) into v_n from public.texto_conversao_backup where operacao = 'p118-caixa-alta' and cliente_id = c_nj and tabela = 'nota_fiscal_itens';
  if v_n = 0 or v_n is distinct from (select (e->>'n')::int from jsonb_array_elements(v_r->'por_cliente') e where e->>'tabela' = 'nota_fiscal_itens')
    then raise exception 'V3 backup dos itens (%) <> convertidos (%)', v_n, v_r; end if;

  -- V4
  v_r := public.fn_texto_conversao_aplicar('p133', c_nj, false);
  if (v_r->>'total')::int < 1 then raise exception 'V4 p133 nao converteu: %', v_r; end if;
  select count(*) into v_n from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c_nj and l.cancelado is not true and l.descricao ~ '^NF [0-9.]+ · '
     and ltrim(regexp_replace(substring(l.descricao from '^NF ([0-9.]+) · '), '\D', '', 'g'), '0')
       = ltrim(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), '0');
  if v_n <> 0 then raise exception 'V4 sobraram % com o prefixo', v_n; end if;

  -- V5
  if not exists (select 1 from public.audit_log a join public.texto_conversao_backup b on b.registro_id = a.registro_id
                  where b.operacao = 'p118-caixa-alta' and a.via = 'sistema:p118-caixa-alta' and a.created_at >= now())
    then raise exception 'V5 a Auditoria nao diz a rotina'; end if;

  -- V6
  v_r := public.fn_texto_conversao_desfazer('p133', c_nj);
  v_r := public.fn_texto_conversao_desfazer('p118-caixa-alta', c_nj);
  v_r := public.fn_texto_conversao_desfazer('p118-caixa-alta', c_rrcc);
  if (select md5(string_agg(id::text || coalesce(descricao, '∅'), '|' order by id)) from public.financeiro_lancamentos_v2 where cliente_id = c_rrcc) <> v_md5_r
    then raise exception 'V6 RRCC nao voltou ao original'; end if;
  if (select md5(string_agg(id::text || coalesce(descricao, '∅'), '|' order by id)) from public.financeiro_lancamentos_v2 where cliente_id = c_nj) <> v_md5_n
    then raise exception 'V6 NJ nao voltou ao original'; end if;
  if (select md5(string_agg(id::text || coalesce(descricao, '∅'), '|' order by id)) from public.nota_fiscal_itens where cliente_id = c_nj) <> v_md5_i
    then raise exception 'V6 itens do NJ nao voltaram ao original'; end if;

  raise exception 'OK p133=% p118_rrcc=% p118_nj_lanc=% p118_nj_itens=%',
    (select count(*) from public.texto_conversao_backup where operacao = 'p133'),
    (select count(*) from public.texto_conversao_backup where operacao = 'p118-caixa-alta' and cliente_id = c_rrcc),
    (select count(*) from public.texto_conversao_backup where operacao = 'p118-caixa-alta' and cliente_id = c_nj and tabela = 'financeiro_lancamentos_v2'),
    (select count(*) from public.texto_conversao_backup where operacao = 'p118-caixa-alta' and cliente_id = c_nj and tabela = 'nota_fiscal_itens');
end $teste$;
ROLLBACK;
