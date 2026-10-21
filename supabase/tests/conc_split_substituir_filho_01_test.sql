-- CONC-SPLIT-SUBSTITUIR-FILHO-01 — o desmembramento vale enquanto os filhos estao ligados ao extrato. Sobre o CASO REAL (extrato
-- 13714275 de 21/09/2026, R$ 4.061,74, split 9380e501 de 03/10: Diesel 1/2 895c5ad3 R$ 3.225 + Honorarios ca811e3e R$ 836,74;
-- desconciliado e reconciliado em 21/10 com o parcelado novo 17318dbc + ca811e3e) e um split SINTETICO por cima, admin simulado;
-- termina em RAISE 'OK' (desfaz tudo — inclusive o cancelamento de prova do 895c5ad3).
--   T1 o filho que saiu do extrato NAO e' de split vivo: `fn_split_do_lancamento` nulo e o cancelamento passa pela trava
--   T2 o desfazer do split antigo diz o lancamento, o extrato e o caminho (nao "a linha 68")
--   T3 a porta encerra o substituido com trilha ("substituído por reconciliação em 21/10/2026"); o que ficou ligado vira comum;
--      de novo = ja' encerrado; o desfazer pela Mesa diz "já foi desfeito"
--   T4 o extrato continua conciliado com 17318dbc + ca811e3e (R$ 4.061,74)
--   T5 o gatilho: split ainda valendo -> "ainda vale"; reconciliar com um filho nao encerra; com OUTRO encerra; o split criado na mesma
--      transacao nao se encerra
--   T6 a porta e' de quem tem o cliente (42501 sem acesso)
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  cli  constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  sp   constant uuid := '9380e501-9866-403c-b375-992ec66d5efb';
  ext  constant uuid := '13714275-ea5a-4ff0-8047-33b58f647d6a';
  velho constant uuid := '895c5ad3-31ef-4ca9-af1b-c3cded433704';
  hon  constant uuid := 'ca811e3e-1ec6-42e3-8666-1a3380cab75d';
  stg_hon constant uuid := '8a20cc18-0008-4bc8-8633-8b77c23ba785';
  novo uuid := (select id from public.financeiro_lancamentos_v2 where id::text like '17318dbc%');
  r jsonb; msg text; s2 uuid; s3 uuid; outro uuid; n int; soma numeric;
BEGIN
  -- T1
  if public.fn_split_do_lancamento(velho) is not null then raise exception 'T1 o filho que saiu ainda e de split vivo'; end if;
  if public.fn_split_do_lancamento(hon) is null then raise exception 'T1 o filho ligado deixou de ser de split antes de encerrar'; end if;

  -- T2 (antes de encerrar: o honorario esta' noutro grupo)
  r := public.fn_classificacao_desfazer_split(stg_hon, null, true);
  if r->>'motivo' is distinct from 'filho_em_grupo'
     or r->>'mensagem' not like '%(R$ 836,74) está conciliado em outro grupo com o extrato de 21/09/2026 (R$ 4.061,74). Desfaça essa conciliação em Financeiro › Conciliação e desfaça o desmembramento depois.'
     or r->>'mensagem' like '%linha%' then raise exception 'T2 frase: %', r; end if;

  -- T3
  r := public.fn_split_encerrar_substituido(sp, true);
  if (r->>'ok')::boolean is not true or r->>'motivo' <> 'substituído por reconciliação em 21/10/2026'
     or jsonb_array_length(r->'filhos_que_sairam') <> 1 or r->'filhos_que_sairam'->0->>'lancamento_id' <> velho::text
     or (select desfeito_em from public.classificacao_splits where id = sp) is not null then raise exception 'T3 simular: %', r; end if;
  r := public.fn_split_encerrar_substituido(sp, false);
  if (select desfeito_motivo from public.classificacao_splits where id = sp) is distinct from 'substituído por reconciliação em 21/10/2026'
     or (select desfeito_por from public.classificacao_splits where id = sp) is distinct from '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'
    then raise exception 'T3 sem trilha'; end if;
  if public.fn_split_do_lancamento(hon) is not null then raise exception 'T3 o que ficou ligado segue de split'; end if;
  r := public.fn_split_encerrar_substituido(sp, false);
  if r->>'motivo' <> 'ja_encerrado' then raise exception 'T3 de novo: %', r; end if;
  r := public.fn_classificacao_desfazer_split(stg_hon, null, true);
  if r->>'motivo' <> 'split_ja_desfeito' then raise exception 'T3 desfazer depois: %', r; end if;
  -- o cancelamento do filho antigo passa (a trava nao o ve mais); o usuario e' quem cancela de verdade, pela tela
  update public.financeiro_lancamentos_v2 set cancelado = true where id = velho;
  if (select cancelado from public.financeiro_lancamentos_v2 where id = velho) is not true then raise exception 'T1 cancelar nao passou'; end if;

  -- T4
  select count(*), sum(c.valor_aplicado) into n, soma from public.conciliacao_bancaria_itens c where c.extrato_id = ext and c.desfeito_em is null;
  if n <> 2 or soma <> 4061.74
     or not exists (select 1 from public.conciliacao_bancaria_itens c where c.extrato_id = ext and c.lancamento_id = novo and c.desfeito_em is null)
     or not exists (select 1 from public.conciliacao_bancaria_itens c where c.extrato_id = ext and c.lancamento_id = hon and c.desfeito_em is null)
    then raise exception 'T4 o extrato mudou: % itens, R$ %', n, soma; end if;

  -- T5 o gatilho, num split sintetico (de ontem) por cima do vinculo atual: filhos = 17318dbc + ca811e3e + o diesel antigo
  insert into public.classificacao_splits (cliente_id, sessao_id, consolidado_id, extrato_id, vinculo_original, origem, criado_em)
    values (cli, '38d48802-7e63-46a1-bd1d-aaa9ccf4f342', '6a97c19e-0986-4e29-9d49-0b4d550aab88', ext, '[]'::jsonb, 'split', now() - interval '1 day')
    returning id into s2;
  insert into public.classificacao_split_itens (split_id, staging_id, filho_id)
    values (s2, stg_hon, hon), (s2, '40f007e7-d863-448a-ac68-77646ac1516c', novo), (s2, '40f007e7-d863-448a-ac68-77646ac1516c', velho);
  r := public.fn_split_encerrar_substituido(s2, true);
  if r->>'motivo' <> 'ainda_vale' then raise exception 'T5 ainda vale: %', r; end if;
  -- reconciliar com um FILHO (o diesel antigo) nao encerra
  update public.financeiro_lancamentos_v2 set cancelado = false where id = velho;
  insert into public.conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado) values (cli, ext, velho, 0.01);
  if (select desfeito_em from public.classificacao_splits where id = s2) is not null then raise exception 'T5 um filho encerrou'; end if;
  -- o split nascido NESTA transacao nao se encerra
  insert into public.classificacao_splits (cliente_id, sessao_id, consolidado_id, extrato_id, vinculo_original, origem)
    values (cli, '38d48802-7e63-46a1-bd1d-aaa9ccf4f342', '6a97c19e-0986-4e29-9d49-0b4d550aab88', ext, '[]'::jsonb, 'split') returning id into s3;
  insert into public.classificacao_split_itens (split_id, staging_id, filho_id) values (s3, stg_hon, hon);
  -- reconciliar com OUTRO lancamento do cliente encerra
  outro := (select f.id from public.financeiro_lancamentos_v2 f where f.cliente_id = cli and f.cancelado is not true
              and f.id not in (velho, hon, novo, '6a97c19e-0986-4e29-9d49-0b4d550aab88')
              and not exists (select 1 from public.conciliacao_bancaria_itens c where c.lancamento_id = f.id and c.desfeito_em is null)
            order by f.id limit 1);
  insert into public.conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado) values (cli, ext, outro, 0.01);
  if (select desfeito_motivo from public.classificacao_splits where id = s2) is distinct from 'substituído por reconciliação em '
       || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') then raise exception 'T5 outro nao encerrou'; end if;
  if (select desfeito_em from public.classificacao_splits where id = s3) is not null then raise exception 'T5 encerrou o split da propria transacao'; end if;

  -- T6
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  msg := null; begin perform public.fn_split_encerrar_substituido(s3, true); exception when others then msg := sqlstate; end;
  if msg is distinct from '42501' then raise exception 'T6 sem acesso passou: %', msg; end if;

  RAISE EXCEPTION 'OK';
END $t$;
