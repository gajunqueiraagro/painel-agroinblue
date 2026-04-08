## Correção Estrutural: Fonte Única de Verdade Zootécnica

### A. Diagnóstico — Violações encontradas

#### 🔴 CRÍTICO — Ainda usam `calcSaldoPorCategoriaLegado` (recálculo por movimentação)
1. **`DashboardFinanceiro.tsx`** — calcula rebanho médio mensal via saldosIniciais + lançamentos
2. **`AnaliseEconomica.tsx`** — calcula rebanho médio mensal via saldosIniciais + lançamentos

#### 🟠 MÉDIO — Acessam views diretamente (sem passar por useRebanhoOficial)
3. **`useIndicadoresZootecnicos.ts`** — usa `useZootCategoriaMensal` + `useZootMensal` diretamente
4. **`VisaoAnualZootecnicaTab.tsx`** — query direta em `vw_zoot_categoria_mensal`
5. **`useStatusZootecnico.ts`** — query direta em `vw_zoot_categoria_mensal`
6. **`useValorRebanhoGlobal.ts`** — query direta em `vw_zoot_categoria_mensal`
7. **`LancarFinHubTab.tsx`** — usa `useZootCategoriaMensal` diretamente
8. **`ZootecnicoTab.tsx`** — usa view data diretamente via useIndicadoresZootecnicos
9. **`FechamentoTab.tsx`** — usa `useZootCategoriaMensal` diretamente (conciliação)
10. **`ConciliacaoTab.tsx`** — usa `useZootCategoriaMensal` diretamente

#### 🟡 BAIXO — Usam saldosIniciais para reconstruir saldo
11. **`exportUtils.ts`** — calcFluxoAnual recalcula saldo por movimentação
12. **`EvolucaoTab.tsx`** — usa saldosIniciais.filter
13. **`DesfrunteTab.tsx`** — usa saldosIniciais.filter
14. **`FluxoAnualTab.tsx`** — usa exportUtils internamente

#### ✅ JÁ MIGRADOS (7 arquivos)
- VisaoZooHubTab, MapaGeoPastosTab, VariacaoEstoqueExplicacao, GraficosAnaliseTab, AnaliseDRE, AnaliseTab, PainelConsultorTab

---

### B. Plano de Migração (em 3 fases)

#### Fase 1 — Eliminar `calcSaldoPorCategoriaLegado` (2 arquivos críticos)
- **DashboardFinanceiro.tsx**: Trocar por `useRebanhoOficial.getSaldoMap()` e `getSaldoInicialMap()`
- **AnaliseEconomica.tsx**: Trocar por `useRebanhoOficial.getSaldoMap()` e `getSaldoInicialMap()`

#### Fase 2 — Migrar acesso direto às views (8 arquivos)
- **useIndicadoresZootecnicos.ts**: Refatorar para consumir `useRebanhoOficial` ao invés de chamar `useZootCategoriaMensal` + `useZootMensal` diretamente
- **VisaoAnualZootecnicaTab.tsx**: Substituir query direta por `useRebanhoOficial`
- **useStatusZootecnico.ts**: Substituir query direta por `useRebanhoOficial`
- **useValorRebanhoGlobal.ts**: Substituir query direta por `useRebanhoOficial`
- **LancarFinHubTab.tsx**: Substituir `useZootCategoriaMensal` por `useRebanhoOficial`
- **FechamentoTab.tsx**: Para conciliação, manter view como fonte explicativa (não define saldo final)
- **ConciliacaoTab.tsx**: Manter view como fonte explicativa (conciliação compara sistema vs pastos)

#### Fase 3 — Migrar exports e telas com saldosIniciais (3 arquivos)
- **exportUtils.ts**: Refatorar `calcFluxoAnual` para receber dados do `useRebanhoOficial`
- **EvolucaoTab.tsx**: Migrar para `useRebanhoOficial`
- **DesfrunteTab.tsx**: Migrar para `useRebanhoOficial`

---

### C. Proteção Arquitetural

1. Adicionar comentário de header em `useZootCategoriaMensal.ts` e `useZootMensal.ts` marcando como "USO INTERNO — consumir via useRebanhoOficial"
2. Remover export de `calcSaldoPorCategoriaLegado` de `zootecnicos.ts` após migração
3. Documentar regra no `useRebanhoOficial.ts`

---

### D. Exceções permitidas
- **FechamentoTab** e **ConciliacaoTab**: usam view para *comparação/conciliação* (sistema vs pastos), não para definir saldo final — isso é aceitável
- **SaldoInicialForm**: é tela de *input* de dados, não de leitura — aceitável

---

### Escopo total: ~13 arquivos a migrar
### Prioridade: Fase 1 (2 arquivos críticos) → Fase 2 (6 arquivos) → Fase 3 (3 arquivos)
