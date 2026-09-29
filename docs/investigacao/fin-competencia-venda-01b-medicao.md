# FIN-COMPETENCIA-VENDA-01b — medição (etapa 1, só leitura)

29/09/2026. Banco proto, depois do 01a (86e983ac). A nova competência vem da função REAL `_oc_competencia_pela_saida`
(lida pelo canal de escrita só com SELECT: o canal só-leitura não tem EXECUTE nela). Nada gravado.

## Resumo

| Alvo | O quê | Linhas | Entram no DRE |
|---|---|---|---|
| A-cc | recebimento ligado a OC de conta corrente, competência ou safra ≠ primeira saída | 129 (118 competência + 11 só safra) | 0 (`compoe_dre = false`; a receita vem da entrega) |
| A-tit | recebimento ligado a OC por título, idem | 13 | 13 (mudam 1 dia, no mesmo mês) |
| B | recebimento solto com UMA saída candidata, competência ou safra ≠ a da saída | 24 (de 27 com saída única) | 24 |
| **Total** | | **166** | **37** |

Por cliente: NJ 45 A-cc + 4 A-tit + 10 B · Santa Rita 64 A-cc + 5 A-tit + 12 B · Raul 16 A-cc · Agnaldo 4 A-cc + 2 B ·
Vera 4 A-tit. **93 das 166 mudam de mês**; no DRE, só 3 anos da Santa Rita mudam de valor (abaixo).

Fora, como pedido: boitel (nenhum na lista), várias candidatas, nenhuma candidata.

## DRE pecuária — receita de vendas/abates por competência, cliente × ano (só os anos que mudam)

| Cliente | Ano | Receita antes (todos os recebimentos) | Receita depois | Diferença |
|---|---|---|---|---|
| Santa Rita Agro | 2024 | 4.926.846,75 | 5.245.377,74 | +318.530,99 |
| Santa Rita Agro | 2025 | 8.504.803,42 | 8.258.872,43 | −245.930,99 |
| Santa Rita Agro | 2026 | 8.620.222,90 | 8.547.622,90 | −72.600,00 |

Soma das diferenças = 0 (a receita troca de ano, não some). Os outros clientes e anos: mesmo total por ano (mudam só mês).
- Quem troca de ano (os três são do alvo B): `cec9fde6` e `f0643b79` (Guidara, abate de 80 cab, saída 01/12/24, pagos em
  24/01/25 e 06/01/25) vão de 2025 para 2024 — somam os +318.530,99; `0255e1d1` (Walter Barros, venda 022 vacas, pago
  05/01/26, saída 06/10/25) vai de 2026 para 2025 — os −72.600,00. 2025 = −318.530,99 + 72.600,00 = −245.930,99.
- Base "antes" = soma de `valor` dos recebimentos de venda/abate/boitel com `compoe_dre`, realizado, não cancelado, por ano de
  competência. É medida por soma direta, não pela `fn_dre_pecuaria`: a etapa 2 compara a saída da RPC real antes × depois.

## Decisões de leitura (conferir)

1. **"Editado à mão" = `editado_manual` E competência ≠ pagamento E competência ≠ `data_operacao` da OC.** Os 13 A-tit têm
   `editado_manual = true` e competência ≠ pagamento, mas a competência deles É a `data_operacao` — valor gravado pela OC, não
   digitado. Pela leitura literal do briefing os 9 com competência ≠ pagamento sairiam; pela leitura acima, entram. Com ela,
   **nenhum** alvo cai em "editado à mão" (nenhum A-cc tem competência ≠ pagamento com `editado_manual`; o único B com
   `editado_manual` divergente já tem a competência da saída e não está na lista).
2. **Os 13 A-tit são os 8 abates em que a OC tem a data do abate e a saída é o embarque, 1 dia antes.** Nenhum muda de mês.
3. **A regra da 01a não cobre quem GERA o título.** `oc_materializar_programacao` grava `data_competencia` e
   `fn_safra_sugerida(..., v_op.data_operacao, ...)` (linhas 89 e 102 do corpo): os 13 A-tit nasceram assim (nenhum tem evento
   de vínculo). Corrigi-los no lote sem mexer no gerador faz o próximo abate nascer com a data da OC de novo. Proposta: frente
   curta (01a-2) que troca `data_operacao` pela primeira saída no gerador, antes ou junto do lote.
4. **Saída DEPOIS do pagamento** (a competência vai para frente): `52c13a7c` (NJ, "Venda 001 nov. carneada", pago 26/08/22 →
   10/12/22, OC 7c7e6d96) é o maior salto e parece OC com a saída errada; `0b3f1412` (B, pago 18/03/22 → saída 12/04/22) e
   `385d9f1c`, `f9d03e86` menores. A regra aceita (adiantamento), mas vale olhar o 52c13a7c antes do OK.
5. **B usa a mesma régua da FASE 0** (−120/+30 dias, destino ≈ favorecido ≥ 0,3, sem `movimentacao_rebanho_id`). Nenhuma saída
   candidata do B já está em OC. B **não** liga à OC: só competência e safra, com a saída usada no evento.
6. Nos A-cc, a mudança não toca o DRE; muda o filtro "por competência" e a safra do Financeiro. 11 mudam só a safra
   (competência já certa, safra de outra temporada ou nula).

## Lista nominal (166)

Colunas: alvo · lançamento · cliente · favorecido · descrição · pagamento · competência hoje → nova · safra hoje → nova ·
de onde vem a data (OC ou saída candidata) · entra no DRE.

| Alvo | Lanç. | Cliente | Favorecido | Descrição | Pag. | Competência | Safra | Origem | DRE |
|---|---|---|---|---|---|---|---|---|---|
| A-cc | fff8a478 | Agnaldo Cedenho | Agnaldo Pereira Cedenho | Venda 073 Nov.  | 15/12/20 | 15/12/20 → 20/11/20 | 20/21-Pec → 20/21-Pec | OC e5719192 | não |
| A-cc | f9d03e86 | Agnaldo Cedenho | José Luiz Freitas | Venda 002 Bois | 15/01/21 | 15/01/21 → 01/01/21 | — → 20/21-Pec | OC fc1eddec | não |
| A-cc | bc1defba | Agnaldo Cedenho | Verificar (troca) | Venda 021 Garrotes (troca) | 10/06/21 | 10/06/21 → 17/05/21 | — → 20/21-Pec | OC 8ddeb747 | não |
| A-cc | 385d9f1c | Agnaldo Cedenho | Francis Roberto dos Santos | Venda 06 Desm. F | 19/09/25 | 19/09/25 → 01/10/25 | 25/26-Pec → 25/26-Pec | OC 3513d916 | não |
| A-cc | 7be28ef4 | NJ Pecuária | Eduardo Cavalvante Estevam | Venda 373 nov. - 1/3 | 27/01/20 | 27/01/20 → 29/01/20 | — → — | OC 40974439 | não |
| A-cc | 852fd3df | NJ Pecuária | Eduardo Cavalvante Estevam | Venda 373 nov. - 3/3 | 04/03/20 | 04/03/20 → 29/01/20 | — → — | OC 40974439 | não |
| A-cc | ae371301 | NJ Pecuária | Eduardo Cavalvante Estevam | Venda 373 nov. - 2/3 | 14/02/20 | 14/02/20 → 29/01/20 | — → — | OC 40974439 | não |
| A-cc | ecf1c666 | NJ Pecuária | Julio Inácio Correa | Venda 160 Vacas | 16/03/20 | 16/03/20 → 18/03/20 | — → — | OC b0e16482 | não |
| A-cc | 2b6c7093 | NJ Pecuária | Dario Ushiro | Venda 092 bezerros - 2/2 | 06/05/20 | 06/05/20 → 13/04/20 | — → — | OC de46c43a | não |
| A-cc | 4703c592 | NJ Pecuária | Dario Ushiro | Venda 092 bezerros - 1/2 | 06/04/20 | 06/04/20 → 13/04/20 | — → — | OC de46c43a | não |
| A-cc | 0777de69 | NJ Pecuária | Eduardo Cavalvante Estevam | Venda 358 nov. -1/3 | 28/04/20 | 28/04/20 → 25/04/20 | — → — | OC 62acc7e4 | não |
| A-cc | 16760d77 | NJ Pecuária | Eduardo Cavalvante Estevam | Venda 358 nov. -3/3 | 24/06/20 | 24/06/20 → 25/04/20 | — → — | OC 62acc7e4 | não |
| A-cc | 9ec17658 | NJ Pecuária | Eduardo Cavalvante Estevam | Venda 358 nov. -2/3 | 19/05/20 | 19/05/20 → 25/04/20 | — → — | OC 62acc7e4 | não |
| A-cc | 3d09ed0c | NJ Pecuária | Gilson Marques | Venda 018 Desm. F | 01/06/20 | 01/06/20 → 01/05/20 | — → — | OC fd129f67 | não |
| A-cc | c4198fca | NJ Pecuária | Dario Ushiro | Venda 035 Desm. M - 2/2 | 22/06/20 | 22/06/20 → 19/05/20 | — → — | OC b74cfd38 | não |
| A-cc | dfbbc2c7 | NJ Pecuária | Dario Ushiro | Venda 035 Desm. M - 1/2 | 08/05/20 | 08/05/20 → 19/05/20 | — → — | OC b74cfd38 | não |
| A-cc | 670f0677 | NJ Pecuária | Jandira Cales Fonseca | Venda 018 Desm. F | 20/06/20 | 20/06/20 → 06/06/20 | — → — | OC fcf05d5e | não |
| A-cc | c212eab4 | NJ Pecuária | Helder Hofig | Venda 382 nov. 1/2 | 06/10/20 | 06/10/20 → 02/10/20 | 20/21-Pec → 20/21-Pec | OC 4f5432d8 | não |
| A-cc | def1ba37 | NJ Pecuária | Helder Hofig | Venda 382 nov. 2/2 | 06/10/20 | 06/10/20 → 02/10/20 | 20/21-Pec → 20/21-Pec | OC 4f5432d8 | não |
| A-cc | 7a77b613 | NJ Pecuária | Danilo Pereira Carreia | Venda 084 Garrotes | 08/02/21 | 08/02/21 → 10/02/21 | 20/21-Pec → 20/21-Pec | OC f4f8a6ce | não |
| A-cc | 4ef04bbe | NJ Pecuária | Carlos Nascimento Junior | Venda 500 nov. - 2/2 | 15/06/21 | 15/06/21 → 06/04/21 | 20/21-Pec → 20/21-Pec | OC af334f9c | não |
| A-cc | 55a26c79 | NJ Pecuária | Carlos Nascimento Junior | Venda 500 nov. - 1/2 | 08/03/21 | 08/03/21 → 06/04/21 | 20/21-Pec → 20/21-Pec | OC af334f9c | não |
| A-cc | c11acf21 | NJ Pecuária | Carlos Nascimento Junior | Venda 500 nov. - juros | 10/06/21 | 10/06/21 → 06/04/21 | 20/21-Pec → 20/21-Pec | OC af334f9c | não |
| A-cc | d2ec5439 | NJ Pecuária | Comercio de Madeiras Uniao LTDA | Venda 500 Novilhas - Saldo | 10/06/21 | 10/06/21 → 06/04/21 | — → 20/21-Pec | OC af334f9c | não |
| A-cc | 2fc6d1ee | NJ Pecuária | Gustavo Vasque | Venda 200 vacas - 2/2 | 09/04/21 | 09/04/21 → 12/04/21 | 20/21-Pec → 20/21-Pec | OC 99644b1c | não |
| A-cc | 3dbac62a | NJ Pecuária | Gustavo Vasque | Venda 200 vacas - 1/2 | 31/03/21 | 31/03/21 → 12/04/21 | 20/21-Pec → 20/21-Pec | OC 99644b1c | não |
| A-cc | 6b2fdb97 | NJ Pecuária | Adilson Guimaro Abegão | Venda 233 Garrotes - Nelores | 29/04/21 | 29/04/21 → 26/04/21 | 20/21-Pec → 20/21-Pec | OC 3b6495b4 | não |
| A-cc | 463961c4 | NJ Pecuária | Lucila Zahran | Venda 407 femeas - 2/2 | 23/05/22 | 23/05/22 → 22/04/22 | 21/22-Pec → 21/22-Pec | OC 4520abbd | não |
| A-cc | e3efedde | NJ Pecuária | Lucila Zahran | Venda 407 femeas - 1/2 | 13/04/22 | 13/04/22 → 22/04/22 | 21/22-Pec → 21/22-Pec | OC 4520abbd | não |
| A-cc | 11857336 | NJ Pecuária | Moacyr Furlan | Venda 150 Femeas - 1/4 | 09/01/23 | 09/01/23 → 05/12/22 | 22/23-Pec → 22/23-Pec | OC 10bcfa0c | não |
| A-cc | 1e639996 | NJ Pecuária | Constantino Pereira Beretta | Venda 025 novilhas | 06/12/22 | 06/12/22 → 05/12/22 | 22/23-Pec → 22/23-Pec | OC 26ad9bec | não |
| A-cc | 2dbf8706 | NJ Pecuária | Moacyr Furlan | Venda 150 Femeas - 2/4 | 10/01/23 | 10/01/23 → 05/12/22 | 22/23-Pec → 22/23-Pec | OC 10bcfa0c | não |
| A-cc | 50edc3b7 | NJ Pecuária | Carlos Pacheco | Venda 030 novilhas - 1/2 | 09/01/23 | 09/01/23 → 05/12/22 | 22/23-Pec → 22/23-Pec | OC f277ee1c | não |
| A-cc | 6904b836 | NJ Pecuária | Moacyr Furlan | Venda 150 Femeas - 4/4 | 30/01/23 | 30/01/23 → 05/12/22 | 22/23-Pec → 22/23-Pec | OC 10bcfa0c | não |
| A-cc | 745bc627 | NJ Pecuária | Carlos Pacheco | Venda 030 novilhas - 2/2 | 10/01/23 | 10/01/23 → 05/12/22 | 22/23-Pec → 22/23-Pec | OC f277ee1c | não |
| A-cc | 9a48998c | NJ Pecuária | Moacyr Furlan | Venda 150 Femeas - 3/4 | 10/01/23 | 10/01/23 → 05/12/22 | 22/23-Pec → 22/23-Pec | OC 10bcfa0c | não |
| A-cc | 52c13a7c | NJ Pecuária | Jair Mathias Leal | Venda 001 nov. carneada | 26/08/22 | 26/08/22 → 10/12/22 | 22/23-Pec → 22/23-Pec | OC 7c7e6d96 | não |
| A-cc | 2a2d3573 | NJ Pecuária | Carlos Nascimento Junior | Venda 439 Novilhas | 22/06/23 | 22/06/23 → 22/03/23 | 22/23-Pec → 22/23-Pec | OC 1c216515 | não |
| A-cc | 37c93526 | NJ Pecuária | Carlos Nascimento Junior | Venda 439 Novilhas | 16/06/23 | 16/06/23 → 22/03/23 | 22/23-Pec → 22/23-Pec | OC 1c216515 | não |
| A-cc | 3a2e8faf | NJ Pecuária | Carlos Nascimento Junior | Venda 439 Novilhas | 29/05/23 | 29/05/23 → 22/03/23 | 22/23-Pec → 22/23-Pec | OC 1c216515 | não |
| A-cc | 3d2fdcb6 | NJ Pecuária | Carlos Nascimento Junior | Venda 439 Novilhas | 23/06/23 | 23/06/23 → 22/03/23 | 22/23-Pec → 22/23-Pec | OC 1c216515 | não |
| A-cc | c0d64db3 | NJ Pecuária | Carlos Nascimento Junior | Venda 439 Novilhas | 15/04/23 | 15/04/23 → 22/03/23 | 22/23-Pec → 22/23-Pec | OC 1c216515 | não |
| A-cc | ed51efe3 | NJ Pecuária | Carlos Nascimento Junior | Venda 439 Novilhas | 26/06/23 | 26/06/23 → 22/03/23 | 22/23-Pec → 22/23-Pec | OC 1c216515 | não |
| A-cc | f66fa035 | NJ Pecuária | Carlos Nascimento Junior | Venda 439 Novilhas | 15/06/23 | 15/06/23 → 22/03/23 | 22/23-Pec → 22/23-Pec | OC 1c216515 | não |
| A-cc | 10d0ff6d | NJ Pecuária | João Maria Carneiro Gomes | Venda 177 Novilhas | 20/07/23 | 20/07/23 → 31/07/23 | — → 23/24-Pec | OC 2d1cb9f0 | não |
| A-cc | bd6068b1 | NJ Pecuária | Leonildo/Luciane Denari | Venda 33 machos | 20/09/23 | 20/09/23 → 20/09/23 | — → 23/24-Pec | OC 794af477 | não |
| A-cc | f41837fc | NJ Pecuária | Dona Amelia Agropastoril | Venda 200 vacas - 2/2 | 18/04/24 | 18/04/24 → 05/03/24 | 23/24-Pec → 23/24-Pec | OC 125448f9 | não |
| A-cc | 5f5c744b | NJ Pecuária | Jose Luiz Ferreira | Venda 180 vacas | 20/03/24 | 20/03/24 → 21/03/24 | 23/24-Pec → 23/24-Pec | OC aee6af1b | não |
| A-cc | e6260a75 | NJ Pecuária | Adilton Boff Cardoso | Venda 224 novilhas - 2/2 | 05/03/25 | 05/03/25 → 28/02/25 | 24/25-Pec → 24/25-Pec | OC 31766a11 | não |
| A-cc | 326e71f1 | Raul Juliato | Onorato Cunha (Faz. Jamaica) | Venda 112 Desm. M | 16/07/21 | 16/07/21 → 16/07/21 | — → 21/22-Pec | OC 30f8c8dd | não |
| A-cc | a667af97 | Raul Juliato | Alex Muller | Venda 09 Desm. F (sem NF) | 17/07/21 | 17/07/21 → 17/07/21 | — → 21/22-Pec | OC 97e714c8 | não |
| A-cc | eff76791 | Raul Juliato | Grupo Gasparim | Venda 081 Desmama M | 09/05/22 | 09/05/22 → 09/05/22 | — → 21/22-Pec | OC 4742c677 | não |
| A-cc | 760f7a54 | Raul Juliato | Grupo Gasparim | Venda 066 Desmama M | 10/05/22 | 10/05/22 → 10/05/22 | — → 21/22-Pec | OC 13fb9b46 | não |
| A-cc | 242eba2a | Raul Juliato | Carlinhos | Venda 031 Desmama M | 27/07/22 | 27/07/22 → 28/06/22 | — → 21/22-Pec | OC 0d688774 | não |
| A-cc | c8710400 | Raul Juliato | Carlos Viacava | Venda 114 Desmama F | 30/08/22 | 30/08/22 → 29/08/22 | — → 22/23-Pec | OC 2c8e35f7 | não |
| A-cc | 8134c8bf | Raul Juliato | Fachiolli | Venda 075 Desmama M | 23/05/23 | 23/05/23 → 23/05/23 | — → 22/23-Pec | OC 9c8f4fa7 | não |
| A-cc | f739d0b6 | Raul Juliato | Fachiolli | Venda 051 Desmama M | 27/06/23 | 27/06/23 → 27/06/23 | — → 22/23-Pec | OC b3448a97 | não |
| A-cc | c2fccc53 | Raul Juliato | Fachiolli | Venda 028 Desmama M. | 01/07/23 | 01/07/23 → 28/07/23 | — → 23/24-Pec | OC 5b903c63 | não |
| A-cc | 5eba7266 | Raul Juliato | Erivaldo | Venda 007 Touros | 15/02/24 | 15/02/24 → 15/02/24 | — → 23/24-Pec | OC 99608c6f | não |
| A-cc | 1259ea31 | Raul Juliato | Luiz Carlos | Venda 004 Desmama M | 27/02/24 | 27/02/24 → 27/02/24 | — → 23/24-Pec | OC 8f6d3e03 | não |
| A-cc | 2f2c995f | Raul Juliato | Cride? Atualizar nome | Venda 185 Desmama M | 30/07/24 | 30/07/24 → 01/07/24 | — → 24/25-Pec | OC 4da118c5 | não |
| A-cc | a3bb3304 | Raul Juliato | Guilherme Sampaio | Venda 153 Desmama F | 30/07/24 | 30/07/24 → 11/07/24 | — → 24/25-Pec | OC dbaddbbc | não |
| A-cc | 7f37afda | Raul Juliato | Luiz Carlos | Venda 005 Garrotes | 23/04/25 | 23/04/25 → 23/04/25 | — → 24/25-Pec | OC 8691fe30 | não |
| A-cc | 35d74628 | Raul Juliato | Fachiolli | Venda 090 Desm.M-1/2 | 18/07/25 | 18/07/25 → 18/06/25 | 25/26-Pec → 24/25-Pec | OC a9038e12 | não |
| A-cc | 73b2fff2 | Raul Juliato | Fachiolli | Venda 090 Desm.M-2/2 | 18/08/25 | 18/08/25 → 18/06/25 | 25/26-Pec → 24/25-Pec | OC a9038e12 | não |
| A-cc | 16c8ef9e | Santa Rita Agro | Walter Barros | Venda 060 DM  | 20/02/20 | 20/02/20 → 13/02/20 | — → — | OC dc82dbe0 | não |
| A-cc | 0786a996 | Santa Rita Agro | Paulo Soriano | Venda 159 Desm.M - 3/3 | 28/08/20 | 28/08/20 → 17/06/20 | 20/21-Pec → — | OC fb64d4d6 | não |
| A-cc | 535836b8 | Santa Rita Agro | Paulo Soriano | Venda 159 Desm.M - 1/3 | 22/06/20 | 22/06/20 → 17/06/20 | — → — | OC fb64d4d6 | não |
| A-cc | ef02c978 | Santa Rita Agro | Paulo Soriano | Venda 159 Desm.M - 2/3 | 06/07/20 | 06/07/20 → 17/06/20 | 20/21-Pec → — | OC fb64d4d6 | não |
| A-cc | f6d9d80e | Santa Rita Agro | Paulo Cesar Laguna | Venda 105 Desm.M | 13/08/20 | 13/08/20 → 03/07/20 | 20/21-Pec → 20/21-Pec | OC cfdccb40 | não |
| A-cc | 2c6b2926 | Santa Rita Agro | Jorge Temporim | Venda 088 Desm.M | 09/10/20 | 09/10/20 → 30/10/20 | 20/21-Pec → 20/21-Pec | OC 47f90503 | não |
| A-cc | 54b11b98 | Santa Rita Agro | Jorge Temporim | Venda 012 Desm.M - 1/3 | 11/11/20 | 11/11/20 → 30/10/20 | 20/21-Pec → 20/21-Pec | OC 18742d2b | não |
| A-cc | c3ee3a57 | Santa Rita Agro | Jorge Temporim | Venda 012 Desm.M - 2/3 | 12/11/20 | 12/11/20 → 30/10/20 | 20/21-Pec → 20/21-Pec | OC 18742d2b | não |
| A-cc | e6f0aa77 | Santa Rita Agro | Jorge Temporim | Venda 012 Desm.M - 3/3 | 19/11/20 | 19/11/20 → 30/10/20 | 20/21-Pec → 20/21-Pec | OC 18742d2b | não |
| A-cc | 6cee559d | Santa Rita Agro | Paulo Soriano | Venda 091 Desm.M -1/2 | 15/12/20 | 15/12/20 → 19/11/20 | 20/21-Pec → 20/21-Pec | OC 6ec81174 | não |
| A-cc | b5daf89a | Santa Rita Agro | Paulo Soriano | Venda 091 Desm.M -2/2 | 15/12/20 | 15/12/20 → 19/11/20 | 20/21-Pec → 20/21-Pec | OC 6ec81174 | não |
| A-cc | a9c7ae51 | Santa Rita Agro | Walter Barros | Venda 042 novilhas -2/2 | 01/02/21 | 01/02/21 → 01/12/20 | 20/21-Pec → 20/21-Pec | OC e54251e6 | não |
| A-cc | d2dd7ea8 | Santa Rita Agro | Walter Barros | Venda 042 novilhas -1/2 | 03/01/21 | 03/01/21 → 01/12/20 | 20/21-Pec → 20/21-Pec | OC e54251e6 | não |
| A-cc | c2d87a56 | Santa Rita Agro | Paulo Soriano | Venda 070 Desm.M | 29/01/21 | 29/01/21 → 17/12/20 | 20/21-Pec → 20/21-Pec | OC 72ad5ec7 | não |
| A-cc | 2f321884 | Santa Rita Agro | Paulo Soriano | Venda 088 Desm. M - 2/2 | 30/04/21 | 30/04/21 → 15/04/21 | 20/21-Pec → 20/21-Pec | OC 1c2a27f4 | não |
| A-cc | 57251bdc | Santa Rita Agro | Paulo Soriano | Venda 088 Desm. M - 1/2 | 14/04/21 | 14/04/21 → 15/04/21 | 20/21-Pec → 20/21-Pec | OC 1c2a27f4 | não |
| A-cc | 4283d1e4 | Santa Rita Agro | Paulo Soriano | Venda 042 Desm.M | 08/06/21 | 08/06/21 → 21/05/21 | 20/21-Pec → 20/21-Pec | OC 6505f606 | não |
| A-cc | a48df8b2 | Santa Rita Agro | Margareth Roseane Cavalli | Venda 153 Desm.M | 22/07/21 | 22/07/21 → 17/06/21 | 21/22-Pec → 20/21-Pec | OC 8e22374e | não |
| A-cc | 57fa6647 | Santa Rita Agro | Margareth Roseane Cavalli | Venda 073 Desm.M | 23/07/21 | 23/07/21 → 22/06/21 | 21/22-Pec → 20/21-Pec | OC c6749793 | não |
| A-cc | f357d124 | Santa Rita Agro | Margareth Roseane Cavalli | Venda 058 Desm.M | 23/07/21 | 23/07/21 → 14/07/21 | 21/22-Pec → 21/22-Pec | OC dc3a3c67 | não |
| A-cc | 3199042e | Santa Rita Agro | Margareth Roseane Cavalli | Venda 209 Desm.M | 13/10/21 | 13/10/21 → 08/10/21 | 21/22-Pec → 21/22-Pec | OC 7f1293a6 | não |
| A-cc | aef551bf | Santa Rita Agro | Margareth Roseane Cavalli | Venda 051 Desm.M | 23/11/21 | 23/11/21 → 19/11/21 | 21/22-Pec → 21/22-Pec | OC ac76f308 | não |
| A-cc | dd7eef73 | Santa Rita Agro | Margareth Roseane Cavalli | Venda 133 Desm.M | 29/12/21 | 29/12/21 → 28/12/21 | 21/22-Pec → 21/22-Pec | OC 2b3f0055 | não |
| A-cc | bc5b4b1f | Santa Rita Agro | Walter Barros | Venda 020 Desm.F | 03/05/22 | 03/05/22 → 17/03/22 | 21/22-Pec → 21/22-Pec | OC d3f93c68 | não |
| A-cc | d4bc85b2 | Santa Rita Agro | Gilson Munhoz | Venda 115 Desm. M | 19/04/22 | 19/04/22 → 18/04/22 | — → 21/22-Pec | OC 88577f3a | não |
| A-cc | 00fac510 | Santa Rita Agro | Natalino Cavalli Júnior | Venda 035 Novilhas | 17/06/22 | 17/06/22 → 17/05/22 | — → 21/22-Pec | OC f0a7f59f | não |
| A-cc | fbc67c8d | Santa Rita Agro | Gilson Munhoz | Venda 090 Desm. M | 17/06/22 | 17/06/22 → 18/05/22 | — → 21/22-Pec | OC b716fe94 | não |
| A-cc | e2b97502 | Santa Rita Agro | Natalino Cavalli Júnior | Venda  038 Novilhas | 17/06/22 | 17/06/22 → 21/05/22 | — → 21/22-Pec | OC 1b786c76 | não |
| A-cc | 2a215407 | Santa Rita Agro | Braz Aristeu de Lima | Venda 082 nov. - 3/3 | 01/09/22 | 01/09/22 → 01/06/22 | 22/23-Pec → 21/22-Pec | OC ba4a0d8f | não |
| A-cc | d89af405 | Santa Rita Agro | Braz Aristeu de Lima | Venda 082 nov. - 2/3 | 01/08/22 | 01/08/22 → 01/06/22 | 22/23-Pec → 21/22-Pec | OC ba4a0d8f | não |
| A-cc | fd87ce77 | Santa Rita Agro | Braz Aristeu de Lima | Venda 082 nov. - 1/3 | 01/07/22 | 01/07/22 → 01/06/22 | 22/23-Pec → 21/22-Pec | OC ba4a0d8f | não |
| A-cc | 0dd7c395 | Santa Rita Agro | Caio Roberto Gerbasi | Venda 060 Desm. M | 21/06/22 | 21/06/22 → 14/06/22 | — → 21/22-Pec | OC 00a6a615 | não |
| A-cc | 526e03c6 | Santa Rita Agro | Ricardo Tahan | Venda 070 Desm. M | 16/06/22 | 16/06/22 → 14/06/22 | — → 21/22-Pec | OC 97424e94 | não |
| A-cc | c51bc5af | Santa Rita Agro | Mário Correia | Venda 037 Desm.M | 06/07/22 | 06/07/22 → 05/07/22 | 22/23-Pec → 22/23-Pec | OC f69eefd8 | não |
| A-cc | 0d743dfd | Santa Rita Agro | Paulo Cesar Laguna | Venda 017 Desm. F | 14/11/22 | 14/11/22 → 31/10/22 | — → 22/23-Pec | OC 8bc4fbd3 | não |
| A-cc | 4853e70d | Santa Rita Agro | Paulo Cesar Laguna | Venda 020 Desm. M | 14/11/22 | 14/11/22 → 31/10/22 | — → 22/23-Pec | OC 6a235a62 | não |
| A-cc | e61d3663 | Santa Rita Agro | Paulo Soriano | Venda 037 Vacas | 01/03/23 | 01/03/23 → 26/01/23 | — → 22/23-Pec | OC 7ffc27be | não |
| A-cc | c437941c | Santa Rita Agro | Ricardo Tahan | Venda 219 Desm.M | 26/04/23 | 26/04/23 → 28/03/23 | 22/23-Pec → 22/23-Pec | OC a6fe542d | não |
| A-cc | 485484c4 | Santa Rita Agro | Eduardo Estevam | Venda 090 Desm. F | 31/03/23 | 31/03/23 → 31/03/23 | — → 22/23-Pec | OC 1b6bf19d | não |
| A-cc | 5fcf45aa | Santa Rita Agro | Paulo Soriano | Venda 248 Desm.M - 2/3 | 28/06/23 | 28/06/23 → 17/05/23 | 22/23-Pec → 22/23-Pec | OC 23a2fbe9 | não |
| A-cc | a697b92c | Santa Rita Agro | Paulo Soriano | Venda 248 Desm.M - 1/3 | 15/06/23 | 15/06/23 → 17/05/23 | 22/23-Pec → 22/23-Pec | OC 23a2fbe9 | não |
| A-cc | b40194bb | Santa Rita Agro | Paulo Soriano | Venda 248 Desm.M - 3/3 | 28/06/23 | 28/06/23 → 17/05/23 | 22/23-Pec → 22/23-Pec | OC 23a2fbe9 | não |
| A-cc | 0b7b3de6 | Santa Rita Agro | Walter Barros | Venda 035 femeas - 3/3 | 26/06/23 | 26/06/23 → 23/05/23 | 22/23-Pec → 22/23-Pec | OC ad6414f0 | não |
| A-cc | 1ece9f19 | Santa Rita Agro | Walter Barros | Venda 035 femeas - 2/3 | 07/06/23 | 07/06/23 → 23/05/23 | 22/23-Pec → 22/23-Pec | OC ad6414f0 | não |
| A-cc | 49a759ad | Santa Rita Agro | Walter Barros | Venda 035 femeas - 1/3 | 06/06/23 | 06/06/23 → 23/05/23 | 22/23-Pec → 22/23-Pec | OC ad6414f0 | não |
| A-cc | 54b9eb47 | Santa Rita Agro | Paulo Soriano | Venda 187 Desm.M | 01/08/23 | 01/08/23 → 07/06/23 | 23/24-Pec → 22/23-Pec | OC 93f97781 | não |
| A-cc | 9010f496 | Santa Rita Agro | João Maria Gomes | Venda 054 Desm.F | 20/06/23 | 20/06/23 → 16/06/23 | 22/23-Pec → 22/23-Pec | OC 9f5d87d3 | não |
| A-cc | 83716e9c | Santa Rita Agro | Carlos Pacheco | Venda 030 Desm.F - 1/2 | 06/07/23 | 06/07/23 → 17/06/23 | 23/24-Pec → 22/23-Pec | OC 99aca1e5 | não |
| A-cc | b0f6c452 | Santa Rita Agro | Carlos Pacheco | Venda 030 Desm.F - 2/2 | 07/07/23 | 07/07/23 → 17/06/23 | 23/24-Pec → 22/23-Pec | OC 99aca1e5 | não |
| A-cc | 086eb983 | Santa Rita Agro | Jorge Temporim | Venda 004 garrotes | 13/12/23 | 13/12/23 → 08/12/23 | 23/24-Pec → 23/24-Pec | OC a5b5057c | não |
| A-cc | 2286e89a | Santa Rita Agro | Jorge Temporim | Venda 027 Desm.M | 13/12/23 | 13/12/23 → 08/12/23 | 23/24-Pec → 23/24-Pec | OC d677a558 | não |
| A-cc | 472e8e55 | Santa Rita Agro | Helder Hofig | Venda 051 Desm.M | 15/04/24 | 15/04/24 → 15/03/24 | 23/24-Pec → 23/24-Pec | OC d3f1392c | não |
| A-cc | 99ab54bb | Santa Rita Agro | Jorge Temporim | Venda 050 Desm.M | 11/03/24 | 11/03/24 → 16/03/24 | 23/24-Pec → 23/24-Pec | OC c8585a3a | não |
| A-cc | a784d071 | Santa Rita Agro | Helder Hofig | Venda 196 Desm.M | 26/04/24 | 26/04/24 → 26/03/24 | 23/24-Pec → 23/24-Pec | OC 5b26b88c | não |
| A-cc | dbeeeff3 | Santa Rita Agro | Helder Hofig | Venda 247 Desm.M | 24/05/24 | 24/05/24 → 26/04/24 | 23/24-Pec → 23/24-Pec | OC 4b14e6e8 | não |
| A-cc | 6eedcdf8 | Santa Rita Agro | Faz. Corrego Azul | Venda 150 Desm.M | 21/06/24 | 21/06/24 → 23/05/24 | 23/24-Pec → 23/24-Pec | OC b8b94ed1 | não |
| A-cc | e2205dc9 | Santa Rita Agro | Walter Barros | Venda 020 Desm.F | 06/06/24 | 06/06/24 → 23/05/24 | 23/24-Pec → 23/24-Pec | OC 2d2383aa | não |
| A-cc | 351c6d2a | Santa Rita Agro | Helder Hofig | Venda 227 Desm.M | 27/07/24 | 27/07/24 → 27/06/24 | 24/25-Pec → 23/24-Pec | OC 253072a3 | não |
| A-cc | 568e80e6 | Santa Rita Agro | Helder Hofig | Venda 080 Bzerros | 25/07/25 | 25/07/25 → 19/03/25 | 25/26-Pec → 24/25-Pec | OC 232c05aa | não |
| A-cc | 693fc917 | Santa Rita Agro | Helder Hofig | Venda 193 machos | 22/05/25 | 22/05/25 → 19/03/25 | 24/25-Pec → 24/25-Pec | OC 232c05aa | não |
| A-cc | aee255bc | Santa Rita Agro | Helder Hofig | Venda 317 machos | 17/04/25 | 17/04/25 → 19/03/25 | 24/25-Pec → 24/25-Pec | OC 232c05aa | não |
| A-cc | e57e3e60 | Santa Rita Agro | Helder Hofig | Venda 189 machos | 21/06/25 | 21/06/25 → 19/03/25 | 24/25-Pec → 24/25-Pec | OC 232c05aa | não |
| A-cc | 4df4ea15 | Santa Rita Agro | Helder Hofig | Venda 315 DM - 2/2 | 22/04/26 | 22/04/26 → 26/03/26 | 25/26-Pec → 25/26-Pec | OC e1ea7f4b | não |
| A-cc | 692f1957 | Santa Rita Agro | Helder Hofig | Venda 315 DM - 1/2 | 16/04/26 | 16/04/26 → 26/03/26 | 25/26-Pec → 25/26-Pec | OC e1ea7f4b | não |
| A-tit | 1d31fd0b | NJ Pecuária | Fortunceres S.A. - Minerva | Abate 020 Novilhas | 16/05/26 | 16/04/26 → 15/04/26 | 25/26-Pec → 25/26-Pec | OC 9b2b5e6b | sim |
| A-tit | 4f3661fa | NJ Pecuária | Fortunceres S.A. - Minerva | Abate 020 Garrotes | 16/05/26 | 16/04/26 → 15/04/26 | 25/26-Pec → 25/26-Pec | OC 9b2b5e6b | sim |
| A-tit | 6a8f812e | NJ Pecuária | Fortunceres S.A. - Minerva | Abate 020 Novilhas | 16/05/26 | 16/04/26 → 15/04/26 | 25/26-Pec → 25/26-Pec | OC 9b2b5e6b | sim |
| A-tit | 8a99eca6 | NJ Pecuária | Fortunceres S.A. - Minerva | Abate 041 Garrotes | 16/05/26 | 16/04/26 → 15/04/26 | 25/26-Pec → 25/26-Pec | OC 9b2b5e6b | sim |
| A-tit | 321a1eee | Santa Rita Agro | Frigorífico Frigolon | Abate 025 N | 05/08/26 | 06/08/26 → 05/08/26 | 26/27-Pec → 26/27-Pec | OC bb51bb9a | sim |
| A-tit | 12c41ff9 | Santa Rita Agro | Frigorífico Frigolon | Abate 015 N | 06/08/26 | 07/08/26 → 06/08/26 | 26/27-Pec → 26/27-Pec | OC 442a9fa7 | sim |
| A-tit | ee432458 | Santa Rita Agro | Frigorífico Frigolon | Abate 038 V | 06/08/26 | 07/08/26 → 06/08/26 | 26/27-Pec → 26/27-Pec | OC 442a9fa7 | sim |
| A-tit | 7f324c56 | Santa Rita Agro | Frigorífico Frigolon | Abate 027 V | 21/08/26 | 21/08/26 → 20/08/26 | 26/27-Pec → 26/27-Pec | OC 8cd86616 | sim |
| A-tit | eea4a988 | Santa Rita Agro | Frigorífico Frigolon | Abate 001 N | 21/08/26 | 21/08/26 → 20/08/26 | 26/27-Pec → 26/27-Pec | OC 8cd86616 | sim |
| A-tit | 3e05fd75 | Vera Ligia Milani | Frizelo Frigorífico | Abate 020 V | 17/01/25 | 17/01/25 → 16/01/25 | 24/25-Pec → 24/25-Pec | OC c80ebe9e | sim |
| A-tit | eae44cc9 | Vera Ligia Milani | Frizelo Frigorífico | Abate 028 V | 23/01/25 | 23/01/25 → 22/01/25 | 24/25-Pec → 24/25-Pec | OC 6336c7fc | sim |
| A-tit | 2299214e | Vera Ligia Milani | JBS S.A. - Unid II CG | Abate 018 V | — | 02/09/26 → 01/09/26 | 26/27-Pec → 26/27-Pec | OC 2d39d7e9 | sim |
| A-tit | 51e0e9bb | Vera Ligia Milani | JBS S.A. - Unid II CG | Abate 070 V | — | 02/09/26 → 01/09/26 | 26/27-Pec → 26/27-Pec | OC 02be1a41 | sim |
| B | 7985e8b9 | Agnaldo Cedenho | Golden Imex Eireli | Abate - 108 Bois | 24/07/20 | 24/07/20 → 30/07/20 | — → 20/21-Pec | saída 6d73dd67 | sim |
| B | 93d154be | Agnaldo Cedenho | Fortunceres S/A - Bataguassu-MS | Abate 054 Bois - Adiantamento de ICMS | 05/12/22 | 05/12/22 → 07/12/22 | — → 22/23-Pec | saída b26ee8fd | sim |
| B | 2eb43f49 | NJ Pecuária | Naturafrig Alimentos Ltda | Abate 040 vacas | 17/06/20 | 17/06/20 → 16/06/20 | — → — | saída 785c4b0e | sim |
| B | 3a7ec451 | NJ Pecuária | Naturafrig Alimentos Ltda | Abate 010 novilhas | 23/07/20 | 23/07/20 → 16/06/20 | — → — | saída 785c4b0e | sim |
| B | 7f246ab2 | NJ Pecuária | Naturafrig Alimentos Ltda | Abate 030 vacas | 23/07/20 | 23/07/20 → 16/06/20 | — → — | saída 785c4b0e | sim |
| B | 9ed0c9dd | NJ Pecuária | Naturafrig Alimentos Ltda | Abate - Incentivo Precoce ref. 10 novilhas | 24/07/20 | 24/07/20 → 16/06/20 | — → — | saída 785c4b0e | sim |
| B | 5558e18f | NJ Pecuária | JBS S/A | Abate 030 bois | 10/08/20 | 10/08/20 → 08/07/20 | — → 20/21-Pec | saída fc31d5d3 | sim |
| B | 559f4407 | NJ Pecuária | Naturafrig Alimentos Ltda | Abate 020 Novilhas | 10/03/21 | 10/03/21 → 09/03/21 | — → 20/21-Pec | saída 5984da12 | sim |
| B | c3eb2189 | NJ Pecuária | Marfrig Global Foods | Abate 054 Vacas | 01/05/22 | 01/05/22 → 31/03/22 | — → 21/22-Pec | saída da70ed88 | sim |
| B | 0b3f1412 | NJ Pecuária | VPJ | Abate 100 Novilhas | 18/03/22 | 18/03/22 → 12/04/22 | — → 21/22-Pec | saída d4ecaa8d | sim |
| B | 49482b8a | NJ Pecuária | Meat & Leather (Frigolon) | Abate 004 Sinuelos e 1 Touro | 23/07/22 | 23/07/22 → 21/07/22 | — → 22/23-Pec | saída 074f0ed9 | sim |
| B | 566632aa | NJ Pecuária | Meat & Leather (Frigolon) | Abate 08 Femeas | 16/11/23 | 16/11/23 → 13/11/23 | — → 23/24-Pec | saída 28dba28c | sim |
| B | 129f2fad | Santa Rita Agro | Paulo Soriano | Venda 035 Desm.M | 03/08/20 | 03/08/20 → 30/05/20 | 20/21-Pec → — | saída d193f4ae | sim |
| B | b03e289a | Santa Rita Agro | Frigorífico Frigolon | Abate | 10/07/20 | 10/07/20 → 11/07/20 | — → 20/21-Pec | saída 58289993 | sim |
| B | f7db553a | Santa Rita Agro | Naturafrig | Abate 038 vacas e 010 novilhas | 08/11/23 | 08/11/23 → 07/11/23 | — → 23/24-Pec | saída 9a3a8fc8 | sim |
| B | cec9fde6 | Santa Rita Agro | Guidara | Abate 080 cab (50V/30N) - ICMS | 24/01/25 | 24/01/25 → 01/12/24 | — → 24/25-Pec | saída 423a4ca0 | sim |
| B | e9c3b910 | Santa Rita Agro | Guidara | Abate Vacas | 23/12/24 | 23/12/24 → 01/12/24 | — → 24/25-Pec | saída 423a4ca0 | sim |
| B | f0643b79 | Santa Rita Agro | Guidara | Abate 080 cab (50V/30N) | 06/01/25 | 06/01/25 → 01/12/24 | — → 24/25-Pec | saída 423a4ca0 | sim |
| B | a0d36da5 | Santa Rita Agro | Beta Carnes e Alimentos | Abate 018 vacas | 08/02/25 | 08/02/25 → 17/01/25 | — → 24/25-Pec | saída d4615c6a | sim |
| B | 0c424c7a | Santa Rita Agro | Frigorífico Frigolon | Abate 015 vacas | 14/03/25 | 14/03/25 → 13/03/25 | — → 24/25-Pec | saída 25012b60 | sim |
| B | 92d6d618 | Santa Rita Agro | Guidara | Abate 018 Vacas (verificar pendente) | 26/06/25 | 26/06/25 → 22/06/25 | — → 24/25-Pec | saída 544d1a4c | sim |
| B | fc70b11d | Santa Rita Agro | Guidara | Abate 018 vacas | 06/08/25 | 06/08/25 → 22/06/25 | 25/26-Pec → 24/25-Pec | saída 544d1a4c | sim |
| B | 0255e1d1 | Santa Rita Agro | Walter Barros | Venda 022 Vacas | 05/01/26 | 05/01/26 → 06/10/25 | 25/26-Pec → 25/26-Pec | saída 073fd0f2 | sim |
| B | dde97057 | Santa Rita Agro | Guidara | Abate 072 vacas angus 36+ | 31/10/25 | 31/10/25 → 09/10/25 | 25/26-Pec → 25/26-Pec | saída e0d40601 | sim |

## Query da lista (rodável; canal com EXECUTE em `_oc_competencia_pela_saida`)

```sql
with lig as (
  select 'A-' || case o.modelo_financeiro when 'conta_corrente' then 'cc' else 'tit' end alvo, l.id, l.cliente_id,
         l.data_competencia comp, l.data_pagamento pag, l.safra_id, l.editado_manual, l.compoe_dre, l.valor, o.data_operacao, o.id op,
         cps.data_competencia comp_nova, cps.safra_id safra_nova, null::uuid saida
  from financeiro_lancamentos_v2 l
  join zoo_operacao_partes p on p.financeiro_lancamento_id = l.id and not p.cancelada
  join zoo_operacoes_comerciais o on o.id = p.operacao_id and o.cancelado_em is null
  cross join lateral public._oc_competencia_pela_saida(o.id) cps
  where l.cancelado is not true and l.tipo_operacao = '1-Entradas' and coalesce(l.sem_movimentacao_caixa, false) = false
    and l.subcentro in ('Abates de Fêmeas','Abates de Machos','Venda de Desmama Fêmeas','Venda de Desmama Machos',
                        'Venda de Fêmeas Adultas','Venda de Machos Adultos')),
rec as (
  select l.*, coalesce(l.data_pagamento, l.data_competencia) pagx, fo.nome fav
  from financeiro_lancamentos_v2 l left join financeiro_fornecedores fo on fo.id = l.favorecido_id
  where l.sinal = '1' and l.sem_movimentacao_caixa is false and l.movimentacao_rebanho_id is null and l.cancelado is not true
    and l.subcentro in ('Abates de Fêmeas','Abates de Machos','Venda de Desmama Fêmeas','Venda de Desmama Machos',
                        'Venda de Fêmeas Adultas','Venda de Machos Adultos')
    and l.cenario = 'realizado'
    and not exists (select 1 from zoo_operacao_partes p where p.financeiro_lancamento_id = l.id and not p.cancelada)),
cand as (
  select r.id, count(s.id) n, min(s.data) d1, (array_agg(s.id))[1] saida
  from rec r join lancamentos s on s.cliente_id = r.cliente_id and s.tipo in ('venda','abate') and s.cancelado is not true
    and s.cenario = 'realizado' and s.data between r.pagx - 120 and r.pagx + 30
    and public.similarity(lower(public.unaccent(coalesce(s.fazenda_destino,''))), lower(public.unaccent(coalesce(r.fav,'')))) >= 0.3
  group by r.id),
sol as (
  select 'B' alvo, r.id, r.cliente_id, r.data_competencia, r.data_pagamento, r.safra_id, r.editado_manual, r.compoe_dre, r.valor,
         null::date, null::uuid, k.d1, public.fn_safra_sugerida(r.cliente_id, k.d1, 'pecuaria'), k.saida
  from rec r join cand k on k.id = r.id and k.n = 1),
tudo as (
  select *, (editado_manual and comp is distinct from pag and comp is distinct from data_operacao) manual
  from (select * from lig union all select * from sol) u
  where comp is distinct from comp_nova or safra_id is distinct from safra_nova)
select * from tudo where not manual;
```
