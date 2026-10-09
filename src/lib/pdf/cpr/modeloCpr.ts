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
import type { PeriodoCpr, SerieDoSaldoCpr, SemanaCpr, SaldoDaContaCpr, LadoCpr } from '@/lib/financeiro/cprRecorte';

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
  numeros: { rotulo: string; valor: string; detalhe?: string; tom: 'neg' | 'pos' | 'neutro' }[];
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
}
export interface LinhaDaTela {
  data_competencia?: string | null; data_vencimento?: string | null; data_pagamento?: string | null;
  descricao?: string | null; valor?: number | string | null;
}
export interface EntradaDoModelo<L extends LinhaDaTela> {
  clienteNome: string; fazendaNome?: string; contaNome: string; todasAsContas: boolean;
  periodo: PeriodoCpr; segmento: 'pagar' | 'receber' | 'ambos'; incluirVencidos: boolean; emitidoEm: string;
  serie: SerieDoSaldoCpr; grupos: GrupoDaTela<L>[];
  cartoes: { vencidosContamPagar: LadoCpr; vencidosContamReceber: LadoCpr; pagarNoPeriodo: LadoCpr; receberNoPeriodo: LadoCpr };
  /** o rodapé da tela: totais a pagar e a receber da lista e a contagem */
  rodape: { pagar: number; receber: number; contas: number };
  semanas: SemanaCpr[];
  porConta: SaldoDaContaCpr[] | null;
  motivoSemSaldo: string;
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

export function montarModeloCpr<L extends LinhaDaTela>(e: EntradaDoModelo<L>): ModeloCpr {
  const s = e.serie;
  const saldoComData = (v: number | null) => (v == null ? '—' : `${v < 0 ? '-' : ''}${formatMoeda(Math.abs(v))}`);
  const tomDe = (v: number | null): 'neg' | 'pos' | 'neutro' => (v == null ? 'neutro' : v < 0 ? 'neg' : 'pos');
  const numeros: ModeloCpr['numeros'] = [
    e.incluirVencidos
      ? { rotulo: 'Caixa hoje', valor: saldoComData(s.hoje), tom: 'neutro' }
      : { rotulo: 'Saldo de partida', valor: saldoComData(s.partida.saldo), detalhe: `após vencidos · caixa ${saldoComData(s.hoje)}`, tom: tomDe(s.partida.saldo) },
    { rotulo: 'Vencidos que contam', valor: formatMoeda(e.cartoes.vencidosContamPagar.valor),
      detalhe: `${contas(e.cartoes.vencidosContamPagar.contas)} a pagar${e.cartoes.vencidosContamReceber.valor > 0 ? ` · a receber ${formatMoeda(e.cartoes.vencidosContamReceber.valor)}` : ''}`,
      tom: e.cartoes.vencidosContamPagar.valor > 0 ? 'neg' : 'neutro' },
    { rotulo: 'A pagar no período', valor: formatMoeda(e.cartoes.pagarNoPeriodo.valor), detalhe: contas(e.cartoes.pagarNoPeriodo.contas), tom: 'neg' },
    { rotulo: 'A receber no período', valor: formatMoeda(e.cartoes.receberNoPeriodo.valor), detalhe: contas(e.cartoes.receberNoPeriodo.contas), tom: e.cartoes.receberNoPeriodo.valor > 0 ? 'pos' : 'neutro' },
    { rotulo: 'Mínimo', valor: s.menor ? saldoComData(s.menor.valor) : '—', detalhe: s.menor ? (s.menor.data ? `em ${dm(s.menor.data)}` : 'hoje') : undefined, tom: tomDe(s.menor?.valor ?? null) },
    { rotulo: 'Saldo no fim', valor: saldoComData(s.fim), detalhe: `em ${dma(e.periodo.ate)}`, tom: tomDe(s.fim) },
  ];

  const faixas: FaixaDaFolha[] = [{
    tipo: 'saldo_hoje',
    titulo: `Saldo hoje · ${e.todasAsContas ? 'todas as contas' : e.contaNome}${e.incluirVencidos ? '' : ' · após vencidos'}`,
    pagar: e.incluirVencidos ? null : celulaDeValor('pagar', s.partida.pagar.valor),
    receber: e.incluirVencidos ? null : celulaDeValor('receber', s.partida.receber.valor),
    saldo: celulaDeValor('saldo', e.incluirVencidos ? s.hoje : s.partida.saldo),
    contas: [],
  }];
  let anteriores: BlocoSimplesDaFolha | null = null;
  let semVencimento: BlocoSimplesDaFolha | null = null;
  for (const g of e.grupos) {
    const linhas = g.linhas.map((l) => contaDaFolha(l, e.de));
    if (g.tipo === 'vencidos_anteriores') {
      anteriores = { titulo: `${g.titulo}`, frase: 'vencimento em mês já conciliado: confira se foi pago ou atualize a data', contas: linhas, pagar: formatMoeda(g.pagar), receber: formatMoeda(g.receber) };
      continue;
    }
    if (g.tipo === 'sem_vencimento') {
      semVencimento = { titulo: g.titulo, frase: 'sem data de vencimento: fora dos números e do saldo', contas: linhas, pagar: formatMoeda(g.pagar), receber: formatMoeda(g.receber) };
      continue;
    }
    faixas.push({
      tipo: g.tipo, titulo: g.quando ? `${g.titulo} · ${g.quando}` : g.titulo,
      pagar: celulaDeValor('pagar', g.pagar), receber: celulaDeValor('receber', g.receber),
      saldo: celulaDeValor('saldo', g.saldo, { destacarNegativo: true }), contas: linhas,
    });
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
