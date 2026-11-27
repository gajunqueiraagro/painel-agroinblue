-- RATEIO-HIGINO-01 D4 (Gabriel 27/11, pré-requisito do FOLHA-VERA-PACOTE-01) — lote 118890. DADO DE CLIENTE (Vera).
-- Os funcionários EM COMUM (empregador "Higino (Pec.3M)") ganham a PARTE da Vera = 50% em folha_funcionario_salarios.parte_pct, pelo
-- gravador da casa (fn_folha_salario_gravar, com a trilha). O gravador exige o salário: o único documento com o salário BASE (folha cheia)
-- é o relatório analítico do contador de 02/2025 (os de 2026 trazem só o líquido) → salário base de 02/2025, desde 01/02/2025, parte 50,
-- motivo "salário base de 02/2025 (relatório analítico do contador) — confirmar o de hoje".
-- ⚠ FICA DE FORA quem não está no relatório de 02/2025 (1 funcionário em comum: sem documento com o salário — nunca chutar).
-- ⚠ O gravador tira a marca "a atualizar: salário" (regra dele); admissão, cargo e CPF seguem marcados.
-- ⚠ Nenhum lançamento muda (o fn_folha_prever só roda pelo gesto da tela; nenhum agendamento lê o salário).
-- ⚠ GUARDADO: cada um é da Vera, em comum, sem desligamento e SEM nenhum salário — senão nada muda e diz quem.
do $lote$
declare
  V constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  MOTIVO constant text := 'RATEIO-HIGINO-01 D4: salário base de 02/2025 (relatório analítico do contador) — confirmar o de hoje; parte da Vera 50% (em comum com o Higino)';
  r record; v_adm uuid; v_n int := 0;
begin
  select user_id into v_adm from public.cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  if v_adm is null then raise exception 'RATEIO-HIGINO-01 D4: sem admin da equipe para assinar'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  for r in select * from (values
      ('e41266c4-6836-4eb8-80fe-76223414f1b3'::uuid, 1800.00::numeric),
      ('a27e2e82-b90d-454d-ab04-c093bc67b737'::uuid, 3036.00::numeric),
      ('6618113b-cec7-463c-a740-45506609f3d6'::uuid, 3795.00::numeric),
      ('37a2ac66-af5a-4fb0-9d18-30b7ed6d00b7'::uuid, 4999.82::numeric),
      ('de39dfe6-1f9c-4460-bf87-17c5b948f352'::uuid, 1518.00::numeric)) x(fun, salario)
  loop
    if not exists (select 1 from public.folha_funcionarios f where f.id = r.fun and f.cliente_id = V and f.empregador_registro = 'Higino (Pec.3M)' and f.desligamento is null) then
      raise exception 'RATEIO-HIGINO-01 D4: o funcionário % não é mais o da prévia (cliente, em comum ou desligado)', r.fun;
    end if;
    if exists (select 1 from public.folha_funcionario_salarios s where s.funcionario_id = r.fun) then
      raise exception 'RATEIO-HIGINO-01 D4: o funcionário % já tem salário gravado (a prévia tinha nenhum)', r.fun;
    end if;
    perform set_config('app.via', 'code6:RATEIO-HIGINO-01-D4', true);
    perform public.fn_folha_salario_gravar(r.fun, date '2025-02-01', r.salario, 50, MOTIVO, false);
    v_n := v_n + 1;
  end loop;
  if v_n <> 5 then raise exception 'RATEIO-HIGINO-01 D4: gravou % (esperava 5)', v_n; end if;
end $lote$;
