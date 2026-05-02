export type V3PeriodoTipo = 'nenhum' | 'ano' | 'ano-mes';

export const V3_PERIODO: Record<string, V3PeriodoTipo> = {
  'financeiro-dashboard':    'ano-mes',
  'fluxo-caixa':             'ano-mes',
  'conferencia-lancamentos': 'ano',
  'conferencia-mensal':      'ano-mes',
  'valor-rebanho':           'ano',
  'mapa-pastos':             'ano-mes',
  'chuvas':                  'ano',
  'meta-gmd':                'ano',
  'painel-financiamentos':   'ano',
  'home':                    'nenhum',
};

export function getV3PeriodoTipo(section: string): V3PeriodoTipo {
  return V3_PERIODO[section] ?? 'nenhum';
}
