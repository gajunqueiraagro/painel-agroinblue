/**
 * FIN-VISAO-GERAL-01 PR 3 — a "Visão Geral" do Financeiro: tipos do que o banco devolve (`fn_vg_tela`, `fn_vg_filtros`), o período
 * escolhido (Ano | Últ. 12 | 6 + 6 | De → Até), os formatos e o estado dos filtros da barra (Contas · Fazenda · Safra · Atividade),
 * que a barra do shell e a tela dividem.
 * ⚠ A TELA NUNCA SOMA NEM DIVIDE (SPEC §7.4): total, média, %, vs média, resultado, saldos, média acumulada e meta chegam prontos do
 *   banco. Aqui só há datas (qual período pedir) e formato (como escrever o número que veio).
 */
import { useSyncExternalStore } from 'react';

export type ModoVG = 'flx' | 'sai' | 'ent';
export type FaixaVG = 'ano' | 'u12' | '66' | 'per';
export type LadoVG = 'entrada' | 'saida';

export interface MesVG { am: string; previsto: boolean; vigente: boolean }
export interface LinhaVG {
  chave: string;
  /** `cartao` (P82): o pagamento de fatura com o cartão fora das contas escolhidas — transferência, nunca saída */
  tipo: 'saldo' | 'total' | 'grupo' | 'transf' | 'resultado' | 'cartao';
  lado?: LadoVG;
  grupo?: string | null;
  rotulo: string;
  valores: (number | null)[];
  vencidos?: number[];
  pct_mes?: (number | null)[];
  vs_media?: (number | null)[];
  total?: number | null;
  media?: number | null;
  pct?: number | null;
}
export interface TelaVG {
  mes_atual: string;
  meses: MesVG[];
  linhas: LinhaVG[];
  grafico: Partial<Record<LadoVG, { media_acumulada: (number | null)[]; meta: (number | null)[] }>> | null;
  conciliado_ate: string | null;
  contas_sem_ancora: string[];
  /** P79 — o que o banco USOU (eco dos chips): os não realizados que entraram e se o vencido entrou */
  status?: string[];
  incluir_vencidos?: boolean;
  /** P83 — o recorte não é de contas (fazenda/atividade): o banco não devolve saldo e a tela diz isso no lugar */
  sem_saldo?: boolean;
}
export interface ContaVG { id: string; nome: string; tipo: string; ativa: boolean; no_caixa: boolean }
export interface FiltrosVG { contas: ContaVG[]; atividades: string[]; safras: { id: string; nome: string }[] }

/** o que a tela pede ao clicar num total ou grupo — o modal de análise é o PR 4; aqui só a intenção */
export interface AlvoAnaliseVG { lado: LadoVG; grupo: string | null; am: string }

export const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;
export const ROTULO_ATIVIDADE: Record<string, string> = {
  pecuaria: 'Pecuária', agricultura: 'Agricultura', silvicultura: 'Silvicultura', administrativo: 'Administrativo',
};
export const rotuloAtividade = (a: string) => ROTULO_ATIVIDADE[a] ?? a.charAt(0).toUpperCase() + a.slice(1);

// ── meses e período ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const amDe = (ano: number, mes0: number) => `${ano}-${String(mes0 + 1).padStart(2, '0')}`;
export const anoDe = (am: string) => Number(am.slice(0, 4));
export const mes0De = (am: string) => Number(am.slice(5, 7)) - 1;
export const somarMeses = (am: string, n: number) => { const t = anoDe(am) * 12 + mes0De(am) + n; return amDe(Math.floor(t / 12), t % 12); };
export const rotuloMes = (am: string) => `${MESES_ABR[mes0De(am)]}/${String(anoDe(am)).slice(2)}`;
export const amHoje = (hoje: string) => hoje.slice(0, 7);

/** o intervalo de meses pedido ao banco: Ano = jan–dez do ano do mês escolhido; Últ. 12 = 12 até ele; 6 + 6 = 6 antes e 6 depois */
export function faixaDoPeriodo(faixa: FaixaVG, sel: string, de: string, ate: string): [string, string] {
  if (faixa === 'ano') return [amDe(anoDe(sel), 0), amDe(anoDe(sel), 11)];
  if (faixa === 'u12') return [somarMeses(sel, -11), sel];
  if (faixa === '66') return [somarMeses(sel, -5), somarMeses(sel, 6)];
  return de <= ate ? [de, ate] : [ate, de];
}
export const primeiroDia = (am: string) => `${am}-01`;
export const ultimoDia = (am: string) => { const d = new Date(Date.UTC(anoDe(am), mes0De(am) + 1, 0)); return d.toISOString().slice(0, 10); };
export const contarMeses = (de: string, ate: string) => (anoDe(ate) - anoDe(de)) * 12 + mes0De(ate) - mes0De(de) + 1;

// ── formato (só escrever o número que veio) ────────────────────────────────────────────────────────────────────────────
const fmt = (v: number, casas: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const sinal = (v: number) => (v < 0 ? '−' : '');
export const brl = (v: number | null | undefined) => (v == null ? '—' : `${sinal(v)}R$ ${fmt(v, 2)}`);
export const n0 = (v: number | null | undefined) => (v == null ? '—' : `${sinal(v)}${fmt(Math.round(v), 0)}`);
/** R$ mil com 1 decimal (a grade com mais de 14 meses e o eixo do gráfico) — é escrita do número, não conta da tela */
export const mil1 = (v: number | null | undefined) => (v == null ? '—' : `${sinal(v)}${fmt(v / 1000, 1)}`);
export const pct1 = (v: number | null | undefined) => (v == null ? '—' : `${sinal(v)}${fmt(v, 1)}%`);
export const vsMedia = (v: number | null | undefined) => (v == null ? '—' : `${v > 0.05 ? '+' : v < -0.05 ? '−' : ''}${fmt(Math.round(v), 0)}%`);
export const dataCurta = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');

// ── cores (SPEC §6) ────────────────────────────────────────────────────────────────────────────────────────────────────
export const COR = {
  /* P83 (Gabriel 23/10): positivo em AZUL, negativo em VERMELHO em toda a tela — nenhum valor preto; entradas navy, saídas vermelhas */
  saida: '#b3261e', entrada: '#1f3864', meta: '#d97400', saldo: '#1d5fb3', neg: '#b3261e', pos: '#1d5fb3', muted: '#5b6878',
  barraEnt: '#3c6db3', barraEntP: '#b9cbe6', barraSai: '#c0504d', barraSaiP: '#e7b6b4', mediaSai: '#7f1d1d', mediaEnt: '#1f3864',
} as const;
export const corSinal = (v: number | null | undefined) => (v == null ? COR.muted : v < 0 ? COR.neg : COR.pos);
/** variação contra a média: saída acima = vermelho, abaixo = verde (economia); entrada ao contrário */
export const corVariacao = (lado: LadoVG, v: number | null | undefined) => {
  if (v == null || Math.abs(v) <= 0.5) return COR.muted;
  const subiu = v > 0;
  return lado === 'saida' ? (subiu ? COR.neg : COR.pos) : (subiu ? COR.pos : COR.neg);
};
const PALETA_SAI = ['#b3261e', '#d0614f', '#44546a', '#7f1d1d', '#e8998a', '#2e7d8a', '#79b4bd', '#e0a458', '#a7aeb8', '#8a8f98'];
const PALETA_ENT = ['#1f3864', '#3c6db3', '#79a3d6', '#a7aeb8', '#8a8f98'];
/** a cor do grupo pela posição dele no lado (a ordem vem do banco) */
export const corDoGrupo = (lado: LadoVG, i: number) => (lado === 'saida' ? PALETA_SAI : PALETA_ENT)[i % (lado === 'saida' ? PALETA_SAI : PALETA_ENT).length];

// ── os filtros da barra (Contas · Fazenda · Safra · Atividade), divididos entre a barra do shell e a tela ────────────────────
export interface EstadoFiltrosVG {
  /** null = o padrão: as contas que contam no caixa (`no_caixa`, a regra da fn_vg_saldos) */
  contas: string[] | null;
  fazenda: string | null;
  safra: string | null;
  atividade: string | null;
  /** a lista que o banco deu (fn_vg_filtros), por cliente */
  clienteId: string | null;
  lista: FiltrosVG | null;
}
let estado: EstadoFiltrosVG = { contas: null, fazenda: null, safra: null, atividade: null, clienteId: null, lista: null };
const ouvintes = new Set<() => void>();
export const filtrosVG = {
  ler: () => estado,
  mudar: (p: Partial<EstadoFiltrosVG>) => { estado = { ...estado, ...p }; ouvintes.forEach((o) => o()); },
  ouvir: (o: () => void) => { ouvintes.add(o); return () => { ouvintes.delete(o); }; },
};
export const useFiltrosVG = () => useSyncExternalStore(filtrosVG.ouvir, filtrosVG.ler, filtrosVG.ler);
/** as contas que vão ao banco: a escolha, ou as do caixa (o padrão) — null quando são exatamente as do caixa (o banco decide) */
export const contasDoPedido = (e: EstadoFiltrosVG): string[] | null => e.contas;

// ── P79 — os chips de status (o MESMO componente da CPR) e o de vencidos, na URL como os filtros da casa (`useFiltroUrl`) ─────────
const ORDEM_STATUS = ['previsto', 'programado', 'agendado'];
/** status lido da URL: só os três válidos, na ordem da CPR (vazio = nenhum: só o realizado) */
export const lerStatusVG = (bruto: string): string[] => ORDEM_STATUS.filter((x) => bruto.split(',').includes(x));
export const escreverStatusVG = (v: string[]): string => ORDEM_STATUS.filter((x) => v.includes(x)).join(',');
export const lerVencidosVG = (bruto: string): boolean => bruto !== '0';
export const escreverVencidosVG = (v: boolean): string => (v ? '1' : '0');
