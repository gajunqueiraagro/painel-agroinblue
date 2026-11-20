/**
 * NOTAS-RECEITA · CIÊNCIA AUTOMÁTICA (210210) — REGRA DO PRODUTO (Gabriel 18/11 09:02 + 19/11 06:11): todo cliente com certificado ativo.
 * Roda no FIM de cada busca bem-sucedida (137/138, sem consChNFe, sem ensaio) da `fiscal-dfe-buscar`: pede ao banco as notas em RESUMO
 * sem ciência do titular (`fn_fiscal_dfe_ciencia_pendentes`, que já diz se o parâmetro do produto está ligado e o limite por busca) e envia
 * UMA ciência por nota pela borda `fiscal-dfe-ciencia` (via 'automatica'; a trilha/protocolo é a `fiscal_dfe_eventos`). Pura: a rede e o
 * banco entram por `PecasCienciaAutomatica` (provados no vitest).
 * Para (sem mandar a próxima) quando: o tempo da busca passa do orçamento · a Receita recusa o LOTE (sem cStat do evento) · a conexão, a
 * leitura ou o certificado falham · a MESMA recusa do evento vem 2 vezes seguidas (recusa sistêmica: não gasta nota a nota).
 * A recusa de UMA nota (cStat ≠ 135/573) não para: a nota fica com a recusa na trilha e não é repetida (o banco tira das pendentes).
 * ⚠ Só ciência. Confirmação/Desconhecimento/Não realizada seguem nota a nota com OK (a Lambda também só deixa passar o 210210).
 */
export interface PendentesDaCiencia { ligada: boolean; limite: number; chaves: string[]; motivo?: string | null }
export interface RespostaDaCiencia { status: number; corpo: Record<string, unknown> }
export interface PecasCienciaAutomatica {
  pendentes(): Promise<PendentesDaCiencia>;
  enviar(chave: string): Promise<RespostaDaCiencia>;
  agoraMs(): number;
}
export type MotivoDaParada = 'tempo' | 'recusa_do_lote' | 'conexao' | 'certificado' | 'recusa_repetida' | 'interno' | null;
export interface ContadorDaCiencia {
  ligada: boolean; pendentes: number; enviadas: number; aceitas: number; recusadas: number; falhas: number;
  parou: MotivoDaParada; motivo: string | null; cstats: string[];
}

/** o orçamento de tempo da busca inteira (a borda tem 150 s; a busca pode levar até 40 s e cada ciência até 40 s) */
export const ORCAMENTO_MS = 60_000;

const txt = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);

export async function cienciaAutomatica(inicioMs: number, pecas: PecasCienciaAutomatica, orcamentoMs = ORCAMENTO_MS): Promise<ContadorDaCiencia> {
  const c: ContadorDaCiencia = { ligada: false, pendentes: 0, enviadas: 0, aceitas: 0, recusadas: 0, falhas: 0, parou: null, motivo: null, cstats: [] };
  let p: PendentesDaCiencia;
  try {
    p = await pecas.pendentes();
  } catch {
    return { ...c, ligada: true, parou: 'interno', motivo: 'pendentes' };
  }
  c.ligada = p.ligada;
  c.motivo = p.motivo ?? null;
  c.pendentes = p.chaves.length;
  if (!p.ligada) return c;
  let ultimaRecusa: string | null = null;
  for (const chave of p.chaves.slice(0, Math.max(0, p.limite))) {
    if (pecas.agoraMs() - inicioMs > orcamentoMs) { c.parou = 'tempo'; break; }
    let r: RespostaDaCiencia;
    try {
      r = await pecas.enviar(chave);
    } catch {
      c.falhas += 1; c.parou = 'conexao'; break;
    }
    c.enviadas += 1;
    if (r.status !== 200) {
      c.falhas += 1;
      const recusa = txt(r.corpo.recusa);
      c.parou = recusa === 'certificado' || recusa === 'cadeia' ? 'certificado' : r.status === 502 ? 'conexao' : 'interno';
      break;
    }
    const cstat = txt(r.corpo.cstat);
    if (!cstat) { c.recusadas += 1; c.parou = 'recusa_do_lote'; c.cstats.push(`lote ${txt(r.corpo.cstat_lote) ?? '?'}`); break; }
    c.cstats.push(cstat);
    if (r.corpo.com_ciencia === true) { c.aceitas += 1; ultimaRecusa = null; continue; }
    c.recusadas += 1;
    if (ultimaRecusa === cstat) { c.parou = 'recusa_repetida'; break; }
    ultimaRecusa = cstat;
  }
  return c;
}
