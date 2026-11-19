-- F8 (FOLHA-01, D-H1) — ROTINA: o 13º 1ª parcela de nov/26 do NJ (Gabriel 18/11: "F8: OK os 24 (R$ 27.651,61, previsto 30/11); Gilberto,
--   Carlos Eduardo e Paulo Henrique fora até eu confirmar a saída"). Prévia: patr-20261118-1330-F8-13-NJ-PREVIA-E-LOTE-L1.md.
--   · 1 lançamento por funcionário: "13º Salário 1ª Parcela 2026" (a descrição padronizada que a migração da FOLHA-01 reconhece), previsto,
--     vencimento 30/11/2026, competência 11/2026, origem 'manual', FORA da recorrência (o Propagar não o toca).
--   · conta do plano, fazenda, conta bancária, forma, escopo, cultura/fase e fornecedor = os do salário de nov/26 da recorrência dele.
--   · VALOR ESTIMADO = 50% do salário da recorrência × avos/12 (avos: da admissão estimada pelo 1º salário pago até dezembro; antes de
--     2026 = 12); a observação diz que é estimado — o valor certo vem do recibo do contador (a tela da FOLHA-01).
--   · autor = o Gabriel (o OK é dele), app.via = 'folha-13-1a-2026'; os gatilhos de sempre (safra, caixa do texto, classificação, auditoria).
-- GUARDAS: só as 24 recorrências da prévia, ativas e folha; nenhum 13º 2026 já lançado para elas; cada uma com o salário de nov/26; no fim,
--   24 lançamentos e R$ 27.651,61 (= a prévia), ou nada fica. Desfazer = cancelar com motivo (nada se apaga).
set lock_timeout = '2s';

do $$
declare
  c_nj   constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  u_gab  constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_recs constant uuid[] := array[
    '3a475069-d4f5-47a5-b3c7-34c10097f395', '25d7c5b1-4497-4fa6-8b1e-617fdc12d264', '362d67b4-a8fa-4a7c-93d8-6726b1bf16f4', '041b340e-f705-4d9b-8200-b283fe18c01b',
    '90410e6e-c7d6-4183-83dc-d4b32a2d91de', '9aae8c75-1e6c-4d01-a7d7-701a4c7c7dc3', '18b2e179-30f4-4d09-b160-f2c0e9bbaf97', '326ac217-bba2-4617-8448-2018fc6306b3',
    '75868144-e69d-4530-b758-e121f451813d', '47d6adbb-c0dd-47f8-a3af-c3bf339829bb', '5be108e0-3d72-4e84-bfae-f34d023528fa', '03b46707-89e9-4835-9885-7b2bdfa5d8ea',
    '914317fc-b0cd-4d73-a320-86ab381bd8d8', 'b296dfae-26cc-4ea5-bd93-8b7fef01c56f', 'c4166b9d-095c-4e48-a102-7ddae54d389e', '83baed88-ea8e-4e4d-a501-b93e09d86ec1',
    '03de7f86-573e-4067-b7b9-0386eeca6f46', 'bafe6998-34f2-4735-b516-8e60255a0a27', '5b8ec3e3-d6b1-44c2-bc22-04c96a8197f9', 'bea92eb3-5b27-4921-9508-a796b66bb4a4',
    'ffe98cbc-cec4-4980-94c7-bcdeb954a997', '9b2d6cc7-15c6-4f37-8d4d-2af8412ed9ae', 'be15b234-062f-44f4-91a2-768f959be598', '3d86489f-5cdb-49ef-8f1e-b4cb824dac60'
  ]::uuid[];
  c_desc constant text := '13º Salário 1ª Parcela 2026';
  n int; s numeric;
begin
  /* as guardas */
  select count(*) into n from financeiro_recorrencias where id = any(v_recs) and cliente_id = c_nj and folha and ativo;
  if n <> 24 then raise exception 'F8: % das 24 recorrências estão ativas e de folha no NJ: refazer a prévia.', n; end if;
  if exists (select 1 from financeiro_lancamentos_v2 l join financeiro_recorrencias r on r.favorecido_id = l.favorecido_id and r.id = any(v_recs)
             where l.cliente_id = c_nj and not l.cancelado and l.descricao ilike '13º Salário%2026') then
    raise exception 'F8: já existe 13º 2026 para algum deles: nada feito.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', u_gab, 'role', 'authenticated')::text, true);
  perform set_config('app.via', 'folha-13-1a-2026', true);

  with rec as (
    select r.id, r.favorecido_id, abs(r.valor_base) sal from financeiro_recorrencias r where r.id = any(v_recs)
  ), prim as (
    select l.favorecido_id, min(coalesce(l.data_pagamento, l.data_vencimento)) p from financeiro_lancamentos_v2 l
     where l.cliente_id = c_nj and not l.cancelado and l.status_transacao in ('realizado', 'conciliado') and l.subcentro ~* 'sal[aá]rios'
       and l.favorecido_id in (select favorecido_id from rec)
     group by 1
  ), nov as (
    select distinct on (l.recorrencia_id) l.* from financeiro_lancamentos_v2 l
     where l.recorrencia_id = any(v_recs) and not l.cancelado and l.data_vencimento between '2026-11-01' and '2026-11-30'
     order by l.recorrencia_id, l.data_vencimento
  ), base as (
    select nov.*, rec.sal, case when prim.p < '2026-02-01' then 12 else 14 - extract(month from prim.p)::int end avos
      from rec join nov on nov.recorrencia_id = rec.id join prim on prim.favorecido_id = rec.favorecido_id
  )
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, valor, tipo_operacao, sinal, descricao, status_transacao, data_competencia,
         data_vencimento, conta_bancaria_id, plano_conta_id, favorecido_id, forma_pagamento, escopo_negocio, cenario, cultura, fase,
         origem_lancamento, observacao, created_by, updated_by)
  select b.cliente_id, b.fazenda_id, round(b.sal / 2 * b.avos / 12, 2), b.tipo_operacao, b.sinal, c_desc, 'previsto', date '2026-11-01',
         date '2026-11-30', b.conta_bancaria_id, b.plano_conta_id, b.favorecido_id, b.forma_pagamento, b.escopo_negocio, b.cenario, b.cultura, b.fase,
         'manual', format('estimado: 50%% do salário (%s) × %s/12 avos — confirmar pelo recibo do contador (F8, 18/11/2026)',
                          to_char(b.sal, 'FM999G990D00'), b.avos),
         u_gab, u_gab
    from base b;
  get diagnostics n = row_count;

  select count(*), coalesce(sum(valor), 0) into n, s from financeiro_lancamentos_v2
   where cliente_id = c_nj and not cancelado and descricao = c_desc and data_vencimento = '2026-11-30' and status_transacao = 'previsto';
  if n <> 24 or s <> 27651.61 then raise exception 'F8: ficaram % lançamentos e R$ % (a prévia é 24 e 27.651,61): nada fica.', n, s; end if;
  perform set_config('app.via', '', true);
end $$;
