# Migração Project Knowledge → Repositório

> Rastreio da migração. Status final em 04/07/2026 — encerramento
> previsto após auditoria do PR-ARCH-01.

Status: redigido → commitado → auditado → apto-remoção → removido

## Migrados e removidos do PK (04/07/2026)
| Doc PK (origem) | Destino | Commit | Status |
|---|---|---|---|
| Atualização_sempre_ler (checklist migração) | docs/runbooks/migracao-cliente.md | 56fc012d | removido |
| Instructions legadas seção 13 (EXPORT_APP_UNICO) | docs/runbooks/importacao-financeira.md | 56fc012d | removido |
| Inclusão_movimentações | docs/runbooks/importacao-zootecnica.md | 56fc012d | removido |
| Atualizacao (SPEC P0-Z0) | docs/specs/P0-Z0-status-contraparte.md | 34322a08 | removido |
| Financiamentos | docs/adr/ADR-2026-05-financiamentos-vinculo-estrutural.md | 34322a08 | removido |
| RLS | docs/adr/ADR-2026-04-rls-incidente-deny-all.md | 34322a08 | removido |
| Atualização (PR6.2 Mesa) | docs/modules/mesa-conciliacao.md | 34322a08 | removido |
| Instructions legadas (mapeamento Caderno) | docs/modules/caderno-import.md | 34322a08 | removido |
| Inclusão_de_animais / Atualização-pendências / Bug_Edição_Global / Refactor_Abate_Botões / Atualização-29-05 | sem conteúdo normativo a migrar (motivos na auditoria 04/07) | — | removidos |

## Absorvidos neste PR (ARCH-01)
| Doc PK (origem) | Destino | Status |
|---|---|---|
| Resumo_do_sistema (tabela de fontes) | Constituição Título III | commitado — apto-remoção após auditoria |
| padrão_Telas | docs/adr/ADR-2026-07-erp-operational-shell.md | commitado — apto-remoção após auditoria |
| Novos_chats + Importante SaaS 200 + BUG | docs/evolution/riscos-estruturais-saas.md | commitado — apto-remoção após auditoria |

## Permanecem no PK
| Doc | Papel |
|---|---|
| PK v2 (Instructions) | contexto de alto nível |
| PlanoDeContas_Knowledge_1.md + PlanoDeContas_v2.xlsx | vocabulário normativo em uso ativo (espelho futuro em docs/ opcional) |
| Refactor_Abate_Modal___Roadmap | adiado 04/07/2026 — documentar módulo só após estabilização |

## Encerramento
Após auditoria do ARCH-01 e remoção dos 3 insumos absorvidos, este
arquivo pode ser removido do repo (commit de encerramento).
