-- FOLHA-VERA nov/26 · complemento do JOSÉ (Gabriel 27/11: ninguém tirou férias de fato; o salário 319,96 + 5.349,81 e o 13º 2.674,91 de
-- nov são devidos) — lote 118920, DEPOIS do 118900. DADO DE CLIENTE (Vera). Favorecido: o de hoje ("Pec.3M-José Luis Sola", F1 mantido).
-- A) o salário de nov = o líquido da folha oficial (319,96 ÷ 2 = 159,98) e o 13º 1ª parcela (2.674,91 ÷ 2 = 1.337,46): previsto → PROGRAMADO.
-- B) o que NÃO bate com a analítica — os 5.349,81 pagos fora da folha oficial (salário durante as férias) — entra como lançamento PRÓPRIO,
--    "Folha Pagamento - pago fora da folha", mesmo custo de mão de obra (cópia do salário dele: conta, plano, fazenda, competência, vencimento),
--    observação "pago fora da folha" (a marca de verdade é frente própria). Avulso: sem o elo da recorrência do salário. A metade é 2.674,905; ESTA linha leva os centavos do mês para a
--    soma da metade da Vera dar exatamente 16.622,82 (o 118900 arredondou 8 metades para cima): 2.674,86.
-- C) o reembolso ao Higino, previsto "Rateio Folha Pagamento" de 04/12/2026 (Itaú): 10.626,48 → 16.622,82, programado.
-- ⚠ NÃO MEXE: os 2 "IRRF" (o IRRF de férias 713,57 do José fica só como AVISO: é do Higino/contador) e os 2 "INSS - 13".
-- ⚠ GUARDADO: só depois do 118900 (os 16 dele programados) e com cada lançamento como na prévia — senão nada muda e diz qual.
do $lote$
declare
  V constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  JOSE_MENSAL constant uuid := '03accdfd-c841-495d-8d50-521ab095c5cf';
  JOSE_13 constant uuid := '3c7039c6-4ef3-44fc-a2ca-7f385dc38d0d';
  REEMBOLSO constant uuid := '6ff9c778-dabc-4b60-846c-9dd1264e099d';
  v_adm uuid; v_k int; v_cols text; v_novo uuid; v_soma numeric;
begin
  select user_id into v_adm from public.cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  if v_adm is null then raise exception 'FOLHA-VERA nov/26 José: sem admin da equipe para assinar'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
  perform set_config('app.via', 'code6:FOLHA-VERA-NOV26-JOSE', true);

  if (select count(*) from public.financeiro_lancamentos_v2 l join public.financeiro_contas_bancarias c on c.id = l.conta_bancaria_id
       where l.cliente_id = V and l.data_competencia = date '2026-11-01' and l.status_transacao = 'programado' and not coalesce(l.cancelado, false)
         and l.id in ('61de808d-e4cf-47b9-b1ff-da148c0bae8e', 'aed7bb86-b703-4308-98ea-1525ba585e0b', '32974388-e1ab-4db7-9521-c24091bbbeda',
           '93e22dc1-c45c-4eea-b141-10cf323c60d4', 'b893bba4-1826-4589-bfb1-b03214c3e567', 'fc04b30d-7f7c-4ec8-be6e-9645038e35b8',
           '10dbff07-7e0f-4e39-bf6a-173b98bff0fd', '89c14e68-2da8-49bf-b5ec-ac5670de8df7', '5952d85c-03e6-4e00-a822-b3d7244cbf4f',
           'aa647913-64c7-49b8-a02d-ad92dd6eb097', 'e3c6b2a3-12a7-4004-b945-6c37266a5064', '99830125-a541-4cbe-a2d4-2719bd595876',
           '0d0965d8-7124-4bc5-9a4e-594834b1e5d3', '6e8441f6-49c4-4898-a96e-200bca2b5e34', '21b76454-c940-4556-83a4-cab6895f121a',
           '23f2b595-8655-4576-a7b6-bd3a87471f7f')) <> 16 then
    raise exception 'FOLHA-VERA nov/26 José: o lote 118900 não está aplicado (os 16 programados)';
  end if;

  -- A) o salário oficial e o 13º
  update public.financeiro_lancamentos_v2 l set valor = sign(l.valor) * 159.98, status_transacao = 'programado'
   where l.id = JOSE_MENSAL and l.cliente_id = V and l.descricao = 'Folha Pagamento' and abs(l.valor) = 2345.61 and l.status_transacao = 'previsto' and not coalesce(l.cancelado, false);
  get diagnostics v_k = row_count;
  if v_k <> 1 then raise exception 'FOLHA-VERA nov/26 José: o salário não está como na prévia'; end if;
  update public.financeiro_lancamentos_v2 l set valor = sign(l.valor) * 1337.46, status_transacao = 'programado'
   where l.id = JOSE_13 and l.cliente_id = V and l.descricao = 'Folha Pagamento - 13' and abs(l.valor) = 2345.61 and l.status_transacao = 'previsto' and not coalesce(l.cancelado, false);
  get diagnostics v_k = row_count;
  if v_k <> 1 then raise exception 'FOLHA-VERA nov/26 José: o 13º não está como na prévia'; end if;

  -- B) o pago fora da folha: cópia do salário dele (as colunas gravadas, sem as geradas), outro id, valor, descrição e observação
  if exists (select 1 from public.financeiro_lancamentos_v2 where cliente_id = V and descricao = 'Folha Pagamento - pago fora da folha'
               and data_competencia = date '2026-11-01' and not coalesce(cancelado, false)) then
    raise exception 'FOLHA-VERA nov/26 José: o pago fora da folha já existe';
  end if;
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols from pg_attribute
   where attrelid = 'public.financeiro_lancamentos_v2'::regclass and attnum > 0 and not attisdropped and attgenerated = '';
  execute format('insert into public.financeiro_lancamentos_v2 (%1$s) select %1$s from jsonb_populate_record(null::public.financeiro_lancamentos_v2, $1) returning id', v_cols)
    into v_novo
    using (select to_jsonb(l) || jsonb_build_object('id', gen_random_uuid(), 'valor', sign(l.valor) * 2674.86, 'descricao', 'Folha Pagamento - pago fora da folha',
             'observacao', 'pago fora da folha: salário durante as férias (5.349,81 ÷ 2; leva os centavos do mês) — mesmo custo de mão de obra; não confere com a analítica e isso NÃO é erro',
             'status_transacao', 'programado', 'created_at', now(), 'updated_at', now(),
             -- lançamento avulso: sem o elo da recorrência/geração/importação do salário copiado (um por recorrência e competência)
             'recorrencia_id', null, 'grupo_geracao_id', null, 'hash_importacao', null, 'staging_id', null, 'lote_importacao_id', null,
             'valor_do_mes_em', null, 'valor_do_mes_origem', null, 'vencimento_origem', null)
             from public.financeiro_lancamentos_v2 l where l.id = JOSE_MENSAL);
  if v_novo is null then raise exception 'FOLHA-VERA nov/26 José: o pago fora da folha não nasceu'; end if;

  -- C) o reembolso ao Higino
  update public.financeiro_lancamentos_v2 l set valor = sign(l.valor) * 16622.82, status_transacao = 'programado'
   where l.id = REEMBOLSO and l.cliente_id = V and l.descricao = 'Rateio Folha Pagamento' and abs(l.valor) = 10626.48
     and l.status_transacao = 'previsto' and not coalesce(l.cancelado, false);
  get diagnostics v_k = row_count;
  if v_k <> 1 then raise exception 'FOLHA-VERA nov/26 José: o reembolso de 04/12 não está como na prévia'; end if;

  -- a metade da Vera em nov/26 fecha com o Rodrigo
  select sum(abs(valor)) into v_soma from public.financeiro_lancamentos_v2
   where id in ('61de808d-e4cf-47b9-b1ff-da148c0bae8e', 'aed7bb86-b703-4308-98ea-1525ba585e0b', '32974388-e1ab-4db7-9521-c24091bbbeda',
     '93e22dc1-c45c-4eea-b141-10cf323c60d4', 'b893bba4-1826-4589-bfb1-b03214c3e567', 'fc04b30d-7f7c-4ec8-be6e-9645038e35b8',
     '10dbff07-7e0f-4e39-bf6a-173b98bff0fd', '89c14e68-2da8-49bf-b5ec-ac5670de8df7', '5952d85c-03e6-4e00-a822-b3d7244cbf4f',
     'aa647913-64c7-49b8-a02d-ad92dd6eb097', 'e3c6b2a3-12a7-4004-b945-6c37266a5064', '99830125-a541-4cbe-a2d4-2719bd595876',
     '0d0965d8-7124-4bc5-9a4e-594834b1e5d3', '6e8441f6-49c4-4898-a96e-200bca2b5e34', '21b76454-c940-4556-83a4-cab6895f121a',
     '23f2b595-8655-4576-a7b6-bd3a87471f7f', JOSE_MENSAL, JOSE_13) or id = v_novo;
  if v_soma <> 16622.82 then raise exception 'FOLHA-VERA nov/26 José: a metade da Vera deu % (esperava 16.622,82)', v_soma; end if;
end $lote$;
