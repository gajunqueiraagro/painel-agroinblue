-- REC-VALOR-CERTO-01 — a recorrencia marca FOLHA DE PAGAMENTO (Gabriel, 06/10/2026). Migration ADITIVA: uma coluna.
--
-- POR QUE
--   A tela de Recorrencias passa a dizer, por mes, quanto do recorrente e' VALOR CERTO, quanto e' A CONFIRMAR (ja' informado
--   ou ainda estimado) e quanto e' folha de pagamento. Sao dois atributos da REGRA.
--
-- ESTADO ANTERIOR (medido em 06/10/2026)
--   financeiro_recorrencias JA' TEM `tipo_valor text NOT NULL DEFAULT 'exato'`, CHECK ('exato' | 'estimado'), com COMMENT de
--   02/09/2026 dizendo exatamente a distincao pedida. As 176 linhas estao em 'exato'; nenhuma funcao e nenhuma tela a le'.
--   ⚠ O briefing pedia `valor_a_confirmar boolean`. NAO FOI CRIADA (decisao do Gabriel na pergunta de 06/10): seria uma
--     segunda coluna para a mesma verdade. 'exato' = "Valor certo"; 'estimado' = "A confirmar" — o vocabulario da TELA.
--   Nao existe marca de folha de pagamento em lugar nenhum.
--   fn_recorrencia_gerar md5(prosrc) = f1e0139104f7207c3d86216ba90966ba · fn_recorrencia_propagar = 6a932aa9771cbfb81ae09bbef4572f57
--
-- O QUE MUDA
--   A. `folha boolean NOT NULL DEFAULT false` — folha de pagamento. SEM BACKFILL: o sistema nao adivinha; o operador marca na tela.
--   B. O COMMENT de `tipo_valor` ganha o vocabulario da tela e a regra de quem diz "confirmado".
-- NAO MUDA: nenhuma funcao (gerar, propagar, cancelar, vencimento, vagas — as duas internas recebem a LINHA como parametro e
--   nao citam coluna nova), nenhuma policy, nenhuma ACL, nenhum valor de `tipo_valor`, nenhum lancamento. A tela grava a regra
--   por insert/update direto (RLS recorr_insert / recorr_update): nao ha' RPC para ensinar.
-- ⚠ VOCABULARIO: "Valor certo" e "A confirmar". PROIBIDO fixo/variavel (sao do DRE: custo fixo / custo variavel).
-- ⚠ `ADD COLUMN` com DEFAULT constante nao reescreve a tabela, mas pede ACCESS EXCLUSIVE por um instante: `lock_timeout` curto.

SET LOCAL lock_timeout = '3s';

DO $guarda$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'financeiro_recorrencias' AND column_name = 'folha') THEN
    RAISE EXCEPTION 'REC-VALOR-CERTO-01: a coluna folha ja existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.financeiro_recorrencias'::regclass AND conname = 'financeiro_recorrencias_tipo_valor_check'
                    AND pg_get_constraintdef(oid) = 'CHECK ((tipo_valor = ANY (ARRAY[''exato''::text, ''estimado''::text])))') THEN
    RAISE EXCEPTION 'REC-VALOR-CERTO-01: o CHECK de tipo_valor nao e o esperado';
  END IF;
END
$guarda$;

ALTER TABLE public.financeiro_recorrencias
  ADD COLUMN folha boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.financeiro_recorrencias.folha IS
  'Folha de pagamento (REC-VALOR-CERTO-01, Gabriel 06/10/2026). Atributo da REGRA, marcado pelo operador na tela; false em toda recorrencia anterior (sem backfill: o sistema nao adivinha). Na tela de Recorrencias e'' um SUBCONJUNTO do total do mes, nao uma quarta fatia.';

COMMENT ON COLUMN public.financeiro_recorrencias.tipo_valor IS
  'exato = a regra gera o lancamento pronto (telefone, aluguel: o valor e o valor). estimado = valor de referencia que muda todo mes (energia): o lancamento gerado nasce para CONFERIR antes de pagar — alvo do filtro de aprovacao mensal do dono. VOCABULARIO: nao usar fixo/variavel — reservado ao plano de contas (Custo Fixo/Variavel), a colisao confundiria os dois eixos. Decisao Gabriel 02/09/2026. NA TELA (REC-VALOR-CERTO-01, 06/10/2026): exato = "Valor certo", estimado = "A confirmar". O mes de uma recorrencia a confirmar esta'' CONFIRMADO quando a ocorrencia tem a marca financeiro_lancamentos_v2.valor_do_mes_em ou ja'' esta'' realizada/conciliada; senao e'' ESTIMADO. Mesmo no valor certo o valor do mes pode mudar (a marca do valor do mes vale para as duas).';
