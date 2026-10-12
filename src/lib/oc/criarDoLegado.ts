/**
 * OC-CRIAR-DO-LEGADO-01 — as regras de TELA de "Criar OC a partir deste lancamento". A regra que grava mora no banco
 * (`oc_criar_do_legado`, com os erros primarios e o rateio em centavos; `_oc_legado_motivo_recebimento`); aqui ficam so' o que a
 * tela decide antes de perguntar: quando a acao aparece, as cabecas lidas da descricao, o pre-marcado das saidas e a ordem das
 * parcelas irmas. E a leitura dos envelopes, sem cast.
 */
import { POR_CATEGORIA, SUBCENTRO_VENDA_BOITEL } from '@/lib/financeiro/subcentroVenda';
import { SUBCENTRO_PRINCIPAL_COMPRA_FEMEAS, SUBCENTRO_PRINCIPAL_COMPRA_MACHOS } from '@/hooks/useOperacaoLiquidacao';
import { lerContaCorrente, type ContaCorrente } from '@/lib/oc/contaCorrente';

/** Contas de venda de gado em que a acao aparece (1110-1140). Boitel (1150) fica de fora (D3). */
export const CONTAS_VENDA_GADO: ReadonlySet<string> = new Set(
  Object.values(POR_CATEGORIA).filter(c => c !== SUBCENTRO_VENDA_BOITEL),
);

/**
 * OC-CRIAR-DO-LEGADO-COMPRA-01 — contas de compra de gado em que a acao aparece. As duas constantes sao do dono
 * (`useOperacaoLiquidacao.ts`, espelho de `_oc_subcentro_compra` no banco): aqui nao se escreve o nome da conta.
 */
export const CONTAS_COMPRA_GADO: ReadonlySet<string> = new Set([SUBCENTRO_PRINCIPAL_COMPRA_FEMEAS, SUBCENTRO_PRINCIPAL_COMPRA_MACHOS]);

/** O lado da OC que nasce do legado. Vem do LANCAMENTO (D1): entrada em conta de venda = venda; saida em conta de compra = compra. */
export type LadoDoLegado = 'venda' | 'compra';

export interface LancamentoCandidato {
  tipo_operacao?: string | null;
  subcentro?: string | null;
  cancelado?: boolean | null;
  origem_lancamento?: string | null;
  sem_movimentacao_caixa?: boolean | null;
  status_transacao?: string | null;
  conciliado_em?: string | null;
}

/** Recebido (ou pago) de verdade: realizado, conciliado ou com data de conciliacao — o mesmo teste de `_oc_legado_motivo_recebimento`. */
function jaRecebido(l: LancamentoCandidato): boolean {
  return l.status_transacao === 'realizado' || l.status_transacao === 'conciliado' || !!l.conciliado_em;
}

/**
 * O lado que o lancamento pede, ou nulo quando a combinacao nao vale (entrada em conta de compra, saida em conta de venda,
 * transferencia, conta fora das duas listas). Espelho de `_oc_legado_motivo_recebimento` no banco, que recusa o resto.
 */
export function ladoDoLancamento(l: Pick<LancamentoCandidato, 'tipo_operacao' | 'subcentro'>): LadoDoLegado | null {
  if (!l.subcentro) return null;
  if (l.tipo_operacao === '1-Entradas' && CONTAS_VENDA_GADO.has(l.subcentro)) return 'venda';
  if (l.tipo_operacao === '2-Saídas' && CONTAS_COMPRA_GADO.has(l.subcentro)) return 'compra';
  return null;
}

/**
 * A acao "Criar OC a partir deste lancamento" so' aparece onde o banco aceitaria o recebimento / pagamento. Espelho da regra do banco.
 * OC-CRIAR-DO-LEGADO-01b: o lancamento do MODAL ANTIGO (origem 'movimentacao_rebanho') entra quando ja' RECEBIDO — a criacao
 * adota a saida dele, nunca cria gado. Programado/agendado fica de fora: "Receba primeiro".
 * OC-CRIAR-DO-LEGADO-COMPRA-01: o mesmo vale para a compra ("Pague primeiro"); o lado sai de `ladoDoLancamento`.
 */
export function podeCriarOCDoLegado(l: LancamentoCandidato, temOC: boolean): boolean {
  return !temOC
    && ladoDoLancamento(l) !== null
    && l.cancelado !== true
    && l.sem_movimentacao_caixa !== true
    && (l.origem_lancamento !== 'movimentacao_rebanho' || jaRecebido(l));
}

/**
 * O que ja' vem marcado ao abrir a criacao. OC-CRIAR-DO-LEGADO-01b (decisao 3): a saida do PROPRIO lancamento
 * (`movimentacao_rebanho_id`, o modal antigo) vence — ela e' conhecida, nao se adivinha. Sem ela (ou fora das sugestoes),
 * a combinacao unica que fecha as cabecas da descricao, como antes (D4).
 */
export function saidasPreMarcadas(
  saidas: readonly SaidaCandidata[], saidaDoLancamento: string | null | undefined, cabecas: number | null,
): string[] | null {
  if (saidaDoLancamento && saidas.some(s => s.id === saidaDoLancamento)) return [saidaDoLancamento];
  /* OC-CRIAR-DO-LEGADO-01c: sem o filtro de fazenda a lista traz saidas de OUTROS compradores; a combinacao procura primeiro
     entre as que parecem com o comprador (destino ~ favorecido) e so' depois entre todas — para nao fechar as cabecas com o gado
     de outra venda. */
  return combinacaoUnica(saidas.filter(pareceComComprador), cabecas) ?? combinacaoUnica(saidas, cabecas);
}

/** Cabecas citadas na descricao: o primeiro numero seguido de palavra ("Venda 315 Desmama M - 1/2" -> 315). Ano nao conta. */
export function cabecasDaDescricao(descricao: string | null | undefined): number | null {
  const m = (descricao ?? '').toLowerCase().match(/(?<![\d/.,])(\d{1,4})\s*(?:cab|[a-zçãéêíóú])/);
  if (!m) return null;
  const n = Number(m[1]);
  if (/^(19|20)\d\d$/.test(m[1]) || n <= 0) return null;
  return n;
}

export interface SaidaCandidata {
  id: string;
  data: string;
  categoria: string | null;
  quantidade: number;
  peso_medio_kg: number | null;
  valor: number | null;
  origem_registro: string | null;
  fornecedor_id: string | null;
  /** OC-CRIAR-DO-LEGADO-01c: a fazenda de onde o gado SAIU (pode diferir da do lancamento financeiro). */
  fazenda_id?: string | null;
  fazenda_nome?: string | null;
  /** O destino digitado na saida (texto livre: comprador, fazenda ou apelido). */
  destino?: string | null;
  /** Semelhanca (trigram, 0-1) entre o destino e o favorecido do recebimento — calculada no banco. */
  semelhanca?: number | null;
}

/**
 * OC-CRIAR-DO-LEGADO-01c (decisao do Gabriel): o destino ORDENA, nao filtra. A partir de 0,3 a saida "parece com o comprador".
 * ⚠ POR QUE NAO FILTRA: nas 62 saidas ja' escolhidas em 38 OCs do legado, filtrar por destino ~ favorecido esconderia de 22
 *   (trigram >= 0,3) a 46 (nome igual) — o destino e' texto livre: fazenda ("Faz. Eldorado II"), apelido ("Valtinho") ou vazio.
 */
export const SEMELHANCA_MINIMA = 0.3;
/* OC-CRIAR-DO-LEGADO-COMPRA-01: o nome ficou (uma funcao so', sem gemea). Na COMPRA a "saida candidata" e' a ENTRADA de compra,
   `destino` carrega a fazenda de ORIGEM do gado e a semelhanca e' com o FORNECEDOR — a contraparte, nos dois lados. */
export const pareceComComprador = (s: Pick<SaidaCandidata, 'semelhanca'>) => (s.semelhanca ?? 0) >= SEMELHANCA_MINIMA;

/** As parecidas com o comprador primeiro; dentro de cada grupo, por data (e id, para ser estavel). */
export function ordenarSaidas(saidas: readonly SaidaCandidata[]): SaidaCandidata[] {
  return [...saidas].sort((a, b) => Number(pareceComComprador(b)) - Number(pareceComComprador(a))
    || a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
}

export type FazendaDasMarcadas =
  | { tipo: 'nenhuma' }
  | { tipo: 'uma'; fazendaId: string | null; fazenda: string | null }
  | { tipo: 'mistas'; fazendas: string[] };

/**
 * A fazenda da OC e' a do GADO: a das saidas marcadas (o banco decide igual, em `oc_criar_do_legado`). Mais de uma = mistura, que o
 * banco recusa; a tela diz antes, com os nomes.
 */
export function fazendaDasMarcadas(marcadas: readonly SaidaCandidata[]): FazendaDasMarcadas {
  if (marcadas.length === 0) return { tipo: 'nenhuma' };
  const porId = new Map<string, string | null>();
  for (const s of marcadas) porId.set(s.fazenda_id ?? '', s.fazenda_nome ?? null);
  if (porId.size > 1) return { tipo: 'mistas', fazendas: [...porId.values()].map(n => n ?? 'sem fazenda').sort((a, b) => a.localeCompare(b)) };
  const [[id, nome]] = [...porId.entries()];
  return { tipo: 'uma', fazendaId: id || null, fazenda: nome };
}

/** O zootecnico marcado contra o recebido, em centavos: "bate" ou a diferenca (marcadas − recebido). Informacao, nao bloqueio. */
export function confrontoComRecebido(somaMarcadas: number, somaRecebida: number): { bate: boolean; diferenca: number } {
  const d = Math.round(somaMarcadas * 100) - Math.round(somaRecebida * 100);
  return { bate: d === 0, diferenca: d / 100 };
}

/**
 * O pre-marcado (D4): as saidas cuja soma de cabecas FECHA o numero da descricao, se e so' se ha' UMA combinacao que fecha.
 * Mais de uma, ou nenhuma: nada pre-marcado — o operador marca. Busca ate' 6 saidas entre as 16 primeiras por data.
 */
export function combinacaoUnica(saidas: readonly SaidaCandidata[], alvo: number | null): string[] | null {
  if (!alvo) return null;
  const cs = [...saidas].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id)).slice(0, 16);
  const achadas: string[][] = [];
  const buscar = (inicio: number, soma: number, atual: string[]) => {
    if (achadas.length > 1) return;
    if (soma === alvo && atual.length > 0) { achadas.push([...atual]); return; }
    if (soma > alvo || atual.length >= 6) return;
    for (let i = inicio; i < cs.length; i++) {
      atual.push(cs[i].id);
      buscar(i + 1, soma + cs[i].quantidade, atual);
      atual.pop();
    }
  };
  buscar(0, 0, []);
  return achadas.length === 1 ? achadas[0] : null;
}

export interface RecebimentoResumo {
  id: string;
  data: string;
  valor: number;
  descricao: string | null;
  conta: string | null;
  favorecidoId?: string | null;
  favorecido?: string | null;
  fazendaId?: string | null;
  fazenda?: string | null;
  motivo?: string | null;
}

/** Tronco da descricao sem a marca de parcela ("Venda 315 Desmama M - 1/2" -> "venda 315 desmama m"). */
function troncoDaParcela(descricao: string | null): string | null {
  const m = (descricao ?? '').match(/^(.*?)[\s\-–]*\b\d{1,2}\s*\/\s*\d{1,2}\b\s*$/);
  return m ? m[1].trim().toLowerCase() : null;
}

/** D6: "Somar outro recebimento" lista PRIMEIRO as parcelas irmas ("n/m" da mesma venda); depois o resto, por data. */
export function ordenarIrmas(irmas: readonly RecebimentoResumo[], base: string | null): RecebimentoResumo[] {
  const tronco = troncoDaParcela(base);
  const ehIrma = (r: RecebimentoResumo) => !!tronco && troncoDaParcela(r.descricao) === tronco;
  return [...irmas].sort((a, b) => Number(ehIrma(b)) - Number(ehIrma(a)) || a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
}

/* ── leitura dos envelopes do banco, sem cast ── */
const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => { const n = Number(v); return v === null || v === undefined || !Number.isFinite(n) ? null : n; };

export interface Sugestoes { tipo: LadoDoLegado; recebimentos: RecebimentoResumo[]; irmas: RecebimentoResumo[]; saidas: SaidaCandidata[] }
/** O lado vem do envelope do banco; envelope antigo (sem a chave) e' venda, como sempre foi. */
const lado = (v: unknown): LadoDoLegado => (v === 'compra' ? 'compra' : 'venda');

function lerRecebimento(v: unknown): RecebimentoResumo {
  const r = obj(v);
  return { id: String(r.id ?? ''), data: String(r.data ?? ''), valor: num(r.valor) ?? 0, descricao: txt(r.descricao),
    conta: txt(r.conta), favorecidoId: txt(r.favorecido_id), favorecido: txt(r.favorecido), fazendaId: txt(r.fazenda_id),
    fazenda: txt(r.fazenda), motivo: txt(r.motivo) };
}

export function lerSugestoes(raw: unknown): Sugestoes {
  const r = obj(raw);
  return {
    tipo: lado(r.tipo),
    recebimentos: lista(r.recebimentos).map(lerRecebimento),
    irmas: lista(r.irmas).map(lerRecebimento),
    saidas: lista(r.saidas).map((v) => {
      const s = obj(v);
      return { id: String(s.id ?? ''), data: String(s.data ?? ''), categoria: txt(s.categoria), quantidade: num(s.quantidade) ?? 0,
        peso_medio_kg: num(s.peso_medio_kg), valor: num(s.valor), origem_registro: txt(s.origem_registro), fornecedor_id: txt(s.fornecedor_id),
        fazenda_id: txt(s.fazenda_id), fazenda_nome: txt(s.fazenda_nome), destino: txt(s.destino), semelhanca: num(s.semelhanca) };
    }),
  };
}

export interface LoteCriado { ordem: number; categoria: string | null; quantidade: number; peso: number | null; valor: number }
export interface ResultadoCriar {
  ok: boolean;
  simulado: boolean;
  /** O tipo da OC criada, como o banco o derivou do lancamento. Nulo na recusa (o envelope de pendencias nao o traz). */
  tipo: LadoDoLegado | null;
  operacaoId: string | null;
  pendencias: string[];
  total: number | null;
  lotes: LoteCriado[];
  contaCorrente: ContaCorrente | null;
}

export function lerResultado(raw: unknown): ResultadoCriar {
  const r = obj(raw);
  return {
    ok: r.ok === true,
    simulado: r.simulado === true,
    tipo: r.tipo === 'compra' || r.tipo === 'venda' ? r.tipo : null,
    operacaoId: txt(r.operacao_id),
    pendencias: lista(r.pendencias).map(String),
    total: num(r.total),
    lotes: lista(r.lotes).map((v) => {
      const l = obj(v);
      return { ordem: num(l.ordem) ?? 0, categoria: txt(l.categoria_negociada), quantidade: num(l.qtd_negociada) ?? 0,
        peso: num(l.peso_medio_negociado_kg), valor: num(l.valor_informado) ?? 0 };
    }),
    contaCorrente: r.conta_corrente ? lerContaCorrente(r.conta_corrente) : null,
  };
}

/** R$/kg derivado do lote (criterio 'total'): so' com peso; sem peso, "—" (D1). */
export function precoPorKg(l: LoteCriado): number | null {
  if (!l.peso || l.peso <= 0 || l.quantidade <= 0) return null;
  return Math.round((l.valor / (l.peso * l.quantidade)) * 100) / 100;
}

/* ── OC-CRIAR-DO-LEGADO-COMPRA-01: os textos do dialogo, por lado. Venda e compra sao a mesma operacao espelhada: o dialogo e'
   UM e so' le^ daqui (nenhum `if` de lado espalhado pelos rotulos). Os da venda sao os de sempre, letra por letra. ── */
export interface TextosDoLado {
  nome: string;
  secaoFinanceiro: string; dicaFinanceiro: string; somar: string; semIrmas: string;
  dicaDados: string; contraparte: string; escolhaContraparte: string;
  fazendaUma: string; fazendaNenhuma: string; movimentosMarcados: string; gadoFez: string;
  tipo: string; rotuloData: string; primeiraMarcada: string;
  valor: string; total: string;
  opcaoFinanceiro: (soma: string) => string; opcaoZootecnico: (soma: string) => string;
  secaoGado: string; dicaGado: string; colunaLugar: string; semGado: string; marcar: string; semelhanca: string;
  financeiroCurto: string; colunaEntrega: string; colunaCaixa: string; eventoEntrega: string; eventoCaixa: string;
  noDre: string; tituloCriar: string;
  /** D4: a chave do criterio que a RPC recebe, espelhada na compra. */
  criterio: Record<'recebimentos' | 'saidas' | 'outro', string>;
}

export const TEXTOS_DO_LADO: Record<LadoDoLegado, TextosDoLado> = {
  venda: {
    nome: 'Venda',
    secaoFinanceiro: 'Recebimentos desta venda', dicaFinanceiro: 'o lançamento escolhido; dá para somar outros do mesmo comprador',
    somar: '+ Somar outro recebimento', semIrmas: 'Nenhum outro recebimento do mesmo comprador, fazenda e conta de venda.',
    dicaDados: 'preenchido pelo que o legado tem; confira o comprador', contraparte: 'Comprador', escolhaContraparte: 'Escolha o comprador do cadastro.',
    fazendaUma: 'fazenda das saídas marcadas', fazendaNenhuma: 'vem das saídas marcadas', movimentosMarcados: 'As saídas marcadas', gadoFez: 'gado saiu da',
    tipo: 'Venda · modelo conta corrente · nasce concluída, com a entrega encerrada', rotuloData: 'Data da venda', primeiraMarcada: 'primeira saída marcada',
    valor: 'Valor da venda', total: 'Total da venda',
    opcaoFinanceiro: soma => `Total dos recebimentos do financeiro (${soma}), rateado pelas saídas — a OC nasce com saldo zero`,
    opcaoZootecnico: soma => `Valor das saídas do zootécnico (${soma}) — a diferença vira saldo da OC`,
    secaoGado: 'Saídas de gado sugeridas',
    dicaGado: 'venda, sem OC, de 60 dias antes a 120 dias depois do pagamento, em qualquer fazenda do cliente · destino parecido com o comprador primeiro',
    colunaLugar: 'Destino', semGado: 'Nenhuma saída de venda sem OC na janela.', marcar: 'Marcar saída de', semelhanca: 'semelhança com o comprador',
    financeiroCurto: 'recebido', colunaEntrega: 'Entrega (DRE)', colunaCaixa: 'Recebido (caixa)', eventoEntrega: 'Entrega', eventoCaixa: 'Recebimento',
    noDre: 'Receita no DRE', tituloCriar: 'Cria a OC concluída, com as entregas e os recebimentos ligados',
    criterio: { recebimentos: 'recebimentos', saidas: 'saidas', outro: 'outro' },
  },
  compra: {
    nome: 'Compra',
    secaoFinanceiro: 'Pagamentos desta compra', dicaFinanceiro: 'o lançamento escolhido; dá para somar outros do mesmo fornecedor',
    somar: '+ Somar outro pagamento', semIrmas: 'Nenhum outro pagamento do mesmo fornecedor, fazenda e conta de compra.',
    dicaDados: 'preenchido pelo que o legado tem; confira o fornecedor', contraparte: 'Fornecedor', escolhaContraparte: 'Escolha o fornecedor do cadastro.',
    fazendaUma: 'fazenda das entradas marcadas', fazendaNenhuma: 'vem das entradas marcadas', movimentosMarcados: 'As entradas marcadas', gadoFez: 'gado entrou na',
    tipo: 'Compra · modelo conta corrente · nasce concluída, com a entrega encerrada', rotuloData: 'Data da compra', primeiraMarcada: 'primeira entrada marcada',
    valor: 'Valor da compra', total: 'Total da compra',
    opcaoFinanceiro: soma => `Total dos pagamentos do financeiro (${soma}), rateado pelas entradas — a OC nasce com saldo zero`,
    opcaoZootecnico: soma => `Valor das entradas do zootécnico (${soma}) — a diferença vira saldo da OC`,
    secaoGado: 'Entradas de gado',
    dicaGado: 'compra, sem OC, de 60 dias antes a 120 dias depois do pagamento, em qualquer fazenda do cliente · origem parecida com o fornecedor primeiro',
    colunaLugar: 'Origem', semGado: 'Nenhuma entrada de compra sem OC na janela.', marcar: 'Marcar entrada de', semelhanca: 'semelhança com o fornecedor',
    financeiroCurto: 'pago', colunaEntrega: 'Entrada (DRE)', colunaCaixa: 'Pago (caixa)', eventoEntrega: 'Entrada', eventoCaixa: 'Pagamento',
    noDre: 'Custo no DRE', tituloCriar: 'Cria a OC concluída, com as entradas e os pagamentos ligados',
    criterio: { recebimentos: 'pagamentos', saidas: 'entradas', outro: 'outro' },
  },
};
