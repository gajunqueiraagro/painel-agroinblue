/**
 * OC-CRIAR-DO-LEGADO-01 — as regras de TELA de "Criar OC a partir deste lancamento". A regra que grava mora no banco
 * (`oc_criar_do_legado`, com os erros primarios e o rateio em centavos; `_oc_legado_motivo_recebimento`); aqui ficam so' o que a
 * tela decide antes de perguntar: quando a acao aparece, as cabecas lidas da descricao, o pre-marcado das saidas e a ordem das
 * parcelas irmas. E a leitura dos envelopes, sem cast.
 */
import { POR_CATEGORIA, SUBCENTRO_VENDA_BOITEL } from '@/lib/financeiro/subcentroVenda';
import { lerContaCorrente, type ContaCorrente } from '@/lib/oc/contaCorrente';

/** Contas de venda de gado em que a acao aparece (1110-1140). Boitel (1150) fica de fora (D3). */
export const CONTAS_VENDA_GADO: ReadonlySet<string> = new Set(
  Object.values(POR_CATEGORIA).filter(c => c !== SUBCENTRO_VENDA_BOITEL),
);

export interface LancamentoCandidato {
  tipo_operacao?: string | null;
  subcentro?: string | null;
  cancelado?: boolean | null;
  origem_lancamento?: string | null;
  sem_movimentacao_caixa?: boolean | null;
}

/** A acao "Criar OC a partir deste lancamento" so' aparece onde o banco aceitaria o recebimento. Espelho da regra do banco. */
export function podeCriarOCDoLegado(l: LancamentoCandidato, temOC: boolean): boolean {
  return !temOC
    && l.tipo_operacao === '1-Entradas'
    && l.cancelado !== true
    && l.sem_movimentacao_caixa !== true
    && l.origem_lancamento !== 'movimentacao_rebanho'
    && !!l.subcentro && CONTAS_VENDA_GADO.has(l.subcentro);
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

export interface Sugestoes { recebimentos: RecebimentoResumo[]; irmas: RecebimentoResumo[]; saidas: SaidaCandidata[] }

function lerRecebimento(v: unknown): RecebimentoResumo {
  const r = obj(v);
  return { id: String(r.id ?? ''), data: String(r.data ?? ''), valor: num(r.valor) ?? 0, descricao: txt(r.descricao),
    conta: txt(r.conta), favorecidoId: txt(r.favorecido_id), favorecido: txt(r.favorecido), fazendaId: txt(r.fazenda_id),
    fazenda: txt(r.fazenda), motivo: txt(r.motivo) };
}

export function lerSugestoes(raw: unknown): Sugestoes {
  const r = obj(raw);
  return {
    recebimentos: lista(r.recebimentos).map(lerRecebimento),
    irmas: lista(r.irmas).map(lerRecebimento),
    saidas: lista(r.saidas).map((v) => {
      const s = obj(v);
      return { id: String(s.id ?? ''), data: String(s.data ?? ''), categoria: txt(s.categoria), quantidade: num(s.quantidade) ?? 0,
        peso_medio_kg: num(s.peso_medio_kg), valor: num(s.valor), origem_registro: txt(s.origem_registro), fornecedor_id: txt(s.fornecedor_id) };
    }),
  };
}

export interface LoteCriado { ordem: number; categoria: string | null; quantidade: number; peso: number | null; valor: number }
export interface ResultadoCriar {
  ok: boolean;
  simulado: boolean;
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
