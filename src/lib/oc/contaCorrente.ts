/**
 * CONTA CORRENTE DA VENDA — OC-VENDA-ENTREGAS-01b/01c (ADR-2026-21, mock `docs/mocks/oc_conta_corrente_mock_v7.html`).
 *
 * ⚠ O EXTRATO E' LIDO PELO CAIXA DA FAZENDA (01c): recebimento SOMA (entrou dinheiro), entrega ABATE (gado que saiu e ainda
 *   falta receber), explicacao SOMA quando reduz o que falta receber. saldo = recebido - entregue + explicacoes; NEGATIVO = falta
 *   receber, POSITIVO = o comprador adiantou, ZERO = quitado. So' aqui: no DRE a entrega segue receita positiva.
 * ⚠ O SALDO E' DO BANCO (`oc_conta_corrente`), linha a linha e no fim. Esta lib so' le o envelope e o sinal; nao soma regra.
 */

export type TipoLinhaContaCorrente = 'entrega' | 'recebimento' | 'explicacao' | 'deducao';
export type TipoExplicacao = 'ajuste_preco' | 'desconto_comercial' | 'permuta_despesa' | 'outra_receita' | 'devolucao_comprador';
/** D6: sem conta bancaria nunca aparece como conciliado. */
export type StatusLinhaContaCorrente =
  | 'sem_caixa' | 'sem_conta_bancaria' | 'conciliado' | 'programado' | 'previsto' | 'realizado' | 'ajuste';
/** 'falta_pagar' so' na compra (OC-CONTA-CORRENTE-TODOS-01a): o extrato da compra e' o espelho do da venda. */
/** 'aguardando_saida' (OC-CC-PADRAO-NOVAS-01a/01b): a OC nasceu em conta corrente e ainda nao tem entrega nem recebimento. */
export type SituacaoContaCorrente = 'falta_receber' | 'falta_pagar' | 'adiantado' | 'quitado' | 'aguardando_saida';
/** De que lado da operacao a conta corrente fala: a venda recebe do comprador, a compra paga ao fornecedor, o abate recebe do frigorifico. */
export type LadoContaCorrente = 'venda' | 'compra' | 'abate';

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
  /** OC-CC-ABATE-01 PR 2 — so' na linha 'deducao': o componente que o banco manda em `subtipo` ('funrural'). */
  componente: string | null;
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
  /** Coluna "Entrega (DRE)" com o SINAL DO BANCO (venda/abate: entrega negativa, explicacao que reduz o devido positiva; a compra e'
   *  o espelho). A tela aplica `sinalDaFazenda` (`linhaNaTela`) — nunca desenha este numero cru. */
  movEntrega: number | null;
  /** Coluna "Recebido (caixa)" com o SINAL DO BANCO (venda/abate: recebimento positivo, devolucao negativa; a compra e' o espelho).
   *  A tela aplica `sinalDaFazenda`. */
  movRecebido: number | null;
  status: StatusLinhaContaCorrente;
  /** Programado nao entra no saldo (ainda nao e' dinheiro). */
  noSaldo: boolean;
  /** Saldo corrido depois desta linha, com o SINAL DO BANCO. A tela aplica `sinalDaFazenda`. */
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
  /** OC-CC-ABATE-01 PR 2 — a chave `deduzido` SO' EXISTE no abate; fora dele, null (nunca zero inventado). */
  deduzido: number | null;
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
  return v === 'sem_caixa' || v === 'sem_conta_bancaria' || v === 'conciliado' || v === 'programado' || v === 'previsto' || v === 'ajuste'
    ? v : 'realizado';
}
/** ABATE-PROJETADO-01c — dinheiro que ainda nao entrou: o programado e o PREVISTO (o recebimento do abate so' projetado, que o
 *  banco devolve como 'previsto' ate' a saida do gado). Quem pergunta "esta' em aberto?" pergunta aqui. */
export function dinheiroEmAberto(status: StatusLinhaContaCorrente): boolean {
  return status === 'programado' || status === 'previsto';
}
function situacaoDe(v: unknown): SituacaoContaCorrente {
  return v === 'falta_receber' || v === 'falta_pagar' || v === 'adiantado' || v === 'aguardando_saida' ? v : 'quitado';
}
function tipoLinhaDe(v: unknown): TipoLinhaContaCorrente {
  return v === 'entrega' || v === 'explicacao' || v === 'deducao' ? v : 'recebimento';
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
    deduzido: 'deduzido' in r ? num(r.deduzido) : null,
    ultimaEntrega: texto(r.ultima_entrega),
    recebimentosSemContaBancaria: num(r.recebimentos_sem_conta_bancaria),
    saidasSemEntrega: num(r.saidas_sem_entrega),
    linhas: linhas.map((x) => {
      const l = obj(x);
      return {
        tipo: tipoLinhaDe(l.tipo),
        subtipo: tipoExplicacaoDe(l.subtipo),
        componente: l.tipo === 'deducao' ? texto(l.subtipo) : null,
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

/**
 * A COR PELO SINAL — um dono so' (PR-OC-BOITEL-PAINEL-01): negativo SEMPRE vermelho, positivo SEMPRE verde. O resumo da
 * conta corrente e o painel de boitel leem daqui; eram literais soltos no `VendaModalShell`.
 */
export const COR_SINAL: { readonly neg: string; readonly pos: string } = {
  neg: 'text-[#b91c1c]',
  pos: 'text-[#15803d]',
};

/** Cor pelo sinal do caixa da fazenda: negativo = falta receber (vermelho), positivo = adiantado/entrou (verde). */
export function corDoSaldo(valor: number | null): 'neg' | 'pos' | 'zero' {
  if (valor === null) return 'zero';
  const c = Math.round(valor * 100);
  return c < 0 ? 'neg' : c > 0 ? 'pos' : 'zero';
}

/* ═══ OC-CC-SINAL-FAZENDA-01 — O EXTRATO LE PELO LADO DA FAZENDA, NUM DONO SO' (Gabriel, 14/10/2026) ═══════════════════════════
   O banco (`oc_conta_corrente`) manda os numeros com o sinal "da conta da contraparte com a fazenda": na venda e no abate a entrega
   e' negativa (o comprador passou a dever), o recebimento soma e o saldo negativo e' "falta receber"; a compra e' o espelho. A TELA
   le pelo lado da FAZENDA: entrega positiva, deducao e o que reduz a operacao negativos, dinheiro positivo, e SALDO POSITIVO = FALTA
   (receber ou pagar), NEGATIVO = ADIANTADO. A tela NAO SOMA: so' multiplica cada numero do banco pelo fator do lado.
   FATORES MEDIDOS NO BANCO (14/10, so' leitura):
     abate 02be1a41  entrega −373.877,60 -> +373.877,60 · Funrural +6.094,20 -> −6.094,20 · recebido +367.783,40 -> igual · saldo 0
     abate 26fd02c1  saldo −212.449,03 (falta receber) -> +212.449,03
     compra fcdbe0bb entrega +35.000,00 -> igual · pago −63.440,00 -> +63.440,00 · saldo +1.000,00 (falta pagar) -> igual
   venda = abate (mesmo sinal no banco). Em todo lado: saldo na tela = entrega − deducoes/explicacoes que reduzem − dinheiro. */
export interface SinalDaFazenda { entrega: 1 | -1; dinheiro: 1 | -1; saldo: 1 | -1 }
const SINAL_DA_FAZENDA: Record<LadoContaCorrente, SinalDaFazenda> = {
  venda: { entrega: -1, dinheiro: 1, saldo: -1 },
  abate: { entrega: -1, dinheiro: 1, saldo: -1 },
  compra: { entrega: 1, dinheiro: -1, saldo: 1 },
};
/** O fator que leva cada numero do banco ao numero que a fazenda ve^, por lado. O UNICO lugar que sabe o sinal de apresentacao. */
export function sinalDaFazenda(lado: LadoContaCorrente): SinalDaFazenda {
  return SINAL_DA_FAZENDA[lado];
}
/* `0 * -1` da' −0; a tela nao mostra "−0,00" */
const vezes = (f: 1 | -1, v: number): number => (v === 0 ? 0 : f * v);
/** A linha do extrato como a fazenda a le: entrega, dinheiro e saldo corrido. */
export function linhaNaTela(l: LinhaContaCorrente, lado: LadoContaCorrente): { entrega: number | null; dinheiro: number | null; saldo: number } {
  const s = sinalDaFazenda(lado);
  return {
    entrega: l.movEntrega == null ? null : vezes(s.entrega, l.movEntrega),
    dinheiro: l.movRecebido == null ? null : vezes(s.dinheiro, l.movRecebido),
    saldo: vezes(s.saldo, l.saldo),
  };
}
/** Qualquer valor com o sinal do SALDO do banco (saldo, saldo a explicar, explicado, falta explicar, valor de explicacao), na tela.
 *  ⚠ Explicacao tem o sinal do saldo no banco (reduz o que falta = positivo na venda) e, na tela, mora na coluna da entrega: o fator
 *  do saldo e o da entrega sao iguais nos tres lados. */
export function noSinalDaFazenda(valorDoBanco: number, lado: LadoContaCorrente): number {
  return vezes(sinalDaFazenda(lado).saldo, valorDoBanco);
}
/** O saldo da OC na tela: positivo = falta receber/pagar, zero = quitado, negativo = adiantado. */
export function saldoNaTela(cc: ContaCorrente, lado: LadoContaCorrente): number {
  return noSinalDaFazenda(cc.saldo, lado);
}
/** Os totais do extrato na tela: o entregue (bruto) e o dinheiro, positivos, e o saldo. O banco ja' os manda em modulo. */
export function totaisNaTela(cc: ContaCorrente, lado: LadoContaCorrente): { entrega: number; dinheiro: number; saldo: number } {
  return { entrega: cc.entregue, dinheiro: cc.recebido, saldo: saldoNaTela(cc, lado) };
}
/**
 * OC-CC-TOTAL-LIQUIDO-01 — o ENTREGUE LIQUIDO na tela: no abate, o bruto menos as retencoes da NF (`entregue − deduzido`, os dois
 * do envelope do banco, o mesmo `cc`); fora do abate, o `entregue` como sempre. ⚠ NUNCA a soma das linhas da coluna Entrega: ela
 * tem tambem as explicacoes. Alimenta o card, o total da coluna e o rodape do abate. Em centavos.
 */
export function liquidoNaTela(cc: ContaCorrente, lado: LadoContaCorrente): number {
  if (lado !== 'abate' || cc.deduzido == null) return cc.entregue;
  return (Math.round(cc.entregue * 100) - Math.round(cc.deduzido * 100)) / 100;
}
/** O estado do saldo NA TELA: positivo = falta (vermelho), zero = quitado (neutro), negativo = adiantado (verde).
 *  ⚠ NAO e' `corDoSaldo` (que pinta pelo sinal cru: negativo vermelho). */
export function corDoSaldoNaTela(saldoTela: number | null): 'falta' | 'quitado' | 'adiantado' {
  if (saldoTela === null) return 'quitado';
  const c = Math.round(saldoTela * 100);
  return c > 0 ? 'falta' : c < 0 ? 'adiantado' : 'quitado';
}
/** A cor de um saldo na tela, pelas cores do dono (`COR_SINAL`): falta vermelho, adiantado verde, quitado sem cor. */
export function classeDoSaldoNaTela(saldoTela: number | null): string {
  const e = corDoSaldoNaTela(saldoTela);
  return e === 'falta' ? COR_SINAL.neg : e === 'adiantado' ? COR_SINAL.pos : '';
}
/** A cor da coluna da ENTREGA na tela: a entrega e' receita (verde) na venda e no abate, custo (vermelho) na compra; deducao e
 *  explicacao pelo sinal na tela (reduz = negativo vermelho, aumenta = positivo verde). */
export function classeDaEntregaNaTela(valorTela: number | null, lado: LadoContaCorrente, tipo: TipoLinhaContaCorrente | 'total'): string {
  if (valorTela === null || Math.round(valorTela * 100) === 0) return '';
  if (tipo === 'entrega' || tipo === 'total') return lado === 'compra' ? COR_SINAL.neg : COR_SINAL.pos;
  return valorTela < 0 ? COR_SINAL.neg : COR_SINAL.pos;
}
/** A cor da coluna do DINHEIRO na tela: recebido (venda/abate) verde; pago (compra) vermelho, saida de caixa; devolucao, o oposto. */
export function classeDoDinheiroNaTela(valorTela: number | null, lado: LadoContaCorrente): string {
  if (valorTela === null || Math.round(valorTela * 100) === 0) return '';
  const entra = lado === 'compra' ? valorTela < 0 : valorTela > 0;
  return entra ? COR_SINAL.pos : COR_SINAL.neg;
}
/** A cor de um valor que muda o valor da operacao (explicacao, "Explicado"): reduz = negativo vermelho, aumenta = positivo verde. */
export function classeDoAjusteNaTela(valorTela: number | null): string {
  if (valorTela === null || Math.round(valorTela * 100) === 0) return '';
  return valorTela < 0 ? COR_SINAL.neg : COR_SINAL.pos;
}

/** OC-CC-PADRAO-NOVAS-01b — a situacao que o banco devolve enquanto nada saiu e nada foi pago: nao e' "quitado". */
export const ROTULO_AGUARDANDO_SAIDA = 'Aguardando saída';
/** "Atualizar entregas" nao vale em rascunho (o banco recusa): o botao fica apagado com este motivo. */
export const MOTIVO_ATUALIZAR_EM_RASCUNHO = 'Conclua a negociação antes';

/** O rotulo do card do saldo. ⚠ RECEBE O SALDO NA TELA (`saldoNaTela`, OC-CC-SINAL-FAZENDA-01): positivo = falta, negativo =
 *  adiantado, nos tres lados. */
export function rotuloDoSaldo(saldoTela: number, lado: LadoContaCorrente = 'venda', situacao?: SituacaoContaCorrente): string {
  if (situacao === 'aguardando_saida') return ROTULO_AGUARDANDO_SAIDA;
  const e = corDoSaldoNaTela(saldoTela);
  if (e === 'quitado') return 'Saldo · quitado';
  if (lado === 'compra') return e === 'falta' ? 'Saldo · falta pagar' : 'Saldo · adiantado ao fornecedor';
  if (lado === 'abate') return e === 'falta' ? 'Saldo · falta receber' : 'Saldo · adiantado pelo frigorífico';
  return e === 'falta' ? 'Saldo · falta receber' : 'Saldo · adiantado pelo comprador';
}

/**
 * A barra da diferenca: so' existe com as entregas concluidas (nada mais a entregar) e algo ainda sem explicacao. Antes disso o
 * saldo e' so' o andamento do contrato. A OC fecha mesmo sem explicar. `valor` e' o que falta NA TELA (positivo = o dinheiro ficou
 * abaixo do gado), OC-CC-SINAL-FAZENDA-01.
 */
export function barraDaDiferenca(cc: ContaCorrente, lado: LadoContaCorrente = 'venda'): { frase: string; valor: number } | null {
  if (!cc.linhas.some(l => l.tipo === 'entrega')) return null;
  if (Math.round(cc.aEntregar * 100) > 0) return null;
  /* OC-CC-SINAL-FAZENDA-01 — o que falta explicar NA TELA: positivo = o dinheiro ficou abaixo do gado, nos tres lados. */
  const falta = noSinalDaFazenda(cc.faltaExplicar, lado);
  const c = Math.round(falta * 100);
  if (c === 0) return null;
  const v = Math.abs(c) / 100;
  const fmt = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (lado === 'compra') {
    return c > 0
      ? { frase: `Pagou R$ ${fmt} a menos do que o gado que entrou.`, valor: falta }
      : { frase: `Pagou R$ ${fmt} a mais do que o gado que entrou.`, valor: falta };
  }
  return c > 0
    ? { frase: `Recebeu R$ ${fmt} a menos do que entregou.`, valor: falta }
    : { frase: `Recebeu R$ ${fmt} a mais do que entregou.`, valor: falta };
}

export const ROTULO_STATUS: Record<StatusLinhaContaCorrente, string> = {
  sem_caixa: 'sem caixa',
  /* OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2 — texto gerado pelo sistema e' curto e nunca quebra linha ("compactar sempre"). */
  sem_conta_bancaria: 's/ conta',
  conciliado: 'conciliado',
  programado: 'programado',
  previsto: 'previsto',
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
  /* No abate o preco se corrige no acerto (aba Abate): o banco recusa 'ajuste_preco' (OC-CC-ABATE-01). */
  abate: ['desconto_comercial', 'permuta_despesa', 'outra_receita', 'devolucao_comprador'],
};

/** O nome da explicacao na tela. A devolucao da contraparte e' um componente so' no banco; o rotulo segue o lado. */
export function rotuloExplicacao(tipo: TipoExplicacao, lado: LadoContaCorrente = 'venda'): string {
  if (lado === 'compra' && tipo === 'devolucao_comprador') return 'Devolução do fornecedor';
  if (lado === 'abate' && tipo === 'devolucao_comprador') return 'Devolução do frigorífico';
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
 * O que cada explicacao faz no saldo, com o SINAL DO BANCO (a tela o leva ao lado da fazenda por `noSinalDaFazenda`): a que REDUZ o que falta receber (ajuste para baixo,
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

/** OC-CC-ABATE-01 PR 2 — a deducao do abate na Descricao (texto gerado, uma linha). */
const ROTULO_DEDUCAO: Record<string, string> = { funrural: 'Retenções da NF' };
export function rotuloDeducao(componente: string | null): string {
  return (componente && ROTULO_DEDUCAO[componente]) || 'Dedução';
}

/**
 * A Descricao de cada linha do extrato — UM lugar, nao a celula. Entrega: a categoria ("Desmama M"; o Evento ja' diz Entrega e a
 * Conta diz Venda/Compra — "Compra Desmama M" pedia 99,3px para 92). Recebimento: "Receb. 2/4". Explicacao: o nome curto.
 * Medido em Inter 10px: o maior e' "Devol. fornecedor", 84,9px.
 */
export function descricaoDoEvento(l: LinhaContaCorrente, linhas: readonly LinhaContaCorrente[], lado: LadoContaCorrente,
  rotuloCategoria: (slug: string | null) => string): string {
  if (l.tipo === 'entrega') return rotuloCategoria(l.categoria);
  if (l.tipo === 'deducao') return rotuloDeducao(l.componente);
  if (l.tipo === 'recebimento') return rotuloRecebimento(linhas, l.parteId, lado);
  return l.subtipo ? rotuloCurtoExplicacao(l.subtipo, lado) : 'Explicação';
}
