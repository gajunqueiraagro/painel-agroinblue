-- DRE-META-PATRIMONIO-01 — prova do patrimonio do cenario META em fn_dre_pecuaria (migration 20261027182000).
-- Roda em ROLLBACK (so' leitura; termina em RAISE 'OK ...'). Qualquer outra mensagem e' falha.
-- Cobre, com dado real do proto (Raul Juliato):
--   M1. Safra 25/26 meta, fazenda com meta validada em 2026-06: P0 REAL de 2025-06 (3.295.828,72, 734 cab, fonte fechamento),
--       P1 da meta (3.466.271,50, 749 cab), v_fim_p0 = itens da meta x preco/kg do fechamento P0, producao = v_fim_p0 - v_ini_p0,
--       mercado = v_fim_p1 - v_fim_p0, producao + mercado = 170.442,78, criterio 'producao + mercado (P0 real)'.
--   M2. Safra 24/25 meta (nao ha meta validada em 2025-06): sem_p1 = true com motivo 'meta 2025 não validada', producao e
--       mercado nulos — e nunca o criterio antigo.
--   N.  NJ 25/26 meta: a fazenda Administrativo (sem gado, entra pelo custo) tem patrimonio zero e o total = Pureza + Sto.
--       Expedito (sem sem_p1).
--   R.  Realizado 25/26: sem criterio no patrimonio e producao = v_fim_p0 - v_ini_p0 (o ramo realizado nao mudou de forma).
do $do$
declare
  v_raul uuid; j jsonb; fz jsonb; pat jsonb; v_prod numeric; v_merc numeric;
begin
  select id into v_raul from clientes where nome = 'Raul Juliato';

  -- M1) 25/26 meta
  j := fn_dre_pecuaria(v_raul, '2025-07', '2026-06', 'meta');
  select f into fz from jsonb_array_elements(j->'fazendas') f where (f->'linhas'->'patrimonio'->>'v_fim_p1')::numeric > 0;
  if fz is null then raise exception 'M1 nenhuma fazenda com P1 da meta'; end if;
  pat := fz->'linhas'->'patrimonio';
  if (pat->>'v_ini_p0')::numeric <> 3295828.72 then raise exception 'M1 v_ini_p0 % (esperado o P0 real 3.295.828,72)', pat->>'v_ini_p0'; end if;
  if (pat->>'v_fim_p1')::numeric <> 3466271.50 then raise exception 'M1 v_fim_p1 %', pat->>'v_fim_p1'; end if;
  if (pat->>'cab_ini')::numeric <> 734 or (pat->>'cab_fim')::numeric <> 749 then raise exception 'M1 cabecas % / %', pat->>'cab_ini', pat->>'cab_fim'; end if;
  if pat->>'v_fim_p0' is null then raise exception 'M1 v_fim_p0 nulo'; end if;
  if pat->>'criterio' is distinct from 'producao + mercado (P0 real)' or (pat->>'sem_p1')::boolean is not false then
    raise exception 'M1 criterio/sem_p1: %', pat; end if;
  if fz->'linhas'->>'p0_fonte' is distinct from 'fechamento' then raise exception 'M1 p0_fonte %', fz->'linhas'->>'p0_fonte'; end if;
  v_prod := (fz->'linhas'->>'vpb_operacional')::numeric; v_merc := (fz->'linhas'->>'efeito_mercado')::numeric;
  if v_prod is distinct from (pat->>'v_fim_p0')::numeric - (pat->>'v_ini_p0')::numeric then raise exception 'M1 producao %', v_prod; end if;
  if v_merc is distinct from (pat->>'v_fim_p1')::numeric - (pat->>'v_fim_p0')::numeric then raise exception 'M1 mercado %', v_merc; end if;
  if v_prod + v_merc <> 170442.78 then raise exception 'M1 producao + mercado = % (esperado 170.442,78)', v_prod + v_merc; end if;

  -- M2) 24/25 meta: P1 inexistente
  j := fn_dre_pecuaria(v_raul, '2024-07', '2025-06', 'meta');
  pat := j->'total'->'patrimonio';
  if (pat->>'sem_p1')::boolean is not true or pat->>'motivo_p1' is distinct from 'meta 2025 não validada' then
    raise exception 'M2 sem meta em p_ate: %', pat; end if;
  if j->'total'->>'efeito_mercado' is not null then raise exception 'M2 mercado sem P1 deveria ser nulo'; end if;

  -- N) NJ 25/26 meta: a Administrativo (sem gado) tem patrimonio zero e nao derruba o total = Pureza + Sto. Expedito
  j := fn_dre_pecuaria((select id from clientes where nome = 'NJ Pecuária'), '2025-07', '2026-06', 'meta');
  if (j->'total'->'patrimonio'->>'sem_p1')::boolean is not false then raise exception 'N total NJ ficou sem_p1: %', j->'total'->'patrimonio'; end if;
  select f into fz from jsonb_array_elements(j->'fazendas') f where f->>'nome' = 'Administrativo';
  if fz is null then raise exception 'N Administrativo fora do DRE meta (o caso nao distingue)'; end if;
  if (fz->'linhas'->>'vpb_operacional')::numeric <> 0 or (fz->'linhas'->'patrimonio'->>'v_fim_p1')::numeric <> 0
     or (fz->'linhas'->'patrimonio'->>'sem_p1')::boolean is not false then raise exception 'N Administrativo: %', fz->'linhas'->'patrimonio'; end if;
  if (j->'total'->>'vpb_operacional')::numeric is distinct from (select sum((f->'linhas'->>'vpb_operacional')::numeric)
        from jsonb_array_elements(j->'fazendas') f where f->>'nome' in ('Faz. Pureza', 'Faz. Sto. Expedito')) then
    raise exception 'N total NJ % <> Pureza + Sto. Expedito', j->'total'->>'vpb_operacional'; end if;

  -- R) realizado 25/26: forma intacta
  j := fn_dre_pecuaria(v_raul, '2025-07', '2026-06', 'realizado');
  pat := j->'total'->'patrimonio';
  if pat ? 'criterio' or pat ? 'sem_p1' then raise exception 'R realizado ganhou chave da meta: %', pat; end if;
  if (j->'total'->>'vpb_operacional')::numeric is distinct from (pat->>'v_fim_p0')::numeric - (pat->>'v_ini_p0')::numeric then
    raise exception 'R producao do realizado mudou'; end if;

  raise exception 'OK meta 25/26: P0 real 3.295.828,72, producao % + mercado % = 170.442,78; 24/25 sem_p1 com motivo; NJ total sem a Administrativo; realizado intacto',
    v_prod, v_merc;
end $do$;
