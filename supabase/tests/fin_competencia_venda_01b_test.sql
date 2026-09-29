-- FIN-COMPETENCIA-VENDA-01b — prova do gerador (`oc_materializar_programacao`), da volta pelo evento do lote e do lote
-- (migrations 20261027180000 e 20261027181000). Roda em ROLLBACK: o bloco termina em RAISE 'OK ...' e nada fica gravado.
-- Qualquer outra mensagem e' falha. Roda contra o banco com as duas aplicadas.
-- Cobre:
--   G1. gerador, recebimento de abate (9b2b5e6b, data_operacao 16/04/26, saida 15/04/26): parcela prevista nova na programacao
--       f357f07a -> titulo nasce com competencia 15/04/26 e a safra dessa data.
--   G2. gerador, despesa da mesma regra de sempre (02be1a41, programacao ba25f391): titulo nasce com a data da OC (02/09/26).
--   L.  o lote: amostras de cada alvo (A-cc 535836b8, A-tit 1d31fd0b, B cec9fde6 com o audit_log da saida) e "nao sobrou
--       nenhum" — a mesma busca da medicao acha EXATAMENTE o 52c13a7c, que ficou fora de proposito (prova de que sabe achar).
--   V.  a volta acha o evento do lote: desligar 1d31fd0b (corrigido pelo lote de 16/04 para 15/04) devolve 16/04. Fica por
--       ultimo porque desfaz uma amostra de L.
do $do$
declare
  c_9b uuid := '9b2b5e6b-d800-4f48-8acd-732e125c9fb4'; c_02 uuid := '02be1a41-6d1d-4f6d-9d73-387cd758658c';
  l_t1 uuid := '1d31fd0b-2c21-4813-85df-3331c1ea571c';
  v_cli uuid; v_parc uuid; v int; r jsonb; tit record; v_n int; v_um text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e','role','authenticated')::text, true);

  -- G1) gerador: recebimento de abate nasce na saida
  select cliente_id into v_cli from zoo_operacoes_comerciais where id = c_9b;
  insert into zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, status)
  values (v_cli, 'f357f07a-67fe-4d1c-bbe3-34f179926b95',
          (select max(sequencia) + 1 from zoo_operacao_parcelas_programacao where programacao_id = 'f357f07a-67fe-4d1c-bbe3-34f179926b95'), 1.00, date '2026-06-30', 'prevista') returning id into v_parc;
  select versao into v from zoo_operacoes_comerciais where id = c_9b;
  r := oc_materializar_programacao(c_9b, v, 'f357f07a-67fe-4d1c-bbe3-34f179926b95', v_parc);
  select * into tit from financeiro_lancamentos_v2 where id = (r->'titulo'->>'id')::uuid;
  if tit.data_competencia <> date '2026-04-15' then raise exception 'G1 gerador: competencia % (esperada a saida 15/04/26)', tit.data_competencia; end if;
  if tit.safra_id is distinct from fn_safra_sugerida(v_cli, date '2026-04-15', 'pecuaria') then raise exception 'G1 gerador: safra %', tit.safra_id; end if;
  if tit.data_vencimento <> date '2026-06-30' then raise exception 'G1 gerador: vencimento mudou %', tit.data_vencimento; end if;

  -- G2) gerador: despesa segue a data da OC
  select cliente_id into v_cli from zoo_operacoes_comerciais where id = c_02;
  insert into zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, status)
  values (v_cli, 'ba25f391-cde6-4a8d-b92f-2c68c4917b3e',
          (select max(sequencia) + 1 from zoo_operacao_parcelas_programacao where programacao_id = 'ba25f391-cde6-4a8d-b92f-2c68c4917b3e'), 1.00, date '2026-09-30', 'prevista') returning id into v_parc;
  select versao into v from zoo_operacoes_comerciais where id = c_02;
  r := oc_materializar_programacao(c_02, v, 'ba25f391-cde6-4a8d-b92f-2c68c4917b3e', v_parc);
  select * into tit from financeiro_lancamentos_v2 where id = (r->'titulo'->>'id')::uuid;
  if tit.data_competencia <> (select data_operacao from zoo_operacoes_comerciais where id = c_02) then
    raise exception 'G2 gerador: despesa com competencia % (esperada a data da OC)', tit.data_competencia; end if;

  -- L) o lote: amostras
  if (select data_competencia from financeiro_lancamentos_v2 where id = '535836b8-1423-4d9c-ab38-2ed9c8425d9d') <> date '2020-06-17'
    then raise exception 'L A-cc 535836b8 nao esta'' na saida'; end if;
  if (select data_competencia from financeiro_lancamentos_v2 where id = l_t1) <> date '2026-04-15'
    then raise exception 'L A-tit 1d31fd0b nao esta'' na saida'; end if;
  if (select data_competencia from financeiro_lancamentos_v2 where left(id::text, 8) = 'cec9fde6') is distinct from date '2024-12-01'
    then raise exception 'L B cec9fde6 nao esta'' na saida'; end if;
  if not exists (select 1 from audit_log a where a.acao = 'corrigir_competencia_pela_saida' and left(a.registro_id::text, 8) = 'cec9fde6'
                  and a.dados_novos->>'saida_id' is not null) then raise exception 'L B cec9fde6 sem audit_log da saida'; end if;

  -- L) "nao sobrou nenhum": a busca da medicao acha so' o 52c13a7c
  with lig as (
    select l.id, l.data_competencia comp, l.safra_id, cps.data_competencia comp_nova, cps.safra_id safra_nova
    from financeiro_lancamentos_v2 l
    join zoo_operacao_partes p on p.financeiro_lancamento_id = l.id and not p.cancelada
    join zoo_operacoes_comerciais o on o.id = p.operacao_id and o.cancelado_em is null
    cross join lateral _oc_competencia_pela_saida(o.id) cps
    where l.cancelado is not true and l.tipo_operacao = '1-Entradas' and coalesce(l.sem_movimentacao_caixa, false) = false
      and l.subcentro in ('Abates de Fêmeas','Abates de Machos','Venda de Desmama Fêmeas','Venda de Desmama Machos',
                          'Venda de Fêmeas Adultas','Venda de Machos Adultos'))
  select count(*), min(left(id::text, 8)) into v_n, v_um from lig
   where comp is distinct from comp_nova or safra_id is distinct from safra_nova;
  if v_n <> 1 or v_um <> '52c13a7c' then raise exception 'L sobraram % ligados fora da saida (primeiro %); esperado so'' o 52c13a7c', v_n, v_um; end if;

  -- V) a volta acha o evento do lote
  select versao into v from zoo_operacoes_comerciais where id = c_9b;
  r := oc_desvincular_lancamento(c_9b, v, l_t1, 'teste 01b');
  if (r->'competencia_restauro'->>'restaurado')::boolean is not true then raise exception 'V volta nao restaurou: %', r->'competencia_restauro'; end if;
  if (select data_competencia from financeiro_lancamentos_v2 where id = l_t1) <> date '2026-04-16' then raise exception 'V volta nao devolveu 16/04'; end if;

  raise exception 'OK gerador abate=15/04 e despesa=data da OC; lote: A-cc, A-tit e B na saida, so'' o 52c13a7c sobra; volta devolve 16/04';
end $do$;
