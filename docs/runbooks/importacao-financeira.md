# Runbook — Importação financeira (formato EXPORT_APP_UNICO)

> Formato do arquivo aceito pela tela de Importação financeira.
> Import é client-side (input .xlsx/.xls).

## Colunas
| Coluna | Descrição |
|---|---|
| Tipo_Registro | LANCAMENTO ou SALDO |
| AnoMes | YYYY-MM |
| Data_Ref | YYYY-MM-DD |
| Conta | nome_exibicao da conta (ver regra crítica abaixo) |
| Conta_Destino | obrigatória em transferências |
| Fazenda | nome da fazenda |
| Tipo | 1-Entradas / 2-Saídas / 3-Transferências |
| Valor | float numérico (NUNCA string — ponto vira milhar) |
| Status | Realizado / Previsto |
| Macro_Custo / Grupo_Custo / Centro_Custo / Subcentro | valores EXATOS do plano de contas padrão |

## Regras críticas
- 1-Entradas: a coluna Conta é a conta de DESTINO (onde o dinheiro
  chega). Conta_Origem é vazia para entradas.
- Transferências: Tipo é '3-Transferências' — plural, com S e acento.
  O singular quebra a classificação silenciosamente.
- Linhas SALDO: Tipo_Registro=SALDO, Fazenda=Administrativo
  (obrigatório), AnoMes=YYYY-MM, Conta=nome_exibicao.
- Subcentros: exclusivamente do plano de contas padrão vigente.
  Nunca inventar; em dúvida, perguntar antes.
- Subcentro vazio/sem classificação → Status=Previsto e plano em
  branco.
- Nome de conta: usar exatamente o cadastro do sistema.
