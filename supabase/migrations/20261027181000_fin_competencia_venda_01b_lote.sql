-- FIN-COMPETENCIA-VENDA-01b (2/2) — lote: competencia e safra dos recebimentos de venda/abate pela saida do gado.
-- DADOS, nao schema. Roda depois de 20261027180000 (writers). Reexecutar FALHA nas guardas (o conjunto some) — o certo.
--
-- REGRA (Gabriel, 29/09/2026): competencia e safra do recebimento de venda/abate = data da (primeira) saida do gado.
-- ALVO (medicao em docs/investigacao/fin-competencia-venda-01b-medicao.md, OK do Gabriel na lista):
--   A-cc  recebimento ligado a OC de conta corrente, competencia ou safra != `_oc_competencia_pela_saida` ....... 128
--   A-tit recebimento ligado a OC por titulo (os 8 abates com a data do abate, 1 dia depois do embarque) ....... 13
--   B     recebimento SOLTO com UMA saida candidata (mesmo cliente, venda/abate realizada, -120/+30 dias do
--         pagamento, destino ~ favorecido >= 0,3); NAO liga a' OC — so' competencia e safra ......................... 23
--   Total 164 = NJ 58, Santa Rita 80, Raul 16, Agnaldo 6, Vera 4.
--   Fora: boitel; varias candidatas; nenhuma candidata; "editado a' mao" (= `editado_manual` com competencia diferente do
--   pagamento E da data da OC — nenhum no conjunto); 52c13a7c (NJ, OC provavelmente errada — fica para revisao).
--   ⚠ 165 NO BRIEFING, 164 AQUI: o 0255e1d1 (Walter Barros, venda 022 vacas) teve a competencia posta na saida (06/10/25) a'
--     mao em 29/09/2026 22:48, depois da medicao; ja' nao diverge e sai sozinho. A lista e' conferida por md5 dos ids.
--
-- O QUE CADA LINHA RECEBE:
--   1. `data_competencia` e `safra_id` novos (o gatilho do `ano_mes` acompanha).
--   2. `editado_manual` e `hash_importacao` DE ANTES, regravados num segundo UPDATE: o lote nao e' edicao humana (sem isso o
--      gatilho marcaria 149 importados como editados a' mao), e a competencia recalcularia o hash de importacao
--      (VINCULAR-FIX-01). Nenhuma das duas colunas esta' nas listas UPDATE OF dos gatilhos de hash.
--      `updated_by` vai a NULL: o autor e' a migration — mantido, o audit_log automatico atribuiria o lote ao ultimo editor.
--   3. Guarda por linha: valor, pagamento, contas, conta do plano, hash e `editado_manual` iguais aos de antes.
--   4. Trilha: A -> `zoo_operacao_eventos` acao 'corrigir_competencia_pela_saida', com `parte_id` e o registro do 01a
--      (`competencia_pela_saida`, anteriores e novos) — a volta do desvincular o acha (writers 1/2) e restaura. B -> sem OC,
--      `audit_log` (modulo financeiro) com a saida usada. O `audit_log` automatico do lancamento tambem registra os UPDATEs.
-- O que NAO muda: valor, banco, pagamento, conciliacao (7 conciliados no conjunto, intocados), DRE da conta corrente.
-- DRE pecuaria (fn_dre_pecuaria real, provado em rollback): so' Santa Rita 2024 (+318.530,99) e 2025 (-318.530,99).
--
do $lote$
declare
  lin record;
  v_d public.financeiro_lancamentos_v2;
  v_n int; v_por jsonb; v_md5 text; v_ev int := 0; v_au int := 0; v_upd int := 0; v_rc int;
begin
  -- 0. guardas de origem: a funcao que calcula e a volta que acha o evento do lote
  if (select md5(prosrc) from pg_proc where proname = '_oc_competencia_pela_saida' and pronamespace = 'public'::regnamespace)
     is distinct from 'c86e674e641999c384074785b9370f6b' then
    raise exception '01b lote: _oc_competencia_pela_saida fora do corpo esperado. Abortado.'; end if;
  if (select md5(prosrc) from pg_proc where proname = 'oc_desvincular_lancamento' and pronamespace = 'public'::regnamespace)
     is distinct from '6cbc7e2a1c3b9a3e2563d87085184d74' then
    raise exception '01b lote: oc_desvincular_lancamento sem a busca do evento do lote (rodar 20261027180000 antes). Abortado.'; end if;

  -- 1. o conjunto, com a mesma query da medicao
  create temp table _alvo_01b on commit drop as
  with lig as (
    select ('A-' || case o.modelo_financeiro when 'conta_corrente' then 'cc' else 'tit' end)::text alvo, l.id, l.cliente_id,
           l.data_competencia comp, l.data_pagamento pag, l.safra_id, l.editado_manual, l.subcentro, o.data_operacao, o.id op,
           p.id parte_id, cps.data_competencia comp_nova, cps.safra_id safra_nova, null::uuid saida
    from public.financeiro_lancamentos_v2 l
    join public.zoo_operacao_partes p on p.financeiro_lancamento_id = l.id and not p.cancelada
    join public.zoo_operacoes_comerciais o on o.id = p.operacao_id and o.cancelado_em is null
    cross join lateral public._oc_competencia_pela_saida(o.id) cps
    where l.cancelado is not true and l.tipo_operacao = '1-Entradas' and coalesce(l.sem_movimentacao_caixa, false) = false
      and l.subcentro in ('Abates de Fêmeas','Abates de Machos','Venda de Desmama Fêmeas','Venda de Desmama Machos',
                          'Venda de Fêmeas Adultas','Venda de Machos Adultos')),
  rec as (
    select l.*, coalesce(l.data_pagamento, l.data_competencia) pagx, fo.nome fav
    from public.financeiro_lancamentos_v2 l left join public.financeiro_fornecedores fo on fo.id = l.favorecido_id
    where l.sinal = '1' and l.sem_movimentacao_caixa is false and l.movimentacao_rebanho_id is null and l.cancelado is not true
      and l.subcentro in ('Abates de Fêmeas','Abates de Machos','Venda de Desmama Fêmeas','Venda de Desmama Machos',
                          'Venda de Fêmeas Adultas','Venda de Machos Adultos')
      and l.cenario = 'realizado'
      and not exists (select 1 from public.zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and not p.cancelada)),
  cand as (
    select r.id, count(s.id) n, min(s.data) d1, (array_agg(s.id))[1] saida
    from rec r join public.lancamentos s on s.cliente_id = r.cliente_id and s.tipo in ('venda','abate') and s.cancelado is not true
      and s.cenario = 'realizado' and s.data between r.pagx - 120 and r.pagx + 30
      and public.similarity(lower(public.unaccent(coalesce(s.fazenda_destino,''))), lower(public.unaccent(coalesce(r.fav,'')))) >= 0.3
    group by r.id),
  sol as (
    select 'B'::text, r.id, r.cliente_id, r.data_competencia, r.data_pagamento, r.safra_id, r.editado_manual, r.subcentro,
           null::date, null::uuid, null::uuid, k.d1, public.fn_safra_sugerida(r.cliente_id, k.d1, 'pecuaria'), k.saida
    from rec r join cand k on k.id = r.id and k.n = 1)
  select u.*, l.valor, l.hash_importacao, l.conta_bancaria_id, l.conta_destino_id, l.plano_conta_id, l.fazenda_id,
         (u.editado_manual and u.comp is distinct from u.pag and u.comp is distinct from u.data_operacao) manual
  from (select * from lig union all select * from sol) u
  join public.financeiro_lancamentos_v2 l on l.id = u.id
  where (u.comp is distinct from u.comp_nova or u.safra_id is distinct from u.safra_nova)
    and left(u.id::text, 8) <> '52c13a7c';

  -- 2. guardas do conjunto
  if exists (select 1 from _alvo_01b where manual) then
    raise exception '01b lote: ha'' recebimento editado a'' mao no conjunto. Abortado.'; end if;
  if exists (select 1 from _alvo_01b where subcentro = 'Venda em Boitel') then
    raise exception '01b lote: boitel no conjunto. Abortado.'; end if;
  select count(*), md5(string_agg(id::text, ',' order by id)) into v_n, v_md5 from _alvo_01b;
  select jsonb_object_agg(nome, n) into v_por from (
    select c.nome, count(*) n from _alvo_01b a join public.clientes c on c.id = a.cliente_id group by c.nome) z;
  if v_n <> 164 or v_por <> '{"NJ Pecuária": 58, "Santa Rita Agro": 80, "Raul Juliato": 16, "Agnaldo Cedenho": 6, "Vera Ligia Milani": 4}'::jsonb then
    raise exception '01b lote: conjunto diferente do medido (% linhas, %). Abortado.', v_n, v_por; end if;
  if v_md5 <> '75e56570d59d5bd7d955510ff010257a' then
    raise exception '01b lote: os ids nao sao os da lista aprovada (md5 %). Abortado.', v_md5; end if;
  if (select count(*) from _alvo_01b where alvo = 'A-cc') <> 128 or (select count(*) from _alvo_01b where alvo = 'A-tit') <> 13
     or (select count(*) from _alvo_01b where alvo = 'B') <> 23 then
    raise exception '01b lote: divisao A-cc/A-tit/B diferente da medida. Abortado.'; end if;

  -- 3. linha a linha
  for lin in select * from _alvo_01b order by id loop
    update public.financeiro_lancamentos_v2
       set data_competencia = lin.comp_nova, safra_id = lin.safra_nova, updated_at = now(), updated_by = null  -- o autor e' a migration
     where id = lin.id and data_competencia is not distinct from lin.comp and safra_id is not distinct from lin.safra_id;
    get diagnostics v_rc = row_count;
    if v_rc <> 1 then raise exception '01b lote: % mudou durante o lote. Abortado.', lin.id; end if;
    update public.financeiro_lancamentos_v2
       set editado_manual = lin.editado_manual, hash_importacao = lin.hash_importacao
     where id = lin.id and (editado_manual is distinct from lin.editado_manual or hash_importacao is distinct from lin.hash_importacao);
    select * into v_d from public.financeiro_lancamentos_v2 where id = lin.id;
    if v_d.data_competencia is distinct from lin.comp_nova or v_d.safra_id is distinct from lin.safra_nova
       or v_d.valor is distinct from lin.valor or v_d.data_pagamento is distinct from lin.pag
       or v_d.conta_bancaria_id is distinct from lin.conta_bancaria_id or v_d.conta_destino_id is distinct from lin.conta_destino_id
       or v_d.plano_conta_id is distinct from lin.plano_conta_id or v_d.hash_importacao is distinct from lin.hash_importacao
       or v_d.editado_manual is distinct from lin.editado_manual then
      raise exception '01b lote: % ficou diferente do esperado (competencia %, safra %). Abortado.', lin.id, v_d.data_competencia, v_d.safra_id;
    end if;
    v_upd := v_upd + 1;

    if lin.op is not null then
      insert into public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
      values (lin.cliente_id, lin.op, 'corrigir_competencia_pela_saida',
        jsonb_build_object('lancamento', jsonb_build_object('id', lin.id, 'data_competencia', lin.comp, 'safra_id', lin.safra_id)),
        jsonb_build_object('lancamento', jsonb_build_object('id', lin.id, 'data_competencia', lin.comp_nova, 'safra_id', lin.safra_nova)),
        jsonb_build_object('motivo', 'FIN-COMPETENCIA-VENDA-01b: competencia e safra pela primeira saida do gado da OC',
          'lancamento_id', lin.id, 'parte_id', lin.parte_id, 'alvo', lin.alvo, 'competencia_pela_saida', true,
          'competencia_anterior', lin.comp, 'competencia_nova', lin.comp_nova,
          'safra_anterior', lin.safra_id, 'safra_nova', lin.safra_nova),
        null, 'migration');
      v_ev := v_ev + 1;
    else
      insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo,
                                    dados_anteriores, dados_novos)
      values (lin.cliente_id, lin.fazenda_id, null, 'financeiro', 'corrigir_competencia_pela_saida', 'financeiro_lancamentos_v2', lin.id,
        format('FIN-COMPETENCIA-VENDA-01b: competencia %s -> %s pela saida %s (recebimento solto, nao ligado a OC)',
               to_char(lin.comp, 'DD/MM/YY'), to_char(lin.comp_nova, 'DD/MM/YY'), left(lin.saida::text, 8)),
        jsonb_build_object('data_competencia', lin.comp, 'safra_id', lin.safra_id),
        jsonb_build_object('data_competencia', lin.comp_nova, 'safra_id', lin.safra_nova, 'saida_id', lin.saida,
                           'regra', 'saida unica: mesmo cliente, venda/abate realizada, -120/+30 dias do pagamento, destino ~ favorecido >= 0,3'));
      v_au := v_au + 1;
    end if;
  end loop;

  if v_upd <> 164 or v_ev <> 141 or v_au <> 23 then
    raise exception '01b lote: contagem final (% linhas, % eventos, % audit). Abortado.', v_upd, v_ev, v_au; end if;
  raise notice '01b lote: % recebimentos corrigidos (% eventos de OC, % registros de audit_log)', v_upd, v_ev, v_au;
end $lote$;
