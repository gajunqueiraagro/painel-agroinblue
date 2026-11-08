-- LOTES-04 B (Gabriel 07/11/2026 17:26) — a RODADA: todos os lotes de todos os clientes para o código novo ATIV-CAT-RAÇA-NN (precisa da 113200).
--   · Todos: o código é montado de novo pela `_fn_lote_codigo` (ordem nova); o de antes vai para `codigos_antigos` (a busca acha pelo velho).
--   · NJ Pecuária (D1 = sim, Gabriel 07/11): as atividades passam a CRI/REC/ENG (CR → CRI, RC → REC, EG → ENG).
--     D2 = programa (Gabriel 07/11): Descarte deixa de ser atividade → Engorda + Programa "Descarte" (6 lotes); Reprodução deixa de ser
--     atividade → Cria + Programa "Reprodução" (6 lotes). O nº fica (as combinações novas estão vazias); DC e RP saem da lista (ativo = false).
--   · Vera (Faz. 3 Muchachas): DES deixa de existir → a categoria vira DF "Desmama F" (a categoria só tem desmama fêmea; os 3 lotes);
--     "1a-Inseminação" deixa de ser atividade → Programa "1ª inseminação" (novo no cadastro dela), o lote NOV-NEL-INS-01 fica em Cria;
--     DES-ANG-CRI-01 passa a Recria (mock: "atividade Cria → Recria · DES → DF"). O cadastro INS sai da lista (ativo = false), sem lote.
--   · O nº muda só nos 2 da Vera que mudam de atividade: o próximo livre da combinação nova (REC-DF-ANG-01; CRI-NOV-NEL-02, porque o 01
--     já é do lote das 18:07 — opção (a) do Gabriel, 07/11). Os outros 85 mantêm o nº. Prévia das 18:20: 87 lotes (NJ 76 + Vera 11).
--   · Os lançamentos NÃO mudam: ligam pelo `lote_id`. A `versao` dos lotes não muda.
-- Trilha: `audit_log` pelos gatilhos de sempre, motivo "LOTES-04 código novo".
-- DESFAZER PELA RODADA: as linhas de antes ficam em `_bkp_lotes04_20261107` (lotes) e `_bkp_lotes04_cad_20261107` (cadastros); o bloco
--   VOLTA no fim devolve tudo (código, antigos, atividade, programa, nº, siglas, nomes, ativo) e apaga o Programa criado.
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $guarda$
begin
  if position('(select sigla from public.rebanho_lote_cadastros where id = p_atividade) || ''-'' ||' in
              pg_get_functiondef('public._fn_lote_codigo(uuid, uuid, uuid, integer)'::regprocedure)) = 0 then
    raise exception 'LOTES-04 B: a 113200 (código ATIV-CAT-RAÇA) não está aplicada; nada gravado';
  end if;
  if exists (select 1 from pg_class where relname = '_bkp_lotes04_20261107') then
    raise exception 'LOTES-04 B: a rodada já rodou (o backup existe); nada gravado';
  end if;
end
$guarda$;

/* o backup da rodada (só leitura do dono; ninguém da API lê) */
create table public._bkp_lotes04_20261107 as select * from public.rebanho_lotes;
create table public._bkp_lotes04_cad_20261107 as select * from public.rebanho_lote_cadastros;
alter table public._bkp_lotes04_20261107 enable row level security;
alter table public._bkp_lotes04_cad_20261107 enable row level security;
revoke all on public._bkp_lotes04_20261107, public._bkp_lotes04_cad_20261107 from public, anon, authenticated;

do $rodada$
declare
  v_vera uuid; v_nj uuid; v_des uuid; v_ins uuid; v_cri uuid; v_rec uuid; v_prog uuid; v_n integer; v_esperado integer;
  v_nj_cri uuid; v_nj_eng uuid; v_dc uuid; v_rp uuid; v_p_desc uuid; v_p_repr uuid;
begin
  perform set_config('app.lote_escritor', '1', true);
  perform set_config('app.motivo', 'LOTES-04 código novo', true);

  select id into v_vera from public.clientes where nome = 'Vera Ligia Milani';
  select id into v_nj from public.clientes where nome = 'NJ Pecuária';
  if v_vera is null or v_nj is null then raise exception 'LOTES-04 B: cliente não achado; nada gravado'; end if;

  /* NJ: as atividades em 3 letras */
  update public.rebanho_lote_cadastros c set sigla = x.nova, atualizado_em = now()
    from (values ('CR', 'CRI'), ('RC', 'REC'), ('EG', 'ENG')) as x(velha, nova)
   where c.cliente_id = v_nj and c.tipo = 'atividade' and c.sigla = x.velha and c.ativo;
  get diagnostics v_n = row_count;
  if v_n <> 3 then raise exception 'LOTES-04 B: NJ esperava 3 atividades (CR, RC, EG), achou %; nada gravado', v_n; end if;

  /* NJ (D2): Descarte → Engorda + Programa "Descarte"; Reprodução → Cria + Programa "Reprodução"; o nº fica */
  select id into v_nj_cri from public.rebanho_lote_cadastros where cliente_id = v_nj and tipo = 'atividade' and sigla = 'CRI' and ativo;
  select id into v_nj_eng from public.rebanho_lote_cadastros where cliente_id = v_nj and tipo = 'atividade' and sigla = 'ENG' and ativo;
  select id into v_dc from public.rebanho_lote_cadastros where cliente_id = v_nj and tipo = 'atividade' and sigla = 'DC' and ativo;
  select id into v_rp from public.rebanho_lote_cadastros where cliente_id = v_nj and tipo = 'atividade' and sigla = 'RP' and ativo;
  if v_nj_cri is null or v_nj_eng is null or v_dc is null or v_rp is null then
    raise exception 'LOTES-04 B: NJ sem CRI, ENG, DC ou RP no cadastro; nada gravado';
  end if;
  if exists (select 1 from public.rebanho_lotes where atividade_id in (v_dc, v_rp) and programa_id is not null) then
    raise exception 'LOTES-04 B: lote de Descarte/Reprodução já tem programa; nada gravado';
  end if;
  insert into public.rebanho_lote_cadastros (cliente_id, tipo, sigla, nome, categorias_rebanho, ordem)
  values (v_nj, 'programa', null, 'Descarte', '{}',
          coalesce((select max(ordem) + 10 from public.rebanho_lote_cadastros where cliente_id = v_nj and tipo = 'programa'), 10))
  returning id into v_p_desc;
  insert into public.rebanho_lote_cadastros (cliente_id, tipo, sigla, nome, categorias_rebanho, ordem)
  values (v_nj, 'programa', null, 'Reprodução', '{}',
          coalesce((select max(ordem) + 10 from public.rebanho_lote_cadastros where cliente_id = v_nj and tipo = 'programa'), 10))
  returning id into v_p_repr;
  update public.rebanho_lotes set atividade_id = v_nj_eng, programa_id = v_p_desc, atualizado_em = now() where atividade_id = v_dc;
  get diagnostics v_n = row_count;
  if v_n <> 6 then raise exception 'LOTES-04 B: NJ esperava 6 lotes de Descarte, achou %; nada gravado', v_n; end if;
  update public.rebanho_lotes set atividade_id = v_nj_cri, programa_id = v_p_repr, atualizado_em = now() where atividade_id = v_rp;
  get diagnostics v_n = row_count;
  if v_n <> 6 then raise exception 'LOTES-04 B: NJ esperava 6 lotes de Reprodução, achou %; nada gravado', v_n; end if;
  update public.rebanho_lote_cadastros set ativo = false, atualizado_em = now() where id in (v_dc, v_rp);

  /* Vera: DES → DF "Desmama F"; INS → Programa; DES-ANG-CRI-01 → Recria */
  select id into v_des from public.rebanho_lote_cadastros where cliente_id = v_vera and tipo = 'categoria' and sigla = 'DES' and ativo;
  select id into v_ins from public.rebanho_lote_cadastros where cliente_id = v_vera and tipo = 'atividade' and sigla = 'INS' and ativo;
  select id into v_cri from public.rebanho_lote_cadastros where cliente_id = v_vera and tipo = 'atividade' and sigla = 'CRI' and ativo;
  select id into v_rec from public.rebanho_lote_cadastros where cliente_id = v_vera and tipo = 'atividade' and sigla = 'REC' and ativo;
  if v_des is null or v_ins is null or v_cri is null or v_rec is null then
    raise exception 'LOTES-04 B: Vera sem DES, INS, CRI ou REC no cadastro; nada gravado';
  end if;
  update public.rebanho_lote_cadastros set sigla = 'DF', nome = 'Desmama F', atualizado_em = now() where id = v_des;
  insert into public.rebanho_lote_cadastros (cliente_id, tipo, sigla, nome, categorias_rebanho, ordem)
  values (v_vera, 'programa', null, '1ª inseminação', '{}',
          coalesce((select max(ordem) + 10 from public.rebanho_lote_cadastros where cliente_id = v_vera and tipo = 'programa'), 10))
  returning id into v_prog;

  update public.rebanho_lotes l set atividade_id = v_cri, programa_id = v_prog,
         numero = public._fn_lote_proximo_numero(l.fazenda_id, l.categoria_id, l.raca_id, v_cri), atualizado_em = now()
   where l.cliente_id = v_vera and l.atividade_id = v_ins;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'LOTES-04 B: Vera esperava 1 lote em INS, achou %; nada gravado', v_n; end if;
  update public.rebanho_lotes l set atividade_id = v_rec,
         numero = public._fn_lote_proximo_numero(l.fazenda_id, l.categoria_id, l.raca_id, v_rec), atualizado_em = now()
   where l.cliente_id = v_vera and l.codigo = 'DES-ANG-CRI-01';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'LOTES-04 B: Vera esperava o lote DES-ANG-CRI-01, achou %; nada gravado', v_n; end if;
  update public.rebanho_lote_cadastros set ativo = false, atualizado_em = now() where id = v_ins;

  /* todos: o código novo; o de antes na busca */
  select count(*) into v_esperado from public.rebanho_lotes;
  update public.rebanho_lotes l set codigo = n.codigo,
         codigos_antigos = array_remove(array_remove(l.codigos_antigos, l.codigo) || l.codigo, n.codigo), atualizado_em = now()
    from (select id, public._fn_lote_codigo(categoria_id, raca_id, atividade_id, numero) codigo from public.rebanho_lotes) n
   where n.id = l.id and n.codigo <> l.codigo;
  get diagnostics v_n = row_count;
  if v_n <> v_esperado then raise exception 'LOTES-04 B: esperava trocar % códigos, trocou %; nada gravado', v_esperado, v_n; end if;

  perform set_config('app.motivo', '', true);
  perform set_config('app.lote_escritor', '', true);
end
$rodada$;

-- VOLTA (desfazer pela rodada; rodar só com a palavra do Gabriel):
-- do $volta$ begin
--   perform set_config('app.lote_escritor', '1', true); perform set_config('app.motivo', 'LOTES-04 desfeito', true);
--   update public.rebanho_lotes l set codigo = b.codigo, codigos_antigos = b.codigos_antigos, atividade_id = b.atividade_id,
--          programa_id = b.programa_id, numero = b.numero, atualizado_em = now()
--     from public._bkp_lotes04_20261107 b where b.id = l.id;
--   update public.rebanho_lote_cadastros c set sigla = b.sigla, nome = b.nome, ativo = b.ativo, atualizado_em = now()
--     from public._bkp_lotes04_cad_20261107 b where b.id = c.id;
--   delete from public.rebanho_lote_cadastros c where not exists (select 1 from public._bkp_lotes04_cad_20261107 b where b.id = c.id)
--      and c.tipo = 'programa' and c.nome in ('1ª inseminação', 'Descarte', 'Reprodução')
--      and not exists (select 1 from public.rebanho_lotes l where l.programa_id = c.id);
--   perform set_config('app.lote_escritor', '', true); perform set_config('app.motivo', '', true);
-- end $volta$;
-- (depois: drop table public._bkp_lotes04_20261107, public._bkp_lotes04_cad_20261107)
