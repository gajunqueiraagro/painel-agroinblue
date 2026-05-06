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
  | 'meta-precos'
  | 'painel-consultor' | 'auditoria-anual' | 'painel-anual'
  // mobile
  | 'atalhos-campeiro' | 'atalhos-financeiro'
  // config
  | 'configuracoes'
  | 'config-clientes'
  | 'config-fazendas'
  | 'config-bancario'
  | 'config-auditoria'
  // ── PR Reorganização — sections novas (placeholders / sem regression) ──
  | 'lancamentos-meta-zoo'   // (em construção) — futura variante de lancamentos-zoot filtrada por META
  | 'lancamentos-meta-fin'   // (em construção) — futura variante de financeiro-lanc filtrada por META
  | 'dre-executivo'          // (em construção)
  | 'divergencias'           // (em construção)
  | 'logs'                   // (em construção)
  | 'validacoes';            // (em construção)

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
        titulo: 'Operação',
        itens: [
          { id: 'lancamentos-zoot', label: 'Lançamentos Zootécnicos', status: 'ready', primary: true },
          { id: 'fechamento',       label: 'Fechamento Pastos',       status: 'ready', primary: true },
        ],
      },
      {
        titulo: 'Gestão',
        itens: [
          { id: 'rebanho-home',            label: 'Visão Geral',            status: 'ready' },
          { id: 'conferencia-lancamentos', label: 'Conferência Lançamentos', status: 'ready' },
          { id: 'conferencia-mensal',      label: 'Conferência Mensal',     status: 'ready' },
          { id: 'mapa-pastos',             label: 'Mapa Pastos',            status: 'ready' },
          { id: 'mapa-geo-pastos',         label: 'Geo Pastos',             status: 'ready' },
          { id: 'chuvas',                  label: 'Chuvas (em construção)', status: 'needs-wrapper' },
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
        titulo: 'Operação',
        itens: [
          { id: 'financeiro-lanc',     label: 'Lançamentos Financeiros', status: 'ready' },
          { id: 'conciliacao',         label: 'Conciliação Bancária',    status: 'ready' },
          { id: 'financiamentos',      label: 'Financiamentos',          status: 'needs-wrapper' },
          { id: 'contratos',           label: 'Contratos',               status: 'needs-wrapper' },
          { id: 'importacao-extratos', label: 'Importação Extratos',     status: 'needs-wrapper' },
        ],
      },
      {
        titulo: 'Gestão',
        itens: [
          { id: 'financeiro-dashboard',  label: 'Dashboard Financeiro',  status: 'needs-wrapper' },
          { id: 'fluxo-caixa',           label: 'Fluxo Caixa',           status: 'needs-wrapper' },
          { id: 'rateio-adm',            label: 'Rateio ADM',            status: 'needs-wrapper' },
          { id: 'painel-financiamentos', label: 'Painel Financiamentos', status: 'needs-wrapper' },
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
        titulo: 'Planejamento',
        itens: [
          { id: 'lancamentos-meta-zoo', label: 'Lançamentos META Zoo', status: 'ready' },
          { id: 'lancamentos-meta-fin', label: 'Lançamentos META Fin (em construção)', status: 'needs-wrapper' },
          { id: 'meta-gmd',             label: 'GMD META',                              status: 'ready' },
          { id: 'meta-precos',          label: 'Preços META',                           status: 'ready' },
        ],
      },
      {
        titulo: 'Gestão',
        itens: [
          { id: 'planejamento-home', label: 'Visão Geral Planejamento', status: 'ready' },
        ],
      },
    ],
  },

  // ── EXECUTIVO ──────────────────────────────────────────────────────────────
  {
    id: 'executivo',
    label: 'Executivo',
    drawer: [
      {
        titulo: 'Visão Executiva',
        itens: [
          { id: 'painel-consultor', label: 'PC-100',                       status: 'ready' },
          { id: 'indicadores-zoot', label: 'Indicadores',                  status: 'needs-wrapper' },
          { id: 'valor-rebanho',    label: 'Evolução Patrimonial',         status: 'needs-wrapper' },
          { id: 'dre-executivo',    label: 'DRE Executivo (em construção)', status: 'needs-wrapper' },
        ],
      },
    ],
  },

  // ── AUDITORIA ──────────────────────────────────────────────────────────────
  {
    id: 'auditoria',
    label: 'Auditoria',
    drawer: [
      {
        titulo: 'Auditoria',
        itens: [
          { id: 'auditoria-tecnica', label: 'Auditoria Técnica',          status: 'ready' },
          { id: 'auditoria-zoot',    label: 'Auditoria Zootécnica',       status: 'ready' },
          { id: 'divergencias',      label: 'Divergências (em construção)', status: 'needs-wrapper' },
          { id: 'logs',              label: 'Logs (em construção)',       status: 'needs-wrapper' },
          { id: 'validacoes',        label: 'Validações (em construção)', status: 'needs-wrapper' },
        ],
      },
    ],
  },

  // ── CADASTROS ──────────────────────────────────────────────────────────────
  {
    id: 'cadastros',
    label: 'Cadastros',
    drawer: [
      {
        titulo: 'Cadastros',
        itens: [
          { id: 'config-fazendas',  label: 'Fazendas',         status: 'ready' },
          { id: 'contas-bancarias', label: 'Contas Bancárias', status: 'needs-wrapper' },
          { id: 'fornecedores',     label: 'Fornecedores',     status: 'needs-wrapper' },
          { id: 'plano-contas',     label: 'Plano de Contas',  status: 'needs-wrapper' },
          { id: 'dividendos',       label: 'Dividendos',       status: 'needs-wrapper' },
        ],
      },
    ],
  },
];

export const SECTION_TO_GROUP: Partial<Record<V2Section, string>> = {
  // ── rebanho ──
  'rebanho-home': 'rebanho', 'pastos': 'rebanho', 'chuvas': 'rebanho',
  'lancamentos-zoot': 'rebanho',
  'mapa-pastos': 'rebanho', 'fechamento': 'rebanho',
  'mapa-geo-pastos': 'rebanho', 'resumo-pastos': 'rebanho',
  'evolucao-categoria': 'rebanho',
  'conferencia-lancamentos': 'rebanho', 'conferencia-mensal': 'rebanho',

  // ── financeiro ──
  'financeiro-home': 'financeiro', 'financeiro-dashboard': 'financeiro',
  'fluxo-caixa': 'financeiro', 'rateio-adm': 'financeiro',
  'importacao-extratos': 'financeiro', 'financeiro-lanc': 'financeiro',
  'contratos': 'financeiro', 'conciliacao': 'financeiro',
  'saldos-mensais': 'financeiro', 'financiamentos': 'financeiro',
  'painel-financiamentos': 'financeiro',
  'analise-trimestral': 'financeiro',
  'financeiro-caixa': 'financeiro', 'fluxo-anual': 'financeiro',

  // ── planejamento ──
  'planejamento-home': 'planejamento',
  'meta-gmd': 'planejamento', 'meta-precos': 'planejamento',
  'lancamentos-meta-zoo': 'planejamento', 'lancamentos-meta-fin': 'planejamento',
  // legados ainda no type (não no menu)
  'meta-cenario': 'planejamento', 'meta-consolidacao': 'planejamento', 'meta-metas': 'planejamento',

  // ── executivo ──
  'painel-consultor': 'executivo',
  'painel-anual':     'executivo',
  'auditoria-anual':  'executivo',
  'indicadores-zoot': 'executivo',
  'valor-rebanho':    'executivo',
  'dre-executivo':    'executivo',

  // ── auditoria ──
  'auditoria-tecnica': 'auditoria',
  'auditoria-zoot':    'auditoria',
  'divergencias':      'auditoria',
  'logs':              'auditoria',
  'validacoes':        'auditoria',

  // ── cadastros ──
  'config-fazendas':  'cadastros',
  'contas-bancarias': 'cadastros',
  'fornecedores':     'cadastros',
  'plano-contas':     'cadastros',
  'dividendos':       'cadastros',

  // ── config (legado) ──
  'config-clientes':  'configuracoes',
  'config-bancario':  'configuracoes',
  'config-auditoria': 'configuracoes',
};
