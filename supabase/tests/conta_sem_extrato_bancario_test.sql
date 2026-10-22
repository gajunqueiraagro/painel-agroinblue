-- CONC-TRANSF-DUAS-PONTAS-01b — a marca "conta sem extrato bancario". TUDO DESFEITO (termina em RAISE; "OK" = passou).
-- Marca, so' dentro da transacao, as contas candidatas (sem extrato vivo; investimento/cartao/permuta ou dinheiro/caixa) e confere:
--   P1 as transferencias com uma ponta so' que diziam "falta o …" caem de 247 para 3 (o BB −180.000 de 23/04, a mao; Itau e Itau BBA,
--      contas com extrato mas sem extrato naquele mes) — numeros do proto em 22/10/2026
--   P2 nenhum vinculo muda
DO $$ DECLARE antes int; depois int; va bigint; vd bigint; BEGIN
  CREATE TEMP TABLE tt ON COMMIT DROP AS SELECT l.id FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id IN ('77d37bbf-a440-4fca-bf1a-eac60cf91bc4','f2d67cd4-24d0-456f-a079-a3281dcce7fd','a2d41cda-eb1e-4527-a6cf-a1b9663339e2')
     AND l.tipo_operacao LIKE '3-%' AND coalesce(l.cancelado,false)=false AND public._fn_conc_eh_transf(l.id)
     AND public._fn_conc_ligado_na_conta(l.id, l.conta_bancaria_id) <> public._fn_conc_ligado_na_conta(l.id, l.conta_destino_id);
  SELECT count(*) INTO antes FROM tt WHERE public._fn_conc_transf_pontas(id)->>'frase' LIKE '%falta o%';
  SELECT count(*) INTO va FROM conciliacao_bancaria_itens WHERE desfeito_em IS NULL;
  UPDATE financeiro_contas_bancarias cb SET sem_extrato_bancario = true
   WHERE left(cb.cliente_id::text,8) <> 'a1b2c3d4'
     AND NOT EXISTS (SELECT 1 FROM extrato_bancario_v2 e WHERE e.conta_bancaria_id = cb.id AND e.cancelado_em IS NULL)
     AND (cb.tipo_conta IN ('inv','cartao','permuta') OR coalesce(nullif(cb.nome_exibicao,''),cb.nome_conta) ~* '(dinheiro|caixa)');
  SELECT count(*) INTO depois FROM tt WHERE public._fn_conc_transf_pontas(id)->>'frase' LIKE '%falta o%';
  SELECT count(*) INTO vd FROM conciliacao_bancaria_itens WHERE desfeito_em IS NULL;
  IF depois > 3 OR depois >= antes THEN RAISE EXCEPTION 'P1 falhou: % -> %', antes, depois; END IF;
  IF va <> vd THEN RAISE EXCEPTION 'P2 falhou: vinculos % -> %', va, vd; END IF;
  RAISE EXCEPTION 'OK conta sem extrato: falta o … % -> %, vinculos iguais (%)', antes, depois, vd;
END $$;
