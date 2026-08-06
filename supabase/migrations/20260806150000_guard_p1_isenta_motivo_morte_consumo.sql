-- PR-GUARD-MOTIVO-P1-01
-- Contexto: para tipos 'morte' e 'consumo', a coluna fazenda_destino carrega
-- o MOTIVO/causa (convenção vigente do sistema), não uma localização.
-- O guard de mês fechado tratava fazenda_destino como campo estrutural e
-- bloqueava a correção de causa em meses P1-oficiais.
-- Mudança: isentar fazenda_destino da vigilância de UPDATE apenas quando
-- OLD.tipo IN ('morte','consumo'). Transferências/abates seguem vigiados.
-- Aplicada no banco proto em 06/08/2026 via Management API (fora do tooling
-- de migrations — por isso ausente de schema_migrations). Este arquivo
-- materializa o estado vivo (pg_get_functiondef) no repo.
-- ROLLBACK: restaurar o predicado original
--   OR (OLD.fazenda_destino IS DISTINCT FROM NEW.fazenda_destino)

CREATE OR REPLACE FUNCTION public.guard_lancamento_mes_fechado_p1()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      _mes_origem   text;
      _mes_destino  text;
      _p1_origem    text;
      _p1_destino   text;
      _orig_fechada boolean;
      _dest_fechado boolean;
      _par_mudou    boolean;
      _old_oficial  boolean;
      _new_oficial  boolean;
    BEGIN
      IF TG_OP = 'INSERT' AND NEW.cenario = 'meta' THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' AND OLD.cenario = 'meta' AND NEW.cenario = 'meta' THEN RETURN NEW; END IF;
      IF TG_OP = 'DELETE' AND OLD.cenario = 'meta' THEN RETURN OLD; END IF;

      IF TG_OP = 'INSERT' THEN
        _old_oficial := false;
        _new_oficial := NEW.cenario = 'realizado'
                        AND COALESCE(NEW.status_operacional, 'realizado') = 'realizado';
      ELSIF TG_OP = 'DELETE' THEN
        _old_oficial := OLD.cenario = 'realizado'
                        AND COALESCE(OLD.status_operacional, 'realizado') = 'realizado';
        _new_oficial := false;
      ELSE
        _old_oficial := OLD.cenario = 'realizado'
                        AND COALESCE(OLD.status_operacional, 'realizado') = 'realizado';
        _new_oficial := NEW.cenario = 'realizado'
                        AND COALESCE(NEW.status_operacional, 'realizado') = 'realizado';
      END IF;

      IF TG_OP = 'DELETE' THEN
        _mes_origem := substring(OLD.data::text, 1, 7);
        _p1_origem  := get_status_pilares_fechamento(OLD.fazenda_id, _mes_origem)
                       #>> '{p1_mapa_pastos,status}';
        IF _p1_origem = 'oficial' AND _old_oficial THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para excluir lançamentos.', _mes_origem;
        END IF;
        RETURN OLD;
      END IF;

      IF TG_OP = 'INSERT' THEN
        _mes_destino := substring(NEW.data::text, 1, 7);
        _p1_destino  := get_status_pilares_fechamento(NEW.fazenda_id, _mes_destino)
                        #>> '{p1_mapa_pastos,status}';
        IF _p1_destino = 'oficial' AND _new_oficial THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para inserir novos lançamentos.', _mes_destino;
        END IF;
        RETURN NEW;
      END IF;

      _mes_origem  := substring(OLD.data::text, 1, 7);
      _mes_destino := substring(NEW.data::text, 1, 7);
      _par_mudou   := (_mes_origem IS DISTINCT FROM _mes_destino)
                      OR (OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id);

      _p1_origem := get_status_pilares_fechamento(OLD.fazenda_id, _mes_origem)
                    #>> '{p1_mapa_pastos,status}';
      IF _par_mudou THEN
        _p1_destino := get_status_pilares_fechamento(NEW.fazenda_id, _mes_destino)
                       #>> '{p1_mapa_pastos,status}';
      ELSE
        _p1_destino := _p1_origem;
      END IF;

      _orig_fechada := (_p1_origem  = 'oficial');
      _dest_fechado := (_p1_destino = 'oficial');

      IF NOT _orig_fechada AND NOT _dest_fechado THEN
        RETURN NEW;
      END IF;

      IF OLD.cenario IS DISTINCT FROM NEW.cenario THEN
        RAISE EXCEPTION 'Período fechado no Mapa de Pastos (P1 oficial) envolvido (origem % / destino %). Não é possível alterar o cenário de um lançamento.', _mes_origem, _mes_destino;
      END IF;

      IF NOT _old_oficial AND NOT _new_oficial THEN
        RETURN NEW;
      END IF;

      IF _old_oficial AND NOT _new_oficial THEN
        IF _orig_fechada THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Não é possível remover um fato oficial do período fechado (demoção de status).', _mes_origem;
        END IF;
        RETURN NEW;
      END IF;

      IF NOT _old_oficial AND _new_oficial THEN
        IF _dest_fechado THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Não é possível promover lançamento a realizado em período fechado.', _mes_destino;
        END IF;
        RETURN NEW;
      END IF;

      IF _orig_fechada THEN
        IF (OLD.data               IS DISTINCT FROM NEW.data)
        OR (OLD.tipo               IS DISTINCT FROM NEW.tipo)
        OR (OLD.quantidade         IS DISTINCT FROM NEW.quantidade)
        OR (OLD.categoria          IS DISTINCT FROM NEW.categoria)
        OR (OLD.categoria_destino  IS DISTINCT FROM NEW.categoria_destino)
        OR (OLD.fazenda_id         IS DISTINCT FROM NEW.fazenda_id)
        OR (OLD.fazenda_destino IS DISTINCT FROM NEW.fazenda_destino AND OLD.tipo NOT IN ('morte','consumo'))
        OR (OLD.fazenda_origem     IS DISTINCT FROM NEW.fazenda_origem)
        OR (OLD.cancelado          IS DISTINCT FROM NEW.cancelado)
        OR (OLD.status_operacional IS DISTINCT FROM NEW.status_operacional)
        THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para alterar campos estruturais.', _mes_origem;
        END IF;
        RETURN NEW;
      END IF;

      IF _par_mudou AND _dest_fechado THEN
        RAISE EXCEPTION 'O mês destino % também está fechado no Mapa de Pastos (P1 oficial).', _mes_destino;
      END IF;

      RETURN NEW;
    END;
$function$;
