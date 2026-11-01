-- PATR-01c · 116100 — o Salvar do bem nunca mais recusa com 40001 (SALVAR-TRAVA, Gabriel 01/11/2026).
-- A `fn_patrimonio_bem_salvar` recusava a versao velha com errcode 40001 (serialization_failure). O PostgREST REPETE sem fim toda
-- transacao que falha com 40001 (reproduzido num container: nenhuma resposta, laco eterno mesmo depois que o cliente desiste; 1 pedido
-- = ~46% de CPU no banco); no proto ficaram 8 conexoes assim de 31/10 a 01/11 (derrubadas com OK do Gabriel). A recusa e' a mesma
-- frase, agora com P0001: o PostgREST responde 400 na hora e a tela mostra a frase (`patrimonio.ts`, mensagemDoBanco).
-- PATCH GUARDADO POR MD5: so' troca as 2 ocorrencias de errcode = '40001' do corpo conferido (116080); qualquer outro corpo = para.
-- O resto do sistema que usa 40001 (OC, fin_documento_editar, fechamento) e' a frente FIX-40001-SISTEMICO: aqui nao se mexe.

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $patch$
declare
  f constant regprocedure := 'public.fn_patrimonio_bem_salvar(jsonb,boolean,text)'::regprocedure;
  d text; n int;
begin
  if (select md5(p.prosrc) from pg_proc p where p.oid = f) is distinct from 'ed8d096937c5cec83d774c4f281702dd' then
    raise exception '116100: o corpo da fn_patrimonio_bem_salvar nao e'' o conferido (md5 %)', (select md5(p.prosrc) from pg_proc p where p.oid = f);
  end if;
  d := pg_get_functiondef(f);
  n := (length(d) - length(replace(d, 'errcode = ''40001''', ''))) / length('errcode = ''40001''');
  if n <> 2 then raise exception '116100: esperava 2 recusas 40001, achei %', n; end if;
  execute replace(d, 'errcode = ''40001''', 'errcode = ''P0001''');
  if (select p.prosrc like '%40001%' or p.prosrc not like '%errcode = ''P0001'', message = ''Este bem foi alterado por outra pessoa.%'
        from pg_proc p where p.oid = f) then
    raise exception '116100: o patch nao ficou como esperado';
  end if;
end $patch$;
