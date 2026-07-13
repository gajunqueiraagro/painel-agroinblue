// buildReuniaoExecutiva — helper PURO, determinístico, SEM efeito (PR-FECHAMENTO-P0.1).
// Recebe os 7 indicadores do PC-100 (já normalizados) e devolve o VM da página
// executiva da reunião: resumo em 4 linhas, semáforos, destaques/alertas e
// recomendações — tudo por DICIONÁRIO FIXO (nunca texto fora do dicionário) e nunca
// afirmando causa (só posição vs régua). deltaMeta/deltaAno são PERCENTUAIS (ex.: -5 = -5%).

export type ChaveIndicador = 'receita' | 'arrobas' | 'margem' | 'gmd' | 'desfrute' | 'custoArr' | 'custoCab';
export type Direcao = 'up' | 'down';
export type Unidade = 'brl' | 'brl_arroba' | 'brl_cab' | 'arroba' | 'kg';
export type CorSemaforo = 'verde' | 'amarelo' | 'vermelho' | 'cinza';

export interface IndicadorEntrada {
  chave: ChaveIndicador;
  label: string;
  valor: number | null;
  deltaMeta: number | null;   // % vs META (curr-meta)/meta*100
  deltaAno: number | null;    // % vs ano anterior
  direcao: Direcao;           // 'up' = maior é melhor; 'down' = menor é melhor
  unidade: Unidade;
}

export interface SemaforoVM {
  chave: ChaveIndicador;
  label: string;
  valorFmt: string;
  cor: CorSemaforo;
  reguaLabel: string;   // '' | 'vs meta' | 'vs ano ant.'
  deltaFmt: string;     // '+12,3%' | '—'
  favor: number | null; // favorabilidade assinada em % (>0 melhor, <0 pior)
}

export interface ReuniaoExecutivaVM {
  linhas4: string[];
  semaforos: SemaforoVM[];
  destaques: SemaforoVM[];
  alertas: SemaforoVM[];
  recomendacoes: { manter: string[]; prioridades: string[] };
  // fazendas?: DEFERIDO (ver relatório do PR)
}

const LIMIAR = 5; // ±5%

function nf(v: number, dec: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtValor(v: number | null, u: Unidade): string {
  if (v == null || Number.isNaN(v)) return '—';
  switch (u) {
    case 'brl':        return `R$ ${nf(v, 0)}`;
    case 'brl_arroba': return `R$ ${nf(v, 2)}/@`;
    case 'brl_cab':    return `R$ ${nf(v, 2)}/cab`;
    case 'arroba':     return `${nf(v, 0)} @`;
    case 'kg':         return `${nf(v, 3)} kg`;
  }
}
function fmtDelta(pct: number | null): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  return `${pct >= 0 ? '+' : ''}${nf(pct, 1)}%`;
}
function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// (b) Semáforo: régua = META; se ausente, ano anterior (rótulo "vs ano ant.").
// melhor além de ±5% → verde; |Δ|≤5% → amarelo; pior além de ±5% → vermelho;
// sem valor ou sem régua → cinza (não concorre).
function semaforoDe(ind: IndicadorEntrada): SemaforoVM {
  let deltaVal: number | null = null;
  let reguaLabel = '';
  if (ind.deltaMeta != null) { deltaVal = ind.deltaMeta; reguaLabel = 'vs meta'; }
  else if (ind.deltaAno != null) { deltaVal = ind.deltaAno; reguaLabel = 'vs ano ant.'; }

  if (ind.valor == null || deltaVal == null) {
    return { chave: ind.chave, label: ind.label, valorFmt: fmtValor(ind.valor, ind.unidade),
             cor: 'cinza', reguaLabel: '', deltaFmt: '—', favor: null };
  }
  const favor = ind.direcao === 'up' ? deltaVal : -deltaVal;
  let cor: CorSemaforo;
  if (Math.abs(deltaVal) <= LIMIAR) cor = 'amarelo';
  else if (favor > 0) cor = 'verde';
  else cor = 'vermelho';
  return { chave: ind.chave, label: ind.label, valorFmt: fmtValor(ind.valor, ind.unidade),
           cor, reguaLabel, deltaFmt: fmtDelta(deltaVal), favor };
}

// (c-L4) dicionário fixo mapeado ao indicador do pior Δ.
const DICIONARIO_L4: Record<ChaveIndicador, string> = {
  custoArr: 'recuperar a eficiência de custos mantendo o ritmo de produção',
  custoCab: 'recuperar a eficiência de custos mantendo o ritmo de produção',
  arrobas:  'retomar o ritmo de produção de arrobas',
  margem:   'proteger a margem operacional',
  gmd:      'recuperar o desempenho produtivo dos lotes',
  receita:  'retomar o ritmo comercial',
  desfrute: 'aumentar o giro do rebanho',
};
// (e) recomendações — dicionário fixo, 1:1 com condições.
const MANTER: Partial<Record<ChaveIndicador, string>> = {
  receita:  'manter estratégia comercial',
  gmd:      'manter manejo nutricional',
  arrobas:  'manter ritmo de produção',
  desfrute: 'manter ritmo de produção',
};
const PRIORIDADE: Partial<Record<ChaveIndicador, string>> = {
  custoArr: 'revisar famílias de custo',
  custoCab: 'revisar famílias de custo',
  arrobas:  'revisar plano de produção',
  margem:   'acompanhar evolução da margem nos próximos meses',
};

export function buildReuniaoExecutiva(entradas: IndicadorEntrada[]): ReuniaoExecutivaVM {
  const semaforos = entradas.map(semaforoDe);
  const by = (c: ChaveIndicador) => semaforos.find((s) => s.chave === c);

  // (d) destaques = verdes; alertas = vermelhos; ordenar por |favor| desc; top-3.
  // (verde e vermelho são disjuntos → nenhum indicador aparece nos dois lados)
  const destaques = semaforos.filter((s) => s.cor === 'verde')
    .sort((a, b) => Math.abs(b.favor ?? 0) - Math.abs(a.favor ?? 0)).slice(0, 3);
  const alertas = semaforos.filter((s) => s.cor === 'vermelho')
    .sort((a, b) => Math.abs(b.favor ?? 0) - Math.abs(a.favor ?? 0)).slice(0, 3);

  // (c) Resumo 4 linhas.
  const margem = by('margem');
  const receita = by('receita');
  const custoArr = by('custoArr');
  const custoCab = by('custoCab');

  let l1: string;
  if (receita?.cor === 'verde' && (custoArr?.cor === 'vermelho' || custoCab?.cor === 'vermelho')) {
    l1 = 'Resultado misto';
  } else if (margem?.cor === 'verde') l1 = 'Desempenho positivo';
  else if (margem?.cor === 'amarelo') l1 = 'Desempenho estável';
  else if (margem?.cor === 'vermelho') l1 = 'Atenção ao resultado';
  else l1 = 'Desempenho estável';

  const comFavor = semaforos.filter((s) => s.favor != null);
  const melhor = comFavor.slice().sort((a, b) => (b.favor ?? 0) - (a.favor ?? 0))[0];
  const pior = comFavor.slice().sort((a, b) => (a.favor ?? 0) - (b.favor ?? 0))[0];

  const l2 = melhor
    ? `Melhor resultado: ${melhor.label} — ${melhor.valorFmt} (${melhor.deltaFmt} ${melhor.reguaLabel})`
    : 'Sem indicador favorável com régua disponível.';
  const l3 = (pior && (pior.favor ?? 0) < 0)
    ? `Ponto de atenção: ${pior.label} — ${pior.valorFmt} (${pior.deltaFmt} ${pior.reguaLabel})`
    : 'Nenhum indicador desfavorável no período.';
  const l4 = (pior && (pior.favor ?? 0) < 0)
    ? capitalizar(DICIONARIO_L4[pior.chave])
    : 'Manter a estratégia atual';

  // (e) recomendações — MANTER por destaque, PRIORIDADES por alerta; dedup; máx 3/4.
  const manter: string[] = [];
  for (const d of destaques) { const f = MANTER[d.chave]; if (f && !manter.includes(f)) manter.push(f); }
  const prioridades: string[] = [];
  for (const a of alertas) { const f = PRIORIDADE[a.chave]; if (f && !prioridades.includes(f)) prioridades.push(f); }

  return {
    linhas4: [l1, l2, l3, l4],
    semaforos,
    destaques,
    alertas,
    recomendacoes: { manter: manter.slice(0, 3), prioridades: prioridades.slice(0, 4) },
  };
}
