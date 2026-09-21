-- MANDIOCA: separar o servico de GENTE do servico de MAQUINA no plano de contas.
--
-- ⚠ POR QUE. Os servicos da carga de mandioca caiam TODOS em "Operacoes de Colheita Agricultura"
--   (13110) porque a RPC resolvia o plano com DOIS destinos para TRES servicos:
--   `case when 'frete' then c_frete else c_colh end`. Arranquio (trabalho de gente) e
--   carregamento (hora de trator) somavam na mesma linha do DRE, e a pergunta "quanto foi maquina
--   e quanto foi gente" nao tinha resposta.
--   O GRAVADOR JA FOI CONSERTADO em 20261027123800 (mapa de tres: frete/trator/mao_obra). Esta
--   migration e' o PASSADO: os lancamentos que nasceram antes do mapa.
--
-- O QUE MUDA, medido no proto em 21/09/2026 (contagem por LANCAMENTO DISTINTO):
--   papel 'arranquio'    -> 21 lancamentos, R$  64.058,40  -> Diaristas e Empreita Lavoura (13100)
--   papel 'carregamento' -> 21 lancamentos, R$  22.878,00  -> Servicos Mecanizados Terc. (13160)
--                                           ------------
--                                           R$  86.936,40
-- ⚠ E' 21 DE CADA, NAO 42, e a diferenca importa para quem conferir o DRE depois. Uma carga de
--   mandioca dividida entre talhoes tem DUAS colheitas apontando para o MESMO lancamento de
--   servico, entao `agri_colheita_lancamentos` tem 42 elos para 21 lancamentos. Contar elos
--   dobraria o dinheiro: daria R$ 128.116,80 e R$ 45.756,00, o dobro exato. O `distinct` no
--   `lancamento_id` e' o que impede isso, aqui e em qualquer soma sobre esta tabela.
--
-- OS TRES SUBCENTROS, reconferidos por id antes de escrever:
--   ORIGEM   dece8dbe-a699-4ddb-ab28-a61b43a7d52f  Operacoes de Colheita Agricultura   13110
--   DESTINO  6fde19c6-524a-44da-ad64-86fff06e24a6  Diaristas e Empreita Lavoura        13100
--   DESTINO  25dc0eee-c873-427d-8e54-589757bb57ab  Servicos Mecanizados Terceirizados  13160
-- ⚠ OS TRES SAO `bloco_dre = 'custeio'` e `macro_custo = 'Custeio Producao'`: a reclassificacao
--   NAO move dinheiro entre blocos do DRE, so' reorganiza DENTRO do custeio. O total do custeio
--   da lavoura nao muda em um centavo — o que muda e' de que linha ele sai.
--
-- ⚠ OS 18 SEM ELO SAO INTOCAVEIS. O subcentro 13110 tem 60 lancamentos vivos: 42 com elo de
--   colheita (os 21+21 acima) e 18 SEM elo nenhum, que nao sao mandioca. O `EXISTS` sobre
--   `agri_colheita_lancamentos` com o PAPEL e' a chave — nao o texto da descricao, nao o valor,
--   nao a data. Contar chamador por substring conta prosa; aqui a regra e' o elo.
--
-- ⚠ E AS QUATRO COPIAS ANDAM JUNTO. `financeiro_lancamentos_v2` guarda `subcentro`,
--   `centro_custo`, `grupo_custo` e `macro_custo` por linha, copiados do plano. Mover
--   `plano_conta_id` sem alinha-las deixaria a linha dizendo "Operacoes de Colheita" enquanto
--   aponta para "Diaristas" — e cada relatorio escolheria uma das duas versoes. Elas saem do
--   proprio plano de destino, por subquery: literal aqui seria a quinta copia do mesmo texto.
--   (`grupo_custo` e `macro_custo` sao IGUAIS nos tres; entram assim mesmo, para a linha ficar
--   integra por construcao e nao por coincidencia.)
--
-- ⚠ A GUARDA TEM DUAS CONDICOES, e nenhuma delas filtra nada hoje — de proposito. Medido:
--   conciliados = 0 e nao-programados = 0 nos 42. Elas existem para o dia em que esta migration
--   for lida num banco onde isso ja' nao seja verdade: reclassificar um compromisso PAGO mudaria
--   o centro de custo de dinheiro que ja' saiu, e a conciliacao nao saberia disso.
--
-- ⚠ updated_at NAO se preserva nesta tabela, e a ausencia de updated_at = now() acima nao muda
--   isso: o trigger update_fin_lanc_v2_updated_at carimba now() em todo UPDATE. A intencao era
--   deixar updated_at contando a historia do dado — como o backfill 20261027122700 conseguiu em
--   agri_colheita, que NAO tem esse trigger. Aqui nao da sem desligar o trigger na transacao, e
--   isso nao se faz por uma reclassificacao. As 42 linhas ficaram com updated_at de 21/09, que e
--   o registro honesto: houve alteracao neste dia.
--
-- Aplicada no proto pelo arquiteto em 21/09/2026, sob GO do Gabriel, em BEGIN/verificacao/COMMIT
-- numa transacao so'; esta migration e' REGISTRO HISTORICO e NAO foi reaplicada ao ser escrita.
-- Conferido no banco DEPOIS de aplicar, por lancamento distinto:
--   arranquio    -> 6fde19c6  Diaristas e Empreita Lavoura        21 lanc, R$ 64.058,40
--   carregamento -> 25dc0eee  Servicos Mecanizados Terceirizados  21 lanc, R$ 22.878,00
--   origem dece8dbe: 18 lancamentos vivos, ZERO com elo de colheita — os nao-mandioca, intocados
--   as quatro copias (subcentro/centro_custo/grupo_custo/macro_custo) alinhadas ao destino
--
-- IDEMPOTENTE POR CONSTRUCAO: o `WHERE` exige `plano_conta_id = <ORIGEM>`. Depois de rodar, os 42
-- estao no destino e o mesmo comando casa ZERO linhas. Rodar de novo nao muda nada.

BEGIN;

-- (a) ARRANQUIO -> gente (Diaristas e Empreita Lavoura, 13100)
UPDATE public.financeiro_lancamentos_v2 l
   SET plano_conta_id = '6fde19c6-524a-44da-ad64-86fff06e24a6',
       subcentro    = d.subcentro,
       centro_custo = d.centro_custo,
       grupo_custo  = d.grupo_custo,
       macro_custo  = d.macro_custo
  FROM public.financeiro_plano_contas d
 WHERE d.id = '6fde19c6-524a-44da-ad64-86fff06e24a6'
   AND l.cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'
   AND l.plano_conta_id = 'dece8dbe-a699-4ddb-ab28-a61b43a7d52f'
   AND COALESCE(l.cancelado, false) = false
   AND l.status_transacao NOT IN ('realizado','conciliado')
   AND EXISTS (SELECT 1 FROM public.agri_colheita_lancamentos cl
                WHERE cl.lancamento_id = l.id AND cl.ativo AND cl.papel = 'arranquio')
   AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci
                    WHERE ci.lancamento_id = l.id AND ci.desfeito_em IS NULL);

-- (b) CARREGAMENTO -> maquina (Servicos Mecanizados Terceirizados, 13160)
UPDATE public.financeiro_lancamentos_v2 l
   SET plano_conta_id = '25dc0eee-c873-427d-8e54-589757bb57ab',
       subcentro    = d.subcentro,
       centro_custo = d.centro_custo,
       grupo_custo  = d.grupo_custo,
       macro_custo  = d.macro_custo
  FROM public.financeiro_plano_contas d
 WHERE d.id = '25dc0eee-c873-427d-8e54-589757bb57ab'
   AND l.cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'
   AND l.plano_conta_id = 'dece8dbe-a699-4ddb-ab28-a61b43a7d52f'
   AND COALESCE(l.cancelado, false) = false
   AND l.status_transacao NOT IN ('realizado','conciliado')
   AND EXISTS (SELECT 1 FROM public.agri_colheita_lancamentos cl
                WHERE cl.lancamento_id = l.id AND cl.ativo AND cl.papel = 'carregamento')
   AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci
                    WHERE ci.lancamento_id = l.id AND ci.desfeito_em IS NULL);

COMMIT;
