-- FORN-MESCLAR-02a · mensagem da reativacao (Gabriel 19/10/2026). Depois da 20261027201800, reativar (sair de cancelado) revalida a
-- classificacao; a recusa dizia so' 'Subcentro "X" nao existe no plano de contas. Selecione um subcentro canonico.' — sem dizer que
-- a recusa vem da reativacao nem o que fazer, e para a conta INATIVA o "nao existe" nem e' verdade.
-- Agora, SO' no caminho da reativacao, duas frases:
--   conta do plano inativa: 'Para reativar este lançamento, escolha uma conta ativa do plano: "X" está inativa.'
--   texto fora do plano:    'Para reativar este lançamento, escolha uma conta do plano: o subcentro "X" não existe no plano de contas.'
-- Fora da reativacao a frase de sempre (nenhum mapa de frase do front a casa: o texto do banco passa como veio).
-- Patch guardado por md5 (origem, ancora contada 1x, destino); so' CREATE OR REPLACE da funcao. ACL e SECURITY DEFINER conferidos.
set local lock_timeout = '2s';

DO $patch$
declare
  c_origem  constant text := '7c36c5134163784bee494508d656548d';
  c_destino constant text := 'a09fcd93541681ded9e36eed089c3a67';
  v_oid oid := 'public.resolve_classificacao_from_plano()'::regprocedure;
  v_src text; v_new text;
  a1 constant text := $a$        IF NEW.macro_custo IS DISTINCT FROM 'Dividendos' THEN
          RAISE EXCEPTION 'Subcentro "%" nao existe no plano de contas. Selecione um subcentro canonico.', NEW.subcentro
            USING ERRCODE = 'check_violation';
        END IF;$a$;
  n1 constant text := $n$        IF NEW.macro_custo IS DISTINCT FROM 'Dividendos' THEN
          -- FORN-MESCLAR-02a: na REATIVACAO (sair de cancelado) a frase diz o gesto — conta inativa ou texto fora do plano; fora
          -- dela, a frase de sempre.
          IF TG_OP = 'UPDATE' AND OLD.cancelado IS TRUE AND NEW.cancelado IS NOT TRUE THEN
            IF NEW.plano_conta_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM public.financeiro_plano_contas pc WHERE pc.id = NEW.plano_conta_id AND pc.ativo = false) THEN
              RAISE EXCEPTION 'Para reativar este lançamento, escolha uma conta ativa do plano: "%" está inativa.', NEW.subcentro
                USING ERRCODE = 'check_violation';
            END IF;
            RAISE EXCEPTION 'Para reativar este lançamento, escolha uma conta do plano: o subcentro "%" não existe no plano de contas.', NEW.subcentro
              USING ERRCODE = 'check_violation';
          END IF;
          RAISE EXCEPTION 'Subcentro "%" nao existe no plano de contas. Selecione um subcentro canonico.', NEW.subcentro
            USING ERRCODE = 'check_violation';
        END IF;$n$;
begin
  select prosrc into v_src from pg_proc where oid = v_oid;
  if md5(v_src) is distinct from c_origem then
    raise exception 'resolve_classificacao_from_plano: origem % (esperado %)', md5(v_src), c_origem;
  end if;
  if (length(v_src) - length(replace(v_src, a1, ''))) / length(a1) <> 1
     or (select count(*) from regexp_matches(v_src, 'nao existe no plano de contas', 'g')) <> 1
     or (select count(*) from regexp_matches(v_src, 'RAISE EXCEPTION', 'g')) <> 2 then
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
