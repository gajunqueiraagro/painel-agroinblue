-- CONC-SUGESTOES-V2 · lote B2 (Gabriel 26/11 07:07, "o débito do FCO não apareceu nas Sugestões"): a REGRA DE FINANCIAMENTO no motor e o
-- DIA ÚTIL bancário.
--   (a) parcela de contrato (financiamento/consórcio) EM ABERTO, de qualquer conta, é candidata (com p_ampliado) quando o banco do extrato
--       é o credor OU o texto do banco traz o credor. ADIANTAMENTO (Gabriel 07:09): SEM janela de data e sem filtro de valor — toda parcela
--       aberta do credor é achável (paga anos antes, amortização antecipada); as perto da data e do valor vêm primeiro (a ordem, nunca o
--       filtro); o valor diferente aparece com o Δ. Texto de liquidação de parcela/operação de crédito pesa. Volta parcela_id (a amortização e os juros da MESMA parcela juntos),
--       parcela_rotulo ("FCO - Curral · 1/12 · venc. 01/11") e dias_uteis (0 = pago no 1º dia útil depois do vencimento de fim de semana/feriado).
--   (d) _fn_feriados_bancarios / _fn_dia_util / _fn_proximo_dia_util / _fn_dias_uteis_de_atraso: o calendário FEBRABAN (feriados nacionais fixos
--       + Carnaval seg/ter, Sexta-feira Santa e Corpus Christi pela Páscoa). Feriado municipal/estadual não entra (não há cadastro).
-- Sem p_ampliado a resposta segue a de hoje (o ensaio prova). Nada é gravado.

-- ── o calendário bancário ──
CREATE OR REPLACE FUNCTION public._fn_pascoa(p_ano int)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $function$
DECLARE a int := p_ano % 19; b int := p_ano / 100; c int := p_ano % 100; d int; e int; f int; g int; h int; i int; k int; l int; m int; mes int; dia int;
BEGIN
  d := b / 4; e := b % 4; f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19 * a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2 * e + 2 * i - h - k) % 7; m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31; dia := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(p_ano, mes, dia);
END $function$;

CREATE OR REPLACE FUNCTION public._fn_feriado_bancario(p_dia date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  select to_char(p_dia, 'MM-DD') in ('01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25')
      or (to_char(p_dia, 'MM-DD') = '11-20' and extract(year from p_dia) >= 2024)
      or p_dia in (public._fn_pascoa(extract(year from p_dia)::int) - 48, public._fn_pascoa(extract(year from p_dia)::int) - 47,
                   public._fn_pascoa(extract(year from p_dia)::int) - 2, public._fn_pascoa(extract(year from p_dia)::int) + 60)
$function$;

CREATE OR REPLACE FUNCTION public._fn_dia_util(p_dia date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  select extract(isodow from p_dia) < 6 and not public._fn_feriado_bancario(p_dia)
$function$;

CREATE OR REPLACE FUNCTION public._fn_proximo_dia_util(p_dia date)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $function$
DECLARE d date := p_dia;
BEGIN
  IF d IS NULL THEN RETURN NULL; END IF;
  WHILE NOT public._fn_dia_util(d) LOOP d := d + 1; END LOOP;
  RETURN d;
END $function$;

-- pago − vencimento em DIAS ÚTEIS: 0 = no dia (inclusive o 1º dia útil depois de um vencimento em fim de semana/feriado);
-- + = dias úteis de atraso; − = dias úteis de antecedência
CREATE OR REPLACE FUNCTION public._fn_dias_uteis_de_atraso(p_vencimento date, p_pago date)
RETURNS int LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $function$
DECLARE v date; n int := 0; d date;
BEGIN
  IF p_vencimento IS NULL OR p_pago IS NULL THEN RETURN NULL; END IF;
  v := public._fn_proximo_dia_util(p_vencimento);
  IF p_pago = v THEN RETURN 0; END IF;
  IF p_pago > v THEN
    d := v; WHILE d < p_pago LOOP d := d + 1; IF public._fn_dia_util(d) THEN n := n + 1; END IF; END LOOP; RETURN n;
  END IF;
  d := p_pago; WHILE d < v LOOP IF public._fn_dia_util(d) THEN n := n + 1; END IF; d := d + 1; END LOOP; RETURN -n;
END $function$;

-- a palavra que identifica o credor no texto do banco: a 1ª que não é "banco"/"de"/"do"/"s.a." (Rabobank, Sicredi, Bradesco, John…)
CREATE OR REPLACE FUNCTION public._fn_palavra_do_credor(p_nome text)
RETURNS text LANGUAGE sql STABLE SET search_path TO '' AS $function$
  select coalesce((select w from unnest(regexp_split_to_array(lower(public._fn_normalizar_texto(coalesce(p_nome, ''))), '[^a-z0-9]+')) with ordinality u(w, i)
                    where w <> '' and w not in ('banco', 'bco', 'de', 'do', 'da', 'dos', 'das', 's', 'a', 'sa', 'ltda', 'cooperativa', 'coop', 'e')
                    order by i limit 1), '')
$function$;

-- ── o motor (a de 114380 + a regra de financiamento) ──
DROP FUNCTION IF EXISTS public.fn_candidatos_conciliacao(uuid, uuid, integer, boolean);

CREATE FUNCTION public.fn_candidatos_conciliacao(p_cliente_id uuid, p_extrato_id uuid, p_limite integer DEFAULT 10, p_ampliado boolean DEFAULT false)
 RETURNS TABLE(id uuid, descricao text, favorecido text, numero_documento text, data_referencia date, valor text, status text, ja_conciliado text, saldo text, delta_valor text, delta_dias integer, score integer, pre_marcado boolean, ambiguo boolean, indisponivel boolean, motivo_indisponivel text, transferencia_id uuid, contraparte_nome text, competencia date, vencimento date, pagamento date, vencido boolean, dias_atraso integer,
               conta_bancaria_id uuid, conta_nome text, outra_conta boolean, documento_casa text, exata boolean, origem text,
               parcela_id uuid, parcela_rotulo text, dias_uteis integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with mov as (
    select e.id, e.conta_bancaria_id, e.data_movimento, e.valor, e.descricao,
           case when p_ampliado then public._fn_documento_do_texto(e.descricao) end as doc
      from public.extrato_bancario_v2 e
     where e.id = p_extrato_id
       and e.cliente_id = p_cliente_id
       and e.cancelado_em is null and e.ignorado_em is null
  ),
  -- CONC-SUGESTOES-V2 (ii): o fornecedor do cliente pelo documento do banco — o mesmo ('cnpj') ou, no CNPJ, a mesma raiz ('raiz')
  forn_doc as (
    select f.id,
           case when x.dig = m.doc then 'cnpj' else 'raiz' end as casa
      from public.financeiro_fornecedores f
      cross join mov m
      cross join lateral (select regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g') as dig) x
     where p_ampliado and m.doc is not null
       and f.cliente_id = p_cliente_id
       and (x.dig = m.doc
            or (length(m.doc) = 14 and length(x.dig) = 14 and left(x.dig, 8) = left(m.doc, 8)))
  ),
  -- CONC-SUGESTOES-V2 regra de financiamento (Gabriel 26/11 07:07): a PARCELA DE CONTRATO (financiamento/consórcio) EM ABERTO de qualquer
  -- conta é candidata quando o banco do extrato é o CREDOR (o banco da conta do extrato no nome do credor) OU o texto do banco traz o nome
  -- do credor. Sem janela de data nem de valor (ADIANTAMENTO): o p_limite e a ordem (exata · score · Δ dias) escolhem.
  fin as (
    select x.id as lancamento_id, fp.id as parcela_id,
           f.descricao || ' · ' || fp.numero_parcela || '/' || coalesce(f.total_parcelas, (select count(*) from public.financiamento_parcelas p2 where p2.financiamento_id = f.id))
             || ' · venc. ' || to_char(fp.data_vencimento, 'DD/MM') as rotulo,
           -- dia útil só perto do vencimento (até 60 dias corridos): longe, a ordem pelos dias corridos basta e a conta dia a dia pesa
           case when abs(fp.data_vencimento - m.data_movimento) <= 60
                then public._fn_dias_uteis_de_atraso(fp.data_vencimento, m.data_movimento) end as dias_uteis
      from mov m
      join public.financiamentos f on f.cliente_id = p_cliente_id and f.natureza in ('financiamento', 'consorcio')
       and coalesce(f.status, '') not in ('cancelado', 'quitado')
      join public.financiamento_parcelas fp on fp.financiamento_id = f.id
      join public.financeiro_lancamentos_v2 x on x.id in (fp.lancamento_id, fp.lancamento_juros_id) and x.cancelado is not true
       and x.status_transacao in ('previsto', 'agendado', 'programado') and x.data_pagamento is null
      left join public.financeiro_fornecedores cr on cr.id = f.credor_id
      left join public.financeiro_contas_bancarias cbm on cbm.id = m.conta_bancaria_id
      left join public.bancos_referencia br on br.ativo and (lower(br.nome_curto) = lower(cbm.banco) or lower(br.nome_banco) = lower(cbm.banco))
     where p_ampliado and m.valor < 0
       and (
             -- o banco do extrato é o credor: "Sicredi" em "Banco Sicredi", "BB"/"Banco do Brasil" em "Banco do Brasil S.A."
             (cr.nome is not null and cbm.banco is not null and (
                 strpos(lower(public._fn_normalizar_texto(cr.nome)), lower(public._fn_normalizar_texto(cbm.banco))) > 0
              or (br.nome_banco is not null and strpos(lower(public._fn_normalizar_texto(cr.nome)), lower(public._fn_normalizar_texto(br.nome_banco))) > 0)))
             -- ou o texto do banco traz o credor (boleto do Rabobank pago pelo BB): a 1ª palavra do credor que não é "banco"
          or (cr.nome is not null and length(public._fn_palavra_do_credor(cr.nome)) >= 4
              and strpos(lower(public._fn_normalizar_texto(m.descricao)), public._fn_palavra_do_credor(cr.nome)) > 0)
           )
  ),
  base as (
    select
      t.id, t.descricao, f.nome as favorecido, t.numero_documento,
      coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia) as data_referencia,
      t.valor, t.status_transacao as status,
      t.data_competencia as competencia, t.data_vencimento as vencimento,
      t.data_pagamento as pagamento,
      t.transferencia_grupo_id as transferencia_id,
      coalesce(cob.aplicado, 0)                as ja_conciliado,
      abs(t.valor) - coalesce(cob.aplicado, 0) as saldo,
      abs(t.valor) - abs(m.valor)              as delta_valor,
      abs(coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia) - m.data_movimento)::int as delta_dias,
      m.descricao as mov_descricao, m.valor as mov_valor, m.data_movimento as mov_data,
      -- CONC-CRIAR-COM-NOTA-02 D-f — em aberto, valor exato, vencimento de -60 a +90 dias do movimento (antecipado e atrasado)
      (t.status_transacao in ('previsto', 'agendado', 'programado')
        and abs(abs(t.valor) - abs(m.valor)) <= 0.01
        and t.data_vencimento between m.data_movimento - 60 and m.data_movimento + 90) as valor_exato_aberto,
      t.conta_efetiva_id as conta_id,
      (t.conta_efetiva_id is distinct from m.conta_bancaria_id) as outra_conta,
      fd.casa as documento_casa,
      -- CONC-SUGESTOES-V2 (ii): aberto do fornecedor do documento — qualquer mês
      (fd.id is not null and t.status_transacao in ('previsto', 'agendado', 'programado') and t.data_pagamento is null) as doc_aberto,
      fi.parcela_id, fi.rotulo as parcela_rotulo, fi.dias_uteis
      from public.financeiro_lancamentos_v2 t
      left join public.financeiro_fornecedores f on f.id = t.favorecido_id
      cross join mov m
      left join forn_doc fd on fd.id = t.favorecido_id
      left join fin fi on fi.lancamento_id = t.id
      left join (
        select c.lancamento_id, sum(c.valor_aplicado) as aplicado
          from public.conciliacao_bancaria_itens c
         where c.desfeito_em is null
         group by c.lancamento_id
      ) cob on cob.lancamento_id = t.id
     where t.cliente_id = p_cliente_id
       and t.cancelado is not true
       and t.cenario is distinct from 'meta'   -- P120: meta nunca e' candidato a casar com o extrato
       and (coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia)
             between m.data_movimento - 60 and m.data_movimento + 60
            -- CONC-CRIAR-COM-NOTA-02 D-f
            or (t.status_transacao in ('previsto', 'agendado', 'programado')
                and abs(abs(t.valor) - abs(m.valor)) <= 0.01
                and t.data_vencimento between m.data_movimento - 60 and m.data_movimento + 90)
            -- CONC-SUGESTOES-V2 (ii)
            or (fd.id is not null and t.status_transacao in ('previsto', 'agendado', 'programado') and t.data_pagamento is null)
            -- regra de financiamento
            or fi.lancamento_id is not null)
       -- CONC-CANDIDATO-ENTRADA-01: a conta do lancamento PELA DIRECAO, na coluna gerada conta_efetiva_id
       -- (entrada: conta_destino_id; saida e transferencia: conta_bancaria_id) — a mesma regra do gatilho
       -- fn_normalizar_conta_por_direcao, que zera conta_bancaria_id em toda entrada.
       -- CONC-SUGESTOES-V2 (i): ampliado, o EM ABERTO de qualquer banco do cliente (a conta dele é prevista)
       and (t.conta_efetiva_id = m.conta_bancaria_id
            or (p_ampliado and t.status_transacao in ('previsto', 'agendado', 'programado') and t.data_pagamento is null))
       and ((m.valor < 0 and t.sinal = '-1') or (m.valor > 0 and t.sinal = '1'))
       and (
             coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia)
               between m.data_movimento - 20 and m.data_movimento + 20
          -- REGRA DO GABRIEL (31/08): o MESMO MES do movimento tambem entra —
          -- lancado dia 01 e pago dia 31 e caso comum, e +-20 nao alcanca.
          or date_trunc('month', coalesce(t.data_pagamento, t.data_vencimento, t.data_competencia))
               = date_trunc('month', m.data_movimento::timestamp)
          or (t.data_vencimento is not null
              and t.data_vencimento < current_date
              and t.status_transacao in ('previsto', 'agendado', 'programado'))
          -- CONC-CRIAR-COM-NOTA-02 D-f
          or (t.status_transacao in ('previsto', 'agendado', 'programado')
              and abs(abs(t.valor) - abs(m.valor)) <= 0.01
              and t.data_vencimento between m.data_movimento - 60 and m.data_movimento + 90)
          -- CONC-SUGESTOES-V2 (ii)
          or (fd.id is not null and t.status_transacao in ('previsto', 'agendado', 'programado') and t.data_pagamento is null)
          -- regra de financiamento
          or fi.lancamento_id is not null
           )
  ),
  pontuado as (
    select b.*,
      (case when abs(b.delta_valor) <= 0.01 then 70 else 0 end)
    + (case when b.delta_dias <= 3          then 20 else 0 end)
    + (case
         when coalesce(b.descricao, '') <> '' and coalesce(b.mov_descricao, '') <> ''
          and (position(lower(b.descricao) in lower(b.mov_descricao)) > 0
            or position(lower(b.mov_descricao) in lower(b.descricao)) > 0)
         then 10 else 0
       end)
    -- regra de financiamento: o texto do banco de liquidação de parcela/operação de crédito pesa (a parcela sobe na lista)
    + (case when b.parcela_id is not null and abs(coalesce(b.dias_uteis, 999)) <= 10 then 10 else 0 end)
    + (case when b.parcela_id is not null and b.mov_descricao ~* '(LIQUIDACAO|LIQ\.?)\s+(DE\s+)?(PARCELA|OPER)|PARCELA|FCO|AMORTIZ|FINANC|EMPREST'
            then 15 else 0 end) as score,
      (b.saldo <= 0) as indisponivel,
      (b.data_referencia not between b.mov_data - 20 and b.mov_data + 20
        and date_trunc('month', b.data_referencia) <> date_trunc('month', b.mov_data::timestamp)
        and not b.valor_exato_aberto
        and not b.doc_aberto
        and b.parcela_id is null) as fora_da_janela,
      (b.vencimento is not null and b.vencimento < current_date
        and b.status in ('previsto', 'agendado', 'programado'))          as vencido,
      case when b.vencimento is not null and b.vencimento < current_date
           then (current_date - b.vencimento)::int end                   as dias_atraso,
      (abs(b.delta_valor) <= 0.01 and b.documento_casa is not null)      as exata
      from base b
  ),
  elegivel as (
    select p.*, row_number() over (order by (p_ampliado and p.exata) desc, p.score desc, p.delta_dias, p.id) as rn,
           -- ADIANTAMENTO: as parcelas de contrato têm vaga própria (até 12, as melhores entre elas) — o p_limite geral não as corta
           case when p.parcela_id is not null
                then row_number() over (partition by (p.parcela_id is not null) order by p.score desc, p.delta_dias, p.id) end as rn_fin
      from pontuado p
     where not p.indisponivel and not p.fora_da_janela
  ),
  topo as (
    select max(score) filter (where rn = 1) as s1,
           max(score) filter (where rn = 2) as s2
      from elegivel
  ),
  guarda as (
    select (t.s1 is not null and t.s1 >= 70 and coalesce(t.s1 - t.s2, 99) <= 1) as ambiguo
      from topo t
  ),
  -- CONC-SUGESTOES-V2 (iii): as notas do mesmo emitente que ainda não têm lançamento vivo (emissão até 120 dias antes do movimento)
  notas as (
    select n.id, n.numero, n.emitente_nome, n.emissao,
           round(n.nota_cent / 100.0, 2) as valor_nota,
           case when regexp_replace(coalesce(n.emitente_documento, ''), '\D', '', 'g') = m.doc then 'cnpj' else 'raiz' end as casa,
           m.valor as mov_valor, m.data_movimento as mov_data
      from public.nota_fiscal n
      cross join mov m
     where p_ampliado and m.doc is not null
       and n.cliente_id = p_cliente_id
       and n.nota_cent is not null
       and n.emissao between m.data_movimento - 120 and m.data_movimento + 5
       and (regexp_replace(coalesce(n.emitente_documento, ''), '\D', '', 'g') = m.doc
            or (length(m.doc) = 14 and left(regexp_replace(coalesce(n.emitente_documento, ''), '\D', '', 'g'), 8) = left(m.doc, 8)
                and length(regexp_replace(coalesce(n.emitente_documento, ''), '\D', '', 'g')) = 14))
       and not exists (
             select 1
               from public.financeiro_lancamento_documentos d
               join public.financeiro_lancamentos_v2 l on l.id = d.lancamento_id and l.cancelado is not true
              where d.chave_acesso = n.chave_acesso and d.cancelado is not true and n.chave_acesso is not null)
     order by abs(round(n.nota_cent / 100.0, 2) - abs(m.valor)), n.emissao desc, n.id
     limit 5
  )
  select
    p.id, p.descricao, p.favorecido, p.numero_documento, p.data_referencia,
    round(p.valor, 2)::text, p.status,
    round(p.ja_conciliado, 2)::text, round(p.saldo, 2)::text,
    round(p.delta_valor, 2)::text, p.delta_dias, p.score,
    coalesce(e.rn = 1 and p.score >= 90 and not g.ambiguo and not p.outra_conta, false) as pre_marcado,
    g.ambiguo, p.indisponivel,
    case when p.indisponivel
         then 'Lancamento ja conciliado integralmente — nada em aberto para vincular.'
    end,
    p.transferencia_id,
    (select cb.nome_conta
       from public.financeiro_lancamentos_v2 t2
       join public.financeiro_contas_bancarias cb on cb.id = t2.conta_bancaria_id
      where t2.transferencia_grupo_id = p.transferencia_id
        and t2.id <> p.id
        and t2.cancelado is not true
      limit 1),
    p.competencia, p.vencimento, p.pagamento,
    p.fora_da_janela and p.vencido,
    case when p.fora_da_janela and p.vencido then p.dias_atraso end,
    p.conta_id,
    (select coalesce(cb.nome_exibicao, cb.nome_conta) from public.financeiro_contas_bancarias cb where cb.id = p.conta_id),
    p.outra_conta, p.documento_casa, p.exata, 'lancamento'::text,
    p.parcela_id, p.parcela_rotulo, p.dias_uteis
    from pontuado p
    left join elegivel e on e.id = p.id
    cross join guarda g
   where
     -- o vencido fora da janela entra sempre SÓ da conta do extrato (de outro banco, só dentro do limite: senão inunda)
     p.fora_da_janela and p.vencido and not p.outra_conta
     or coalesce(e.rn, 1e9) <= p_limite
     or coalesce(e.rn_fin, 1e9) <= 12
     or (p.indisponivel and not p.fora_da_janela)
  union all
  select
    n.id, 'NF ' || coalesce(n.numero, '') , n.emitente_nome, n.numero, n.emissao,
    n.valor_nota::text, 'nota',
    '0.00', n.valor_nota::text,
    round(n.valor_nota - abs(n.mov_valor), 2)::text, abs(n.emissao - n.mov_data)::int,
    (case when abs(n.valor_nota - abs(n.mov_valor)) <= 0.01 then 70 else 0 end),
    false, false, false, null::text, null::uuid, null::text,
    n.emissao, null::date, null::date, false, null::int,
    null::uuid, null::text, false, n.casa, (abs(n.valor_nota - abs(n.mov_valor)) <= 0.01), 'nota'::text,
    null::uuid, null::text, null::int
    from notas n
   -- a ordem de hoje (vencido fora da janela · indisponível · score · Δ dias · id) com a exata antes do score: sem p_ampliado
   -- `exata` e `outra_conta` são sempre false (forn_doc e notas vazios), e a ordem fica a de hoje.
   -- 22 = vencido · 15 = indisponível · 28 = exata · 26 = outra conta (depois da do extrato)
   order by 22, 15, 28 desc, 26, 12 desc, 11, 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_candidatos_conciliacao(uuid, uuid, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_candidatos_conciliacao(uuid, uuid, integer, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._fn_pascoa(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_feriado_bancario(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_dia_util(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_proximo_dia_util(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_dias_uteis_de_atraso(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._fn_palavra_do_credor(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_pascoa(int), public._fn_feriado_bancario(date), public._fn_dia_util(date), public._fn_proximo_dia_util(date),
  public._fn_dias_uteis_de_atraso(date, date), public._fn_palavra_do_credor(text) TO authenticated, service_role;
