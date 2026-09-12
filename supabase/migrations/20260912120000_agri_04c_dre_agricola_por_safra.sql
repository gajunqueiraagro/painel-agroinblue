-- 20260912120000_agri_04c_dre_agricola_por_safra.sql
-- AGRI-04C: DRE de CAIXA por cultura, por safra. Uma linha por (cultura, linha_dre).
-- A regra mora AQUI porque o Painel da Safra vai reler a mesma cascata; regra duplicada em
-- dois lugares e' o pecado nro 1 da casa.
--
-- DECISOES CRAVADAS (nao inferir de novo ao ler):
--  * SINAL: `valor` e' sempre POSITIVO; a direcao vem de `tipo_operacao`. Soma-se por tipo,
--    NUNCA multiplicando por sinal (medido: 0 negativos em 1.235 linhas do NJ).
--  * A CASCATA E' POR `grupo_custo`, NAO por `compoe_dre`. A flag diz respeito ao DRE de
--    COMPETENCIA, onde Investimento entra; aqui e' caixa, e investimento fica FORA do
--    resultado (regra FORMACAO-DE-AREA): se entrasse como custo, a 1a safra daria prejuizo e
--    as seguintes lucro facil — mentira dos dois lados.
--  * OS NOMES DOS GRUPOS TEM ACENTO no banco (`Receita Agrícola`, `Custo Variável
--    Agricultura`, `Deduções Agricultura`), conferidos em financeiro_plano_contas.
--  * CULTURA SEM AREA NAO RECEBE RATEIO. O compartilhado se distribui pelo peso de area
--    (agri_safra_area, ativo); quem nao tem hectare nao entra no denominador e fica so' com o
--    que tem marcado como DIRETO. A flag `area_cadastrada` sai por cultura para a tela dizer
--    isso em ambar, em vez de exibir um zero que parece resultado.
--  * RATEIO ADMINISTRATIVO: percentual declarado de 'agricultura' em agri_rateio_admin, pelo
--    ANO da data_competencia do lancamento administrativo, aplicado sobre o custo
--    administrativo da JANELA da safra, e entao subdividido entre as culturas pelo mesmo peso
--    de area. Ano sem linha declarada => contribui 0 e a flag `rateio_admin_declarado` sai
--    false. Nao se chuta percentual.
--  * SO' LAVOURA. `fase` (pecuaria) nao e' agregada aqui — e' a versao pecuaria do DRE, outra
--    frente.
--  * Cancelados sempre fora.
-- APLICADA no proto em 2026-09-12 via MCP, e VALIDADA contra as tres safras de lavoura do NJ
-- (25/26, 24/25, 23/24) — os numeros conferidos estao no relatorio do PR.
create or replace function public.fn_dre_agricola_por_safra(
  p_cliente_id uuid,
  p_safra_id   uuid
)
returns table(
  cultura text,
  area_ha numeric,
  area_cadastrada boolean,
  ordem int,
  linha text,
  rotulo text,
  valor numeric,
  rateio_admin_declarado boolean
)
language sql
stable
security invoker
set search_path = public
as $function$
with safra as (
  select s.id, s.data_inicio, s.data_fim
    from financeiro_safras s
   where s.id = p_safra_id and s.cliente_id = p_cliente_id
),
-- ── AREA POR CULTURA: o denominador do rateio, e a unica fonte dele ──────────────
areas as (
  select a.cultura, sum(a.area_plantada_ha)::numeric as area_ha
    from agri_safra_area a
   where a.safra_id = p_safra_id and a.cliente_id = p_cliente_id and a.ativo
   group by a.cultura
),
area_total as (select coalesce(sum(area_ha), 0)::numeric as total from areas),
-- ── LANCAMENTOS DA SAFRA, ja' peneirados ────────────────────────────────────────
lanc as (
  select l.cultura, l.grupo_custo, l.tipo_operacao, l.valor
    from financeiro_lancamentos_v2 l
   where l.cliente_id = p_cliente_id
     and l.safra_id = p_safra_id
     and coalesce(l.cancelado, false) = false
),
-- ── AS CULTURAS DA TELA: as plantadas, mais as que aparecem marcadas no lancamento.
--    A segunda metade e' o caso medido da mandioca: custo direto sem area cadastrada. ──
culturas as (
  select cultura from areas
  union
  select cultura from lanc where cultura is not null
),
base as (
  select c.cultura,
         coalesce(a.area_ha, 0)::numeric as area_ha,
         (a.cultura is not null)         as area_cadastrada,
         case when (select total from area_total) > 0 and a.area_ha is not null
              then a.area_ha / (select total from area_total) else 0 end as peso
    from culturas c
    left join areas a on a.cultura = c.cultura
),
-- ── DIRETO: o lancamento que ja' diz de quem e' ─────────────────────────────────
direto as (
  select l.cultura,
         sum(l.valor) filter (where l.grupo_custo = 'Receita Agrícola'                  and l.tipo_operacao = '1-Entradas') as receita,
         sum(l.valor) filter (where l.grupo_custo = 'Deduções Agricultura'              and l.tipo_operacao = '2-Saídas')   as deducoes,
         sum(l.valor) filter (where l.grupo_custo = 'Custo Variável Agricultura'        and l.tipo_operacao = '2-Saídas')   as custo_variavel,
         sum(l.valor) filter (where l.grupo_custo = 'Custo Fixo Agricultura'            and l.tipo_operacao = '2-Saídas')   as custo_fixo,
         sum(l.valor) filter (where l.grupo_custo = 'Juros de Financiamento Agricultura' and l.tipo_operacao = '2-Saídas')  as juros,
         sum(l.valor) filter (where l.grupo_custo = 'Investimento Agricultura'          and l.tipo_operacao = '2-Saídas')   as investimento
    from lanc l
   where l.cultura is not null
   group by l.cultura
),
-- ── COMPARTILHADO: o que ninguem marcou, e por isso rateia ──────────────────────
compartilhado as (
  select coalesce(sum(l.valor) filter (where l.grupo_custo = 'Receita Agrícola'                   and l.tipo_operacao = '1-Entradas'), 0) as receita,
         coalesce(sum(l.valor) filter (where l.grupo_custo = 'Deduções Agricultura'               and l.tipo_operacao = '2-Saídas'), 0)   as deducoes,
         coalesce(sum(l.valor) filter (where l.grupo_custo in ('Custo Variável Agricultura','Custo Fixo Agricultura','Juros de Financiamento Agricultura')
                                             and l.tipo_operacao = '2-Saídas'), 0)                                                        as custos,
         coalesce(sum(l.valor) filter (where l.grupo_custo = 'Investimento Agricultura'           and l.tipo_operacao = '2-Saídas'), 0)   as investimento
    from lanc l
   where l.cultura is null
),
-- ── ADMINISTRATIVO DA JANELA, ja' multiplicado pelo percentual do ANO de cada linha ──
--    ⚠ EXCLUSOES EXPLICITAS: dividendo nao e' custo (e' distribuicao de lucro), investimento
--    nao entra no caixa, e financeiro/transferencia nao sao custo administrativo.
admin_por_ano as (
  select extract(year from l.data_competencia)::int as ano,
         sum(l.valor) as total
    from financeiro_lancamentos_v2 l, safra s
   where l.cliente_id = p_cliente_id
     and coalesce(l.cancelado, false) = false
     and l.escopo_negocio = 'administrativo'
     and l.tipo_operacao = '2-Saídas'
     and l.macro_custo not in ('Dividendos', 'Investimento na Fazenda', 'Saída Financeira', 'Transferências')
     and s.data_inicio is not null and s.data_fim is not null
     and l.data_competencia between s.data_inicio and s.data_fim
   group by 1
),
admin_rateado as (
  select coalesce(sum(a.total * (r.percentual / 100.0)), 0)::numeric as valor,
         -- Sem NENHUM lancamento administrativo na janela nao ha' o que declarar: `bool_and`
         -- de conjunto vazio e' nulo, e nulo aqui viraria "ano sem rateio" numa safra que
         -- simplesmente nao tem custo administrativo. `true` e' a leitura honesta.
         coalesce(bool_and(r.percentual is not null), true)          as declarado
    from admin_por_ano a
    left join agri_rateio_admin r
      on r.cliente_id = p_cliente_id and r.ano = a.ano and r.atividade = 'agricultura'
),
-- ── A CASCATA, por cultura ──────────────────────────────────────────────────────
por_cultura as (
  select b.cultura, b.area_ha, b.area_cadastrada, b.peso,
         coalesce(d.receita, 0)        as receita,
         coalesce(d.deducoes, 0)       as deducoes,
         coalesce(d.custo_variavel, 0) as custo_variavel,
         coalesce(d.custo_fixo, 0)     as custo_fixo,
         coalesce(d.juros, 0)          as juros,
         coalesce(d.investimento, 0)   as investimento,
         (c.receita * b.peso)                          as receita_rateada,
         (c.deducoes * b.peso)                         as deducoes_rateadas,
         (c.custos * b.peso)                           as rateio_compartilhado,
         ((select valor from admin_rateado) * b.peso)  as rateio_admin,
         (c.investimento * b.peso)                     as investimento_rateado
    from base b
    left join direto d on d.cultura = b.cultura
    cross join compartilhado c
),
linhas as (
  -- por cultura
  select p.cultura, p.area_ha, p.area_cadastrada, v.ordem, v.linha, v.rotulo, v.valor
    from por_cultura p
    cross join lateral (values
      (1,  'receita_bruta',        'Receita bruta',                 p.receita + p.receita_rateada),
      (2,  'deducoes',             '(-) Deduções',                  p.deducoes + p.deducoes_rateadas),
      (3,  'receita_liquida',      '= Receita líquida',             (p.receita + p.receita_rateada) - (p.deducoes + p.deducoes_rateadas)),
      (4,  'custo_variavel',       '(-) Custo variável direto',     p.custo_variavel),
      (5,  'custo_fixo',           '(-) Custo fixo',                p.custo_fixo),
      (6,  'juros',                '(-) Juros de financiamento',    p.juros),
      (7,  'rateio_compartilhado', '(-) Rateio compartilhado',      p.rateio_compartilhado),
      (8,  'rateio_admin',         '(-) Rateio administrativo',     p.rateio_admin),
      (9,  'resultado_caixa',      '= Resultado de caixa',
             (p.receita + p.receita_rateada) - (p.deducoes + p.deducoes_rateadas)
             - p.custo_variavel - p.custo_fixo - p.juros - p.rateio_compartilhado - p.rateio_admin),
      (10, 'investimento',         'Investimento no período',       p.investimento + p.investimento_rateado),
      (11, 'depreciacao',          'Depreciação',                   null::numeric)
    ) as v(ordem, linha, rotulo, valor)
  union all
  -- a coluna COMPARTILHADO: a ORIGEM do que foi rateado, para a conta ser rastreavel.
  -- ⚠ Ela NAO entra no Total: somaria duas vezes o mesmo dinheiro, ja' distribuido acima.
  select '__compartilhado__', null::numeric, null::boolean, v.ordem, v.linha, v.rotulo, v.valor
    from compartilhado c
    cross join lateral (values
      (1,  'receita_bruta',        'Receita bruta',              c.receita),
      (2,  'deducoes',             '(-) Deduções',               c.deducoes),
      (3,  'receita_liquida',      '= Receita líquida',          c.receita - c.deducoes),
      (4,  'custo_variavel',       '(-) Custo variável direto',  0::numeric),
      (5,  'custo_fixo',           '(-) Custo fixo',             0::numeric),
      (6,  'juros',                '(-) Juros de financiamento', 0::numeric),
      (7,  'rateio_compartilhado', '(-) Rateio compartilhado',   c.custos),
      (8,  'rateio_admin',         '(-) Rateio administrativo',  (select valor from admin_rateado)),
      (9,  'resultado_caixa',      '= Resultado de caixa',       null::numeric),
      (10, 'investimento',         'Investimento no período',    c.investimento),
      (11, 'depreciacao',          'Depreciação',                null::numeric)
    ) as v(ordem, linha, rotulo, valor)
),
-- ── O TOTAL ────────────────────────────────────────────────────────────────────
--  ⚠ E' A SOMA DAS CULTURAS, NUNCA COM A COLUNA COMPARTILHADO JUNTO: o que estava em
--    compartilhado ja' foi distribuido entre elas, e somar as duas contaria o mesmo dinheiro
--    duas vezes.
--  ⚠ EXCETO QUANDO NAO HA' AREA NENHUMA. Ali o peso e' zero, nada se distribui, e o
--    compartilhado precisa aparecer no Total — senao a safra sem area cadastrada exibiria
--    receita zero com o extrato cheio, que e' a forma mais cara de "ausencia".
-- ⚠ O ESQUELETO DAS 11 LINHAS VEM DA COLUNA COMPARTILHADO, que existe SEMPRE. Antes o Total
--   nascia de `group by` sobre as culturas, e a safra 24/25 do NJ — que nao tem area nem
--   cultura marcada em lancamento nenhum — ficava SEM coluna Total: a tela mostraria o
--   compartilhado e nenhuma soma. Pego validando contra o proto, nao na tela.
esqueleto as (
  select l.ordem, l.linha, l.rotulo from linhas l where l.cultura = '__compartilhado__'
),
soma_culturas as (
  select l.ordem, sum(l.valor) as valor
    from linhas l
   where l.cultura <> '__compartilhado__'
   group by l.ordem
),
-- O que NAO coube em ninguem. So' entra no Total quando area_total = 0 — sem hectare nao ha'
-- peso, e sem peso nada se distribuiu.
residuo as (
  select v.ordem, v.valor
    from compartilhado c
    cross join lateral (values
      (1,  c.receita),
      (2,  c.deducoes),
      (3,  c.receita - c.deducoes),
      (4,  0::numeric),
      (5,  0::numeric),
      (6,  0::numeric),
      (7,  c.custos),
      (8,  (select valor from admin_rateado)),
      -- ⚠ AQUI O RESULTADO E' CALCULADO, e nao nulo como na coluna Compartilhado: isolada,
      --   ela nao tem resultado (parte dela vira custo das outras); no Total de uma safra sem
      --   area, ela E' o resultado inteiro.
      (9,  c.receita - c.deducoes - c.custos - (select valor from admin_rateado)),
      (10, c.investimento),
      (11, null::numeric)
    ) as v(ordem, valor)
)
select l.cultura, l.area_ha, l.area_cadastrada, l.ordem, l.linha, l.rotulo,
       l.valor,
       (select declarado from admin_rateado) as rateio_admin_declarado
  from linhas l
union all
select '__total__', (select total from area_total), null::boolean, e.ordem, e.linha, e.rotulo,
       case when e.linha = 'depreciacao' then null
            when (select total from area_total) > 0 then coalesce(sc.valor, 0)
            else coalesce(sc.valor, 0) + coalesce(r.valor, 0) end,
       (select declarado from admin_rateado)
  from esqueleto e
  left join soma_culturas sc on sc.ordem = e.ordem
  left join residuo r on r.ordem = e.ordem
 order by 4, 1;
$function$;

comment on function public.fn_dre_agricola_por_safra(uuid, uuid) is
  'AGRI-04C: DRE de CAIXA por cultura de uma safra. Uma linha por (cultura, linha_dre); culturas especiais __compartilhado__ (origem do rateio, fora do Total) e __total__. Investimento fica FORA do resultado por regra de formacao de area.';

-- ⚠ REVOGAR DE `anon` NAO BASTA, e isto foi MEDIDO logo apos aplicar: funcao nasce com
--   EXECUTE para PUBLIC, e `anon` executa por heranca de PUBLIC, nao por grant proprio —
--   `has_function_privilege('anon', ...)` continuava true depois do revoke. Revoga-se de
--   PUBLIC e concede-se a quem deve.
--   (Ela e' `security invoker`: a RLS das tabelas continua valendo de qualquer forma. Isto
--   fecha a porta de entrada, nao a fechadura.)
revoke all on function public.fn_dre_agricola_por_safra(uuid, uuid) from public;
revoke all on function public.fn_dre_agricola_por_safra(uuid, uuid) from anon;
grant execute on function public.fn_dre_agricola_por_safra(uuid, uuid) to authenticated;
grant execute on function public.fn_dre_agricola_por_safra(uuid, uuid) to service_role;
