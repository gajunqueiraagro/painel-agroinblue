-- DOC-NOTA-XML-PDF-01 — a MESMA nota em dois arquivos (PDF e XML) e' UMA nota em `fin_documento_confronto`.
--   T1 PDF + XML da mesma nota (a mesma chave, no PDF com espacos; serie so' no XML; numero com e sem pontos): NAO e' repetida, conta uma vez
--   T2 dois PDFs da mesma nota: segue 'duplicada'
--   T3 PDF + XML com CHAVES diferentes (mesmo numero e CNPJ): segue 'duplicada' (nao sao os arquivos da mesma nota)
--   T4 PDF + XML + outro PDF: segue 'duplicada'
--   T5 PDF + XML de SERIES diferentes: segue 'duplicada'
-- Sintetico no cliente Teste; termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ch constant text := '50311011222333000181550020000012341123456789';
  ch2 constant text := '50311011222333000181550020000012341987654321';
  v_faz uuid; v_plano uuid; v_fin uuid; l uuid[]; r jsonb; i int;
BEGIN
  if length(ch) <> 44 or length(ch2) <> 44 then raise exception 'fixture: chave sem 44 digitos'; end if;
  select id into v_faz from fazendas where cliente_id = k order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas' and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', k, 'fazenda_id', v_faz, 'descricao', 'SINT doc-nota-xml-pdf', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'data_competencia', '2031-01-10', 'intervalo_meses', 1, 'valor_total', 500, 'total_parcelas', 5, 'data_primeira_parcela', '2031-02-10'));
  select array_agg(lancamento_id order by numero_parcela) into l from financiamento_parcelas where financiamento_id = v_fin;

  -- T1
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, tipo, especie, numero, serie, chave_acesso, emitente_documento, valor_documento) values
    (k, l[1], 'NF 1234.pdf', 'application/pdf', 'nf', '1234', null, '5031 1011 2223 3300 0181 5500 2000 0012 3411 2345 6789', '11.222.333/0001-81', 100),
    (k, l[1], 'NFe1234.xml', 'text/xml', 'nf', '000.001.234', '2', ch, '11222333000181', 100);
  r := fin_documento_confronto(l[1], k);
  if jsonb_array_length(r->'repetidas') <> 0 then raise exception 'T1 PDF+XML nao e repetida: %', r->'repetidas'; end if;
  if (r->>'valor_documentado')::numeric <> 100 or (r->'fiscal'->>'qtd')::int <> 1 then raise exception 'T1 conta uma vez: %', r; end if;

  -- T2
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, tipo, especie, numero, chave_acesso, valor_documento) values
    (k, l[2], 'NF 1234.pdf', 'application/pdf', 'nf', '1234', ch, 100), (k, l[2], 'NF 1234 copia.pdf', 'application/pdf', 'nf', '1234', ch, 100);
  r := fin_documento_confronto(l[2], k);
  if r->'repetidas' is distinct from '[{"numero": "1234", "vezes": 2, "tipo": "duplicada"}]'::jsonb then raise exception 'T2: %', r->'repetidas'; end if;

  -- T3
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, tipo, especie, numero, chave_acesso, emitente_documento, valor_documento) values
    (k, l[3], 'NF 1234.pdf', 'application/pdf', 'nf', '1234', ch, '11222333000181', 100), (k, l[3], 'NFe1234.xml', 'text/xml', 'nf', '1234', ch2, '11222333000181', 100);
  r := fin_documento_confronto(l[3], k);
  if r->'repetidas' is distinct from '[{"numero": "1234", "vezes": 2, "tipo": "duplicada"}]'::jsonb then raise exception 'T3: %', r->'repetidas'; end if;

  -- T4
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, tipo, especie, numero, chave_acesso, valor_documento) values
    (k, l[4], 'NF 1234.pdf', 'application/pdf', 'nf', '1234', ch, 100), (k, l[4], 'NFe1234.xml', 'text/xml', 'nf', '1234', ch, 100),
    (k, l[4], 'NF 1234 outra.pdf', 'application/pdf', 'nf', '1234', ch, 100);
  r := fin_documento_confronto(l[4], k);
  if r->'repetidas' is distinct from '[{"numero": "1234", "vezes": 3, "tipo": "duplicada"}]'::jsonb then raise exception 'T4: %', r->'repetidas'; end if;

  -- T5
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, tipo, especie, numero, serie, emitente_documento, valor_documento) values
    (k, l[5], 'NF 1234.pdf', 'application/pdf', 'nf', '1234', '1', '11222333000181', 100), (k, l[5], 'NFe1234.xml', 'text/xml', 'nf', '1234', '2', '11222333000181', 100);
  r := fin_documento_confronto(l[5], k);
  if r->'repetidas' is distinct from '[{"numero": "1234", "vezes": 2, "tipo": "duplicada"}]'::jsonb then raise exception 'T5: %', r->'repetidas'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
