-- PERFIL-PROPRIETARIO B — lote 118790 (Code 4; OPENFINANCE-PRONTO-NJ-01 item 8, GO do Gabriel 25/11 14:30). Roda DEPOIS do 118780.
-- O Proprietário tem tudo o que o Gestor tem: as 12 funções que perguntam por 'gestor_cliente' passam a aceitar 'proprietario'.
-- D-P1 sim: um Proprietário ativo por cliente (índice único parcial + a frase pronta no editar acesso).
-- D-P2 sim: o certificado fiscal aceita o Proprietário (as 3 funções do fiscal estão na lista).
-- Quem dá o perfil continua sendo só o admin do AGROinBLUE (`_fn_membro_editar` não muda nessa parte).
-- As comparações novas são por TEXTO ('proprietario' entre aspas, sem `::perfil_acesso`): a função compila sem depender do valor do enum.
-- ⚠ PATCH GUARDADO POR MD5: cada função só é trocada se o corpo de hoje for o conferido em 25/11; cada trecho tem de casar o número
--   exato de vezes; o corpo novo tem de ser diferente do antigo. Qualquer divergência para o lote inteiro.
set local lock_timeout = '2s';

do $patch$
declare
  r record; v_def text; v_novo text; v_md5 text; v_n int; v_trecho jsonb;
begin
  for r in select * from (values
    ('public._fn_documento_pode_ver(uuid)'::regprocedure, 'f0ab20e503b03e6d5c1ee8bc8868976d',
     jsonb_build_array(jsonb_build_array($$m.perfil = 'gestor_cliente'$$, $$m.perfil in ('gestor_cliente', 'proprietario')$$, 1))),
    ('public._fn_entrada_pode_gerir(uuid)'::regprocedure, '4b129ba8558950567f6a3e9ed1c60149',
     jsonb_build_array(jsonb_build_array($$m.ativo and m.perfil = 'gestor_cliente'$$, $$m.ativo and m.perfil in ('gestor_cliente', 'proprietario')$$, 1))),
    ('public._fn_fiscal_certificado_pode(uuid)'::regprocedure, 'c616e234bfcabb0586dbf1b5ff5fcc25',
     jsonb_build_array(jsonb_build_array($$get_user_perfil(auth.uid(), p_cliente)::text = 'gestor_cliente'$$,
                                         $$get_user_perfil(auth.uid(), p_cliente)::text in ('gestor_cliente', 'proprietario')$$, 1))),
    ('public.fn_fiscal_certificado_recusa_registrar(uuid, uuid, text)'::regprocedure, '9a5d620cfbec6fba21331ec6de45f0d8',
     jsonb_build_array(jsonb_build_array($$get_user_perfil(p_autor, t.cliente_id)::text = 'gestor_cliente'$$,
                                         $$get_user_perfil(p_autor, t.cliente_id)::text in ('gestor_cliente', 'proprietario')$$, 1))),
    ('public.fn_fiscal_certificado_registrar(uuid, uuid, jsonb, text, text)'::regprocedure, 'cea578bab1b543b8f874c8b8903e8f2e',
     jsonb_build_array(jsonb_build_array($$get_user_perfil(p_autor, t.cliente_id)::text = 'gestor_cliente'$$,
                                         $$get_user_perfil(p_autor, t.cliente_id)::text in ('gestor_cliente', 'proprietario')$$, 1))),
    ('public.can_manage_financeiro_importacao_v2(uuid)'::regprocedure, '1546db7a7724aec36f0a332eb3300aba',
     jsonb_build_array(jsonb_build_array($$get_user_perfil(auth.uid(), _cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)$$,
                                         $$get_user_perfil(auth.uid(), _cliente_id)::text IN ('gestor_cliente', 'proprietario', 'financeiro')$$, 1))),
    ('public.can_manage_financeiro_lancamento_v2(uuid, text)'::regprocedure, '1546db7a7724aec36f0a332eb3300aba',
     jsonb_build_array(jsonb_build_array($$get_user_perfil(auth.uid(), _cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)$$,
                                         $$get_user_perfil(auth.uid(), _cliente_id)::text IN ('gestor_cliente', 'proprietario', 'financeiro')$$, 1))),
    ('public.cancel_zoot_importacao(uuid)'::regprocedure, '3ce2194e2e0b8bf4b040bf447b0611c2',
     jsonb_build_array(jsonb_build_array($$get_user_perfil(auth.uid(), v_imp.cliente_id) IN ('gestor_cliente'::public.perfil_acesso)$$,
                                         $$get_user_perfil(auth.uid(), v_imp.cliente_id)::text IN ('gestor_cliente', 'proprietario')$$, 1))),
    ('public.fn_aprovacao_enviar(uuid, uuid[], boolean)'::regprocedure, 'a8426dcc992f46717429a575e445c211',
     jsonb_build_array(jsonb_build_array($$in ('gestor_cliente', 'financeiro')) then$$, $$in ('gestor_cliente', 'proprietario', 'financeiro')) then$$, 1))),
    ('public.fn_bpo_agendador_gravar(uuid, uuid, boolean, boolean)'::regprocedure, 'a692c497ecf87c6e723bdbb1fdf53e9f',
     jsonb_build_array(
       jsonb_build_array($$m.perfil in ('gestor_cliente', 'financeiro')) then$$, $$m.perfil in ('gestor_cliente', 'proprietario', 'financeiro')) then$$, 1),
       jsonb_build_array($$(gestor ou financeiro)$$, $$(proprietário, gestor ou financeiro)$$, 1))),
    ('public.fn_bpo_aprovador_gravar(uuid, uuid, boolean, boolean)'::regprocedure, '1312cb33a2a6783ae203439d9fee9e87',
     jsonb_build_array(
       jsonb_build_array($$m.perfil in ('gestor_cliente', 'financeiro')) then$$, $$m.perfil in ('gestor_cliente', 'proprietario', 'financeiro')) then$$, 1),
       jsonb_build_array($$(gestor ou financeiro)$$, $$(proprietário, gestor ou financeiro)$$, 1))),
    ('public._fn_membro_editar(uuid, uuid, text, text, text, uuid[], boolean)'::regprocedure, '6660cdda5533400b24ef57309b23bc5c',
     jsonb_build_array(
       jsonb_build_array($$p_perfil NOT IN ('gestor_cliente', 'financeiro', 'campo', 'leitura')$$,
                         $$p_perfil NOT IN ('proprietario', 'gestor_cliente', 'financeiro', 'campo', 'leitura')$$, 1),
       jsonb_build_array($$  IF cardinality(v_fazendas) = 0 THEN$$,
                         $$  IF p_perfil = 'proprietario' AND EXISTS (SELECT 1 FROM public.cliente_membros o WHERE o.cliente_id = v_m.cliente_id
                                                 AND o.id <> v_m.id AND o.ativo AND o.perfil = 'proprietario') THEN
    RAISE EXCEPTION 'Este cliente já tem um Proprietário: troque o perfil dele antes.' USING ERRCODE = 'P0001';
  END IF;
  IF cardinality(v_fazendas) = 0 THEN$$, 1),
       jsonb_build_array($$CASE p_perfil WHEN 'gestor_cliente' THEN 'gerente'$$,
                         $$CASE p_perfil WHEN 'proprietario' THEN 'gerente' WHEN 'gestor_cliente' THEN 'gerente'$$, 1)))
  ) x(fn, md5_antes, trechos) loop
    select md5(prosrc), pg_get_functiondef(oid) into v_md5, v_def from pg_proc where oid = r.fn;
    if v_md5 is distinct from r.md5_antes then
      raise exception 'PERFIL-PROPRIETARIO B: % mudou desde a conferência (md5 % , esperava %)', r.fn, v_md5, r.md5_antes; end if;
    v_novo := v_def;
    for v_trecho in select * from jsonb_array_elements(r.trechos) loop
      v_n := (length(v_novo) - length(replace(v_novo, v_trecho->>0, ''))) / length(v_trecho->>0);
      if v_n <> (v_trecho->>2)::int then
        raise exception 'PERFIL-PROPRIETARIO B: em % o trecho "%" casa % vez(es), esperava %', r.fn, v_trecho->>0, v_n, v_trecho->>2; end if;
      v_novo := replace(v_novo, v_trecho->>0, v_trecho->>1);
    end loop;
    execute v_novo;
    if (select md5(prosrc) from pg_proc where oid = r.fn) = r.md5_antes then
      raise exception 'PERFIL-PROPRIETARIO B: % não mudou', r.fn; end if;
  end loop;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%gestor_cliente%'
              and p.prosrc not like '%proprietario%') then
    raise exception 'PERFIL-PROPRIETARIO B: sobrou função que aceita o gestor e não o Proprietário: %',
      (select string_agg(p.proname, ', ') from pg_proc p where p.pronamespace = 'public'::regnamespace
          and p.prosrc like '%gestor_cliente%' and p.prosrc not like '%proprietario%'); end if;
end $patch$;

-- D-P1: um Proprietário ativo por cliente
create unique index cliente_membros_um_proprietario on public.cliente_membros (cliente_id) where perfil = 'proprietario' and ativo;
