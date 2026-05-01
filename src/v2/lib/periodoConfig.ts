import type { V2Section } from './navGrupos';

export type PeriodoTipo = 'nenhum' | 'ano' | 'ano-mes';

export const SECTION_PERIODO: Partial<Record<V2Section, PeriodoTipo>> = {
  'rebanho-home':          'nenhum',
  'pastos':                'nenhum',
  'chuvas':                'ano',
  'lancamentos-zoot':      'nenhum',
  'fechamento':            'ano',
  'meta-gmd':              'ano',
  'mapa-pastos':           'ano-mes',
  'mapa-geo-pastos':       'nenhum',
  'resumo-pastos':         'ano-mes',
  'evolucao-categoria':    'ano-mes',
  'auditoria-tecnica':     'ano',
  'auditoria-zoot':        'ano',
  'valor-rebanho':         'ano-mes',
  'evolucao':              'ano',
  'indicadores-zoot':      'ano',
  'financeiro-home':       'nenhum',
  'financeiro-dashboard':  'ano',
  'fluxo-caixa':           'ano',
  'rateio-adm':            'ano',
  'importacao-extratos':   'nenhum',
  'financeiro-lanc':       'nenhum',
  'conciliacao':           'nenhum',
  'saldos-mensais':        'nenhum',
  'financiamentos':        'nenhum',
  'painel-financiamentos': 'ano',
  'contratos':             'nenhum',
  'contas-bancarias':      'nenhum',
  'fornecedores':          'nenhum',
  'plano-contas':          'nenhum',
  'dividendos':            'nenhum',
  'analise-trimestral':    'ano',
  'financeiro-caixa':      'nenhum',
  'fluxo-anual':           'nenhum',
  'planejamento-home':     'nenhum',
  'meta-cenario':          'ano',
  'meta-metas':            'ano',
  'meta-consolidacao':     'ano',
  'painel-anual':          'ano-mes',
  'auditoria-anual':       'ano',
  'home':                  'ano-mes',
  'painel-consultor':      'ano-mes',
  'configuracoes':         'nenhum',
  'atalhos-campeiro':      'nenhum',
  'atalhos-financeiro':    'nenhum',
};

export function getPeriodoTipo(section: V2Section): PeriodoTipo {
  return SECTION_PERIODO[section] ?? 'ano';
}
