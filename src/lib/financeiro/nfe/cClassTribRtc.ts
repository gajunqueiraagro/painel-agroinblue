/**
 * GERADO por `scripts/gerar-cclasstrib-rtc.py` — não editar à mão (CALCULADORA-RTC-CONFERIR-01, Gabriel 22/11).
 * Fonte: ReceitaFederal/calculadora-rtc-regime-regular, licenca MIT (Copyright (c) 2026 Receita Federal do Brasil): flyway/sql/criacao/B0001 + flyway/sql/manutencao ate V0073 (Nova tabela de Classificações Tributárias (IT 2025.002 v.1.71), publicada em 30/10/2026.). So as classificacoes e tratamentos vigentes, sem o Imposto Seletivo.
 * Regra: conta: aliquota efetiva = arred4(aliquota x (1 - pRed/100)), calculado = arred2(arred2(vBC) x efetiva / 100), vDif = arred2(vBC x efetiva / 100 x pDif / 100), devido = calculado - vDif; zero: aliquota 0; fora: a conta nao se refaz pela base e pela aliquota escritas (base por quantidade, base reduzida, aliquota fixa ou setorial, monofasica, isencao/imunidade, transferencia e ajustes de credito) — nao se confere.
 */
export type RegraDaClassificacao = {
  cst: string;
  regra: 'conta' | 'zero' | 'fora';
  /** percentual de redução da alíquota (0–100) por tributo */
  pRed?: { CBS: number; IBSUF: number; IBSMun: number };
  /** percentual do diferimento (0–100) */
  pDif?: number;
};

export const CCLASSTRIB_RTC: Readonly<Record<string, RegraDaClassificacao>> = {
  '000001': { cst: '000', regra: 'conta', pRed: { CBS: 0, IBSUF: 0, IBSMun: 0 } }, // Tributação integral
  '000002': { cst: '000', regra: 'conta', pRed: { CBS: 0, IBSUF: 0, IBSMun: 0 } }, // Tributação integral
  '000003': { cst: '000', regra: 'conta', pRed: { CBS: 0, IBSUF: 0, IBSMun: 0 } }, // Tributação integral
  '000004': { cst: '000', regra: 'conta', pRed: { CBS: 0, IBSUF: 0, IBSMun: 0 } }, // Tributação integral
  '000005': { cst: '000', regra: 'conta', pRed: { CBS: 0, IBSUF: 0, IBSMun: 0 } }, // Tributação integral
  '000006': { cst: '000', regra: 'conta', pRed: { CBS: 0, IBSUF: 0, IBSMun: 0 } }, // Tributação integral
  '010001': { cst: '010', regra: 'fora' }, // Tributação com alíquotas uniformes - operações do FGTS
  '010002': { cst: '010', regra: 'fora' }, // Tributação com alíquotas uniformes - operações do setor financeiro
  '011001': { cst: '011', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Tributação com alíquotas uniformes reduzidas em 60%
  '011002': { cst: '011', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Tributação com alíquotas uniformes reduzidas em 60%
  '011003': { cst: '011', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Tributação com alíquotas uniformes reduzidas em 60%
  '011004': { cst: '011', regra: 'conta', pRed: { CBS: 0, IBSUF: 0, IBSMun: 0 } }, // Tributação com alíquotas uniformes
  '011005': { cst: '011', regra: 'conta', pRed: { CBS: 30, IBSUF: 30, IBSMun: 30 } }, // Tributação com alíquotas uniformes reduzidas em 30%
  '200001': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200002': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200003': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200004': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200005': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200006': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200007': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200008': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200009': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200010': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200011': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200012': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200013': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200014': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200015': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200016': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200017': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200018': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200019': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200020': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200021': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200022': { cst: '200', regra: 'zero' }, // Operação originada fora da ZFM - 200022
  '200023': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200024': { cst: '200', regra: 'zero' }, // Operação originada fora das Áreas de Livre Comércio - 200024
  '200025': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 60, IBSMun: 60 } }, // Alíquota zero apenas CBS e reduzida em 60% para IBS
  '200026': { cst: '200', regra: 'conta', pRed: { CBS: 80, IBSUF: 80, IBSMun: 80 } }, // Alíquota Reduzida em 80%
  '200027': { cst: '200', regra: 'conta', pRed: { CBS: 70, IBSUF: 70, IBSMun: 70 } }, // Alíquota reduzida em 70%
  '200028': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200029': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200030': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200031': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200032': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200033': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200034': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200035': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200036': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200037': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200038': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200039': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200040': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200041': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200042': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200043': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200044': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200045': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200046': { cst: '200', regra: 'conta', pRed: { CBS: 50, IBSUF: 50, IBSMun: 50 } }, // Alíquota reduzida em 50%
  '200047': { cst: '200', regra: 'conta', pRed: { CBS: 40, IBSUF: 40, IBSMun: 40 } }, // Alíquota reduzida em 40%
  '200048': { cst: '200', regra: 'conta', pRed: { CBS: 40, IBSUF: 40, IBSMun: 40 } }, // Alíquota reduzida em 40%
  '200049': { cst: '200', regra: 'conta', pRed: { CBS: 40, IBSUF: 40, IBSMun: 40 } }, // Alíquota reduzida em 40%
  '200050': { cst: '200', regra: 'conta', pRed: { CBS: 40, IBSUF: 40, IBSMun: 40 } }, // Alíquota reduzida em 40%
  '200051': { cst: '200', regra: 'conta', pRed: { CBS: 40, IBSUF: 40, IBSMun: 40 } }, // Alíquota reduzida em 40%
  '200052': { cst: '200', regra: 'conta', pRed: { CBS: 30, IBSUF: 30, IBSMun: 30 } }, // Alíquota reduzida em 30%
  '200053': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200054': { cst: '200', regra: 'conta', pRed: { CBS: 100, IBSUF: 100, IBSMun: 100 } }, // Alíquota zero
  '200055': { cst: '200', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 } }, // Alíquota reduzida em 60%
  '200056': { cst: '200', regra: 'conta', pRed: { CBS: 30, IBSUF: 30, IBSMun: 30 } }, // Alíquota reduzida em 30%
  '221001': { cst: '221', regra: 'fora' }, // Alíquota fixa fictícia
  '221002': { cst: '221', regra: 'fora' }, // Alíquota fixa
  '221003': { cst: '221', regra: 'fora' }, // Alíquota fixa
  '221004': { cst: '221', regra: 'fora' }, // Alíquota fixa
  '222001': { cst: '222', regra: 'fora' }, // Redução de base de cálculo
  '400001': { cst: '400', regra: 'fora' }, // Isenção
  '400002': { cst: '400', regra: 'fora' }, // Isenção
  '400003': { cst: '400', regra: 'fora' }, // Isenção
  '400004': { cst: '400', regra: 'fora' }, // Isenção
  '410001': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410002': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410003': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410004': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410005': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410006': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410007': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410008': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410009': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410010': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410011': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410012': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410013': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410014': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410015': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410016': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410017': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410018': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410019': { cst: '410', regra: 'fora' }, // Tributação com exclusão de base de cálculo em caso de não incidência
  '410020': { cst: '410', regra: 'fora' }, // Tributação com exclusão de base de cálculo em caso de não incidência
  '410021': { cst: '410', regra: 'fora' }, // Tributação com exclusão de base de cálculo em caso de não incidência
  '410022': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410023': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410024': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410025': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410026': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410027': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410028': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410029': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410030': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410031': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410032': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410033': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410034': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410035': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410036': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410037': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '410999': { cst: '410', regra: 'fora' }, // Imunidade e não incidência
  '510001': { cst: '510', regra: 'conta', pRed: { CBS: 0, IBSUF: 0, IBSMun: 0 }, pDif: 100 }, // Diferimento
  '515001': { cst: '515', regra: 'conta', pRed: { CBS: 60, IBSUF: 60, IBSMun: 60 }, pDif: 100 }, // Diferimento com redução de alíquota
  '550001': { cst: '550', regra: 'zero' }, // Suspensão
  '550002': { cst: '550', regra: 'zero' }, // Suspensão
  '550003': { cst: '550', regra: 'zero' }, // Suspensão
  '550004': { cst: '550', regra: 'zero' }, // Suspensão
  '550005': { cst: '550', regra: 'zero' }, // Suspensão
  '550006': { cst: '550', regra: 'zero' }, // Suspensão
  '550007': { cst: '550', regra: 'zero' }, // Suspensão
  '550008': { cst: '550', regra: 'zero' }, // Suspensão
  '550009': { cst: '550', regra: 'zero' }, // Suspensão
  '550010': { cst: '550', regra: 'zero' }, // Suspensão
  '550011': { cst: '550', regra: 'zero' }, // Suspensão
  '550012': { cst: '550', regra: 'zero' }, // Suspensão
  '550013': { cst: '550', regra: 'zero' }, // Suspensão
  '550014': { cst: '550', regra: 'zero' }, // Suspensão
  '550015': { cst: '550', regra: 'zero' }, // Suspensão
  '550016': { cst: '550', regra: 'zero' }, // Suspensão
  '550017': { cst: '550', regra: 'zero' }, // Suspensão
  '550018': { cst: '550', regra: 'zero' }, // Suspensão
  '550019': { cst: '550', regra: 'zero' }, // Suspensão
  '550020': { cst: '550', regra: 'zero' }, // Suspensão
  '550021': { cst: '550', regra: 'zero' }, // Suspensão
  '550022': { cst: '550', regra: 'zero' }, // Suspensão
  '550023': { cst: '550', regra: 'fora' }, // Suspensão em operações com hidrocarbonetos líquidos
  '550024': { cst: '550', regra: 'zero' }, // Suspensão
  '550025': { cst: '550', regra: 'zero' }, // Suspensão
  '550026': { cst: '550', regra: 'zero' }, // Suspensão
  '550027': { cst: '550', regra: 'zero' }, // Suspensão
  '550028': { cst: '550', regra: 'zero' }, // Suspensão
  '550029': { cst: '550', regra: 'zero' }, // Suspensão
  '620001': { cst: '620', regra: 'fora' }, // Tributação monofásica sobre combustíveis
  '620002': { cst: '620', regra: 'fora' }, // Tributação monofásica com responsabilidade pela retenção sobre combustíveis
  '620003': { cst: '620', regra: 'fora' }, // Tributação monofásica com tributos retidos por responsabilidade sobre combustíveis
  '620004': { cst: '620', regra: 'fora' }, // Tributação monofásica sobre mistura de EAC com gasolina A em percentual superior ao obrigatório
  '620005': { cst: '620', regra: 'fora' }, // Tributação monofásica sobre mistura de EAC com gasolina A em percentual inferior ao obrigatório
  '620006': { cst: '620', regra: 'fora' }, // Tributação monofásica sobre combustíveis cobrada anteriormente
  '620007': { cst: '620', regra: 'fora' }, // Tributação monofásica sem alíquota
  '800001': { cst: '800', regra: 'fora' }, // Transferência de crédito
  '800002': { cst: '800', regra: 'fora' }, // Transferência de crédito
  '810001': { cst: '810', regra: 'fora' }, // Ajuste de IBS na ZFM
  '811001': { cst: '811', regra: 'fora' }, // Ajustes
  '811002': { cst: '811', regra: 'fora' }, // Ajustes
  '811003': { cst: '811', regra: 'fora' }, // Ajustes
  '820001': { cst: '820', regra: 'zero' }, // Tributação em documento específico
  '820002': { cst: '820', regra: 'zero' }, // Tributação em documento específico
  '820003': { cst: '820', regra: 'zero' }, // Tributação em documento específico
  '820004': { cst: '820', regra: 'zero' }, // Tributação em documento específico
  '820005': { cst: '820', regra: 'zero' }, // Tributação em documento específico
  '820006': { cst: '820', regra: 'zero' }, // Tributação em documento específico
  '820007': { cst: '820', regra: 'zero' }, // Tributação em documento específico
  '820008': { cst: '820', regra: 'zero' }, // Tributação em documento específico
  '820009': { cst: '820', regra: 'zero' }, // Tributação em documento específico
  '830001': { cst: '830', regra: 'zero' }, // Exclusão de base de cálculo
};
