/**
 * navGrupos.ts — Fonte única de verdade para a navegação do /v2
 * Atualizado com estrutura completa do módulo Financeiro.
 */

export type V2Section =
  | 'home'
  // rebanho
  | 'rebanho-home' | 'pastos' | 'chuvas' | 'lancamentos-zoot'
  | 'mapa-pastos' | 'fechamento' | 'meta-gmd' | 'mapa-geo-pastos'
  | 'conferencia-lancamentos' | 'conferencia-mensal'
  | 'resumo-pastos' | 'evolucao-categoria' | 'auditoria-tecnica'
  | 'auditoria-zoot' | 'valor-rebanho' | 'indicadores-zoot'
  // financeiro — visão geral
  | 'financeiro-home' | 'financeiro-dashboard' | 'fluxo-caixa'
  | 'rateio-adm' | 'importacao-extratos'
  // financeiro — lançamentos
  | 'financeiro-lanc' | 'contratos'
  // financeiro — conciliação
  | 'conciliacao' | 'saldos-mensais'
  // financeiro — financiamentos
  | 'financiamentos' | 'painel-financiamentos'
  // financeiro — cadastros
  | 'contas-bancarias' | 'fornecedores' | 'plano-contas' | 'dividendos'
  // financeiro — análise
  | 'analise-trimestral' | 'financeiro-caixa' | 'fluxo-anual'
  // planejamento (IDs legados preservados)
  | 'planejamento-home' | 'meta-cenario' | 'meta-metas' | 'meta-consolidacao'
  | 'painel-consultor' | 'auditoria-anual' | 'painel-anual'
  // mobile
  | 'atalhos-campeiro' | 'atalhos-financeiro'
  // config
  | 'configuracoes';

export type ItemStatus = 'ready' | 'needs-wrapper';

export interface NavItem {
  id: V2Section;
  label: string;
  status: ItemStatus;
  primary?: boolean;
}

export interface NavSecao {
  titulo: string;
  itens: NavItem[];
}

export interface NavGrupo {
  id: string;
  label: string;
  drawer: NavSecao[];
}

export const NAV_GRUPOS: NavGrupo[] = [

  // ── REBANHO ────────────────────────────────────────────────────────────────
  {
    id: 'rebanho',
    label: 'Rebanho',
    drawer: [
      {
        titulo: 'Visão Geral',
        itens: [{ id: 'rebanho-home', label: 'Resumo do Rebanho', status: 'ready' }],
      },
      {
        titulo: 'Cadastros',
        itens: [
          { id: 'pastos', label: 'Pastos', status: 'ready' },
        ],
      },
      {
        titulo: 'Lançamentos',
        itens: [
          { id: 'chuvas', label: 'Chuvas', status: 'ready' },
        ],
      },
      {
        titulo: 'Conferência',
        itens: [
          { id: 'fechamento',                label: 'Fechamento de Pastos',       status: 'ready', primary: true },
          { id: 'conferencia-lancamentos',    label: 'Conferência de Lançamentos', status: 'ready' },
          { id: 'conferencia-mensal',         label: 'Conferência Mensal',         status: 'ready' },
          { id: 'meta-gmd',        label: 'GMD Meta',             status: 'ready' },
          { id: 'mapa-pastos',     label: 'Mapa de Pastos',       status: 'ready' },
          { id: 'mapa-geo-pastos', label: 'Mapa Geo Pastos',      status: 'ready' },
          { id: 'resumo-pastos',   label: 'Resumo Pastos',        status: 'ready' },
        ],
      },
      {
        titulo: 'Análise',
        itens: [
          { id: 'evolucao-categoria', label: 'Mapa do Rebanho',      status: 'ready' },
          { id: 'auditoria-tecnica',  label: 'Conferência Técnica',  status: 'ready' },
          { id: 'auditoria-zoot',     label: 'Auditoria Zootécnica', status: 'ready' },
          { id: 'valor-rebanho',      label: 'Valor Rebanho',        status: 'needs-wrapper' },
          { id: 'indicadores-zoot',        label: 'Indicadores',          status: 'needs-wrapper' },
        ],
      },
    ],
  },

  // ── FINANCEIRO ─────────────────────────────────────────────────────────────
  {
    id: 'financeiro',
    label: 'Financeiro',
    drawer: [
      {
        titulo: 'Visão Geral',
        itens: [
          { id: 'financeiro-home',      label: 'Resumo Financeiro',     status: 'ready' },
          { id: 'financeiro-dashboard', label: 'Dashboard Financeiro',  status: 'needs-wrapper' },
          { id: 'fluxo-caixa',          label: 'Fluxo de Caixa',        status: 'needs-wrapper' },
          { id: 'rateio-adm',           label: 'Rateio ADM',            status: 'needs-wrapper' },
          { id: 'importacao-extratos',  label: 'Importação / Extratos', status: 'needs-wrapper' },
        ],
      },
      {
        titulo: 'Lançamentos',
        itens: [
          { id: 'financeiro-lanc', label: 'Lançamentos Financeiros',  status: 'ready' },
          { id: 'contratos',       label: 'Contratos / Recorrências', status: 'needs-wrapper' },
        ],
      },
      {
        titulo: 'Conciliação',
        itens: [
          { id: 'conciliacao',    label: 'Conciliação Bancária',    status: 'ready' },
          { id: 'saldos-mensais', label: 'Saldos Mensais (legado)', status: 'needs-wrapper' },
        ],
      },
      {
        titulo: 'Financiamentos',
        itens: [
          { id: 'financiamentos',        label: 'Financiamentos',          status: 'needs-wrapper' },
          { id: 'painel-financiamentos', label: 'Painel de Financiamentos', status: 'needs-wrapper' },
        ],
      },
      {
        titulo: 'Cadastros',
        itens: [
          { id: 'contas-bancarias', label: 'Contas Bancárias', status: 'needs-wrapper' },
          { id: 'fornecedores',     label: 'Fornecedores',     status: 'needs-wrapper' },
          { id: 'plano-contas',     label: 'Plano de Contas',  status: 'needs-wrapper' },
          { id: 'dividendos',       label: 'Dividendos',       status: 'needs-wrapper' },
        ],
      },
      {
        titulo: 'Análise',
        itens: [
          { id: 'analise-trimestral', label: 'Análise Trimestral', status: 'ready' },
          { id: 'financeiro-caixa',   label: 'Financeiro Caixa',   status: 'ready' },
          { id: 'fluxo-anual',        label: 'Fluxo Anual',        status: 'needs-wrapper' },
        ],
      },
    ],
  },

  // ── PLANEJAMENTO ───────────────────────────────────────────────────────────
  {
    id: 'planejamento',
    label: 'Planejamento',
    drawer: [
      {
        titulo: 'Visão Geral',
        itens: [{ id: 'planejamento-home', label: 'Resumo Planejamento', status: 'ready' }],
      },
      {
        titulo: 'META',
        itens: [
          { id: 'meta-cenario',      label: 'Planejamento Financeiro', status: 'ready' },
          { id: 'meta-consolidacao', label: 'Consolidação META',       status: 'ready' },
        ],
      },
      {
        titulo: 'Painel Consultor',
        itens: [{ id: 'painel-anual', label: 'PC-100', status: 'ready' }],
      },
    ],
  },
];

export const SECTION_TO_GROUP: Partial<Record<V2Section, string>> = {
  // rebanho
  'rebanho-home': 'rebanho', 'pastos': 'rebanho', 'chuvas': 'rebanho',
  'lancamentos-zoot': 'rebanho', 'mapa-pastos': 'rebanho', 'fechamento': 'rebanho',
  'meta-gmd': 'rebanho', 'mapa-geo-pastos': 'rebanho', 'resumo-pastos': 'rebanho',
  'evolucao-categoria': 'rebanho', 'auditoria-tecnica': 'rebanho',
  'auditoria-zoot': 'rebanho', 'valor-rebanho': 'rebanho', 'indicadores': 'rebanho',
  // financeiro
  'financeiro-home': 'financeiro', 'financeiro-dashboard': 'financeiro',
  'fluxo-caixa': 'financeiro', 'rateio-adm': 'financeiro',
  'importacao-extratos': 'financeiro', 'financeiro-lanc': 'financeiro',
  'contratos': 'financeiro', 'conciliacao': 'financeiro',
  'saldos-mensais': 'financeiro', 'financiamentos': 'financeiro',
  'painel-financiamentos': 'financeiro', 'contas-bancarias': 'financeiro',
  'fornecedores': 'financeiro', 'plano-contas': 'financeiro',
  'dividendos': 'financeiro', 'analise-trimestral': 'financeiro',
  'financeiro-caixa': 'financeiro', 'fluxo-anual': 'financeiro',
  // planejamento
  'planejamento-home': 'planejamento', 'meta-cenario': 'planejamento',
  'meta-metas': 'planejamento', 'meta-consolidacao': 'planejamento',
  'painel-consultor': 'planejamento', 'auditoria-anual': 'planejamento',
  'painel-anual': 'planejamento',
};
