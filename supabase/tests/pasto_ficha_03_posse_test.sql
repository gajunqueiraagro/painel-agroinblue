-- PASTO-FICHA-01 · teste da 20261028117245 (posse: de quem + desde/até). Roda DEPOIS da migration (no ensaio, na mesma transação). Fixture
-- sintético no cliente Teste (43f32d07 · Fazenda Teste Cana c2498ace); admin = 7bd0b6ad. As chamadas rodam como `authenticated` com as
-- claims do admin. TERMINA EM RAISE: nada fica no banco.
--   P1  criar arrendado: a prévia mostra o NOME do fornecedor (nunca o id) e não grava; o real grava de quem + desde/até
--   P2  salvar: trocar o "até" grava; voltar para PRÓPRIA limpa os três (na prévia e no gravado)
--   P3  recusas: fornecedor de OUTRO cliente · "até" antes do "desde" · mês com dia
--   P4  a gravação DIRETA dos três campos não passa (a trava da ficha); a de nome continua
--   P5  sem os três (o chamador de antes) a ficha grava como sempre
set local lock_timeout = '2s';
set local statement_timeout = '25s';

-- os fornecedores do fixture, lidos ANTES de virar `authenticated` (de outro cliente a RLS esconderia)
do $prep$
declare v_meu uuid; v_outro uuid;
begin
  select id into v_meu from public.financeiro_fornecedores where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a' and ativo order by created_at limit 1;
  select id into v_outro from public.financeiro_fornecedores where cliente_id <> '43f32d07-dba8-4670-900c-bf645440c04a' and ativo order by created_at limit 1;
  if v_meu is null or v_outro is null then raise exception 'P0: fixture sem fornecedor'; end if;
  perform set_config('teste.meu', v_meu::text, true); perform set_config('teste.outro', v_outro::text, true);
  perform set_config('teste.nome_meu', (select nome from public.financeiro_fornecedores where id = v_meu), true);
end $prep$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;

do $t$
declare
  r jsonb; v_id uuid; t text; p public.pastos; v_ver int;
  v_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_am text := to_char((date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '1 month')::date, 'YYYY-MM');
  v_meu uuid := current_setting('teste.meu')::uuid; v_outro uuid := current_setting('teste.outro')::uuid;
begin
  -- P1 · criar arrendado
  r := public.fn_pasto_criar(v_faz, jsonb_build_object('nome', 'Pasto Posse Teste', 'tipo_uso', 'recria', 'mes_inicio', v_am,
         'posse', 'arrendada_de_terceiro', 'posse_contraparte_id', v_meu, 'posse_desde', '2022-01', 'posse_ate', '2027-12'), 40, true);
  if not exists (select 1 from jsonb_array_elements(r->'muda') m where m->>'campo' = 'posse_contraparte_id' and m->>'depois_nome' = current_setting('teste.nome_meu')) then
    raise exception 'P1 a prévia não mostra o nome do fornecedor: %', r->'muda'; end if;
  if exists (select 1 from public.pastos where fazenda_id = v_faz and nome = 'Pasto Posse Teste') then raise exception 'P1 a prévia gravou'; end if;
  r := public.fn_pasto_criar(v_faz, jsonb_build_object('nome', 'Pasto Posse Teste', 'tipo_uso', 'recria', 'mes_inicio', v_am,
         'posse', 'arrendada_de_terceiro', 'posse_contraparte_id', v_meu, 'posse_desde', '2022-01', 'posse_ate', '2027-12'), 40, false);
  v_id := (r->>'pasto_id')::uuid;
  select * into p from public.pastos where id = v_id;
  if p.posse_contraparte_id is distinct from v_meu or p.posse_desde <> date '2022-01-01' or p.posse_ate <> date '2027-12-01' then
    raise exception 'P1 gravado: % % %', p.posse_contraparte_id, p.posse_desde, p.posse_ate; end if;

  -- P2 · salvar: trocar o "até"; voltar para própria limpa
  r := public.fn_pasto_ficha_salvar(v_id, p.ficha_versao, jsonb_build_object('posse_ate', '2028-06'), 'teste', false);
  select * into p from public.pastos where id = v_id;
  if p.posse_ate <> date '2028-06-01' then raise exception 'P2 o até não gravou: %', p.posse_ate; end if;
  r := public.fn_pasto_ficha_salvar(v_id, p.ficha_versao, jsonb_build_object('posse', 'propria'), 'teste', true);
  if (select count(*) from jsonb_array_elements(r->'muda') m where m->>'campo' in ('posse', 'posse_contraparte_id', 'posse_desde', 'posse_ate')) <> 4 then
    raise exception 'P2 a prévia da própria não limpa os três: %', r->'muda'; end if;
  r := public.fn_pasto_ficha_salvar(v_id, p.ficha_versao, jsonb_build_object('posse', 'propria'), 'teste', false);
  select * into p from public.pastos where id = v_id;
  if p.posse <> 'propria' or p.posse_contraparte_id is not null or p.posse_desde is not null or p.posse_ate is not null then
    raise exception 'P2 a própria não limpou: % % %', p.posse_contraparte_id, p.posse_desde, p.posse_ate; end if;

  -- P3 · recusas
  v_ver := p.ficha_versao;
  t := null; begin perform public.fn_pasto_ficha_salvar(v_id, v_ver, jsonb_build_object('posse', 'arrendada_de_terceiro', 'posse_contraparte_id', v_outro), 'x', true);
    exception when others then t := sqlerrm; end;
  if t is null or t not like 'Posse: quem você escolheu não está no cadastro%' then raise exception 'P3a: %', t; end if;
  t := null; begin perform public.fn_pasto_ficha_salvar(v_id, v_ver, jsonb_build_object('posse', 'cedida_a_terceiro', 'posse_desde', '2026-05', 'posse_ate', '2026-01'), 'x', true);
    exception when others then t := sqlerrm; end;
  if t is null or t not like 'Posse: o "até" não pode ser antes%' then raise exception 'P3b: %', t; end if;
  t := null; begin perform public.fn_pasto_ficha_salvar(v_id, v_ver, jsonb_build_object('posse', 'cedida_a_terceiro', 'posse_desde', '2026-05-17'), 'x', true);
    exception when others then t := sqlerrm; end;
  if t is null then raise exception 'P3c: mês com dia passou'; end if;

  -- P4 · gravação direta não passa; renomear passa
  t := null; begin update public.pastos set posse_desde = date '2020-01-01' where id = v_id; exception when others then t := sqlerrm; end;
  if t is null or t not like 'Os dados da ficha do pasto gravam só pela ficha%' then raise exception 'P4 a trava não pegou o posse_desde: %', t; end if;
  t := null; begin update public.pastos set posse_contraparte_id = v_meu where id = v_id; exception when others then t := sqlerrm; end;
  if t is null then raise exception 'P4 a trava não pegou o posse_contraparte_id'; end if;
  update public.pastos set nome = 'Pasto Posse Teste 2' where id = v_id;

  -- P5 · sem os três, a ficha grava como sempre
  select * into p from public.pastos where id = v_id;
  r := public.fn_pasto_ficha_salvar(v_id, p.ficha_versao, jsonb_build_object('manejo', 'rotacionado'), 'teste', false);
  if (select manejo from public.pastos where id = v_id) <> 'rotacionado' then raise exception 'P5 o manejo não gravou'; end if;

  raise exception 'OK PASTO-FICHA-01 (117245): P1–P5 passaram (nada fica no banco)';
end $t$;
