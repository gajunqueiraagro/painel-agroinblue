/**
 * FIN-FINANC-28 · EDITAR = CADASTRO NOVO v2 (Gabriel 18/10/2026) — o dono puro do modo editar: o formulário a partir do contrato
 * gravado (o que estava vazio fica "não cadastrado", nunca um padrão inventado), o que o cabeçalho manda ao banco (só o que mudou),
 * as mudanças das parcelas (alterar · acrescentar · retirar) e os leitores das respostas das quatro RPCs (sem cast; peça torta = nulo).
 * ⚠ NÃO FAZ CONTA DE DINHEIRO: cronograma, diferença do saldo e o "regerar" são do banco.
 */
import { formVazio, type FormDoCadastro, type Modalidade, type NaturezaDoCadastro, type Periodicidade, type SistemaDoCadastro } from './cadastroDoContrato';

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** os campos que estavam VAZIOS no contrato gravado: a tela os mostra "não cadastrado" até o operador escolher */
export type CampoNaoCadastrado = 'sistema' | 'periodicidade' | 'tipoTaxa' | 'carenciaAte';

const SISTEMAS: readonly SistemaDoCadastro[] = ['sac', 'price', 'bullet', 'livre'];
const PERIODOS: readonly Periodicidade[] = ['mensal', 'trimestral', 'semestral', 'anual'];
const NATUREZAS: readonly NaturezaDoCadastro[] = ['financiamento', 'emprestimo', 'consorcio'];
const MODALIDADES: readonly Modalidade[] = ['custeio', 'investimento', 'comercializacao', 'outro'];

/** a taxa a.a. do contrato: a gravada a.a.; senão a equivalente da mensal (o contrato antigo só tem a mensal) */
export function taxaAaDoContrato(taxaAa: number | null, taxaMensal: number | null): number {
  if (taxaAa !== null && taxaAa > 0) return taxaAa;
  if (taxaMensal !== null && taxaMensal > 0) return Math.round((Math.pow(1 + taxaMensal / 100, 12) - 1) * 100 * 10000) / 10000;
  return 0;
}

/** De onde veio a periodicidade mostrada: a gravada, a inferida das parcelas, ou — sem como inferir (0 ou 1 parcela) — a que o banco
 *  usa quando a coluna é nula (`coalesce(periodicidade, 'mensal')` no gerador e no salvar do cabeçalho). Nunca um padrão silencioso. */
export type OrigemDaPeriodicidade = 'gravada' | 'parcelas' | 'banco';
export const TEXTO_DA_ORIGEM: Record<OrigemDaPeriodicidade, string> = {
  gravada: '', parcelas: 'inferida das parcelas', banco: 'não cadastrada · o banco usa mensal',
};
const MESES_DA_PERIODICIDADE: Record<number, Periodicidade> = { 1: 'mensal', 3: 'trimestral', 6: 'semestral', 12: 'anual' };

/** FIN-CONTRATO-SALVAR-01 — a periodicidade pelas parcelas gravadas: o intervalo em meses mais frequente entre vencimentos seguidos
 *  (1, 3, 6 ou 12). Menos de duas datas, ou intervalo que não é nenhum desses: a do banco (mensal), dita como tal. */
export function inferirPeriodicidade(vencimentos: readonly (string | null)[]): { periodicidade: Periodicidade; origem: OrigemDaPeriodicidade } {
  const ds = vencimentos.filter((v): v is string => !!v).sort();
  const conta = new Map<number, number>();
  for (let i = 1; i < ds.length; i++) {
    const m = (Number(ds[i].slice(0, 4)) - Number(ds[i - 1].slice(0, 4))) * 12 + Number(ds[i].slice(5, 7)) - Number(ds[i - 1].slice(5, 7));
    if (MESES_DA_PERIODICIDADE[m]) conta.set(m, (conta.get(m) ?? 0) + 1);
  }
  const melhor = [...conta.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return melhor ? { periodicidade: MESES_DA_PERIODICIDADE[melhor[0]], origem: 'parcelas' } : { periodicidade: 'mensal', origem: 'banco' };
}

/** os planos padrão pela atividade (os mesmos do motor); os juros também — o contrato antigo veio sem o plano dos juros */
export const PLANO_PRINCIPAL_POR_ATIVIDADE: Record<string, string> = {
  pecuaria: 'Amortização Financiamento Pecuária', agricultura: 'Amortização Financiamento Agricultura', silvicultura: 'Amortização Financiamento Silvicultura',
};
export const PLANO_JUROS_POR_ATIVIDADE: Record<string, string> = {
  pecuaria: 'Juros de Financiamento Pecuária', agricultura: 'Juros de Financiamento Agricultura', silvicultura: 'Juros de Financiamento Silvicultura',
};

export interface ContratoParaEditar { form: FormDoCadastro; naoCadastrado: CampoNaoCadastrado[]; numero: string | null; credorNome: string | null;
  origemDaPeriodicidade: OrigemDaPeriodicidade }

/** a linha de `financiamentos` (com o nome do credor e a linha do consórcio, se houver) -> o formulário do cadastro */
export function formDoContrato(row: unknown, consorcio: unknown, vencimentos: readonly (string | null)[] = []): ContratoParaEditar | null {
  if (!ehObj(row)) return null;
  const nat = NATUREZAS.find((x) => x === row.natureza);
  if (!nat) return null;
  const base = formVazio(nat);
  const sis = SISTEMAS.find((x) => x === row.sistema_amortizacao) ?? null;
  const per = PERIODOS.find((x) => x === row.periodicidade) ?? null;
  const inferida = per ? null : inferirPeriodicidade(vencimentos);
  const tipo = row.tipo_taxa === 'pre' || row.tipo_taxa === 'pos' ? row.tipo_taxa : null;
  const naoCadastrado: CampoNaoCadastrado[] = [];
  if (!sis && nat !== 'consorcio') naoCadastrado.push('sistema');
  if (!per && nat !== 'consorcio') naoCadastrado.push('periodicidade');
  if (!tipo && nat !== 'consorcio') naoCadastrado.push('tipoTaxa');
  if (!txt(row.carencia_ate) && nat !== 'consorcio') naoCadastrado.push('carenciaAte');
  const forn = ehObj(row.financeiro_fornecedores) ? row.financeiro_fornecedores : null;
  const c = ehObj(consorcio) ? consorcio : null;
  const modalidade = MODALIDADES.find((m) => m === row.finalidade);
  const form: FormDoCadastro = {
    ...base,
    atividade: row.tipo_financiamento === 'agricultura' ? 'agricultura' : 'pecuaria',
    descricao: txt(row.descricao) ?? '', credorId: txt(row.credor_id), numeroContrato: txt(row.numero_contrato) ?? '',
    linhaCreditoId: txt(row.linha_credito_id), modalidade: modalidade ?? base.modalidade,
    dataContrato: txt(row.data_contrato), valorTotal: num(row.valor_total) ?? 0, fazendaId: txt(row.fazenda_id), contaId: txt(row.conta_bancaria_id),
    garantias: txt(row.garantias) ?? '', planoPrincipalId: txt(row.plano_principal_id) ?? txt(row.plano_conta_parcela_id), planoJurosId: txt(row.plano_juros_id),
    observacao: txt(row.observacao) ?? '',
    sistema: sis ?? base.sistema, taxaAa: taxaAaDoContrato(num(row.taxa_juros), num(row.taxa_juros_mensal)), tipoTaxa: tipo ?? base.tipoTaxa,
    periodicidade: per ?? inferida?.periodicidade ?? base.periodicidade, carenciaAte: txt(row.carencia_ate), primeiroVencimento: txt(row.data_primeira_parcela),
    n: num(row.total_parcelas) ?? base.n, prazo: num(row.total_parcelas) ?? 0,
    grupo: txt(c?.grupo) ?? '', cota: txt(c?.cota) ?? '', taxaAdmPct: num(c?.taxa_adm_pct) ?? 0, fundoReservaPct: num(c?.fundo_reserva_pct) ?? 0,
    seguroPctMes: num(c?.seguro_pct_mes) ?? 0,
  };
  return { form, naoCadastrado, numero: txt(row.numero_contrato), credorNome: txt(forn?.nome), origemDaPeriodicidade: inferida?.origem ?? 'gravada' };
}

/** o título do modo editar: "Editar contrato · <nº> · <credor inteiro>" */
export function tituloDaEdicao(numero: string | null, credor: string | null): string {
  return ['Editar contrato', numero || 'sem nº', credor || 'credor não cadastrado'].join(' · ');
}

/** o que o Salvar manda a `fn_financiamento_salvar_cabecalho`: SÓ o que mudou (o banco diz se o cronograma mudou).
 *  Campo que estava "não cadastrado" e continua não escolhido não vai. */
export function dadosDoCabecalho(antes: FormDoCadastro, depois: FormDoCadastro, naoCadastrado: readonly CampoNaoCadastrado[]): Record<string, unknown> {
  const d: Record<string, unknown> = {};
  const muda = <T,>(chave: string, a: T, b: T, valor: unknown = b) => { if (a !== b) d[chave] = valor; };
  muda('descricao', antes.descricao.trim(), depois.descricao.trim());
  muda('numero_contrato', antes.numeroContrato.trim(), depois.numeroContrato.trim());
  muda('tipo_financiamento', antes.atividade, depois.atividade);
  muda('credor_id', antes.credorId, depois.credorId);
  muda('conta_bancaria_id', antes.contaId, depois.contaId);
  muda('fazenda_id', antes.fazendaId, depois.fazendaId);
  muda('valor_total', antes.valorTotal, depois.valorTotal);
  muda('data_contrato', antes.dataContrato, depois.dataContrato);
  muda('data_primeira_parcela', antes.primeiroVencimento, depois.primeiroVencimento);
  muda('total_parcelas', antes.n, depois.n);
  muda('taxa_aa', antes.taxaAa, depois.taxaAa);
  if (!naoCadastrado.includes('sistema')) muda('sistema_amortizacao', antes.sistema, depois.sistema);
  if (!naoCadastrado.includes('periodicidade')) muda('periodicidade', antes.periodicidade, depois.periodicidade);
  if (!naoCadastrado.includes('tipoTaxa')) muda('tipo_taxa', antes.tipoTaxa, depois.tipoTaxa);
  muda('carencia_ate', antes.carenciaAte, depois.carenciaAte);
  muda('plano_principal_id', antes.planoPrincipalId, depois.planoPrincipalId);
  muda('plano_juros_id', antes.planoJurosId, depois.planoJurosId);
  muda('garantias', antes.garantias.trim(), depois.garantias.trim());
  muda('observacao', antes.observacao.trim(), depois.observacao.trim());
  if (depois.natureza !== 'consorcio') muda('finalidade', antes.modalidade, depois.modalidade);
  muda('linha_credito_id', antes.linhaCreditoId, depois.linhaCreditoId);
  return d;
}

/* ── respostas ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface RespostaDoBanco { simulado: boolean; recusa: string | null; corpo: Obj }
/** o envelope das quatro RPCs: na simulação a recusa vem em `recusa.frase`; erro do banco (gravação) vira a frase; peça torta = nulo */
export function lerResposta(data: unknown, erro: { message?: string } | null): RespostaDoBanco | null {
  if (erro) return { simulado: false, recusa: String(erro.message ?? 'Não foi possível gravar.').replace(/^(ERROR:\s*)?(P0001|42501):\s*/i, ''), corpo: {} };
  if (!ehObj(data)) return null;
  const rec = ehObj(data.recusa) ? txt(data.recusa.frase) : null;
  return { simulado: data.simulado === true, recusa: rec, corpo: data };
}

export interface FotoDaParcela { id: string; numero: number; vencimento: string | null; principal: number; juros: number; total: number; status: string; ajustada: boolean }
/** a foto das parcelas (`_fn_parcelas_foto`), só as vivas, na ordem do número */
export function lerFoto(v: unknown): FotoDaParcela[] | null {
  if (!Array.isArray(v)) return null;
  const out: FotoDaParcela[] = [];
  for (const x of v) {
    if (!ehObj(x)) return null;
    const id = txt(x.id); const numero = num(x.numero_parcela); const status = txt(x.status) ?? '';
    if (!id || numero === null) return null;
    if (status === 'cancelado') continue;
    out.push({ id, numero, vencimento: txt(x.data_vencimento), principal: num(x.valor_principal) ?? 0, juros: num(x.valor_juros) ?? 0,
      total: num(x.valor_total) ?? 0, status, ajustada: x.ajustada === true });
  }
  return out.sort((a, b) => a.numero - b.numero);
}
export const diferencaDoSaldo = (corpo: Obj): number | null => num(corpo.diferenca_do_saldo);
/** "principal das parcelas difere do saldo em X" — laranja, nunca forçado */
export function fraseDaDiferenca(dif: number | null): string | null {
  if (dif === null || Math.round(dif * 100) === 0) return null;
  const v = Math.abs(dif).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Principal das parcelas difere do saldo em R$ ${v} (${dif > 0 ? 'acima' : 'abaixo'}).`;
}

/* ── mudanças das parcelas ─────────────────────────────────────────────────────────────────────────────────────────────── */
export interface ParcelaEditavel { id: string | null; vencimento: string | null; principal: number; juros: number }
export interface MudancasDasParcelas {
  alterar: { id: string; data_vencimento?: string | null; valor_principal?: number; valor_juros?: number }[];
  acrescentar: { data_vencimento: string | null; valor_principal: number; valor_juros: number }[];
  retirar: string[];
}
/** o pedido a `fn_financiamento_parcelas_editar`: o que mudou em cada parcela que existe, as novas (sem id) e as que saíram */
export function mudancasDasParcelas(originais: readonly ParcelaEditavel[], editadas: readonly ParcelaEditavel[]): MudancasDasParcelas {
  const m: MudancasDasParcelas = { alterar: [], acrescentar: [], retirar: [] };
  const ficam = new Set(editadas.map((p) => p.id).filter((id): id is string => id !== null));
  for (const o of originais) if (o.id && !ficam.has(o.id)) m.retirar.push(o.id);
  for (const e of editadas) {
    if (e.id === null) { m.acrescentar.push({ data_vencimento: e.vencimento, valor_principal: e.principal, valor_juros: e.juros }); continue; }
    const o = originais.find((x) => x.id === e.id);
    if (!o) continue;
    const a: MudancasDasParcelas['alterar'][number] = { id: e.id };
    if (o.vencimento !== e.vencimento) a.data_vencimento = e.vencimento;
    if (o.principal !== e.principal) a.valor_principal = e.principal;
    if (o.juros !== e.juros) a.valor_juros = e.juros;
    if (Object.keys(a).length > 1) m.alterar.push(a);
  }
  return m;
}
export const semMudanca = (m: MudancasDasParcelas) => m.alterar.length + m.acrescentar.length + m.retirar.length === 0;

/** o que a TELA mostra como travada (o banco decide de novo ao gravar): paga, com pagamento registrado ou com pagamento vinculado */
export function travaNaTela(situacao: string, temVinculo: boolean): string | null {
  if (situacao === 'paga') return 'paga · não muda';
  if (situacao === 'parcial') return 'pagamento registrado · não muda';
  if (temVinculo) return 'pagamento vinculado · desvincule antes';
  return null;
}

export interface LinhaAntesDepois { id: string; marca: 'igual' | 'mudou' | 'nova' | 'retirada'; antes: FotoDaParcela | null; depois: FotoDaParcela | null }
/** antes × depois, linha a linha, pela parcela (o id): o que mudou, o que nasceu e o que saiu */
export function antesDepois(antes: readonly FotoDaParcela[], depois: readonly FotoDaParcela[]): LinhaAntesDepois[] {
  const porId = new Map(antes.map((a) => [a.id, a]));
  const linhas: LinhaAntesDepois[] = depois.map((d) => {
    const a = porId.get(d.id) ?? null;
    const igual = a !== null && a.vencimento === d.vencimento && a.principal === d.principal && a.juros === d.juros;
    return { id: d.id, marca: a === null ? 'nova' : igual ? 'igual' : 'mudou', antes: a, depois: d };
  });
  const ficam = new Set(depois.map((d) => d.id));
  for (const a of antes) if (!ficam.has(a.id)) linhas.push({ id: a.id, marca: 'retirada', antes: a, depois: null });
  return linhas;
}

export interface BaseDoRegerar { saldo: number; guardado: number; principal: number; parcelas: number; sistema: string; taxaAa: number }
/** a base que o banco usou para regerar (saldo da fonte única − o principal das que ficam) */
export function lerBase(corpo: Obj): BaseDoRegerar | null {
  const b = corpo.base;
  if (!ehObj(b)) return null;
  const saldo = num(b.saldo); const guardado = num(b.guardado); const principal = num(b.principal); const parcelas = num(b.parcelas); const taxaAa = num(b.taxa_aa);
  if (saldo === null || guardado === null || principal === null || parcelas === null || taxaAa === null) return null;
  return { saldo, guardado, principal, parcelas, sistema: txt(b.sistema) ?? '', taxaAa };
}
