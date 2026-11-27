-- NOTA-ITENS-SUGESTAO · MAPA DE FAMÍLIAS POR NCM das compras rurais (Gabriel 27/11 12:18; caso NJ NF 1.119, bateria NCM 8507 caía no
-- "último deste fornecedor") — lote 114470 · Code 2.
-- Só o mapa da escada (produto_ncm_familia + produto_familia_conta): nenhum lançamento, nenhuma conta do plano muda. Os prefixos saem dos NCM
-- REAIS das notas já guardadas (todas as clientes); cada família → a conta do PLANO PADRÃO por atividade (conferida pelo NOME).
--   maquinas     (peças, baterias, pneus, filtros, lubrificantes, correias, rolamentos, parafusos) → Manutenção Máquinas / Veículos Adm.
--   ferramentas  (82xx, abrasivos)                                                                   → Ferramentas e Equipamentos
--   reproducao   (sêmen 0511, hormônios 2937)                                                        → Sêmen e IATF
--   nutricao_animal + sal 2501, fosfatos 2835, milho 1005, forragem 1214 (a família e a conta já existem)
--   sanidade_animal + seringas/agulhas 9018, medicamentos 3003, curativos 3005/3006 (já existe)
--   fertilizante  + a conta da PECUÁRIA (Manutenção de Pasto); semente + PECUÁRIA (Formação de Pasto) e SILVICULTURA (Formação de Floresta)
--   construcao/eletrica/agua + pregos 7317, massas 3214, perfis de alumínio 7604, vidros 7007, fusíveis/terminais 8535, isoladores 8546,
--                 conexões 7307 (seguem PERGUNTANDO obra × manutenção)
-- Fica de fora (decisão do Gabriel): EPI/uniforme — a decisão de hoje é "custeio", e o plano padrão só tem "Investimento em Uniformes e EPI".

do $$
begin
  if md5(pg_get_functiondef('public.fn_itens_sugerir_conta(uuid,text,text,date,jsonb,uuid,uuid)'::regprocedure)) is null then
    raise exception 'a escada (lote 114360) não está no banco';
  end if;
end $$;

-- 1. os prefixos (prefixo já de OUTRA família = recusa; o mesmo = nada)
do $$
declare v_conflito text;
begin
  create temp table _novas(prefixo text primary key, familia text not null) on commit drop;
  insert into _novas values
    -- máquinas e veículos: peças e manutenção
    ('8507','maquinas'),('4011','maquinas'),('4013','maquinas'),('8421','maquinas'),('2710193','maquinas'),('3403','maquinas'),('3819','maquinas'),
    ('3820','maquinas'),('4010','maquinas'),('4016','maquinas'),('7315','maquinas'),('7318','maquinas'),('8409','maquinas'),('8482','maquinas'),
    ('8483','maquinas'),('8484','maquinas'),('8511','maquinas'),('8512','maquinas'),('8708','maquinas'),('8431','maquinas'),('842490','maquinas'),
    ('843290','maquinas'),('843390','maquinas'),
    -- ferramentas
    ('8201','ferramentas'),('8202','ferramentas'),('8203','ferramentas'),('8204','ferramentas'),('8205','ferramentas'),('8206','ferramentas'),
    ('8207','ferramentas'),('8208','ferramentas'),('8211','ferramentas'),('6804','ferramentas'),('6805','ferramentas'),
    -- reprodução
    ('0511','reproducao'),('2937','reproducao'),
    -- nutrição animal (a mais)
    ('2501','nutricao_animal'),('2835','nutricao_animal'),('1005','nutricao_animal'),('1214','nutricao_animal'),
    -- sanidade (a mais)
    ('9018','sanidade_animal'),('3003','sanidade_animal'),('3005','sanidade_animal'),('3006','sanidade_animal'),
    -- material de construção / elétrico / hidráulico a mais (seguem PERGUNTANDO obra × manutenção)
    ('7317','construcao'),('3214','construcao'),('7604','construcao'),('7007','construcao'),('8535','eletrica'),('8546','eletrica'),('7307','agua');
  select string_agg(f.prefixo || '=' || f.familia, ', ') into v_conflito
    from _novas n join public.produto_ncm_familia f on f.prefixo = n.prefixo and f.familia <> n.familia;
  if v_conflito is not null then raise exception 'prefixo NCM já é de outra família: %', v_conflito; end if;

  with ins as (
    insert into public.produto_ncm_familia (prefixo, familia, ativo, atualizado_em)
    select prefixo, familia, true, now() from _novas on conflict (prefixo) do nothing returning *)
  insert into public.produto_classificacao_trilha (via, objeto, chave, acao, depois, motivo)
  select 'sistema:lote 114470', 'ncm_familia', ins.prefixo, 'criar', to_jsonb(ins), 'Mapa de famílias NCM das compras rurais (Gabriel 27/11 12:18)'
    from ins;
end $$;

-- 2. família × atividade → a conta do plano padrão (conferida pelo nome; a combinação que já existe = recusa)
do $$
declare v_n int;
begin
  create temp table _contas(familia text, escopo text, plano uuid, nome text) on commit drop;
  insert into _contas values
    ('maquinas','pecuaria','edc0de8a-e8e6-48de-bf81-0a8061307abb','Manutenção Máquinas Pecuária'),
    ('maquinas','agricultura','b4eaa2b6-3356-4ba4-9fdc-aa4de0736c69','Manutenção Máquinas Agricultura'),
    ('maquinas','silvicultura','490ec547-ed63-419e-b264-fbc79aab9b3a','Manutenção Máquinas Silvicultura'),
    ('maquinas','administrativo','d585c67a-caee-4c3e-8814-f3d461bf9c55','Manutenção Veículos Administrativo'),
    ('ferramentas','pecuaria','836239b6-890f-497c-b56d-6713ab8d91e4','Ferramentas e Equipamentos Pecuária'),
    ('ferramentas','agricultura','8fe38030-6ba8-4b49-9a5a-7918e5815fa8','Ferramentas e Equipamentos Agricultura'),
    ('reproducao','pecuaria','fa428773-78c9-4662-91ee-4cb8a6024457','Sêmen e IATF'),
    ('fertilizante','pecuaria','85fad381-cc6f-433e-88f8-cf18682c9100','Manutenção de Pasto'),
    ('semente','pecuaria','08c28ca4-c776-4493-8ef8-0e056d7c9196','Investimento em Formação de Pasto Pecuária'),
    ('semente','silvicultura','f1fef085-5d32-4d2f-94c5-ccbef0a0b441','Investimento em Formação de Floresta Silvicultura');
  select count(*) into v_n from _contas c
    join public.financeiro_plano_contas pc on pc.id = c.plano and pc.subcentro = c.nome and pc.cliente_id is null and pc.ativo
                                           and pc.tipo_operacao = '2-Saídas' and pc.escopo_negocio = c.escopo;
  if v_n <> 10 then raise exception 'contas das famílias não conferem pelo nome (% de 10)', v_n; end if;
  if exists (select 1 from public.produto_familia_conta fc join _contas c on c.familia = fc.familia and c.escopo = fc.escopo_negocio) then
    raise exception 'já existe conta para uma das famílias × atividade: reler antes de aplicar';
  end if;

  with ins as (
    insert into public.produto_familia_conta (familia, escopo_negocio, plano_conta_id, ativo, atualizado_em)
    select familia, escopo, plano, true, now() from _contas returning *)
  insert into public.produto_classificacao_trilha (via, objeto, chave, acao, depois, motivo)
  select 'sistema:lote 114470', 'familia_conta', ins.familia || '/' || ins.escopo_negocio, 'criar', to_jsonb(ins),
         'Mapa de famílias NCM das compras rurais (Gabriel 27/11 12:18)'
    from ins;
end $$;
