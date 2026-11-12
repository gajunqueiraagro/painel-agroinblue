/**
 * CONC-CUSTEIO-FONTE-01 ajuste (Chat 12/11 08:55, régua UI-LARGURA-COLUNAS) — no "Relatório de custeio", Grupo › subgrupo e Conta do plano
 * têm a largura do MAIOR texto da lista (com piso e teto); a Descrição fica com a sobra e, se ainda não couber, quebra — nunca corta.
 * O texto de cada coluna é UMA função: a linha da tabela e a medida usam a mesma.
 */
export const textoDoGrupo = (it: { familia_raw: string; subfamilia_raw: string }) => `${it.familia_raw} › ${it.subfamilia_raw}`;
export const textoDaConta = (s: { subcentro: string; fornecedorNome?: string } | undefined) =>
  s ? `${s.subcentro || '—'}${s.fornecedorNome ? ` · ${s.fornecedorNome}` : ''}` : '—';

/** a largura da coluna = o maior texto medido + a folga do padding, entre o piso (o cabeçalho cabe) e o teto (a Descrição ainda respira) */
export function larguraPeloMaior(textos: readonly string[], medir: (t: string) => number, e: { piso: number; teto: number; folga?: number }): number {
  const maior = textos.reduce((m, t) => Math.max(m, medir(t)), 0);
  return Math.min(e.teto, Math.max(e.piso, Math.ceil(maior) + (e.folga ?? 12)));
}

let contexto: CanvasRenderingContext2D | null | undefined;
/** a medida do texto a 10px (a fonte da régua); sem canvas (teste), 0,6 da fonte por letra */
export function medirA10px(texto: string): number {
  if (contexto === undefined) contexto = typeof document === 'undefined' ? null : document.createElement('canvas').getContext?.('2d') ?? null;
  if (!contexto) return texto.length * 6;
  contexto.font = `400 10px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
  return contexto.measureText(texto).width;
}
