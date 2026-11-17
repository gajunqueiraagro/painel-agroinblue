-- NOTAS-RECEITA-A1-01 · UF da busca pelas IEs (Gabriel 17/11): o cUFAutor da distribuição sai da UF das IEs ativas do produtor
-- (as fazendas), NUNCA do domicílio (`fiscal_titulares.uf`). Caso-prova: Vera, domicílio SP, IEs MS → o pedido saía com 35 e voltava 137.
--   · uma UF nas IEs ativas → é ela;
--   · nenhuma → recusa (cadastrar a IE da fazenda); várias → recusa (decisão pendente: qual UF usar).
-- Só troca a função; nenhum dado muda.
create or replace function public.fn_fiscal_dfe_credencial(p_titular_id uuid)
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  t public.fiscal_titulares;
  c public.fiscal_certificados;
  co public.fiscal_certificados_cofre;
  v_senha text;
  v_ufs text[];
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null then raise exception using errcode = 'P0001', message = 'Produtor não encontrado.'; end if;
  select array_agg(distinct upper(trim(i.uf)) order by upper(trim(i.uf))) into v_ufs
    from public.fiscal_titular_ies i
   where i.titular_id = t.id and coalesce(i.ativo, true) and nullif(trim(i.uf), '') is not null;
  if v_ufs is null then
    raise exception using errcode = 'P0001', message = 'O produtor não tem IE ativa com UF: cadastre a IE da fazenda (a busca usa a UF da fazenda).';
  end if;
  if array_length(v_ufs, 1) > 1 then
    raise exception using errcode = 'P0001', message = format('O produtor tem IEs em mais de uma UF (%s): falta decidir qual UF vai na busca.', array_to_string(v_ufs, ', '));
  end if;
  select * into c from public.fiscal_certificados
   where titular_id = t.id and situacao = 'ativo' order by enviado_em desc limit 1;
  if c.id is null then raise exception using errcode = 'P0001', message = 'Este produtor não tem certificado A1 ativo.'; end if;
  if c.valido_ate <= now() then raise exception using errcode = 'P0001', message = 'O certificado deste produtor venceu: suba o novo.'; end if;
  if c.documento <> t.documento then raise exception using errcode = 'P0001', message = 'O certificado é de outro CPF/CNPJ, não deste produtor.'; end if;
  select * into co from public.fiscal_certificados_cofre where certificado_id = c.id;
  if co.objeto is null or co.segredo_id is null then raise exception using errcode = 'P0001', message = 'O cofre deste certificado está vazio.'; end if;
  select decrypted_secret into v_senha from vault.decrypted_secrets where id = co.segredo_id;
  if v_senha is null then raise exception using errcode = 'P0001', message = 'A senha do certificado não está no cofre.'; end if;
  return jsonb_build_object('certificado_id', c.id, 'cliente_id', t.cliente_id, 'documento', t.documento, 'uf', v_ufs[1], 'objeto', co.objeto,
    'senha', v_senha, 'impressao_digital', c.impressao_digital, 'valido_ate', c.valido_ate);
end $function$;
