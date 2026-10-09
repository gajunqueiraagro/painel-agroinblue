/**
 * modeloCpr — CPR-EXPORT-01. O que a folha "Contas a Pagar e Receber" (PDF) e a planilha (Excel) mostram, JÁ PRONTO.
 *
 * ⚠ ESTE ARQUIVO NÃO SOMA, NÃO FILTRA E NÃO RECLASSIFICA. Todo número chega do dono (`cprRecorte.ts`: o recorte, a série do
 * saldo, o resumo por semana e o saldo por conta) ou dos grupos que a tela já desenha; aqui ele só vira TEXTO, na forma que a
 * tela mostra no momento do clique. O documento do PDF recebe este modelo e só desenha.
 * ⚠ SEM DEPENDÊNCIA DO MOTOR (react-pdf): quem monta o modelo é a tela, antes de decidir gerar.
 */
import { nomeEParcela, type ParcelaDoContrato } from '@/lib/financiamentos/nomeDaParcela';
import { formatMoeda } from '@/lib/calculos/formatters';
import { diasEntre, type PeriodoCpr, type SerieDoSaldoCpr, type SemanaCpr, type SaldoDaContaCpr, type LadoCpr } from '@/lib/financeiro/cprRecorte';
import { STATUS_FINANCEIRO_ORDEM, STATUS_FINANCEIRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import type { GraficoDaFolha } from '@/lib/pdf/cpr/graficoDoDom';

export type TipoDeValor = 'pagar' | 'receber' | 'saldo';
/** Uma célula de valor: o texto, a seta (desenhada, não é letra) e o tom. `null` = célula vazia. */
export interface CelulaValorCpr { texto: string; seta: 'cima' | 'baixo' | null; tom: 'neg' | 'pos' | 'apagado' | 'neutro'; destaque: boolean }

/** A MESMA regra da tela (`CelValor`): ▼ a pagar, ▲ a receber, saldo pelo sinal; zero apagado e sem seta; sem saldo = "—". */
export function celulaDeValor(tipo: TipoDeValor, valor: number | null | undefined, o: { semSeta?: boolean; destacarNegativo?: boolean } = {}): CelulaValorCpr | null {
  if (valor === undefined) return null;
  if (valor === null || !Number.isFinite(valor)) return { texto: '—', seta: null, tom: 'apagado', destaque: false };
  const zero = tipo !== 'saldo' && valor === 0;
  const negativo = tipo === 'pagar' || (tipo === 'saldo' && valor < 0);
  const texto = tipo === 'saldo' ? `${valor < 0 ? '-' : ''}${formatMoeda(Math.abs(valor))}` : formatMoeda(valor);
  if (zero || o.semSeta) return { texto, seta: null, tom: 'apagado', destaque: false };
  return { texto, seta: negativo ? 'baixo' : 'cima', tom: negativo ? 'neg' : 'pos', destaque: !!o.destacarNegativo && tipo === 'saldo' && valor < 0 };
}

const dma = (iso: string | null | undefined): string => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const dm = (iso: string | null | undefined): string => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const dmaCurto = (iso: string | null | undefined): string => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');
const ma = (iso: string | null | undefined): string => (iso && iso.length >= 7 ? `${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');
const contas = (n: number) => `${n} ${n === 1 ? 'conta' : 'contas'}`;
export const datasDoModelo = { dma, dm };

/** Uma linha de CONTA (lançamento) da tabela — tudo texto. */
export interface ContaDaFolha {
  comp: string; venc: string; pgto: string; descricao: string;
  /** PARC-LIVRES-01 passo 5 — o "i/N" do CONTRATO, que nunca corta; '' quando a conta não é parcela de parcelamento. */
  parcela: string; fornecedor: string; conta: string; subcentro: string; centro: string;
  macro: string; safra: string; faz: string; status: string; statusChave: string; origem: string; doc: string;
  /** o valor cai na coluna do SEU lado, sem seta */
  pagar: string; receber: string; paga: boolean;
  /** ponta de transferência em conta fora do caixa: aparece e não soma (quem diz é o dono do recorte) */
  foraDoCaixa: boolean;
}
/** Uma faixa (saldo hoje, vencidos, dia, intervalo) com as contas listadas nela. */
export interface FaixaDaFolha {
  tipo: 'saldo_hoje' | 'vencidos_contam' | 'entre' | 'dia';
  titulo: string;
  pagar: CelulaValorCpr | null; receber: CelulaValorCpr | null; saldo: CelulaValorCpr | null;
  contas: ContaDaFolha[];
}
export interface BlocoSimplesDaFolha { titulo: string; frase: string; contas: ContaDaFolha[]; pagar: string; receber: string }

export interface ModeloCpr {
  arquivo: string;
  cabecalho: { clienteNome: string; fazenda?: string; contaNome: string; periodo: string; linha2: string };
  /** o bloco de números: rótulo em cima, valor embaixo */
  /** `detalhes`: as linhas pequenas sob o valor, uma por linha (data, status em aberto, transferências, conciliação) */
  numeros: { rotulo: string; valor: string; detalhes: string[]; tom: 'neg' | 'pos' | 'neutro' }[];
  /** o gráfico da aba Fluxo, lido do que a tela desenhou (`graficoDoDom`); nulo = a folha sai sem ele */
  grafico: GraficoDaFolha | null;
  comColunaConta: boolean;
  faixas: FaixaDaFolha[];
  fim: { titulo: string; pagar: CelulaValorCpr | null; receber: CelulaValorCpr | null; saldo: CelulaValorCpr | null };
  notaSemSaldo: string | null;
  /** segmento "A pagar" ou "A receber": a lista é de um lado só, o saldo é sempre da conta */
  notaSegmento: string | null;
  anteriores: BlocoSimplesDaFolha | null;
  semVencimento: BlocoSimplesDaFolha | null;
  semanas: { semana: string; pagar: CelulaValorCpr | null; receber: CelulaValorCpr | null; saldo: CelulaValorCpr | null }[];
  porConta: { linhas: { conta: string; caixa: string; pagar: CelulaValorCpr | null; receber: CelulaValorCpr | null; saldo: CelulaValorCpr | null }[]; total: { caixa: string; pagar: CelulaValorCpr | null; receber: CelulaValorCpr | null; saldo: CelulaValorCpr | null }; nota: string } | null;
  /** o primeiro valor que não é número — a folha sai, e o aviso o nomeia */
  valorInvalido: string | null;
}

/** O grupo que a tela desenha (a MESMA lista da tela, na mesma ordem). */
export interface GrupoDaTela<L> {
  tipo: 'vencidos_contam' | 'vencidos_anteriores' | 'entre' | 'dia' | 'sem_vencimento';
  titulo: string; quando: string; linhas: L[];
  pagar: number; receber: number; saldo: number | null | undefined;
  /** dia ANTES de hoje (realizado): na folha vem logo depois do Caixa inicial, antes do "Saldo hoje" */
  passado?: boolean;
}
export interface LinhaDaTela {
  data_competencia?: string | null; data_vencimento?: string | null; data_pagamento?: string | null;
  descricao?: string | null; valor?: number | string | null;
}
export interface EntradaDoModelo<L extends LinhaDaTela> {
  clienteNome: string; fazendaNome?: string; contaNome: string; todasAsContas: boolean;
  periodo: PeriodoCpr; segmento: 'pagar' | 'receber' | 'ambos'; incluirVencidos: boolean; emitidoEm: string;
  serie: SerieDoSaldoCpr; grupos: GrupoDaTela<L>[];
  cartoes: {
    vencidosContamPagar: LadoCpr; vencidosContamReceber: LadoCpr; pagarNoPeriodo: LadoCpr; receberNoPeriodo: LadoCpr;
    /** as contas em aberto do período por status e as pontas de transferência (do dono do recorte) — a linha pequena dos cartões */
    porStatus: { pagar: Record<string, number>; receber: Record<string, number> };
    transferencias: { pagar: LadoCpr; receber: LadoCpr };
    /** hoje e a âncora da conciliação (a do cartão Caixa: a da conta, ou a mais antiga entre as contas do caixa) */
    hoje: string; conciliadoAte: string | null;
  };
  /** o rodapé da tela: totais a pagar e a receber da lista e a contagem */
  rodape: { pagar: number; receber: number; contas: number };
  semanas: SemanaCpr[];
  porConta: SaldoDaContaCpr[] | null;
  motivoSemSaldo: string;
  /** o gráfico do Fluxo já lido do DOM (o mesmo componente e a mesma série da tela); ausente = sem gráfico */
  grafico?: GraficoDaFolha | null;
  de: {
    fornecedor: (l: L) => string; conta: (l: L) => string; nomeDaConta: (id: string) => string; subcentro: (l: L) => string;
    centro: (l: L) => string; macro: (l: L) => string; safra: (l: L) => string; faz: (l: L) => string;
    status: (l: L) => { chave: string; rotulo: string }; origem: (l: L) => string; doc: (l: L) => string;
    receber: (l: L) => boolean; paga: (l: L) => boolean;
    /** CPR-TRANSFERENCIAS-NO-FLUXO-01: a linha é ponta de transferência (a descrição leva "Transf. · ") / está em conta fora do caixa */
    transferencia?: (l: L) => boolean; foraDoCaixa?: (l: L) => boolean;
    /** o número e o total da parcela NO CONTRATO (lidos do banco); ausente = a descrição como está */
    parcela?: (l: L) => ParcelaDoContrato | null;
  };
}

const SEGMENTO: Record<'pagar' | 'receber' | 'ambos', string> = { pagar: 'A pagar', receber: 'A receber', ambos: 'A pagar e a receber' };
export const slugDoArquivo = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'x';
/** `contas-a-pagar-receber_{cliente}_{conta|todas}_{AAAA-MM-DD}_a_{AAAA-MM-DD}` — sem acento nem espaço, sem a extensão. */
export function nomeDoArquivoCpr(e: { clienteNome: string; contaNome: string; todasAsContas: boolean; periodo: PeriodoCpr }): string {
  return `contas-a-pagar-receber_${slugDoArquivo(e.clienteNome)}_${e.todasAsContas ? 'todas' : slugDoArquivo(e.contaNome)}_${e.periodo.de}_a_${e.periodo.ate}`;
}

export function contaDaFolha<L extends LinhaDaTela>(l: L, de: EntradaDoModelo<L>['de']): ContaDaFolha {
  const v = Math.abs(Number(l.valor ?? 0));
  const receber = de.receber(l), paga = de.paga(l);
  const st = de.status(l);
  const texto = Number.isFinite(v) ? formatMoeda(v) : '—';
  const np = nomeEParcela(l.descricao, de.parcela ? de.parcela(l) : null);
  const marca = de.transferencia?.(l) ? 'Transf. · ' : '';
  return {
    comp: ma(l.data_competencia), venc: dmaCurto(l.data_vencimento), pgto: paga ? dmaCurto(l.data_pagamento) : '',
    descricao: `${marca}${(np.parcela ? np.nome : l.descricao) || '—'}`, parcela: np.parcela ?? '', fornecedor: de.fornecedor(l), conta: de.conta(l), subcentro: de.subcentro(l), centro: de.centro(l),
    macro: de.macro(l), safra: de.safra(l), faz: de.faz(l), status: st.rotulo, statusChave: st.chave, origem: de.origem(l), doc: de.doc(l),
    pagar: receber ? '' : texto, receber: receber ? texto : '', paga, foraDoCaixa: !!de.foraDoCaixa?.(l),
  };
}

const semCifrao = (v: number): string => formatMoeda(v).replace(/^R\$\s*/, '');
/**
 * A LINHA PEQUENA dos cartões "A pagar / A receber no período": o valor por status em aberto, na ordem da casa (Previsto ·
 * Programado · Agendado), sem o status zerado, e por último, à parte, as pontas de transferência. Uma informação por linha.
 * Os números chegam do dono do recorte; aqui só viram texto.
 */
export function linhasPorStatus(porStatus: Record<string, number>, transferencias: number): string[] {
  const linhas: string[] = [];
  for (const st of STATUS_FINANCEIRO_ORDEM) {
    const v = porStatus[st] ?? 0;
    if (st !== 'realizado' && v > 0) linhas.push(`${STATUS_FINANCEIRO_LABEL[st]} ${semCifrao(v)}`);
  }
  if (transferencias > 0) linhas.push(`Transf. ${semCifrao(transferencias)}`);
  return linhas;
}
/** "conciliado até dd/mm" quando a âncora é hoje; "conciliado até dd/mm" + "N dias a conferir" quando é anterior; sem âncora, nada. */
export function situacaoDaConciliacao(conciliadoAte: string | null, hoje: string): string[] {
  if (!conciliadoAte) return ['sem saldo conferido'];
  const n = diasEntre(conciliadoAte.slice(0, 10), hoje);
  return n <= 0 ? [`conciliado até ${dm(conciliadoAte)}`] : [`conciliado até ${dm(conciliadoAte)}`, `${n} ${n === 1 ? 'dia' : 'dias'} a conferir`];
}

export function montarModeloCpr<L extends LinhaDaTela>(e: EntradaDoModelo<L>): ModeloCpr {
  const s = e.serie;
  const saldoComData = (v: number | null) => (v == null ? '—' : `${v < 0 ? '-' : ''}${formatMoeda(Math.abs(v))}`);
  const tomDe = (v: number | null): 'neg' | 'pos' | 'neutro' => (v == null ? 'neutro' : v < 0 ? 'neg' : 'pos');
  const c = e.cartoes;
  const numeros: ModeloCpr['numeros'] = [
    { rotulo: 'Caixa inicial', valor: saldoComData(s.inicial?.saldo ?? null), detalhes: [s.inicial ? `em ${dma(s.inicial.data)}` : 'sem saldo nessa data'], tom: s.inicial ? tomDe(s.inicial.saldo) : 'neutro' },
    { rotulo: 'Vencidos que contam', valor: formatMoeda(c.vencidosContamPagar.valor),
      detalhes: [`${contas(c.vencidosContamPagar.contas)} a pagar${c.vencidosContamReceber.valor > 0 ? ` · a receber ${formatMoeda(c.vencidosContamReceber.valor)}` : ''}`],
      tom: c.vencidosContamPagar.valor > 0 ? 'neg' : 'neutro' },
    { rotulo: 'A pagar no período', valor: formatMoeda(c.pagarNoPeriodo.valor), detalhes: linhasPorStatus(c.porStatus.pagar, c.transferencias.pagar.valor), tom: 'neg' },
    { rotulo: 'A receber no período', valor: formatMoeda(c.receberNoPeriodo.valor), detalhes: linhasPorStatus(c.porStatus.receber, c.transferencias.receber.valor), tom: c.receberNoPeriodo.valor > 0 ? 'pos' : 'neutro' },
    { rotulo: 'Mínimo', valor: s.menor ? saldoComData(s.menor.valor) : '—', detalhes: s.menor ? [s.menor.data ? `em ${dm(s.menor.data)}` : 'hoje'] : [], tom: tomDe(s.menor?.valor ?? null) },
    { rotulo: 'Saldo no fim', valor: saldoComData(s.fim), detalhes: [`em ${dma(e.periodo.ate)}`], tom: tomDe(s.fim) },
    { rotulo: 'Caixa hoje', valor: saldoComData(s.hoje), detalhes: [dma(c.hoje), ...situacaoDaConciliacao(c.conciliadoAte, c.hoje)], tom: 'neutro' },
  ];

  const quem = e.todasAsContas ? 'todas as contas' : e.contaNome;
  const faixaDeHoje: FaixaDaFolha = {
    tipo: 'saldo_hoje',
    titulo: `Saldo hoje · ${quem}${e.incluirVencidos ? '' : ' · após vencidos'}`,
    /* com os vencidos ligados, a linha de hoje mostra o que JÁ foi realizado hoje (o saldo dela já o contém) */
    pagar: e.incluirVencidos ? (s.realizadoHoje && s.realizadoHoje.pagar.contas > 0 ? celulaDeValor('pagar', s.realizadoHoje.pagar.valor) : null) : celulaDeValor('pagar', s.partida.pagar.valor),
    receber: e.incluirVencidos ? (s.realizadoHoje && s.realizadoHoje.receber.contas > 0 ? celulaDeValor('receber', s.realizadoHoje.receber.valor) : null) : celulaDeValor('receber', s.partida.receber.valor),
    saldo: celulaDeValor('saldo', e.incluirVencidos ? s.hoje : s.partida.saldo),
    contas: [],
  };
  /* PERÍODO QUE COMEÇA ANTES DE HOJE: a folha anda no tempo — Caixa inicial, os dias realizados, o saldo de hoje e o que vem.
     Sem o Caixa inicial (o dono não responde naquela data) fica a ordem de sempre, a partir do saldo de hoje. */
  const comInicial = !!s.inicial && e.periodo.de <= c.hoje;
  const faixaDe = (g: GrupoDaTela<L>): FaixaDaFolha | null => (g.tipo === 'vencidos_anteriores' || g.tipo === 'sem_vencimento' ? null : {
    tipo: g.tipo, titulo: g.quando ? `${g.titulo} · ${g.quando}` : g.titulo,
    pagar: celulaDeValor('pagar', g.pagar), receber: celulaDeValor('receber', g.receber),
    saldo: celulaDeValor('saldo', g.saldo, { destacarNegativo: true }), contas: g.linhas.map((l) => contaDaFolha(l, e.de)),
  });
  const faixas: FaixaDaFolha[] = [];
  if (comInicial && s.inicial) {
    faixas.push({ tipo: 'saldo_hoje', titulo: `Caixa inicial · ${dma(s.inicial.data)} · ${quem}`, pagar: null, receber: null, saldo: celulaDeValor('saldo', s.inicial.saldo), contas: [] });
    for (const g of e.grupos) { const f = g.passado ? faixaDe(g) : null; if (f) faixas.push(f); }
  }
  if (!s.encerrado) faixas.push(faixaDeHoje);
  let anteriores: BlocoSimplesDaFolha | null = null;
  let semVencimento: BlocoSimplesDaFolha | null = null;
  for (const g of e.grupos) {
    if (g.tipo === 'vencidos_anteriores') {
      anteriores = { titulo: `${g.titulo}`, frase: 'vencimento em mês já conciliado: confira se foi pago ou atualize a data', contas: g.linhas.map((l) => contaDaFolha(l, e.de)), pagar: formatMoeda(g.pagar), receber: formatMoeda(g.receber) };
      continue;
    }
    if (g.tipo === 'sem_vencimento') {
      semVencimento = { titulo: g.titulo, frase: 'sem data de vencimento: fora dos números e do saldo', contas: g.linhas.map((l) => contaDaFolha(l, e.de)), pagar: formatMoeda(g.pagar), receber: formatMoeda(g.receber) };
      continue;
    }
    if (comInicial && g.passado) continue;
    const f = faixaDe(g);
    if (f) faixas.push(f);
  }

  /* o primeiro valor que não é número: a folha sai, e o aviso o nomeia (o motor recusa NaN em coordenada, não em texto) */
  let valorInvalido: string | null = null;
  if (s.hoje !== null && !Number.isFinite(s.hoje)) valorInvalido = 'o saldo em caixa';
  for (const g of e.grupos) {
    if (valorInvalido) break;
    const ruim = g.linhas.find((l) => !Number.isFinite(Number(l.valor ?? 0)));
    if (ruim) valorInvalido = `o lançamento de ${dm(ruim.data_vencimento)} "${ruim.descricao || 'sem descrição'}"`;
  }

  return {
    arquivo: nomeDoArquivoCpr(e),
    cabecalho: {
      clienteNome: e.clienteNome, fazenda: e.fazendaNome, contaNome: e.todasAsContas ? 'Todas as contas' : e.contaNome,
      periodo: `${dma(e.periodo.de)} a ${dma(e.periodo.ate)}`,
      linha2: `${SEGMENTO[e.segmento]}${e.incluirVencidos ? '' : ' · sem listar os vencidos'}   ·   emitido em ${e.emitidoEm}`,
    },
    numeros,
    grafico: e.grafico ?? null,
    comColunaConta: e.todasAsContas,
    faixas,
    fim: {
      titulo: `Fim do período · ${dma(e.periodo.ate)} · ${contas(e.rodape.contas)}`,
      pagar: celulaDeValor('pagar', e.rodape.pagar), receber: celulaDeValor('receber', e.rodape.receber), saldo: celulaDeValor('saldo', s.fim),
    },
    notaSemSaldo: s.hoje == null ? `Saldo "—": ${e.motivoSemSaldo}.` : null,
    notaSegmento: e.segmento === 'ambos' ? null : `Lista só as contas ${e.segmento === 'pagar' ? 'a pagar' : 'a receber'}; os totais de cada dia e o saldo consideram a pagar e a receber.`,
    anteriores, semVencimento,
    semanas: e.semanas.map((w) => ({ semana: `${dm(w.de)} a ${dm(w.ate)}`, pagar: celulaDeValor('pagar', w.pagar), receber: celulaDeValor('receber', w.receber), saldo: celulaDeValor('saldo', w.saldo, { destacarNegativo: true }) })),
    porConta: e.porConta ? {
      linhas: e.porConta.map((c) => ({
        conta: e.de.nomeDaConta(c.conta), caixa: saldoComData(c.caixa), pagar: celulaDeValor('pagar', c.pagar.valor), receber: celulaDeValor('receber', c.receber.valor),
        saldo: celulaDeValor('saldo', c.fim, { destacarNegativo: true }),
      })),
      total: { caixa: saldoComData(s.hoje), pagar: celulaDeValor('pagar', s.totalPagar.valor), receber: celulaDeValor('receber', s.totalReceber.valor), saldo: celulaDeValor('saldo', s.fim) },
      nota: 'A pagar e a receber de cada conta: vencidos que contam no saldo + período. Conta sem saldo em caixa (cartão de crédito, sem conta) mostra "—", e o que vence nela entra no total.',
    } : null,
    valorInvalido,
  };
}
