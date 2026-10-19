-- FORN-REPETIDOS-SEM-RATEIO-01 — as sugestoes de mesclagem nunca juntam "Pec.3M-X" (rateio, NF no nome do Higino) com "X".
--   R1 mesmo nome comparado, um com o prefixo e um sem: nao e' sugerido
--   R2 mesmo CPF/CNPJ, um com o prefixo e um sem: nao e' sugerido
--   R3 dois do MESMO lado (os dois com o prefixo; os dois sem): continuam sugeridos
-- Sintetico no cliente Teste; termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '30s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v jsonb; grupos jsonb;
BEGIN
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values
    (k, 'SINT RATEIO Alfa Ltda', null, true), (k, 'Pec.3M-SINT RATEIO Alfa', null, true),
    (k, 'SINT RATEIO Beta', '11.222.333/0001-81', true), (k, 'Pec.3M-SINT RATEIO Gama', '11.222.333/0001-81', true),
    (k, 'Pec.3M-SINT RATEIO Delta', null, true), (k, 'Pec.3M-SINT RATEIO Delta Ltda', null, true),
    (k, 'SINT RATEIO Eps', null, true), (k, 'SINT RATEIO Eps S.A.', null, true);
  v := public.fn_fornecedor_repetidos(k);
  select coalesce(jsonb_agg(g), '[]'::jsonb) into grupos from jsonb_array_elements(v) g
   where exists (select 1 from jsonb_array_elements(g->'fornecedores') x where x->>'nome' like '%SINT RATEIO%');
  if exists (select 1 from jsonb_array_elements(grupos) g
              where (select bool_or(x->>'nome' ~* '^\s*pec\.3m-') and bool_or(x->>'nome' !~* '^\s*pec\.3m-') from jsonb_array_elements(g->'fornecedores') x)) then
    raise exception 'R1/R2 grupo misto sugerido: %', grupos;
  end if;
  if not exists (select 1 from jsonb_array_elements(grupos) g, jsonb_array_elements(g->'fornecedores') x where x->>'nome' = 'Pec.3M-SINT RATEIO Delta Ltda') then
    raise exception 'R3 par Pec.3M- do mesmo lado sumiu: %', grupos;
  end if;
  if not exists (select 1 from jsonb_array_elements(grupos) g, jsonb_array_elements(g->'fornecedores') x where x->>'nome' = 'SINT RATEIO Eps S.A.') then
    raise exception 'R3 par sem prefixo sumiu: %', grupos;
  end if;
  if exists (select 1 from jsonb_array_elements(grupos) g, jsonb_array_elements(g->'fornecedores') x where x->>'nome' in ('SINT RATEIO Alfa Ltda','SINT RATEIO Beta')) then
    raise exception 'R1/R2 o sem prefixo ainda aparece com o par do rateio: %', grupos;
  end if;
  RAISE EXCEPTION 'OK';
END $t$;
