-- SEG-ANON-REVOKE-01 (SEG-AUDIT-02 R5, Gabriel 23/11/2026: "REVOKE do anon nas 43 relações — os bkp_* só listados, sem dropar").
-- O QUE FAZ: tira TODO privilégio do papel anon (quem não fez login) nas 43 relações do public que ainda o tinham (41 tabelas + 2 views;
--   até TRUNCATE, que não passa pela RLS). Hoje a RLS já devolve zero linha ao anon em todas (as políticas dependem de auth.uid()):
--   isto tira a dependência de uma barreira só. Nenhuma tela lê banco antes do login (AuthPage/DefinirSenhaPage sem .from/.rpc).
--   A CAUSA fica registrada e NÃO é mudada aqui: as permissões padrão do schema (pg_default_acl de postgres e supabase_admin) dão
--   arwdDxtm ao anon em toda tabela nova; por isso cada tabela nova precisa do revoke (proposta à parte: ALTER DEFAULT PRIVILEGES).
-- NÃO FAZ: não dropa nada (os 25 backups bkp_*/_bkp_*/*_bkp_* ficam, só perdem o anon); não muda authenticated nem service_role;
--   não muda política, dado ou corpo.
-- DESFAZER: GRANT ALL ON <relação> TO anon (o estado anterior era arwdDxtm em todas, menos financeiro_lancamento_documentos: arwxtm).

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $chegou$ begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
         and has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')) <> 43 then
    raise exception 'SEG-ANON-REVOKE-01: o anon não tem exatamente as 43 relações medidas em 23/11. Nada foi gravado.';
  end if;
end $chegou$;

revoke all on table public._bkp_p0h_cbi_20260630 from anon;
revoke all on table public._bkp_p0h_extrato_20260630 from anon;
revoke all on table public._bkp_p0h_lancto_20260630 from anon;
revoke all on table public._bkp_venc_20260823 from anon;
revoke all on table public._bkp_venc_b_20260823 from anon;
revoke all on table public.agri_barter_contratos from anon;
revoke all on table public.agri_colheita_lancamentos from anon;
revoke all on table public.agri_contratos_armazenagem from anon;
revoke all on table public.agri_cotacao_graos from anon;
revoke all on table public.agri_estoque_movimentacoes from anon;
revoke all on table public.agri_locais_estoque from anon;
revoke all on table public.agri_oc_entregas from anon;
revoke all on table public.agri_oc_insumos from anon;
revoke all on table public.agri_oc_partes from anon;
revoke all on table public.agri_operacoes_comerciais from anon;
revoke all on table public.bkp_fin_normalizacao_01_20260829 from anon;
revoke all on table public.bkp_lanc_forn_oc_20260828 from anon;
revoke all on table public.bkp_monterrey_tipouso_20260820 from anon;
revoke all on table public.bkp_oc_canceladas_20260827 from anon;
revoke all on table public.bkp_oc_compromissos_canc_20260827 from anon;
revoke all on table public.bkp_oc_documentos_canc_20260827 from anon;
revoke all on table public.bkp_oc_eventos_canc_20260827 from anon;
revoke all on table public.bkp_oc_liquidacoes_canc_20260827 from anon;
revoke all on table public.bkp_oc_lotes_canc_20260827 from anon;
revoke all on table public.bkp_oc_movimentacoes_canc_20260827 from anon;
revoke all on table public.bkp_oc_parcelas_canc_20260827 from anon;
revoke all on table public.bkp_oc_partes_canc_20260827 from anon;
revoke all on table public.bkp_oc_programacoes_canc_20260827 from anon;
revoke all on table public.bkp_oc_titulo_conta_20260827 from anon;
revoke all on table public.bkp_oc_venda_cutover_20260830 from anon;
revoke all on table public.bkp_si_muchachas_bois_20260820 from anon;
revoke all on table public.fechamento_p1 from anon;
revoke all on table public.fechamento_p1_snapshot from anon;
revoke all on table public.fechamento_pastos_membros from anon;
revoke all on table public.fin_juros_comp_bkp_20260826 from anon;
revoke all on table public.financeiro_lancamento_documentos from anon;
revoke all on table public.financeiro_recorrencias from anon;
revoke all on table public.financeiro_saldo_documentos from anon;
revoke all on table public.meta_valor_rebanho_status_bkp_20260825 from anon;
revoke all on table public.vw_lancamento_documentos from anon;
revoke all on table public.vw_oc_obrigacoes from anon;
revoke all on table public.zoo_operacao_abate from anon;
revoke all on table public.zoo_operacao_exclusoes_teste from anon;

-- chegada: nenhuma relação do public com privilégio do anon; authenticated e service_role intactos nas 43
do $chegada$
declare v_n int;
begin
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
     and has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger');
  if v_n <> 0 then raise exception 'SEG-ANON-REVOKE-01: % relações seguem com o anon. Nada foi gravado.', v_n; end if;
  if not has_table_privilege('authenticated', 'public.financeiro_recorrencias', 'select,insert,update')
     or not has_table_privilege('authenticated', 'public.vw_oc_obrigacoes', 'select')
     or not has_table_privilege('service_role', 'public.fechamento_p1', 'select,insert,update,delete') then
    raise exception 'SEG-ANON-REVOKE-01: authenticated/service_role mudaram. Nada foi gravado.';
  end if;
end $chegada$;
