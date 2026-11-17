-- NOTA-RECEITA-CASAR-01 (lote 21, Gabriel 17/11 10:35: mock aprovado, D1–D4): os lançamentos que PODEM SER a nota da Receita, para o
-- "Lançar" mostrar antes de criar outro (criar de novo duplica a despesa). Nunca casa sozinho: só lista.
-- Candidato = saída VIVA (não cancelada, não meta) do cliente, valor EXATO do total da nota, SEM NF anexada (documento NF ou com chave),
-- data (competência, senão vencimento, senão pagamento) de 15 dias ANTES a 60 dias DEPOIS da emissão (D1), qualquer conta (banco e cartão).
-- Classe (a ordem da tela): 'mesmo_cnpj' (raiz do CNPJ do fornecedor = a do emitente) · 'sem_fornecedor' (sem fornecedor, ou fornecedor sem
-- CNPJ) · 'outro_fornecedor' (D3: aparece com selo; a troca só marcada, pelo caminho de hoje).
-- Uma varredura para todas as notas (a lista pergunta uma vez, como a `fn_notas_ja_lancadas`).
create or replace function public.fn_notas_candidatos(p_cliente uuid, p_notas jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
 set plan_cache_mode to 'force_custom_plan'
as $function$
declare v_ret jsonb;
begin
  if p_cliente is null or not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception 'sem acesso a este registro' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_notas, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_notas, '[]'::jsonb)) > 2000 then
    raise exception using errcode = 'P0001', message = 'Notas fora do formato (lista de até 2000).';
  end if;
  with n as (
    select distinct on (ch) ch, emissao, valor_cent, raiz from (
      select regexp_replace(coalesce(x->>'chave', ''), '\D', '', 'g') ch,
             case when coalesce(x->>'emissao', '') ~ '^\d{4}-\d{2}-\d{2}' then left(x->>'emissao', 10)::date end emissao,
             case when coalesce(x->>'valor_cent', '') ~ '^\d+$' then (x->>'valor_cent')::bigint end valor_cent,
             left(regexp_replace(coalesce(x->>'emitente_documento', ''), '\D', '', 'g'), 8) raiz
        from jsonb_array_elements(coalesce(p_notas, '[]'::jsonb)) x) s
     where ch <> '' and emissao is not null and valor_cent > 0
     order by ch
  ),
  cand as (
    select n.ch, n.emissao, n.raiz, l.id, l.data_competencia, l.data_vencimento, l.data_pagamento, l.descricao, l.status_transacao,
           l.conta_bancaria_id, l.favorecido_id, round(l.valor * 100)::bigint valor_cent,
           coalesce(l.data_competencia, l.data_vencimento, l.data_pagamento) data_ref,
           (l.status_transacao = 'conciliado' or l.conciliado_em is not null) conciliado
      from n join public.financeiro_lancamentos_v2 l
        on l.cliente_id = p_cliente and not l.cancelado and coalesce(l.cenario, 'realizado') <> 'meta' and l.tipo_operacao like '2%'
       and round(l.valor * 100)::bigint = n.valor_cent
       and coalesce(l.data_competencia, l.data_vencimento, l.data_pagamento) between n.emissao - 15 and n.emissao + 60
     where not exists (select 1 from public.vw_lancamento_documentos d
                        where d.lancamento_id = l.id and d.cancelado is not true and (d.especie = 'nf' or nullif(d.chave_acesso, '') is not null))
  ),
  classe as (
    select c.*, f.nome fornecedor_nome, cb.nome_conta conta_nome, cb.tipo_conta conta_tipo,
           case when length(c.raiz) = 8 and length(regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g')) = 14
                     and left(regexp_replace(f.cpf_cnpj, '\D', '', 'g'), 8) = c.raiz then 'mesmo_cnpj'
                when f.id is null or regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g') = '' then 'sem_fornecedor'
                else 'outro_fornecedor' end classe
      from cand c
      left join public.financeiro_fornecedores f on f.id = c.favorecido_id
      left join public.financeiro_contas_bancarias cb on cb.id = c.conta_bancaria_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('chave', n.ch, 'candidatos', coalesce(k.lista, '[]'::jsonb)) order by n.ch), '[]'::jsonb)
    into v_ret
    from n left join (
      select ch, jsonb_agg(jsonb_build_object(
               'id', id, 'competencia', data_competencia, 'vencimento', data_vencimento, 'pagamento', data_pagamento, 'descricao', descricao,
               'status', status_transacao, 'conciliado', conciliado, 'valor_cent', valor_cent, 'conta', conta_nome, 'conta_tipo', conta_tipo,
               'fornecedor_id', favorecido_id, 'fornecedor_nome', fornecedor_nome, 'classe', classe)
             order by case classe when 'mesmo_cnpj' then 0 when 'sem_fornecedor' then 1 else 2 end, abs(data_ref - emissao), id) lista
        from classe group by ch) k on k.ch = n.ch;
  return v_ret;
end $function$;

revoke all on function public.fn_notas_candidatos(uuid, jsonb) from public, anon;
grant execute on function public.fn_notas_candidatos(uuid, jsonb) to authenticated;
