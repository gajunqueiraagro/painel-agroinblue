/**
 * FIN-CONTRATO-JUNTAR-01 (Gabriel 18/10/2026) — juntar dois cadastros do MESMO contrato: o leitor do retorno de
 * `fn_financiamento_juntar` / `fn_financiamento_juntar_desfazer` (migration 20261027201600) e os textos do diálogo.
 * NÃO FAZ CONTA: contratado, liberado, saldo e parcelas vêm prontos do banco (antes × depois). A divergência entre liberado e
 * contratado só é COMPARADA (ao centavo), nunca subtraída. Peça torta = leitura nula inteira.
 */
export interface ResumoDaJuncao { id: string; numero: string | null; status: string; contratado: number; liberado: number; saldo: number | null; parcelas: number }
export interface ResultadoDaJuncao {
  simulado: boolean; juncaoId: string | null;
  antes: { mantido: ResumoDaJuncao; absorvido: ResumoDaJuncao } | null;
  depois: ResumoDaJuncao | null;
  lancamentos: { cancelados: number; criados: number } | null;
  recusa: string | null;
}
export interface ResultadoDoDesfazerJuncao { simulado: boolean; mantido: ResumoDaJuncao | null; absorvido: ResumoDaJuncao | null; recusa: string | null }

class Torta extends Error {}
const obj = (v: unknown): Record<string, unknown> => { if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Torta(); return Object.fromEntries(Object.entries(v)); };
const n = (v: unknown): number => { const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; if (!Number.isFinite(x)) throw new Torta(); return x; };
const nOuNulo = (v: unknown): number | null => (v === null || v === undefined ? null : n(v));
const t = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : v === null || v === undefined ? null : (() => { throw new Torta(); })());
const tObrig = (v: unknown): string => { const x = t(v); if (x === null) throw new Torta(); return x; };
const resumo = (v: unknown): ResumoDaJuncao => {
  const o = obj(v);
  return { id: tObrig(o.id), numero: t(o.numero_contrato), status: tObrig(o.status), contratado: n(o.contratado), liberado: n(o.liberado),
    saldo: nOuNulo(o.saldo), parcelas: n(o.parcelas) };
};
const recusaDe = (v: unknown): string | null => (v === null || v === undefined ? null : tObrig(obj(v).frase));

export function lerResultadoDaJuncao(raw: unknown): ResultadoDaJuncao | null {
  try {
    const r = obj(raw);
    const recusa = recusaDe(r.recusa);
    if (recusa !== null) return { simulado: r.simulado === true, juncaoId: null, antes: null, depois: null, lancamentos: null, recusa };
    const a = obj(r.antes); const l = obj(r.lancamentos);
    return {
      simulado: r.simulado === true, juncaoId: t(r.juncao_id),
      antes: { mantido: resumo(a.mantido), absorvido: resumo(a.absorvido) }, depois: resumo(r.depois),
      lancamentos: { cancelados: n(l.cancelados), criados: n(l.criados) }, recusa: null,
    };
  } catch { return null; }
}

export function lerResultadoDoDesfazerJuncao(raw: unknown): ResultadoDoDesfazerJuncao | null {
  try {
    const r = obj(raw);
    const recusa = recusaDe(r.recusa);
    if (recusa !== null) return { simulado: r.simulado === true, mantido: null, absorvido: null, recusa };
    return { simulado: r.simulado === true, mantido: resumo(r.mantido), absorvido: resumo(r.absorvido), recusa: null };
  } catch { return null; }
}

/* ── textos ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** só contrato vigente junta (o banco recusa o resto; a tela não oferece) */
export const podeJuntar = (status: string | null): boolean => status === 'ativo' || status === 'prorrogado';
export const MOTIVO_JUNTAR_SO_VIGENTE = 'Só se junta contrato ativo ou prorrogado.';
export const DICA_DO_JUNTAR = 'O outro cadastro do mesmo contrato vira liberação deste: o contratado soma, o cronograma soma por vencimento e o outro fica cancelado ("juntado"). Desfaz-se pelo Histórico.';
export const SEM_CANDIDATO = 'Nenhum outro contrato vigente do mesmo credor e da mesma natureza.';

/** as linhas da comparação lado a lado: este · o absorvido · depois (os números do banco, sem conta) */
export const LINHAS_DA_COMPARACAO: readonly { chave: 'contratado' | 'liberado' | 'saldo' | 'parcelas'; rotulo: string }[] = [
  { chave: 'contratado', rotulo: 'Contratado' }, { chave: 'liberado', rotulo: 'Liberado' },
  { chave: 'saldo', rotulo: 'Saldo devedor' }, { chave: 'parcelas', rotulo: 'Parcelas' },
];
const cent = (v: number) => Math.round(v * 100);
/** liberado ≠ contratado, ao centavo: a divergência fica à vista (âmbar), nunca forçada */
export const liberadoDiverge = (r: ResumoDaJuncao): boolean => cent(r.liberado) !== cent(r.contratado);
export const fraseDosLancamentos = (l: { cancelados: number; criados: number }): string =>
  `${l.cancelados} lançamento(s) gerados saem (cancelados) · ${l.criados} nascem pelo motor no cronograma somado`;
export const fraseDaConfirmacao = (absorvido: ResumoDaJuncao, mantido: ResumoDaJuncao): string =>
  `${absorvido.numero || 'sem nº'} vira cancelado ("juntado ao ${mantido.numero || 'sem nº'}"); nada é apagado.`;
