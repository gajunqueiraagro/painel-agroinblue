-- PR-ESTOQUE-QUEBRA-02 (F2.1) — historico, cancelamento logico e edicao da quebra.
--
-- ⚠ JA APLICADA NO PROTO pelo arquiteto em 15/09/2026, com GO do Gabriel. E' REGISTRO HISTORICO.
--   Nao foi reaplicada.
-- ⚠ OS TRES CORPOS NAO FORAM REDIGITADOS: extraidos do banco vivo num JSON em base64,
--   decodificados e conferidos um a um pelo md5 (8 primeiros digitos) —
--       18afd19a  agri_quebra_cancelar        (791 bytes)
--       1edae9c3  agri_quebra_editar          (765 bytes)
--       0b70ab21  fn_estoque_movimentacoes    (968 bytes)
--   Os tres bateram.
--
-- ⚠⚠ CANCELAR E' LOGICO, E NAO PRECISOU DE UMA LINHA NAS LEITURAS. `fn_estoque_graos`,
--   `_resumo` e `_balanco` ja' filtravam `ativo` desde a F2 — entao `ativo=false` tira a quebra
--   do saldo por construcao. Um `delete` daria o mesmo saldo e apagaria a prova de que a baixa
--   existiu; e' a regra "documento se cancela, nunca se apaga", aplicada ao estoque.
--
-- ⚠ A EDICAO SO' TOCA O DESCRITIVO — data, motivo e observacoes. Quantidade e classe NAO se
--   editam, e a ausencia e' a regra: mudar a quantidade de uma baixa ja' gravada reescreveria o
--   saldo do passado sem deixar rastro de qual era. Para corrigir quantidade, cancela-se e
--   registra-se de novo — o historico guarda as duas linhas.
--
-- ⚠ `fn_estoque_movimentacoes` DEVOLVE AS CANCELADAS, e e' o unico lugar do sistema onde elas
--   aparecem: as tres leituras de saldo as ignoram. Sem isto o estorno seria invisivel, e uma
--   baixa cancelada por engano nao teria como ser conferida.
-- ⚠ O NOME DO AUTOR VEM DE `profiles`, com `coalesce(..., '')`: usuario sem perfil devolve string
--   vazia, e a tela mostra o traco. Nunca um uuid na cara do operador.
-- ⚠ ELA E' `STABLE` e em `sql` puro, nao `plpgsql` — e' leitura, e o planner pode inline-a'.
--
-- ⚠ AS TRES COLUNAS SAO NULAVEIS por definicao: elas SO' existem depois do cancelamento. Um
--   `not null` com default obrigaria a inventar uma data de cancelamento para quem nunca foi
--   cancelado.
--
-- ⚠ A ACL: SECURITY DEFINER com EXECUTE so' para `authenticated` nas tres (medido: anon=false,
--   authenticated=true, public=false).

-- ── AS TRES COLUNAS DO ESTORNO ───────────────────────────────────────────────────────────────
alter table public.agri_estoque_movimentacoes
  add column if not exists cancelado_em timestamp with time zone,
  add column if not exists cancelado_por uuid,
  add column if not exists motivo_cancelamento text;

comment on column public.agri_estoque_movimentacoes.cancelado_em is
  'Cancelamento logico (estorno). Linha cancelada sai do saldo (ativo=false) e fica no historico. Nunca delete.';

-- ── AS DUAS ESCRITAS ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agri_quebra_cancelar(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_ativo boolean;
begin
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'CANCELAMENTO_SEM_MOTIVO'; end if;
  select ativo into v_ativo from agri_estoque_movimentacoes where id = p_id;
  if v_ativo is null then raise exception 'MOVIMENTACAO_NAO_ENCONTRADA'; end if;
  if not v_ativo then raise exception 'MOVIMENTACAO_JA_CANCELADA'; end if;
  update agri_estoque_movimentacoes
     set ativo = false, cancelado_em = now(), cancelado_por = auth.uid(),
         motivo_cancelamento = btrim(p_motivo), updated_at = now(), updated_by = auth.uid()
   where id = p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.agri_quebra_editar(p_id uuid, p_data date, p_motivo text, p_observacoes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_ativo boolean;
begin
  if p_data is null then raise exception 'DATA_OBRIGATORIA'; end if;
  select ativo into v_ativo from agri_estoque_movimentacoes where id = p_id;
  if v_ativo is null then raise exception 'MOVIMENTACAO_NAO_ENCONTRADA'; end if;
  if not v_ativo then raise exception 'MOVIMENTACAO_CANCELADA_NAO_EDITA'; end if;
  update agri_estoque_movimentacoes
     set data_movimento = p_data, motivo = p_motivo, observacoes = p_observacoes,
         updated_at = now(), updated_by = auth.uid()
   where id = p_id;
end $function$;

-- ── A LEITURA DO HISTORICO ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_estoque_movimentacoes(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'tipo', m.tipo, 'classe', m.classe, 'quantidade', round(m.quantidade, 2),
      'data', m.data_movimento, 'motivo', m.motivo, 'observacoes', m.observacoes,
      'ativo', m.ativo, 'autor', coalesce(p1.nome, ''), 'criado_em', m.created_at,
      'cancelado_em', m.cancelado_em, 'cancelado_por', coalesce(p2.nome, ''),
      'motivo_cancelamento', m.motivo_cancelamento
    ) order by m.data_movimento desc, m.created_at desc), '[]'::jsonb)
  from agri_estoque_movimentacoes m
  left join profiles p1 on p1.user_id = m.created_by
  left join profiles p2 on p2.user_id = m.cancelado_por
  where m.cliente_id = p_cliente and m.safra_id = p_safra_id and m.cultura = p_cultura;
$function$;

revoke all on function public.agri_quebra_cancelar(uuid, text) from public;
grant execute on function public.agri_quebra_cancelar(uuid, text) to authenticated;
revoke all on function public.agri_quebra_editar(uuid, date, text, text) from public;
grant execute on function public.agri_quebra_editar(uuid, date, text, text) to authenticated;
revoke all on function public.fn_estoque_movimentacoes(uuid, uuid, text) from public;
grant execute on function public.fn_estoque_movimentacoes(uuid, uuid, text) to authenticated;
