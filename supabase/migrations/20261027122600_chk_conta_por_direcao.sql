-- CONTA POR DIRECAO — camada 3 de 3: o CHECK que impede a linha torta de nascer.
--
-- O trigger (20261027122400) ja normaliza; o CHECK e a rede: se alguem desligar o trigger, criar
-- outro caminho de escrita ou mexer na funcao, a linha torta para de passar em vez de entrar
-- calada. Tres camadas — normalizar, expor, garantir — e esta e a que nao depende de ninguem
-- lembrar da convencao.
--
-- ⚠ `NOT VALID`, E ISSO E DECISAO, NAO ATALHO: linhas CANCELADAS antigas violam a regra, e
-- cancelado e HISTORIA — nao se reescreve o que foi cancelado para caber numa convencao que nao
-- existia quando aquilo aconteceu. `NOT VALID` barra toda escrita NOVA e deixa o passado em paz.
-- Medido no proto em 17/09/2026, ja com os backfills aplicados: 15 linhas violam, TODAS
-- canceladas; zero vivas. (As 924 canceladas sem conta nenhuma NAO violam — ver o paragrafo
-- seguinte.) Validar depois (`VALIDATE CONSTRAINT`) exigiria mexer no historico: frente propria.
--
-- ⚠ A REGRA E DE COLUNA ERRADA, NAO DE CONTA OBRIGATORIA. Ela diz "entrada nao tem origem",
-- "saida nao tem destino" e "transferencia nao vai de uma conta para ela mesma" — e nada sobre
-- estar preenchida. Foi assim de proposito: existem 924 linhas canceladas sem conta nenhuma, e
-- exigir NOT NULL aqui misturaria dois problemas diferentes. Conta ausente e outra frente.
--
-- ⚠ `LIKE '3-%'` E OBRIGATORIO, e nao e preciosismo de estilo: existem DOIS valores de
-- transferencia no banco — `3-Transferências` (4.714 linhas, vivas) e `3-Transferência` no
-- SINGULAR (593 linhas, herdadas de mar-mai/2026, so das origens `migracao` e
-- `importacao_incremental`). Um `= '3-Transferências'` deixaria 593 linhas fora da regra.
-- ⚠ E JA EXISTE UM GUARD QUE CAIU NESSA ARMADILHA: `guard_transferencia_conta_destino` compara
-- com o SINGULAR e por isso nunca disparou em nenhuma das 4.714 transferencias vivas. Ele segue
-- ligado e decorativo — corrigi-lo ou remove-lo e frente propria, fora deste PR.
--
-- Aplicada no proto pelo arquiteto em 17/09/2026; esta migration e REGISTRO HISTORICO.
-- Definicao copiada de pg_get_constraintdef (convalidated = false) e conferida reaplicando este
-- arquivo em BEGIN/ROLLBACK sobre o proto: pg_get_constraintdef md5 ac1f0a3239b2c11a1d7a01e78ae8147c,
-- igual ao da constraint viva.

ALTER TABLE public.financeiro_lancamentos_v2
  DROP CONSTRAINT IF EXISTS chk_conta_por_direcao;

ALTER TABLE public.financeiro_lancamentos_v2
  ADD CONSTRAINT chk_conta_por_direcao CHECK (
    (((tipo_operacao ~~ '1-%'::text) AND (conta_bancaria_id IS NULL))
     OR ((tipo_operacao ~~ '2-%'::text) AND (conta_destino_id IS NULL))
     OR ((tipo_operacao ~~ '3-%'::text) AND ((conta_bancaria_id IS NULL)
                                             OR (conta_destino_id IS NULL)
                                             OR (conta_bancaria_id <> conta_destino_id))))
  ) NOT VALID;
