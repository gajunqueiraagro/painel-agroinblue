/**
 * FIN-FINANC-28 · TELA DO CONTRATO v3 (Gabriel 18/10/2026) — o leitor de `fn_contrato_tela` (migration 20261027201100) e os textos da
 * tela. NÃO FAZ CONTA: totais, "entrou na conta", "a identificar", taxa a.a. e o "A resolver" vêm prontos do banco. Peça torta =
 * leitura nula inteira (nunca zeros inventados).
 */
export type TomDoPendente = 'vencido' | 'dado';
export type AcaoDoPendente = 'buscar_pagamento' | 'ver_liberacoes' | 'ver_cronograma' | 'anexar' | 'editar';
const ACOES: readonly AcaoDoPendente[] = ['buscar_pagamento', 'ver_liberacoes', 'ver_cronograma', 'anexar', 'editar'];

export interface PendenteDoContrato { chave: string; tom: TomDoPendente; texto: string; valor: number | null; acao: AcaoDoPendente; parcelaId: string | null }
export interface LiberacaoNaTela {
  id: string; data: string; forma: string; valor: number; destinacaoId: string | null; destino: string | null; lancamentoId: string | null;
  entrou: number | null; aIdentificar: number; excedente: number;
}
export interface PagamentoNaTela {
  data: string | null; tipo: 'parcela' | 'encargo'; item: string; principal: number; juros: number; encargos: number; total: number;
  conta: string | null; lancamentoId: string | null;
}
export interface EventoNaTela { data: string | null; evento: string; valor: number | null; juncaoId: string | null; desfazivel: boolean }
export interface MarcoDaLiberacao { data: string; aConfirmar: boolean }
export interface TelaDoContrato {
  condicoes: { taxa: number | null; unidade: string | null; taxaAa: number | null; sistema: string | null; carenciaAte: string | null; tipoTaxa: string | null; periodicidade: string | null };
  contrato: {
    dataContrato: string | null; vencimentoFinal: string | null; atividade: string | null; credor: string | null; credorDocumento: string | null;
    primeiraLiberacao: MarcoDaLiberacao | null; ultimaLiberacao: MarcoDaLiberacao | null; vencidas: number;
  };
  liberacoes: LiberacaoNaTela[];
  liberacoesTotal: { qtde: number; liberado: number; entrou: number; aIdentificar: number; excedente: number };
  pagamentos: PagamentoNaTela[];
  pagamentosTotal: { qtde: number; principal: number; juros: number; encargos: number; total: number };
  historico: EventoNaTela[];
  aResolver: PendenteDoContrato[];
}

class Torta extends Error {}
const obj = (v: unknown): Record<string, unknown> => { if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Torta(); return Object.fromEntries(Object.entries(v)); };
const lista = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw new Torta(); return v; };
const n = (v: unknown): number => { const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; if (!Number.isFinite(x)) throw new Torta(); return x; };
const nOuNulo = (v: unknown): number | null => (v === null || v === undefined ? null : n(v));
const t = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : v === null || v === undefined ? null : (() => { throw new Torta(); })());
const tObrig = (v: unknown): string => { const x = t(v); if (x === null) throw new Torta(); return x; };
const b = (v: unknown): boolean => { if (typeof v !== 'boolean') throw new Torta(); return v; };
const marco = (v: unknown): MarcoDaLiberacao | null => {
  if (v === null || v === undefined) return null;
  const o = obj(v); return { data: tObrig(o.data), aConfirmar: b(o.a_confirmar) };
};

export function lerTelaDoContrato(raw: unknown): TelaDoContrato | null {
  try {
    const r = obj(raw); const c = obj(r.condicoes); const k = obj(r.contrato); const lt = obj(r.liberacoes_total); const pt = obj(r.pagamentos_total);
    return {
      condicoes: { taxa: nOuNulo(c.taxa), unidade: t(c.unidade), taxaAa: nOuNulo(c.taxa_aa), sistema: t(c.sistema), carenciaAte: t(c.carencia_ate),
        tipoTaxa: t(c.tipo_taxa), periodicidade: t(c.periodicidade) },
      contrato: { dataContrato: t(k.data_contrato), vencimentoFinal: t(k.vencimento_final), atividade: t(k.atividade), credor: t(k.credor),
        credorDocumento: t(k.credor_documento), primeiraLiberacao: marco(k.primeira_liberacao), ultimaLiberacao: marco(k.ultima_liberacao), vencidas: n(k.vencidas) },
      liberacoes: lista(r.liberacoes).map((x) => { const o = obj(x); return {
        id: tObrig(o.id), data: tObrig(o.data), forma: tObrig(o.forma), valor: n(o.valor), destinacaoId: t(o.destinacao_id), destino: t(o.destino),
        lancamentoId: t(o.lancamento_id), entrou: nOuNulo(o.entrou), aIdentificar: n(o.a_identificar), excedente: n(o.excedente) }; }),
      liberacoesTotal: { qtde: n(lt.qtde), liberado: n(lt.liberado), entrou: n(lt.entrou), aIdentificar: n(lt.a_identificar), excedente: n(lt.excedente) },
      pagamentos: lista(r.pagamentos).map((x) => { const o = obj(x); const tipo = o.tipo === 'encargo' ? 'encargo' : o.tipo === 'parcela' ? 'parcela' : (() => { throw new Torta(); })(); return {
        data: t(o.data), tipo, item: tObrig(o.item), principal: n(o.principal), juros: n(o.juros), encargos: n(o.encargos), total: n(o.total),
        conta: t(o.conta), lancamentoId: t(o.lancamento_id) }; }),
      pagamentosTotal: { qtde: n(pt.qtde), principal: n(pt.principal), juros: n(pt.juros), encargos: n(pt.encargos), total: n(pt.total) },
      historico: lista(r.historico).map((x) => { const o = obj(x); return { data: t(o.data), evento: tObrig(o.evento), valor: nOuNulo(o.valor),
        juncaoId: t(o.juncao_id), desfazivel: o.desfazivel === true }; }),
      aResolver: lista(r.a_resolver).map((x) => { const o = obj(x);
        const acao = ACOES.find((a) => a === o.acao); if (!acao) throw new Torta();
        const tom: TomDoPendente = o.tom === 'vencido' ? 'vencido' : o.tom === 'dado' ? 'dado' : (() => { throw new Torta(); })();
        return { chave: tObrig(o.chave), tom, texto: tObrig(o.texto), valor: nOuNulo(o.valor), acao, parcelaId: t(o.parcela_id) }; }),
    };
  } catch { return null; }
}

/* ── textos ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const NAO_CADASTRADO = 'não cadastrado';
export const ROTULO_DA_ACAO: Record<AcaoDoPendente, string> = {
  buscar_pagamento: 'Buscar pagamento', ver_liberacoes: 'Ver liberações', ver_cronograma: 'Ver cronograma', anexar: 'Anexar', editar: 'Editar',
};
const SISTEMAS: Record<string, string> = { sac: 'SAC', price: 'Price', bullet: 'Parcela única', livre: 'Personalizado' };
const ATIVIDADES: Record<string, string> = { pecuaria: 'Pecuária', agricultura: 'Agricultura' };
export const ROTULO_DA_SITUACAO: Record<string, string> = {
  ativo: 'Ativo', quitado: 'Quitado', rolado: 'Rolado', prorrogado: 'Prorrogado', cancelado: 'Cancelado',
};
const pct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const dataBr = (iso: string | null): string | null => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);
/** "0,6821 % a.m." — a gravada, com a unidade; nulo = não cadastrado */
export const textoDaTaxa = (c: TelaDoContrato['condicoes']): string | null => (c.taxa === null || c.unidade === null ? null : `${pct(c.taxa)} % ${c.unidade}`);
export const textoDaTaxaAa = (c: TelaDoContrato['condicoes']): string | null => (c.taxaAa === null ? null : `${pct(c.taxaAa)} % a.a.`);
export const textoDoSistema = (s: string | null): string | null => (s === null ? null : SISTEMAS[s] ?? s);
export const textoDaCarencia = (iso: string | null): string | null => (iso === null ? null : `até ${dataBr(iso)}`);
export const textoDaAtividade = (a: string | null): string | null => (a === null ? null : ATIVIDADES[a] ?? a);
export const textoDasVencidas = (n: number): string | null => (n <= 0 ? null : n === 1 ? '1 parcela vencida' : `${n} parcelas vencidas`);
