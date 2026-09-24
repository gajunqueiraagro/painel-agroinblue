-- CATEGORIA-DESCARTE-01 — `vacas_descarte` sai do banco e volta para `vacas`.
--
-- ⚠ ELA NUNCA FOI CATEGORIA DA CASA. `categorias_rebanho` tem NOVE codigos e `vacas_descarte` nao
-- e' um deles; ele e' legado da importacao. Varridas as 33 colunas de texto com "categoria" do
-- schema: o codigo existe em UMA tabela so', `valor_rebanho_fechamento_itens`, em 32 linhas —
-- zero em `lancamentos`, `zoot_mensal_cache`, `saldos_iniciais`, `pasto_movimentacoes`,
-- `preco_mercado`, `cfg_categoria_parametros`. Nao ha' movimento zootecnico a preservar.
--
-- ⚠ E ELE CHEGAVA A' TELA COMO CODIGO CRU. O modal do patrimonio mapeia codigo -> nome por
-- `categorias_rebanho`; sem linha no catalogo, o fallback mostrava "vacas_descarte" no meio de
-- "Vacas" e "Novilhas". Medido no NJ, Ano 2020: 75 cabecas e R$ 268.400,00 no bloco Adultos.
--
-- ⚠ NAO E' RESIDUO PEQUENO, e por isso a distorcao fica registrada aqui: na Pureza em 2020-05 o
-- descarte tem 2.568 cabecas contra 7 de `vacas`, e em 2020-04, 1.395 contra 796. Depois do merge
-- o peso e o preco medios de `vacas` naqueles meses sao outros — o VALOR TOTAL do mes nao muda,
-- mas a leitura POR CATEGORIA muda, e muda porque a de antes estava partida em duas.
--
-- ⚠ O PRECO SE PONDERA POR KG, NAO POR CABECA, e a diferenca foi MEDIDA antes de escolher:
--     preco por kg   -> valor identico ao centavo (erro maximo R$ 0,0000)
--     preco por cab. -> R$ 814,19 de erro no total, pior mes R$ 740,54
-- A razao e' aritmetica: `preco_kg` e' preco POR KG, entao a media dele pede kg no peso; e o
-- produto de duas medias nao e' a media dos produtos, entao ponderar por cabeca faria
-- `q x pm x pk` deixar de reproduzir a soma dos dois valores. O peso medio, esse sim, se pondera
-- por CABECA — ele e' kg total dividido por cabecas.
--
-- ⚠ AS 32 TEM PAR: toda linha `vacas_descarte` tem uma linha `vacas` no mesmo (fazenda, mes).
-- E' sempre fusao, nunca renomear — as guardas abaixo reprovam a migration se isso mudar.
--
-- Prova rodada em BEGIN/ROLLBACK antes de aplicar, nos 32 (fazenda, mes) afetados:
--   pior diferenca de valor_total  R$ 0,01 (arredondamento)
--   cabecas         identicas em 32/32
--   kg (q x peso)   identicos em 32/32
--
-- Escopo do dado: 32 linhas, TODAS do NJ Pecuaria, TODAS em 2020 — Pureza 11 meses,
-- Sta. Luzia 9, Sto. Expedito 12.

do $mig$
declare v_desc int; v_sem_par int; v_afetadas int;
begin
  select count(*) into v_desc
    from valor_rebanho_fechamento_itens where categoria = 'vacas_descarte';
  if v_desc <> 32 then
    raise exception 'CATEGORIA-DESCARTE-01: esperava 32 linhas vacas_descarte, achei %', v_desc;
  end if;

  -- Toda linha de descarte precisa de uma `vacas` no mesmo (fazenda, mes) para receber a fusao.
  select count(*) into v_sem_par
    from valor_rebanho_fechamento_itens i
    where i.categoria = 'vacas_descarte'
      and not exists (select 1 from valor_rebanho_fechamento_itens v
                      where v.fazenda_id = i.fazenda_id and v.ano_mes = i.ano_mes
                        and v.categoria = 'vacas');
  if v_sem_par <> 0 then
    raise exception 'CATEGORIA-DESCARTE-01: % linha(s) de descarte sem `vacas` no mesmo mes', v_sem_par;
  end if;

  with par as (
    select v.id vid,
           i.quantidade q1, i.peso_medio_kg pm1, i.preco_kg pk1,
           v.quantidade q2, v.peso_medio_kg pm2, v.preco_kg pk2
    from valor_rebanho_fechamento_itens i
    join valor_rebanho_fechamento_itens v
      on v.fazenda_id = i.fazenda_id and v.ano_mes = i.ano_mes and v.categoria = 'vacas'
    where i.categoria = 'vacas_descarte'
  ),
  novo as (
    select vid,
           q1 + q2                                                              as q,
           round((q1*pm1 + q2*pm2) / (q1 + q2), 6)                              as pm,
           round((q1*pm1*pk1 + q2*pm2*pk2) / nullif(q1*pm1 + q2*pm2, 0), 10)    as pk
    from par
  )
  update valor_rebanho_fechamento_itens t
     set quantidade            = n.q,
         peso_medio_kg         = n.pm,
         preco_kg              = n.pk,
         valor_total_categoria = round(n.q * n.pm * n.pk, 2)
    from novo n
   where t.id = n.vid;
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 32 then
    raise exception 'CATEGORIA-DESCARTE-01: esperava 32 linhas `vacas` atualizadas, foram %', v_afetadas;
  end if;

  delete from valor_rebanho_fechamento_itens where categoria = 'vacas_descarte';
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 32 then
    raise exception 'CATEGORIA-DESCARTE-01: esperava apagar 32, apaguei %', v_afetadas;
  end if;

  select count(*) into v_desc
    from valor_rebanho_fechamento_itens where categoria = 'vacas_descarte';
  if v_desc <> 0 then
    raise exception 'CATEGORIA-DESCARTE-01: sobraram % linhas de descarte', v_desc;
  end if;
end
$mig$;
