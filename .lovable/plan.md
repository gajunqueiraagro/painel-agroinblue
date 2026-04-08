## Correção Estrutural: Fonte Única de Verdade Zootécnica

### Status: ✅ CONCLUÍDA

---

### Migração Final Executada

#### ✅ Fase 1 — `calcSaldoPorCategoriaLegado` eliminado
- DashboardFinanceiro.tsx → useRebanhoOficial
- AnaliseEconomica.tsx → useRebanhoOficial

#### ✅ Fase 2 — Acesso direto às views migrado
- useIndicadoresZootecnicos.ts → useRebanhoOficial
- VisaoAnualZootecnicaTab.tsx → useRebanhoOficial
- LancarFinHubTab.tsx → useRebanhoOficial
- ZootecnicoTab.tsx → useRebanhoOficial (via useIndicadoresZootecnicos)

#### ✅ Fase 3 — Exports e saldosIniciais
- exportUtils.ts → `calcEvolucaoCategoria` agora prioriza `ZootCategoriaMensal` da view oficial
- EvolucaoTab.tsx → useRebanhoOficial
- DesfrunteTab.tsx → useRebanhoOficial

#### ⚠️ Exceções documentadas (NÃO são violações)
- useStatusZootecnico.ts — badges, sem números
- useStatusFechamentosAno.ts — badges, sem números  
- useValorRebanhoGlobal.ts — agregação multi-fazenda
- FechamentoTab.tsx — conciliação comparativa
- ConciliacaoTab.tsx — auditoria P1

---

### Blindagens Ativas
- ESLint `no-restricted-imports` bloqueia import direto de hooks internos
- Guard no `indicadorCatalogo.ts` para Painel do Consultor
- Triggers de banco bloqueiam meses fechados
- Documento oficial: `/mnt/documents/ARQUITETURA_SOBERANA_ZOOTECNICA.md`
