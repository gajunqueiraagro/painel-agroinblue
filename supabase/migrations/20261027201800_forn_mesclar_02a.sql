-- FORN-MESCLAR-02a (Gabriel 19/10/2026) — mesclar fornecedores travava com 'Subcentro "Nutrição Recria" nao existe no plano de contas'.
--
-- CAUSA MEDIDA (FASE 0, 19/10): a mensagem nao e' do cadastro do fornecedor (ele nao tem subcentro; `plano_padrao_id` e' FK e esta'
-- vazio nos 7.080) — e' do gatilho dos LANCAMENTOS, `resolve_classificacao_from_plano`. A mesclagem troca o `favorecido_id` dos
-- lancamentos do absorvido; todo UPDATE passa pelo gatilho, e o lancamento cuja chave aponta para uma conta do plano INATIVA caia
-- no passo (4): o texto nao resolve (a conta esta' inativa) e o passo (5) recusava — mesmo sem ninguem ter mexido em conta nem
-- subcentro. O passo (3) ("UPDATE que nao mexe em chave nem texto: nao mexe") so' valia para lancamento SEM chave.
-- Populacao: 58 lancamentos, todos cancelados, em 3 contas inativas (Nutrição Cria / Recria / Engorda): Agnaldo 6, NJ 15, Vera 37.
-- Grupo Pontero (Vera): 3 cancelados do absorvido em "Nutrição Recria". Os 58 ficam INTOCADOS.
--
-- CONSERTO (decisao do Gabriel, 19/10): o passo (3) passa a valer com ou sem chave — conta e subcentro comparados por
-- IS NOT DISTINCT FROM — e REATIVAR (sair de cancelado) revalida. Efeito colateral medido e aceito: lancamento cancelado SEM
-- chave e com texto fora do plano (fora Dividendos) passa a ser recusado ao reativar (antes passava calado): Vera 4.734, Raul 147,
-- NJ 4, RRCC 1, Santa Rita 1. Trocar conta/subcentro para algo fora do plano continua recusado, como sempre.
--
-- Patch guardado por md5 (origem, ancora contada 1x, destino); so' CREATE OR REPLACE da funcao (nenhum DDL em tabela).
-- SECURITY DEFINER, dono e ACL preservados pelo pg_get_functiondef.
set local lock_timeout = '2s';

DO $patch$
declare
  c_origem  constant text := 'b1be54de753ecacd090d7a43638e15bc';
  c_destino constant text := '7c36c5134163784bee494508d656548d';
  v_oid oid := 'public.resolve_classificacao_from_plano()'::regprocedure;
  v_src text; v_new text;
  a1 constant text := $a$        -- (3) SEM CHAVE, UPDATE QUE NAO MEXE EM CHAVE NEM TEXTO: nao mexe (os dividendos fora do plano).
        IF TG_OP = 'UPDATE' AND NEW.plano_conta_id IS NULL AND NOT v_chave_mudou AND NOT v_texto_mudou THEN
          EXIT resolve;
        END IF;$a$;
  n1 constant text := $n$        -- (3) UPDATE QUE NAO MEXE EM CHAVE NEM TEXTO E NAO REATIVA: nao mexe — sem chave (os dividendos fora do plano) ou com a
        --     chave numa conta INATIVA (FORN-MESCLAR-02a: a mesclagem troca o favorecido e travava em "Nutricao Recria").
        --     Sair de cancelado (reativar) revalida.
        IF TG_OP = 'UPDATE' AND NEW.plano_conta_id IS NOT DISTINCT FROM OLD.plano_conta_id
           AND NEW.subcentro IS NOT DISTINCT FROM OLD.subcentro
           AND NOT (OLD.cancelado IS TRUE AND NEW.cancelado IS NOT TRUE) THEN
          EXIT resolve;
        END IF;$n$;
begin
  select prosrc into v_src from pg_proc where oid = v_oid;
  if md5(v_src) is distinct from c_origem then
    raise exception 'resolve_classificacao_from_plano: origem % (esperado %)', md5(v_src), c_origem;
  end if;
  -- a ancora casa 1x, e o CONCEITO tambem: quatro saidas do bloco `resolve`, uma so' recusa de texto fora do plano
  if (length(v_src) - length(replace(v_src, a1, ''))) / length(a1) <> 1
     or (select count(*) from regexp_matches(v_src, 'EXIT resolve', 'g')) <> 4
     or (select count(*) from regexp_matches(v_src, 'nao existe no plano de contas', 'g')) <> 1 then
    raise exception 'resolve_classificacao_from_plano: ancora nao casa exatamente 1x';
  end if;
  v_new := replace(v_src, a1, n1);
  if md5(v_new) is distinct from c_destino then
    raise exception 'resolve_classificacao_from_plano: destino % (esperado %)', md5(v_new), c_destino;
  end if;
  if position(v_src in pg_get_functiondef(v_oid)) = 0 then raise exception 'corpo nao achado na definicao'; end if;
  execute replace(pg_get_functiondef(v_oid), v_src, v_new);
  if (select md5(prosrc) from pg_proc where oid = v_oid) is distinct from c_destino then
    raise exception 'resolve_classificacao_from_plano: gravado diferente do destino';
  end if;
  if (select proacl::text from pg_proc where oid = v_oid) is distinct from '{postgres=X/postgres,service_role=X/postgres}'
     or not (select prosecdef from pg_proc where oid = v_oid) then
    raise exception 'resolve_classificacao_from_plano: ACL ou SECURITY DEFINER mudou';
  end if;
end
$patch$;
