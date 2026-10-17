/**
 * FIN-FINANC-28 · PASSO 7 — o dono puro do cadastro novo: o formulário, o que falta (a lista "O que falta" do resumo e a recusa do
 * Salvar, na MESMA ordem do banco), o pedido ao gerador (`fn_financiamento_cronograma`) e ao criar (`fn_financiamento_criar`), e o
 * leitor do cronograma (sem cast; peça torta = nulo). A conta do cronograma é do BANCO — aqui nenhuma soma de dinheiro.
 */

export type NaturezaDoCadastro = 'financiamento' | 'emprestimo' | 'consorcio';
export type SistemaDoCadastro = 'sac' | 'price' | 'bullet' | 'livre';
export type Periodicidade = 'mensal' | 'trimestral' | 'semestral' | 'anual';
export type AtividadeDoContrato = 'pecuaria' | 'agricultura';
export type Modalidade = 'custeio' | 'investimento' | 'comercializacao' | 'outro';

export const ROTULO_DO_SISTEMA: Record<SistemaDoCadastro, string> = { sac: 'SAC', price: 'Price', bullet: 'Parcela única', livre: 'Personalizado' };
export const ROTULO_DA_PERIODICIDADE: Record<Periodicidade, string> = { mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
export const ROTULO_DA_MODALIDADE: Record<Modalidade, string> = { custeio: 'Custeio', investimento: 'Investimento', comercializacao: 'Comercialização', outro: 'Outro' };

export interface ParcelaDigitada { vencimento: string | null; principal: number; juros: number }

export interface FormDoCadastro {
  natureza: NaturezaDoCadastro; atividade: AtividadeDoContrato;
  descricao: string; credorId: string | null; numeroContrato: string; linhaCreditoId: string | null; modalidade: Modalidade;
  dataContrato: string | null; valorTotal: number; fazendaId: string | null; contaId: string | null; garantias: string;
  planoPrincipalId: string | null; planoJurosId: string | null; observacao: string;
  sistema: SistemaDoCadastro; taxaAa: number; tipoTaxa: 'pre' | 'pos'; periodicidade: Periodicidade;
  carenciaAte: string | null; primeiroVencimento: string | null; n: number; parcelas: ParcelaDigitada[];
  grupo: string; cota: string; prazo: number; taxaAdmPct: number; fundoReservaPct: number; seguroPctMes: number; reajuste: string;
  contemplado: boolean; dataContemplacao: string | null; formaContemplacao: 'sorteio' | 'lance' | null; lanceValor: number;
}

export function formVazio(natureza: NaturezaDoCadastro = 'financiamento'): FormDoCadastro {
  return {
    natureza, atividade: 'pecuaria', descricao: '', credorId: null, numeroContrato: '', linhaCreditoId: null, modalidade: 'investimento',
    dataContrato: null, valorTotal: 0, fazendaId: null, contaId: null, garantias: '', planoPrincipalId: null, planoJurosId: null, observacao: '',
    sistema: 'sac', taxaAa: 0, tipoTaxa: 'pre', periodicidade: 'anual', carenciaAte: null, primeiroVencimento: null, n: 1, parcelas: [],
    grupo: '', cota: '', prazo: 0, taxaAdmPct: 0, fundoReservaPct: 0, seguroPctMes: 0, reajuste: '',
    contemplado: false, dataContemplacao: null, formaContemplacao: null, lanceValor: 0,
  };
}

/** o que falta, na ordem e nas palavras da recusa do banco (`_fn_financiamento_criar_exec`) */
export function oQueFalta(f: FormDoCadastro): string[] {
  const cons = f.natureza === 'consorcio';
  const falta: string[] = [];
  if (!f.descricao.trim()) falta.push('descrição');
  if (!f.credorId) falta.push(cons ? 'administradora' : 'credor');
  if (!f.contaId) falta.push(cons ? 'conta de pagamento' : 'conta de captação');
  if (!cons && !f.numeroContrato.trim()) falta.push('nº do contrato');
  if (!cons && !f.dataContrato) falta.push('data do contrato');
  if (!f.fazendaId) falta.push('fazenda');
  if (f.valorTotal <= 0) falta.push(cons ? 'carta de crédito' : 'valor contratado');
  if (cons && f.prazo < 1) falta.push('prazo');
  if (!f.primeiroVencimento) falta.push(cons ? '1ª parcela' : '1º vencimento');
  if (!cons && f.sistema !== 'bullet' && f.sistema !== 'livre' && f.n < 1) falta.push('nº de parcelas');
  if (!f.planoJurosId) falta.push(cons ? 'plano da taxa e do seguro' : 'plano dos juros');
  if (!cons && !f.planoPrincipalId) falta.push('plano do principal');
  return falta;
}

/** o pedido ao gerador (o mesmo objeto vai ao criar, com o resto do contrato) */
export function pedidoDoCronograma(f: FormDoCadastro): Record<string, unknown> {
  if (f.natureza === 'consorcio') {
    return { modo: 'consorcio', carta: f.valorTotal, prazo: f.prazo, taxa_adm_pct: f.taxaAdmPct, fundo_reserva_pct: f.fundoReservaPct,
      seguro_pct_mes: f.seguroPctMes, primeiro_vencimento: f.primeiroVencimento };
  }
  return { sistema: f.sistema, principal: f.valorTotal, taxa_aa: f.taxaAa, periodicidade: f.periodicidade, primeiro_vencimento: f.primeiroVencimento,
    n: f.n, carencia_ate: f.carenciaAte, parcelas: f.parcelas.map((p) => ({ vencimento: p.vencimento, principal: p.principal, juros: p.juros })) };
}

export function pedidoDeCriacao(f: FormDoCadastro, clienteId: string): Record<string, unknown> {
  return {
    ...pedidoDoCronograma(f), cliente_id: clienteId, natureza: f.natureza, atividade: f.atividade, descricao: f.descricao.trim(),
    credor_id: f.credorId, numero_contrato: f.numeroContrato.trim(), linha_credito_id: f.linhaCreditoId, finalidade: f.natureza === 'consorcio' ? null : f.modalidade,
    data_contrato: f.dataContrato, valor_total: f.valorTotal, fazenda_id: f.fazendaId, conta_bancaria_id: f.contaId, garantias: f.garantias,
    plano_principal_id: f.planoPrincipalId, plano_juros_id: f.planoJurosId, observacao: f.observacao, tipo_taxa: f.tipoTaxa,
    grupo: f.grupo, cota: f.cota, prazo: f.prazo, taxa_adm_pct: f.taxaAdmPct, fundo_reserva_pct: f.fundoReservaPct, seguro_pct_mes: f.seguroPctMes,
    reajuste: f.reajuste, contemplado: f.contemplado, data_contemplacao: f.dataContemplacao, forma_contemplacao: f.formaContemplacao,
    lance_valor: f.lanceValor || null,
  };
}

export interface LinhaDoCronograma { numero: number; vencimento: string; principal: number; juros: number; total: number; saldoApos: number }
export interface Cronograma {
  recusa: string | null; linhas: LinhaDoCronograma[]; principalTotal: number; jurosTotal: number; total: number;
  parcelas: number; parcelasSoJuros: number; vencimentoFinal: string | null;
}

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const t = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export function lerCronograma(r: unknown): Cronograma | null {
  if (!ehObj(r) || !Array.isArray(r.linhas)) return null;
  const linhas: LinhaDoCronograma[] = [];
  for (const l of r.linhas) {
    if (!ehObj(l)) return null;
    const numero = n(l.numero); const venc = t(l.vencimento); const pr = n(l.principal); const ju = n(l.juros); const to = n(l.total); const sa = n(l.saldo_apos);
    if (numero === null || !venc || pr === null || ju === null || to === null || sa === null) return null;
    linhas.push({ numero, vencimento: venc, principal: pr, juros: ju, total: to, saldoApos: sa });
  }
  return { recusa: t(r.recusa), linhas, principalTotal: n(r.principal_total) ?? 0, jurosTotal: n(r.juros_total) ?? 0, total: n(r.total) ?? 0,
    parcelas: n(r.parcelas) ?? linhas.length, parcelasSoJuros: n(r.parcelas_so_juros) ?? 0, vencimentoFinal: t(r.vencimento_final) };
}

/** "7 de principal + 1 só juros" */
export function textoDasParcelas(c: Cronograma | null): string {
  if (!c || c.linhas.length === 0) return '—';
  const principal = c.parcelas - c.parcelasSoJuros;
  return c.parcelasSoJuros ? `${principal} de principal + ${c.parcelasSoJuros} só juros` : `${principal}`;
}
