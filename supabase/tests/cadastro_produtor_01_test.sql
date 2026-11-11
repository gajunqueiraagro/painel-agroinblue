-- CADASTRO-PRODUTOR-01 · teste da 20261028117290. Roda DEPOIS da migration (no ensaio, na mesma transação). Fixture sintético no cliente
-- Teste (43f32d07 · Fazenda Teste Cana c2498ace · conta Itau Personalite 131b8501 · os 5 "Pensão Crianças" de 2026 e as 6 amortizações
-- de 2027); admin = 7bd0b6ad; "de fora" = a91962cd. CPF/CNPJ sintéticos com dígito válido; o CNPJ alfanumérico é o exemplo da Receita.
-- As chamadas rodam como `authenticated` com as claims do usuário. TERMINA EM RAISE: nada fica no banco.
--   T0  objetos: 11 funções públicas fechadas (SECURITY DEFINER, sem anon), auxiliares sem EXECUTE, 5 tabelas novas só leitura com RLS
--       e o gatilho do perfil leitura, a coluna ie aposentada, o gatilho do titular da conta existe
--   T1  documento: CNPJ alfanumérico válido/errado, numérico de hoje válido, normalização
--   T2  titular: produtor PF, terceiro, PJ alfanumérica; pendências (aviso, nunca bloqueio); IEs (tirar inativa); recusas com a frase
--   T3  composição: soma ≠ 100 grava com aviso; condição e "registra" gravados; o terceiro fica "total"
--   T4  condição IBS/CBS: versões, corrigir, recusas
--   T5  grupo: PJ com %, recusas
--   T6  conta: o modal (fn_conta_bancaria_salvar) e o UPDATE direto não mudam o titular; a ligação muda; renomear o titular renomeia a
--       conta; o titular ligado não troca o CPF nem inativa
--   T7  acordos: % a confirmar, sugestão, ligar (prévia, tudo ou nada), preencher o % congela os ligados, outro acordo recusa, desfazer
--   T8  listas: titulares (pendências, fazendas, contas) e acordos (ligados, soma, a confirmar)
--   T9  acesso: o de fora leva 42501 em todas e não lê nada
--   T10 trilha: autor = quem está logado
set local lock_timeout = '2s';
set local statement_timeout = '25s';

do $t0$
declare n int;
begin
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('fn_fiscal_titular_gravar', 'fn_fiscal_fazenda_titulares_gravar', 'fn_fiscal_titular_condicao_ibs_gravar',
                       'fn_fiscal_titular_grupo_gravar', 'fn_fiscal_conta_titular_gravar', 'fn_fiscal_acordo_rateio_gravar',
                       'fn_fiscal_lancamentos_acordo_ligar', 'fn_fiscal_lancamentos_acordo_desfazer', 'fn_fiscal_acordos_sugeridos',
                       'fn_fiscal_titulares_lista', 'fn_fiscal_acordos_lista')
     and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 11 then raise exception 'T0: funções públicas fora do padrão (% de 11)', n; end if;
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('_fn_documento_normalizar', '_fn_cpf_cnpj_valido', '_fn_fiscal_campo_texto', '_fn_fiscal_titular_pendencias',
                       '_fn_conta_titular_um_dono')
     and not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute');
  if n <> 5 then raise exception 'T0: auxiliares abertas (% de 5 fechadas)', n; end if;
  select count(*) into n from pg_class c where c.oid in ('public.fiscal_titular_ies'::regclass, 'public.fiscal_titular_condicao_ibs'::regclass,
       'public.fiscal_titular_grupo'::regclass, 'public.fiscal_acordos_rateio'::regclass, 'public.fiscal_lancamento_acordo'::regclass)
     and c.relrowsecurity and has_table_privilege('authenticated', c.oid, 'select')
     and not has_table_privilege('authenticated', c.oid, 'insert') and not has_table_privilege('authenticated', c.oid, 'update')
     and not has_table_privilege('authenticated', c.oid, 'delete') and not has_table_privilege('anon', c.oid, 'select')
     and exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'trg_leitura_nao_grava');
  if n <> 5 then raise exception 'T0: tabelas novas fora do padrão (% de 5)', n; end if;
  if not exists (select 1 from pg_constraint where conname = 'fiscal_titulares_ie_aposentada_ck'
                    and conrelid = 'public.fiscal_titulares'::regclass) then
    raise exception 'T0: a coluna fiscal_titulares.ie devia estar aposentada (CHECK ie is null)';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_fiscal_conta_titular_um_dono'
                    and tgrelid = 'public.financeiro_contas_bancarias'::regclass) then
    raise exception 'T0: falta o gatilho do titular da conta';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fazenda_cadastros' and column_name = 'ccir') then
    raise exception 'T0: falta fazenda_cadastros.ccir';
  end if;

  -- T1 · o documento
  if not public._fn_cpf_cnpj_valido('12ABC34501DE35') then raise exception 'T1: o exemplo da Receita (12ABC34501DE35) devia valer'; end if;
  if public._fn_cpf_cnpj_valido('12ABC34501DE36') then raise exception 'T1: DV errado do alfanumérico passou'; end if;
  if public._fn_cpf_cnpj_valido('12abc34501de35') then raise exception 'T1: minúscula sem normalizar passou'; end if;
  if not public._fn_cpf_cnpj_valido('11222333000181') or not public._fn_cpf_cnpj_valido('52998224725') then
    raise exception 'T1: o numérico de hoje deixou de valer';
  end if;
  if public._fn_cpf_cnpj_valido('11222333000182') or public._fn_cpf_cnpj_valido('5299822472A') or public._fn_cpf_cnpj_valido('AAAAAAAAAAAAAA') then
    raise exception 'T1: documento errado passou';
  end if;
  if public._fn_documento_normalizar('12.abc.345/01de-35') <> '12ABC34501DE35' then raise exception 'T1: a normalização falhou'; end if;
  if public._fn_cpf_cnpj_formatado('12ABC34501DE35') <> '12.ABC.345/01DE-35' then raise exception 'T1: a formatação do alfanumérico falhou'; end if;
end $t0$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;

-- T2 · o titular
do $t2$
declare
  c uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; fz uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f'; r jsonb; v_a uuid; v_h uuid; v_e uuid;
  n int; m text;
begin
  -- prévia não grava
  r := public.fn_fiscal_titular_gravar(c, null, jsonb_build_object('nome', '  Produtora   Teste CP ', 'documento', '529.982.247-25'), true);
  if (r->>'gravado')::boolean or r->>'frase' <> 'Cria o produtor Produtora Teste CP (CPF 529.982.247-25).' then raise exception 'T2: prévia %', r; end if;
  if not (r->'pendencias' ? 'Sem inscrição estadual' and r->'pendencias' ? 'Sem data de nascimento' and r->'pendencias' ? 'Sem fazenda') then
    raise exception 'T2: pendências da prévia %', r->'pendencias';
  end if;
  if exists (select 1 from public.fiscal_titulares where cliente_id = c) then raise exception 'T2: a prévia gravou'; end if;
  -- produtor PF com a ficha e duas IEs
  r := public.fn_fiscal_titular_gravar(c, null, jsonb_build_object('nome', 'Produtora Teste CP', 'documento', '529.982.247-25',
         'cnpj_produtor', '11.222.333/0001-81', 'nascimento', '1960-05-20', 'email_fiscal', 'Fiscal@Teste.com.br', 'endereco', 'Rod. BR 163 km 10',
         'municipio', 'Campo Grande', 'uf', 'ms', 'cep', '79.000-000', 'regime_ir', 'pf_atividade_rural',
         'ies', jsonb_build_array(jsonb_build_object('uf', 'MS', 'ie', '28.123.456-7', 'fazenda_id', fz),
                                  jsonb_build_object('uf', 'MT', 'ie', '131234567'))), false);
  if not (r->>'gravado')::boolean then raise exception 'T2: não gravou %', r; end if;
  v_a := (r->>'titular_id')::uuid;
  if r->'pendencias' <> '["Sem fazenda", "Sem condição no IBS/CBS"]'::jsonb then raise exception 'T2: pendências do produtor %', r->'pendencias'; end if;
  select count(*) into n from public.fiscal_titulares where id = v_a and tipo = 'PF' and papel = 'produtor' and email_fiscal = 'fiscal@teste.com.br'
     and uf = 'MS' and cep = '79000000' and cnpj_produtor = '11222333000181' and nascimento = date '1960-05-20';
  if n <> 1 then raise exception 'T2: a ficha não gravou como devia'; end if;
  select count(*) into n from public.fiscal_titular_ies where titular_id = v_a and ativo;
  if n <> 2 then raise exception 'T2: IEs % de 2', n; end if;
  -- terceiro: sem pendência
  r := public.fn_fiscal_titular_gravar(c, null, jsonb_build_object('nome', 'Terceiro Teste CP', 'documento', '123.456.789-09', 'papel', 'terceiro'), false);
  v_h := (r->>'titular_id')::uuid;
  if r->'pendencias' <> '[]'::jsonb then raise exception 'T2: terceiro com pendência %', r->'pendencias'; end if;
  -- PJ alfanumérica
  r := public.fn_fiscal_titular_gravar(c, null, jsonb_build_object('nome', 'Empresa Teste CP', 'documento', '12.ABC.345/01DE-35',
         'regime_ir', 'pj_presumido'), false);
  v_e := (r->>'titular_id')::uuid;
  if not exists (select 1 from public.fiscal_titulares where id = v_e and documento = '12ABC34501DE35' and tipo = 'PJ') then
    raise exception 'T2: a PJ alfanumérica não gravou %', r;
  end if;
  -- tirar uma IE: inativa, nada se apaga
  r := public.fn_fiscal_titular_gravar(c, v_a, jsonb_build_object('ies', jsonb_build_array(jsonb_build_object('uf', 'MS', 'ie', '281234567', 'fazenda_id', fz))), false);
  select count(*) filter (where ativo), count(*) into n, m from public.fiscal_titular_ies where titular_id = v_a;
  if n <> 1 or m::int <> 2 then raise exception 'T2: tirar a IE: % ativas de %', n, m; end if;
  r := public.fn_fiscal_titular_gravar(c, v_a, jsonb_build_object('nome', 'Produtora Teste CP'), false);
  if (r->>'gravado')::boolean then raise exception 'T2: sem mudança gravou'; end if;
  -- recusas
  foreach m in array array[
    '{"nome":"X","documento":"5299822472A"}|O CPF só tem dígitos.',
    '{"nome":"X","documento":"12ABC34501DE36"}|O CNPJ 12.ABC.345/01DE-36 não é válido: confira os dígitos.',
    '{"nome":"X","documento":"98765432100","regime_ir":"pj_real"}|Pessoa física: o regime é o da atividade rural (a escolha real × 20% é na declaração).',
    '{"nome":"X","documento":"11444777000161","nascimento":"1980-01-01"}|Data de nascimento é só para pessoa física.',
    '{"nome":"X","documento":"11444777000161","cnpj_produtor":"11222333000181"}|O CNPJ do produtor é só para pessoa física (o titular já é um CNPJ).',
    '{"nome":"X","documento":"98765432100","email_fiscal":"sem arroba"}|"sem arroba" não parece um e-mail.',
    '{"nome":"X","documento":"98765432100","uf":"XX"}|"XX" não é uma UF.',
    '{"nome":"X","documento":"98765432100","cep":"7900000"}|CEP: 8 dígitos.',
    '{"nome":"X","documento":"98765432100","ies":[{"uf":"MS","ie":"ISENTO"}]}|"ISENTO" não parece uma inscrição estadual.',
    '{"nome":"X","documento":"98765432100","ies":[{"uf":"MS","ie":"281234567"},{"uf":"MS","ie":"28.123.456-7"}]}|A IE 281234567/MS aparece duas vezes.',
    '{"nome":"X","documento":"529.982.247-25"}|O CPF 529.982.247-25 já é do titular Produtora Teste CP.',
    '{"nome":"X","documento":"98765432100","papel":"dono"}|Papel: produtor ou terceiro (parceiro de rateio).'] loop
    begin
      perform public.fn_fiscal_titular_gravar(c, null, split_part(m, '|', 1)::jsonb, true);
      raise exception 'T2: devia recusar %', split_part(m, '|', 1);
    exception when others then
      if sqlerrm <> split_part(m, '|', 2) then raise exception 'T2: recusa de % veio "%"', split_part(m, '|', 1), sqlerrm; end if;
    end;
  end loop;
  perform set_config('teste.a', v_a::text, true);
  perform set_config('teste.h', v_h::text, true);
  perform set_config('teste.e', v_e::text, true);
end $t2$;

-- T3 · a composição
do $t3$
declare fz uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f'; v_a uuid := current_setting('teste.a')::uuid; v_h uuid := current_setting('teste.h')::uuid;
        r jsonb; n int;
begin
  r := public.fn_fiscal_fazenda_titulares_gravar(fz, date '2026-01-01', jsonb_build_array(
         jsonb_build_object('titular_id', v_a, 'participacao', 50, 'condicao', 'condomino', 'registra', 'so_a_parte')), false);
  if not (r->>'gravado')::boolean or r->'avisos' <> '["A soma de Fazenda Teste Cana é 50% (não 100%): confira se falta alguém ou se é assim mesmo."]'::jsonb then
    raise exception 'T3: soma 50 %', r;
  end if;
  r := public.fn_fiscal_fazenda_titulares_gravar(fz, date '2026-01-01', jsonb_build_array(
         jsonb_build_object('titular_id', v_a, 'participacao', 50, 'condicao', 'condomino', 'registra', 'so_a_parte'),
         jsonb_build_object('titular_id', v_h, 'participacao', 50, 'condicao', 'condomino', 'registra', 'so_a_parte')), true);
  if r->'avisos' <> '[]'::jsonb or not (r->>'corrige_a_versao')::boolean then raise exception 'T3: prévia 50/50 %', r; end if;
  r := public.fn_fiscal_fazenda_titulares_gravar(fz, date '2026-01-01', jsonb_build_array(
         jsonb_build_object('titular_id', v_a, 'participacao', 50, 'condicao', 'condomino', 'registra', 'so_a_parte'),
         jsonb_build_object('titular_id', v_h, 'participacao', 50, 'condicao', 'condomino', 'registra', 'so_a_parte')), false);
  select count(*) into n from public.fiscal_fazenda_titulares where fazenda_id = fz and substituida_em is null
     and ((titular_id = v_a and registra = 'so_a_parte' and condicao = 'condomino') or (titular_id = v_h and registra = 'total'));
  if n <> 2 then raise exception 'T3: condição/registra gravados % de 2', n; end if;
  select count(*) into n from public.fiscal_fazenda_titulares where fazenda_id = fz and substituida_em is not null;
  if n <> 1 then raise exception 'T3: a versão corrigida devia ficar como substituída (%)', n; end if;
  begin
    perform public.fn_fiscal_fazenda_titulares_gravar(fz, date '2026-02-01', ('[{"titular_id":"' || v_a || '","participacao":50,"registra":"metade"}]')::jsonb, true);
    raise exception 'T3: devia recusar o registra';
  exception when others then
    if sqlerrm <> 'O que o financeiro registra para Produtora Teste CP: o total da fazenda ou só a parte.' then raise exception 'T3: %', sqlerrm; end if;
  end;
end $t3$;

-- T4 · a condição no IBS/CBS
do $t4$
declare v_a uuid := current_setting('teste.a')::uuid; v_h uuid := current_setting('teste.h')::uuid; r jsonb; n int;
begin
  r := public.fn_fiscal_titular_condicao_ibs_gravar(v_a, date '2026-01-01', 'nao_contribuinte', 'Receita abaixo do limite', true);
  if (r->>'gravado')::boolean or exists (select 1 from public.fiscal_titular_condicao_ibs where titular_id = v_a) then raise exception 'T4: a prévia gravou'; end if;
  perform public.fn_fiscal_titular_condicao_ibs_gravar(v_a, date '2026-01-01', 'nao_contribuinte', 'Receita abaixo do limite', false);
  r := public.fn_fiscal_titular_condicao_ibs_gravar(v_a, date '2027-01-01', 'optante', 'Opção pelo regime regular', false);
  if not exists (select 1 from public.fiscal_titular_condicao_ibs where titular_id = v_a and vigencia_inicio = date '2026-01-01'
                    and vigencia_fim = date '2026-12-31' and substituida_em is null) then
    raise exception 'T4: a anterior não fechou em 31/12/2026';
  end if;
  r := public.fn_fiscal_titular_condicao_ibs_gravar(v_a, date '2027-01-01', 'contribuinte_pelo_limite', 'Corrige: passou do limite', false);
  select count(*) into n from public.fiscal_titular_condicao_ibs where titular_id = v_a;
  if n <> 3 or not (r->>'corrige_a_versao')::boolean then raise exception 'T4: corrigir: % linhas, %', n, r; end if;
  r := public.fn_fiscal_titular_condicao_ibs_gravar(v_a, date '2027-01-01', 'contribuinte_pelo_limite', 'de novo', false);
  if (r->>'gravado')::boolean then raise exception 'T4: sem mudança gravou'; end if;
  begin
    perform public.fn_fiscal_titular_condicao_ibs_gravar(v_h, date '2026-01-01', 'optante', 'teste', true);
    raise exception 'T4: o terceiro devia recusar';
  exception when others then
    if sqlerrm <> 'A condição no IBS/CBS é só do produtor.' then raise exception 'T4: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_fiscal_titular_condicao_ibs_gravar(v_a, date '2026-06-01', 'optante', 'meio', true);
    raise exception 'T4: no meio da história devia recusar';
  exception when others then
    if sqlerrm <> 'A condição de Produtora Teste CP já tem uma versão a partir de 01/01/2027: a nova começa nessa data (para corrigi-la) ou depois.' then
      raise exception 'T4: %', sqlerrm;
    end if;
  end;
  begin
    perform public.fn_fiscal_titular_condicao_ibs_gravar(v_a, date '2028-01-01', 'optante', 'ok', true);
    raise exception 'T4: motivo curto devia recusar';
  exception when others then
    if sqlerrm <> 'Diga o motivo (pelo menos 3 letras).' then raise exception 'T4: %', sqlerrm; end if;
  end;
end $t4$;

-- T5 · o grupo
do $t5$
declare v_a uuid := current_setting('teste.a')::uuid; v_h uuid := current_setting('teste.h')::uuid; v_e uuid := current_setting('teste.e')::uuid;
        r jsonb; m text;
begin
  r := public.fn_fiscal_titular_grupo_gravar(v_a, date '2026-01-01', jsonb_build_array(
         jsonb_build_object('empresa_id', v_e, 'participacao', 30, 'atividade', 'Comércio de gado', 'entra_no_limite', true)), false);
  if not exists (select 1 from public.fiscal_titular_grupo where titular_id = v_a and empresa_id = v_e and participacao = 30 and entra_no_limite) then
    raise exception 'T5: o grupo não gravou %', r;
  end if;
  foreach m in array array[
    v_h::text || '|Terceiro Teste CP não é uma empresa (CNPJ) produtora deste cliente.',
    v_a::text || '|O titular não é empresa do próprio grupo.'] loop
    begin
      perform public.fn_fiscal_titular_grupo_gravar(v_a, date '2026-01-01', jsonb_build_array(jsonb_build_object('empresa_id', split_part(m, '|', 1), 'participacao', 10)), true);
      raise exception 'T5: devia recusar %', m;
    exception when others then
      if sqlerrm <> split_part(m, '|', 2) then raise exception 'T5: veio "%"', sqlerrm; end if;
    end;
  end loop;
  begin
    perform public.fn_fiscal_titular_grupo_gravar(v_h, date '2026-01-01', '[]', true);
    raise exception 'T5: o terceiro devia recusar';
  exception when others then
    if sqlerrm <> 'O grupo é só do produtor.' then raise exception 'T5: %', sqlerrm; end if;
  end;
end $t5$;

-- T6 · o titular da conta
do $t6$
declare c uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; cb uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d'; v_a uuid := current_setting('teste.a')::uuid;
        r jsonb;
begin
  -- o modal: mandar o mesmo valor (vazio) passa; mudar recusa
  perform public.fn_conta_bancaria_salvar(c, cb, '{"titular_nome": null, "titular_documento": null}'::jsonb);
  begin
    perform public.fn_conta_bancaria_salvar(c, cb, '{"titular_nome": "Alguém"}'::jsonb);
    raise exception 'T6: o modal mudou o titular';
  exception when others then
    if sqlerrm <> 'O titular da conta se liga pelo cadastro do produtor (Cadastros › Produtores › Contas bancárias).' then raise exception 'T6: %', sqlerrm; end if;
  end;
  r := public.fn_fiscal_conta_titular_gravar(cb, v_a, true);
  if (r->>'gravado')::boolean or r->>'frase' <> 'Itau Personalite passa a ser de Produtora Teste CP (529.982.247-25).' then raise exception 'T6: prévia %', r; end if;
  if exists (select 1 from public.financeiro_contas_bancarias where id = cb and titular_documento is not null) then raise exception 'T6: a prévia gravou'; end if;
  perform public.fn_fiscal_conta_titular_gravar(cb, v_a, false);
  if not exists (select 1 from public.financeiro_contas_bancarias where id = cb and titular_nome = 'Produtora Teste CP' and titular_documento = '52998224725') then
    raise exception 'T6: a ligação não gravou';
  end if;
  r := public.fn_fiscal_titular_gravar(c, v_a, '{"nome": "Produtora Renomeada CP"}'::jsonb, false);
  if (r->>'contas_renomeadas')::int <> 1 or not exists (select 1 from public.financeiro_contas_bancarias where id = cb and titular_nome = 'Produtora Renomeada CP') then
    raise exception 'T6: renomear não levou à conta %', r;
  end if;
  begin
    perform public.fn_fiscal_titular_gravar(c, v_a, '{"documento": "98765432100"}'::jsonb, true);
    raise exception 'T6: trocou o CPF';
  exception when others then
    if sqlerrm <> 'O CPF/CNPJ de um titular com fazenda, acordo ou conta bancária não muda: cadastre outro titular.' then raise exception 'T6: %', sqlerrm; end if;
  end;
end $t6$;

-- o UPDATE direto (qualquer escritor, mesmo sem RLS) também não muda o titular
reset role;
do $t6b$
begin
  update public.financeiro_contas_bancarias set titular_nome = 'Outro' where id = '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  raise exception 'T6: o UPDATE direto mudou o titular';
exception when others then
  if sqlerrm <> 'O titular da conta se liga pelo cadastro do produtor (Cadastros › Produtores › Contas bancárias).' then raise exception 'T6b: %', sqlerrm; end if;
end $t6b$;
set local role authenticated;

-- T7 · os acordos
do $t7$
declare c uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; v_a uuid := current_setting('teste.a')::uuid; v_h uuid := current_setting('teste.h')::uuid;
        v_e uuid := current_setting('teste.e')::uuid; r jsonb; v_ac uuid; v_ac2 uuid; v_ids uuid[]; n int; v_amort uuid := 'c7f4465a-01d6-42d7-93f7-ec9a5564982e';
begin
  r := public.fn_fiscal_acordo_rateio_gravar(c, null, jsonb_build_object('nome', 'Rateio teste CP', 'produtor_id', v_a, 'terceiro_id', v_h,
         'documento_em', 'terceiro', 'como_paga', 'transfere_ao_terceiro', 'palavras', jsonb_build_array('Pensão', ' pensão ', ''),
         'vigencia_inicio', '2026-01-01'), false);
  v_ac := (r->>'acordo_id')::uuid;
  if not (r->'avisos' ? 'Parte do produtor a confirmar: os lançamentos ligados não entram no livro até ela ser preenchida.')
     or not exists (select 1 from public.fiscal_acordos_rateio where id = v_ac and parte_produtor is null and palavras = array['Pensão']) then
    raise exception 'T7: acordo a confirmar %', r;
  end if;
  select array_agg(lancamento_id order by data) into v_ids from public.fn_fiscal_acordos_sugeridos(c, date '2026-01-01', date '2026-12-31');
  if coalesce(array_length(v_ids, 1), 0) <> 5 then raise exception 'T7: a sugestão achou % de 5', coalesce(array_length(v_ids, 1), 0); end if;
  r := public.fn_fiscal_lancamentos_acordo_ligar(v_ac, v_ids, 'pela_sugestao', true);
  if (r->>'gravado')::boolean or (r->>'novos')::int <> 5 or (r->>'soma')::numeric <> 32420 then raise exception 'T7: prévia da ligação %', r; end if;
  if exists (select 1 from public.fiscal_lancamento_acordo where acordo_id = v_ac) then raise exception 'T7: a prévia ligou'; end if;
  perform public.fn_fiscal_lancamentos_acordo_ligar(v_ac, v_ids, 'pela_sugestao', false);
  select count(*) into n from public.fiscal_lancamento_acordo where acordo_id = v_ac and desfeita_em is null and percentual is null;
  if n <> 5 then raise exception 'T7: ligados a confirmar % de 5', n; end if;
  if exists (select 1 from public.fn_fiscal_acordos_sugeridos(c, date '2026-01-01', date '2026-12-31')) then raise exception 'T7: ligado ainda sugerido'; end if;
  r := public.fn_fiscal_lancamentos_acordo_ligar(v_ac, v_ids, 'manual', false);
  if (r->>'gravado')::boolean or r->>'frase' <> 'Todos já estão no acordo Rateio teste CP: nada muda.' then raise exception 'T7: religar %', r; end if;
  -- preencher o %: os ligados passam a 50 e entram no livro
  r := public.fn_fiscal_acordo_rateio_gravar(c, v_ac, '{"parte_produtor": "50"}'::jsonb, false);
  if not (r->'avisos' ? '5 lançamento(s) ligado(s) passam a 50% e entram no livro.') then raise exception 'T7: aviso do %% %', r; end if;
  select count(*) into n from public.fiscal_lancamento_acordo where acordo_id = v_ac and desfeita_em is null and percentual = 50;
  if n <> 5 then raise exception 'T7: congelar o %% (% de 5)', n; end if;
  -- mudar o % depois não mexe nos ligados
  r := public.fn_fiscal_acordo_rateio_gravar(c, v_ac, '{"parte_produtor": 60}'::jsonb, false);
  if exists (select 1 from public.fiscal_lancamento_acordo where acordo_id = v_ac and percentual <> 50) then raise exception 'T7: o %% novo mexeu nos ligados'; end if;
  -- recusas
  begin
    perform public.fn_fiscal_acordo_rateio_gravar(c, v_ac, '{"vigencia_inicio": "2026-09-01"}'::jsonb, true);
    raise exception 'T7: vigência que exclui ligados passou';
  exception when others then
    if sqlerrm <> '1 lançamento(s) ligado(s) a Rateio teste CP ficariam fora da vigência: desfaça a ligação antes.' then raise exception 'T7: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_fiscal_acordo_rateio_gravar(c, v_ac, jsonb_build_object('terceiro_id', v_e), true);
    raise exception 'T7: terceiro que não é terceiro passou';
  exception when others then
    if sqlerrm <> 'Empresa Teste CP não está cadastrado como terceiro (parceiro de rateio).' then raise exception 'T7: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_fiscal_acordo_rateio_gravar(c, null, jsonb_build_object('nome', 'rateio TESTE cp', 'produtor_id', v_a, 'terceiro_id', v_h,
              'documento_em', 'produtor', 'como_paga', 'direto', 'vigencia_inicio', '2026-01-01'), true);
    raise exception 'T7: nome repetido passou';
  exception when others then
    if sqlerrm <> 'Já existe o acordo Rateio teste CP.' then raise exception 'T7: %', sqlerrm; end if;
  end;
  r := public.fn_fiscal_acordo_rateio_gravar(c, null, jsonb_build_object('nome', 'Outro acordo CP', 'produtor_id', v_a, 'terceiro_id', v_h,
         'parte_produtor', 70, 'documento_em', 'alterna', 'como_paga', 'direto', 'vigencia_inicio', '2026-01-01', 'vigencia_fim', '2026-12-31'), false);
  v_ac2 := (r->>'acordo_id')::uuid;
  begin
    perform public.fn_fiscal_lancamentos_acordo_ligar(v_ac2, v_ids[1:1], 'manual', true);
    raise exception 'T7: ligado a outro acordo passou';
  exception when others then
    if sqlerrm <> 'Já ligados a outro acordo (desfaça antes): Pensão Crianças (no acordo Rateio teste CP).' then raise exception 'T7: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_fiscal_lancamentos_acordo_ligar(v_ac2, array[v_amort], 'manual', true);
    raise exception 'T7: fora da vigência passou';
  exception when others then
    if sqlerrm <> 'Fora da vigência do acordo Outro acordo CP: Amortização 2/6 · SINT amortização de 15/03/2027.' then raise exception 'T7: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_fiscal_lancamentos_acordo_ligar(v_ac2, array[gen_random_uuid()], 'manual', true);
    raise exception 'T7: lançamento de fora passou';
  exception when others then
    if sqlerrm <> '1 lançamento(s) não são deste cliente.' then raise exception 'T7: %', sqlerrm; end if;
  end;
  -- desfazer
  begin
    perform public.fn_fiscal_lancamentos_acordo_desfazer(v_ids[1:1], 'x', false);
    raise exception 'T7: motivo curto passou';
  exception when others then
    if sqlerrm <> 'Diga o motivo (pelo menos 3 letras).' then raise exception 'T7: %', sqlerrm; end if;
  end;
  r := public.fn_fiscal_lancamentos_acordo_desfazer(v_ids[1:1], 'Ligado por engano', false);
  if (r->>'desfaz')::int <> 1 or not exists (select 1 from public.fiscal_lancamento_acordo where lancamento_id = v_ids[1] and desfeita_motivo = 'Ligado por engano') then
    raise exception 'T7: desfazer %', r;
  end if;
  select count(*) into n from public.fn_fiscal_acordos_sugeridos(c, date '2026-01-01', date '2026-12-31') s where s.lancamento_id = v_ids[1];
  if n <> 1 then raise exception 'T7: o desfeito devia voltar à sugestão (%)', n; end if;
  perform set_config('teste.ac', v_ac::text, true);
end $t7$;

-- T8 · as listas
do $t8$
declare c uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; v jsonb; a jsonb; r record;
begin
  v := public.fn_fiscal_titulares_lista(c);
  if jsonb_array_length(v) <> 3 then raise exception 'T8: % titulares', jsonb_array_length(v); end if;
  select x into a from jsonb_array_elements(v) x where x->>'id' = current_setting('teste.a');
  if a->'pendencias' <> '[]'::jsonb or jsonb_array_length(a->'fazendas') <> 1 or jsonb_array_length(a->'contas') <> 1
     or jsonb_array_length(a->'grupo') <> 1 or a->'condicao_ibs'->>'condicao' <> 'nao_contribuinte' or (a->>'acordos')::int <> 2 then
    raise exception 'T8: a ficha do produtor %', a;
  end if;
  select x into a from jsonb_array_elements(v) x where x->>'id' = current_setting('teste.e');
  if a->>'documento_formatado' <> '12.ABC.345/01DE-35' or not (a->'pendencias' ? 'Sem fazenda') then raise exception 'T8: a PJ %', a; end if;
  select * into r from public.fn_fiscal_acordos_lista(c) l where l.acordo_id = current_setting('teste.ac')::uuid;
  if r.ligados <> 4 or r.soma_ligados <> 25936 or r.a_confirmar <> 0 or r.parte_produtor <> 60 then raise exception 'T8: acordo %', r; end if;
end $t8$;

-- T9 · o de fora
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
do $t9$
declare c uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; a uuid := current_setting('teste.a')::uuid; q text; n int := 0;
begin
  foreach q in array array[
    format('select public.fn_fiscal_titular_gravar(%L, null, %L::jsonb, true)', c, '{"nome":"x","documento":"98765432100"}'),
    format('select public.fn_fiscal_fazenda_titulares_gravar(%L, current_date, %L::jsonb, true)', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '[]'),
    format('select public.fn_fiscal_titular_condicao_ibs_gravar(%L, current_date, %L, %L, true)', a, 'optante', 'teste'),
    format('select public.fn_fiscal_titular_grupo_gravar(%L, current_date, %L::jsonb, true)', a, '[]'),
    format('select public.fn_fiscal_conta_titular_gravar(%L, null, true)', '131b8501-caf7-4964-b1b1-3f552ad2b75d'),
    format('select public.fn_fiscal_acordo_rateio_gravar(%L, null, %L::jsonb, true)', c, '{}'),
    format('select public.fn_fiscal_lancamentos_acordo_ligar(%L, array[gen_random_uuid()], %L, true)', current_setting('teste.ac'), 'manual'),
    format('select public.fn_fiscal_lancamentos_acordo_desfazer(array(select lancamento_id from public.fiscal_lancamento_acordo), %L, true)', 'teste'),
    format('select * from public.fn_fiscal_acordos_sugeridos(%L, date %L, date %L)', c, '2026-01-01', '2026-12-31'),
    format('select public.fn_fiscal_titulares_lista(%L)', c),
    format('select * from public.fn_fiscal_acordos_lista(%L)', c)] loop
    begin
      execute q;
      raise exception 'T9: o de fora passou em %', q;
    exception when insufficient_privilege then n := n + 1;
              when others then
      -- o de fora não lê a ligação (RLS): o desfazer não acha nada; é recusa sem vazar
      if q like '%acordo_desfazer%' and sqlerrm = 'Nenhum destes lançamentos está num acordo.' then n := n + 1;
      else raise exception 'T9: % veio "%"', q, sqlerrm; end if;
    end;
  end loop;
  if n <> 11 then raise exception 'T9: % de 11', n; end if;
  select (select count(*) from public.fiscal_titulares) + (select count(*) from public.fiscal_titular_ies) + (select count(*) from public.fiscal_acordos_rateio)
       + (select count(*) from public.fiscal_lancamento_acordo) + (select count(*) from public.fiscal_titular_condicao_ibs)
       + (select count(*) from public.fiscal_titular_grupo) into n;
  if n <> 0 then raise exception 'T9: o de fora leu % linhas', n; end if;
end $t9$;

-- T10 · a trilha
reset role;
do $t10$
declare n int;
begin
  select count(*) into n from public.audit_log where modulo = 'fiscal' and cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a'
     and created_at >= now() - interval '1 minute' and usuario_id = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  if n < 15 then raise exception 'T10: trilha com % linhas do autor', n; end if;
  if exists (select 1 from public.audit_log where modulo = 'fiscal' and created_at >= now() - interval '1 minute' and usuario_id is distinct from '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') then
    raise exception 'T10: linha de trilha com outro autor';
  end if;
end $t10$;

do $fim$ begin raise exception 'OK CADASTRO-PRODUTOR-01 (117290): T0–T10 passaram (nada fica no banco) · md5 até aqui %', md5(left(current_query(), strpos(current_query(), 'end $fim' || '$;') + 9)); end $fim$;
