-- PR-FIN-SAFRA-MODAL-01 — a safra da carga de mandioca e' a da AREA, e a mandioca do NJ volta a' 25/26-Lav
--
-- POR QUE (FASE 0 de 03/10)
-- O modal "Editar Lancamento" trocava a safra GRAVADA pela sugerida pela data (o conserto da tela e' do mesmo PR, em
-- ClassificacaoLancamento.tsx). Assim 19 lancamentos de mandioca do NJ ligados a cargas da 25/26-Lav foram para a
-- 26/27-Lav (21/09 e 30/09, salvos pelo modal) e 5 custos de mai-jun/2025 cairam de 25/26-Lav para 24/25-Lav (01/10, ao
-- trocar a cultura). E `agri_carga_mandioca_completar` COPIAVA a safra da VENDA da carga: com a venda da NF 9320690 ja'
-- em 26/27, os 3 papeis acrescentados em 01/10 (ICMS a Receber, ICMS Transporte, SENAR) nasceram em 26/27.
--
-- O QUE MUDA
-- D3. `agri_carga_mandioca_completar`: a safra dos lancamentos que ele cria e' a da CARGA (`agri_safra_area.safra_id`),
--     nunca a da venda. Conta e fazenda continuam as da venda. Patch guardado por md5 (as tres guardas do CLAUDE.md);
--     assinatura, SECURITY DEFINER, search_path e ACL inalterados (CREATE OR REPLACE preserva o proacl).
--       md5(prosrc) ANTES:  a88191a847c2e6a29c7cfe5dc62740f0  (6.243 chars)
--       md5(prosrc) DEPOIS: 73d7e24e5fadc3707342ae7c704a5e2e  (6.239 chars)
-- D4. Correcao de dado, so' `safra_id`, para 25/26-Lav (55d99920-add0-4091-b1a7-0b0ce3faaedb):
--     (a) 22 lancamentos de mandioca ligados (agri_colheita_lancamentos ativo) a carga cuja AREA e' 25/26-Lav e que estao
--         em outra safra — evidencia: a carga;
--     (b) 5 custos (c3fe4cb9, 0ef575ea, d1ada37d, 34f16818, 3deb8cdf) cuja ultima troca de safra no audit_log saiu de
--         25/26-Lav — evidencia: o audit_log. Os outros 2 da 24/25 (4b3c9636, c93b6582) NAO entram (aguardam decisao).
--     Estado anterior em `fin_safra_modal_01_backfill` (uma linha por lancamento, gesto contrario escrito).
--
-- GATILHOS QUE O UPDATE DISPARA (medidos em 03/10; nenhum muda outra coluna nestas linhas — provado pelo audit_log, que
-- grava OLD e NEW inteiros):
--   update_fin_lanc_v2_updated_at (updated_at = now(), esperado); resolve_classificacao_from_plano (safra_id mudou: reescreve
--   as copias do plano, iguais as gravadas, e confere o escopo da safra = agricultura); _fn_lancamento_cultura_fase_coerente
--   (escopo agricultura: mantem a cultura); materializar_dre_lcdpr_from_plano (sem reclassificacao: preserva compoe_dre);
--   mark_..._editado_manual (safra_id nao esta' na lista dele); fn_normalizar_conta_por_direcao (contas ja' normalizadas);
--   audit_trigger_financeiro_v2 (AFTER: uma linha 'editou' por lancamento, usuario = updated_by gravado).
-- MES FECHADO: nenhum dos 27 (financeiro_fechamentos, por fazenda e ano_mes, conferido antes de aplicar e de novo aqui).

-- ═══════════════════ D3 — agri_carga_mandioca_completar: a safra e' a da carga ═══════════════════
do $mig$
declare
  v_antes text; v_novo text; v_depois text;
  a1 text; b1 text; a2 text; b2 text;
  c_md5_antes  constant text := 'a88191a847c2e6a29c7cfe5dc62740f0';
  c_md5_depois constant text := '73d7e24e5fadc3707342ae7c704a5e2e';
begin
  select p.prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'agri_carga_mandioca_completar' and n.nspname = 'public';
  if md5(v_antes) <> c_md5_antes then
    raise exception 'agri_carga_mandioca_completar nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  end if;

  a1 := '  -- conta, safra e fazenda sao as da VENDA da carga (conta_efetiva_id resolve a direcao). ⚠ A SAFRA NAO E'' A DO TALHAO:' || chr(10)
     || '  -- a NF 9320690 teve os lancamentos movidos para a 26/27-Lav (editado_manual, 01/10) e o papel novo acompanha os irmaos' || chr(10)
     || '  -- dele — gravar na safra do talhao poria o custo do transporte num DRE e a venda noutro.' || chr(10);
  b1 := '  -- conta e fazenda sao as da VENDA da carga (conta_efetiva_id resolve a direcao). ⚠ A SAFRA E'' A DA CARGA (a da area,' || chr(10)
     || '  -- agri_safra_area) — PR-FIN-SAFRA-MODAL-01: a 26/27-Lav da NF 9320690 era o defeito do modal (a safra gravada trocada' || chr(10)
     || '  -- pela sugerida pela data), e copiar a da venda propagou o erro a 3 lancamentos novos. A venda nao decide a safra.' || chr(10);
  a2 := '  v_safra_lanc := coalesce(v_venda.safra_id, v_c.safra_id);';
  b2 := '  v_safra_lanc := v_c.safra_id;';

  if (length(v_antes) - length(replace(v_antes, a1, ''))) / length(a1) <> 1 then
    raise exception 'a ancora do comentario da safra nao casa exatamente 1x';
  end if;
  if (length(v_antes) - length(replace(v_antes, a2, ''))) / length(a2) <> 1 then
    raise exception 'a ancora de v_safra_lanc nao casa exatamente 1x';
  end if;
  -- o CONCEITO tambem: uma atribuicao de v_safra_lanc so' (nao so' a string que escrevi)
  if (length(v_antes) - length(replace(v_antes, 'v_safra_lanc :=', ''))) / length('v_safra_lanc :=') <> 1 then
    raise exception 'v_safra_lanc e'' atribuida mais de uma vez: a ancora nao cobre o caso';
  end if;

  v_novo := replace(replace(v_antes, a1, b1), a2, b2);

  execute 'CREATE OR REPLACE FUNCTION public.agri_carga_mandioca_completar(p_colheita_id uuid, p_papel text, p_valor numeric DEFAULT NULL::numeric, p_conta_id uuid DEFAULT NULL::uuid, p_rotulo text DEFAULT NULL::text, p_nfe text DEFAULT NULL::text)'
       || ' RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$' || v_novo || '$fn$';

  select p.prosrc into v_depois from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'agri_carga_mandioca_completar' and n.nspname = 'public';
  if md5(v_depois) <> c_md5_depois then
    raise exception 'corpo resultante inesperado (md5 %). Esperado %.', md5(v_depois), c_md5_depois;
  end if;
end $mig$;

-- ═══════════════════ D4 — a mandioca volta a' 25/26-Lav (estado anterior registrado) ═══════════════════
CREATE TABLE public.fin_safra_modal_01_backfill (
  id              bigserial PRIMARY KEY,
  lancamento_id   uuid NOT NULL UNIQUE,
  evidencia       text NOT NULL CHECK (evidencia IN ('carga', 'audit_log')),
  safra_anterior  uuid NOT NULL,
  safra_nova      uuid NOT NULL,
  gesto_contrario text NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fin_safra_modal_01_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fin_safra_modal_01_backfill FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.fin_safra_modal_01_backfill_id_seq FROM PUBLIC, anon, authenticated;

DO $backfill$
DECLARE
  c_alvo  constant uuid := '55d99920-add0-4091-b1a7-0b0ce3faaedb';   -- Safra 25/26 Lavoura (NJ)
  c_cinco constant uuid[] := ARRAY[
    'c3fe4cb9-0075-45e5-88bb-bbe01cf052da', '0ef575ea-66e8-4f1f-8b84-633e09cad876', 'd1ada37d-1df8-4528-bdc6-3e42b2ae9b8f',
    '34f16818-2838-4031-8aa4-f26a9ded208f', '3deb8cdf-5b07-47ff-b6a8-48a782c86aa5']::uuid[];
  v_n int;
BEGIN
  -- (a) pela CARGA: mandioca ligada a carga cuja area e' 25/26-Lav e que esta' em outra safra
  INSERT INTO public.fin_safra_modal_01_backfill (lancamento_id, evidencia, safra_anterior, safra_nova, gesto_contrario)
  SELECT DISTINCT l.id, 'carga', l.safra_id, c_alvo,
         format('UPDATE financeiro_lancamentos_v2 SET safra_id = %L WHERE id = %L;', l.safra_id, l.id)
    FROM agri_colheita_lancamentos cl
    JOIN agri_colheita c         ON c.id = cl.colheita_id
    JOIN agri_safra_area a       ON a.id = c.safra_area_id
    JOIN financeiro_lancamentos_v2 l ON l.id = cl.lancamento_id
   WHERE cl.ativo AND l.cancelado IS NOT TRUE AND l.cultura = 'mandioca'
     AND a.safra_id = c_alvo AND l.safra_id IS DISTINCT FROM a.safra_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 22 THEN
    RAISE EXCEPTION 'esperados 22 lancamentos de carga 25/26-Lav fora da safra, achados %. Remedir antes de aplicar.', v_n;
  END IF;

  -- (b) pelo AUDIT_LOG: os 5 custos cuja ultima troca de safra saiu de 25/26-Lav (e que seguem fora dela)
  INSERT INTO public.fin_safra_modal_01_backfill (lancamento_id, evidencia, safra_anterior, safra_nova, gesto_contrario)
  SELECT l.id, 'audit_log', l.safra_id, c_alvo,
         format('UPDATE financeiro_lancamentos_v2 SET safra_id = %L WHERE id = %L;', l.safra_id, l.id)
    FROM financeiro_lancamentos_v2 l
   WHERE l.id = ANY (c_cinco) AND l.cancelado IS NOT TRUE AND l.cultura = 'mandioca'
     AND l.safra_id IS DISTINCT FROM c_alvo
     AND (SELECT al.dados_anteriores->>'safra_id'
            FROM audit_log al
           WHERE al.registro_id = l.id
             AND (al.dados_anteriores->>'safra_id') IS DISTINCT FROM (al.dados_novos->>'safra_id')
           ORDER BY al.created_at DESC LIMIT 1) = c_alvo::text;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'esperados 5 lancamentos com 25/26-Lav como safra anterior no audit_log, achados %.', v_n;
  END IF;

  -- mes fechado: nenhum dos 27 pode estar num
  IF EXISTS (SELECT 1 FROM public.fin_safra_modal_01_backfill b
               JOIN financeiro_lancamentos_v2 l ON l.id = b.lancamento_id
               JOIN financeiro_fechamentos f ON f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
                                            AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION 'ha lancamento da correcao em mes fechado. Migration abortada.';
  END IF;

  UPDATE financeiro_lancamentos_v2 l SET safra_id = b.safra_nova
    FROM public.fin_safra_modal_01_backfill b
   WHERE b.lancamento_id = l.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 27 THEN
    RAISE EXCEPTION 'o UPDATE tocou % linhas, esperadas 27.', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_safra_modal_01_backfill b JOIN financeiro_lancamentos_v2 l ON l.id = b.lancamento_id
              WHERE l.safra_id IS DISTINCT FROM c_alvo) THEN
    RAISE EXCEPTION 'algum lancamento nao ficou na 25/26-Lav (gatilho reescreveu a safra?).';
  END IF;
END $backfill$;
