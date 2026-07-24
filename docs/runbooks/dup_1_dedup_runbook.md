# Runbook DUP-1 — Deduplicação de cards `fechamento_pastos` duplicados

**Objetivo:** remover cards excedentes das 1.167 chaves duplicadas `(fazenda_id, pasto_id, ano_mes)`,
preservando o card canônico de cada grupo, **sem constraint** (isso é DUP-2), sem tocar dados fora do escopo,
sem desabilitar triggers e sem persistir nada durante o ensaio (DUP-1A).

> **Dados reais nunca são versionados.** O backup real e o restore SQL vão para `scratchpad/` (fora do Git) ou tmp seguro.
> No repositório há apenas este runbook (lógica) e `dup_1_backup_MODELO.json` (estrutura de exemplo).

## Conjunto congelado (definido uma vez; nunca recalculado após os DELETEs)
- `excedentes_B1` (1.166): grupos **vazio×vazio** (ambos os cards com 0 itens), **excluindo** a chave do Capivara
  (`pasto_id='0c08a14f-5126-4b47-b321-10ebc366f850' AND ano_mes='2026-04'`); remover o de **maior `created_at`**
  por grupo (desempate: maior `id`); preservar o mais antigo como **canônico**.
- `excedente_Capivara` (1): `fe2ae62d-6351-4d48-b16e-60d1bba01933` — **literal autorizado** (NÃO por ranking).
  Canônico do Capivara: `13a53f9f-2f79-41e7-bf7c-5c0f48f90d72` (fechado, vedado, 0 itens, mais antigo).
- **CONJUNTO_CONGELADO** = `excedentes_B1 ∪ {fe2ae62d}` = **1.167** IDs.

## FKs para `fechamento_pastos(id)` (auditadas — exatamente 2)
- `fechamento_pasto_itens.fechamento_id` → **ON DELETE CASCADE**.
- `fechamento_pastos_membros.fechamento_pasto_id` → **ON DELETE NO ACTION** (salvaguarda natural; 0 membros nos excedentes).

Item a remover (exclusivo do card incorreto do Capivara): `3ee3bd5a-603b-4192-acd4-c568b5e29bb7`.

## PASSO 2 — Backup privado (antes de qualquer BEGIN)
1. `SELECT` read-only dos 1.167 cards congelados (todos os campos + `created_at`) + o item.
2. Gerar em `scratchpad/`: `dup1_backup_<ts>.json` (cards + item) e `dup1_restore_<ts>.sql` (INSERT reverso, cards→item).
3. **Gates pré-BEGIN** (falhou algum → PARAR): `backup_cards_count=1167`; `backup_item_count=1`; IDs únicos;
   nenhum canônico no backup; os 1.167 existem no banco; `sig_frozen` calculado; restore SQL gerado e parseável.

## PASSO 3 — Ensaio (`BEGIN…ROLLBACK`; triggers ATIVOS)
- `LOCK TABLE fechamento_pastos, fechamento_pasto_itens IN SHARE ROW EXCLUSIVE MODE` (nunca `ACCESS EXCLUSIVE`).
- Carregar CONJUNTO_CONGELADO e `SELECT … FOR UPDATE`.
- **Revalidação (a–h)** contra o backup (por `sig_frozen`): 1.167 existem; hash idêntico; item exclusivo de `fe2ae62d`;
  nenhum canônico; 1.167 chaves duplicadas; sem nova duplicidade fora do conjunto; composição = 1.166 vazio×vazio + Capivara;
  0 membros e **0 `fechamento_p1`** nos 21 meses (⇒ A8A inócuo). Divergiu → `ROLLBACK` e PARAR.
- Fingerprints ANTES (21 meses + globais capturados na transação).
- DELETEs (exatamente o conjunto congelado): (1) item `3ee3bd5a`; (2) os 1.167 cards.
- Fingerprints DEPOIS.
- Provas: `chaves_duplicadas 1167→0`; `cards_excedentes 1167→0`; `cards_em_grupos 2334→1167`;
  total global `−1167`; itens globais `−1`; itens removidos = **só** `3ee3bd5a`;
  P1/P2/snapshots/membros/area_snapshot/logs dos 21 meses **ANTES==DEPOIS**; nada fora dos 21 muda.
- `ROLLBACK` (libera o lock; nada persiste).

## DUP-1B (execução real — fase separada, não autorizada aqui)
Transação única com lock + revalidação; `COMMIT` **somente** se todos os gates verdes; qualquer divergência → `ROLLBACK`.

## Fora de escopo
Constraint de unicidade (DUP-2); `DUP-GERAL` (1 card com `fp.fazenda_id <> pastos.fazenda_id`); "Geral"/Capivara-âmbar; D.0B-ii; Produção.
