/**
 * loteDeSugestoes — P124 (CONC-LOTE-SUGESTOES-01, Gabriel 28/10/2026; as 5 decisões aprovadas às 09:42).
 *
 * A sugestão de cada movimento em aberto do mês e o lote que concilia os escolhidos, NUMA régua só: a do motor que o AGRO já tem
 * (`fn_candidatos_conciliacao` — valor igual 70 pts, até 3 dias 20, descrição 10; pré-marca com ≥ 90 sem empate). A tela NÃO calcula
 * pontos: só lê o que o motor devolveu e agrupa.
 *   · exata    — o 1º candidato vivo vem PRÉ-MARCADO e sem empate (a certeza do motor): o lote o marca.
 *   · conferir — o 1º candidato tem ≥ 70 (valor igual) mas não é certeza, ou empata com outro (`empate`): fica desmarcado.
 *   · sem      — nenhum candidato vivo com ≥ 70: a linha oferece "procurar ›" (a estação, com a busca).
 * ⚠ BUSCAR é por GESTO (decisão 5): a varredura do mês saiu da abertura por tempo (PR-PALCO-SEM-MOTOR-01); aqui ela roda o motor de UM
 *   movimento por vez, 4 de cada vez, só quando o operador pede. "Não consegui perguntar" (erro) é outra resposta que "sem sugestão".
 * ⚠ GRAVAR é PAR A PAR pelo gravador de hoje (decisão 3: `vincularSelecao` → `fn_vincular_extrato_lancamento`): cada par responde ✓ ou
 *   a recusa do banco, e um recusado não para os outros.
 */
import { supabase } from '@/integrations/supabase/client';
import { lerCandidato, vincularSelecao, type CandidatoConciliacao } from '@/hooks/useConciliacaoDoMes';

export type BaldeDoLote = 'exata' | 'conferir' | 'sem';

export interface SugestaoDoLote {
  balde: BaldeDoLote;
  /** o 1º candidato vivo (o que a linha mostra); nulo em "sem" */
  candidato: CandidatoConciliacao | null;
  /** o motor marcou empate: dois candidatos quase iguais (fica em "conferir", nunca pré-marcado) */
  empate: boolean;
}

/** Os pontos do "valor igual" no motor: abaixo disso não há sugestão (só data ou descrição não bastam). */
export const PISO_DA_SUGESTAO = 70;

/** Agrupa a resposta do motor para UM movimento. Recebe a lista já na ordem do motor (score desc). */
export function classificarCandidatos(candidatos: readonly CandidatoConciliacao[]): SugestaoDoLote {
  const vivos = candidatos.filter((c) => !c.indisponivel);
  const top = vivos[0] ?? null;
  if (!top || (top.score ?? 0) < PISO_DA_SUGESTAO) return { balde: 'sem', candidato: null, empate: false };
  if (top.preMarcado && !top.ambiguo) return { balde: 'exata', candidato: top, empate: false };
  return { balde: 'conferir', candidato: top, empate: top.ambiguo };
}

export type RespostaDoMotor = { ok: true; sugestao: SugestaoDoLote } | { ok: false; erro: string };

/** O motor de UM movimento, com `p_limite 2` (o bastante para ver o empate). */
export async function sugestaoDoMovimento(clienteId: string, extratoId: string): Promise<RespostaDoMotor> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_candidatos_conciliacao', {
      p_cliente_id: clienteId, p_extrato_id: extratoId, p_limite: 2,
    });
    if (error) return { ok: false, erro: error.message ?? 'O banco não respondeu.' };
    return { ok: true, sugestao: classificarCandidatos((Array.isArray(data) ? data : []).map(lerCandidato)) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'O banco não respondeu.' };
  }
}

/** O mês: o motor de cada movimento, `paralelo` por vez; `aoAvancar(feitos, total)` a cada resposta. */
export async function buscarSugestoesDoMes(
  clienteId: string, extratoIds: readonly string[], aoAvancar?: (feitos: number, total: number) => void, paralelo = 4,
): Promise<Map<string, RespostaDoMotor>> {
  const saida = new Map<string, RespostaDoMotor>();
  let i = 0; let feitos = 0;
  const trabalhador = async () => {
    while (i < extratoIds.length) {
      const id = extratoIds[i++];
      saida.set(id, await sugestaoDoMovimento(clienteId, id));
      feitos += 1; aoAvancar?.(feitos, extratoIds.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(paralelo, extratoIds.length) }, trabalhador));
  return saida;
}

/** Quanto aplicar num par: o que falta no movimento, nunca mais que o livre do lançamento (as duas travas do gravador). */
export function valorDoPar(valorAbertoDoMovimento: number, candidato: Pick<CandidatoConciliacao, 'saldo'>): number {
  return Math.round(Math.min(Math.abs(valorAbertoDoMovimento), Math.abs(candidato.saldo)) * 100) / 100;
}

export interface ParDoLote { extratoId: string; lancamentoId: string; valor: number }
export interface ResultadoDoPar { extratoId: string; ok: boolean; erro: string | null }

/** Grava o lote PAR A PAR, em sequência; o recusado não para os outros. `aoAvancar` a cada par. */
export async function conciliarEmLote(
  pares: readonly ParDoLote[], aoAvancar?: (feitos: number, total: number) => void,
): Promise<ResultadoDoPar[]> {
  const out: ResultadoDoPar[] = [];
  for (const p of pares) {
    let r: { ok: boolean; erro: string | null };
    try { r = await vincularSelecao(p.extratoId, [{ lancamentoId: p.lancamentoId, valor: p.valor }], 'lote do mês'); }
    catch (e) { r = { ok: false, erro: e instanceof Error ? e.message : 'O banco não respondeu.' }; }
    out.push({ extratoId: p.extratoId, ok: r.ok, erro: r.ok ? null : (r.erro ?? 'O banco recusou.') });
    aoAvancar?.(out.length, pares.length);
  }
  return out;
}

/** "12 conciliados · 1 recusado: <a frase do banco>" — o resultado honesto, uma frase só. */
export function fraseDoResultado(r: readonly ResultadoDoPar[]): string {
  const ok = r.filter((x) => x.ok).length;
  const ruins = r.filter((x) => !x.ok);
  const a = `${ok} conciliado${ok === 1 ? '' : 's'}`;
  if (ruins.length === 0) return a;
  const motivos = [...new Set(ruins.map((x) => x.erro ?? 'recusado'))];
  return `${a} · ${ruins.length} recusado${ruins.length === 1 ? '' : 's'}: ${motivos.join('; ')}`;
}
