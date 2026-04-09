/**
 * Cálculos zootécnicos puros — camada central de indicadores pecuários.
 * Todas as funções são puras (sem side-effects, sem hooks React).
 */

import type { Lancamento, SaldoInicial, Categoria, TipoMovimentacao } from '@/types/cattle';
import type { CategoriaRebanho } from '@/hooks/usePastos';
import { isRealizado as isLancRealizado } from '@/lib/statusOperacional';

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

export interface SaldoCategoria {
  categoria: string; // código da categoria
  categoriaId?: string; // id UUID (se disponível via categorias_rebanho)
  saldo: number;
}

export interface SaldoMensalAcumulado {
  mes: string; // '01'..'12'
  saldo: number;
}

export interface ResumoMovimentacoes {
  nascimentos: number;
  compras: number;
  vendas: number;
  abates: number;
  mortes: number;
  consumos: number;
  transferenciasEntrada: number;
  transferenciasSaida: number;
  reclassificacoes: number;
  totalEntradas: number;
  totalSaidas: number;
  saldoMes: number;
}

export type NivelConciliacao = 'ok' | 'atencao' | 'critico';

export interface ConciliacaoCategoria {
  categoria: CategoriaRebanho;
  qtdSistema: number;
  qtdPastos: number;
  diferenca: number;
  nivel: NivelConciliacao;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

const TIPOS_ENTRADA: TipoMovimentacao[] = ['nascimento', 'compra', 'transferencia_entrada'];
const TIPOS_SAIDA: TipoMovimentacao[] = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'];

/**
 * Verifica se o tipo de movimentação é uma entrada.
 * Fonte única — use esta em vez de reimplementar em cada tela.
 */
export function isEntrada(tipo: string): boolean {
  return (TIPOS_ENTRADA as string[]).includes(tipo);
}

/**
 * Verifica se o tipo de movimentação é uma saída.
 */
export function isSaida(tipo: string): boolean {
  return (TIPOS_SAIDA as string[]).includes(tipo);
}

/**
 * Verifica se o tipo é reclassificação.
 */
export function isReclassificacao(tipo: string): boolean {
  return tipo === 'reclassificacao';
}

/** Filtra lançamentos que caem dentro de um range de datas (string ISO). */
function lancamentosNoRange(lancs: Lancamento[], startDate: string, endDate: string): Lancamento[] {
  return lancs.filter(l => l.data >= startDate && l.data <= endDate);
}

/**
 * Filtra lançamentos CONCILIADOS (Realizados) dentro de um range de datas.
 * Esta é a função padrão para cálculos de saldo real.
 */
function lancamentosConciliadosNoRange(lancs: Lancamento[], startDate: string, endDate: string): Lancamento[] {
  return lancs.filter(l => l.data >= startDate && l.data <= endDate && isLancRealizado(l));
}

// ---------------------------------------------------------------------------
// 1. Saldo por categoria até o final de um mês
// ---------------------------------------------------------------------------

/**
 * Calcula o saldo por categoria desde o saldo inicial do ano até o final do
 * mês informado (inclusive), retornando um Map<categoriaId, saldo>.
 *
 * Usa o mapeamento código→id das `categorias_rebanho` para unificar a chave.
 */
export function calcSaldoPorCategoria(
  saldosIniciais: SaldoInicial[],
  lancamentos: Lancamento[],
  ano: number,
  mes: number, // 1-12
  categorias: CategoriaRebanho[],
): Map<string, number> {
  const map = new Map<string, number>();
  const codeToId = new Map(categorias.map(c => [c.codigo, c.id]));

  // Saldo inicial do ano
  saldosIniciais
    .filter(s => s.ano === ano)
    .forEach(s => {
      const catId = codeToId.get(s.categoria);
      if (catId) map.set(catId, (map.get(catId) || 0) + s.quantidade);
    });

  // Acumular lançamentos do ano até o final do mês
  const mesStr = String(mes).padStart(2, '0');
  const anoMes = `${ano}-${mesStr}`;
  const startDate = `${ano}-01-01`;
  const endDate = `${anoMes}-31`;

  lancamentosConciliadosNoRange(lancamentos, startDate, endDate).forEach(l => {
    const catId = codeToId.get(l.categoria);
    if (!catId) return;

    if (isEntrada(l.tipo)) {
      map.set(catId, (map.get(catId) || 0) + l.quantidade);
    } else if (isSaida(l.tipo)) {
      map.set(catId, (map.get(catId) || 0) - l.quantidade);
    } else if (isReclassificacao(l.tipo) && l.categoriaDestino) {
      const destId = codeToId.get(l.categoriaDestino);
      map.set(catId, (map.get(catId) || 0) - l.quantidade);
      if (destId) map.set(destId, (map.get(destId) || 0) + l.quantidade);
    }
  });

  return map;
}

// ---------------------------------------------------------------------------
// 2. Saldo mensal acumulado (array de 12 meses)
// ---------------------------------------------------------------------------

/**
 * Retorna o saldo total acumulado no início de cada mês + o saldo final do ano.
 * Útil para gráficos de evolução do rebanho e tabela de fluxo anual.
 */
export function calcSaldoMensalAcumulado(
  saldosIniciais: SaldoInicial[],
  lancamentos: Lancamento[],
  ano: number,
): { saldoInicioMes: Record<string, number>; saldoFinalAno: number; saldoInicialAno: number } {
  const saldoInicialAno = saldosIniciais
    .filter(s => s.ano === ano)
    .reduce((sum, s) => sum + s.quantidade, 0);

  const lancAno = lancamentos.filter(l => {
    const lAno = l.data.substring(0, 4);
    return lAno === String(ano) && isLancRealizado(l);
  });

  const saldoInicioMes: Record<string, number> = {};
  let acum = saldoInicialAno;

  for (let m = 1; m <= 12; m++) {
    const mesKey = String(m).padStart(2, '0');
    saldoInicioMes[mesKey] = acum;

    // Movimentações do mês
    const mesPrefix = `${ano}-${mesKey}`;
    const doMes = lancAno.filter(l => l.data.startsWith(mesPrefix));

    doMes.forEach(l => {
      if (isEntrada(l.tipo)) acum += l.quantidade;
      else if (isSaida(l.tipo)) acum -= l.quantidade;
      // reclassificações não alteram o total
    });
  }

  return { saldoInicioMes, saldoFinalAno: acum, saldoInicialAno };
}

/**
 * Variante simplificada: retorna array de saldos por mês (para gráficos).
 */
export function calcSaldoMensalArray(
  saldosIniciais: SaldoInicial[],
  lancamentos: Lancamento[],
  ano: number,
): SaldoMensalAcumulado[] {
  const { saldoInicioMes, saldoFinalAno } = calcSaldoMensalAcumulado(saldosIniciais, lancamentos, ano);

  const result: SaldoMensalAcumulado[] = [];
  for (let m = 1; m <= 12; m++) {
    const mesKey = String(m).padStart(2, '0');
    // O saldo exibido no mês é o saldo no final do mês (= início do próximo)
    const nextMes = String(m + 1).padStart(2, '0');
    const saldoFimMes = m < 12 ? saldoInicioMes[nextMes] : saldoFinalAno;
    result.push({ mes: mesKey, saldo: saldoFimMes });
  }
  return result;
}

// ---------------------------------------------------------------------------
// 3. Saldo por categoria usando código (sem UUID) — para telas legadas
// ---------------------------------------------------------------------------

/**
 * Calcula o saldo por categoria (usando código da categoria como chave).
 * Usado em telas que trabalham com CATEGORIAS de cattle.ts diretamente.
 */
export function calcSaldoPorCategoriaLegado(
  saldosIniciais: SaldoInicial[],
  lancamentos: Lancamento[],
  ano: number,
  mes?: number, // undefined = ano inteiro
): Map<string, number> {
  const map = new Map<string, number>();

  // Saldo inicial
  saldosIniciais
    .filter(s => s.ano === ano)
    .forEach(s => {
      map.set(s.categoria, (map.get(s.categoria) || 0) + s.quantidade);
    });

  // Filtrar lançamentos até o mês
  const endDate = mes
    ? `${ano}-${String(mes).padStart(2, '0')}-31`
    : `${ano}-12-31`;
  const startDate = `${ano}-01-01`;

  lancamentosConciliadosNoRange(lancamentos, startDate, endDate).forEach(l => {
    if (isEntrada(l.tipo)) {
      map.set(l.categoria, (map.get(l.categoria) || 0) + l.quantidade);
    } else if (isSaida(l.tipo)) {
      map.set(l.categoria, (map.get(l.categoria) || 0) - l.quantidade);
    } else if (isReclassificacao(l.tipo) && l.categoriaDestino) {
      map.set(l.categoria, (map.get(l.categoria) || 0) - l.quantidade);
      map.set(l.categoriaDestino, (map.get(l.categoriaDestino) || 0) + l.quantidade);
    }
  });

  return map;
}

// ---------------------------------------------------------------------------
// 4. Resumo de movimentações do mês
// ---------------------------------------------------------------------------

/**
 * Consolida automaticamente todas as movimentações de um mês (anoMes = 'YYYY-MM').
 */
export function calcResumoMovimentacoes(
  lancamentos: Lancamento[],
  anoMes: string,
): ResumoMovimentacoes {
  const startDate = `${anoMes}-01`;
  const endDate = `${anoMes}-31`;
  const doMes = lancamentosConciliadosNoRange(lancamentos, startDate, endDate);

  const count = (tipo: string) =>
    doMes.filter(l => l.tipo === tipo).reduce((s, l) => s + l.quantidade, 0);

  const nascimentos = count('nascimento');
  const compras = count('compra');
  const vendas = count('venda');
  const abates = count('abate');
  const mortes = count('morte');
  const consumos = count('consumo');
  const transferenciasEntrada = count('transferencia_entrada');
  const transferenciasSaida = count('transferencia_saida');
  const reclassificacoes = count('reclassificacao');

  const totalEntradas = nascimentos + compras + transferenciasEntrada;
  const totalSaidas = vendas + abates + mortes + consumos + transferenciasSaida;

  return {
    nascimentos, compras, vendas, abates, mortes, consumos,
    transferenciasEntrada, transferenciasSaida, reclassificacoes,
    totalEntradas, totalSaidas,
    saldoMes: totalEntradas - totalSaidas,
  };
}

// ---------------------------------------------------------------------------
// 5. Resumo de movimentações por mês×tipo (para FluxoAnual)
// ---------------------------------------------------------------------------

export type FluxoTipo = 'nascimento' | 'compra' | 'transferencia_entrada' | 'abate' | 'venda' | 'transferencia_saida' | 'consumo' | 'morte';

export const FLUXO_LINHAS: { tipo: FluxoTipo; label: string; sinal: '+' | '-' }[] = [
  { tipo: 'nascimento', label: 'Nascimentos', sinal: '+' },
  { tipo: 'compra', label: 'Compras', sinal: '+' },
  { tipo: 'transferencia_entrada', label: 'Transf. Entrada', sinal: '+' },
  { tipo: 'abate', label: 'Abates', sinal: '-' },
  { tipo: 'venda', label: 'Vendas em Pé', sinal: '-' },
  { tipo: 'transferencia_saida', label: 'Transf. Saída', sinal: '-' },
  { tipo: 'consumo', label: 'Consumo', sinal: '-' },
  { tipo: 'morte', label: 'Mortes', sinal: '-' },
];

export function calcFluxoAnual(
  saldosIniciais: SaldoInicial[],
  lancamentos: Lancamento[],
  ano: number,
  /** Se true, não filtra por status (assume que os dados já foram pré-filtrados) */
  preFiltered = false,
) {
  const saldoInicialAno = saldosIniciais
    .filter(s => s.ano === ano)
    .reduce((sum, s) => sum + s.quantidade, 0);

  // Peso inicial do ano (soma ponderada dos saldos iniciais)
  const pesoInicialAno = saldosIniciais
    .filter(s => s.ano === ano)
    .reduce((sum, s) => sum + s.quantidade * (s.pesoMedioKg || 0), 0);

  const lancAno = lancamentos.filter(l =>
    l.data.substring(0, 4) === String(ano) && (preFiltered || isLancRealizado(l))
  );

  const porMesTipo: Record<string, Record<FluxoTipo, number>> = {};
  // Peso por mês: entradas e saídas em kg
  const pesoEntradasMes: Record<string, number> = {};
  const pesoSaidasMes: Record<string, number> = {};
  for (let m = 1; m <= 12; m++) {
    const mesKey = String(m).padStart(2, '0');
    porMesTipo[mesKey] = {} as Record<FluxoTipo, number>;
    FLUXO_LINHAS.forEach(li => { porMesTipo[mesKey][li.tipo] = 0; });
    pesoEntradasMes[mesKey] = 0;
    pesoSaidasMes[mesKey] = 0;
  }

  lancAno.forEach(l => {
    const mes = l.data.substring(5, 7);
    if (porMesTipo[mes] && !isReclassificacao(l.tipo)) {
      const tipo = l.tipo as FluxoTipo;
      if (porMesTipo[mes][tipo] !== undefined) {
        porMesTipo[mes][tipo] += l.quantidade;
      }
      const pesoUnit = l.pesoMedioKg || l.pesoCarcacaKg || 0;
      if (isEntrada(l.tipo)) {
        pesoEntradasMes[mes] += l.quantidade * pesoUnit;
      } else if (isSaida(l.tipo)) {
        pesoSaidasMes[mes] += l.quantidade * pesoUnit;
      }
    }
  });

  const saldoInicioMes: Record<string, number> = {};
  const pesoFinalMes: Record<string, number> = {};
  const gmdMes: Record<string, number | null> = {};

  let acum = saldoInicialAno;
  let pesoAcum = pesoInicialAno;

  for (let m = 1; m <= 12; m++) {
    const mesKey = String(m).padStart(2, '0');
    saldoInicioMes[mesKey] = acum;
    const pesoInicioMes = pesoAcum;
    const cabInicioMes = acum;

    const entradas = FLUXO_LINHAS.filter(li => li.sinal === '+').reduce((s, li) => s + porMesTipo[mesKey][li.tipo], 0);
    const saidas = FLUXO_LINHAS.filter(li => li.sinal === '-').reduce((s, li) => s + porMesTipo[mesKey][li.tipo], 0);
    acum += entradas - saidas;

    // Peso final do mês: peso início + peso entradas - peso saídas
    pesoAcum = pesoInicioMes + pesoEntradasMes[mesKey] - pesoSaidasMes[mesKey];
    // Ajustar peso pelo delta de cabeças que já estavam (sem movimento)
    // Simplificação: manter peso acumulado conforme fluxo
    pesoFinalMes[mesKey] = pesoAcum;

    // GMD mensal: (pesoFinal - pesoInicial - pesoEntradas + pesoSaídas) / dias / cabMédia
    const cabFinalMes = acum;
    const cabMedia = (cabInicioMes + cabFinalMes) / 2;
    const daysInMonth = new Date(ano, m, 0).getDate();
    if (cabMedia > 0 && pesoInicioMes > 0 && pesoAcum > 0) {
      const gmdVal = (pesoAcum - pesoInicioMes - pesoEntradasMes[mesKey] + pesoSaidasMes[mesKey]) / (daysInMonth * cabMedia);
      gmdMes[mesKey] = (gmdVal > 3.0 || gmdVal < -1.0) ? null : gmdVal;
    } else {
      gmdMes[mesKey] = null;
    }
  }

  const totalAno: Record<FluxoTipo, number> = {} as any;
  FLUXO_LINHAS.forEach(li => {
    totalAno[li.tipo] = Object.values(porMesTipo).reduce((s, m) => s + m[li.tipo], 0);
  });

  return {
    porMesTipo, saldoInicioMes, saldoFinalAno: acum, totalAno, saldoInicialAno,
    pesoFinalMes, gmdMes,
  };
}

// ---------------------------------------------------------------------------
// 6. Peso médio ponderado
// ---------------------------------------------------------------------------

/**
 * Calcula a média ponderada de peso.
 * Retorna null se não houver dados suficientes.
 */
export function calcPesoMedioPonderado(
  itens: { quantidade: number; pesoKg: number | null }[],
): number | null {
  const comPeso = itens.filter(i => i.quantidade > 0 && i.pesoKg != null && i.pesoKg > 0);
  if (comPeso.length === 0) return null;
  const totalPeso = comPeso.reduce((s, i) => s + (i.pesoKg! * i.quantidade), 0);
  const totalQtd = comPeso.reduce((s, i) => s + i.quantidade, 0);
  return totalQtd > 0 ? totalPeso / totalQtd : null;
}

// ---------------------------------------------------------------------------
// 7. UA (Unidade Animal) e UA/ha (Lotação)
// ---------------------------------------------------------------------------

/**
 * Calcula a Unidade Animal.
 * UA = (quantidade × pesoMédioKg) / 450
 * Se peso não informado, assume 1 UA por cabeça (convenção simplificada).
 */
export function calcUA(quantidade: number, pesoMedioKg: number | null): number {
  if (!pesoMedioKg || pesoMedioKg <= 0) return quantidade;
  return (quantidade * pesoMedioKg) / 450;
}

/**
 * Calcula a lotação (UA/ha).
 * Retorna null se área <= 0.
 */
export function calcUAHa(uaTotal: number, areaHa: number | null): number | null {
  if (!areaHa || areaHa <= 0) return null;
  return uaTotal / areaHa;
}

// ---------------------------------------------------------------------------
// 8. Área produtiva pecuária
// ---------------------------------------------------------------------------

interface PastoParaArea {
  ativo: boolean;
  entra_conciliacao: boolean;
  area_produtiva_ha: number | null;
}

/**
 * Calcula a área produtiva pecuária oficial para indicadores zootécnicos.
 *
 * Fonte primária: soma das áreas dos pastos ativos com `entra_conciliacao = true`.
 * Fallback: área geral da fazenda (se informada e se nenhum pasto válido).
 *
 * A função considera o contexto mensal da operação — só pastos ativos e
 * válidos para conciliação são contabilizados.
 */
export function calcAreaProdutivaPecuaria(
  pastos: PastoParaArea[],
  areaFazendaFallback?: number | null,
): number {
  const pastosValidos = pastos.filter(p => p.ativo && p.entra_conciliacao);
  const soma = pastosValidos.reduce((s, p) => s + (p.area_produtiva_ha || 0), 0);

  if (soma > 0) return soma;
  if (areaFazendaFallback && areaFazendaFallback > 0) return areaFazendaFallback;
  return 0;
}

// ---------------------------------------------------------------------------
// 9. Conciliação por categoria
// ---------------------------------------------------------------------------

/**
 * Classificação da divergência entre sistema e pastos.
 * - ok: diferença = 0
 * - atenção: 1 a 3 cabeças de diferença
 * - crítico: mais de 3 cabeças de diferença
 */
export function classificarNivelConciliacao(diferenca: number): NivelConciliacao {
  const abs = Math.abs(diferenca);
  if (abs === 0) return 'ok';
  if (abs <= 3) return 'atencao';
  return 'critico';
}

/**
 * Calcula a conciliação por categoria:
 * compara o saldo do sistema (Map<catId, qtd>) com o total contado nos pastos.
 */
export function calcConciliacao(
  categorias: CategoriaRebanho[],
  saldoSistema: Map<string, number>,
  itensPastos: Map<string, number>,
): ConciliacaoCategoria[] {
  return categorias.map(cat => {
    const qtdSistema = saldoSistema.get(cat.id) || 0;
    const qtdPastos = itensPastos.get(cat.id) || 0;
    const diferenca = qtdPastos - qtdSistema;
    const nivel = classificarNivelConciliacao(diferenca);
    return { categoria: cat, qtdSistema, qtdPastos, diferenca, nivel };
  });
}
