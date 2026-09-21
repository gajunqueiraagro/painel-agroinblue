-- GUARDA ANTI-DESTRUICAO no `corrigir` da carga de mandioca.
--
-- ⚠ NASCE DE PERDA DE DADO, medida no proto em 21/09/2026. A carga da NF 9287581 foi corrigida
--   pela tela e o resultado foi: 40,34 t viraram 12,15 t, SEIS lancamentos viraram UM, e
--   R$ 16.402,85 em frete, arranquio, carregamento, ICMS e Funrural desapareceram. Revertido no
--   mesmo dia. 20 das 21 cargas vivas corriam o mesmo risco.
--
-- A CAUSA NAO E' UM BUG PONTUAL, E' O DESENHO: `agri_carga_mandioca_corrigir` e'
-- `cancelar + registrar`. Ela APAGA a carga e a RECRIA com o que o formulario mandar. E o
-- formulario reaberto nao tem o que recriar — os servicos voltam em branco por decisao declarada
-- (o banco guarda o VALOR do servico, nao o preco por tonelada que o gerou) e a tela nunca leu
-- `icms` nem `funrural` de volta. Salvar uma carga reaberta apagava a diferenca, em silencio.
-- ⚠ E FUNDIA AS METADES: quando a nota foi dividida entre talhoes, `corrigir` recria SO' a
--   colheita que recebeu, e a chamada seguinte cancela as outras.
--
-- O PRINCIPIO QUE ESTA GUARDA ESCREVE: uma operacao que destroi para reconstruir so' pode rodar
-- quando repoe PELO MENOS o que destroi. Ela recusa ANTES de cancelar — devolve `ok:false` com o
-- motivo, sem ter tocado em nada — nos dois casos em que a carga encolheria:
--   (a) a NF tem mais de uma colheita ativa (metades). Corrigir apagaria as outras.
--   (b) o payload recriaria MENOS lancamentos do que a carga tem hoje. A conta do que VAI nascer
--       e' venda (sempre 1) + servicos com `preco_t > 0` + um por imposto com valor > 0
--       (icms, funrural, inss, icms_transporte); a do que EXISTE sao os elos ativos com
--       lancamento nao cancelado.
-- ⚠ E' UMA DESIGUALDADE, NAO UMA IGUALDADE: recriar MAIS e' legitimo (o operador acrescentou um
--   servico). So' encolher e' que recusa.
--
-- ⚠ A GUARDA SAI QUANDO O MODAL APRENDER A EDITAR A CARGA INTEIRA e a devolver servicos e
--   impostos preenchidos. Ela nao e' a regra final: e' contencao com prazo, e o proprio texto que
--   ela devolve ao operador diz isso ("ate a edicao de carga ficar pronta").
-- ⚠ E O FRONT TEM A SUA PROPRIA TRAVA (commit 89bb04f6, botao desabilitado + guarda no handler).
--   As duas convivem de proposito: a da tela avisa, esta impede. Quem chamar a RPC por fora da
--   tela — outro caminho, um script, um teste — esbarra nesta.
--
-- Aplicada no proto pelo arquiteto em 21/09/2026, sob GO do Gabriel, testada em BEGIN/ROLLBACK
-- contra a carga 9287581; esta migration e' REGISTRO HISTORICO e NAO foi reaplicada ao ser escrita.
--   corpo ANTES  (prosrc): md5 d31d6567ba8c3a71f43f875e70eda3fc, len 636
--   corpo VIGENTE(prosrc): md5 3e95399a50f89c0449a4b649276adea4, len 2567
--
-- ⚠ SEM DROP: a assinatura nao mudou (os mesmos 17 argumentos de 20261027123800), entao o
--   CREATE OR REPLACE substitui de verdade.

CREATE OR REPLACE FUNCTION public.agri_carga_mandioca_corrigir(p_colheita_id uuid, p_safra_area_id uuid, p_data date, p_industria_id uuid, p_nf text, p_ticket text, p_peso_bruto_kg numeric, p_desconto_kg numeric, p_rendimento_g integer, p_preco_g numeric, p_servicos jsonb, p_icms numeric, p_funrural numeric, p_observacao text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_inss numeric DEFAULT NULL::numeric, p_icms_transporte numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_cli uuid; v_r jsonb; v_nf text; v_tem_hoje int; v_vai_recriar int; v_metades int;
begin
  select cliente_id, nf_produtor into v_cli, v_nf from agri_colheita where id=p_colheita_id and ativo;
  if v_cli is null then raise exception 'carga nao encontrada'; end if;

  -- GUARDA ANTI-DESTRUICAO (21/09): corrigir e cancelar+registrar; se o formulario vier com MENOS
  -- do que a carga tem hoje, a diferenca seria APAGADA sem volta. Enquanto o modal nao edita a
  -- carga inteira com servicos/impostos preenchidos, RECUSAR quando a operacao encolheria a carga.
  -- (a) a NF nao pode ter mais de uma colheita ativa: corrigir so recria ESTA, apagando as outras metades.
  select count(*) into v_metades from agri_colheita where cliente_id=v_cli and nf_produtor=v_nf and ativo;
  if v_metades > 1 then
    return jsonb_build_object('ok', false, 'motivo',
      format('Esta carga tem %s partes (a nota foi dividida entre talhoes). Corrigir aqui apagaria as outras. Use o cadastro de carga nova ate a edicao de carga dividida ficar pronta.', v_metades));
  end if;
  -- (b) o formulario nao pode recriar MENOS lancamentos do que a carga tem hoje.
  select count(*) into v_tem_hoje
    from agri_colheita_lancamentos cl join financeiro_lancamentos_v2 l on l.id=cl.lancamento_id
    where cl.colheita_id=p_colheita_id and cl.ativo and coalesce(l.cancelado,false)=false;
  v_vai_recriar := 1  -- a venda, sempre
    + coalesce((select count(*) from jsonb_array_elements(coalesce(p_servicos,'[]'::jsonb)) s where coalesce((s->>'preco_t')::numeric,0) > 0),0)
    + (case when coalesce(p_icms,0) > 0 then 1 else 0 end)
    + (case when coalesce(p_funrural,0) > 0 then 1 else 0 end)
    + (case when coalesce(p_inss,0) > 0 then 1 else 0 end)
    + (case when coalesce(p_icms_transporte,0) > 0 then 1 else 0 end);
  if v_vai_recriar < v_tem_hoje then
    return jsonb_build_object('ok', false, 'motivo',
      format('Esta edicao apagaria %s lancamentos e recriaria so %s: os servicos e impostos nao vieram preenchidos. Use o cadastro de carga nova ate a edicao de carga ficar pronta.', v_tem_hoje, v_vai_recriar));
  end if;

  v_r := agri_carga_mandioca_cancelar(p_colheita_id, 'corrigida em '||now()::date);
  if not (v_r->>'ok')::boolean then return v_r; end if;
  return agri_carga_mandioca_registrar(v_cli, p_safra_area_id, p_data, p_industria_id, p_nf, p_ticket, p_peso_bruto_kg, p_desconto_kg, p_rendimento_g, p_preco_g, p_servicos, p_icms, p_funrural, p_observacao, p_conta_id, p_inss, p_icms_transporte) || jsonb_build_object('substitui', p_colheita_id);
end $function$;


-- ⚠ O REVOKE/GRANT NAO E' DECORACAO AQUI. Medido no proto em 21/09/2026, DEPOIS da aplicacao:
--   `agri_carga_mandioca_corrigir` e `agri_carga_mandioca_registrar` estavam com
--   `{=X/postgres,...}` — ou seja, EXECUTE para PUBLIC —, e `has_function_privilege('anon', ...)`
--   devolvia TRUE nas duas. As duas sao SECURITY DEFINER e gravam lancamento financeiro.
--   Elas NAO estavam assim antes: a ACL medida na vespera era {postgres, service_role,
--   authenticated}. O default do banco devolve EXECUTE a PUBLIC quando a funcao e' recriada sem
--   estes dois comandos, e foi o que aconteceu.
REVOKE ALL ON FUNCTION public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agri_carga_mandioca_corrigir(uuid, uuid, date, uuid, text, text, numeric, numeric, integer, numeric, jsonb, numeric, numeric, text, uuid, numeric, numeric) TO authenticated;
