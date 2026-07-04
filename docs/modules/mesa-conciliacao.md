# Módulo Mesa de Conciliação — regras arquiteturais

## Princípio do módulo
A Mesa é um cockpit operacional, não um motor de matching. Excel é
referência, não fonte de verdade. O sistema mostra quais candidatos
existem, quais já estão vinculados, a qual OFX e por quê — sem
concluir que candidato é inválido ou OFX é órfão. O sistema explica;
o operador decide.

## REGRA ABSOLUTA — conta_bancaria_id vem da linha Excel (PR6.2)
Ao promover staging → financeiro_lancamentos_v2, a conta_bancaria_id
do lançamento promovido vem da linha.raw.Conta (resolvida via helper
resolverContaPorTexto em src/v2/lib/mesa/resolverConta.ts), NUNCA da
mesa_sessao.conta_bancaria_id.
Por quê: o Excel é ledger multi-conta do mês (Mesa Global). Usar a
conta da sessão faria lançamento do BB virar Itaú. Catastrófico.

## Arquitetura híbrida (confirmada 24/05/2026)
- SESSÃO = 1 conta bancária + 1 mês (via conta_bancaria_id)
- OFX = SOMENTE da conta da sessão
- EXCEL = MULTI-CONTA (todas as despesas/receitas do mês, todas as
  contas)
- PAREAMENTO = ASSIMÉTRICO: OFX (1 conta) ↔ Excel (N contas)
- STAGING = isolado por sessão
- PROMOÇÃO = conta do lançamento vem da linha Excel resolvida via
  cadastro

## Helper soberano resolverContaPorTexto (3 camadas)
1. agencia_numero (score 100) — regex Ag+CC, canônica
2. substring_exibicao (score 70) — nome do cadastro
3. substring_banco (score 40) — banco do cadastro, residual
O score serve à detecção de ambiguidade e à auditoria de confiança.

## Vocabulário obrigatório
"camada" / "matching progressivo" / "residual" — NUNCA "fallback".
