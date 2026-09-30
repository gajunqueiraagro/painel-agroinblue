# Parked: front do N:N do Espelho (2026-09-21)

Patch ao lado: `parked-espelho-nn-2026-09-21.patch` (guardado no PR-PARKED-NN-GUARDAR-01, 30/09/2026).
Arquivo alvo: `src/components/financeiro-v2/EspelhoConciliacaoTab.tsx`.

## O que e
Front do terceiro caminho da barra de conciliar do Espelho: N extratos x N lancamentos.
- `sentido` ganha `'n_n'` (2+ extratos e 2+ lancamentos marcados); a frase de bloqueio
  "marque 1 extrato para N lancamentos, ou N extratos para 1 lancamento" sai.
- 5 mensagens de recusa novas em `MOTIVO_CASAR_LABEL`: `minimo_dois_lancamentos`,
  `lancamento_repetido`, `mes_fechado`, `sobre_aplicacao`, `distribuicao_incompleta`.
- Chamada a `fn_espelho_casar_nn` (`p_extratos`, `p_itens` com valores, `p_simular: false`,
  motivo `casado_no_espelho_nn`).
- Helper `itensMarcados()` para montar os itens, usado tambem pelo 1:N.

## De quando
Disco: 21/09/2026 15:08. Nasceu do caso do arranquio: tres pagamentos (-22.276,80) contra sete
compromissos (-22.276,80), "diferenca 0,00" e o botao recusava, porque 3 x 7 nao cabia em
1:N nem em N:1.

## Por que nao foi publicado
`fn_espelho_casar_nn` NAO existe: nem no banco proto (so `fn_espelho_casar` e
`fn_espelho_casar_n1`), nem em migration, nem em commit nenhum (conferido em 30/09). Publicado
assim, o botao habilitaria e o clique daria "funcao nao encontrada". Compila (o `.rpc` e' `any`)
e passa nos gates — por isso nenhum gate o barraria.

## Como reaplicar
SO depois de a RPC existir no banco (SQL versionado, aplicado e validado — sequencia banco -> tela).

    git apply --check docs/investigacao/parked-espelho-nn-2026-09-21.patch
    git apply docs/investigacao/parked-espelho-nn-2026-09-21.patch

Se o `--check` falhar, o arquivo mudou depois de 30/09: conferir o conflito com os PRs
posteriores e reaplicar a mao, lendo o arquivo atual. Conferir tambem se o contrato da RPC
escrita bate com o que o patch manda (nomes dos parametros, formato de `p_itens`, codigos de
recusa).

## Frente dona
PR-CONCILIACAO-NN-01. Decisao de modelo: opcao A, "bloco" — confere o total e concilia o
conjunto junto, sem casamento par a par.
