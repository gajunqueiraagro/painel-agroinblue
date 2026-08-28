/**
 * navGrupos.ts — Fonte única de verdade para a navegação do /v2
 * Atualizado com estrutura completa do módulo Financeiro.
 */
// PR-CLEANUP-REFERENCIAS-OPERACIONAIS-01 — import de FEATURE_FLAGS removido: o unico
// consumidor era o item condicional 'mesa-operacional', agora fora do menu.

export type V2Section =
  | 'home'
  // rebanho
  | 'rebanho-home' | 'pastos' | 'chuvas' | 'chuvas-lancamento' | 'lancamentos-zoot'
  | 'operacoes-comerciais'
  | 'mapa-pastos' | 'fechamento' | 'meta-gmd' | 'mapa-geo-pastos'
  | 'conferencia-lancamentos' | 'conferencia-mensal'
  | 'resumo-pastos' | 'evolucao-categoria' | 'auditoria-tecnica'
  | 'auditoria-zoot' | 'valor-rebanho' | 'indicadores-zoot'
  // financeiro — visão geral
  | 'financeiro-home' | 'financeiro-dashboard' | 'fluxo-caixa'
  | 'rateio-adm' | 'importacao-extratos' | 'importacao-custeio-txt'
  | 'importacao-lanc-excel'
  // financeiro — lançamentos
  | 'financeiro-lanc' | 'contratos'
  // financeiro — conciliação
  | 'conciliacao' | 'auditoria-bancaria' | 'extrato-gerencial' | 'visao-consolidada' | 'saldos-mensais'
  // financeiro — financiamentos
  | 'financiamentos' | 'painel-financiamentos'
  // financeiro — cadastros
  | 'contas-bancarias' | 'fornecedores' | 'plano-contas' | 'dividendos'
  | 'subcentro-aliases' | 'safras'
  // financeiro — análise
  | 'analise-trimestral' | 'financeiro-caixa' | 'fluxo-anual'
  // planejamento (IDs legados preservados)
  | 'planejamento-home' | 'meta-cenario' | 'meta-metas' | 'meta-consolidacao'
  | 'meta-precos' | 'fluxo-caixa-meta'
  | 'areas-meta'
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
  | 'validacoes'             // (em construção)
  /* ⚠ AS QUATRO ABAIXO NAO TEM ROTA e nao devem ganhar uma sem tela por tras. Existem
     porque `NavItem.id` e' tipado como V2Section e o menu anuncia o rumo do produto
     (PR-NAV-PRODUCAO-01): sao itens `emConstrucao`, nao clicaveis. Ficam FORA de
     SECTION_TO_GROUP e de SECTION_PERIODO de proposito — os tres mapas sao `Partial`,
     entao ausencia ali nao quebra nada. */
  | 'lancamentos-agricultura' | 'lancamentos-silvicultura'
  | 'agricultura-home' | 'silvicultura-home'
  | 'fechamento-periodo'    // Marco 2.4 — cockpit Fechamento do Período
  | 'executive-preview';    // FASE 3 / PR3.3A — sandbox isolado do ExecutiveSlide (fake data)

export type ItemStatus = 'ready' | 'needs-wrapper';

export interface NavItem {
  id: V2Section;
  label: string;
  status: ItemStatus;
  primary?: boolean;
  /* Area anunciada e ainda nao construida: aparece SEMPRE, cinza, com a marca "em
     construção" e sem clique. Decisao do Gabriel — o menu anuncia o rumo. Nao e'
     `status`, que fala de wrapper de rota; e' outro eixo. */
  emConstrucao?: boolean;
}

export interface NavSecao {
  /* Vazio = secao SEM cabecalho. Usado por "Fechamento Área", que deixou de ser
     exclusivo da pecuaria e por isso nao mora sob nenhum dos escopos. */
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
  /* ⚠ SO ROTULO E ESTRUTURA MUDARAM (PR-NAV-PRODUCAO-01). O `id` do grupo continua
     'rebanho' e todos os `id` de item continuam os mesmos: rota, URL e envelope
     intactos. SECTION_TO_GROUP segue apontando para 'rebanho' — trocar aquela chave
     seria trocar identificador, que este PR nao faz.
     ⚠ AS TELAS NAO MUDARAM. "Fechamento Área" abre a MESMA tela que so sabe de
     pastos; o rename antecipa o escopo, nao o implementa. */
  {
    id: 'rebanho',
    label: 'Produção',
    drawer: [
      {
        titulo: 'Lançar',
        itens: [
          { id: 'lancamentos-zoot',          label: 'Pecuária',     status: 'ready', primary: true },
          { id: 'lancamentos-agricultura',   label: 'Agricultura',  status: 'ready', emConstrucao: true },
          { id: 'lancamentos-silvicultura',  label: 'Silvicultura', status: 'ready', emConstrucao: true },
        ],
      },
      {
        /* SEM CABECALHO, e e' o ponto: o fechamento deixou de ser exclusivo da
           pecuaria, entao pendura-lo sob "Pecuária" diria o contrario. */
        titulo: '',
        itens: [
          { id: 'fechamento', label: 'Fechamento Área', status: 'ready', primary: true },
        ],
      },
      {
        titulo: 'Pecuária',
        itens: [
          { id: 'rebanho-home',            label: 'Visão Geral',          status: 'ready' },
          { id: 'conferencia-lancamentos', label: 'Lançamentos',          status: 'ready' },
          { id: 'operacoes-comerciais',    label: 'Operações Comerciais', status: 'ready', primary: true },
          { id: 'conferencia-mensal',      label: 'Evolução no Ano',      status: 'ready' },
          { id: 'mapa-pastos',             label: 'Mapa de Pastos',       status: 'ready' },
          { id: 'mapa-geo-pastos',         label: 'Geo Pastos',           status: 'ready' },
          { id: 'chuvas',                  label: 'Chuvas',               status: 'ready' },
        ],
      },
      {
        titulo: 'Agricultura',
        itens: [
          { id: 'agricultura-home', label: 'Visão Geral', status: 'ready', emConstrucao: true },
        ],
      },
      {
        titulo: 'Silvicultura',
        itens: [
          { id: 'silvicultura-home', label: 'Visão Geral', status: 'ready', emConstrucao: true },
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
          { id: 'auditoria-bancaria',  label: 'Auditoria Bancária',      status: 'ready' },
          { id: 'extrato-gerencial',   label: 'Extrato Gerencial',       status: 'ready' },
          { id: 'visao-consolidada',   label: 'Visão Consolidada',       status: 'ready' },
          // PR-CLEANUP-MESA-CLASSIFICACAO-01 — 'mesa-classificacao' saiu do menu. O fluxo
          // vigente e' Conciliação Bancária → Importar Banco / Enriquecer / Conciliação.
          // PR-CLEANUP-REFERENCIAS-OPERACIONAIS-01 — 'mesa-operacional' saiu do menu junto com
          // o tipo, o mapa de grupo e a rota. O item era condicionado a
          // FEATURE_FLAGS.MESA_OPERACIONAL_V2, que estava ATIVA no ambiente da Vercel apesar de
          // ausente nos .env do repo; sem este item a flag deixa de ter qualquer consumidor e
          // VITE_MESA_OPERACIONAL_V2=true nao reativa mais nada.
          { id: 'financiamentos',      label: 'Financiamentos',          status: 'needs-wrapper' },
          { id: 'contratos',           label: 'Contratos',               status: 'needs-wrapper' },
          { id: 'importacao-extratos', label: 'Importação Extratos',     status: 'needs-wrapper' },
          { id: 'importacao-custeio-txt', label: 'Importação Custeio (TXT)', status: 'ready' },
          // PR-IMPORT-EXCEL-LANC-01 — planilha no vocabulário DO CLIENTE (de-para de plano
          // de contas). Distinta de 'Importação Extratos', que exige o formato AGROinBLUE.
          { id: 'importacao-lanc-excel', label: 'Importação Lançamentos (Excel)', status: 'ready' },
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
          { id: 'lancamentos-meta-zoo', label: 'Lançamentos META Zoo',       status: 'ready' },
          { id: 'lancamentos-meta-fin', label: 'Lançamentos META Financeiro', status: 'ready' },
          { id: 'meta-gmd',             label: 'GMD META',                    status: 'ready' },
          { id: 'meta-precos',          label: 'Preços META',                 status: 'ready' },
          { id: 'areas-meta',           label: 'Áreas META',                  status: 'ready' },
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
          { id: 'painel-consultor',    label: 'PC-100',                       status: 'ready' },
          { id: 'fechamento-periodo',  label: 'Fechamento do Período',        status: 'ready' },
          { id: 'indicadores-zoot',    label: 'Indicadores',                  status: 'needs-wrapper' },
          { id: 'valor-rebanho',       label: 'Evolução Patrimonial',         status: 'needs-wrapper' },
          { id: 'dre-executivo',       label: 'DRE Executivo (em construção)', status: 'needs-wrapper' },
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
          /* O item abre a tela com as abas Cadastro e Pastos — "Fazendas" sozinho
             escondia metade do que ha ali. */
          { id: 'config-fazendas',   label: 'Fazendas e Pastos',   status: 'ready' },
          { id: 'contas-bancarias',  label: 'Contas Bancárias',    status: 'needs-wrapper' },
          { id: 'fornecedores',      label: 'Fornecedores',        status: 'needs-wrapper' },
          { id: 'plano-contas',      label: 'Plano de Contas',     status: 'needs-wrapper' },
          { id: 'safras',            label: 'Safras',              status: 'ready' },
          { id: 'subcentro-aliases', label: 'Aliases de Subcentro', status: 'needs-wrapper' },
          { id: 'dividendos',        label: 'Dividendos',          status: 'needs-wrapper' },
        ],
      },
    ],
  },
];

export const SECTION_TO_GROUP: Partial<Record<V2Section, string>> = {
  // ── rebanho ──
  'rebanho-home': 'rebanho', 'pastos': 'rebanho', 'chuvas': 'rebanho',
  'chuvas-lancamento': 'rebanho',
  'lancamentos-zoot': 'rebanho',
  'mapa-pastos': 'rebanho', 'fechamento': 'rebanho',
  'mapa-geo-pastos': 'rebanho', 'resumo-pastos': 'rebanho',
  'evolucao-categoria': 'rebanho',
  'conferencia-lancamentos': 'rebanho', 'conferencia-mensal': 'rebanho',

  // ── financeiro ──
  'financeiro-home': 'financeiro', 'financeiro-dashboard': 'financeiro',
  'fluxo-caixa': 'financeiro', 'rateio-adm': 'financeiro',
  'importacao-extratos': 'financeiro', 'importacao-custeio-txt': 'financeiro', 'financeiro-lanc': 'financeiro',
  'importacao-lanc-excel': 'financeiro',
  'contratos': 'financeiro', 'conciliacao': 'financeiro', 'auditoria-bancaria': 'financeiro',
  'saldos-mensais': 'financeiro', 'financiamentos': 'financeiro',
  'painel-financiamentos': 'financeiro',
  'analise-trimestral': 'financeiro',
  'financeiro-caixa': 'financeiro', 'fluxo-anual': 'financeiro',

  // ── planejamento ──
  'planejamento-home': 'planejamento',
  'meta-gmd': 'planejamento', 'meta-precos': 'planejamento',
  'lancamentos-meta-zoo': 'planejamento', 'lancamentos-meta-fin': 'planejamento',
  'fluxo-caixa-meta': 'planejamento',
  'areas-meta': 'planejamento',
  // legados ainda no type (não no menu)
  'meta-cenario': 'planejamento', 'meta-consolidacao': 'planejamento', 'meta-metas': 'planejamento',

  // ── executivo ──
  'painel-consultor':    'executivo',
  'painel-anual':        'executivo',
  'auditoria-anual':     'executivo',
  'indicadores-zoot':    'executivo',
  'valor-rebanho':       'executivo',
  'dre-executivo':       'executivo',
  'fechamento-periodo':  'executivo',

  // ── auditoria ──
  'auditoria-tecnica': 'auditoria',
  'auditoria-zoot':    'auditoria',
  'divergencias':      'auditoria',
  'logs':              'auditoria',
  'validacoes':        'auditoria',

  // ── cadastros ──
  'config-fazendas':   'cadastros',
  'contas-bancarias':  'cadastros',
  'fornecedores':      'cadastros',
  'plano-contas':      'cadastros',
  'safras':            'cadastros',
  'subcentro-aliases': 'cadastros',
  'dividendos':        'cadastros',

  // ── config (legado) ──
  'config-clientes':  'configuracoes',
  'config-bancario':  'configuracoes',
  'config-auditoria': 'configuracoes',
};
