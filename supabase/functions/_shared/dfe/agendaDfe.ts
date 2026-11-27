/**
 * NOTAS-RECEITA-AGENDA-01 · F2 — a RODADA da agenda da Receita (plano aprovado pelo Gabriel 27/11): o pg_cron chama a borda
 * `fiscal-dfe-agenda` a cada 5 min; ela pede ao banco quem está DEVIDO (`_fn_fiscal_dfe_devidos`: todo titular com certificado ativo e
 * válido, de todo cliente, quando o `nao_antes_de` deixa e sem pausa) e chama a busca de sempre (`fiscal-dfe-buscar`, service_role)
 * UM TITULAR POR VEZ. A busca continua dona da espera, do NSU, do registro e da ciência automática: aqui não há regra nova de Receita.
 * Pura: o banco e a rede entram por `PecasDaAgenda` (provada no vitest).
 *
 * PAUSA SOZINHA (o titular sai dos devidos até a data, ou até subir outro certificado — o gatilho do certificado limpa):
 *   recusa 'cadeia'                          → 'cadeia', até subir outro certificado
 *   recusa 'certificado'/'impressao_diferente' → 'certificado', até subir outro certificado
 *   502 com "lambda: tempo"                   → 'lambda_tempo', 6 h
 * O 656 NÃO pausa aqui: a própria busca grava o `nao_antes_de` (1 h) e o banco segura o mesmo CPF/CNPJ.
 * ORÇAMENTO: a borda tem 150 s; uma busca leva até ~100 s (40 s da Receita + a ciência). Só COMEÇA um titular novo nos primeiros 25 s.
 */
export interface DevidoDaAgenda { titularId: string; clienteId: string; nuncaBuscou: boolean }
export interface RespostaDaBusca { status: number; corpo: Record<string, unknown> }
export type MotivoDaPausa = 'lambda_tempo' | 'cadeia' | 'certificado';
export interface PecasDaAgenda {
  devidos(limite: number): Promise<DevidoDaAgenda[]>;
  buscar(titularId: string): Promise<RespostaDaBusca>;
  pausar(d: DevidoDaAgenda, motivo: MotivoDaPausa, ateIso: string | null, detalhe: string): Promise<void>;
  agoraMs(): number;
}
export interface ResultadoDoTitular { titularId: string; status: number; cstat: string | null; recusa: string | null; pausa: MotivoDaPausa | null }
export interface ResultadoDaRodada { devidos: number; buscados: ResultadoDoTitular[]; deixados: number; erro: string | null }

export const LIMITE_POR_RODADA = 5;
export const COMECAR_ATE_MS = 25_000;
export const PAUSA_LAMBDA_MS = 6 * 3600_000;

const txt = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);

/** a pausa que a resposta da busca pede (null = nenhuma) */
export function pausaDaResposta(r: RespostaDaBusca, agoraMs: number): { motivo: MotivoDaPausa; ate: string | null; detalhe: string } | null {
  const recusa = txt(r.corpo.recusa);
  if (recusa === 'cadeia') return { motivo: 'cadeia', ate: null, detalhe: 'A cadeia do certificado não fecha até a raiz ICP-Brasil.' };
  if (recusa === 'certificado' || recusa === 'impressao_diferente') return { motivo: 'certificado', ate: null, detalhe: 'O certificado guardado não abriu.' };
  const erro = `${txt(r.corpo.erro) ?? ''} ${txt(r.corpo.frase) ?? ''}`.toLowerCase();
  if (r.status === 502 && erro.includes('lambda: tempo')) {
    return { motivo: 'lambda_tempo', ate: new Date(agoraMs + PAUSA_LAMBDA_MS).toISOString(), detalhe: 'A ponte da Receita passou do tempo (lambda: tempo).' };
  }
  return null;
}

export async function rodadaDaAgenda(pecas: PecasDaAgenda, limite = LIMITE_POR_RODADA): Promise<ResultadoDaRodada> {
  const inicio = pecas.agoraMs();
  let lista: DevidoDaAgenda[];
  try {
    lista = await pecas.devidos(limite);
  } catch {
    return { devidos: 0, buscados: [], deixados: 0, erro: 'devidos' };
  }
  const buscados: ResultadoDoTitular[] = [];
  for (const d of lista) {
    if (pecas.agoraMs() - inicio > COMECAR_ATE_MS) break;
    let r: RespostaDaBusca;
    try {
      r = await pecas.buscar(d.titularId);
    } catch {
      buscados.push({ titularId: d.titularId, status: 0, cstat: null, recusa: 'rede', pausa: null });
      continue;
    }
    const p = pausaDaResposta(r, pecas.agoraMs());
    if (p) {
      try { await pecas.pausar(d, p.motivo, p.ate, p.detalhe); } catch { /* a pausa que não gravou volta na próxima rodada, com a mesma recusa */ }
    }
    buscados.push({ titularId: d.titularId, status: r.status, cstat: txt(r.corpo.cstat), recusa: txt(r.corpo.recusa), pausa: p?.motivo ?? null });
  }
  return { devidos: lista.length, buscados, deixados: lista.length - buscados.length, erro: null };
}
