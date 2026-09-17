-- CONTA POR DIRECAO — os carimbos do legado, aplicados no proto em 17/09/2026.
--
-- As tres camadas anteriores garantem o FUTURO. Este arquivo e o passado: as linhas VIVAS que
-- nasceram antes delas e estavam com a conta na coluna errada, ou sem conta nenhuma. Depois
-- destes blocos o proto ficou com ZERO lancamento vivo sem conta e ZERO entrada viva com a conta
-- na origem (era 43 e 42, respectivamente).
--
-- ⚠ TUDO E IDEMPOTENTE POR CONSTRUCAO: cada UPDATE so alcanca o que ainda esta torto
-- (`conta IS NULL`, `cancelado = false`). Rodar de novo nao muda nada — e foi conferido: apos a
-- aplicacao, os cinco blocos afetam 0 linhas.
-- ⚠ E TRES GUARDAS SE REPETEM EM TODOS ELES, cada uma por um motivo:
--   `cancelado = false`      — cancelado e historia, nao se reescreve;
--   `conta ... IS NULL`      — carimbar so o vazio; conta preenchida e decisao de alguem;
--   `conciliado_em IS NULL`  — linha ja conciliada com o extrato tem conta provada pelo banco,
--                              e sobrescreve-la seria contradizer a conciliacao.
-- ⚠ O TRIGGER trg_00_conta_por_direcao JA ESTAVA NO AR quando estes UPDATEs rodaram: qualquer
-- UPDATE nesta tabela passa por ele, entao o bloco (a) e, na pratica, redundante com o trigger —
-- fica registrado porque foi o que de fato rodou, e porque um `UPDATE ... SET valor = valor` nao
-- e obvio para quem le depois.
--
-- ⚠ O CONSUMO INTERNO DO SANTA RITA NAO ENTRA AQUI, por decisao do Gabriel: ele e lancamento
-- `sem_movimentacao_caixa` e a conta ausente ali e correta, nao defeito. Fica para a frente dos
-- modais. (Conferido em 17/09: nao ha nenhuma linha viva de `consumo_rebanho` no proto hoje.)

-- (a) ENTRADAS QUE SO TINHAM A ORIGEM — a conta vai para a coluna do destino.
--     Eram 42 vivas (Agnaldo 20, NJ 19, Vera Ligia 2, Santa Rita 1).
UPDATE public.financeiro_lancamentos_v2
   SET conta_destino_id = conta_bancaria_id,
       conta_bancaria_id = NULL
 WHERE tipo_operacao LIKE '1-%'
   AND conta_destino_id IS NULL
   AND conta_bancaria_id IS NOT NULL
   AND cancelado = false
   AND conciliado_em IS NULL;

-- (b) CONTRATOS DE FINANCIAMENTO QUITADOS, SEM CONTA — recebem a conta principal do cliente.
--     Eram 11, todos `quitado`, todos criados em 20/04/2026, nenhum com parcela em aberto.
UPDATE public.financiamentos f
   SET conta_bancaria_id = m.conta_id
  FROM (VALUES
    ('3b9afa7a-0af6-4bce-8ec9-03b91484dfd8'::uuid),  -- NJ Pecuaria     · Banco do Brasil
    ('1afe76df-b61e-49f4-b637-f5ce020c778b'::uuid),  -- Vera Ligia      · Itau Personalite
    ('e05ed9ae-a962-4d77-883c-aaf3854c231b'::uuid),  -- Raul Juliato    · Bradesco Virtual
    ('219dbf52-6e0a-4017-ae18-961313ce7456'::uuid)   -- RRCC            · Sicoob Virtual
  ) AS m(conta_id)
  JOIN public.financeiro_contas_bancarias c ON c.id = m.conta_id
 WHERE f.conta_bancaria_id IS NULL
   AND f.cliente_id = c.cliente_id;

-- (c) OS LANCAMENTOS DAS PARCELAS herdam a conta do contrato a que pertencem.
UPDATE public.financeiro_lancamentos_v2 l
   SET conta_bancaria_id = f.conta_bancaria_id
  FROM public.financiamentos f
 WHERE l.financiamento_id = f.id
   AND l.tipo_operacao LIKE '2-%'
   AND l.conta_bancaria_id IS NULL
   AND f.conta_bancaria_id IS NOT NULL
   AND l.cancelado = false
   AND l.conciliado_em IS NULL;

-- (d) O RESTO DO LEGADO VIVO SEM CONTA, por cliente — a conta principal de cada um.
--     A direcao e respeitada: entrada recebe no destino, saida na origem. O trigger faria o
--     mesmo, mas o SET explicito diz a intencao a quem le.
UPDATE public.financeiro_lancamentos_v2 l
   SET conta_bancaria_id = CASE WHEN l.tipo_operacao LIKE '1-%' THEN NULL ELSE c.id END,
       conta_destino_id  = CASE WHEN l.tipo_operacao LIKE '1-%' THEN c.id ELSE NULL END
  FROM public.financeiro_contas_bancarias c
 WHERE c.id IN (
         '3b9afa7a-0af6-4bce-8ec9-03b91484dfd8',  -- NJ Pecuaria
         '1afe76df-b61e-49f4-b637-f5ce020c778b',  -- Vera Ligia Milani
         'e05ed9ae-a962-4d77-883c-aaf3854c231b',  -- Raul Juliato
         '219dbf52-6e0a-4017-ae18-961313ce7456'   -- RRCC
       )
   AND l.cliente_id = c.cliente_id
   AND l.conta_bancaria_id IS NULL
   AND l.conta_destino_id IS NULL
   AND l.tipo_operacao NOT LIKE '3-%'
   AND COALESCE(l.sem_movimentacao_caixa, false) = false
   AND l.cancelado = false
   AND l.conciliado_em IS NULL;
