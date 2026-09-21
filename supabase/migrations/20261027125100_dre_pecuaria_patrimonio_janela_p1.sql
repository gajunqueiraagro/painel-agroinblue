-- O PATRIMONIO DO DRE VOLTA A ACHAR O FECHAMENTO DO MES FINAL — a tela branca do Executivo.
--
-- ⚠ O DEFEITO ERA UMA COMPARACAO QUE NUNCA CASAVA. O CTE `per` monta os dois marcos do periodo:
--     select to_char(to_date(p_de||'-01','YYYY-MM-DD') - interval '1 month','YYYY-MM') p0,
--            p_ate p1
--   `p0` sai formatado como 'YYYY-MM'. `p1` sai CRU. E o front manda `p_ate='2026-06-30'`, uma
--   data completa — enquanto `valor_rebanho_fechamento_itens.ano_mes` e' sempre 'YYYY-MM'.
--   Medido em 21/09/2026: com o valor cru, `where i.ano_mes = per.p1` casa ZERO linhas; com
--   `left(p_ate,7)`, casa 81. E a coluna NUNCA tem dia — zero linhas no formato 'YYYY-MM-DD' na
--   tabela inteira. Nao era um mes sem fechamento: era uma comparacao impossivel, para toda
--   fazenda e todo periodo.
--
-- ⚠ E POR ISSO A TELA FICAVA BRANCA, nao so' com numero errado. Sem linhas em `p1`, `q1` e' zero,
--   e o CTE `c` calcula `v1_p0 - v0` — o rebanho inteiro vira PERDA. Dali saem divisoes por zero
--   e `null` nos agregados, o JSON chega ao front com `NaN`/`null` onde ele espera numero, e o
--   Executivo/DRE do Santa Rita nao renderizava.
--
-- ⚠ A ASSIMETRIA DENTRO DA PROPRIA LINHA E' A PROVA de que foi esquecimento, nao decisao: `p0`
--   passa por `to_char(..., 'YYYY-MM')` e `p1` nao passa por nada. Os dois alimentam o MESMO
--   `where i.ano_mes = ...`, contra a MESMA coluna.
--
-- A CORRECAO E' UMA PALAVRA:   p_ate p1   ->   left(p_ate,7) p1
--   `left` e nao `to_char(to_date(...))` porque `p_ate` ja' chega como texto de data valido; passar
--   por `to_date` acrescentaria um ponto de falha para quem mandar 'YYYY-MM', que e' o que as
--   outras funcoes desta familia recebem. `left` atende os dois formatos.
--   O diff do corpo e' exatamente esta linha — conferido contra o corpo vigente.
--
-- ⚠ O CORPO VEIO DO REPO, conferido por md5 contra o banco antes de editar: 63d5f58f / 1946
--   chars, igual a `prosrc`. Mesma checagem da migration 20261027125000.
--
-- ⚠ REVOKE/GRANT NO RODAPE, pelo mesmo motivo registrado na 20261027124600: funcao SECURITY
--   DEFINER criada sem eles nasce com EXECUTE para PUBLIC.

create or replace function public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
with per as (select to_char(to_date(p_de||'-01','YYYY-MM-DD') - interval '1 month','YYYY-MM') p0, left(p_ate,7) p1),
p0 as (select categoria, sum(quantidade) q, case when sum(quantidade)>0 then sum(quantidade*peso_medio_kg)/sum(quantidade) end pm, case when sum(quantidade*peso_medio_kg)>0 then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg) end pk
      from valor_rebanho_fechamento_itens i join per on true where i.cliente_id=p_cliente and i.ano_mes=per.p0 and (p_fazenda is null or i.fazenda_id=p_fazenda) group by 1),
p1 as (select categoria, sum(quantidade) q, case when sum(quantidade)>0 then sum(quantidade*peso_medio_kg)/sum(quantidade) end pm, case when sum(quantidade*peso_medio_kg)>0 then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg) end pk
      from valor_rebanho_fechamento_itens i join per on true where i.cliente_id=p_cliente and i.ano_mes=per.p1 and (p_fazenda is null or i.fazenda_id=p_fazenda) group by 1),
k as (select categoria from p0 union select categoria from p1),
c as (
  select k.categoria, coalesce(p0.q,0) q0, round(p0.pm,2) pm0, round(p0.pk,4) pk0, round(coalesce(p0.q*p0.pm*p0.pk,0),2) v0,
         coalesce(p1.q,0) q1, round(p1.pm,2) pm1, round(p1.pk,4) pk1,
         round(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,p1.pk),2) v1_p0, round(coalesce(p1.q*p1.pm*p1.pk,0),2) v1_p1
  from k left join p0 on p0.categoria=k.categoria left join p1 on p1.categoria=k.categoria)
select jsonb_build_object('p0', (select p0 from per), 'p1', (select p1 from per),
  'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria',categoria,'q0',q0,'pm0',pm0,'pk0',pk0,'v0',v0,'q1',q1,'pm1',pm1,'pk1',pk1,'v1_p0',v1_p0,'v1_p1',v1_p1,'vpb',v1_p0-v0,'efeito',v1_p1-v1_p0) order by categoria) from c),'[]'::jsonb),
  'total', (select jsonb_build_object('q0',sum(q0),'v0',sum(v0),'q1',sum(q1),'v1_p0',sum(v1_p0),'v1_p1',sum(v1_p1),'vpb',sum(v1_p0-v0),'efeito',sum(v1_p1-v1_p0)) from c))
$function$;

revoke all on function public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) from public;
grant execute on function public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) to authenticated;
