-- O ADMINISTRATIVO GANHA ONDE LANCAR INVESTIMENTO.
--
-- ⚠ O BURACO APARECEU NA LIMPEZA DO LEGADO. Pecuaria tem "Investimento Pecuaria" (9xxx) e
--   agricultura tem "Investimento Agricultura" (14xxx); administrativo nao tinha grupo de
--   investimento nenhum. Quem comprava o carro do escritorio lancava em "Investimento Maquinas e
--   Equip. Pecuaria" (9030) com a fazenda "Administrativo". Medido no Agnaldo em 22/09/2026: 16
--   lancamentos, R$ 334.385,97 — Hilux, Ranger, consorcios de veiculo e acessorios da Ranger.
--   ⚠ ESTA MIGRATION NAO MOVE NADA. Ela so' abre o lugar certo; os 16 do Agnaldo vao no
--   LEGADO-ADM-02 (20261027125700).
--
-- OS TRES, grupo novo "Investimento Administrativo", escopo 'administrativo', globais e ativos:
--   Infraestrutura | Investimento Instalações Administrativo
--   Máquinas       | Investimento Equipamentos e Informática Administrativo
--   Máquinas       | Investimento Veículos Administrativo
--   Os demais atributos sao COPIADOS DO BANCO, da irma 9030, nao redigitados: tipo_operacao,
--   macro_custo ('Investimento na Fazenda'), compoe_dre, gera_lcdpr e bloco_dre ('investimento').
--   A migration confere antes que as 16 irmas de pecuaria (9xxx) e agricultura (14xxx) tem o
--   MESMO valor nas cinco colunas; se uma divergir, para. Silvicultura (206xx) nao entra na
--   conta: la' `compoe_dre` e' false e `bloco_dre` e' nulo, e o briefing mandou seguir as outras.
--
-- ⚠ O MACRO 'Investimento na Fazenda' E' O QUE MANTEM ISSO FORA DO RATEIO, e foi medido. As tres
--   leituras do pool administrativo — fn_dre_pecuaria, fn_dre_lavoura e fn_dre_agricola_por_safra
--   — filtram `macro_custo not in ('Dividendos','Investimento na Fazenda', ...)`. Com o macro das
--   irmas, veiculo do escritorio nao vira custo rateado entre as atividades. O efeito colateral e'
--   o esperado: investimento administrativo nao aparece em DRE nenhum (o bloco 'investimento'
--   do DRE pecuaria so' le escopo 'pecuaria'); aparece no Financeiro e no fluxo de caixa.
--
-- ⚠ OS ACENTOS SEGUEM O BANCO, nao o briefing ("Maquinas", "Veiculos", "Instalacoes",
--   "Informatica"): 'Máquinas' e 'Infraestrutura' ja' existem como centro nas irmas, e gravar sem
--   acento criaria um centro gemeo. 'Informática' nao existe em linha nenhuma do plano; vai com
--   acento pela mesma regra.
--
-- A ORDEM: bloco 22xxx, o proximo livre depois de 21160 (medido: zero linhas entre 21161 e
-- 22999), centro a-z > subcentro a-z pela collation do proprio servidor — o mesmo
-- `row_number() over (order by centro_custo, subcentro)` da PLANO-ADM-06.
--
-- IDEMPOTENTE: o INSERT tem `WHERE NOT EXISTS` por (grupo, centro, subcentro) e a ordem so'
-- escreve onde o numero muda.

begin;

-- ── as irmas concordam nas cinco colunas que vao ser copiadas ──────────────────────────────
do $$
declare v_n int; v_var int;
begin
  select count(*),
         count(distinct (tipo_operacao, macro_custo, compoe_dre, gera_lcdpr, bloco_dre))
    into v_n, v_var
    from public.financeiro_plano_contas
   where cliente_id is null and ativo
     and ((escopo_negocio = 'pecuaria'    and ordem_exibicao between 9010  and 9070)
       or (escopo_negocio = 'agricultura' and ordem_exibicao between 14010 and 14090));
  if v_n <> 16 then
    raise exception 'esperava 16 irmas (7 pecuaria + 9 agricultura), achei %', v_n using errcode = 'P0001';
  end if;
  if v_var <> 1 then
    raise exception 'as irmas divergem entre si em % combinacoes das cinco colunas', v_var using errcode = 'P0001';
  end if;
  if exists (select 1 from public.financeiro_plano_contas where ordem_exibicao between 21161 and 22999
                and grupo_custo is distinct from 'Investimento Administrativo') then
    raise exception 'a faixa 22xxx nao esta livre (ocupada por outro grupo)' using errcode = 'P0001';
  end if;
end $$;

-- ── os tres novos, copiando da 9030, com ordem provisoria ──────────────────────────────────
insert into public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro,
   grupo_fluxo, escopo_negocio, ativo, ordem_exibicao, compoe_dre, gera_lcdpr, bloco_dre)
select null, i.tipo_operacao, i.macro_custo, 'Investimento Administrativo', v.centro, v.sub,
       null, 'administrativo', true, v.ord_provisoria, i.compoe_dre, i.gera_lcdpr, i.bloco_dre
  from (values
      ('Infraestrutura', 'Investimento Instalações Administrativo',                99101),
      ('Máquinas',       'Investimento Equipamentos e Informática Administrativo', 99102),
      ('Máquinas',       'Investimento Veículos Administrativo',                   99103)
  ) as v(centro, sub, ord_provisoria)
  cross join (select tipo_operacao, macro_custo, compoe_dre, gera_lcdpr, bloco_dre
                from public.financeiro_plano_contas
               where cliente_id is null and ativo and escopo_negocio = 'pecuaria' and ordem_exibicao = 9030) i
 where not exists (
   select 1 from public.financeiro_plano_contas p
    where p.escopo_negocio = 'administrativo'
      and p.grupo_custo    = 'Investimento Administrativo'
      and p.centro_custo   = v.centro
      and p.subcentro      = v.sub);

-- ── a ordem do grupo, pela collation do proprio banco ───────────────────────────────────────
with ord as (
  select id, 22000 + (row_number() over (order by centro_custo, subcentro)) * 10 as nova
    from public.financeiro_plano_contas
   where escopo_negocio = 'administrativo' and grupo_custo = 'Investimento Administrativo'
)
update public.financeiro_plano_contas p
   set ordem_exibicao = ord.nova, updated_at = now()
  from ord
 where ord.id = p.id
   and p.ordem_exibicao is distinct from ord.nova;

-- ── guarda de saida ─────────────────────────────────────────────────────────────────────────
do $$
declare v_n int; v_ok int; v_fora_az int; v_seq int;
begin
  select count(*),
         count(*) filter (where cliente_id is null and ativo
                            and row(tipo_operacao, macro_custo, compoe_dre, gera_lcdpr, bloco_dre) is not distinct from
                                (select row(tipo_operacao, macro_custo, compoe_dre, gera_lcdpr, bloco_dre)
                                   from public.financeiro_plano_contas
                                  where cliente_id is null and escopo_negocio = 'pecuaria' and ordem_exibicao = 9030))
    into v_n, v_ok
    from public.financeiro_plano_contas
   where escopo_negocio = 'administrativo' and grupo_custo = 'Investimento Administrativo';
  if v_n <> 3 then
    raise exception 'esperava 3 linhas no grupo, achei %', v_n using errcode = 'P0001';
  end if;
  if v_ok <> 3 then
    raise exception '% linha(s) nao sao globais+ativas ou divergem da irma 9030', 3 - v_ok using errcode = 'P0001';
  end if;

  select count(*) into v_seq from (
    select ordem_exibicao, 22000 + (row_number() over (order by ordem_exibicao)) * 10 as esperada
      from public.financeiro_plano_contas
     where escopo_negocio = 'administrativo' and grupo_custo = 'Investimento Administrativo') z
   where ordem_exibicao is distinct from esperada;
  if v_seq > 0 then
    raise exception 'a ordem nao e 22010..22030 em passo 10 (% fora)', v_seq using errcode = 'P0001';
  end if;

  select count(*) into v_fora_az from (
    select row_number() over (order by centro_custo, subcentro) rn_az,
           row_number() over (order by ordem_exibicao)           rn_num
      from public.financeiro_plano_contas
     where escopo_negocio = 'administrativo' and grupo_custo = 'Investimento Administrativo') z
   where rn_az <> rn_num;
  if v_fora_az > 0 then
    raise exception 'a ordem numerica discorda do a-z em % linha(s)', v_fora_az using errcode = 'P0001';
  end if;

  if (select count(*) from public.financeiro_plano_contas where ordem_exibicao between 22010 and 22030) <> 3 then
    raise exception 'outra linha do plano ocupa a faixa 22010..22030' using errcode = 'P0001';
  end if;

  raise notice 'PLANO-ADM-07 ok: 3 linhas, globais, ativas, iguais a 9030, 22010..22030 em a-z.';
end $$;

commit;
