/**
 * BPO-GUIA-01 — as regras PURAS do guia "Como funciona" da aprovação de pagamentos (Gabriel 18/11, mock aprovado 11:19).
 * ⚠ OS DIAS DE PAGAMENTO JÁ TÊM CASA NO BANCO: `financeiro_bpo_config.dias_semana` (smallint[], 0 = domingo … 6 = sábado; nulo ou vazio
 *   = todos os dias), gravado pela `fn_bpo_config_gravar` (`p_dias`). Nenhuma coluna nova. DATA NUNCA TRAVA (Gabriel 23/11 08:46): nem
 *   bloqueio nem aviso hoje; no máximo, depois, uma SUGESTÃO do próximo dia combinado ao programar — `foraDosDiasDePagamento` é a regra pronta para ela.
 */

import { rotuloDaPessoa, type NomeDoAutor } from '@/lib/acessos/nomesDosAutores';

/** Os dias na ordem da semana de trabalho (o domingo por último), com o número do Postgres (`extract(dow)`). */
export const DIAS_DA_SEMANA: readonly { n: number; rotulo: string }[] = [
  { n: 1, rotulo: 'Seg' }, { n: 2, rotulo: 'Ter' }, { n: 3, rotulo: 'Qua' }, { n: 4, rotulo: 'Qui' },
  { n: 5, rotulo: 'Sex' }, { n: 6, rotulo: 'Sáb' }, { n: 0, rotulo: 'Dom' },
];

/** "todos os dias" (nenhum marcado) ou "seg, qua e sex" — na ordem da semana de trabalho. */
export function textoDosDias(dias: readonly number[]): string {
  const marcados = DIAS_DA_SEMANA.filter((d) => dias.includes(d.n)).map((d) => d.rotulo.toLowerCase());
  if (marcados.length === 0 || marcados.length === 7) return 'todos os dias';
  if (marcados.length === 1) return `só ${marcados[0]}`;
  return `${marcados.slice(0, -1).join(', ')} e ${marcados[marcados.length - 1]}`;
}

/** A data (aaaa-mm-dd) cai fora dos dias de pagamento? Sem dias definidos, nunca. Só AVISO — nada se bloqueia por isto. */
export function foraDosDiasDePagamento(dataIso: string, dias: readonly number[]): boolean {
  if (dias.length === 0 || dias.length === 7) return false;
  const [a, m, d] = dataIso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return false;
  return !dias.includes(new Date(Date.UTC(a, m - 1, d)).getUTCDay());
}

/** Liga/desliga um dia na lista (ordem de gravação: crescente). */
export function alternarDia(dias: readonly number[], n: number): number[] {
  return (dias.includes(n) ? dias.filter((x) => x !== n) : [...dias, n]).sort((x, y) => x - y);
}

/* ── a 1ª visita: guardada no navegador, POR USUÁRIO (é conveniência; falhar o armazenamento só reabre o guia) ── */
const chaveDoGuia = (userId: string) => `bpo-guia-visto:${userId}`;

export function jaViuOGuia(userId: string | null | undefined): boolean {
  if (!userId) return true;
  try { return window.localStorage.getItem(chaveDoGuia(userId)) === '1'; } catch { return false; }
}

export function marcarGuiaVisto(userId: string | null | undefined): void {
  if (!userId) return;
  try { window.localStorage.setItem(chaveDoGuia(userId), '1'); } catch { /* sem armazenamento: o guia reabre na próxima visita */ }
}

/* ── o passo 6: quem pode aprovar (membro ATIVO gestor ou financeiro do cliente — a mesma regra da `fn_bpo_aprovador_gravar`) ── */
export interface CandidatoAAprovador { userId: string; rotulo: string; perfil: 'proprietario' | 'gestor_cliente' | 'financeiro'; jaAprova: boolean }

const ehRegistro = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** membros (user_id, perfil, ativo) + os nomes da fonte unica (`fn_nomes_dos_autores`, por user_id) + os que já aprovam → os candidatos,
 * por nome. O rótulo é o de toda tela de acessos (`rotuloDaPessoa`: nome → e-mail → "usuário removido"). */
export function candidatosAAprovador(membros: unknown, nomes: ReadonlyMap<string, Pick<NomeDoAutor, 'nome' | 'email'>>, aprovadores: unknown): CandidatoAAprovador[] {
  const ja = new Set<string>();
  for (const a of Array.isArray(aprovadores) ? aprovadores : []) if (ehRegistro(a) && texto(a.user_id)) ja.add(String(a.user_id));
  const out: CandidatoAAprovador[] = [];
  for (const m of Array.isArray(membros) ? membros : []) {
    if (!ehRegistro(m) || m.ativo !== true) continue;
    const id = texto(m.user_id);
    const perfil = m.perfil === 'proprietario' || m.perfil === 'gestor_cliente' || m.perfil === 'financeiro' ? m.perfil : null;
    if (!id || !perfil) continue;
    out.push({ userId: id, rotulo: rotuloDaPessoa(nomes.get(id)), perfil, jaAprova: ja.has(id) });
  }
  return out.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/** a frase da prévia do "Ligar" — o que a `fn_bpo_config_gravar` (simular) contou, com o aprovador e os dias */
export function fraseDaPreviaDoLigar(p: { aguardando: number; desde: string; aprovador: string; dias: readonly number[] }): string {
  const [a, m, d] = p.desde.split('-');
  const n = p.aguardando;
  return `${n} ${n === 1 ? 'saída em aberto' : 'saídas em aberto'} desde ${d}/${m}/${a} · aprova ${p.aprovador} · ${textoDosDias(p.dias)}`;
}

export const PASSOS_DO_GUIA: readonly string[] = [
  'Quem lança, quem aprova', 'Quais pagamentos', 'O caminho', 'Mudou depois?', 'Avisos e alertas', 'Ligar neste cliente',
];
