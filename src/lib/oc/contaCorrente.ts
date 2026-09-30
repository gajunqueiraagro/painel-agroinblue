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

/** Despesa da operacao (frete, comissao, ICMS): titulo comum pago a terceiro, FORA do saldo. Venda e compra (OC-CRIAR-DO-LEGADO-01b). */
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
  /** Despesas da operacao, fora do saldo (venda e compra; sem despesa, vazia). */
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
  /* OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2 — texto gerado pelo sistema e' curto e nunca quebra linha ("compactar sempre"). */
  sem_conta_bancaria: 's/ conta',
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

/** "Receb. 2/4" (na compra, "Pgto. 1/3") — a posicao entre os da OC, na ordem do extrato.
 *  ⚠ CURTO DE PROPOSITO (OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2): "Recebimento 2 de 4" pedia 94,8px na Descricao de 92 uteis e
 *  quebrava em duas linhas (af334f9c). Texto gerado pelo sistema nao quebra; so' o digitado. */
export function rotuloRecebimento(linhas: readonly LinhaContaCorrente[], parteId: string, lado: LadoContaCorrente = 'venda'): string {
  const nome = lado === 'compra' ? 'Pgto.' : 'Receb.';
  const recs = linhas.filter((l) => l.tipo === 'recebimento');
  const i = recs.findIndex((l) => l.parteId === parteId);
  return i < 0 ? nome : `${nome} ${i + 1}/${recs.length}`;
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

/* ─── OC-CC-VOLTA-01b — ajuste de preco nos dois sentidos, em todos os lotes, com previa ─────────────────────────────────── */

/** O ajuste de preco SOBE ou BAIXA o valor dos lotes. */
export type SentidoAjuste = 'sobe' | 'baixa';

/**
 * O sentido e o valor que ZERAM o que falta explicar — valor sugerido e' valor aceito (RECLASS-PESO-01).
 * ⚠ O SINAL SAI DE `efeitoNoSaldo`, nao de uma segunda regra: baixar o preco reduz o que falta receber na venda (efeito positivo) e
 * o que a fazenda deve na compra (efeito negativo, o espelho). Escolhe-se o sentido cujo efeito cancela o `falta`.
 * Venda que recebeu a mais (falta positivo: o comprador adiantou) -> SOBE; recebeu a menos -> BAIXA. Compra: o espelho.
 */
export function sugestaoAjuste(falta: number, lado: LadoContaCorrente = 'venda'): { sentido: SentidoAjuste; valor: number } {
  const centavos = Math.round(falta * 100);
  if (centavos === 0) return { sentido: 'baixa', valor: 0 };
  const baixarDaPositivo = efeitoNoSaldo('ajuste_preco', 1, lado) > 0;
  const precisaPositivo = centavos < 0;
  return { sentido: precisaPositivo === baixarDaPositivo ? 'baixa' : 'sobe', valor: Math.abs(centavos) / 100 };
}

/** O valor como a RPC o recebe: positivo baixa o preco do lote, negativo sobe (`oc_explicar_saldo`, ramo do ajuste). */
export const valorAjusteParaRpc = (sentido: SentidoAjuste, valor: number): number => (sentido === 'sobe' ? -valor : valor);

/** "Sobe o preço dos lotes em R$ 1.535.000,00" — o rotulo diz o sentido (regra 3). */
export function rotuloSentidoAjuste(sentido: SentidoAjuste, valor: number, todos: boolean): string {
  const quem = todos ? 'dos lotes' : 'do lote';
  const reais = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `${sentido === 'sobe' ? 'Sobe' : 'Baixa'} o preço ${quem} em ${reais}`;
}

/** Uma linha da previa: o lote, e embaixo dele cada entrega quando ele tem mais de uma (cada uma na data da sua saida). */
export interface LinhaPreviaAjuste {
  chave: string;
  nivel: 'lote' | 'entrega' | 'total';
  loteOrdem: number | null;
  categoria: string | null;
  /** Datas das entregas (dd/mm/aa), na ordem. */
  datas: string[];
  kg: number;
  hoje: number;
  novo: number;
  /** R$/kg novo; nulo sem kg. */
  porKgNovo: number | null;
}

const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : []);
const porKg = (valor: number, kg: number): number | null => (kg > 0 ? Math.round((valor / kg) * 100) / 100 : null);

/**
 * A previa do ajuste, como a PROPRIA RPC a devolve em simulacao (`p_simular`, desfeita por OCSIM): nenhuma regra de rateio no
 * front. Lote a lote (kg negociado, valor hoje, valor novo, R$/kg novo), com as entregas embaixo quando o lote tem mais de uma, e o
 * total. Previa vazia ou fora do contrato: lista vazia.
 */
export function linhasDaPreviaAjuste(previa: unknown): LinhaPreviaAjuste[] {
  const p = obj(previa);
  const antes = lista(p.lotes_antes);
  const depois = lista(p.lotes_depois);
  if (depois.length === 0) return [];
  const entAntes = lista(p.entregas_antes);
  const entDepois = lista(p.entregas_depois);
  const linhas: LinhaPreviaAjuste[] = [];
  for (const d of depois) {
    const id = texto(d.lote_id);
    const a = antes.find(x => texto(x.lote_id) === id);
    const kg = num(d.kg);
    const doLote = entDepois.filter(e => texto(e.lote_id) === id);
    const novo = num(d.total);
    linhas.push({
      chave: `lote:${id}`, nivel: 'lote', loteOrdem: numOuNulo(d.ordem), categoria: texto(d.categoria),
      datas: doLote.map(e => dataCurta(texto(e.data))), kg, hoje: num(a?.total), novo, porKgNovo: porKg(novo, kg),
    });
    if (doLote.length > 1) {
      for (const e of doLote) {
        const pid = texto(e.parte_id);
        const eAntes = entAntes.find(x => texto(x.parte_id) === pid);
        const ekg = num(e.kg);
        const enovo = num(e.valor);
        linhas.push({
          chave: `entrega:${pid}`, nivel: 'entrega', loteOrdem: numOuNulo(d.ordem), categoria: null,
          datas: [dataCurta(texto(e.data))], kg: ekg, hoje: num(eAntes?.valor), novo: enovo, porKgNovo: porKg(enovo, ekg),
        });
      }
    }
  }
  const lotes = linhas.filter(l => l.nivel === 'lote');
  const kgT = lotes.reduce((s, l) => s + l.kg, 0);
  const hojeT = lotes.reduce((s, l) => s + Math.round(l.hoje * 100), 0) / 100;
  const novoT = lotes.reduce((s, l) => s + Math.round(l.novo * 100), 0) / 100;
  linhas.push({ chave: 'total', nivel: 'total', loteOrdem: null, categoria: null, datas: [], kg: kgT, hoje: hojeT, novo: novoT,
    porKgNovo: porKg(novoT, kgT) });
  return linhas;
}

/* ─── OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2 — os rotulos GERADOS do extrato, curtos e numa linha so' ────────────────────── */

/** A explicacao no extrato, na coluna Descricao (92px uteis): o nome curto. O dialogo "Explicar diferenca" segue com o longo. */
const ROTULO_EXPLICACAO_CURTO: Record<TipoExplicacao, string> = {
  ajuste_preco: 'Ajuste de preço',
  desconto_comercial: 'Desconto',
  permuta_despesa: 'Permuta/desp.',
  outra_receita: 'Outra receita',
  devolucao_comprador: 'Devol. comprador',
};
export function rotuloCurtoExplicacao(tipo: TipoExplicacao, lado: LadoContaCorrente = 'venda'): string {
  if (lado === 'compra' && tipo === 'devolucao_comprador') return 'Devol. fornecedor';
  return ROTULO_EXPLICACAO_CURTO[tipo];
}

/**
 * A Descricao de cada linha do extrato — UM lugar, nao a celula. Entrega: a categoria ("Desmama M"; o Evento ja' diz Entrega e a
 * Conta diz Venda/Compra — "Compra Desmama M" pedia 99,3px para 92). Recebimento: "Receb. 2/4". Explicacao: o nome curto.
 * Medido em Inter 10px: o maior e' "Devol. fornecedor", 84,9px.
 */
export function descricaoDoEvento(l: LinhaContaCorrente, linhas: readonly LinhaContaCorrente[], lado: LadoContaCorrente,
  rotuloCategoria: (slug: string | null) => string): string {
  if (l.tipo === 'entrega') return rotuloCategoria(l.categoria);
  if (l.tipo === 'recebimento') return rotuloRecebimento(linhas, l.parteId, lado);
  return l.subtipo ? rotuloCurtoExplicacao(l.subtipo, lado) : 'Explicação';
}
