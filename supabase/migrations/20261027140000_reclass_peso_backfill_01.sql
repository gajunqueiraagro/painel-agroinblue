-- RECLASS-PESO-BACKFILL-01 — o peso da reclassificacao que nunca foi gravado
--
-- O QUE CORRIGE
-- `fn_zoot_categoria_mensal` calcula producao_biologica como
--     peso_fin - peso_ini - p_ent + p_sai - p_evol_ent + p_evol_sai
-- ou seja, ela JA subtrai o peso da reclassificacao. O que falta e o insumo: a CTE que
-- alimenta p_evol_ent/p_evol_sai usa `COALESCE(l.peso_medio_kg, 0)`, entao lancamento de
-- reclassificacao sem peso entra com a QUANTIDADE e com peso ZERO. Sem nada para subtrair,
-- o peso que chega na categoria de destino vira PRODUCAO, e o peso que sai da categoria de
-- origem fica ENCALHADO numa linha com saldo_final = 0.
--
-- ESCOPO MEDIDO (2026-09-24)
--   516 lancamentos, tipo 'reclassificacao', cenario 'realizado', nao cancelados,
--   peso_medio_kg IS NULL, 46.586 cabecas:
--     NJ Pecuaria 368 (34.922 cab) · Agnaldo Cedenho 146 (11.615) · RRCC 1 (1) · Vera 1 (48)
--     Santa Rita Agro 0 · Raul Juliato 0   <- grupo de controle
--   Nenhuma linha tem peso_medio_kg = 0 explicito; as 516 sao NULL.
--
-- REGRA (aprovada por Gabriel em 24/09/2026)
--   1. peso medio da categoria de ORIGEM no fechamento do mes ANTERIOR, mesma fazenda ...... 503
--   2. sem isso: fechamento mais recente da origem ate 3 meses antes; sem isso, o
--      peso_medio_inicial que zoot_mensal_cache ja guarda para a origem naquele mes ......... 13
--   3. peso medio do DESTINO no fechamento do proprio mes ................................. 0
--   Os 13 da regra 2 sao 10 de jan/2020 (primeiro mes da serie, nao existe mes anterior) e
--   3 de meses sem fechamento da origem. A regra 3 NAO foi exercida: os 2 casos de origem
--   com saldo_inicial = 0 (6 cab no NJ, 131 no Agnaldo) foram resolvidos pela regra 2.
--
-- PROVAS (BEGIN ... UPDATE ... refresh ... medir ... ROLLBACK, 24/09/2026)
--   Rollback conferido depois: 516 ainda sem peso, 4.703 linhas de cache, NJ de volta a
--   48.907,0 @ e Pureza com GMD 21,34 — nada ficou escrito.
--
--                                              ANTES        DEPOIS
--   NJ residuo da ponte jan-ago/25           -25.735,7 @    -556,2 @     (32,6% -> 0,7% do inicial)
--   NJ at_produzida jan-ago/25                48.907,0 @   23.727,5 @
--   NJ producao de nov/25                    -18.955,2 @   +6.979,7 @    (a compensacao some)
--   NJ peso encalhado                        113.729 @      1.360 @
--   NJ linhas com GMD fora de 0-2 kg/dia            469          341
--   Pureza GMD maximo jan-ago/25                  21,34         7,14
--   Pureza @ final ago/25 por peso_total         77.039,5     51.883,3
--   Pureza @ final ago/25 por qtd x medio        51.883,3     51.883,3   <- passam a concordar
--   Agnaldo peso encalhado                       1.036 @        154 @
--   Agnaldo linhas com GMD fora                      215          141
--
--   ⚠ O RESIDUO NAO VAI A ZERO, E OS -556,2 @ QUE SOBRAM JA TEM DONO: e a divergencia
--     cache x fechamento do Sto. Expedito em ago/25 (17.527,1 contra 18.083,3 @), registrada
--     em CACHE-X-FECHAMENTO-01. Esta migration nao a toca.
--
--   ⚠ GRUPO DE CONTROLE INTACTO, e e o que prova que a correcao e cirurgica: Santa Rita
--     (788 linhas, 188 GMD fora, 1.010 @ encalhadas) e Raul Juliato (524 / 73 / 520) nao tem
--     nenhum lancamento no conjunto e nao se moveram em nada.
--
--   ⚠ TAMANHO DO CONJUNTO IGUAL ANTES E DEPOIS, por cliente: NJ 1.480 · Agnaldo 1.040 ·
--     Santa Rita 788 · Raul 524 · Vera 490 · RRCC 381. O cache nao ganhou nem perdeu linha.
--
--   ⚠ VPB E EFEITO DE MERCADO NAO MUDAM, por construcao: `fn_dre_pecuaria_patrimonio` calcula
--     as duas pontas do NJ jan-ago/25 e do SR jan-ago/21 a partir de
--     `valor_rebanho_fechamento_itens` (medido: as duas pontas das duas fazendas do NJ com
--     rebanho vem de fechamento), e esta migration nao escreve nessa tabela.
--
-- IDEMPOTENTE: a guarda `peso_medio_kg IS NULL` faz a segunda execucao nao casar nenhuma linha.
-- O estado anterior de todas as 516 e VAZIO, entao nao ha valor sobrescrito.
--
-- ⚠ SEM `begin`/`commit` EXPLICITOS: o `apply_migration` ja envolve o script numa transacao, e
--   abrir outra dentro dela deixaria o par disable/enable da trigger fora do mesmo escopo.

-- ⚠ `set_lancamento_audit` (BEFORE UPDATE) grava `updated_by = auth.uid()`, que numa migration
--   e NULO: sem desliga-lo, este backfill APAGARIA o autor de 370 das 516 linhas. Desligado so
--   aqui, e religado no fim. O `trg_audit_lancamentos` (audit_log) FICA LIGADO de proposito —
--   correcao de 516 registros oficiais deve deixar rastro.
alter table public.lancamentos disable trigger set_lancamento_audit;

with alvo as (
  select l.id, l.fazenda_id, l.data, l.categoria as origem, l.categoria_destino as destino,
         to_char(l.data,'YYYY-MM') as ym,
         to_char(l.data - interval '1 month','YYYY-MM') as ym_ant
  from public.lancamentos l
  where l.tipo = 'reclassificacao'
    and coalesce(l.cancelado,false) = false
    and l.cenario = 'realizado'
    and l.peso_medio_kg is null
),
prop as (
  select a.id,
    coalesce(
      -- regra 1
      (select fi.peso_medio_kg from public.valor_rebanho_fechamento_itens fi
        where fi.fazenda_id = a.fazenda_id and fi.ano_mes = a.ym_ant
          and fi.categoria = a.origem and fi.peso_medio_kg > 0 limit 1),
      -- regra 2a
      (select fi.peso_medio_kg from public.valor_rebanho_fechamento_itens fi
        where fi.fazenda_id = a.fazenda_id and fi.categoria = a.origem
          and fi.peso_medio_kg > 0 and fi.ano_mes < a.ym
          and fi.ano_mes >= to_char(a.data - interval '3 month','YYYY-MM')
        order by fi.ano_mes desc limit 1),
      -- regra 2b
      (select z.peso_medio_inicial from public.zoot_mensal_cache z
        where z.fazenda_id = a.fazenda_id and z.ano_mes = a.ym
          and z.cenario = 'realizado' and z.categoria_codigo = a.origem
          and z.peso_medio_inicial > 0 limit 1),
      -- regra 3
      (select fi.peso_medio_kg from public.valor_rebanho_fechamento_itens fi
        where fi.fazenda_id = a.fazenda_id and fi.ano_mes = a.ym
          and fi.categoria = a.destino and fi.peso_medio_kg > 0 limit 1)
    ) as peso
  from alvo a
)
update public.lancamentos l
   set peso_medio_kg = p.peso
  from prop p
 where p.id = l.id
   and l.peso_medio_kg is null
   and p.peso is not null;

alter table public.lancamentos enable trigger set_lancamento_audit;

-- Rematerializar o cache dos quatro clientes tocados, 2020-2026 — exatamente o escopo em que
-- as provas acima foram medidas. Santa Rita e Raul ficam de fora porque nao tem lancamento no
-- conjunto: refresca-los seria refazer trabalho para reproduzir a mesma linha.
do $$
declare r record;
begin
  for r in
    select f.id as fid, y
      from public.fazendas f
      cross join generate_series(2020,2026) y
     where f.cliente_id in (
       'f2d67cd4-24d0-456f-a079-a3281dcce7fd',  -- NJ Pecuaria
       'a2d41cda-eb1e-4527-a6cf-a1b9663339e2',  -- Agnaldo Cedenho
       '537661af-a934-4c66-b138-f8dbc378a00f',  -- RRCC
       'a1b2c3d4-e5f6-7890-abcd-ef1234567890'   -- Vera Ligia Milani
     )
  loop
    perform public.refresh_zoot_cache(r.fid, r.y);
  end loop;
end $$;
