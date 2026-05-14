# PC-100 · Mapa de Migração do Legado

**Última atualização:** 14/05/2026 (após commit `4417da37` — migração de `precoArr`)
**Branch auditada:** `proto`
**Status:** Documento vivo · atualizar a cada migração concluída ou novo caminho paralelo descoberto

---

## Objetivo

Mapear todos os indicadores, modais, hooks e queries diretas que ainda operam fora do PC-100 oficial (`usePainelConsultorData`), com base no estado real do repositório na branch `proto`.

**Este documento é apenas auditoria.** Não dita prazos, não altera código, não autoriza migração automática.

---

## 1 · Estratégia oficial

**Princípio único:** PC-100 (`src/hooks/usePainelConsultorData.ts`) é a fonte soberana para todos os indicadores derivados. Toda divergência é bug.

**Diretrizes:**

- 🟢 **Migração incremental** — um indicador por commit, validação empírica antes de seguir
- 🔴 **Sem Big Bang refactor** — manter código legado vivo enquanto migração não está completa
- 🟢 **Padrão único de migração** — V2Home `MIGRATED_HISTORICO_KEYS` + `histArr2..histArr6` (ver seção 9)
- 🔴 **Sem novos hooks paralelos** — qualquer cálculo de indicador derivado deve nascer no PC-100, nunca em hooks externos
- 🔴 **Sem recálculo fora do PC-100** — telas que precisem de indicadores derivados consomem `{indicador}Indicador.valor`, não recalculam
- 🟢 **Critério para retirar legado** — só remover branch do hook legado após 100% dos consumidores estarem migrados E validação empírica confirmar paridade

---

## 2 · Indicadores MIGRATED (11)

Consomem `precoArrIndicador.valor`, `custoArrIndicador.valor` etc. através do padrão `{indicador}HistoricoOficial` em `V2Home.tsx` que reusa `usePainelConsultorData` com `ano: anoNum - k`.

| # | Indicador | Tela | Fonte oficial atual | Hook legado anterior | Status | Observações |
|---|---|---|---|---|---|---|
| 1 | `arrobas` | Visão Geral V2 → modal | PC-100 `arrobasIndicador` | `useHistoricoIndicador` (branch `arrobas`) | ✅ Migrado | Cumulativo Jan→mês via `arrobasProd` |
| 2 | `pesoMedio` | Visão Geral V2 → modal | PC-100 `pesoMedioIndicador` | `useHistoricoIndicador` (branch `pesoMedio`) | ✅ Migrado | Peso médio ponderado período |
| 3 | `gmd` | Visão Geral V2 → modal | PC-100 `gmdIndicador` | `useHistoricoIndicador` (branch `gmd`) | ✅ Migrado | GMD médio período |
| 4 | `uaHa` | Visão Geral V2 → modal | PC-100 `uaHaIndicador` | `useHistoricoIndicador` (branch `uaHa/kgHa`) | ✅ Migrado | Lotação UA/ha média |
| 5 | `kgHa` | Visão Geral V2 → modal | PC-100 `kgHaIndicador` | `useHistoricoIndicador` (branch `uaHa/kgHa`) | ✅ Migrado | Kg vivo / ha média |
| 6 | `areaProdutivaPec` | Visão Geral V2 → modal | PC-100 (interno) | n/a | ✅ Migrado | Calculado dentro do PC-100, sem branch externa |
| 7 | `custeioPec` | Visão Geral V2 → modal | PC-100 `custeioPecIndicador` | `useHistoricoIndicador` (branch unificada) | ✅ Migrado | `Σ custeioPec` período |
| 8 | `custoArr` | Visão Geral V2 → modal | PC-100 `custoArrIndicador` | `useHistoricoIndicador` (branch unificada) | ✅ Migrado | `custeioPec / arrobasProd` |
| 9 | `custoCab` | Visão Geral V2 → modal | PC-100 `custoCabIndicador` | `useHistoricoIndicador` (branch unificada) | ✅ Migrado | `custeioPec / cabMediaMes` |
| 10 | `margemArr` | Visão Geral V2 → modal | PC-100 `margemArrIndicador` | `useHistoricoIndicador` (branch unificada) | ✅ Migrado | `precoArr − custoArr` |
| 11 | `precoArr` | Visão Geral V2 → modal | PC-100 `precoArrIndicador` | `useHistoricoIndicador` (branch `receitaPec/precoArr`) | ✅ Migrado (`4417da37`, 14/05/2026) | `recPecComp / desfrute_arr` |

---

## 3 · Indicadores ainda LEGADO (4 identificados)

Consomem `useHistoricoIndicador` diretamente. `V2Home.tsx` mantém em `HIST_KEYS_PERMITIDAS` mas NÃO incluiu em `MIGRATED_HISTORICO_KEYS`.

| Indicador | Onde aparece | Hook/fonte legado | Branch no hook | Divergência conhecida | Prioridade |
|---|---|---|---|---|---|
| **`receitaPec`** | Modal "Receitas Pecuárias Competência" (V2Home) | `useHistoricoIndicador` → tabela `lancamentos` | L398, L467 | **Sim** — Σ `valor_total` direto de `lancamentos`, em vez de `recPecComp` classificado via `financeiro_lancamentos_v2`. Filtro `tipo IN (abate, venda, consumo)` + `cenario IN (realizado, meta)` | 🔴 **Alta** — mesma família de bug do `precoArr` |
| `cabecas` | Modal "Cabeças" (V2Home) | `useHistoricoIndicador` → tabela `zoot_mensal_cache` raw | L848 | **Provável** — `zoot_mensal_cache` raw NÃO aplica overlay de fechamento (`useRebanhoOficial`). Pode divergir em meses com `fechamento_pasto_itens` oficial | 🟡 Média |
| `desfrute` | Modal "Desfrute (Cab.)" (V2Home) | `useHistoricoIndicador` → tabela `lancamentos` (branch específica) | L314 | **Não auditado ainda** — usa fonte separada (`abate+venda+consumo` direto de `lancamentos`), divergente da definição oficial `abate+venda` | 🟡 Média |
| `valorRebanho` | Modal "Valor do Rebanho" (V2Home) | `useHistoricoIndicador` → view `valor_rebanho_realizado_validado` | L238 | **Não auditado ainda** — lê snapshot direto, sem normalização entre fazendas no modo Global | 🟢 Baixa (snapshot é fonte oficial de patrimônio) |

---

## 4 · Hooks legados ativos

| Hook | Arquivo | Linhas | Responsabilidade | Problema conhecido | Consumidores atuais |
|---|---|---|---|---|---|
| `useHistoricoIndicador` | `src/hooks/useHistoricoIndicador.ts` | 948 | Histórico multi-ano (até 7 anos) de indicadores derivados para modal das 8 barras | (a) Marcado como "⚠️ HISTÓRICO AUXILIAR LEGADO" no próprio header (L1-19); (b) Branch `receitaPec/precoArr` usa fórmula errada `qtd × peso_medio_kg / 30` para abate (deveria ser `peso_carcaca_kg / 15`); (c) `zoot_mensal_cache` raw sem overlay; (d) Inclui CONSUMO no denominador | `src/v2/pages/V2Home.tsx` (única chamada via L11/L241) |

**Outros arquivos com "histor" no nome (não são hooks legados de indicadores derivados):**

- `src/components/indicadores/HistoricoComparativo.tsx` — line chart de 3 anos (v1, escopo diferente)
- `src/components/mapa-geo/HistoricoPastoDialog.tsx` — modal de histórico de pasto (domínio Mapas)
- `src/lib/importZootHistorico.ts` + `src/pages/HistoricoImportacoesZootTab.tsx` + `src/pages/ImportZootHistoricoTab.tsx` — fluxo de importação zootécnica
- `src/v2/components/IndicadorHistoricoModal.tsx` — componente stateless do modal (apenas renderiza props)
- `src/v2/components/MovimentacaoHistoricoModal.tsx` — modal de movimentação (escopo separado)

---

## 5 · Queries diretas fora do PC-100 (bypass)

### 5.1 · `useHistoricoIndicador.ts` (5 tabelas/views consultadas)

| Tabela/view | Branches que usam | Risco |
|---|---|---|
| `lancamentos` | `receitaPec`, `precoArr`, `desfrute` (branches específicas) | 🔴 Alto — fórmula peso_vivo/30 errada para abate |
| `zoot_mensal_cache` | `cabecas`, `pesoMedio`, `arrobas`, `gmd` (e `uaHa`/`kgHa` parcial) | 🟡 Médio — raw sem overlay de fechamento |
| `valor_rebanho_realizado_validado` | `valorRebanho` | 🟢 Baixo — snapshot oficial é fonte aceitável para patrimônio |
| `fechamento_area_snapshot` | `uaHa`, `kgHa` (cruza com `zoot_mensal_cache`) | 🟢 Baixo — snapshot oficial de área |
| `financeiro_lancamentos_v2` | branches financeiras dos indicadores LEGADO mantidos (custeioPec, custoArr, custoCab, margemArr — embora MIGRATED, branch ainda existe no hook) | 🟢 Baixo — fonte oficial, mas duplicação de classificação financeira |

### 5.2 · `PainelConsultorTab.tsx` (4 tabelas/views consultadas)

`PainelConsultorTab.tsx` **NÃO usa `useHistoricoIndicador`**. Faz queries próprias para auditoria interna (não para o modal das 8 barras do V2Home):

| Tabela/view | Linhas aproximadas | Motivo do bypass |
|---|---|---|
| `valor_rebanho_meta_validada` | L1421-1428 | Leitura oficial do Valor do Rebanho META |
| `valor_rebanho_realizado_validado` | L1496, L1530 | Leitura oficial do Valor do Rebanho realizado |
| `vw_valor_rebanho_realizado_global_mensal` | (não auditado em linha) | View consolidada global |
| `valor_rebanho_fechamento` | (não auditado em linha) | Estado de fechamento P2 |

**Risco:** 🟡 Médio. Essas tabelas são fontes oficiais (snapshots de P2), mas o uso direto em PainelConsultorTab cria **uma segunda fonte para R$/@ patrimônio** (campo `preco_arroba_medio`), o que pode confundir auditoria cruzada com PC-100. Não é o mesmo bug do `precoArr` — semântica diferente (patrimônio vs venda).

---

## 6 · Componentes consumidores

| Componente | Arquivo | Função | Consome legado? | Consome PC-100? |
|---|---|---|---|---|
| `V2Home` | `src/v2/pages/V2Home.tsx` | Visão Geral V2 (cards + modais) | ✅ Sim — `useHistoricoIndicador` para 4 indicadores LEGADO | ✅ Sim — `usePainelConsultorData` (chamada principal + 5 históricas para anos -6..-2) |
| `IndicadorHistoricoModal` | `src/v2/components/IndicadorHistoricoModal.tsx` | Renderiza modal de barras | ❌ Não — é stateless, só recebe props | ❌ Não diretamente — recebe dados já preparados |
| `PainelConsultorTab` | `src/pages/PainelConsultorTab.tsx` | Painel Consultor (auditoria interna) | ❌ Não usa `useHistoricoIndicador` | ✅ Sim — `usePainelConsultorData` + queries próprias para snapshots P2 |
| Outras telas | (mapa, financeiro, zootécnico) | Diversos | ❌ Não auditadas como consumidoras de `useHistoricoIndicador` | (não relevante para esta auditoria) |

---

## 7 · Divergências matemáticas conhecidas

| Indicador | Cenário | Valor legado | Valor PC-100 oficial | Δ | Causa raiz | Status |
|---|---|---|---|---|---|---|
| `precoArr` | NJ Global, Jan-Abr/2025, "No período" | R$ 340,51 | R$ 322,12 (banco oficial: R$ 322,40) | +5,7% | (a) `peso_vivo/30` em vez de `peso_carcaca_kg/15` para abate; (b) inclusão de `consumo` no denominador; (c) numerador `Σ valor_total` direto em vez de `recPecComp` classificado | ✅ **Corrigido** via commit `4417da37` (14/05/2026) |
| `receitaPec` | NJ Global, Jan-Abr/2025 | (não validado neste documento) | A confirmar no step de migração de `receitaPec` | Não medido com rigor | Mesma fórmula problemática — `Σ valor_total` direto de `lancamentos` (inclui consumo) vs `recPecComp` classificado via `financeiro_lancamentos_v2` | 🔴 **Pendente** — backlog |
| `cabecas`, `pesoMedio`, `arrobas`, `gmd` | Meses com `fechamento_pasto_itens` oficial | (zoot_mensal_cache raw) | (com overlay via `useRebanhoOficial`) | Não medido | `zoot_mensal_cache` raw NÃO aplica overlay de fechamento | 🟡 **Não medido** — possível divergência silenciosa |
| `desfrute` | n/a | (lancamentos abate+venda+consumo) | (definição oficial: abate+venda) | Não medido | Inclui `consumo` no numerador | 🟡 **Não medido** |
| `valorRebanho` | n/a | (snapshot direto) | (snapshot direto — mesma fonte) | Não medido | Provavelmente paridade total — não há transformação | 🟢 **Não há causa identificada** |
| R$/@ patrimônio (PainelConsultorTab) | n/a | `valor_rebanho_realizado_validado.preco_arroba_medio` | n/a (PC-100 não expõe este indicador) | n/a | Semântica diferente — patrimônio vs venda. Não é bug, mas é caminho paralelo | 🟢 **Não é bug** — convenção aceitável |

---

## 8 · Prioridade de migração

| Prioridade | Indicador | Motivo | Custo estimado |
|---|---|---|---|
| 🔴 **P1** | `receitaPec` | Mesma causa raiz do `precoArr`. Divergência conhecida qualitativamente. Padrão de migração 100% disponível (4 edições análogas) | Marginal — 4 edições em `V2Home.tsx` |
| 🟡 **P2** | `cabecas`, `pesoMedio`, `arrobas`, `gmd` (legado para mês com fechamento oficial) | Possível divergência silenciosa em meses oficiais. Requer medição antes da decisão | Médio — precisa auditar magnitude da divergência antes |
| 🟡 **P2** | `desfrute` | Inclui `consumo` no numerador divergindo da definição oficial. Não medido | Médio — precisa medir antes |
| 🟢 **P3** | `valorRebanho` | Sem divergência identificada. Migração seria principalmente arquitetural | Médio-alto — requer criar `valorRebanhoIndicador` que reproduza snapshot, ou aceitar caminho paralelo como oficial |
| 🟢 **P3** | `R$/@ patrimônio` (PainelConsultorTab) | Não é bug — semântica diferente | Indefinido — pode permanecer como está |

---

## 9 · Padrão oficial de migração (descoberto e validado)

**Arquivo único de mudança:** `src/v2/pages/V2Home.tsx`

### Mecânica

- **Passo 1.** Reuso do hook PC-100 para anos anteriores — já existem 5 chamadas paralelas (`histArr2`..`histArr6`) com `enabled: modalUsaHistoricoOficial`
- **Passo 2.** Adicionar nome do indicador na constante `MIGRATED_HISTORICO_KEYS` (atualmente: `arrobas`, `pesoMedio`, `gmd`, `uaHa`, `kgHa`, `areaProdutivaPec`, `custeioPec`, `custoArr`, `custoCab`, `margemArr`, `precoArr`)
- **Passo 3.** Criar `useMemo` `{indicador}HistoricoOficial` que extrai `.valor` de cada `histArrN.{indicador}Indicador` (7 anos: -6..0)
- **Passo 4.** No render do modal, trocar `historicoAno={historicoAno}` por `historicoAno={{indicador}HistoricoOficial}`, `historicoMeta={[]}`, `loadingHistorico={loading{Indicador}Historico}`

### Custo de performance

- **Marginal zero** — as 5 chamadas `usePainelConsultorData(ano=N-k)` já existem (uma por ano)
- Cada chamada já retorna **todos** os indicadores derivados (incluindo o novo) — só não estava sendo consumido
- Gateadas por `enabled: modalUsaHistoricoOficial` — só rodam quando modal de indicador migrado abre

### Limitação conhecida do padrão

- **Barra "Meta" desaparece** no modal após migração (`historicoMeta={[]}`)
- Comportamento consistente em todos os 11 indicadores migrados
- Restaurar a barra Meta exigiria extensão do padrão (feature futura, fora do escopo de migração)

---

## 10 · Regras invioláveis para futuras migrações

1. ❌ **Não criar novos hooks paralelos** ao PC-100
2. ❌ **Não recalcular indicadores derivados fora do PC-100**
3. ❌ **Não criar novo domínio no PC-100** se o padrão `histArr2..histArr6` resolve
4. ❌ **Não remover branches legadas** do `useHistoricoIndicador` enquanto houver consumidor ativo
5. ❌ **Não fazer migração Big Bang** — um indicador por commit
6. ✅ **Validar empíricamente** (banco oficial + screenshot) cada migração antes de prosseguir
7. ✅ **Manter este documento atualizado** a cada migração ou novo caminho paralelo descoberto
8. ✅ **Comentário explícito no código** ao migrar um indicador, citando este documento

---

## 11 · Histórico de migrações realizadas

| Data | Indicador | Commit | Validação |
|---|---|---|---|
| (anterior, não datado neste doc) | `arrobas`, `pesoMedio`, `gmd`, `uaHa`, `kgHa`, `areaProdutivaPec`, `custeioPec`, `custoArr`, `custoCab`, `margemArr` | (10 indicadores) | (anterior) |
| 14/05/2026 | `precoArr` | `4417da37` | Modal NJ Global Jan-Abr/2025: R$ 340,51 → R$ 322,12 (banco oficial: R$ 322,40) |

---

## 12 · Itens não auditados ainda

Documentados para futuras revisões:

- [ ] Magnitude da divergência de `cabecas`/`pesoMedio`/`arrobas`/`gmd` entre `zoot_mensal_cache` raw vs PC-100 (com overlay) em meses com fechamento oficial
- [ ] Magnitude da divergência de `desfrute` (inclusão de `consumo`)
- [ ] Existência de outros consumidores de `useHistoricoIndicador` além de `V2Home.tsx` (busca preliminar não encontrou, mas branch `proto` não é indexada no GitHub search)
- [ ] Auditoria completa de `PainelConsultorTab.tsx` L1418-1556 — bloco "Auditoria multi-ano de Custo Cab" — pode ter outras queries não mapeadas
- [ ] Existência de outros caminhos paralelos em hooks `src/v2/hooks/` (`useFechamentoPeriodoData`, `useMovimentacoesAgregadas`, `usePainelGeralOficial`) — não auditados nesta passagem
- [ ] Comportamento de `useHistoricoIndicador` no modo "individual fazenda" (esta auditoria focou em modo Global)

---

## Apêndice A · Tabelas/views consultadas diretamente

Inventário de tabelas/views Supabase consultadas FORA do PC-100:

| Tabela/view | Tipo | Consumidor direto | Operação típica | Risco |
|---|---|---|---|---|
| `lancamentos` | tabela | `useHistoricoIndicador` | SELECT por cenario+tipo+data | 🔴 Alto (fórmula errada para abate) |
| `zoot_mensal_cache` | tabela cache | `useHistoricoIndicador` | SELECT por cenario+ano | 🟡 Médio (sem overlay) |
| `fechamento_area_snapshot` | snapshot | `useHistoricoIndicador` | SELECT por ano | 🟢 Baixo |
| `financeiro_lancamentos_v2` | tabela | `useHistoricoIndicador` | SELECT por status+cenario+data | 🟢 Baixo (fonte oficial) |
| `valor_rebanho_realizado_validado` | view/tabela | `useHistoricoIndicador`, `PainelConsultorTab` | SELECT por ano_mes | 🟢 Baixo (snapshot oficial) |
| `valor_rebanho_meta_validada` | view/tabela | `PainelConsultorTab` | SELECT por ano_mes | 🟢 Baixo (snapshot oficial) |
| `vw_valor_rebanho_realizado_global_mensal` | view | `PainelConsultorTab` | SELECT por ano_mes | 🟢 Baixo (view oficial) |
| `valor_rebanho_fechamento` | tabela | `PainelConsultorTab` | SELECT por ano_mes | 🟢 Baixo (snapshot oficial) |

---

## Apêndice B · Referências

- Hook PC-100: `src/hooks/usePainelConsultorData.ts` (122.236 chars, ~2750 linhas)
- Hook legado: `src/hooks/useHistoricoIndicador.ts` (39.609 chars, 948 linhas)
- Componente integrador: `src/v2/pages/V2Home.tsx` (~1500 linhas)
- Componente modal: `src/v2/components/IndicadorHistoricoModal.tsx` (475 linhas, stateless)
- Constantes oficiais: `src/lib/calculos/painelConsultorIndicadores.ts` (`TIPOS_DESFRUTE_OFICIAL`)
- Commit de referência (migração precoArr): `4417da37` em `proto`

---

*Fim do documento. Atualizar a cada migração de indicador ou descoberta de novo caminho paralelo.*
