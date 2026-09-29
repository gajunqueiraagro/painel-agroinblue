/**
 * CONTA CORRENTE DA VENDA — OC-VENDA-ENTREGAS-01b/01c (ADR-2026-21, mock `docs/mocks/oc_conta_corrente_mock_v7.html`).
 *
 * ⚠ O EXTRATO E' LIDO PELO CAIXA DA FAZENDA (01c): recebimento SOMA (entrou dinheiro), entrega ABATE (gado que saiu e ainda
 *   falta receber), explicacao SOMA quando reduz o que falta receber. saldo = recebido - entregue + explicacoes; NEGATIVO = falta
 *   receber, POSITIVO = o comprador adiantou, ZERO = quitado. So' aqui: no DRE a entrega segue receita positiva.
 * ⚠ O SALDO E' DO BANCO (`oc_conta_corrente`), linha a linha e no fim. Esta lib so' le o envelope e o sinal; nao soma regra.
 */

export type TipoLinhaContaCorrente = 'entrega' | 'recebimento' | 'explicacao';
export type TipoExplicacao = 'ajuste_preco' | 'desconto_comercial' | 'permuta_despesa' | 'outra_receita' | 'devolucao_comprador';
/** D6: sem conta bancaria nunca aparece como conciliado. */
export type StatusLinhaContaCorrente =
  | 'sem_caixa' | 'sem_conta_bancaria' | 'conciliado' | 'programado' | 'realizado' | 'ajuste';
/** 'falta_pagar' so' na compra (OC-CONTA-CORRENTE-TODOS-01a): o extrato da compra e' o espelho do da venda. */
export type SituacaoContaCorrente = 'falta_receber' | 'falta_pagar' | 'adiantado' | 'quitado';
/** De que lado da operacao a conta corrente fala: a venda recebe do comprador, a compra paga ao fornecedor. */
export type LadoContaCorrente = 'venda' | 'compra';

/** Despesa da operacao (frete, comissao, ICMS): titulo comum pago a terceiro, FORA do saldo. O banco so' a devolve fora da venda. */
export interface DespesaOperacao {
  parteId: string;
  lancamentoId: string | null;
  componente: string | null;
  competencia: string | null;
  pagamento: string | null;
  descricao: string | null;
  favorecido: string | null;
  contaOrdem: number | null;
  conta: string | null;
  /** Com o sinal do caixa da fazenda: saida negativa. */
  valor: number;
  status: string | null;
}

export interface LinhaContaCorrente {
  tipo: TipoLinhaContaCorrente;
  subtipo: TipoExplicacao | null;
  data: string;
  parteId: string;
  lancamentoId: string | null;
  loteOrdem: number | null;
  categoria: string | null;
  cab: number | null;
  descricao: string | null;
  contaOrdem: number | null;
  conta: string | null;
  banco: string | null;
  /** Coluna "Entrega (DRE)" com o sinal do caixa: entrega negativa, explicacao que reduz o devido positiva. */
  movEntrega: number | null;
  /** Coluna "Recebido (caixa)": recebimento positivo, devolucao negativa. */
  movRecebido: number | null;
  status: StatusLinhaContaCorrente;
  /** Programado nao entra no saldo (ainda nao e' dinheiro). */
  noSaldo: boolean;
  /** Saldo corrido depois desta linha. */
  saldo: number;
  motivo: string | null;
}

export interface ExplicacaoContaCorrente {
  parteId: string;
  tipo: TipoExplicacao;
  loteOrdem: number | null;
  contaOrdem: number | null;
  conta: string | null;
  motivo: string | null;
  /** O que a linha explica, com o sinal do saldo (reduz o que falta receber = positivo). */
  valor: number;
  status: StatusLinhaContaCorrente;
}

export interface ContaCorrente {
  modelo: 'titulo' | 'conta_corrente';
  versao: number;
  statusComercial: string | null;
  valorAcordado: number | null;
  entregue: number;
  cabEntregue: number;
  recebido: number;
  programado: number;
  devolvido: number;
  saldo: number;
  explicado: number;
  /** A diferenca antes de qualquer explicacao. */
  saldoAExplicar: number;
  /** O que ainda nao tem explicacao (zero = tudo explicado). */
  faltaExplicar: number;
  situacao: SituacaoContaCorrente;
  aEntregar: number;
  ultimaEntrega: string | null;
  recebimentosSemContaBancaria: number;
  saidasSemEntrega: number;
  linhas: LinhaContaCorrente[];
  explicacoes: ExplicacaoContaCorrente[];
  /** Despesas da operacao, fora do saldo (compra; a venda nao tem a chave e fica vazia). */
  despesas: DespesaOperacao[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOuNulo = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));
const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
/** Estreita um valor desconhecido para objeto, sem cast. */
const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {});

const TIPOS_EXPLICACAO: readonly TipoExplicacao[] = [
  'ajuste_preco', 'desconto_comercial', 'permuta_despesa', 'outra_receita', 'devolucao_comprador',
];
function tipoExplicacaoDe(v: unknown): TipoExplicacao | null {
  return TIPOS_EXPLICACAO.find(t => t === v) ?? null;
}
function statusDe(v: unknown): StatusLinhaContaCorrente {
  return v === 'sem_caixa' || v === 'sem_conta_bancaria' || v === 'conciliado' || v === 'programado' || v === 'ajuste'
    ? v : 'realizado';
}
function situacaoDe(v: unknown): SituacaoContaCorrente {
  return v === 'falta_receber' || v === 'falta_pagar' || v === 'adiantado' ? v : 'quitado';
}
function tipoLinhaDe(v: unknown): TipoLinhaContaCorrente {
  return v === 'entrega' || v === 'explicacao' ? v : 'recebimento';
}

/** Le o jsonb de `oc_conta_corrente`. Campo fora do contrato cai no neutro, nunca inventa numero. */
export function lerContaCorrente(raw: unknown): ContaCorrente | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = obj(raw);
  const linhas = Array.isArray(r.linhas) ? r.linhas : [];
  const explicacoes = Array.isArray(r.explicacoes) ? r.explicacoes : [];
  const despesas = Array.isArray(r.despesas) ? r.despesas : [];
  return {
    modelo: r.modelo === 'conta_corrente' ? 'conta_corrente' : 'titulo',
    versao: num(r.versao),
    statusComercial: texto(r.status_comercial),
    valorAcordado: numOuNulo(r.valor_acordado),
    entregue: num(r.entregue),
    cabEntregue: num(r.cab_entregue),
    recebido: num(r.recebido),
    programado: num(r.programado),
    devolvido: num(r.devolvido),
    saldo: num(r.saldo),
    explicado: num(r.explicado),
    saldoAExplicar: num(r.saldo_a_explicar),
    faltaExplicar: num(r.falta_explicar),
    situacao: situacaoDe(r.situacao),
    aEntregar: num(r.a_entregar),
    ultimaEntrega: texto(r.ultima_entrega),
    recebimentosSemContaBancaria: num(r.recebimentos_sem_conta_bancaria),
    saidasSemEntrega: num(r.saidas_sem_entrega),
    linhas: linhas.map((x) => {
      const l = obj(x);
      return {
        tipo: tipoLinhaDe(l.tipo),
        subtipo: tipoExplicacaoDe(l.subtipo),
        data: String(l.data ?? ''),
        parteId: String(l.parte_id ?? ''),
        lancamentoId: texto(l.lancamento_id),
        loteOrdem: numOuNulo(l.lote_ordem),
        categoria: texto(l.categoria),
        cab: numOuNulo(l.cab),
        descricao: texto(l.descricao),
        contaOrdem: numOuNulo(l.conta_ordem),
        conta: texto(l.conta),
        banco: texto(l.banco),
        movEntrega: numOuNulo(l.mov_entrega),
        movRecebido: numOuNulo(l.mov_recebido),
        status: statusDe(l.status),
        noSaldo: l.no_saldo !== false,
        saldo: num(l.saldo),
        motivo: texto(l.motivo),
      };
    }),
    explicacoes: explicacoes.flatMap((x) => {
      const e = obj(x);
      const tipo = tipoExplicacaoDe(e.tipo);
      if (!tipo) return [];
      return [{
        parteId: String(e.parte_id ?? ''),
        tipo,
        loteOrdem: numOuNulo(e.lote_ordem),
        contaOrdem: numOuNulo(e.conta_ordem),
        conta: texto(e.conta),
        motivo: texto(e.motivo),
        valor: num(e.valor),
        status: statusDe(e.status),
      }];
    }),
    despesas: despesas.map((x) => {
      const d = obj(x);
      return {
        parteId: String(d.parte_id ?? ''),
        lancamentoId: texto(d.lancamento_id),
        componente: texto(d.componente),
        competencia: texto(d.competencia),
        pagamento: texto(d.pagamento),
        descricao: texto(d.descricao),
        favorecido: texto(d.favorecido),
        contaOrdem: numOuNulo(d.conta_ordem),
        conta: texto(d.conta),
        valor: num(d.valor),
        status: texto(d.status),
      };
    }),
  };
}

/** Cor pelo sinal do caixa da fazenda: negativo = falta receber (vermelho), positivo = adiantado/entrou (verde). */
export function corDoSaldo(valor: number | null): 'neg' | 'pos' | 'zero' {
  if (valor === null) return 'zero';
  const c = Math.round(valor * 100);
  return c < 0 ? 'neg' : c > 0 ? 'pos' : 'zero';
}

/** O rotulo do card do saldo, que segue o sinal. Na compra o sinal e' o espelho: positivo falta pagar, negativo adiantado. */
export function rotuloDoSaldo(saldo: number, lado: LadoContaCorrente = 'venda'): string {
  const c = corDoSaldo(saldo);
  if (lado === 'compra') {
    return c === 'pos' ? 'Saldo · falta pagar' : c === 'neg' ? 'Saldo · adiantado ao fornecedor' : 'Saldo · quitado';
  }
  return c === 'neg' ? 'Saldo · falta receber' : c === 'pos' ? 'Saldo · adiantado pelo comprador' : 'Saldo · quitado';
}

/**
 * A barra da diferenca: so' existe com as entregas concluidas (nada mais a entregar) e algo ainda sem explicacao. Antes disso o
 * saldo e' so' o andamento do contrato. A OC fecha mesmo sem explicar.
 */
export function barraDaDiferenca(cc: ContaCorrente, lado: LadoContaCorrente = 'venda'): { frase: string; valor: number } | null {
  if (!cc.linhas.some(l => l.tipo === 'entrega')) return null;
  if (Math.round(cc.aEntregar * 100) > 0) return null;
  const c = Math.round(cc.faltaExplicar * 100);
  if (c === 0) return null;
  const v = Math.abs(c) / 100;
  const fmt = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (lado === 'compra') {
    return c > 0
      ? { frase: `Pagou R$ ${fmt} a menos do que o gado que entrou.`, valor: cc.faltaExplicar }
      : { frase: `Pagou R$ ${fmt} a mais do que o gado que entrou.`, valor: cc.faltaExplicar };
  }
  return c < 0
    ? { frase: `Recebeu R$ ${fmt} a menos do que entregou.`, valor: cc.faltaExplicar }
    : { frase: `Recebeu R$ ${fmt} a mais do que entregou.`, valor: cc.faltaExplicar };
}

export const ROTULO_STATUS: Record<StatusLinhaContaCorrente, string> = {
  sem_caixa: 'sem caixa',
  sem_conta_bancaria: 'sem conta',
  conciliado: 'conciliado',
  programado: 'programado',
  realizado: 'realizado',
  ajuste: 'ajuste',
};

export const ROTULO_EXPLICACAO: Record<TipoExplicacao, string> = {
  ajuste_preco: 'Ajuste de preço',
  desconto_comercial: 'Desconto comercial',
  permuta_despesa: 'Permuta / outra despesa',
  outra_receita: 'Outra receita',
  devolucao_comprador: 'Devolver ao comprador',
};

/** "Recebimento 2 de 4" (na compra, "Pagamento 1 de 1") — a posicao entre os da OC, na ordem do extrato. */
export function rotuloRecebimento(linhas: readonly LinhaContaCorrente[], parteId: string, lado: LadoContaCorrente = 'venda'): string {
  const nome = lado === 'compra' ? 'Pagamento' : 'Recebimento';
  const recs = linhas.filter((l) => l.tipo === 'recebimento');
  const i = recs.findIndex((l) => l.parteId === parteId);
  return i < 0 ? nome : `${nome} ${i + 1} de ${recs.length}`;
}

/** Os tipos de explicacao de cada lado (decisao do Gabriel): a compra tem ajuste de preco, devolucao do fornecedor e permuta. */
export const TIPOS_EXPLICACAO_DO_LADO: Record<LadoContaCorrente, readonly TipoExplicacao[]> = {
  venda: ['ajuste_preco', 'desconto_comercial', 'permuta_despesa', 'outra_receita', 'devolucao_comprador'],
  compra: ['ajuste_preco', 'permuta_despesa', 'devolucao_comprador'],
};

/** O nome da explicacao na tela. A devolucao da contraparte e' um componente so' no banco; o rotulo segue o lado. */
export function rotuloExplicacao(tipo: TipoExplicacao, lado: LadoContaCorrente = 'venda'): string {
  if (lado === 'compra' && tipo === 'devolucao_comprador') return 'Devolução do fornecedor';
  return ROTULO_EXPLICACAO[tipo];
}

/** Data do extrato: dd/mm/aa (padrao de tabela, 28/09/2026). */
export function dataCurta(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a.slice(2)}` : '—';
}

/** "1120 Venda de Desmama Machos" — conta com o numero do plano, uma informacao so'. */
export function contaComNumero(ordem: number | null, conta: string | null): string {
  if (!conta) return '—';
  return ordem ? `${ordem} ${conta}` : conta;
}

/**
 * O que cada explicacao faz no saldo, com o sinal do caixa da fazenda: a que REDUZ o que falta receber (ajuste para baixo,
 * desconto, permuta) e' positiva; a que aumenta (ajuste para cima, outra receita, devolucao) e' negativa. O mesmo sinal que o
 * banco devolve em `explicacoes[].valor` — a tela usa isto so' para o RASCUNHO do dialogo, antes de salvar.
 */
export function efeitoNoSaldo(tipo: TipoExplicacao, valor: number, lado: LadoContaCorrente = 'venda'): number {
  const naVenda = tipo === 'ajuste_preco' || tipo === 'desconto_comercial' || tipo === 'permuta_despesa' ? valor : -valor;
  /* A compra e' o espelho (o banco vira o sinal na saida): o que reduz o que a fazenda deve e' NEGATIVO. */
  return lado === 'compra' ? -naVenda : naVenda;
}

/** Soma em centavos do que o rascunho explica — o total do dialogo, antes de salvar. */
export function totalDoRascunho(itens: readonly { tipo: TipoExplicacao; valor: number }[], lado: LadoContaCorrente = 'venda'): number {
  return itens.reduce((acc, i) => acc + Math.round(efeitoNoSaldo(i.tipo, i.valor, lado) * 100), 0) / 100;
}
