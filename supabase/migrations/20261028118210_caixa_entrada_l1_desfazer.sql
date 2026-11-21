-- CAIXA DE ENTRADA L1 — DESFAZER (Gabriel 13:38, FILA 13:44: "Lote 118190 (L1) CANCELADO — o Gabriel não quer texto guardado à parte").
--   A 118190 já tinha sido APLICADA às 13:37 (pelo "aprovo lote 118190" no terminal do Code 5, antes do cancelamento chegar à FILA).
--   Nenhuma tela chama a fn_entrada_leitura_gravar (a tela nunca foi publicada) e a tabela está VAZIA: este lote tira as duas.
--   A folha é lida pelo `lerFolha` (FOLHA-01, Code 6) direto do arquivo; os outros PDFs a caixa lê ao abrir.
-- GUARDA: só sai se a tabela estiver vazia (nada de cliente se perde).
set lock_timeout = '2s';

do $$
begin
  if to_regclass('public.entrada_leitura') is null then raise exception 'CAIXA-L1-DESFAZER: entrada_leitura não existe: nada a desfazer.'; end if;
  if exists (select 1 from public.entrada_leitura) then raise exception 'CAIXA-L1-DESFAZER: entrada_leitura tem linhas: parar e reportar.'; end if;
end $$;

drop function public.fn_entrada_leitura_gravar(uuid, text, text, text[], boolean);
drop table public.entrada_leitura;
