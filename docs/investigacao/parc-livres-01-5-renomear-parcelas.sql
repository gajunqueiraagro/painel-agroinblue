-- PARC-LIVRES-01 (fechamento B) — RENOMEAR AS PARCELAS ANTIGAS DE PARCELAMENTO PARA "Descrição i/N".
-- ⚠ EXECUTADO EM 06/10/2026 (07/10 UTC), com o SIM do Gabriel no prompt, depois de o ensaio revertido passar no mesmo dia.
--   REGISTRO HISTORICO: NAO SE REEXECUTA — a guarda de contagem recusa (o escopo ja' nao tem as 83 linhas).
--   Diferencas para o ensaio: o `raise exception 'ENSAIO OK'` final saiu (fica o NOTICE) e o ROLLBACK virou COMMIT.
--
-- ESCOPO (medido em 06/10/2026, depois do reparo do Protocolo IATF): lancamento ATIVO que e' a parcela VIVA de um contrato de
-- natureza 'parcelamento', do NJ e da Vera, cujo nome e' EXATAMENTE um dos dois gerados pelo sistema:
--   "Descrição - Parcela i/N"  (o cadastro antigo)            NJ 72 (as 67 de antes + as 5 do IATF reparado) · Vera 11
--   "Parcela i/N Descrição"    (o motor do financiamento)      NJ 0 (as 5 eram do IATF e foram canceladas no reparo) · Vera 0
-- O nome novo sai da MESMA funcao do nascimento, `_fn_parcela_descricao(descricao do contrato, numero, total)`.
-- FORA, NAO TOCADO: nome posto a' mao ou de outra forma (NJ 10, Vera 3 — ex. "Adensado/Nucleo - 1/3", "Balança Pesagem - 2/2"),
-- "Parcela N - None" do Lucro Rural, "Parc N", OC, financiamento com juros, cancelados, e todo lancamento fora de contrato.
-- Parcela PAGA tambem e' renomeada: e' texto, nao data nem valor (NJ 21, Vera 2).
-- GUARDAS: a contagem por cliente tem de ser a medida; so' a `descricao` (e o `updated_at`, se algum gatilho o carimbar) muda nas
-- linhas do escopo — md5 dos demais campos antes x depois —; e NENHUMA linha fora do escopo e' escrita por esta transacao
-- (conferido pelo `xmin`, que nao se confunde com o trabalho de outra pessoa no mesmo cliente).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $r$
declare
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_vera constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  v_nj int; v_vera int; v_n int; v_md5_antes text; v_md5_depois text; v_fora int; v_ex text; v_resto int;
begin
  create temp table _alvo on commit drop as
    select l.id, f.cliente_id, l.descricao antes, public._fn_parcela_descricao(f.descricao, p.numero_parcela, f.total_parcelas) depois,
           l.status_transacao in ('realizado', 'conciliado') paga,
           md5((to_jsonb(l) - 'descricao' - 'updated_at')::text) resto
      from public.financiamentos f
      join public.financiamento_parcelas p on p.financiamento_id = f.id and coalesce(p.status, '') <> 'cancelado'
      join public.financeiro_lancamentos_v2 l on l.id = p.lancamento_id and not coalesce(l.cancelado, false)
     where f.natureza = 'parcelamento' and f.cliente_id in (c_nj, c_vera)
       and (l.descricao = f.descricao || ' - Parcela ' || p.numero_parcela || '/' || f.total_parcelas
            or l.descricao = 'Parcela ' || p.numero_parcela || '/' || f.total_parcelas || ' ' || f.descricao);
  select count(*) filter (where cliente_id = c_nj), count(*) filter (where cliente_id = c_vera) into v_nj, v_vera from _alvo;
  if v_nj <> 72 or v_vera <> 11 then
    raise exception 'RENOMEAR: o escopo nao e'' o medido (NJ % de 72, Vera % de 11). Nada foi feito.', v_nj, v_vera;
  end if;
  if exists (select 1 from _alvo where depois is null or btrim(depois) = '' or depois = antes) then
    raise exception 'RENOMEAR: ha'' linha sem nome novo ou com o nome novo igual ao antigo. Nada foi feito.';
  end if;
  select md5(string_agg(id::text || resto, ',' order by id)) into v_md5_antes from _alvo;

  update public.financeiro_lancamentos_v2 l set descricao = a.depois from _alvo a where l.id = a.id;
  get diagnostics v_n = row_count;
  if v_n <> 83 then raise exception 'RENOMEAR: esperava escrever 83 linhas, escrevi %', v_n; end if;

  -- so' a descricao mudou nas linhas do escopo
  select md5(string_agg(l.id::text || md5((to_jsonb(l) - 'descricao' - 'updated_at')::text), ',' order by l.id)),
         count(*) filter (where l.descricao is distinct from a.depois)
    into v_md5_depois, v_resto
    from public.financeiro_lancamentos_v2 l join _alvo a on a.id = l.id;
  if v_md5_antes is distinct from v_md5_depois then raise exception 'RENOMEAR: outro campo mudou nas linhas do escopo'; end if;
  if v_resto <> 0 then raise exception 'RENOMEAR: % linha(s) nao ficaram com o nome novo', v_resto; end if;
  -- nenhuma linha FORA do escopo foi escrita por esta transacao
  select count(*) into v_fora from public.financeiro_lancamentos_v2 l
   where l.xmin::text = (txid_current() % 4294967296)::text and not exists (select 1 from _alvo a where a.id = l.id);
  if v_fora <> 0 then raise exception 'RENOMEAR: % lancamento(s) fora do escopo foram escritos', v_fora; end if;
  if (select count(*) from public.financeiro_lancamentos_v2 l join _alvo a on a.id = l.id where l.xmin::text = (txid_current() % 4294967296)::text) <> 83 then
    raise exception 'RENOMEAR: a conferencia pelo xmin nao achou as 83 linhas escritas (a busca tem de saber achar)';
  end if;

  select string_agg(x.linha, E'\n' order by x.cli, x.antes) into v_ex from (
    select case when a.cliente_id = c_nj then 'NJ' else 'Vera' end cli, a.antes,
           format('  %s%s  "%s"  ->  "%s"', case when a.cliente_id = c_nj then 'NJ  ' else 'Vera' end, case when a.paga then ' (paga)' else '       ' end, a.antes, a.depois) linha,
           row_number() over (partition by a.cliente_id order by a.antes) rn
      from _alvo a) x where x.rn <= 10;
  raise notice E'RENOMEADAS: NJ %, Vera % (pagas: NJ %, Vera %)\n%', v_nj, v_vera,
    (select count(*) from _alvo where cliente_id = c_nj and paga), (select count(*) from _alvo where cliente_id = c_vera and paga), v_ex;
end
$r$;
commit;
