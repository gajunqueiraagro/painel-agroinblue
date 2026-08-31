-- FIN-CONCIL-PORTAR-01 — a fonte UNICA do placar. VIGENTE.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831174734.
-- (A 20260831174332 e' a primeira aplicacao, superada por esta.)
--
-- Portado de AllinBlues/financas (20260814200000_sugestoes_do_extrato.sql).
--
-- ⚠ A REGRA QUE ELA EXISTE PARA GARANTIR: o contador e a lista saem do MESMO
-- campo. `estado` vem por linha, e a tela conta e filtra por ele. Repetir o
-- predicado no front seria concordancia por manutencao manual.
-- ⚠ NAO RECALCULA SCORE: chama `fn_candidatos_conciliacao` por LATERAL pedindo o
-- topo, para o placar e a estacao sairem da MESMA regua.
-- ⚠ `where not vencido limit 1` NO LATERAL, como o original: quem entrou pela
-- porta dos vencidos e' CONTEXTO que o operador pediu ver, nao sugestao — e ele
-- vem primeiro no `order by` da funcao. Sem o filtro, um vencido de outro mes
-- viraria "a melhor sugestao" do movimento.
--
-- ⚠ A PRECEDENCIA DO ESTADO: conciliado | parcial vem da SITUACAO (verdade do
-- banco, e o score nunca define pendencia); depois sem_match (sem candidato
-- alcancavel), ambiguo (empate tecnico, onde ninguem e' pre-marcado),
-- match_direto (pre-marcado, >=90), provavel (>=50 sem pre-marca — invencao
-- declarada la, sem a qual a tela diria "sem match" com candidato a um clique) e
-- sem_match.
--
-- ⚠ CORPO CONFERIDO PELO ORACULO — md5 d1355dba90236a09cfb0fc5faf1faa2e,
-- 1148 caracteres, byte a byte igual ao aplicado.

create or replace function public.fn_sugestoes_extrato(
  p_cliente_id uuid, p_conta_bancaria_id uuid, p_de date, p_ate date
) returns table (
  extrato_id uuid, data_movimento date, valor text, descricao text, documento text,
  situacao text, valor_conciliado text, valor_aberto text,
  sugestao_id uuid, sugestao_descricao text, sugestao_favorecido text,
  sugestao_valor text, sugestao_status text,
  sugestao_delta_valor text, sugestao_delta_dias int,
  score int, pre_marcado boolean, ambiguo boolean, estado text
)
language sql stable security invoker set search_path = ''
as $function$
  select
    v.extrato_id,
    v.data_movimento,
    round(v.valor, 2)::text,
    v.descricao,
    v.documento,
    v.situacao,
    round(v.valor_conciliado, 2)::text,
    round(v.valor_aberto, 2)::text,
    s.id, s.descricao, s.favorecido, s.valor, s.status,
    s.delta_valor, s.delta_dias, s.score,
    coalesce(s.pre_marcado, false),
    coalesce(s.ambiguo, false),
    case
      when v.situacao = 'conciliado' then 'conciliado'
      when v.situacao = 'parcial'    then 'parcial'
      when s.id is null or s.indisponivel then 'sem_match'
      when s.ambiguo then 'ambiguo'
      when s.pre_marcado then 'match_direto'
      when s.score >= 50 then 'provavel'
      else 'sem_match'
    end
  from public.v_extrato_conciliacao v
  left join lateral (
    select * from public.fn_candidatos_conciliacao(v.cliente_id, v.extrato_id, 1)
     where not vencido
     limit 1
  ) s on true
  where v.cliente_id = p_cliente_id
    and v.conta_bancaria_id = p_conta_bancaria_id
    and v.cancelado_em is null
    and v.ignorado_em is null
    and v.data_movimento >= p_de
    and v.data_movimento <  p_ate
  order by v.data_movimento, v.extrato_id;
$function$;

comment on function public.fn_sugestoes_extrato(uuid, uuid, date, date) is
  'A fonte UNICA do placar da conciliacao: uma linha por movimento do mes, com a melhor sugestao do motor e o ESTADO da linha. NAO recalcula score — chama fn_candidatos_conciliacao por LATERAL (where not vencido, limit 1). Um campo so, para o contador dos baldes e a lista que eles filtram sairem da MESMA consulta. Portado de AllinBlues/financas (20260814200000).';

revoke all on function public.fn_sugestoes_extrato(uuid, uuid, date, date) from public, anon;
grant execute on function public.fn_sugestoes_extrato(uuid, uuid, date, date) to authenticated;
