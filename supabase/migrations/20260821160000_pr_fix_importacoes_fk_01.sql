-- 20260821160000_pr_fix_importacoes_fk_01.sql
-- PR-FIX-IMPORTACOES-FK-01 — restaura as FKs perdidas de financeiro_importacoes_v2.
--
-- CAUSA-RAIZ (FASE 0, proto 2026-08-21).
-- A migration de criacao 20260329150002 declara QUATRO foreign keys na tabela:
--     cliente_id        uuid NOT NULL REFERENCES clientes(id)                  ON DELETE CASCADE
--     fazenda_id        uuid NOT NULL REFERENCES fazendas(id)                  ON DELETE CASCADE
--     conta_bancaria_id uuid          REFERENCES financeiro_contas_bancarias(id)
--     created_by        uuid          REFERENCES auth.users(id)
-- No proto sobrou UMA — e nao e nenhuma das originais:
--     financeiro_importacoes_v2_conta_bancaria_id_fkey   PRESENTE
--     cliente_id / fazenda_id / created_by ............. AUSENTES
-- A sobrevivente foi acrescentada depois, pela 20260723100100 (PR-FIX-IMPORT-COLS). As
-- tres originais se perderam, provavelmente numa recriacao da tabela.
--
-- NAO FOI DECISAO. Nenhuma migration versionada faz DROP CONSTRAINT nesta tabela — o
-- unico arquivo com DROP CONSTRAINT que a menciona (20260522_pr0a_99_rollback.sql) so
-- derruba constraints de conciliacao_bancaria_itens e financeiro_lancamentos_v2.
-- E a FK e o padrao da casa: chuvas, fazenda_membros, fechamento_area_snapshot,
-- fechamento_pastos, financeiro_fechamentos, financeiro_fornecedores e
-- financeiro_lancamentos_v2 todas travam fazenda_id. Esta tabela e a excecao, e uma
-- excecao sem motivo registrado.
--
-- BLOQUEIA OUTRA MIGRATION. 20260821090000_pr_fix_ofx_import_id.sql (commit 78ed4a9f,
-- ainda nao aplicada) tem pre-check que exige exatamente 1 FK de fazenda_id para
-- fazendas, para provar que ela nao muda durante o DROP NOT NULL. A protecao esta
-- CERTA. O caminho e por o banco no estado que ela espera — relaxar o pre-check tiraria
-- dele justamente o que o torna confiavel.
--
-- INTEGRIDADE, medida nos 53 registros:
--     cliente_id .... 0 nulos, 0 orfaos   -> FK recriavel
--     fazenda_id .... 0 nulos, 0 orfaos   -> FK recriavel
--     created_by .... 23 ORFAOS           -> FK NAO recriavel
--
-- ON DELETE SET NULL EM fazenda_id, E NAO O CASCADE ORIGINAL.
-- Importacao e registro de AUDITORIA: apagar uma fazenda nao pode apagar o rastro de
-- que a importacao aconteceu. E o comportamento de financeiro_fechamentos, tabela irma
-- do mesmo dominio, e o mesmo raciocinio que levou extrato_bancario_v2.importacao_id a
-- SET NULL. O projeto NAO tem regra unica — fechamento_pastos usa CASCADE,
-- fechamento_area_snapshot e financeiro_fornecedores nao usam nada —, entao a escolha e
-- por dominio, e este e de auditoria.
--
-- cliente_id mantem CASCADE, como na criacao: importacao de cliente que deixou de
-- existir nao tem a quem pertencer, e o multi-tenant inteiro cascateia por cliente.
--
-- created_by NAO RECEBE FK — divergencia ACEITA em relacao a migration de criacao, e
-- nao pendencia. Os 23 orfaos sao importacoes feitas por usuarios que sairam. O
-- ADD CONSTRAINT falharia, e o registro deve continuar existindo: quem importou saiu da
-- empresa, a importacao nao deixou de ter acontecido.
--
-- NUNCA NOT VALID. Se aparecer orfao em cliente_id ou fazenda_id, esta migration ABORTA
-- e reporta a contagem. NOT VALID criaria uma trava que mente: ela existe no catalogo e
-- nao vale para o que ja esta la.
--
-- IDEMPOTENTE E REPLAYABLE. A migration NAO aborta quando a FK ja existe — ela CONVERGE.
-- Ausente -> cria. Presente e identica ao alvo -> no-op com NOTICE. Presente e DIFERENTE
-- -> DROP + ADD. O terceiro caso e o do AMBIENTE NOVO: montado a partir das migrations,
-- ele nasce com fazenda_id em ON DELETE CASCADE (a migration de criacao), e sem a
-- substituicao o banco novo e o proto divergiriam exatamente na regra de delete que e o
-- ponto deste PR. Abortar ali derrubaria a cadeia inteira de migrations.
-- A comparacao e por pg_get_constraintdef, nao por nome: o nome pode coincidir com
-- definicao diferente, e e a definicao que importa.
--
-- PRESSUPOE 20260821090000_pr_fix_ofx_import_id.sql APLICADA ANTES.
-- ON DELETE SET NULL numa coluna NOT NULL e CRIAVEL, mas inerte: ao apagar a fazenda o
-- Postgres tentaria gravar NULL e falharia por violacao de NOT NULL — o delete seria
-- barrado, e nao o rastro preservado. Quem solta o NOT NULL e a 20260821090000, que por
-- sua vez estava bloqueada por falta desta FK. Pelo nome de arquivo 090000 < 160000,
-- entao o replay ja roda na ordem certa. NAO ha pre-check exigindo a coluna nullable:
-- esta migration e valida nos dois estados, so rende a trava efetiva depois.
--
-- NENHUM DADO E ALTERADO. Nenhuma linha inserida, alterada ou apagada. A coluna
-- fazenda_id continua NOT NULL — quem a solta e a 20260821090000.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? As FKs existiam na migration de criacao; sumiram do banco.
--   (b) Reutilizar? Sim: restaura o contrato versionado, sem inventar estrutura.
--   (c) Fonte soberana? A migration de criacao 20260329150002.
--   (d) Segunda forma? Nao. Duas ADD CONSTRAINT, nada mais.
--   (e) Tela ou plataforma? Plataforma.
--   (f) Divida? Reduz: fecha o drift e desbloqueia a 20260821090000. Fica declarada a
--       divergencia de created_by.
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.


-- N.0 PRE-CHECKS FATAIS ------------------------------------------------------------------------
DO $$
DECLARE
  v_tipo_cli text; v_tipo_faz text;
  v_nome_cli text; v_def_cli text; v_nome_faz text; v_def_faz text;
  v_orf_cli bigint; v_orf_faz bigint; v_orf_cb bigint;
  v_total bigint;
BEGIN
  IF to_regclass('public.financeiro_importacoes_v2') IS NULL THEN
    RAISE EXCEPTION 'IMPORT-FK-01: tabela financeiro_importacoes_v2 inexistente';
  END IF;

  ----------------------------------------------------------------- colunas
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo_cli FROM pg_attribute a
   WHERE a.attrelid='public.financeiro_importacoes_v2'::regclass
     AND a.attname='cliente_id' AND a.attnum>0 AND NOT a.attisdropped;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo_faz FROM pg_attribute a
   WHERE a.attrelid='public.financeiro_importacoes_v2'::regclass
     AND a.attname='fazenda_id' AND a.attnum>0 AND NOT a.attisdropped;

  IF v_tipo_cli IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'IMPORT-FK-01: cliente_id e "%", esperado uuid', coalesce(v_tipo_cli,'(inexistente)');
  END IF;
  IF v_tipo_faz IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'IMPORT-FK-01: fazenda_id e "%", esperado uuid', coalesce(v_tipo_faz,'(inexistente)');
  END IF;

  ----------------------------------------------------------------- FK: INSPECIONA, nao aborta
  -- O estado de partida e informacao, nao impedimento: o N.1 converge a partir dele.
  SELECT c.conname, pg_get_constraintdef(c.oid) INTO v_nome_cli, v_def_cli
    FROM pg_constraint c
   WHERE c.conrelid='public.financeiro_importacoes_v2'::regclass AND c.contype='f'
     AND c.confrelid='public.clientes'::regclass
     AND (SELECT a.attnum FROM pg_attribute a
           WHERE a.attrelid=c.conrelid AND a.attname='cliente_id') = ANY (c.conkey);

  SELECT c.conname, pg_get_constraintdef(c.oid) INTO v_nome_faz, v_def_faz
    FROM pg_constraint c
   WHERE c.conrelid='public.financeiro_importacoes_v2'::regclass AND c.contype='f'
     AND c.confrelid='public.fazendas'::regclass
     AND (SELECT a.attnum FROM pg_attribute a
           WHERE a.attrelid=c.conrelid AND a.attname='fazenda_id') = ANY (c.conkey);

  RAISE NOTICE 'IMPORT-FK-01 estado de partida: cliente_id -> % ; fazenda_id -> %',
               coalesce(v_nome_cli||' = '||v_def_cli, '(AUSENTE)'),
               coalesce(v_nome_faz||' = '||v_def_faz, '(AUSENTE)');

  ----------------------------------------------------------------- orfaos
  EXECUTE 'SELECT count(*) FROM public.financeiro_importacoes_v2 i '
          'WHERE i.cliente_id IS NOT NULL AND NOT EXISTS '
          '(SELECT 1 FROM public.clientes c WHERE c.id = i.cliente_id)' INTO v_orf_cli;
  IF v_orf_cli > 0 THEN
    RAISE EXCEPTION 'IMPORT-FK-01: ABORTADO — % linha(s) com cliente_id orfao. '
                    'Decisao humana obrigatoria; NOT VALID nao e opcao.', v_orf_cli;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.financeiro_importacoes_v2 i '
          'WHERE i.fazenda_id IS NOT NULL AND NOT EXISTS '
          '(SELECT 1 FROM public.fazendas f WHERE f.id = i.fazenda_id)' INTO v_orf_faz;
  IF v_orf_faz > 0 THEN
    RAISE EXCEPTION 'IMPORT-FK-01: ABORTADO — % linha(s) com fazenda_id orfao. '
                    'Decisao humana obrigatoria; NOT VALID nao e opcao.', v_orf_faz;
  END IF;

  -- created_by: evidencia de por que essa FK NAO entra.
  EXECUTE 'SELECT count(*) FROM public.financeiro_importacoes_v2 i '
          'WHERE i.created_by IS NOT NULL AND NOT EXISTS '
          '(SELECT 1 FROM auth.users u WHERE u.id = i.created_by)' INTO v_orf_cb;

  EXECUTE 'SELECT count(*) FROM public.financeiro_importacoes_v2' INTO v_total;

  ------------------------------------------------- congela para o pos-check
  PERFORM set_config('app.ifk01_total', v_total::text, true);
  PERFORM set_config('app.ifk01_owner', (SELECT pg_get_userbyid(relowner) FROM pg_class
       WHERE oid='public.financeiro_importacoes_v2'::regclass), true);
  PERFORM set_config('app.ifk01_acl', (SELECT coalesce(relacl::text,'') FROM pg_class
       WHERE oid='public.financeiro_importacoes_v2'::regclass), true);
  PERFORM set_config('app.ifk01_idx', (SELECT coalesce(string_agg(indexdef, E'\n' ORDER BY indexname),'')
       FROM pg_indexes WHERE schemaname='public' AND tablename='financeiro_importacoes_v2'), true);
  PERFORM set_config('app.ifk01_pol', (SELECT coalesce(string_agg(polname, ',' ORDER BY polname),'')
       FROM pg_policy WHERE polrelid='public.financeiro_importacoes_v2'::regclass), true);
  PERFORM set_config('app.ifk01_cb', (SELECT coalesce(max(pg_get_constraintdef(oid)),'')
       FROM pg_constraint WHERE conrelid='public.financeiro_importacoes_v2'::regclass
         AND conname='financeiro_importacoes_v2_conta_bancaria_id_fkey'), true);

  RAISE NOTICE 'IMPORT-FK-01 pre-checks OK: % linha(s); cliente_id e fazenda_id uuid, 0 orfao em ambos; '
               'created_by tem % orfao(s) — por isso NAO recebe FK.', v_total, v_orf_cb;
END $$;


-- N.1 CONVERGENCIA CONDICIONAL IDEMPOTENTE --------------------------------------------------------
-- Tres caminhos por coluna: ausente -> cria; identica ao alvo -> no-op; diferente ->
-- DROP + ADD. O DROP usa o nome ENCONTRADO (pode nao ser o convencional) e o ADD grava o
-- nome que o proprio PostgreSQL geraria, <tabela>_<coluna>_fkey — a mesma convencao da FK
-- que sobreviveu, financeiro_importacoes_v2_conta_bancaria_id_fkey. Assim converge
-- tambem o NOME, nao so a regra de delete.
DO $$
DECLARE
  ALVO_CLI constant text := 'FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE';
  ALVO_FAZ constant text := 'FOREIGN KEY (fazenda_id) REFERENCES fazendas(id) ON DELETE SET NULL';
  v_nome text; v_def text;
BEGIN
  ----------------------------------------------------------------- cliente_id
  SELECT c.conname, pg_get_constraintdef(c.oid) INTO v_nome, v_def
    FROM pg_constraint c
   WHERE c.conrelid='public.financeiro_importacoes_v2'::regclass AND c.contype='f'
     AND c.confrelid='public.clientes'::regclass
     AND (SELECT a.attnum FROM pg_attribute a
           WHERE a.attrelid=c.conrelid AND a.attname='cliente_id') = ANY (c.conkey);

  IF v_nome IS NULL THEN
    ALTER TABLE public.financeiro_importacoes_v2
      ADD CONSTRAINT financeiro_importacoes_v2_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    RAISE NOTICE 'IMPORT-FK-01: cliente_id — FK AUSENTE, criada.';
  ELSIF v_def = ALVO_CLI THEN
    RAISE NOTICE 'IMPORT-FK-01: cliente_id — ja identica ao alvo (%). NO-OP.', v_nome;
  ELSE
    EXECUTE format('ALTER TABLE public.financeiro_importacoes_v2 DROP CONSTRAINT %I', v_nome);
    ALTER TABLE public.financeiro_importacoes_v2
      ADD CONSTRAINT financeiro_importacoes_v2_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
    RAISE NOTICE 'IMPORT-FK-01: cliente_id — SUBSTITUIDA. era "% = %", agora "%".',
                 v_nome, v_def, ALVO_CLI;
  END IF;

  ----------------------------------------------------------------- fazenda_id
  SELECT c.conname, pg_get_constraintdef(c.oid) INTO v_nome, v_def
    FROM pg_constraint c
   WHERE c.conrelid='public.financeiro_importacoes_v2'::regclass AND c.contype='f'
     AND c.confrelid='public.fazendas'::regclass
     AND (SELECT a.attnum FROM pg_attribute a
           WHERE a.attrelid=c.conrelid AND a.attname='fazenda_id') = ANY (c.conkey);

  IF v_nome IS NULL THEN
    ALTER TABLE public.financeiro_importacoes_v2
      ADD CONSTRAINT financeiro_importacoes_v2_fazenda_id_fkey
      FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE SET NULL;
    RAISE NOTICE 'IMPORT-FK-01: fazenda_id — FK AUSENTE, criada com ON DELETE SET NULL.';
  ELSIF v_def = ALVO_FAZ THEN
    RAISE NOTICE 'IMPORT-FK-01: fazenda_id — ja identica ao alvo (%). NO-OP.', v_nome;
  ELSE
    -- ESTE e o caso do ambiente novo: a migration de criacao a declara CASCADE, e e aqui
    -- que ele converge com o proto.
    EXECUTE format('ALTER TABLE public.financeiro_importacoes_v2 DROP CONSTRAINT %I', v_nome);
    ALTER TABLE public.financeiro_importacoes_v2
      ADD CONSTRAINT financeiro_importacoes_v2_fazenda_id_fkey
      FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE SET NULL;
    RAISE NOTICE 'IMPORT-FK-01: fazenda_id — SUBSTITUIDA. era "% = %", agora "%".',
                 v_nome, v_def, ALVO_FAZ;
  END IF;
END $$;


-- N.2 POS-CHECKS FATAIS --------------------------------------------------------------------------
DO $$
DECLARE
  v_def_cli text; v_def_faz text; v_def_cb text;
  v_owner text; v_acl text; v_idx text; v_pol text; v_total bigint;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def_cli FROM pg_constraint
   WHERE conrelid='public.financeiro_importacoes_v2'::regclass
     AND conname='financeiro_importacoes_v2_cliente_id_fkey' AND contype='f'
     AND confrelid='public.clientes'::regclass;
  IF v_def_cli IS NULL THEN
    RAISE EXCEPTION 'IMPORT-FK-01: pos-check FALHOU — FK de cliente_id nao existe';
  END IF;
  IF v_def_cli <> 'FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'IMPORT-FK-01: FK de cliente_id com definicao inesperada: %', v_def_cli;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def_faz FROM pg_constraint
   WHERE conrelid='public.financeiro_importacoes_v2'::regclass
     AND conname='financeiro_importacoes_v2_fazenda_id_fkey' AND contype='f'
     AND confrelid='public.fazendas'::regclass;
  IF v_def_faz IS NULL THEN
    RAISE EXCEPTION 'IMPORT-FK-01: pos-check FALHOU — FK de fazenda_id nao existe';
  END IF;
  IF v_def_faz <> 'FOREIGN KEY (fazenda_id) REFERENCES fazendas(id) ON DELETE SET NULL' THEN
    RAISE EXCEPTION 'IMPORT-FK-01: FK de fazenda_id com definicao inesperada (a regra de '
                    'delete e o ponto do PR): %', v_def_faz;
  END IF;

  ----------------------------------------------------------------- a que ja existia
  SELECT coalesce(pg_get_constraintdef(oid),'') INTO v_def_cb FROM pg_constraint
   WHERE conrelid='public.financeiro_importacoes_v2'::regclass
     AND conname='financeiro_importacoes_v2_conta_bancaria_id_fkey';
  IF coalesce(v_def_cb,'') IS DISTINCT FROM current_setting('app.ifk01_cb', true) THEN
    RAISE EXCEPTION 'IMPORT-FK-01: a FK de conta_bancaria_id mudou. antes="%", depois="%"',
                    current_setting('app.ifk01_cb', true), v_def_cb;
  END IF;

  ----------------------------------------------------------------- entorno intocado
  SELECT pg_get_userbyid(relowner), coalesce(relacl::text,'') INTO v_owner, v_acl
    FROM pg_class WHERE oid='public.financeiro_importacoes_v2'::regclass;
  IF v_owner IS DISTINCT FROM current_setting('app.ifk01_owner', true) THEN
    RAISE EXCEPTION 'IMPORT-FK-01: owner mudou (% -> %)', current_setting('app.ifk01_owner', true), v_owner;
  END IF;
  IF v_acl IS DISTINCT FROM current_setting('app.ifk01_acl', true) THEN
    RAISE EXCEPTION 'IMPORT-FK-01: ACL da tabela mudou';
  END IF;

  SELECT coalesce(string_agg(indexdef, E'\n' ORDER BY indexname),'') INTO v_idx
    FROM pg_indexes WHERE schemaname='public' AND tablename='financeiro_importacoes_v2';
  IF v_idx IS DISTINCT FROM current_setting('app.ifk01_idx', true) THEN
    RAISE EXCEPTION 'IMPORT-FK-01: conjunto de indices mudou';
  END IF;

  SELECT coalesce(string_agg(polname, ',' ORDER BY polname),'') INTO v_pol
    FROM pg_policy WHERE polrelid='public.financeiro_importacoes_v2'::regclass;
  IF v_pol IS DISTINCT FROM current_setting('app.ifk01_pol', true) THEN
    RAISE EXCEPTION 'IMPORT-FK-01: conjunto de policies mudou';
  END IF;

  EXECUTE 'SELECT count(*) FROM public.financeiro_importacoes_v2' INTO v_total;
  IF v_total::text IS DISTINCT FROM current_setting('app.ifk01_total', true) THEN
    RAISE EXCEPTION 'IMPORT-FK-01: volumetria mudou (% -> %). Esta migration nao escreve dado.',
                    current_setting('app.ifk01_total', true), v_total;
  END IF;

  RAISE NOTICE 'IMPORT-FK-01 pos-checks OK: 2 FKs criadas (cliente_id CASCADE, fazenda_id SET NULL); '
               'FK de conta_bancaria_id, owner, ACL, indices e policies inalterados; linhas=%.', v_total;
END $$;


-- N.3 CONTRATO EXPLICITO NAS CONSTRAINTS -----------------------------------------------------------
COMMENT ON CONSTRAINT financeiro_importacoes_v2_cliente_id_fkey ON public.financeiro_importacoes_v2 IS
  'Restaurada em 2026-08-21 (PR-FIX-IMPORTACOES-FK-01). Declarada na migration de criação 20260329150002 e ausente do banco desde alguma recriação da tabela — nenhuma migration versionada a removeu. CASCADE como na criação: importação de cliente que deixou de existir não tem a quem pertencer. A migration é idempotente: onde a FK já existir idêntica, é no-op.';

COMMENT ON CONSTRAINT financeiro_importacoes_v2_fazenda_id_fkey ON public.financeiro_importacoes_v2 IS
  'Restaurada em 2026-08-21 (PR-FIX-IMPORTACOES-FK-01). ON DELETE SET NULL, e NÃO o CASCADE da migration de criação: importação é registro de AUDITORIA, e apagar uma fazenda não pode apagar o rastro de que a importação aconteceu. Mesmo comportamento de financeiro_fechamentos, tabela irmã do domínio. Em ambiente novo, montado a partir das migrations, a FK nasce CASCADE e a migration a SUBSTITUI (DROP + ADD) — é assim que banco novo e proto convergem. Só surte efeito depois de 20260821090000, que solta o NOT NULL da coluna.';


-- ================================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Reverter devolve a tabela ao estado SEM TRAVA — importacao podendo apontar para cliente
-- ou fazenda inexistente — e volta a BLOQUEAR a 20260821090000, cujo pre-check exige
-- exatamente 1 FK de fazenda_id.
-- Nenhum dado e apagado: DROP CONSTRAINT nao toca linha. Reaplicar a migration depois do
-- rollback reconstroi as duas — ela e replayable.
-- ------------------------------------------------------------------------------------------------
-- ALTER TABLE public.financeiro_importacoes_v2
--   DROP CONSTRAINT IF EXISTS financeiro_importacoes_v2_fazenda_id_fkey;
-- ALTER TABLE public.financeiro_importacoes_v2
--   DROP CONSTRAINT IF EXISTS financeiro_importacoes_v2_cliente_id_fkey;
-- ================================================================================================
