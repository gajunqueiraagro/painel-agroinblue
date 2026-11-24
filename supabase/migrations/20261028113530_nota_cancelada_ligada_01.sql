-- PENDÊNCIA DE DOCUMENTO · "nota cancelada · trocar o documento" (Gabriel 24/11, caso Kemp) — a LEITURA, no banco, das notas fiscais
-- ligadas a lançamento que a Receita deu como CANCELADAS depois. O Code 2 liga na pendência de documento dele; aqui não há tela.
-- · A REGRA é a da lista das Notas da Receita (`situacaoNaLista`, src/lib/fiscal/notasDaReceita.ts): cancelada = a nota recebida está em
--   `situacao = 'cancelado_na_sefaz'` OU tem evento `110111` (cancelamento) nos eventos DA NOTA (`fiscal_dfe_recebidos.resumo -> 'eventos'`,
--   onde a busca guarda o resEvento/procEventoNFe; `fiscal_dfe_eventos` é só a NOSSA ciência 210210 e recusa outro tipo). Nenhuma regra nova.
-- · O DOCUMENTO: NF viva em `financeiro_lancamento_documentos` (cancelado is not true) cuja chave (só dígitos) é a da nota cancelada.
--   Uma linha por lançamento afetado: o dono do documento (`ligado = false`) e os ligados a ele por `financeiro_documento_vinculos`
--   (`ligado = true`).
-- · `cancelada_em` + `origem`: com evento 110111, a data do evento na Receita (`em` do evento; `origem = 'evento'`); sem evento, a data em
--   que a busca soube do cancelamento (`fiscal_dfe_recebidos.atualizado_em`, `origem = 'situacao'`). No proto (24/11): 10 canceladas, as 10
--   com o 110111 nos eventos da nota; nenhuma com documento vivo.
-- · Só leitura. SECURITY INVOKER (a RLS por cliente de cada tabela vale) + `tenant_ok` na entrada (42501, nunca vazio no lugar).

set local lock_timeout = '2s';
set local statement_timeout = '30s';

create or replace function public.fn_notas_canceladas_ligadas(p_cliente uuid)
returns table(documento_id uuid, lancamento_id uuid, ligado boolean, chave text, numero text, emitente_nome text, emissao date,
              cancelada_em timestamptz, origem text)
language plpgsql
stable
security invoker
set search_path to 'public'
as $fn$
begin
  if p_cliente is null or not public.tenant_ok(p_cliente) then
    raise exception 'Notas canceladas: sem acesso a este cliente.' using errcode = '42501';
  end if;
  return query
  with canceladas as (
    select r.chave, r.emissao, r.emitente_nome, ev.dh as dh_evento, (ev.tem is true) as pelo_evento, r.atualizado_em
      from public.fiscal_dfe_recebidos r
      left join lateral (
        select bool_or(true) tem,
               min(case when e->>'em' ~ '^\d{4}-\d{2}-\d{2}T' then (e->>'em')::timestamptz end) dh
          from jsonb_array_elements(case when jsonb_typeof(r.resumo->'eventos') = 'array' then r.resumo->'eventos' else '[]'::jsonb end) e
         where e->>'tpEvento' = '110111') ev on true
     where r.cliente_id = p_cliente
       and (r.situacao = 'cancelado_na_sefaz' or ev.tem is true)),
  docs as (
    select d.id, d.lancamento_id, d.numero, regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') as ch
      from public.financeiro_lancamento_documentos d
     where d.cliente_id = p_cliente and d.cancelado is not true and coalesce(d.chave_acesso, '') <> '')
  select d.id, x.lancamento_id, x.ligado, c.chave, d.numero, c.emitente_nome, c.emissao,
         coalesce(c.dh_evento, c.atualizado_em), case when c.pelo_evento then 'evento' else 'situacao' end
    from canceladas c
    join docs d on d.ch = c.chave
    cross join lateral (
      select d.lancamento_id, false as ligado
      union
      select v.lancamento_id, true from public.financeiro_documento_vinculos v
       where v.documento_id = d.id and v.cliente_id = p_cliente and v.lancamento_id is distinct from d.lancamento_id) x
   where x.lancamento_id is not null
   order by coalesce(c.dh_evento, c.atualizado_em) desc, d.numero;
end $fn$;

revoke all on function public.fn_notas_canceladas_ligadas(uuid) from public, anon;
grant execute on function public.fn_notas_canceladas_ligadas(uuid) to authenticated, service_role;
