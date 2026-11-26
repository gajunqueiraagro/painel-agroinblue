-- FOLHA-FUNC-CADASTRO-01 (Gabriel 25/11/2026 09:06, mock aprovado folha-funcionario-cadastro-ref) — a aba Cadastro do funcionário completa.
--   (1) folha_funcionarios ganha o que o espelho do contador traz e o eSocial pede: sexo, estado civil, dependentes, jornada, fazenda do
--       registro, experiência até, RG, CNH (categoria e validade), contato de emergência e o dia do pagamento (dia + "dia útil").
--   (2) fn_folha_funcionario_gravar grava os campos novos (chave ausente mantém o gravado, como nascimento/PIS/CTPS); a fazenda do registro
--       tem de ser do cliente (42501).
--   (3) PAGAMENTO E CONTATO NÃO SE COPIAM: moram no favorecido (financeiro_fornecedores, fonte única). O gravador de campo dele
--       (fn_fornecedor_atualizar_campos: prévia, trilha por campo, desfazer) passa a aceitar também banco, agência, conta, tipo de conta,
--       titular (nome e CPF), celular, telefone, e-mail e contato — o que a ficha do funcionário edita. Nada mais muda nele.
-- Nenhum dado de cliente é alterado. Corpo grande: patch guardado por md5 (as âncoras casam 1 vez cada). DESFAZER: recriar as duas
-- funções com o texto de antes (md5 guardado aqui) e `alter table folha_funcionarios drop column` das 12 colunas novas.

set local lock_timeout = '2s';
set local statement_timeout = '30s';

alter table public.folha_funcionarios
  add column sexo text check (sexo in ('F', 'M')),
  add column estado_civil text check (estado_civil in ('solteiro', 'casado', 'uniao_estavel', 'divorciado', 'separado', 'viuvo')),
  add column dependentes smallint check (dependentes between 0 and 20),
  add column jornada text check (jornada in ('44h', '40h', '36h', '30h', '25h', '20h', '12x36', 'outra')),
  add column fazenda_registro_id uuid references public.fazendas(id),
  add column experiencia_ate date,
  add column rg text check (length(rg) <= 40),
  add column cnh_categoria text check (cnh_categoria in ('A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE')),
  add column cnh_validade date,
  add column contato_emergencia text check (length(contato_emergencia) <= 200),
  add column dia_pagamento smallint check (dia_pagamento between 1 and 31),
  add column dia_pagamento_util boolean not null default false;

comment on column public.folha_funcionarios.dia_pagamento is 'FOLHA-FUNC-CADASTRO-01: o dia do pagamento do salário; com dia_pagamento_util, é o N-ésimo dia útil (5 + true = "5º dia útil").';
comment on column public.folha_funcionarios.fazenda_registro_id is 'FOLHA-FUNC-CADASTRO-01: a fazenda onde o funcionário é registrado (a tela mostra o CÓDIGO). O empregador_registro (CEI/CAEPF) fica.';

do $m$
declare
  g text := pg_get_functiondef('public.fn_folha_funcionario_gravar(uuid,jsonb,boolean)'::regprocedure);
  c text := pg_get_functiondef('public.fn_fornecedor_atualizar_campos(uuid,jsonb,text,text,boolean)'::regprocedure);
  g1 constant text := $p$  v_novo.ctps := case when p_dados ? 'ctps' then nullif(btrim(coalesce(p_dados->>'ctps', '')), '') else v_antes.ctps end;
$p$;
  g1n constant text := $p$  v_novo.ctps := case when p_dados ? 'ctps' then nullif(btrim(coalesce(p_dados->>'ctps', '')), '') else v_antes.ctps end;
  -- FOLHA-FUNC-CADASTRO-01: os campos novos da ficha; chave ausente mantém o gravado
  v_novo.sexo := case when p_dados ? 'sexo' then nullif(p_dados->>'sexo', '') else v_antes.sexo end;
  v_novo.estado_civil := case when p_dados ? 'estado_civil' then nullif(p_dados->>'estado_civil', '') else v_antes.estado_civil end;
  v_novo.dependentes := case when p_dados ? 'dependentes' then nullif(p_dados->>'dependentes', '')::smallint else v_antes.dependentes end;
  v_novo.jornada := case when p_dados ? 'jornada' then nullif(p_dados->>'jornada', '') else v_antes.jornada end;
  v_novo.fazenda_registro_id := case when p_dados ? 'fazenda_registro_id' then nullif(p_dados->>'fazenda_registro_id', '')::uuid else v_antes.fazenda_registro_id end;
  v_novo.experiencia_ate := case when p_dados ? 'experiencia_ate' then nullif(p_dados->>'experiencia_ate', '')::date else v_antes.experiencia_ate end;
  v_novo.rg := case when p_dados ? 'rg' then nullif(btrim(coalesce(p_dados->>'rg', '')), '') else v_antes.rg end;
  v_novo.cnh_categoria := case when p_dados ? 'cnh_categoria' then nullif(upper(btrim(coalesce(p_dados->>'cnh_categoria', ''))), '') else v_antes.cnh_categoria end;
  v_novo.cnh_validade := case when p_dados ? 'cnh_validade' then nullif(p_dados->>'cnh_validade', '')::date else v_antes.cnh_validade end;
  v_novo.contato_emergencia := case when p_dados ? 'contato_emergencia' then nullif(btrim(coalesce(p_dados->>'contato_emergencia', '')), '') else v_antes.contato_emergencia end;
  v_novo.dia_pagamento := case when p_dados ? 'dia_pagamento' then nullif(p_dados->>'dia_pagamento', '')::smallint else v_antes.dia_pagamento end;
  v_novo.dia_pagamento_util := coalesce(case when p_dados ? 'dia_pagamento_util' then (p_dados->>'dia_pagamento_util')::boolean else v_antes.dia_pagamento_util end, false);
  if v_novo.fazenda_registro_id is not null and not exists (select 1 from fazendas z where z.id = v_novo.fazenda_registro_id and z.cliente_id = p_cliente) then
    raise exception 'A fazenda do registro não é deste cliente.' using errcode = '42501';
  end if;
$p$;
  g2 constant text := $p$      nascimento = v_novo.nascimento, pis = v_novo.pis, ctps = v_novo.ctps,
$p$;
  g2n constant text := $p$      nascimento = v_novo.nascimento, pis = v_novo.pis, ctps = v_novo.ctps,
      sexo = v_novo.sexo, estado_civil = v_novo.estado_civil, dependentes = v_novo.dependentes, jornada = v_novo.jornada,
      fazenda_registro_id = v_novo.fazenda_registro_id, experiencia_ate = v_novo.experiencia_ate, rg = v_novo.rg,
      cnh_categoria = v_novo.cnh_categoria, cnh_validade = v_novo.cnh_validade, contato_emergencia = v_novo.contato_emergencia,
      dia_pagamento = v_novo.dia_pagamento, dia_pagamento_util = v_novo.dia_pagamento_util,
$p$;
  c1 constant text := $p$'tipo_recebimento', 'pix_tipo_chave', 'pix_chave'];$p$;
  c1n constant text := $p$'tipo_recebimento', 'pix_tipo_chave', 'pix_chave',
          -- FOLHA-FUNC-CADASTRO-01: o pagamento e o contato que a ficha do funcionário edita (o favorecido é a fonte única)
          'banco', 'agencia', 'conta', 'tipo_conta', 'nome_favorecido', 'cpf_cnpj_pagamento', 'celular', 'telefone', 'email', 'contato_nome'];$p$;
begin
  if md5(g) <> '512067e570ced11e2c5d54d9fe4e9272' or md5(c) <> '6b478990612aa4d290c861fc24a00a83' then
    raise exception 'FOLHA-FUNC-CADASTRO-01: as funções de hoje não são as medidas (md5): nada gravado.';
  end if;
  if (length(g) - length(replace(g, g1, ''))) / length(g1) <> 1 or (length(g) - length(replace(g, g2, ''))) / length(g2) <> 1
     or (length(c) - length(replace(c, c1, ''))) / length(c1) <> 1 then
    raise exception 'FOLHA-FUNC-CADASTRO-01: uma âncora não casa 1 vez: nada gravado.';
  end if;
  execute replace(replace(g, g1, g1n), g2, g2n);
  execute replace(c, c1, c1n);
end $m$;
