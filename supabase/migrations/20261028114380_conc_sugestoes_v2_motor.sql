-- CONC-SUGESTOES-V2 · lote B (Gabriel 25/11, OK no relatório visao-20261125-1712 itens A–E)
-- O MESMO motor (fn_candidatos_conciliacao) ganha, só quando pedido (p_ampliado = true, a tela nova das Sugestões):
--   (i)   CONTA PREVISTA: o lançamento EM ABERTO de qualquer banco do cliente entra (outra_conta = true, com o nome da conta);
--         o realizado/conciliado continua só o da conta do extrato (já saiu de um banco: não se casa com outro).
--   (ii)  O DOCUMENTO DO TEXTO DO BANCO (CNPJ/CPF com dígito verificador certo, _fn_documento_do_texto): o fornecedor do cliente
--         de mesmo documento ('cnpj') ou, no CNPJ, de mesma raiz ('raiz' = outra filial) → os abertos dele de QUALQUER mês.
--   (iii) NOTAS SEM LANÇAMENTO do mesmo emitente (origem = 'nota', id = a nota), para "Criar a partir desta nota".
--   (iv)  exata = valor igual (±0,01) + documento do fornecedor/emitente = o do banco. Vem primeiro. NUNCA casa sozinha:
--         pre_marcado continua a regra de hoje e é sempre false para outra conta e para nota.
-- Sem p_ampliado (o lote do mês, a estação, fn_sugestoes_extrato) a resposta é a de hoje, linha a linha (o ensaio prova).
-- fn_conciliacao_historico_buscar ganha p_documento: o fornecedor de mesmo documento/raiz casa como 'fornecedor'.
-- Nada é gravado: as duas funções seguem STABLE, só leitura.

-- ── o documento do texto do banco (o mesmo leitor de src/lib/conciliacao/nomeDoHistorico.ts: documentoDoHistorico) ──
CREATE OR REPLACE FUNCTION public._fn_documento_do_texto(p_texto text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_bloco text; d text; s int; i int; dv1 int; dv2 int;
  p12 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  p13 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
BEGIN
  FOR v_bloco IN SELECT (regexp_matches(coalesce(p_texto, ''), '\d[\d./-]{9,19}\d', 'g'))[1] LOOP
    d := regexp_replace(v_bloco, '\D', '', 'g');
    IF d ~ '^(\d)\1+$' THEN CONTINUE; END IF;
    IF length(d) = 14 THEN
      s := 0; FOR i IN 1..12 LOOP s := s + substr(d, i, 1)::int * p12[i]; END LOOP;
      dv1 := CASE WHEN s % 11 < 2 THEN 0 ELSE 11 - s % 11 END;
      s := 0; FOR i IN 1..13 LOOP s := s + substr(d, i, 1)::int * p13[i]; END LOOP;
      dv2 := CASE WHEN s % 11 < 2 THEN 0 ELSE 11 - s % 11 END;
      IF dv1 = substr(d, 13, 1)::int AND dv2 = substr(d, 14, 1)::int THEN RETURN d; END IF;
    ELSIF length(d) = 11 THEN
      s := 0; FOR i IN 1..9 LOOP s := s + substr(d, i, 1)::int * (11 - i); END LOOP;
      dv1 := (s * 10) % 11; IF dv1 = 10 THEN dv1 := 0; END IF;
      s := 0; FOR i IN 1..10 LOOP s := s + substr(d, i, 1)::int * (12 - i); END LOOP;
      dv2 := (s * 10) % 11; IF dv2 = 10 THEN dv2 := 0; END IF;
      IF dv1 = substr(d, 10, 1)::int AND dv2 = substr(d, 11, 1)::int THEN RETURN d; END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public._fn_documento_do_texto(text) IS
  'CONC-SUGESTOES-V2: o 1º CNPJ (14) ou CPF (11) do texto com dígito verificador certo, só dígitos; senão NULL. Espelho de documentoDoHistorico (front).';

-- ── o motor das sugestões ──
-- a assinatura ganha p_ampliado (default false) e o retorno ganha 6 colunas no fim: DROP + CREATE (o CREATE OR REPLACE não muda o
-- retorno; manter a de 3 argumentos ao lado deixaria a chamada de 3 ambígua)
DROP FUNCTION IF EXISTS public.fn_candidatos_conciliacao(uuid, uuid, integer);

CREATE FUNCTION public.fn_candidatos_conciliacao(p_cliente_id uuid, p_extrato_id uuid, p_limite integer DEFAULT 10, p_ampliado boolean DEFAULT false)
 RETURNS TABLE(id uuid, descricao text, favorecido text, numero_documento text, data_referencia date, valor text, status text, ja_conciliado text, saldo text, delta_valor text, delta_dias integer, score integer, pre_marcado boolean, ambiguo boolean, indisponivel boolean, motivo_indisponivel text, transferencia_id uuid, contraparte_nome text, competencia date, vencimento date, pagamento date, vencido boolean, dias_atraso integer,
               conta_bancaria_id uuid, conta_nome text, outra_conta boolean, documento_casa text, exata boolean, origem text)
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
      (fd.id is not null and t.status_transacao in ('previsto', 'agendado', 'programado') and t.data_pagamento is null) as doc_aberto
      from public.financeiro_lancamentos_v2 t
      left join public.financeiro_fornecedores f on f.id = t.favorecido_id
      cross join mov m
      left join forn_doc fd on fd.id = t.favorecido_id
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
            or (fd.id is not null and t.status_transacao in ('previsto', 'agendado', 'programado') and t.data_pagamento is null))
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
       end) as score,
      (b.saldo <= 0) as indisponivel,
      (b.data_referencia not between b.mov_data - 20 and b.mov_data + 20
        and date_trunc('month', b.data_referencia) <> date_trunc('month', b.mov_data::timestamp)
        and not b.valor_exato_aberto
        and not b.doc_aberto) as fora_da_janela,
      (b.vencimento is not null and b.vencimento < current_date
        and b.status in ('previsto', 'agendado', 'programado'))          as vencido,
      case when b.vencimento is not null and b.vencimento < current_date
           then (current_date - b.vencimento)::int end                   as dias_atraso,
      (abs(b.delta_valor) <= 0.01 and b.documento_casa is not null)      as exata
      from base b
  ),
  elegivel as (
    select p.*, row_number() over (order by (p_ampliado and p.exata) desc, p.score desc, p.delta_dias, p.id) as rn
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
    p.outra_conta, p.documento_casa, p.exata, 'lancamento'::text
    from pontuado p
    left join elegivel e on e.id = p.id
    cross join guarda g
   where
     -- o vencido fora da janela entra sempre SÓ da conta do extrato (de outro banco, só dentro do limite: senão inunda)
     p.fora_da_janela and p.vencido and not p.outra_conta
     or coalesce(e.rn, 1e9) <= p_limite
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
    null::uuid, null::text, false, n.casa, (abs(n.valor_nota - abs(n.mov_valor)) <= 0.01), 'nota'::text
    from notas n
   -- a ordem de hoje (vencido fora da janela · indisponível · score · Δ dias · id) com a exata antes do score: sem p_ampliado
   -- `exata` e `outra_conta` são sempre false (forn_doc e notas vazios), e a ordem fica a de hoje.
   -- 22 = vencido · 15 = indisponível · 28 = exata · 26 = outra conta (depois da do extrato)
   order by 22, 15, 28 desc, 26, 12 desc, 11, 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_candidatos_conciliacao(uuid, uuid, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_candidatos_conciliacao(uuid, uuid, integer, boolean) TO authenticated, service_role;

-- ── o Procurar no histórico: o documento do banco acha o fornecedor (o mesmo ou a mesma raiz) ──
DROP FUNCTION IF EXISTS public.fn_conciliacao_historico_buscar(uuid, text, text[], date, date, numeric);

CREATE FUNCTION public.fn_conciliacao_historico_buscar(p_cliente uuid, p_termo text, p_onde text[] DEFAULT ARRAY['banco'::text, 'descricao'::text, 'fornecedor'::text], p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date, p_valor numeric DEFAULT NULL::numeric, p_documento text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE
  v_t text := coalesce(public._fn_normalizar_texto(p_termo), '');
  v_banco boolean := 'banco' = ANY (coalesce(p_onde, '{}'::text[]));
  v_desc boolean := 'descricao' = ANY (coalesce(p_onde, '{}'::text[]));
  v_forn boolean := 'fornecedor' = ANY (coalesce(p_onde, '{}'::text[]));
  -- CONC-SUGESTOES-V2: só um CPF (11) ou CNPJ (14) com dígito certo vale; o resto é ignorado
  v_doc text := public._fn_documento_do_texto(p_documento);
  v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_onde IS NULL OR NOT (p_onde <@ ARRAY['banco', 'descricao', 'fornecedor']) THEN
    RAISE EXCEPTION 'onde invalido: %', p_onde USING ERRCODE = '22023';
  END IF;
  IF (length(v_t) < 2 AND v_doc IS NULL) OR NOT (v_banco OR v_desc OR v_forn) THEN
    RETURN jsonb_build_object('total', 0, 'achados', '[]'::jsonb, 'resumo', NULL);
  END IF;

  WITH l AS (
    -- P153b: todos os status vivos; a data de referencia e' o pagamento, ou o vencimento de quem nao foi pago
    SELECT l.id, l.data_pagamento, l.data_vencimento, l.data_competencia, l.status_transacao,
           coalesce(l.data_pagamento, l.data_vencimento) data_ref,
           l.descricao, l.favorecido_id, l.plano_conta_id, l.fazenda_id,
           CASE WHEN l.tipo_operacao LIKE '1-%' THEN coalesce(l.conta_destino_id, l.conta_bancaria_id) ELSE l.conta_bancaria_id END conta_id,
           CASE WHEN l.sinal = '-1' THEN -l.valor ELSE l.valor END va
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE
       AND (p_de IS NULL OR coalesce(l.data_pagamento, l.data_vencimento) >= p_de)
       AND (p_ate IS NULL OR coalesce(l.data_pagamento, l.data_vencimento) <= p_ate)
  ), b AS (
    -- o texto do banco casado com o lançamento: o do movimento mais recente, se houver mais de um
    SELECT DISTINCT ON (i.lancamento_id) i.lancamento_id, e.descricao banco
      FROM public.conciliacao_bancaria_itens i
      JOIN public.extrato_bancario_v2 e ON e.id = i.extrato_id AND e.cliente_id = p_cliente
     WHERE i.cliente_id = p_cliente AND i.desfeito_em IS NULL AND e.cancelado_em IS NULL AND e.status <> 'ignorado'
       AND i.lancamento_id IN (SELECT l.id FROM l)
     ORDER BY i.lancamento_id, e.data_movimento DESC, e.id
  ), fd AS (
    -- CONC-SUGESTOES-V2: os fornecedores do cliente de mesmo documento, ou (CNPJ) mesma raiz
    SELECT f.id
      FROM public.financeiro_fornecedores f
      CROSS JOIN LATERAL (SELECT regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g') dig) x
     WHERE v_doc IS NOT NULL AND f.cliente_id = p_cliente
       AND (x.dig = v_doc OR (length(v_doc) = 14 AND length(x.dig) = 14 AND left(x.dig, 8) = left(v_doc, 8)))
  ), c AS (
    SELECT l.*, b.banco, f.nome fornecedor,
           (v_banco AND length(v_t) >= 2 AND b.banco IS NOT NULL AND strpos(coalesce(public._fn_normalizar_texto(b.banco), ''), v_t) > 0) casa_banco,
           (v_desc AND length(v_t) >= 2 AND strpos(coalesce(public._fn_normalizar_texto(l.descricao), ''), v_t) > 0) casa_desc,
           ((v_forn AND length(v_t) >= 2 AND f.id IS NOT NULL AND strpos(coalesce(f.nome_norm, ''), v_t) > 0)
            OR l.favorecido_id IN (SELECT fd.id FROM fd)) casa_forn
      FROM l
      LEFT JOIN b ON b.lancamento_id = l.id
      LEFT JOIN public.financeiro_fornecedores f ON f.id = l.favorecido_id AND f.cliente_id = p_cliente
  ), a AS (
    SELECT * FROM c WHERE casa_banco OR casa_desc OR casa_forn
  ), top AS (
    SELECT a.* FROM a
     ORDER BY CASE WHEN p_valor IS NULL THEN 0 ELSE abs(a.va - p_valor) END, a.data_ref DESC NULLS LAST, a.id
     LIMIT 50
  ), r AS (
    -- a faixa amarela: o que COSTUMA ser e' o que foi pago (como antes do P153b)
    SELECT a.favorecido_id, a.fornecedor, count(*) n, min(a.data_pagamento) desde
      FROM a WHERE a.favorecido_id IS NOT NULL AND a.status_transacao IN ('realizado', 'conciliado')
     GROUP BY a.favorecido_id, a.fornecedor
     ORDER BY count(*) DESC, min(a.data_pagamento), a.favorecido_id
     LIMIT 1
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM a),
    'achados', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'lancamento_id', t.id, 'data_pagamento', t.data_pagamento, 'data_vencimento', t.data_vencimento,
               'data_competencia', t.data_competencia, 'status_transacao', t.status_transacao,
               'conciliado', EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci
                                      WHERE ci.lancamento_id = t.id AND ci.cliente_id = p_cliente AND ci.desfeito_em IS NULL),
               'banco', t.banco, 'descricao', t.descricao,
               'fornecedor_id', t.favorecido_id, 'fornecedor', t.fornecedor,
               'plano_conta_id', t.plano_conta_id, 'centro', p.centro_custo, 'subcentro', p.subcentro,
               'fazenda_id', t.fazenda_id, 'fazenda', fz.nome, 'fazenda_codigo', fz.codigo,
               'conta_bancaria_id', t.conta_id, 'conta', coalesce(cb.nome_exibicao, cb.nome_conta),
               'valor', t.va,
               'onde', to_jsonb(array_remove(ARRAY[CASE WHEN t.casa_banco THEN 'banco' END, CASE WHEN t.casa_desc THEN 'descricao' END,
                                                   CASE WHEN t.casa_forn THEN 'fornecedor' END], NULL)))
             ORDER BY CASE WHEN p_valor IS NULL THEN 0 ELSE abs(t.va - p_valor) END, t.data_ref DESC NULLS LAST, t.id)
        FROM top t
        LEFT JOIN public.financeiro_plano_contas p ON p.id = t.plano_conta_id
        LEFT JOIN public.fazendas fz ON fz.id = t.fazenda_id AND fz.cliente_id = p_cliente
        LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = t.conta_id AND cb.cliente_id = p_cliente), '[]'::jsonb),
    'resumo', (SELECT jsonb_build_object('fornecedor_id', r.favorecido_id, 'fornecedor', r.fornecedor, 'vezes', r.n, 'desde', r.desde) FROM r)
  ) INTO v;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_conciliacao_historico_buscar(uuid, text, text[], date, date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_historico_buscar(uuid, text, text[], date, date, numeric, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._fn_documento_do_texto(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_documento_do_texto(text) TO authenticated, service_role;
