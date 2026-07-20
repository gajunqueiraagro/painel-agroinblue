# Índice de ADRs — AGROinBLUE

Registro oficial das decisões arquiteturais do projeto.

## Governança (permanente)

1. Decisões arquiteturais aprovadas são **congeladas em ADRs** nesta pasta,
   no padrão `ADR-2026-NN-slug.md`, numeração sequencial.
2. **Implementações devem seguir ADRs aprovados.** Divergência entre código e
   ADR é defeito de implementação.
3. **Mudanças conceituais exigem novo ADR** que referencie o anterior — nunca
   a alteração silenciosa de um ADR existente.
4. **ADRs são a referência soberana para implementação**, subordinados apenas
   às Constituições do projeto (`docs/constituicao/`).

## Índice

| Nº | Título | Status | Data |
|---|---|---|---|
| [ADR-2026-04](./ADR-2026-04-rls-incidente-deny-all.md) | RLS é regra de negócio (post-mortem deny_all_temp) | Aceito | 30/04/2026 |
| [ADR-2026-05](./ADR-2026-05-financiamentos-vinculo-estrutural.md) | Financiamentos: vínculo estrutural, nunca inferência textual | Aceito e implementado | 22/05/2026 |
| [ADR-2026-06](./ADR-2026-06-proveniencia-ciclo-vida.md) | Proveniência e Ciclo de Vida de Registros Derivados | Aceito | 04/07/2026 |
| [ADR-2026-07](./ADR-2026-07-erp-operational-shell.md) | App-shell operacional para telas ERP | Aceito (padrão normativo) | 04/07/2026 |
| [ADR-2026-08](./ADR-2026-08-identidade-pertencimento-soberano.md) | Identidade, pertencimento e autoria histórica | Aceito | 14/07/2026 |
| [ADR-2026-09](./ADR-2026-09-admin-global-propriedade.md) | Administração global e propriedade do cliente | Aceito | 14/07/2026 |
| [ADR-2026-10](./ADR-2026-10-perfis-capacidades-delegacao.md) | Perfis, capacidades e teto de delegação | Aceito | 14/07/2026 |
| [ADR-2026-11](./ADR-2026-11-escopo-fazenda.md) | Escopo de fazenda | Aceito | 14/07/2026 |
| [ADR-2026-12](./ADR-2026-12-politica-acesso-anonimo.md) | Política de acesso anônimo | Aceito | 14/07/2026 |
| [ADR-2026-13](./ADR-2026-13-contrato-rls.md) | Contrato de RLS e motor de autorização | Aceito | 14/07/2026 |
| [ADR-2026-14](./ADR-2026-14-views-tenant-safe.md) | Views tenant-safe | Aceito | 14/07/2026 |
| [ADR-2026-15](./ADR-2026-15-rollout-anti-deny-all.md) | Rollout anti-deny-all | Aceito | 14/07/2026 |
| [ADR-2026-16](./ADR-2026-16-operacao-comercial-arquitetura-oficial.md) | **Arquitetura Oficial da Operação Comercial (v1)** | Aceito · BASELINE v1 congelada | 20/07/2026 |

Nota: a numeração desta pasta inicia em 04; os números 01–03 não possuem
arquivo nesta pasta (histórico anterior à padronização).
