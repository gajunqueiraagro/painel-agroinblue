-- CANCELAR UM MOVIMENTO DO EXTRATO — a porta que faltava para "esta linha nao deveria existir".
--
-- Aplicada no proto pelo arquiteto em 18/09/2026; esta migration e REGISTRO HISTORICO.
-- Copiada do pg_get_functiondef do proto e conferida lendo este arquivo:
--   corpo (prosrc):     md5 36c93cc5d1080bf88aa9fde43afc8b8a, len 2101
--   definicao completa: md5 b54119f0aa08fa46cae2b96c3abf7e86, len 2303
--
-- ⚠ CINCO LINHAS DE COMENTARIO INTERNO NAO CHEGARAM AO BANCO, e este arquivo foi CORRIGIDO para
-- bater com o que o proto tem — nao o contrario. O texto enviado tinha dois comentarios DENTRO do
-- corpo (antes da guarda do motivo e antes do INSERT de auditoria); a aplicacao os removeu, e o
-- `prosrc` do banco vem sem eles. Conferido linha a linha por md5: as outras 56 linhas do
-- pg_get_functiondef sao IDENTICAS — nenhuma mudanca de logica, literal, ERRCODE ou mensagem.
-- O que eles diziam fica aqui, no cabecalho, que nao entra no `prosrc`:
--   (a) o motivo e obrigatorio e fica gravado porque um cancelamento sem motivo nao pode ser
--       auditado depois;
--   (b) a auditoria e a mesma de `fn_invalidar_origem_extrato` — mesma tabela, mesmas colunas — e
--       o `payload_antes` guarda o que a linha ERA, que e o que permite reconstruir o extrato do
--       mes sem depender de a linha continuar la.
-- ⚠ E A LICAO E DO PROCESSO, nao do SQL: comentario dentro do corpo de uma funcao e' o unico
-- pedaco do arquivo que pode ser perdido em silencio no caminho ate o banco. A prova de que a
-- funcao aplicada e a que se escreveu e o md5 — e foi ele que pegou esta.
--
-- O BURACO QUE ELE FECHA, medido em 18/09/2026:
--   ignorar            "existe, mas nao quero conciliar"   -> fn_invalidar_origem_extrato    ✅
--   desfazer arquivo   "essa importacao inteira foi erro"  -> update em massa no front       ✅
--   cancelar movimento "essa linha nao deveria existir"    -> NENHUMA PORTA                  ❌
-- O unico ponto do src/ que escrevia `cancelado_em` era o desfazer por ARQUIVO
-- (useExtratoDaConta.ts), e ele nem grava `cancelado_por`. Uma duplicata de reimportacao — o
-- Itau reexportou um movimento da Vera Ligia com descricao E documento diferentes, e ele entrou
-- duas vezes — so podia ser resolvida por quem tem acesso ao banco.
--
-- ⚠ E A DOUTRINA JA ESTAVA ESCRITA, em useConciliacaoDoMes.ts: "cancelado e o movimento que NAO
-- EXISTE, ignorado e o que EXISTE e foi desconsiderado". Duplicata de reimportacao e o primeiro
-- caso, e por isso esta funcao NAO reusa o caminho do ignorar: sao dois fatos diferentes sobre o
-- mundo, e colapsa-los perderia a distincao que o schema faz de proposito.
--
-- ⚠ RECUSA COM VINCULO ATIVO, e a recusa e o ponto: cancelar um movimento conciliado apagaria um
-- vinculo em silencio. O desfazer por arquivo ja se recusa pela mesma razao (e diz "Desfaca os
-- vinculos antes"), e duas portas para o mesmo ato precisam recusar pelo mesmo motivo — senao a
-- que recusa vira a porta "quebrada" e o operador aprende a usar a outra.
--
-- ⚠ MENSAGEM EM PORTUGUES DE OPERADOR, E NAO SO O ERRCODE. As recusas desta funcao sao previstas
-- (conciliado, ja cancelado, motivo em branco) e a tela as MOSTRA — entao a mensagem tem de ser
-- legivel por quem esta conciliando, e dizer o que fazer ANTES. O ERRCODE fica para quem
-- investiga. ⚠ Isto diverge da irma `fn_invalidar_origem_extrato`, que devolve
-- `{ok:false, motivo:'...'}` sem RAISE; a divergencia e deliberada e o motivo e o uso: aquela e
-- chamada TAMBEM so para LISTAR derivados (sem motivo, sem gravar), entao um RAISE mataria o
-- caminho de leitura. Esta so tem um uso, e ele e' escrever.
--
-- NAO MEXE NO `status`: cancelado e ortogonal a ele, e e assim que o desfazer por arquivo ja
-- trata — a linha sai da vida por `cancelado_em IS NOT NULL`, que e o filtro que todas as
-- leituras da casa usam.

CREATE OR REPLACE FUNCTION public.fn_cancelar_movimento_extrato(p_extrato_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_ext    extrato_bancario_v2%ROWTYPE;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_n      int;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_admin_agroinblue(v_uid) OR v_ext.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente.' USING ERRCODE = '42501';
  END IF;

  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = '22023';
  END IF;

  IF v_ext.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este movimento ja foi cancelado em %.',
      to_char(v_ext.cancelado_em, 'DD/MM/YYYY') USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_n FROM conciliacao_bancaria_itens ci
   WHERE ci.extrato_id = p_extrato_id AND ci.desfeito_em IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Este movimento esta conciliado com % lancamento(s). Desfaca o vinculo antes de marca-lo como duplicado.',
      v_n USING ERRCODE = '55006';
  END IF;

  UPDATE extrato_bancario_v2
     SET cancelado_em = now(), cancelado_por = v_uid, cancelado_motivo = v_motivo
   WHERE id = p_extrato_id;

  INSERT INTO conciliacao_audit_log
    (acao, actor_user_id, cliente_id, extrato_id, importacao_id, ano_mes, motivo, payload_antes, payload_depois)
  VALUES
    ('movimento_cancelado', v_uid, v_ext.cliente_id, p_extrato_id, v_ext.importacao_id,
     to_char(v_ext.data_movimento, 'YYYY-MM'), v_motivo,
     jsonb_build_object('data_movimento', v_ext.data_movimento, 'valor', v_ext.valor,
       'descricao', v_ext.descricao, 'documento', v_ext.documento, 'status', v_ext.status,
       'conta_bancaria_id', v_ext.conta_bancaria_id),
     jsonb_build_object('cancelado_em', now(), 'cancelado_por', v_uid, 'cancelado_motivo', v_motivo));

  RETURN jsonb_build_object('ok', true, 'extrato_id', p_extrato_id,
    'ano_mes', to_char(v_ext.data_movimento, 'YYYY-MM'), 'motivo', v_motivo);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cancelar_movimento_extrato(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cancelar_movimento_extrato(uuid, text) TO authenticated;
