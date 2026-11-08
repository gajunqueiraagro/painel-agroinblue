-- PASTO-FICHA-01 · posse com "de quem" e o período (Gabriel 08/11 09:36: "POSSE próprio/arrendado com de quem + início/fim").
-- `pastos` ganha:
--   posse_contraparte_id → financeiro_fornecedores (de quem é arrendado / a quem é cedido; o cadastro de fornecedores é o único, P: um seletor só)
--   posse_desde, posse_ate → o mês (dia 1) do começo e do fim da posse; o fim nunca antes do começo
-- Os três só existem com posse arrendada/cedida: na posse própria (ou sem posse) a ficha os LIMPA.
-- Gravam SÓ pela ficha, como os outros campos dela: a trava (`_fn_pastos_ficha_so_pelo_escritor`) passa a olhar os três; o
-- `_fn_pasto_ficha_aplicar` aceita e confere (o fornecedor tem de ser do cliente do pasto); a prévia (`_fn_pasto_ficha_diferencas`) mostra o
-- NOME do fornecedor; o `fn_pasto_ficha_salvar` e o `fn_pasto_criar` gravam os três. A leitura (`fn_pasto_ficha`) já devolve a linha inteira.
-- Cada função é REMENDADA pela âncora (casa 1x) sobre o corpo de chegada conferido por md5; diferente → nada aplicado. As grants ficam.
SET LOCAL lock_timeout = '2s';

ALTER TABLE public.pastos
  ADD COLUMN posse_contraparte_id uuid REFERENCES public.financeiro_fornecedores(id),
  ADD COLUMN posse_desde date,
  ADD COLUMN posse_ate date,
  ADD CONSTRAINT pastos_posse_desde_mes_chk CHECK (posse_desde IS NULL OR posse_desde = date_trunc('month', posse_desde)::date),
  ADD CONSTRAINT pastos_posse_ate_mes_chk CHECK (posse_ate IS NULL OR posse_ate = date_trunc('month', posse_ate)::date),
  ADD CONSTRAINT pastos_posse_periodo_chk CHECK (posse_desde IS NULL OR posse_ate IS NULL OR posse_ate >= posse_desde);
COMMENT ON COLUMN public.pastos.posse_contraparte_id IS 'PASTO-FICHA-01: de quem o pasto é arrendado / a quem é cedido (fornecedor do cliente). Só com posse arrendada/cedida; muda só pela ficha.';
COMMENT ON COLUMN public.pastos.posse_desde IS 'PASTO-FICHA-01: mês (dia 1) do começo da posse arrendada/cedida. Muda só pela ficha.';
COMMENT ON COLUMN public.pastos.posse_ate IS 'PASTO-FICHA-01: mês (dia 1) do fim da posse arrendada/cedida (nulo = em aberto). Muda só pela ficha.';

CREATE FUNCTION pg_temp.troca(d text, de text, para text, rotulo text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(d) - length(replace(d, de, ''))) / length(de) <> 1 THEN
    RAISE EXCEPTION 'PASTO-FICHA-01 (117245): a âncora % não casa 1x — nada aplicado', rotulo;
  END IF;
  RETURN replace(d, de, para);
END $f$;

-- 1 · a trava: os três campos novos também só mudam pela ficha
DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public._fn_pastos_ficha_so_pelo_escritor()'::regprocedure);
  IF md5(d) <> '17a6e7aded168f488b7c24103f64b344' THEN RAISE EXCEPTION 'PASTO-FICHA-01 (117245): a trava mudou desde a leitura — nada aplicado'; END IF;
  d := pg_temp.troca(d, $a$or new.manejo is not null or new.sistema_id is not null$a$,
                        $b$or new.manejo is not null or new.sistema_id is not null
       or new.posse_contraparte_id is not null or new.posse_desde is not null or new.posse_ate is not null$b$, 'T1');
  d := pg_temp.troca(d, $a$new.drenagem_id, new.sombra_id, new.sombra_cobertura, new.manejo, new.sistema_id, new.ficha_versao)$a$,
                        $b$new.drenagem_id, new.sombra_id, new.sombra_cobertura, new.manejo, new.sistema_id, new.posse_contraparte_id, new.posse_desde,
         new.posse_ate, new.ficha_versao)$b$, 'T2');
  d := pg_temp.troca(d, $a$old.drenagem_id, old.sombra_id, old.sombra_cobertura, old.manejo, old.sistema_id, old.ficha_versao)$a$,
                        $b$old.drenagem_id, old.sombra_id, old.sombra_cobertura, old.manejo, old.sistema_id, old.posse_contraparte_id, old.posse_desde,
         old.posse_ate, old.ficha_versao)$b$, 'T3');
  EXECUTE d;
END $p$;

-- 2 · a prévia: os três campos, e o NOME do fornecedor (nunca o id na tela)
DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public._fn_pasto_ficha_diferencas(public.pastos,public.pastos)'::regprocedure);
  IF md5(d) <> 'a9fbd1a7b394de5f54999421b4b5521b' THEN RAISE EXCEPTION 'PASTO-FICHA-01 (117245): as diferenças mudaram desde a leitura — nada aplicado'; END IF;
  d := pg_temp.troca(d, $a$'antes_nome', (select i.nome from public.catalogo_itens i where c.item and i.id = (to_jsonb(a)->>c.campo)::uuid),$a$,
                        $b$'antes_nome', coalesce((select i.nome from public.catalogo_itens i where c.item and i.id = (to_jsonb(a)->>c.campo)::uuid),
                                 (select f.nome from public.financeiro_fornecedores f where c.campo = 'posse_contraparte_id' and f.id = (to_jsonb(a)->>c.campo)::uuid)),$b$, 'D1');
  d := pg_temp.troca(d, $a$'depois_nome', (select i.nome from public.catalogo_itens i where c.item and i.id = (to_jsonb(b)->>c.campo)::uuid))$a$,
                        $b$'depois_nome', coalesce((select i.nome from public.catalogo_itens i where c.item and i.id = (to_jsonb(b)->>c.campo)::uuid),
                                  (select f.nome from public.financeiro_fornecedores f where c.campo = 'posse_contraparte_id' and f.id = (to_jsonb(b)->>c.campo)::uuid)))$b$, 'D2');
  d := pg_temp.troca(d, $a$('sistema_id', true, 16)) c(campo, item, ordem)$a$,
                        $b$('sistema_id', true, 16), ('posse_contraparte_id', false, 17), ('posse_desde', false, 18),
                 ('posse_ate', false, 19)) c(campo, item, ordem)$b$, 'D3');
  EXECUTE d;
END $p$;

-- 3 · aplicar: aceita e confere os três
DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public._fn_pasto_ficha_aplicar(public.pastos,jsonb)'::regprocedure);
  IF md5(d) <> '98aa79df517623e466065e217f461482' THEN RAISE EXCEPTION 'PASTO-FICHA-01 (117245): o aplicar mudou desde a leitura — nada aplicado'; END IF;
  d := pg_temp.troca(d, $a$'sombra_cobertura', 'manejo', 'sistema_id'];$a$,
                        $b$'sombra_cobertura', 'manejo', 'sistema_id', 'posse_contraparte_id', 'posse_desde', 'posse_ate'];$b$, 'A1');
  d := pg_temp.troca(d, $a$  if p_campos ? 'forrageira_principal_id' then$a$,
                        $b$  -- PASTO-FICHA-01 (117245): de quem e o período da posse; só com posse arrendada/cedida (na própria, limpa)
  if p_campos ? 'posse_contraparte_id' then n.posse_contraparte_id := nullif(p_campos->>'posse_contraparte_id', '')::uuid; end if;
  if p_campos ? 'posse_desde' then n.posse_desde := public._fn_pasto_ficha_mes(p_campos->>'posse_desde', 'Posse desde'); end if;
  if p_campos ? 'posse_ate' then n.posse_ate := public._fn_pasto_ficha_mes(p_campos->>'posse_ate', 'Posse até'); end if;
  if n.posse is distinct from 'arrendada_de_terceiro' and n.posse is distinct from 'cedida_a_terceiro' then
    n.posse_contraparte_id := null; n.posse_desde := null; n.posse_ate := null;
  end if;
  if n.posse_contraparte_id is not null and not exists (select 1 from public.financeiro_fornecedores f
                                                        where f.id = n.posse_contraparte_id and f.cliente_id = n.cliente_id) then
    raise exception using errcode = 'P0001', message = 'Posse: quem você escolheu não está no cadastro deste cliente. Escolha de novo.';
  end if;
  if n.posse_desde is not null and n.posse_ate is not null and n.posse_ate < n.posse_desde then
    raise exception using errcode = 'P0001', message = 'Posse: o "até" não pode ser antes do "desde".';
  end if;
  if p_campos ? 'forrageira_principal_id' then$b$, 'A2');
  EXECUTE d;
END $p$;

-- 4 · salvar: grava os três
DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.fn_pasto_ficha_salvar(uuid,integer,jsonb,text,boolean)'::regprocedure);
  IF md5(d) <> 'd27280f5734fe41331c377b6852faa51' THEN RAISE EXCEPTION 'PASTO-FICHA-01 (117245): o salvar mudou desde a leitura — nada aplicado'; END IF;
  d := pg_temp.troca(d, $a$sombra_id = n.sombra_id, sombra_cobertura = n.sombra_cobertura, manejo = n.manejo, sistema_id = n.sistema_id,$a$,
                        $b$sombra_id = n.sombra_id, sombra_cobertura = n.sombra_cobertura, manejo = n.manejo, sistema_id = n.sistema_id,
    posse_contraparte_id = n.posse_contraparte_id, posse_desde = n.posse_desde, posse_ate = n.posse_ate,$b$, 'S1');
  EXECUTE d;
END $p$;

-- 5 · criar: grava os três
DO $p$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.fn_pasto_criar(uuid,jsonb,numeric,boolean)'::regprocedure);
  IF md5(d) <> 'd18781156c3b751d826bf25d6e3bdc0b' THEN RAISE EXCEPTION 'PASTO-FICHA-01 (117245): o criar mudou desde a leitura — nada aplicado'; END IF;
  d := pg_temp.troca(d, $a$drenagem_id, sombra_id, sombra_cobertura, manejo, sistema_id, ficha_versao)$a$,
                        $b$drenagem_id, sombra_id, sombra_cobertura, manejo, sistema_id, posse_contraparte_id, posse_desde, posse_ate, ficha_versao)$b$, 'C1');
  d := pg_temp.troca(d, $a$n.drenagem_id, n.sombra_id, n.sombra_cobertura, n.manejo, n.sistema_id, 1)$a$,
                        $b$n.drenagem_id, n.sombra_id, n.sombra_cobertura, n.manejo, n.sistema_id, n.posse_contraparte_id, n.posse_desde, n.posse_ate, 1)$b$, 'C2');
  EXECUTE d;
END $p$;
