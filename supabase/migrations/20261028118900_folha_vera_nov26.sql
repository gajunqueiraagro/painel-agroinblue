-- FOLHA-VERA nov/26 (Gabriel 27/11, pacote do Rodrigo lido pelos leitores F1–F3 publicados) — lote 118900. DADO DE CLIENTE (Vera).
-- A) RATEIO-HIGINO-01 D4 completo: o salário base de NOV/2026 (relatório analítico do contador) dos 6 funcionários em comum, desde
--    01/11/2026, parte da Vera 50%, pelo fn_folha_salario_gravar (trilha, via code6). Inclui o Ademir (sem salário até hoje).
-- B) Os lançamentos de competência 11/2026 na Conta fazenda (favorecido "Pec.3M-<nome>", a regra da casa do rateio) ganham o valor REAL da
--    metade da Vera e passam de previsto a PROGRAMADO (o documento chegou):
--    - salário (o líquido da folha mensal ÷ 2) e 13º 1ª parcela (o líquido ÷ 2), de 5 funcionários;
--    - INSS do DARF (o rateio do Rodrigo por fazenda ÷ 2), vencimento do DARF 18/12/2026;
--    - FGTS da GFD (a relação do FGTS por fazenda: o 13º pelo analítico do 13º, o resto é o mensal; ÷ 2), vencimento 18/12/2026.
--    Metade com centavo ímpar = arredonda para cima (a Vera paga até R$ 0,005 a mais por linha).
-- ⚠ NÃO MEXE (dúvidas abertas com o Rodrigo): os 2 do José Luis Sola (salário e 13º), os 2 "IRRF" (a folha retém 713,57 do José e o DARF não
--   tem IR) e os 2 "INSS - 13" (o 13º 1ª parcela não tem INSS; ele vem com a 2ª, em dezembro).
-- ⚠ Favorecido, conta do plano, conta bancária e competência NÃO mudam. O Weber não é em comum: nada dele aqui.
-- ⚠ GUARDADO: cada lançamento só muda se estiver como na prévia (id, cliente, descrição, valor e status 'previsto') — senão nada muda e diz qual.
do $lote$
declare
  V constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  MOTIVO constant text := 'RATEIO-HIGINO-01 D4 (FOLHA-VERA nov/26): salário base de 11/2026 (relatório analítico do contador); parte da Vera 50% (em comum com o Higino)';
  r record; v_adm uuid; v_n int := 0; v_k int;
begin
  select user_id into v_adm from public.cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  if v_adm is null then raise exception 'FOLHA-VERA nov/26: sem admin da equipe para assinar'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  perform set_config('app.via', 'code6:FOLHA-VERA-NOV26', true);

  -- A) salários de 11/2026, parte 50%
  for r in select * from (values
      ('5325ca55-8545-429a-9994-45fb8a874e17'::uuid, 3242.00::numeric),
      ('a27e2e82-b90d-454d-ab04-c093bc67b737'::uuid, 3242.00::numeric),
      ('6618113b-cec7-463c-a740-45506609f3d6'::uuid, 4052.50::numeric),
      ('37a2ac66-af5a-4fb0-9d18-30b7ed6d00b7'::uuid, 5349.81::numeric),
      ('de39dfe6-1f9c-4460-bf87-17c5b948f352'::uuid, 1621.00::numeric),
      ('e41266c4-6836-4eb8-80fe-76223414f1b3'::uuid, 1926.00::numeric)) x(fun, salario)
  loop
    if not exists (select 1 from public.folha_funcionarios f where f.id = r.fun and f.cliente_id = V and f.empregador_registro = 'Higino (Pec.3M)' and f.desligamento is null) then
      raise exception 'FOLHA-VERA nov/26: o funcionário % não é mais o da prévia', r.fun;
    end if;
    if exists (select 1 from public.folha_funcionario_salarios s where s.funcionario_id = r.fun and s.desde >= date '2026-11-01') then
      raise exception 'FOLHA-VERA nov/26: o funcionário % já tem salário desde 11/2026 (a prévia tinha nenhum)', r.fun;
    end if;
    perform public.fn_folha_salario_gravar(r.fun, date '2026-11-01', r.salario, 50, MOTIVO, false);
  end loop;

  -- B) os lançamentos de 11/2026: (id, descrição de hoje, valor de hoje) → (valor real, vencimento)
  for r in select * from (values
      ('61de808d-e4cf-47b9-b1ff-da148c0bae8e'::uuid, 'Folha Pagamento',      1167.65::numeric, 1143.07::numeric, null::date),
      ('aed7bb86-b703-4308-98ea-1525ba585e0b'::uuid, 'Folha Pagamento - 13', 1167.65, 815.87,  null),
      ('32974388-e1ab-4db7-9521-c24091bbbeda'::uuid, 'Folha Pagamento',      1526.84, 1561.19, null),
      ('93e22dc1-c45c-4eea-b141-10cf323c60d4'::uuid, 'Folha Pagamento - 13', 1526.84, 859.88,  null),
      ('b893bba4-1826-4589-bfb1-b03214c3e567'::uuid, 'Folha Pagamento',      1838.80, 1950.25, null),
      ('fc04b30d-7f7c-4ec8-be6e-9645038e35b8'::uuid, 'Folha Pagamento - 13', 1838.80, 1046.09, null),
      ('10dbff07-7e0f-4e39-bf6a-173b98bff0fd'::uuid, 'Folha Pagamento',      783.48,  783.48,  null),
      ('89c14e68-2da8-49bf-b5ec-ac5670de8df7'::uuid, 'Folha Pagamento - 13', 783.48,  416.22,  null),
      ('5952d85c-03e6-4e00-a822-b3d7244cbf4f'::uuid, 'Folha Pagamento',      888.49,  888.49,  null),
      ('aa647913-64c7-49b8-a02d-ad92dd6eb097'::uuid, 'Folha Pagamento - 13', 888.49,  497.73,  null),
      ('e3c6b2a3-12a7-4004-b945-6c37266a5064'::uuid, 'INSS',                 998.75,  1158.92, date '2026-12-18'),
      ('99830125-a541-4cbe-a2d4-2719bd595876'::uuid, 'INSS',                 103.04,  100.52,  date '2026-12-18'),
      ('0d0965d8-7124-4bc5-9a4e-594834b1e5d3'::uuid, 'FGTS',                 676.25,  753.91,  date '2026-12-18'),
      ('6e8441f6-49c4-4898-a96e-200bca2b5e34'::uuid, 'FGTS - 13',            676.25,  358.04,  date '2026-12-18'),
      ('21b76454-c940-4556-83a4-cab6895f121a'::uuid, 'FGTS',                 77.04,   77.04,   date '2026-12-18'),
      ('23f2b595-8655-4576-a7b6-bd3a87471f7f'::uuid, 'FGTS - 13',            77.04,   39.82,   date '2026-12-18')) x(id, descricao, antes, depois, venc)
  loop
    update public.financeiro_lancamentos_v2 l
       set valor = sign(l.valor) * r.depois, data_vencimento = coalesce(r.venc, l.data_vencimento), status_transacao = 'programado'
     where l.id = r.id and l.cliente_id = V and l.descricao = r.descricao and abs(l.valor) = r.antes and l.status_transacao = 'previsto'
       and not coalesce(l.cancelado, false) and l.data_competencia = date '2026-11-01';
    get diagnostics v_k = row_count;
    if v_k <> 1 then raise exception 'FOLHA-VERA nov/26: o lançamento % (%) não está como na prévia', r.id, r.descricao; end if;
    v_n := v_n + 1;
  end loop;
  if v_n <> 16 then raise exception 'FOLHA-VERA nov/26: mudou % lançamentos (esperava 16)', v_n; end if;
end $lote$;
