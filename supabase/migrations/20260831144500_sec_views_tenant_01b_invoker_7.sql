-- SEC-VIEWS-TENANT-01B — as sete ultimas views passam a aplicar o RLS de quem chama.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831143943.
--
-- O QUE ESTAVA ABERTO. `SEC-VIEWS-TENANT-01B` registrava, desde a frente de RLS, um risco
-- residual: views SEM `security_invoker` rodam com os privilegios do DONO e NAO aplicam o
-- RLS de quem chama. Todas tem SELECT para `authenticated`. Enquanto ficaram assim,
-- qualquer usuario autenticado alcancava, por elas, linhas de OUTROS clientes.
--
-- ⚠ O QUE SUBIU A PRIORIDADE FOI UM INCIDENTE, e vale registrar: em 31/08 nasceu uma NONA.
-- `vw_oc_operacao_compromissos_resumo` foi criada com `WITH (security_invoker = true)` e
-- PERDEU a opcao em dois `CREATE OR REPLACE` que omitiram a clausula — servindo 35 linhas
-- de 4 clientes distintos. Foi pega ao medir `pg_class.reloptions` ANTES de versionar
-- aquela migration, e corrigida no mesmo dia (20260831131120). Uma divida que era teorica
-- virou um caso concreto em horas; as outras sete deixaram de esperar.
-- LICAO QUE FICA: `CREATE OR REPLACE VIEW` NAO preserva as reloptions quando o `WITH` e'
-- omitido, e a perda e' SILENCIOSA — nenhum erro, nenhuma tela quebrada, so' o isolamento
-- por cliente sumindo.
--
-- ⚠ `ALTER`, e nao `CREATE OR REPLACE`: os corpos estao certos e reescreve-los para mudar
-- uma OPCAO seria arriscar sete definicoes por nada. `ALTER` tambem preserva os GRANTs.
--
-- ⚠ PROVA DE IDENTIDADE DO CONTEUDO (arquiteto): sete contagens da Vera identicas antes e
-- depois, pela Management API. Ela mede CONTEUDO, e nao RLS — pelo caminho da Management
-- API nao ha JWT de usuario, entao o efeito do `security_invoker` nao aparece ali. O que
-- ela prova e' que nenhuma view mudou de resultado; o caminho AUTENTICADO e' homologacao
-- runtime do Gabriel, na Visao Geral.
--
-- ⚠⚠ VIGIAR POS-DEPLOY: se alguma tela do PC-100 ZERAR, e' porque aquela view enxergava
-- alem do RLS DE PROPOSITO (agregado global, comparativo entre clientes). Nesse caso:
-- reportar QUAL, reverter o `ALTER` daquela — e so' daquela — e registra-la como excecao
-- DOCUMENTADA, com o motivo escrito. Excecao sem motivo escrito e' o furo de volta.
--
-- ⚠ ESTADO APOS ESTA MIGRATION, medido: 17 views no schema `public`, 17 com invoker, ZERO
-- sem. ⚠ CUIDADO AO CONFERIR: o schema tem DUAS grafias vivas — `security_invoker=true` e
-- `security_invoker=on`. As duas sao o mesmo booleano para o Postgres, mas um gate que
-- compare a STRING `'security_invoker=true'` acusa falso positivo (foi o que aconteceu na
-- primeira medicao desta sessao). Conferir pelo VALOR, nunca pelo texto:
--     lower(split_part(opt,'=',2)) in ('true','on','1','yes')
--
-- Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao sem homologacao propria.

ALTER VIEW public.vw_financeiro_auditoria_competencia_caixa SET (security_invoker = true);
ALTER VIEW public.vw_financeiro_dashboard_mensal            SET (security_invoker = true);
ALTER VIEW public.vw_financeiro_desembolso_centro           SET (security_invoker = true);
ALTER VIEW public.vw_financeiro_fluxo_caixa_mensal          SET (security_invoker = true);
ALTER VIEW public.vw_valor_rebanho_realizado_global_mensal  SET (security_invoker = true);
ALTER VIEW public.vw_zoot_categoria_mensal                  SET (security_invoker = true);
ALTER VIEW public.vw_zoot_fazenda_mensal                    SET (security_invoker = true);
