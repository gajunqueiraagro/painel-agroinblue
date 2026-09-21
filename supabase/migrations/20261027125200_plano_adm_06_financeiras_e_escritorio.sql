-- O CUSTO FIXO ADMINISTRATIVO GANHA OS DOIS SUBCENTROS QUE FALTAVAM.
--
-- ⚠ O BURACO TINHA ENDERECO, e ele aparece no dado. Pecuaria tem "Despesas Financeiras Pecuaria"
--   (6040) e agricultura tem a sua (11040); administrativo nao tinha nenhuma. Quem lancava tarifa
--   de banco, IOF ou taxa de cartao nao achava onde, e usava o 6040 com a fazenda "Administrativo".
--   Medido no NJ em 21/09/2026: 4.447 lancamentos de Custo Fixo PECUARIA na fazenda
--   Administrativo, R$ 6.485.556,75 — entre eles 549 linhas de "Despesas Financeiras Pecuaria".
--   O mesmo vale para o dia a dia do escritorio (copa, limpeza, agua, condominio), que caia em
--   "Outras Desp. Administrativas Pecuaria" (1.823 linhas).
--   ⚠ ESTA MIGRATION NAO MOVE NADA. Ela so' abre o lugar certo; a limpeza do legado e' outro PR.
--
-- OS DOIS, com os mesmos atributos das 14 irmas (copiados do banco, nao redigitados):
--   tipo_operacao '2-Saidas' | macro_custo 'Custeio Producao' | grupo 'Custo Fixo Administrativo'
--   escopo 'administrativo' | compoe_dre true | bloco_dre 'fixo' | grupo_fluxo NULL
--   ⚠ `gera_lcdpr` fica NULL, e isso foi conferido: as 14 irmas tem NULL, nao `false`. Gravar
--   `false` faria estas duas serem as unicas com valor explicito num grupo inteiro de nulos — uma
--   diferenca sem intencao, que a proxima consulta leria como decisao.
--
-- ⚠ "Financeiro" NAO E' CENTRO INVENTADO. Ele ja' existe na casa, em outros grupos:
--   'Rendimentos Financeiros' (Outras Receitas, escopo administrativo) e 'Seguro Agricola
--   Agricultura' (Custo Variavel Agricultura). E' novo apenas DENTRO deste grupo, que ate' hoje
--   so' tinha Administracao, Impostos, Mao de Obra e Maquinas.
--   ⚠ E `centro_custo` e' TEXTO LIVRE — a tabela nao tem FK nenhuma (medido: zero constraints
--   'f'). Quem garante que nao nasce um centro gemeo com outra grafia e' o cuidado de escrever
--   igual, nao o banco.
--
-- ⚠ OS ACENTOS SEGUEM AS IRMAS, nao o briefing. O texto do pedido veio sem acento
--   ("Administracao", "Escritorio"); o banco tem 'Administração' e 'Escritório'. Gravar sem acento
--   criaria um centro 'Administracao' SEPARADO de 'Administração' — dois centros na tela, com o
--   mesmo nome aos olhos de quem le.
--
-- ⚠ A ORDEM DO GRUPO E' RENUMERADA para manter centro a-z > subcentro a-z (PLANO-ORDEM-01), e
--   12 das 14 linhas mudam de numero. Isso foi medido antes de decidir:
--     - nenhum codigo de producao aponta para a faixa 21xxx (a unica busca por ordem literal e'
--       `ORDEM_PLANO_TRANSFERENCIA = 18010`, em src/v2/lib/mesa/transferenciaPlano.ts);
--     - nenhuma funcao do banco cita 21xxx;
--     - as duas mencoes a 21010 no repo sao FIXTURES de teste
--       (src/lib/financeiro/planoChaveClassificacoes.test.ts), e 21010 NAO muda.
--   ⚠ A ORDENACAO E' A DO BANCO, nao a minha: o `row_number() OVER (ORDER BY centro_custo,
--   subcentro)` usa a collation do proprio servidor. Por ela, 'Mao de Obra' vem ANTES de
--   'Maquinas' — o inverso do que a regra de acentuacao do portugues sugeriria. Calcular a ordem
--   aqui, em vez de escrever os numeros a mao, e' o que impede a lista de discordar do ORDER BY
--   que a tela usa.
--
-- ⚠ NAO HA' COPIA POR CLIENTE A REPLICAR. O briefing supos que o PLANO-ADM-05 tivesse espelhado o
--   escritorio por cliente; medido, nao espelhou: as 8 linhas de escopo administrativo com
--   `cliente_id` preenchido sao todas do grupo DIVIDENDOS (Apto. Guaruja, Casa fazenda, Doacoes...),
--   de um cliente so'. O Custo Fixo Administrativo e' 100% global, 14 de 14. Estas duas nascem
--   globais como as irmas, e chegam a todos os clientes pelo catalogo.
--
-- IDEMPOTENTE: o INSERT tem `WHERE NOT EXISTS` por (grupo, centro, subcentro) e a renumeracao so'
-- escreve onde o numero muda. Rodar de novo nao duplica nem reescreve.

begin;

-- ── os dois novos, com ordem provisoria (a renumeracao abaixo dá a definitiva) ─────────────
insert into public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro,
   grupo_fluxo, escopo_negocio, ativo, ordem_exibicao, compoe_dre, gera_lcdpr, bloco_dre)
select null, '2-Saídas', 'Custeio Produção', 'Custo Fixo Administrativo', v.centro, v.sub,
       null, 'administrativo', true, v.ord_provisoria, true, null, 'fixo'
  from (values
      ('Financeiro',    'Despesas Financeiras Administrativo', 99001),
      ('Administração', 'Despesas de Escritório',              99002)
  ) as v(centro, sub, ord_provisoria)
 where not exists (
   select 1 from public.financeiro_plano_contas p
    where p.escopo_negocio = 'administrativo'
      and p.grupo_custo    = 'Custo Fixo Administrativo'
      and p.centro_custo   = v.centro
      and p.subcentro      = v.sub);

-- ── a ordem do grupo, recalculada pela collation do proprio banco ──────────────────────────
with ord as (
  select id, 21000 + (row_number() over (order by centro_custo, subcentro)) * 10 as nova
    from public.financeiro_plano_contas
   where escopo_negocio = 'administrativo' and grupo_custo = 'Custo Fixo Administrativo'
)
update public.financeiro_plano_contas p
   set ordem_exibicao = ord.nova, updated_at = now()
  from ord
 where ord.id = p.id
   and p.ordem_exibicao is distinct from ord.nova;

-- ── guarda de saida: 16 linhas, todas 'fixo', ordem sem buraco e em a-z ────────────────────
do $$
declare v_n int; v_fixo int; v_seq int; v_fora_az int;
begin
  select count(*), count(*) filter (where bloco_dre = 'fixo')
    into v_n, v_fixo
    from public.financeiro_plano_contas
   where escopo_negocio = 'administrativo' and grupo_custo = 'Custo Fixo Administrativo';

  if v_n <> 16 then
    raise exception 'esperava 16 linhas no grupo, achei %', v_n using errcode = 'P0001';
  end if;
  if v_fixo <> 16 then
    raise exception 'ha % linha(s) com bloco_dre diferente de fixo', v_n - v_fixo using errcode = 'P0001';
  end if;

  -- passo 10 exato, de 21010 a 21160
  select count(*) into v_seq from (
    select ordem_exibicao, 21000 + (row_number() over (order by ordem_exibicao)) * 10 as esperada
      from public.financeiro_plano_contas
     where escopo_negocio = 'administrativo' and grupo_custo = 'Custo Fixo Administrativo') z
   where ordem_exibicao is distinct from esperada;
  if v_seq > 0 then
    raise exception 'a ordem tem % buraco(s) — nao e sequencia de 10 a partir de 21010', v_seq
      using errcode = 'P0001';
  end if;

  -- a ordem numerica tem de coincidir com centro a-z > subcentro a-z
  select count(*) into v_fora_az from (
    select ordem_exibicao,
           row_number() over (order by centro_custo, subcentro) rn_az,
           row_number() over (order by ordem_exibicao)           rn_num
      from public.financeiro_plano_contas
     where escopo_negocio = 'administrativo' and grupo_custo = 'Custo Fixo Administrativo') z
   where rn_az <> rn_num;
  if v_fora_az > 0 then
    raise exception 'a ordem numerica discorda do a-z em % linha(s)', v_fora_az using errcode = 'P0001';
  end if;

  raise notice 'PLANO-ADM-06 ok: 16 linhas, todas fixo, 21010..21160 em a-z.';
end $$;

commit;
