# Migração Project Knowledge → Repositório

> Tabela viva de rastreio. Nenhum documento sai do Project Knowledge
> antes de estar com status `auditado` aqui. Documento temporário:
> será removido quando a migração concluir.

Status: redigido → commitado → auditado → apto-remoção
(docs sem conteúdo a migrar recebem apto-remoção direto, com motivo)

## Migrados
| Doc PK (origem) | Destino no repo | Status |
|---|---|---|
| Atualização_sempre_ler_em_novos_chats (checklist migração) | docs/runbooks/migracao-cliente.md | auditado (56fc012d) → origem apto-remoção |
| Doc legado "KB Completo" seção 13 (EXPORT_APP_UNICO) | docs/runbooks/importacao-financeira.md | auditado (56fc012d) → origem apto-remoção |
| Inclusão_movimentações | docs/runbooks/importacao-zootecnica.md | auditado (56fc012d) → origem apto-remoção |
| Atualizacao (SPEC P0-Z0) | docs/specs/P0-Z0-status-contraparte.md | commitado (Lote 2) |
| Financiamentos (regra soberana) | docs/adr/ADR-2026-05-financiamentos-vinculo-estrutural.md | commitado (Lote 2) |
| RLS (post-mortem 30/04) | docs/adr/ADR-2026-04-rls-incidente-deny-all.md | commitado (Lote 2) |
| Atualização (PR6.2 conta da linha) | docs/modules/mesa-conciliacao.md | commitado (Lote 2) |
| Doc legado abril (mapeamento Caderno) | docs/modules/caderno-import.md | commitado (Lote 2) |

## Sem migração — apto-remoção direto
| Doc PK | Motivo |
|---|---|
| Inclusão_de_animais_via_texto_do_excel | duplicata desatualizada de Inclusão_movimentações |
| Atualização (pendências useFinanceiro) | tarefas já executadas |
| Bug___Edição_em_modo_Global | documento truncado, sem conteúdo acionável |
| Doc legado nº1 "PK abril" | credencial viva + estado morto; resíduo útil (Caderno) migrado no Lote 2 |
| Doc legado nº2 "KB Completo" | credencial viva + comandos perigosos; resíduo útil (seção 13) migrado no Lote 1 |

## Adiados por decisão
| Doc PK | Decisão |
|---|---|
| Refactor_Abate_Modal___Roadmap (+ Botões) | 04/07/2026: documentar módulo apenas após estabilização — não cristalizar comportamento em evolução |

## Insumos do PR-ARCH-01 (permanecem no PK até absorção)
| Doc PK | Papel |
|---|---|
| Resumo_do_sistema_ler_antes_de_toda_conversa | semente da tabela de soberania (Constituição) |
| Novos_chats / Importante SaaS 200 clientes | riscos estruturais + roadmap SaaS |
| BUG (zoot cache global) | backlog estrutural |
| Atualização (29/05 B1/B2) | descobertas estruturais (triggers, fn_lancamento_auto_derivar) |
| padrão_Telas | ADR-ERP-Operational-Shell (nunca criado — vira ADR no ARCH-01) |

## Permanecem no PK (contexto permanente)
PK v2 (documento de contexto) · PlanoDeContas_Knowledge_1.md ·
PlanoDeContas_v2.xlsx
