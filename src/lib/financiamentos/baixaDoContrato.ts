/**
 * FIN-FINANC-28 · PASSO 5 — o dono puro da "Dar baixa" do contrato de crédito: as quatro saídas, o leitor do retorno de
 * `fn_financiamento_baixa` (simulado ou gravado; peça torta = nulo), a frase do rodapé "principal X = liquidado Y · diferença Z" e a
 * baixa viva (a que o "Desfazer baixa" desfaz). Os números são do banco; aqui só se lê e se escreve.
 */

export type TipoDeBaixa = 'quitado' | 'rolado' | 'prorrogado' | 'cancelado';
export const TIPOS_DE_BAIXA: readonly TipoDeBaixa[] = ['quitado', 'rolado', 'prorrogado', 'cancelado'];
export const ROTULO_DA_BAIXA: Record<TipoDeBaixa, string> = {
  quitado: 'Quitado', rolado: 'Rolado / renovado', prorrogado: 'Prorrogado por aditivo', cancelado: 'Cancelado',
};
export const DICA_DA_BAIXA: Record<TipoDeBaixa, string> = {
  quitado: 'encerra o contrato pago; as parcelas em aberto saem do cronograma',
  rolado: 'um contrato novo liquida este pelo saldo, sem passar pelo caixa',
  prorrogado: 'as parcelas em aberto andam N meses; o vencimento original fica guardado',
  cancelado: 'só sem parcela paga nem liberação',
};

/** a baixa só se dá em contrato vigente (ativo ou prorrogado) */
export const podeDarBaixa = (status: string | null | undefined): boolean => status === 'ativo' || status === 'prorrogado';

export interface ParcelaDaBaixa { numero: number | null; de: string | null; para: string | null }
export interface ResultadoDaBaixa {
  simulado: boolean; recusa: string | null; principal: number | null; liquidado: number | null; diferenca: number | null;
  parcelas: ParcelaDaBaixa[]; lancamentosCancelados: number;
}

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export function lerResultadoDaBaixa(r: unknown): ResultadoDaBaixa | null {
  if (!ehObj(r)) return null;
  const recusa = ehObj(r.recusa) ? txt(r.recusa.frase) : null;
  const parcelas = Array.isArray(r.parcelas)
    ? r.parcelas.filter(ehObj).map((p) => ({ numero: num(p.numero), de: txt(p.data_vencimento), para: txt(p.para) })) : [];
  return {
    simulado: r.simulado === true, recusa, principal: num(r.principal), liquidado: num(r.liquidado), diferenca: num(r.diferenca),
    parcelas, lancamentosCancelados: num(r.lancamentos_cancelados) ?? 0,
  };
}

const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** o rodapé do diálogo: os três números do banco (sem conta aqui) */
export function fraseDoRodape(r: ResultadoDaBaixa | null): string {
  if (!r || r.principal === null || r.liquidado === null || r.diferenca === null) return 'principal — = liquidado — · diferença —';
  return `principal ${n2(r.principal)} = liquidado ${n2(r.liquidado)} · diferença ${n2(r.diferenca)}`;
}

export interface BaixaViva { id: string; tipo: TipoDeBaixa; data: string; motivo: string }
export function lerBaixaViva(r: unknown): BaixaViva | null {
  if (!ehObj(r)) return null;
  const tipo = TIPOS_DE_BAIXA.find((t) => t === r.tipo);
  const id = txt(r.id); const data = txt(r.data);
  return tipo && id && data ? { id, tipo, data, motivo: txt(r.motivo) ?? '' } : null;
}
