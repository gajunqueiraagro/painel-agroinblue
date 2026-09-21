-- AJUSTE FINO DO COMPROMISSO DE UMA CARGA: vencimento e conta, um lancamento por vez.
--
-- ⚠ PARA QUE SERVE, e o que ela deliberadamente NAO faz. Muda so' `data_vencimento` e a conta de
--   UM lancamento ja' gravado. Nao toca em valor (valor = R$/t x toneladas, e so' muda corrigindo
--   a carga), nao cria nem cancela lancamento, e NAO passa pela guarda do
--   `agri_carga_mandioca_corrigir` — porque nao reconstroi carga nenhuma. E' por isso que a aba
--   Financeiro pode ser interativa enquanto o salvar da carga segue travado.
--
-- ⚠ POR QUE UMA RPC NOVA E NAO A DA OC. `oc_alterar_parcela_programacao` (md5
--   f49a5e85a88e30ba4645b7cf0030e330, conferido no proto antes de escrever esta) faz exatamente
--   isto — mas exige `p_operacao_id`, trava `zoo_operacoes_comerciais` com FOR UPDATE, confere
--   `versao` e edita `zoo_operacao_parcelas_programacao`. A carga de mandioca nao tem operacao,
--   nao tem versao e nao tem parcela: o compromisso DELA e' o proprio lancamento, ligado por
--   `agri_colheita_lancamentos`. Copiou-se a GUARDA e o desenho de permissao, nao o corpo.
--
-- A GUARDA TEM TRES CONDICOES, na ordem em que aparecem no corpo:
--   (1) `conciliado_em IS NOT NULL`            — a que a OC testa primeiro;
--   (2) `status_transacao IN (realizado, conciliado, agendado)` — a segunda da OC;
--   (3) vinculo vivo em `conciliacao_bancaria_itens` (`desfeito_em IS NULL`).
-- ⚠ E A TERCEIRA E' A UNICA QUE HOJE FECHA A PORTA. Medido no proto em 21/09/2026: nos 96
--   compromissos vivos de mandioca, `conciliado_em` e' NULO EM TODOS — inclusive nos dois ja'
--   conciliados, com R$ 2.016,00 aplicados cada. Nesta familia quem registra a conciliacao e' o
--   VINCULO, nao aquela coluna. Copiar a guarda da OC literalmente deixaria as duas primeiras
--   condicoes como ramo morto e a alteracao passaria num compromisso conciliado.
--   As tres ficam: as da OC porque custam nada e a coluna pode voltar a ser preenchida.
--
-- ⚠ A CONTA VAI NA COLUNA DA DIRECAO: entrada (`tipo_operacao LIKE '1-%'`) grava em
--   `conta_destino_id`, saida em `conta_bancaria_id`, e o CASE preserva a coluna do outro lado em
--   vez de zera-la. Medido: das 96 linhas vivas, 21 (as vendas) usam destino e 73 usam origem. O
--   trigger `trg_00_conta_por_direcao` normalizaria de qualquer forma, mas depender dele seria
--   gravar errado contando com o conserto.
--
-- ⚠ O `EXISTS` SOBRE `agri_colheita_lancamentos` NAO E' DECORACAO: sem ele esta funcao seria um
--   editor generico de `financeiro_lancamentos_v2` com SECURITY DEFINER, alcancavel por qualquer
--   tela. E o `FOR UPDATE` trava a linha entre a checagem e o UPDATE, como a OC faz na parcela.
--
-- ⚠ `search_path = pg_catalog, public` — o padrao das tres irmas da familia
--   (registrar/corrigir/cancelar), e nao `public, pg_temp`. Com `public` na frente, quem consiga
--   criar um objeto ali passa a interceptar chamadas dentro de uma funcao SECURITY DEFINER, que
--   roda como o dono.
--
-- ⚠ O REVOKE/GRANT DO RODAPE NASCE COM A FUNCAO, e hoje isso ja' custou caro: em 21/09/2026 duas
--   funcoes desta familia foram recriadas sem eles e o Postgres devolveu EXECUTE a PUBLIC —
--   `anon` passou a alcancar gravadores financeiros SECURITY DEFINER. Conferido depois de aplicar:
--   anon_pode = false, authenticated = true, ACL {postgres, service_role, authenticated}.
--
-- Aplicada no proto pelo arquiteto em 21/09/2026, sob GO do Gabriel; esta migration e' REGISTRO
-- HISTORICO e NAO foi reaplicada ao ser escrita.
--   corpo VIGENTE (prosrc): md5 e137b3ab567e0aa53be83fdc910ca52f, len 2789
-- ⚠ O CORPO ENVIADO PARA APLICACAO TINHA 3028 CHARS: os QUATRO comentarios internos (o do EXISTS
--   e os tres que nomeavam as guardas) nao sobreviveram ao canal — 239 caracteres, conferidos um
--   a um. Nenhuma linha de CODIGO mudou; a diferenca foi provada por reconstrucao. E' a SEGUNDA
--   vez no mesmo dia que o canal come comentario (na primeira comeu tambem os `·` das descricoes,
--   ver 20261027123800). Por isso o que os comentarios diziam esta' escrito AQUI, no cabecalho:
--   aqui nada se perde no caminho.

CREATE OR REPLACE FUNCTION public.agri_compromisso_alterar_programacao(p_cliente_id uuid, p_lancamento_id uuid, p_vencimento date DEFAULT NULL::date, p_conta_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(),'') = 'service_role');
  v_is_admin boolean;
  v_tem_acesso boolean;
  v_lanc public.financeiro_lancamentos_v2;
  v_entrada boolean;
  v_vinculos int;
BEGIN
  v_is_admin := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  v_tem_acesso := (v_actor IS NOT NULL AND p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissao neste cliente' USING ERRCODE = '42501';
  END IF;

  IF p_vencimento IS NULL AND p_conta_id IS NULL THEN
    RAISE EXCEPTION 'Nada a alterar' USING ERRCODE = 'P0001';
  END IF;

  SELECT l.* INTO v_lanc
    FROM public.financeiro_lancamentos_v2 l
   WHERE l.id = p_lancamento_id
     AND l.cliente_id = p_cliente_id
     AND l.cancelado IS NOT TRUE
     AND EXISTS (SELECT 1 FROM public.agri_colheita_lancamentos cl
                  WHERE cl.lancamento_id = l.id AND cl.ativo)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compromisso % nao encontrado nesta carga', p_lancamento_id USING ERRCODE = 'P0002';
  END IF;

  IF v_lanc.conciliado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Compromisso conciliado em %; estorne a conciliacao para alterar',
      to_char(v_lanc.conciliado_em,'DD/MM/YYYY') USING ERRCODE = 'P0001';
  END IF;
  IF v_lanc.status_transacao IN ('realizado','conciliado','agendado') THEN
    RAISE EXCEPTION 'Compromisso % nao pode ser alterado; estorne o pagamento para mudar',
      v_lanc.status_transacao USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO v_vinculos FROM public.conciliacao_bancaria_itens ci
   WHERE ci.lancamento_id = p_lancamento_id AND ci.desfeito_em IS NULL;
  IF v_vinculos > 0 THEN
    RAISE EXCEPTION 'Compromisso ja conciliado no extrato; desfaca a conciliacao para alterar'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.financeiro_contas_bancarias cb
     WHERE cb.id = p_conta_id AND cb.cliente_id = p_cliente_id
  ) THEN
    RAISE EXCEPTION 'Conta bancaria nao pertence ao cliente' USING ERRCODE = 'P0001';
  END IF;

  v_entrada := (v_lanc.tipo_operacao LIKE '1-%');

  UPDATE public.financeiro_lancamentos_v2
     SET data_vencimento = COALESCE(p_vencimento, data_vencimento),
         conta_destino_id  = CASE WHEN v_entrada THEN COALESCE(p_conta_id, conta_destino_id)
                                  ELSE conta_destino_id END,
         conta_bancaria_id = CASE WHEN v_entrada THEN conta_bancaria_id
                                  ELSE COALESCE(p_conta_id, conta_bancaria_id) END,
         updated_at = now()
   WHERE id = p_lancamento_id;

  RETURN jsonb_build_object('ok', true, 'lancamento_id', p_lancamento_id);
END;
$function$;


REVOKE ALL ON FUNCTION public.agri_compromisso_alterar_programacao(uuid, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agri_compromisso_alterar_programacao(uuid, uuid, date, uuid) TO authenticated;
