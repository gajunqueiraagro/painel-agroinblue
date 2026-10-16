/**
 * RESUMO-CLIENTES-01 passo b — a "Esteira do mês" (mock v9): um cliente por linha, uma bolinha por etapa. Puro e RENDER-ONLY:
 * o status de cada fazenda é o de `get_status_pilares_ano` (p1 / p2) e o da conciliação é a linha `total` de
 * `fn_conciliacao_resumo_mes` — aqui só se JUNTA por cliente (todas ✓, algumas, nenhuma) e se escreve. Nada é recalculado.
 */
import { hojeLocal } from '@/lib/datas/hojeLocal';
import type { StatusDono } from '@/lib/conciliacao/resumoDoDono';

export type EstadoEtapa = 'ok' | 'parcial' | 'travado' | 'nada' | 'carregando' | 'erro';
export interface CelulaEtapa { estado: EstadoEtapa; rotulo: string; titulo: string; /** p/ o próximo passo */ detalhe?: string }

export interface PilarDaFazenda { fazendaId: string; fazendaNome: string; status: string | null }

/** Status do pilar por fazenda -> a bolinha do cliente. `nao_aplicavel` não conta. */
export function agregarPilar(fazendas: readonly PilarDaFazenda[], datas?: ReadonlyMap<string, string>): CelulaEtapa {
  const contam = fazendas.filter(f => f.status !== 'nao_aplicavel');
  const n = contam.length;
  const ok = contam.filter(f => f.status === 'oficial');
  const andamento = contam.filter(f => f.status === 'pendente');
  const faltam = contam.filter(f => f.status !== 'oficial');
  const titulo = contam.map(f => `${f.fazendaNome}: ${ROTULO_PILAR[f.status ?? ''] ?? f.status ?? '—'}`).join('\n') || 'nenhuma fazenda em que o pilar se aplique';
  if (n === 0) return { estado: 'nada', rotulo: 'n/a', titulo };
  if (ok.length === n) {
    const ds = ok.map(f => datas?.get(f.fazendaId)).filter((d): d is string => !!d).sort();
    const data = ds.length === n ? ds[ds.length - 1] : null;
    return { estado: 'ok', rotulo: data ? `${data.slice(8, 10)}/${data.slice(5, 7)}` : '', titulo };
  }
  if (ok.length > 0 || andamento.length > 0) {
    return { estado: 'parcial', rotulo: `${ok.length} de ${n} faz.`, titulo, detalhe: faltam.map(f => f.fazendaNome).join(', ') };
  }
  return { estado: 'nada', rotulo: '', titulo, detalhe: faltam.map(f => f.fazendaNome).join(', ') };
}
const ROTULO_PILAR: Record<string, string> = { oficial: 'fechado', pendente: 'em andamento', nao_iniciado: 'não iniciado', nao_aplicavel: 'não se aplica' };

const brl = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A linha `total` do dono da conciliação -> a bolinha (o MESMO status do card da Conciliação). */
export function celulaDaConciliacao(total: { status: StatusDono; diferenca: number | null; motivos: readonly { motivo: string }[] } | null): CelulaEtapa {
  if (!total) return { estado: 'nada', rotulo: '', titulo: 'sem resumo do mês' };
  const motivos = total.motivos.map(m => m.motivo).join(', ');
  if (total.status === 'conciliado') return { estado: 'ok', rotulo: '', titulo: 'Conciliado' };
  if (total.status === 'nao_conciliado') {
    const rot = total.diferenca != null && total.diferenca !== 0 ? brl(total.diferenca) : 'não conc.';
    return { estado: 'travado', rotulo: rot, titulo: `Não conciliado${motivos ? ` · ${motivos}` : ''}`, detalhe: total.diferenca != null && total.diferenca !== 0 ? brl(total.diferenca) : undefined };
  }
  return { estado: 'nada', rotulo: 'pendente', titulo: `Pendente${motivos ? ` · ${motivos}` : ''}` };
}

export const CELULA_FECHAMENTO: CelulaEtapa = { estado: 'nada', rotulo: '—', titulo: 'ainda sem registro de entrega' };

export interface LinhaDaEsteira { clienteId: string; nome: string; p1: CelulaEtapa; p2: CelulaEtapa; conc: CelulaEtapa; pendencias: number }

const ETAPAS: readonly ('p1' | 'p2' | 'conc')[] = ['p1', 'p2', 'conc'];
const naoOk = (c: CelulaEtapa) => c.estado !== 'ok' && c.estado !== 'carregando';

/** O texto do "próximo passo · o que trava": a primeira etapa não ✓, da esquerda para a direita. */
export function proximoPasso(l: LinhaDaEsteira): string {
  let t = 'pronto para fechar';
  if (naoOk(l.p1)) t = `fechar pastos${l.p1.detalhe ? ` (${l.p1.detalhe})` : ''}`;
  else if (naoOk(l.p2)) t = `valor do rebanho${l.p2.detalhe ? ` (${l.p2.detalhe})` : ''}`;
  else if (naoOk(l.conc)) t = `conciliar${l.conc.detalhe ? ` (${l.conc.detalhe})` : ''}`;
  else if ([l.p1, l.p2, l.conc].some(c => c.estado === 'carregando')) t = '…';
  return t;
}

/** Mais atrasado primeiro: mais etapas não ✓; depois a etapa travada mais à esquerda; empate pelo nome. */
export function ordenarEsteira(linhas: readonly LinhaDaEsteira[]): LinhaDaEsteira[] {
  const atraso = (l: LinhaDaEsteira) => ETAPAS.filter(e => naoOk(l[e])).length;
  const primeira = (l: LinhaDaEsteira) => { const i = ETAPAS.findIndex(e => naoOk(l[e])); return i < 0 ? ETAPAS.length : i; };
  return [...linhas].sort((a, b) => atraso(b) - atraso(a) || primeira(a) - primeira(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function rodapeDaColuna(celulas: readonly CelulaEtapa[]): string {
  const ok = celulas.filter(c => c.estado === 'ok').length;
  const faltam = celulas.filter(c => c.estado !== 'ok' && c.estado !== 'carregando').length;
  return `${ok} ok · ${faltam} ${faltam === 1 ? 'falta' : 'faltam'}`;
}

/** Mês da cobrança: o anterior ao de hoje ('AAAA-MM'). */
export function mesDaCobranca(hoje: string = hojeLocal()): string {
  const a = Number(hoje.slice(0, 4)); const m = Number(hoje.slice(5, 7));
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
/** "dia N da cobrança" só quando o mês exibido é o da cobrança. */
export function diaDaCobranca(mes: string, hoje: string = hojeLocal()): number | null {
  return mes === mesDaCobranca(hoje) ? Number(hoje.slice(8, 10)) : null;
}
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const rotuloDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;
export function mesAoLado(mes: string, passo: -1 | 1): string {
  const d = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + passo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
