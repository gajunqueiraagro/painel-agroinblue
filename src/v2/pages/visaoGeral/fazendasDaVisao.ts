/**
 * VISAO-GERAL-02 — as linhas da tabela "Fazendas" da Visão Geral e a LINHA DE TOTAL (regra 17 da régua, Gabriel 03/11/2026).
 *
 * ⚠ NENHUM NÚMERO NASCE AQUI. Cada coluna vem de uma fonte que a tela já lê:
 *   · área total e produtiva, e as atividades → a foto de área por fazenda (`SnapshotAreaFazendaMes`), a MESMA do bloco "Área no mês";
 *   · cabeças e UA → o rebanho oficial (`useRebanhoOficial`), por fazenda, no mês;
 *   · chuva → a tabela `chuvas`, a soma do mês da fazenda (a conta da tela Chuvas);
 *   · fechamento → `get_status_pilares_ano` (P1/P2 do mês).
 * Aqui só se MONTA a linha e se SOMA/PONDERA o total a partir das linhas exibidas: soma nas aditivas; UA/ha = ΣUA ÷ Σárea pecuária
 * (a mesma área da linha, nunca média de UA/ha); fechamento "x de y fechadas"; chuva acumulada não se soma entre fazendas (mm de lugares
 * diferentes não é chuva), então o total da chuva fica vazio.
 * VISAO-GERAL-05 (Gabriel 04/11 07:29): a tabela volta às colunas de ÁREA POR USO (as do "Ver por fazenda"): pecuária, agricultura,
 * silvicultura e reserva/APP/benf. (reserva + APP + benfeitorias + outras, o mesmo grupo da rosca do bloco Área) — as quatro somam o total.
 */
import type { SnapshotAreaFazendaMes } from '@/hooks/useFechamentoArea';

export type SituacaoFechamento = 'fechado' | 'falta' | 'sem_gado' | 'sem_dado';

export interface FazendaDaVisao {
  id: string;
  nome: string;
  codigo: string | null;
}

export interface LinhaFazendaVG {
  id: string;
  rotulo: string;
  atividades: string[];
  areaTotal: number | null;
  areaProdutiva: number | null;
  areaPecuaria: number | null;
  areaAgricultura: number | null;
  areaSilvicultura: number | null;
  /** reserva + APP + benfeitorias + outras (a fatia "Reserva, APP, benf." do bloco Área) */
  areaReservaAppBenf: number | null;
  cabecas: number | null;
  ua: number | null;
  uaHa: number | null;
  chuvaMm: number | null;
  fechamento: SituacaoFechamento;
}

export interface TotalFazendasVG {
  areaTotal: number | null;
  areaPecuaria: number | null;
  areaAgricultura: number | null;
  areaSilvicultura: number | null;
  areaReservaAppBenf: number | null;
  areaProdutiva: number | null;
  cabecas: number | null;
  uaHa: number | null;
  fechadas: number;
  comGado: number;
}

/** "PUR · Faz. Pureza": a fazenda pelo CÓDIGO primeiro (regra da casa); sem código, só o nome. */
export const rotuloDaFazenda = (f: FazendaDaVisao): string => (f.codigo ? `${f.codigo} · ${f.nome}` : f.nome);

/** As atividades da fazenda: as famílias com área > 0 na foto de área do mês, na ordem do bloco Área. */
export function atividadesDaArea(a: SnapshotAreaFazendaMes | undefined): string[] {
  if (!a) return [];
  const out: string[] = [];
  if (a.area_pecuaria_ha > 0) out.push('Pecuária');
  if (a.area_agricultura_ha > 0) out.push('Agricultura');
  if (a.area_silvicultura_ha > 0) out.push('Silvicultura');
  return out;
}

const soma = (vs: (number | null)[]): number | null => {
  const com = vs.filter((v): v is number => v !== null);
  return com.length === 0 ? null : com.reduce((s, v) => s + v, 0);
};

/** A linha de total: soma das linhas exibidas; UA/ha ponderada pela área pecuária das MESMAS linhas; fechamento "x de y". */
export function totalDasFazendas(linhas: readonly LinhaFazendaVG[]): TotalFazendasVG {
  const comUa = linhas.filter((l) => l.ua !== null && l.areaPecuaria !== null && l.areaPecuaria > 0);
  const uaTotal = soma(comUa.map((l) => l.ua));
  const areaDaUa = soma(comUa.map((l) => l.areaPecuaria));
  const comGado = linhas.filter((l) => l.fechamento === 'fechado' || l.fechamento === 'falta');
  return {
    areaTotal: soma(linhas.map((l) => l.areaTotal)),
    areaPecuaria: soma(linhas.map((l) => l.areaPecuaria)),
    areaAgricultura: soma(linhas.map((l) => l.areaAgricultura)),
    areaSilvicultura: soma(linhas.map((l) => l.areaSilvicultura)),
    areaReservaAppBenf: soma(linhas.map((l) => l.areaReservaAppBenf)),
    areaProdutiva: soma(linhas.map((l) => l.areaProdutiva)),
    cabecas: soma(linhas.map((l) => l.cabecas)),
    uaHa: uaTotal !== null && areaDaUa !== null && areaDaUa > 0 ? uaTotal / areaDaUa : null,
    fechadas: comGado.filter((l) => l.fechamento === 'fechado').length,
    comGado: comGado.length,
  };
}

/** A situação do fechamento do mês, pela régua da faixa de hoje: pendente em P1 ou P2 = falta; nenhum pendente com gado = fechado;
 *  os dois "não se aplica" = fazenda sem gado; sem célula = sem dado. */
export function situacaoDoFechamento(p1: string | undefined, p2: string | undefined): SituacaoFechamento {
  if (p1 === undefined && p2 === undefined) return 'sem_dado';
  if (p1 === 'pendente' || p2 === 'pendente' || p1 === 'nao_iniciado' || p2 === 'nao_iniciado') return 'falta';
  if (p1 === 'nao_aplicavel' && p2 === 'nao_aplicavel') return 'sem_gado';
  return 'fechado';
}
