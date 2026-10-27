-- P118 (depois da 20261028112410) — descricao em caixa alta vira primeira maiuscula. Termina em RAISE 'OK'. Transacao revertida.
--   C1 a regra (exemplos do Gabriel e os da FASE 0): siglas, unidades, palavra com numero, conectivos no meio, a ultima palavra
--   C2 so' o TODO em caixa alta: todo minusculo e caixa mista ficam como estao (o fornecedor segue convertendo o todo minusculo)
--   C3 lancamento criado em caixa alta grava convertido; editar OUTRO campo nao reescreve a descricao; editar a descricao converte
--   C4 item da nota criado em caixa alta grava convertido
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';
DO $teste$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_molde jsonb; v_novo uuid := gen_random_uuid(); v_cols text; v_d text; v_nota uuid; v_item jsonb; v_icols text;
  par text[];
begin
  -- C1
  foreach par slice 1 in array array[
    ['LONTAL POUR ON FR 1 L', 'Lontal Pour On FR 1 L'],
    ['TINTA MARFIX FR 200 ML', 'Tinta Marfix FR 200 ML'],
    ['VAC. POLICLOSTRIGEN 25 DS FR 125 ML', 'Vac. Policlostrigen 25 DS FR 125 ML'],
    ['IRRF - 3M', 'IRRF - 3M'], ['INSS - 3M', 'INSS - 3M'], ['CCIR - 3M', 'CCIR - 3M'], ['FGTS - 13', 'FGTS - 13'],
    ['NF 532.390 · WD40 TRADICIONAL A AEROSOL 912069 300ML C12', 'NF 532.390 · WD40 Tradicional a Aerosol 912069 300ML C12'],
    ['SAL MINERAL COM UREIA PARA BOVINOS', 'Sal Mineral com Ureia para Bovinos'],
    ['VITAMINA A', 'Vitamina A'], ['DIESEL B S10', 'Diesel B S10'],
    ['PIX IATF UN HA KM GL CX SC PC LT KG MG G M M2 M3 UF ICMS NFE DARF GTA ITR CNH CDI IOF', 'PIX IATF UN HA KM GL CX SC PC LT KG MG G M M2 M3 UF ICMS NFE DARF GTA ITR CNH CDI IOF'],
    ['KIT PORTA 1,60 X 2,10 2 FOLHAS PRETO', 'Kit Porta 1,60 X 2,10 2 Folhas Preto'],
    ['FGTS/GRF - SM', 'FGTS/GRF - SM'], ['INSS/FGTS-3M', 'INSS/FGTS-3M'], ['IPVA FIT/STRADA 2026', 'IPVA Fit/Strada 2026'],
    ['PAGAMENTO PIX-PIX_DEB 02021814000138 FAMA', 'Pagamento PIX-PIX_Deb 02021814000138 Fama'], ['AGROPECUARIA S/A COMERCIO', 'Agropecuaria S/A Comercio'],
    ['INTEGR.CAPITAL SOCIAL', 'Integr.Capital Social'], ['IPTU 2026 FAZENDA', 'IPTU 2026 Fazenda'], ['DAEMS IRPJ IRPF FCO', 'DAEMS IRPJ IRPF FCO'],
    ['COMERCIAL S.A.', 'Comercial S.A.'], ['LIZ INTER. 1TS + TOM.', 'Liz Inter. 1TS + Tom.'], ['BOMBA ELEVATORIA DE', 'Bomba Elevatoria De']]
  loop
    v_d := public._fn_descricao_caixa(par[1]);
    if v_d is distinct from par[2] then raise exception 'C1 "%" -> "%" (esperado "%")', par[1], v_d, par[2]; end if;
  end loop;
  -- C2
  if public._fn_descricao_caixa('sal mineral do lote') <> 'sal mineral do lote' then raise exception 'C2 minusculo'; end if;
  if public._fn_descricao_caixa('Sal MINERAL') <> 'Sal MINERAL' then raise exception 'C2 misto'; end if;
  if public._fn_nome_caixa('agropecuaria boa vista ltda') <> 'Agropecuaria Boa Vista Ltda' then raise exception 'C2 fornecedor: %', public._fn_nome_caixa('agropecuaria boa vista ltda'); end if;

  -- C3
  select to_jsonb(l) into v_molde from public.financeiro_lancamentos_v2 l
   where l.cliente_id = c_nj and l.cancelado is not true and l.recorrencia_id is null and l.financiamento_id is null
     and coalesce(l.origem_lancamento, '') not in ('mesa_split', 'parcela_financiamento') and coalesce(l.tipo_operacao, '') not like '3-%'
   order by l.created_at desc limit 1;
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols from pg_attribute
   where attrelid = 'public.financeiro_lancamentos_v2'::regclass and attnum > 0 and not attisdropped and attgenerated = '';
  execute format('insert into public.financeiro_lancamentos_v2 (%s) select %s from jsonb_populate_record(null::public.financeiro_lancamentos_v2, $1)', v_cols, v_cols)
    using v_molde || jsonb_build_object('id', v_novo, 'hash_importacao', null, 'descricao', 'LONTAL POUR ON FR 1 L');
  select descricao into v_d from public.financeiro_lancamentos_v2 where id = v_novo;
  if v_d <> 'Lontal Pour On FR 1 L' then raise exception 'C3 criou: %', v_d; end if;
  -- descricao antiga em caixa alta (gravada pela chave de escritor, como o desfazer) nao muda ao editar outro campo
  perform set_config('app.descricao_caixa_escritor', 'on', true);   -- sem ALTER TABLE na tabela real (CLAUDE.md)
  update public.financeiro_lancamentos_v2 set descricao = 'ANTIGA EM CAIXA ALTA' where id = v_novo;
  perform set_config('app.descricao_caixa_escritor', '', true);
  update public.financeiro_lancamentos_v2 set observacao = 'p118' where id = v_novo;
  select descricao into v_d from public.financeiro_lancamentos_v2 where id = v_novo;
  if v_d <> 'ANTIGA EM CAIXA ALTA' then raise exception 'C3 outro campo reescreveu: %', v_d; end if;
  update public.financeiro_lancamentos_v2 set descricao = 'SAL COM UREIA 1/4' where id = v_novo;
  select descricao into v_d from public.financeiro_lancamentos_v2 where id = v_novo;
  if v_d <> 'Sal com Ureia 1/4' then raise exception 'C3 editou: %', v_d; end if;

  -- C4
  select to_jsonb(i) into v_item from public.nota_fiscal_itens i limit 1;
  if v_item is null then raise exception 'C4 sem item molde'; end if;
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_icols from pg_attribute
   where attrelid = 'public.nota_fiscal_itens'::regclass and attnum > 0 and not attisdropped and attgenerated = '';
  execute format('insert into public.nota_fiscal_itens (%s) select %s from jsonb_populate_record(null::public.nota_fiscal_itens, $1)', v_icols, v_icols)
    using v_item || jsonb_build_object('id', gen_random_uuid(), 'n_item', 9999, 'descricao', 'PRODUCE FR 1 L');
  select descricao into v_d from public.nota_fiscal_itens where n_item = 9999 and nota_id = (v_item->>'nota_id')::uuid;
  if v_d <> 'Produce FR 1 L' then raise exception 'C4: %', v_d; end if;

  raise exception 'OK';
end $teste$;
ROLLBACK;
