-- CONC-SPLIT-FILHO-CANCELADO-01 passo 2, commit A (Gabriel, 11/10/2026): CANCELAR UM FILHO DE DESMEMBRAMENTO TRAVA NO BANCO.
-- O desmembramento da Mesa tem dono (classificacao_splits / classificacao_split_itens; quem o desfaz e'
-- fn_classificacao_desfazer_split). Ate' aqui qualquer caminho cancelava um filho: o gatilho desfazia o vinculo dele e o extrato
-- ficava 'parcial', SEM PORTA DE SAIDA (medido em 11/10: cinco funcoes recusam extrato com vinculo vivo; caso da Santa Rita,
-- consertado por script). Agora o filho de split VIVO so' se cancela pelo dono — o molde da parcela de parcelamento
-- (guard_parcelamento_lancamento_cancelar + app.parcelamento_escritor).
--   (1) _fn_split_vivo_do_lancamento(lancamento): O UNICO lugar que responde "e' filho de split vivo?" (trava, RPC da tela e,
--       no passo 3, a Conferencia). Interna, fechada. Indice: classificacao_split_itens_filho_idx (ja' existe).
--   (2) trg_guard_split_filho_cancelar: BEFORE UPDATE OF cancelado em financeiro_lancamentos_v2, quando passa a cancelado. Com
--       split vivo e sem a chave app.split_escritor = 'on' (transacao): P0001 com a frase. Sem split vivo: passa.
--   (3) fn_classificacao_desfazer_split (patch guardado por md5, origem a4ff7cf6e7ad260340583e57dad7c6fe): liga a chave em volta
--       do laco que cancela os filhos e a desliga logo depois. A recusa 'filho_cancelado' NAO foi tocada (passo 3).
--   (4) fn_split_do_lancamento(lancamento) -> jsonb | NULL: o que a tela mostra antes do gesto; `desfazivel` e o motivo sao a
--       SIMULACAO do proprio desfazer.
-- ⚠ NAO COBRE: os desmembramentos ANTIGOS sem registro (lancamento 'mesa_split' fora de classificacao_split_itens).
-- NENHUM DADO E' ALTERADO.
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public._fn_split_vivo_do_lancamento(p_lancamento_id uuid)
 RETURNS TABLE(split_id uuid, extrato_id uuid, staging_id uuid)
 LANGUAGE sql STABLE
AS $function$
  select s.id, s.extrato_id, i.staging_id
    from public.classificacao_split_itens i
    join public.classificacao_splits s on s.id = i.split_id
   where i.filho_id = p_lancamento_id and s.desfeito_em is null
   order by s.criado_em desc
   limit 1
$function$;
REVOKE ALL ON FUNCTION public._fn_split_vivo_do_lancamento(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.guard_split_filho_cancelar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v record;
  e record;
  v_n int;
begin
  if coalesce(current_setting('app.split_escritor', true), 'off') = 'on' then
    return new;
  end if;
  select * into v from public._fn_split_vivo_do_lancamento(new.id);
  if not found then
    return new;
  end if;
  select x.data_movimento, x.valor into e from public.extrato_bancario_v2 x where x.id = v.extrato_id;
  select count(*) into v_n from public.classificacao_split_itens i where i.split_id = v.split_id;
  raise exception using errcode = 'P0001', message = format(
    'Este lançamento é parte do desmembramento do extrato de %s (R$ %s, %s lançamentos). Cancelar por aqui deixaria o extrato parcial, sem como completar. Desfaça o desmembramento pela Mesa do Enriquecer.',
    coalesce(to_char(e.data_movimento, 'DD/MM/YYYY'), '—'),
    translate(to_char(abs(coalesce(e.valor, 0)), 'FM999,999,999,990.00'), ',.', '.,'), v_n);
end
$function$;
REVOKE ALL ON FUNCTION public.guard_split_filho_cancelar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_guard_split_filho_cancelar
  BEFORE UPDATE OF cancelado ON public.financeiro_lancamentos_v2
  FOR EACH ROW WHEN (new.cancelado IS TRUE AND old.cancelado IS DISTINCT FROM true)
  EXECUTE FUNCTION public.guard_split_filho_cancelar();

-- (3) o dono liga a chave em volta do laco que cancela os filhos
DO $patch$
declare
  c_origem  constant text := 'a4ff7cf6e7ad260340583e57dad7c6fe';
  c_destino constant text := '088982bfc08964d87975158b365a6d34';
  v_oid oid := 'public.fn_classificacao_desfazer_split(uuid, text, boolean)'::regprocedure;
  v_src text; v_new text;
  a1 constant text := $a$    FOR v_fil IN SELECT i.filho_id FROM classificacao_split_itens i WHERE i.split_id = v_sp.id ORDER BY i.filho_id LOOP
      PERFORM public.fn_cancelar_lancamento_auditoria(v_fil, v_motivo);
    END LOOP;$a$;
  n1 constant text := $a$    -- CONC-SPLIT-FILHO-CANCELADO-01: o filho de split vivo so' se cancela pelo dono — a chave vale so' neste laco
    PERFORM set_config('app.split_escritor', 'on', true);
    FOR v_fil IN SELECT i.filho_id FROM classificacao_split_itens i WHERE i.split_id = v_sp.id ORDER BY i.filho_id LOOP
      PERFORM public.fn_cancelar_lancamento_auditoria(v_fil, v_motivo);
    END LOOP;
    PERFORM set_config('app.split_escritor', 'off', true);$a$;
begin
  select prosrc into v_src from pg_proc where oid = v_oid;
  if md5(v_src) is distinct from c_origem then
    raise exception 'fn_classificacao_desfazer_split: origem % (esperado %)', md5(v_src), c_origem;
  end if;
  -- a ancora casa 1x, e o CONCEITO tambem: um so' cancelamento de filho, um so' laco sobre os filhos
  if (length(v_src) - length(replace(v_src, a1, ''))) / length(a1) <> 1
     or (select count(*) from regexp_matches(v_src, 'fn_cancelar_lancamento_auditoria', 'g')) <> 1
     or (select count(*) from regexp_matches(v_src, 'FOR v_fil IN', 'g')) <> 1
     or (select count(*) from regexp_matches(v_src, 'cancelado = true', 'gi')) <> 0 then
    raise exception 'fn_classificacao_desfazer_split: ancora nao casa exatamente 1x';
  end if;
  v_new := replace(v_src, a1, n1);
  if md5(v_new) is distinct from c_destino then
    raise exception 'fn_classificacao_desfazer_split: destino % (esperado %)', md5(v_new), c_destino;
  end if;
  if position(v_src in pg_get_functiondef(v_oid)) = 0 then raise exception 'corpo nao achado na definicao'; end if;
  execute replace(pg_get_functiondef(v_oid), v_src, v_new);
  if (select md5(prosrc) from pg_proc where oid = v_oid) is distinct from c_destino then
    raise exception 'fn_classificacao_desfazer_split: gravado diferente do destino';
  end if;
end
$patch$;

-- (4) o que a tela mostra antes do gesto. VOLATILE: chama a simulacao do desfazer (que executa e desfaz); nao grava nada.
CREATE FUNCTION public.fn_split_do_lancamento(p_lancamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cli uuid := (select l.cliente_id from public.financeiro_lancamentos_v2 l where l.id = p_lancamento_id);
  v record;
  s public.classificacao_splits%rowtype;
  v_sim jsonb;
begin
  if v_cli is null or not coalesce(public.tenant_ok(v_cli), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  select * into v from public._fn_split_vivo_do_lancamento(p_lancamento_id);
  if not found then
    return null;
  end if;
  select * into s from public.classificacao_splits where id = v.split_id;
  v_sim := public.fn_classificacao_desfazer_split(v.staging_id, null, true);
  return jsonb_build_object(
    'split_id', s.id,
    'extrato', (select jsonb_build_object('id', e.id, 'data', e.data_movimento, 'valor', e.valor, 'descricao', e.descricao,
                         'conta_nome', coalesce(nullif(c.nome_exibicao, ''), c.nome_conta))
                  from public.extrato_bancario_v2 e
                  left join public.financeiro_contas_bancarias c on c.id = e.conta_bancaria_id
                 where e.id = s.extrato_id),
    'importacao', jsonb_build_object('sessao_id', s.sessao_id,
                    'criada_em', coalesce((select x.criado_em from public.classificacao_sessoes x where x.id = s.sessao_id),
                                          (select min(z.created_at) from public.financeiro_classificacao_staging z where z.sessao_id = s.sessao_id))),
    'filhos', (select coalesce(jsonb_agg(jsonb_build_object('lancamento_id', i.filho_id, 'descricao', f.descricao, 'valor', abs(f.valor),
                         'cancelado', coalesce(f.cancelado, false), 'este', i.filho_id = p_lancamento_id)
                         order by abs(f.valor) desc nulls last, i.filho_id), '[]'::jsonb)
                 from public.classificacao_split_itens i
                 left join public.financeiro_lancamentos_v2 f on f.id = i.filho_id
                where i.split_id = s.id),
    'total_filhos', (select count(*) from public.classificacao_split_itens i where i.split_id = s.id),
    'soma_vivos', (select coalesce(sum(abs(f.valor)), 0) from public.classificacao_split_itens i
                     join public.financeiro_lancamentos_v2 f on f.id = i.filho_id
                    where i.split_id = s.id and f.cancelado is not true),
    'desfazivel', coalesce((v_sim->>'ok')::boolean, false),
    'motivo_nao_desfazivel', case when coalesce((v_sim->>'ok')::boolean, false) then null else v_sim->>'mensagem' end);
end
$function$;
REVOKE ALL ON FUNCTION public.fn_split_do_lancamento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_split_do_lancamento(uuid) TO authenticated, service_role;

DO $confere$
begin
  if has_function_privilege('anon', 'public.fn_split_do_lancamento(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_split_do_lancamento(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_split_vivo_do_lancamento(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.guard_split_filho_cancelar()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_classificacao_desfazer_split(uuid, text, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_classificacao_desfazer_split(uuid, text, boolean)', 'EXECUTE') then
    raise exception 'ACL diferente do esperado';
  end if;
end
$confere$;
