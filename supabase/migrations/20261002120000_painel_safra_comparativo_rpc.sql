-- PAINEL DA SAFRA — o comparativo entre safras da mesma cultura (fatia C).
--
-- JA APLICADA NO PROTO pelo arquiteto sob GO; este arquivo VERSIONA o que esta vivo em
-- 14/09/2026. Corpo extraido de pg_get_functiondef, nao redigitado.
-- md5(prosrc) conferido = e60f79cef1a13d90d13f0f8bd28dbd55
--
-- ⚠ SO SAFRAS QUE PLANTARAM A CULTURA, pelo `exists` em agri_safra_area. Sem ele, o comparativo
--   listaria toda safra agricola do cliente com zeros — e as safras VELHAS por cultura
--   (`23/24-AMD`, `25/26-AMD`) entrariam como linhas vazias ao lado das `-Lav` que as
--   substituiram. Medido: as `-AMD` tem zero area ativa e ficam de fora.
--
-- ⚠ `receita_incompleta` E HEURISTICA, E A TELA TEM DE DIZER ISSO. A regra e "ha producao mas a
--   receita nao chega a R$ 40 por saca" — um limiar escolhido, nao uma verdade do dado. Medido no
--   amendoim: 23/24 = R$ 104,41/sc, 25/26 = R$ 113,09/sc, e a 24/25 = R$ 10,61/sc, que e a venda
--   ainda nao lancada. O limiar existe para o comparativo nao exibir uma safra boa como pessima
--   so porque a nota ainda nao entrou; ele avisa, nunca corrige o numero.
--   ⚠ E ELE ENVELHECE COM O PRECO: 40 e baixo para amendoim hoje. No dia em que uma cultura valer
--   menos que isso por saca, a flag acusa safra sadia. Quem mexer no preco olha aqui.
--
-- ⚠ A PRODUCAO INCLUI O GRAO DE ROCA, como em `fn_painel_safra`, e a funcao ainda devolve
--   `sacas_boas`, `sacas_roca` e `pct_roca` separados — porque a proporcao de roca e justamente o
--   que se compara entre safras: medido no amendoim, 7,4% na 23/24, 2,8% na 24/25 e 0,5% na
--   25/26. E a leitura de qualidade que o produtor faz de cabeca.
--
-- ⚠ DIVIDA CONHECIDA, MEDIDA E HOJE INOCUA: o laco financeiro NAO filtra `cancelado = false`.
--   Nas quatro safras que o comparativo mostra (as `-Lav` do amendoim) isso nao muda numero
--   nenhum — conferido em 14/09/2026: a 25/26 tem 3 lancamentos cancelados e receita e custeio
--   dao exatamente o mesmo com e sem o filtro. Mas a fragilidade e real: um cancelamento de
--   receita relevante passaria a contar. Fica registrado aqui, sem correcao, porque o corpo
--   versionado tem de ser o que esta vivo — mexer nele e outro GO.

CREATE OR REPLACE FUNCTION public.fn_painel_safra_comparativo(p_cliente uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_safras jsonb;
begin
  select jsonb_agg(row_to_json(t) order by t.codigo) into v_safras from (
    select s.codigo, s.id safra_id,
      coalesce(ar.ha,0) area_ha,
      coalesce(col.sacas,0) total_sacas,
      case when coalesce(ar.ha,0)>0 then round(coalesce(col.sacas,0)/ar.ha,2) else 0 end sacas_ha,
      coalesce(col.boas,0) sacas_boas, coalesce(col.roca,0) sacas_roca,
      case when coalesce(col.sacas,0)>0 then round(100*coalesce(col.roca,0)/col.sacas,1) else 0 end pct_roca,
      coalesce(fin.receita,0) receita,
      coalesce(fin.custo,0) custeio_direto,
      case when coalesce(ar.ha,0)>0 then round(coalesce(fin.receita,0)/ar.ha,2) else 0 end receita_ha,
      -- flag: receita parece incompleta se ha producao mas receita muito baixa por saca
      case when coalesce(col.sacas,0)>0 and coalesce(fin.receita,0)/nullif(col.sacas,0) < 40 then true else false end receita_incompleta
    from financeiro_safras s
    left join lateral (select sum(a.area_plantada_ha) ha from agri_safra_area a where a.safra_id=s.id and a.cultura=p_cultura and a.ativo) ar on true
    left join lateral (select sum(c.sacas_boas+c.grao_roca_sacas) sacas, sum(c.sacas_boas) boas, sum(c.grao_roca_sacas) roca
       from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id where a.safra_id=s.id and a.cultura=p_cultura and c.ativo) col on true
    left join lateral (select sum(l.valor) filter (where l.tipo_operacao='1-Entradas') receita,
       sum(l.valor) filter (where l.tipo_operacao='2-Saídas' and l.compoe_dre=true and coalesce(l.macro_custo,'') not ilike '%investimento%') custo
       from financeiro_lancamentos_v2 l where l.safra_id=s.id and coalesce(l.cultura,'') in (p_cultura,'')) fin on true
    where s.cliente_id=p_cliente and s.escopo_negocio='agricultura'
      and exists (select 1 from agri_safra_area a where a.safra_id=s.id and a.cultura=p_cultura and a.ativo)
  ) t;
  return jsonb_build_object('cultura', p_cultura, 'safras', coalesce(v_safras,'[]'::jsonb));
end $function$;


-- ⚠ A ACL VEM JUNTO, e o revoke ANTES do grant: o default-privilege global concede EXECUTE a
--   PUBLIC em funcao nova. Ela e SECURITY DEFINER e le receita e custo de todas as safras do
--   cliente; sem o revoke, o papel `anon` — visitante nao autenticado — leria a serie historica
--   inteira. Medido depois de aplicada: anon=false, authenticated=true.
revoke all on function public.fn_painel_safra_comparativo(uuid, text) from public;
grant execute on function public.fn_painel_safra_comparativo(uuid, text) to authenticated;
