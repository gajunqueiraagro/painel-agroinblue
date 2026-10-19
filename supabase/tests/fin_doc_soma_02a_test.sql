-- FIN-DOC-SOMA-02a — a nota repetida separada pela origem, em `fin_documento_confronto`.
--   A duas linhas do MESMO caminho (lancamento com lancamento): `repetidas` tipo 'duplicada'
--   B a nota uma vez na OC e uma no lancamento: tipo 'oc_e_lancamento', conta uma vez
--   C o MESMO registro visto duas vezes pela view (vinculo para o proprio dono): nao e' repetido, conta uma vez
-- Sintetico no cliente Teste; termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_plano uuid; v_fin uuid; l1 uuid; l2 uuid; l3 uuid; oc1 uuid; dd uuid; r jsonb;
BEGIN
  select id into v_faz from fazendas where cliente_id = k order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas' and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', k, 'fazenda_id', v_faz, 'descricao', 'SINT doc-soma 02a', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'data_competencia', '2031-01-10', 'intervalo_meses', 1, 'valor_total', 300, 'total_parcelas', 3, 'data_primeira_parcela', '2031-02-10'));
  select lancamento_id into l1 from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 1;
  select lancamento_id into l2 from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 2;
  select lancamento_id into l3 from financiamento_parcelas where financiamento_id = v_fin and numero_parcela = 3;

  -- B: a NF da OC (100) e a copia dela no lancamento
  insert into zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao) values (k, 'abate', '2031-04-01') returning id into oc1;
  insert into zoo_operacao_partes (cliente_id, operacao_id, natureza, valor, financeiro_lancamento_id) values (k, oc1, 'principal', 100, l1);
  insert into zoo_operacao_documentos (cliente_id, operacao_id, nome, especie, numero) values (k, oc1, 'nf oc', 'nf_principal', '000.008.017') returning id into dd;
  insert into zoo_operacao_documento_componentes (cliente_id, operacao_id, documento_id, tipo, natureza, valor, ordem) values (k, oc1, dd, 'outros', 'acrescimo', 100, 1);
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento) values (k, l1, 'nf lanc', 'nf', '8017', 100);
  r := fin_documento_confronto(l1, k);
  if r->'repetidas' is distinct from '[{"numero": "8017", "vezes": 2, "tipo": "oc_e_lancamento"}]'::jsonb then raise exception 'B repetidas: %', r->'repetidas'; end if;
  if (r->>'valor_documentado')::numeric <> 100 or (r->'fiscal'->>'qtd')::int <> 1 then raise exception 'B conta uma vez: %', r; end if;

  -- C: o MESMO registro visto duas vezes pela view. HOJE NAO HA' COMO ACONTECER: a OC tem so' uma parte viva por lancamento
  --    (`zoo_operacao_partes_titulo_uniq`) e o vinculo nao aponta para o dono (`fin_doc_vinc_nao_e_o_dono`). A defesa do confronto se
  --    prova tirando essa trava SO' NESTA TRANSACAO (desfeita pelo RAISE do fim) e montando o vinculo para o proprio dono.
  ALTER TABLE public.financeiro_documento_vinculos DROP CONSTRAINT fin_doc_vinc_nao_e_o_dono;
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento) values (k, l2, 'nf', 'nf', '9001', 100) returning id into dd;
  insert into financeiro_documento_vinculos (documento_id, documento_lancamento_id, lancamento_id, cliente_id) values (dd, l2, l2, k);
  if (select count(*) from vw_lancamento_documentos where lancamento_id = l2 and documento_id = dd) <> 2 then raise exception 'C montagem: a view nao mostra o registro duas vezes'; end if;
  r := fin_documento_confronto(l2, k);
  if jsonb_array_length(r->'repetidas') <> 0 or (r->>'docs_ativos')::int <> 1 then raise exception 'C: %', r; end if;

  -- A: a mesma nota registrada duas vezes no lancamento
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero, valor_documento)
    values (k, l3, 'nf', 'nf', '1234', 100), (k, l3, 'nf de novo', 'nf', '000.001.234', 100);
  r := fin_documento_confronto(l3, k);
  if r->'repetidas' is distinct from '[{"numero": "1234", "vezes": 2, "tipo": "duplicada"}]'::jsonb then raise exception 'A repetidas: %', r->'repetidas'; end if;
  if (r->>'valor_documentado')::numeric <> 100 then raise exception 'A conta uma vez: %', r; end if;

  RAISE EXCEPTION 'OK';
END $t$;
