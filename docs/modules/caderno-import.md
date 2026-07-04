# Módulo Caderno de Importação — mapeamento de tipos

> Regras de domínio estáveis do CadernoImportTab. Estado atual de
> bugs/deploy NÃO vive aqui — o código na branch proto é a verdade.

## Identidade dos lançamentos
Todo lançamento criado pelo Caderno: origem='caderno_ia',
cenario='realizado'.

## Mapeamento aba → tipo no banco
| Aba | Operação | Tipo no banco |
|---|---|---|
| Entradas | Compra | compra |
| Entradas | Transferência | IGNORAR (entrada espelho é criada por trigger a partir da saída) |
| Saídas | Abate | abate |
| Saídas | Venda em Pé | venda |
| Saídas | Transferência | transferencia_saida |
| Nascimentos | — | nascimento |
| Mortes | — | morte |
| Consumo | — | consumo |
| Chuvas | — | tabela chuvas, campo milimetros |

## Regras
- Categoria deve ser persistida por categoria_id (UUID), nunca só
  pelo nome — mapear via tabela categorias antes de salvar.
- Contraparte de lançamentos do Caderno segue a spec P0-Z0:
  status pendente_conciliacao (ver docs/specs/P0-Z0-status-contraparte.md).
