-- NOTA-ENTREGA-FUTURA-01 (B) · mock aprovado pelo Gabriel 25/11 07:44 (`ui-validar/nota-entrega-documentos-ref/mock-aprovado.html`) — a LEITURA,
-- no banco, da aba Documentos de uma compra com entrega futura: o PAPEL de cada documento e o SALDO A ENTREGAR por item. Só leitura.
-- · O PAPEL sai do que já existe, nenhuma coluna nova:
--     a COMPRA (é a NF do lançamento e do LCDPR) = a NF que gera a conta (a classe pelo CFOP não é "não financeira") que é o SIMPLES
--       FATURAMENTO (5922/6922; entrada 1922/2922), senão a do nº do lançamento, senão a ÚNICA que gera a conta. Várias e nenhuma assim (o milho
--       do João Rodrigo: contrato + entregas em NF de venda 5101) = nenhuma é a compra: ficam 'nota' e o saldo diz 'sem_compra' (nunca escolher
--       errado);
--     outra NF que gera a conta = 'nota';
--     NF de remessa de entrega futura (5116/5117/6116/6117: motivo 'entrega_futura') = 'entrega', numeradas 1, 2… pela emissão;
--     outra NF não financeira = o motivo dela ('devolucao', 'comodato'…); boleto = 'boleto'; comprovante = 'comprovante'; o resto = 'outro'.
--   O PDF e o XML da mesma nota (a mesma chave) têm o mesmo papel e o mesmo número de entrega.
-- · Os DOCUMENTOS do lançamento = os dele + os ligados a ele (`financeiro_documento_vinculos`: a NF da compra registrada na 1ª parcela).
-- · O SALDO por item: os itens da compra × os das entregas, casados pelo CÓDIGO do produto (é o mesmo emitente) ou, sem código, pela descrição
--   normalizada, e pela unidade. Os itens vêm de `nota_fiscal_itens`; sem eles, do XML da caixa (`fiscal_dfe_recebidos.xml`: `det` → cProd,
--   xProd, uCom, qCom) — o MESMO caminho do `_fn_doc_motivo_nao_financeira`. Sem a compra ou sem os itens dela: `itens` nulo e o `motivo`.
--   Devolução ainda não abate (fase seguinte, com a regra do valor).
-- · SECURITY DEFINER (lê a caixa e chama a interna `_fn_doc_motivo_nao_financeira`) com o cliente RESOLVIDO pelo lançamento + `tenant_ok`
--   (42501, nunca vazio no lugar). Nasce fechada: só `authenticated` e `service_role`.

set local lock_timeout = '2s';
set local statement_timeout = '30s';

create or replace function public._fn_itens_da_nota_fiscal(p_cliente uuid, p_chave text)
returns table(codigo text, descricao text, unidade text, quantidade numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare v_xml text;
begin
  if exists (select 1 from public.nota_fiscal n join public.nota_fiscal_itens i on i.nota_id = n.id
              where n.cliente_id = p_cliente and n.chave_acesso = p_chave) then
    return query select nullif(btrim(i.codigo), ''), i.descricao, lower(btrim(coalesce(i.unidade, ''))), coalesce(i.quantidade, 0)
      from public.nota_fiscal n join public.nota_fiscal_itens i on i.nota_id = n.id
     where n.cliente_id = p_cliente and n.chave_acesso = p_chave order by i.n_item;
    return;
  end if;
  select r.xml into v_xml from public.fiscal_dfe_recebidos r where r.cliente_id = p_cliente and r.chave = p_chave and r.xml is not null limit 1;
  if v_xml is null then return; end if;
  return query
    select nullif(btrim((regexp_match(d[1], '<cProd>([^<]*)</cProd>'))[1]), ''),
           (regexp_match(d[1], '<xProd>([^<]*)</xProd>'))[1],
           lower(btrim(coalesce((regexp_match(d[1], '<uCom>([^<]*)</uCom>'))[1], ''))),
           coalesce(nullif((regexp_match(d[1], '<qCom>([^<]*)</qCom>'))[1], '')::numeric, 0)
      from regexp_matches(v_xml, '<det nItem="\d+">(.*?)</det>', 'g') d;
end $fn$;

revoke all on function public._fn_itens_da_nota_fiscal(uuid, text) from public, anon, authenticated;

/* a nota é SIMPLES FATURAMENTO (5922/6922; a entrada 1922/2922): pelos itens gravados, senão pelo XML da caixa */
create or replace function public._fn_nota_eh_faturamento(p_cliente uuid, p_chave text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (select 1 from public.nota_fiscal n join public.nota_fiscal_itens i on i.nota_id = n.id
                  where n.cliente_id = p_cliente and n.chave_acesso = p_chave and i.cfop in ('5922', '6922', '1922', '2922'))
      or exists (select 1 from public.fiscal_dfe_recebidos r where r.cliente_id = p_cliente and r.chave = p_chave
                  and r.xml ~ '<CFOP>(5922|6922|1922|2922)</CFOP>')
$fn$;

revoke all on function public._fn_nota_eh_faturamento(uuid, text) from public, anon, authenticated;

create or replace function public.fn_lancamento_entregas(p_lancamento uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  v_cliente uuid; v_numero text; v_saida jsonb;
begin
  select l.cliente_id, ltrim(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), '0') into v_cliente, v_numero
    from public.financeiro_lancamentos_v2 l where l.id = p_lancamento;
  if v_cliente is null or not public.tenant_ok(v_cliente) then
    raise exception 'Entregas: sem acesso a este lançamento.' using errcode = '42501';
  end if;

  with docs as (
    select d.id, d.especie, nullif(regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g'), '') chave,
           ltrim(regexp_replace(coalesce(d.numero, ''), '\D', '', 'g'), '0') numero, d.data_emissao emissao
      from public.financeiro_lancamento_documentos d
     where d.cliente_id = v_cliente and d.cancelado is not true
       and (d.lancamento_id = p_lancamento
            or d.id in (select v.documento_id from public.financeiro_documento_vinculos v where v.cliente_id = v_cliente and v.lancamento_id = p_lancamento))),
  classe as (
    select x.*, case when x.especie = 'nf' and x.chave is not null then public._fn_doc_motivo_nao_financeira(v_cliente, x.chave) end motivo from docs x),
  /* a COMPRA: das NF que geram a conta, o simples faturamento; senão a do nº do lançamento; senão a única. Nenhuma dessas = sem compra */
  pagantes as (
    select distinct on (x.chave) x.chave, x.numero, x.emissao, public._fn_nota_eh_faturamento(v_cliente, x.chave) fat
      from classe x where x.especie = 'nf' and x.motivo is null and x.chave is not null order by x.chave),
  compra as (
    select p.chave, p.numero from pagantes p
     where p.fat or p.numero = v_numero or (select count(*) from pagantes) = 1
     order by p.fat desc, (p.numero = v_numero) desc, p.emissao nulls last, p.numero limit 1),
  entregas as (
    select x.chave, row_number() over (order by min(x.emissao) nulls last, min(x.numero)) n
      from classe x where x.especie = 'nf' and x.motivo = 'entrega_futura' and x.chave is not null group by x.chave),
  papeis as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'documento_id', x.id,
             'papel', case when x.especie = 'nf' and x.motivo = 'entrega_futura' then 'entrega'
                           when x.especie = 'nf' and x.motivo is not null then x.motivo
                           when x.especie = 'nf' and x.chave is not null and x.chave = (select c.chave from compra c) then 'compra'
                           when x.especie = 'nf' then 'nota'
                           when x.especie in ('boleto', 'comprovante') then x.especie else 'outro' end,
             'n', e.n) order by x.id), '[]'::jsonb) j
      from classe x left join entregas e on e.chave = x.chave),
  itens_compra as (
    select i.* from compra c cross join lateral public._fn_itens_da_nota_fiscal(v_cliente, c.chave) i),
  comprados as (
    select coalesce(i.codigo, public._fn_normalizar_texto(i.descricao)) k, i.unidade, min(i.descricao) produto, sum(i.quantidade) q
      from itens_compra i group by 1, 2),
  entregues as (
    select coalesce(i.codigo, public._fn_normalizar_texto(i.descricao)) k, i.unidade, sum(i.quantidade) q
      from entregas e cross join lateral public._fn_itens_da_nota_fiscal(v_cliente, e.chave) i group by 1, 2),
  itens as (
    select jsonb_agg(jsonb_build_object('produto', c.produto, 'unidade', c.unidade, 'comprado', c.q, 'entregue', coalesce(g.q, 0),
             'falta', greatest(c.q - coalesce(g.q, 0), 0)) order by c.produto) j
      from comprados c left join entregues g on g.k = c.k and g.unidade = c.unidade)
  select jsonb_build_object(
           'compra', (select jsonb_build_object('chave', c.chave, 'nf', c.numero) from compra c),
           'entregas', (select count(*) from entregas),
           'papeis', (select p.j from papeis p),
           'itens', (select i.j from itens i),
           'motivo', case when not exists (select 1 from compra) then 'sem_compra'
                          when not exists (select 1 from itens_compra) then 'sem_itens_da_compra' end)
    into v_saida;
  return v_saida;
end $fn$;

revoke all on function public.fn_lancamento_entregas(uuid) from public, anon;
grant execute on function public.fn_lancamento_entregas(uuid) to authenticated, service_role;
