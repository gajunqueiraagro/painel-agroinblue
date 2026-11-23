-- CONC-PAINEL-ARQUIVOS-01 (b) — Gabriel 23/11: "lote para guardar o OFX/CSV original logo depois". O arquivo do extrato importado não era
-- guardado: `financeiro_importacoes_v2` não tinha caminho e a importação não subia nada ao storage, e o painel da conta no mês não podia
-- "Baixar" nem "Ver" o original (D1 a mostra os movimentos que ele trouxe). Daqui para frente a tela sobe o arquivo ao `fin-documentos`
-- (a 1ª pasta é o cliente — a policy de sempre do bucket) DEPOIS de a importação gravar, e registra o caminho por esta função.
-- ⚠ O QUE JÁ FOI IMPORTADO FICA SEM ARQUIVO (`arquivo_caminho` nulo = "o original não foi guardado"): nada se inventa para trás.
-- ⚠ GRAVA UMA VEZ: o caminho registrado não se troca (o mesmo caminho de novo = já guardado, sem erro); outro caminho é recusado.
-- ⚠ A FUNÇÃO NASCE FECHADA (SEG-TENANT-VARREDURA-01C): recebe o id da LINHA, resolve o cliente e chama `tenant_ok` (42501, nunca vazio);
--   REVOKE de PUBLIC/anon, EXECUTE só para authenticated. O caminho tem de ser deste cliente, na pasta `importacoes/<conta da importação>/`.

alter table public.financeiro_importacoes_v2 add column if not exists arquivo_caminho text;
comment on column public.financeiro_importacoes_v2.arquivo_caminho is
  'CONC-PAINEL-ARQUIVOS-01 (b): o arquivo ORIGINAL da importação no bucket fin-documentos (<cliente>/importacoes/<conta>/<id da importação>.<ext>); nulo = importado antes de 23/11/2026 (o original não foi guardado). Grava só por fn_importacao_guardar_arquivo.';

create or replace function public.fn_importacao_guardar_arquivo(p_importacao_id uuid, p_caminho text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v record;
  v_pasta text;
begin
  select i.id, i.cliente_id, i.conta_bancaria_id, i.arquivo_caminho
    into v
    from public.financeiro_importacoes_v2 i
   where i.id = p_importacao_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'importacao_nao_encontrada: a importação não existe.';
  end if;
  if v.cliente_id is null or not public.tenant_ok(v.cliente_id) then
    raise exception using errcode = '42501', message = 'sem_permissao: operacao nao autorizada para este cliente.';
  end if;
  v_pasta := v.cliente_id::text || '/importacoes/' || coalesce(v.conta_bancaria_id::text, 'sem-conta') || '/' || v.id::text || '.';
  if p_caminho is null or left(p_caminho, length(v_pasta)) <> v_pasta or p_caminho !~ '\.[a-z0-9]{1,5}$' then
    raise exception using errcode = '22023', message = 'caminho_invalido: o arquivo tem de estar na pasta desta importação.';
  end if;
  if v.arquivo_caminho is not null then
    if v.arquivo_caminho = p_caminho then
      return jsonb_build_object('ok', true, 'ja_guardado', true);
    end if;
    raise exception using errcode = 'P0001', message = 'ja_guardado: esta importação já tem o arquivo original.';
  end if;
  update public.financeiro_importacoes_v2
     set arquivo_caminho = p_caminho, updated_at = now()
   where id = p_importacao_id;
  return jsonb_build_object('ok', true, 'ja_guardado', false);
end
$function$;

revoke all on function public.fn_importacao_guardar_arquivo(uuid, text) from public, anon;
grant execute on function public.fn_importacao_guardar_arquivo(uuid, text) to authenticated;
