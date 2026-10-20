/**
 * RESUMO-CLIENTES-01 passo a — as pendências do consultor (tabela `consultor_pendencias`, só admin). Puro: leitor sem cast, o que é
 * "aberta" e "vencida", o rodapé e as frases. A tela só desenha.
 */
import { hojeLocal } from '@/lib/datas/hojeLocal';

export type StatusPendencia = 'aberta' | 'cobrada' | 'resolvida';
export type CanalCobranca = 'whatsapp' | 'email' | 'telefone';
export type OrigemPendencia = 'oc' | 'conciliacao' | 'fechamento' | 'outro';

export interface Pendencia {
  id: string;
  clienteId: string;
  prazo: string | null;
  cobrarDe: string;
  oQue: string;
  origemTipo: OrigemPendencia | null;
  origemRef: string | null;
  status: StatusPendencia;
  ultimaCobrancaEm: string | null;
  ultimaCobrancaCanal: CanalCobranca | null;
  resolvidaEm: string | null;
}

export const CANAIS: readonly CanalCobranca[] = ['whatsapp', 'email', 'telefone'];
export const ROTULO_CANAL: Record<CanalCobranca, string> = { whatsapp: 'WhatsApp', email: 'e-mail', telefone: 'telefone' };
export const ORIGENS: readonly OrigemPendencia[] = ['oc', 'conciliacao', 'fechamento', 'outro'];
export const ROTULO_ORIGEM: Record<OrigemPendencia, string> = { oc: 'OC', conciliacao: 'Conciliação', fechamento: 'Fechamento', outro: 'Outro' };
export const ROTULO_STATUS: Record<StatusPendencia, string> = { aberta: 'Aberta', cobrada: 'Cobrada', resolvida: 'Resolvida' };

const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (o: Record<string, unknown>, k: string): string | null => { const v = o[k]; return typeof v === 'string' && v !== '' ? v : null; };
const STATUS: readonly StatusPendencia[] = ['aberta', 'cobrada', 'resolvida'];

/** Uma linha do banco, ou nulo se torta (nunca uma linha meio montada). */
export function lerPendencia(x: unknown): Pendencia | null {
  if (!ehObj(x)) return null;
  const id = txt(x, 'id'); const clienteId = txt(x, 'cliente_id'); const cobrarDe = txt(x, 'cobrar_de'); const oQue = txt(x, 'o_que');
  const status = STATUS.find(s => s === x.status);
  if (!id || !clienteId || !cobrarDe || !oQue || !status) return null;
  return {
    id, clienteId, prazo: txt(x, 'prazo'), cobrarDe, oQue,
    origemTipo: ORIGENS.find(o => o === x.origem_tipo) ?? null, origemRef: txt(x, 'origem_ref'), status,
    ultimaCobrancaEm: txt(x, 'ultima_cobranca_em'), ultimaCobrancaCanal: CANAIS.find(c => c === x.ultima_cobranca_canal) ?? null,
    resolvidaEm: txt(x, 'resolvida_em'),
  };
}

/** Aberta = ainda não resolvida (aberta ou cobrada): é o que o ⚑ conta. */
export const emAberto = (p: Pendencia) => p.status !== 'resolvida';
export const vencida = (p: Pendencia, hoje: string = hojeLocal()) => emAberto(p) && !!p.prazo && p.prazo < hoje;

/** Segunda-feira da semana de `hoje` ('AAAA-MM-DD'). */
function inicioDaSemana(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return hojeLocal(d);
}

export interface RodapePendencias { abertas: number; vencidas: number; cobradasNaSemana: number; resolvidasNoMes: number }
export function rodapePendencias(lista: readonly Pendencia[], hoje: string = hojeLocal()): RodapePendencias {
  const semana = inicioDaSemana(hoje); const mes = hoje.slice(0, 7);
  return {
    abertas: lista.filter(emAberto).length,
    vencidas: lista.filter(p => vencida(p, hoje)).length,
    cobradasNaSemana: lista.filter(p => !!p.ultimaCobrancaEm && p.ultimaCobrancaEm >= semana && p.ultimaCobrancaEm <= hoje).length,
    resolvidasNoMes: lista.filter(p => !!p.resolvidaEm && hojeLocal(new Date(p.resolvidaEm)).slice(0, 7) === mes).length,
  };
}
export const fraseDoRodape = (r: RodapePendencias) =>
  `${r.abertas} ${r.abertas === 1 ? 'aberta' : 'abertas'} · ${r.vencidas} ${r.vencidas === 1 ? 'vencida' : 'vencidas'} · ${r.cobradasNaSemana} cobradas na semana · ${r.resolvidasNoMes} resolvidas no mês`;

/** A lista na ordem de trabalho: em aberto primeiro, por prazo (sem prazo no fim); resolvidas por último. */
export function ordenarPendencias(lista: readonly Pendencia[]): Pendencia[] {
  return [...lista].sort((a, b) => {
    if (emAberto(a) !== emAberto(b)) return emAberto(a) ? -1 : 1;
    if (a.prazo === b.prazo) return 0;
    if (!a.prazo) return 1;
    if (!b.prazo) return -1;
    return a.prazo < b.prazo ? -1 : 1;
  });
}

export const dataCurta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
/** UI-SEM-CORTE-02 — o prazo em dd/mm/aaaa, sempre completo (a regra da casa para data em coluna). */
export const dataCompleta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const textoDaCobranca = (p: Pendencia) =>
  p.ultimaCobrancaEm && p.ultimaCobrancaCanal ? `${dataCurta(p.ultimaCobrancaEm)} · ${ROTULO_CANAL[p.ultimaCobrancaCanal]}` : '—';
export const textoDaOrigem = (p: Pendencia) =>
  p.origemTipo ? `${ROTULO_ORIGEM[p.origemTipo]}${p.origemRef ? ` ${p.origemRef}` : ''}` : '—';

export interface NovaPendencia { clienteId: string; prazo: string | null; cobrarDe: string; oQue: string; origemTipo: OrigemPendencia | null; origemRef: string | null }
/** O que falta para gravar; nulo = pode. */
export function faltaNaNova(n: NovaPendencia): string | null {
  if (!n.clienteId) return 'Escolha o cliente.';
  if (!n.cobrarDe.trim()) return 'Diga de quem cobrar.';
  if (!n.oQue.trim()) return 'Diga o que cobrar.';
  return null;
}
