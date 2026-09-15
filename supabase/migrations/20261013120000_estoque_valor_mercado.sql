-- PR-ESTOQUE-VALOR-MERCADO — o preco de MERCADO de hoje ao lado do preco ja' realizado.
--
-- ⚠ JA APLICADA NO PROTO quando esta migration foi escrita. E' REGISTRO HISTORICO, para que um
--   banco novo, replayando as migrations, chegue ao mesmo estado. Nao foi reaplicada.
-- ⚠ OS DOIS CORPOS NAO FORAM REDIGITADOS: extraidos do banco vivo com `pg_get_functiondef` em
--   base64 e conferidos pelo md5 do texto decodificado —
--       b993c508cf3e6933a163b97dc7778d7e  fn_estoque_graos              (2.186 bytes)
--       bcaa7351a4152c8bbf478d25b03a0416  agri_cotacao_graos_registrar    (805 bytes)
--
-- A PERGUNTA QUE ELA ABRE: ate' aqui o estoque so' sabia dizer quanto o grao parado valeria ao
--   preco que JA' SE PRATICOU — `preco_ref` e' a media ponderada do que se entregou. E' um numero
--   do passado. Quem decide segurar ou vender precisa do outro: quanto ele vale HOJE. Os dois
--   lado a lado sao a decisao; um so' e' meia informacao.
--
-- ⚠ A COTACAO E' UM HISTORICO, NAO UM CADASTRO — a tabela ACUMULA linhas, uma por registro, e
--   nunca sobrescreve. Nao ha' UNIQUE em (cliente, cultura, classe, data) de proposito: registrar
--   duas vezes no mesmo dia guarda as duas, e a leitura pega a ultima. Um cadastro de "preco
--   atual" responderia a mesma pergunta hoje e nenhuma amanha — e a serie e' o que permite, mais
--   tarde, mostrar a curva.
--
-- ⚠ O `distinct on` E' O QUE FAZ "A MAIS RECENTE" SER UMA SO': ele escolhe UMA linha por classe,
--   ordenada por `data_referencia desc`. Sem ele, a tabela de estoque multiplicaria a linha da
--   classe por quantas cotacoes existissem — a mesma classe apareceria tres vezes, com tres
--   precos, e a soma do cartao do topo triplicaria.
-- ⚠ E O INDICE EXISTE PARA ELE: `(cliente_id, cultura, classe_aflatoxina, data_referencia desc)`
--   cobre exatamente a chave do `distinct on` e a ordem que ele pede.
--
-- ⚠ ZERO NO `preco_mercado` E' "NAO HA' COTACAO", NAO "VALE ZERO". O `left join` deixa `m.*` nulo
--   quando a classe nunca foi cotada e o `coalesce(...,0)` do jsonb transforma isso em zero,
--   porque o contrato do payload e' numerico. Quem le' o payload TEM de distinguir os dois casos
--   pelo `data_mercado`: ele vem NULL quando nao ha' cotacao nenhuma, e essa e' a unica sentinela
--   confiavel — um preco de zero reais e' registravel (o CHECK admite `>= 0`).
--
-- ⚠⚠ `valor_mercado` NAO APLICA A TOLERANCIA DE MEIO SACO, e `saldo` aplica. Sao duas contas
--   diferentes sobre a mesma diferenca: `saldo` zera quando |colhido-entregue| < 0,5, enquanto
--   `valor` e `valor_mercado` multiplicam `greatest(colhido-entregue, 0)` cru. Para diferenca
--   NEGATIVA os dois concordam (o `greatest` zera). Para uma diferenca POSITIVA pequena — 0,3
--   saca, digamos — a tela mostraria "0,00 sc em estoque" ao lado de um valor em reais.
--   MEDIDO EM 14/09/2026 SOBRE O PROTO INTEIRO: zero ocorrencias. A divergencia e' LATENTE, nao
--   observavel — e e' HERDADA, nao introduzida aqui: `valor` ja' fazia a conta assim desde a F1 e
--   `valor_mercado` so' usa a mesma base. Fica anotado porque, no dia em que um romaneio arredondar
--   para o lado positivo, o sintoma vai parecer defeito de cotacao e a causa esta' escrita aqui.
--
-- ⚠ AS POLICIES SAO `_open` — `using (true)` nas quatro. Nao ha' filtro de `cliente_id`: a defesa
--   do tenant nesta tabela e' a mesma do resto do modulo agri, e endurece-la aqui sozinha seria
--   divergir do padrao vigente sem fechar nada. Registrado como esta' no banco.

-- ----------------------------------------------------------------------------------------------
-- 1. A TABELA DE COTACOES
-- ----------------------------------------------------------------------------------------------

create table if not exists public.agri_cotacao_graos (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null,
  cultura text not null,
  classe_aflatoxina text not null,
  data_referencia date not null,
  preco_saca numeric not null,
  fonte text,
  observacoes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (id),
  -- ⚠ O MESMO VOCABULARIO DAS ENTREGAS do barter, e nao um vocabulario novo: e' por estas tres
  --   strings que a cotacao encontra a classe do estoque no `using(classe)`. Uma quarta classe
  --   aqui nao apareceria na tela — cairia fora do join, calada.
  check (classe_aflatoxina = any (array['ate_20'::text, 'acima_20'::text, 'roca'::text])),
  -- ⚠ `>= 0`, NAO `> 0`: cotacao de zero e' registravel. E' o que obriga `data_mercado` a ser a
  --   sentinela de ausencia, e nao o preco.
  check (preco_saca >= (0)::numeric)
);

alter table public.agri_cotacao_graos enable row level security;

drop policy if exists agri_cotacao_graos_select_open on public.agri_cotacao_graos;
create policy agri_cotacao_graos_select_open on public.agri_cotacao_graos for select using (true);

drop policy if exists agri_cotacao_graos_insert_open on public.agri_cotacao_graos;
create policy agri_cotacao_graos_insert_open on public.agri_cotacao_graos for insert with check (true);

drop policy if exists agri_cotacao_graos_update_open on public.agri_cotacao_graos;
create policy agri_cotacao_graos_update_open on public.agri_cotacao_graos for update using (true);

drop policy if exists agri_cotacao_graos_delete_open on public.agri_cotacao_graos;
create policy agri_cotacao_graos_delete_open on public.agri_cotacao_graos for delete using (true);

create index if not exists idx_cotacao_graos_lookup
  on public.agri_cotacao_graos using btree (cliente_id, cultura, classe_aflatoxina, data_referencia desc);

-- ⚠ O GRANT E' O DO BRIEFING, e ele e' REDUNDANTE NO PROTO de proposito: o Supabase mantem um
--   `alter default privileges` global no schema public que ja' da' ALL a `anon` e `authenticated`
--   em toda tabela nova — medido, a ACL viva e'
--       {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
--   Escrever `authenticated` aqui nao concede nada que ela ja' nao tenha; serve para que um banco
--   SEM aquele default (um Postgres cru, um replay fora do Supabase) chegue ao minimo necessario.
-- ⚠ E O `anon` NAO E' VERSIONADO AQUI. Ele existe no Proto, mas veio do default global — nao foi
--   decisao desta feature —, e com as policies `_open` acima ele significa leitura e escrita da
--   cotacao sem autenticar. Propaga-lo por escrito transformaria um efeito colateral herdado em
--   intencao registrada. E' a mesma familia ja' anotada como [SEC-RPC-P0]; sai por la', para todo
--   o schema, e nao numa migration de feature.
grant all on public.agri_cotacao_graos to authenticated;

-- ----------------------------------------------------------------------------------------------
-- 2. fn_estoque_graos — tres campos novos no payload
-- ----------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_estoque_graos(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_res jsonb;
begin
  with colhido as (
    select case when c.aflatoxina_ppb>20 then 'acima_20' else 'ate_20' end classe, sum(c.sacas_boas) sc
    from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo group by 1
    union all
    select 'roca', sum(c.grao_roca_sacas) from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
    where a.safra_id=p_safra_id and a.cliente_id=p_cliente and a.cultura=p_cultura and c.ativo
  ),
  colh as (select classe, sum(sc) colhido from colhido group by 1),
  entregue as (
    select e.classe_aflatoxina classe, sum(e.sacas) entregue, sum(e.sacas*e.preco_saca)/nullif(sum(e.sacas),0) preco
    from agri_oc_entregas e join agri_operacoes_comerciais o on o.id=e.operacao_id
    where o.safra_id=p_safra_id and e.cliente_id=p_cliente and o.cultura=p_cultura group by 1
  ),
  mercado as (
    select distinct on (classe_aflatoxina) classe_aflatoxina classe, preco_saca, data_referencia
    from agri_cotacao_graos where cliente_id=p_cliente and cultura=p_cultura
    order by classe_aflatoxina, data_referencia desc
  )
  select jsonb_agg(jsonb_build_object(
    'classe', classe, 'colhido', round(coalesce(colhido,0),2), 'entregue', round(coalesce(entregue,0),2),
    'saldo', case when abs(coalesce(colhido,0)-coalesce(entregue,0))<0.5 then 0 else round(coalesce(colhido,0)-coalesce(entregue,0),2) end,
    'preco_ref', round(coalesce(preco,0),2),
    'valor', round(greatest(coalesce(colhido,0)-coalesce(entregue,0),0)*coalesce(preco,0),2),
    'preco_mercado', round(coalesce(m.preco_saca,0),2),
    'data_mercado', m.data_referencia,
    'valor_mercado', round(greatest(coalesce(colhido,0)-coalesce(entregue,0),0)*coalesce(m.preco_saca,0),2)
  ) order by classe) into v_res from colh full outer join entregue using(classe) left join mercado m using(classe);
  return coalesce(v_res,'[]'::jsonb);
end $function$;

-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: `create or replace` preserva privilegios, mas num
--   banco novo a funcao nasce com EXECUTE para PUBLIC por default do Postgres. Sem estas duas
--   linhas o replay das migrations produziria uma RPC mais aberta que a do Proto.
revoke all on function public.fn_estoque_graos(uuid, uuid, text) from public;
grant execute on function public.fn_estoque_graos(uuid, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------------------------
-- 3. agri_cotacao_graos_registrar — grava as classes de uma vez
-- ----------------------------------------------------------------------------------------------
--
-- ⚠ CLASSE SEM PRECO E' PULADA, NAO GRAVADA COMO ZERO: o `if` so' insere quando o preco veio e e'
--   >= 0. O modal manda as tres classes sempre, e quem so' tem cotacao da roca deixa as outras
--   duas em branco — gravar zero nelas apagaria a cotacao anterior, que continua valendo.
-- ⚠ O RETORNO DIZ QUANTAS GRAVOU, e e' o que a tela tem para confirmar: "3 gravadas" e "0
--   gravadas" sao respostas diferentes para o mesmo clique, e sem o contador as duas pareceriam
--   sucesso igual.

CREATE OR REPLACE FUNCTION public.agri_cotacao_graos_registrar(p_cliente uuid, p_cultura text, p_data date, p_fonte text, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare it jsonb; v_n int:=0;
begin
  for it in select * from jsonb_array_elements(p_itens) loop
    if (it->>'preco')::numeric is not null and (it->>'preco')::numeric >= 0 then
      insert into public.agri_cotacao_graos(cliente_id,cultura,classe_aflatoxina,data_referencia,preco_saca,fonte,created_by,updated_by)
        values(p_cliente,p_cultura,it->>'classe',p_data,(it->>'preco')::numeric,coalesce(p_fonte,'manual'),auth.uid(),auth.uid());
      v_n := v_n+1;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'gravadas',v_n);
end $function$;

revoke all on function public.agri_cotacao_graos_registrar(uuid, text, date, text, jsonb) from public;
grant execute on function public.agri_cotacao_graos_registrar(uuid, text, date, text, jsonb) to authenticated;
