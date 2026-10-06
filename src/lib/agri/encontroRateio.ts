/**
 * O ENCONTRO DE CONTAS DO RATEIO ADMINISTRATIVO — DRE-RATEIO-MODAL-01 (Gabriel, 06/10/2026).
 *
 * ⚠ AQUI SÓ SE LÊ. O total do administrativo, para onde ele foi, a soma das partes, a diferença e o mês a
 *   mês são do BANCO (`fn_painel_rateio_detalhe`, ramo admin: `resumo`, `por_mes`, `por_mes_total`). Este
 *   arquivo dá forma ao retorno e mais nada: nenhuma soma, nenhuma subtração, nenhum arredondamento.
 * ⚠ AUSENTE É `null`, NUNCA ZERO: fora do ramo admin a RPC devolve as três chaves nulas, e payload antigo
 *   nem as tem. Quem recebe `null` não desenha o encontro de contas.
 */

export type DestinoRateio = 'pecuaria' | 'agricultura' | 'silvicultura' | 'nao_alocado';

export interface ParteDoRateio {
  destino: DestinoRateio;
  valor: number;
  /** % do bruto, 1 casa — `null` quando o bruto é zero. */
  pct: number | null;
}

export interface SafraDoRateio {
  /** `null` = a linha "outras safras". */
  safraId: string | null;
  safra: string;
  valor: number;
  /** % do bruto, 1 casa — do banco, inclusive em "outras safras". */
  pct: number | null;
}

export interface MesDoRateio {
  anoMes: string;
  bruto: number;
  pecuaria: number;
  agricultura: number;
  silvicultura: number;
  naoAlocado: number;
  pctPecuaria: number | null;
  pctAgricultura: number | null;
  /** bruto − soma das parcelas do CRU, arredondada: a prova da conta (tem de ser 0). */
  diferenca: number;
  /** round(bruto) − soma das parcelas JÁ arredondadas: o centavo que sobra, à vista (fix1). */
  arredondamento: number;
  /** Só na lavoura com safra: a parte da safra aberta. */
  agriculturaSafra: number | null;
}

export interface EncontroRateio {
  bruto: number;
  partes: ParteDoRateio[];
  /** A soma das parcelas JÁ arredondadas — do banco. */
  soma: number;
  diferenca: number;
  /** round(bruto) − soma — do banco (fix1). Zero, ou os centavos do arredondamento de cada parcela. */
  arredondamento: number;
  /** `null` fora da lavoura com safra. */
  porSafra: SafraDoRateio[] | null;
  porMes: MesDoRateio[];
  total: Omit<MesDoRateio, 'anoMes'>;
}

const DESTINOS: readonly DestinoRateio[] = ['pecuaria', 'agricultura', 'silvicultura', 'nao_alocado'];

function objeto(v: unknown): Record<string, unknown> | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) o[k] = x;
  return o;
}
function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
}
const destinoDe = (v: unknown): DestinoRateio | null => DESTINOS.find(d => d === v) ?? null;

function mesDe(o: Record<string, unknown>): Omit<MesDoRateio, 'anoMes'> | null {
  const bruto = numero(o.bruto); const pecuaria = numero(o.pecuaria); const agricultura = numero(o.agricultura);
  const silvicultura = numero(o.silvicultura); const naoAlocado = numero(o.nao_alocado); const diferenca = numero(o.diferenca);
  const arredondamento = numero(o.arredondamento);
  if (bruto == null || pecuaria == null || agricultura == null || silvicultura == null || naoAlocado == null
    || diferenca == null || arredondamento == null) return null;
  return {
    bruto, pecuaria, agricultura, silvicultura, naoAlocado, diferenca, arredondamento,
    pctPecuaria: numero(o.pct_pecuaria), pctAgricultura: numero(o.pct_agricultura),
    agriculturaSafra: numero(o.agricultura_safra),
  };
}

/**
 * LÊ `resumo` + `por_mes` + `por_mes_total` DO RETORNO DA RPC. Qualquer peça que falte ou venha torta devolve
 * `null` inteiro: meio encontro de contas é pior que nenhum — a prova tem de fechar com o que está na tela.
 */
export function lerEncontroRateio(payload: unknown): EncontroRateio | null {
  const p = objeto(payload);
  const r = objeto(p?.resumo); const t = objeto(p?.por_mes_total);
  if (!p || !r || !t || !Array.isArray(p.por_mes) || !Array.isArray(r.partes)) return null;
  const bruto = numero(r.bruto); const soma = numero(r.soma); const diferenca = numero(r.diferenca);
  const arredondamento = numero(r.arredondamento);
  const total = mesDe(t);
  if (bruto == null || soma == null || diferenca == null || arredondamento == null || !total) return null;
  const partes: ParteDoRateio[] = [];
  for (const x of r.partes) {
    const o = objeto(x); const destino = destinoDe(o?.destino); const valor = numero(o?.valor);
    if (!o || !destino || valor == null) return null;
    partes.push({ destino, valor, pct: numero(o.pct) });
  }
  const porMes: MesDoRateio[] = [];
  for (const x of p.por_mes) {
    const o = objeto(x); const m = o ? mesDe(o) : null;
    if (!o || !m || typeof o.ano_mes !== 'string') return null;
    porMes.push({ anoMes: o.ano_mes, ...m });
  }
  let porSafra: SafraDoRateio[] | null = null;
  if (Array.isArray(r.agricultura_por_safra)) {
    porSafra = [];
    for (const x of r.agricultura_por_safra) {
      const o = objeto(x); const valor = numero(o?.valor);
      if (!o || valor == null) return null;
      porSafra.push({
        safraId: typeof o.safra_id === 'string' ? o.safra_id : null,
        safra: typeof o.safra === 'string' ? o.safra : '—', valor, pct: numero(o.pct),
      });
    }
  }
  return { bruto, partes, soma, diferenca, arredondamento, porSafra, porMes, total };
}

/** A parte de um destino no resumo, ou `null` se a RPC não a devolveu. */
export const parteDoDestino = (e: EncontroRateio, d: DestinoRateio): ParteDoRateio | null =>
  e.partes.find(x => x.destino === d) ?? null;

export const ROTULO_DESTINO: Record<DestinoRateio, string> = {
  pecuaria: 'Pecuária', agricultura: 'Agricultura', silvicultura: 'Silvicultura', nao_alocado: 'Não alocado',
};

/**
 * A PARTE DA ATIVIDADE MUDA DE UM MÊS PARA O OUTRO? — só COMPARA os % que o banco devolveu, nos meses com
 * administrativo. É o que acende a frase "a parte muda quando uma atividade começa ou termina no período".
 */
export function parteMudaNoPeriodo(e: EncontroRateio, atividade: 'pecuaria' | 'agricultura'): boolean {
  const pcts = e.porMes.filter(m => m.bruto !== 0)
    .map(m => (atividade === 'pecuaria' ? m.pctPecuaria : m.pctAgricultura));
  return pcts.some(p => p !== pcts[0]);
}
