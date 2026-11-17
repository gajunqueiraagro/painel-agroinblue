/**
 * VISAO-GERAL-PENDENCIAS-01 (mock v2 aprovado 17/11 06:53, D8 = A) — "Rebanho no mês" da Visão Geral, na estrutura do Caixa:
 * saldo inicial · entradas (nascimentos, compras, transferências) · saídas (vendas e abates, consumo, mortes, transferências) · saldo final
 * em cabeças e a variação.
 * ⚠ FONTE ÚNICA: as linhas do cache que a tela já lê (`useRebanhoOficial` → `useZootCategoriaMensal`, realizado) passam pela MESMA conta da
 *   Evolução do rebanho (`montarMesPorCategoria`, a linha Total). Nada é recalculado aqui além de somar meses no modo período.
 * ⚠ D9: movimento sem cabeça no mês aparece "0" (zero é valor; a estrutura do card não muda). Sem linha no cache = `null` ("—").
 * ⚠ D10: no Global as linhas de todas as fazendas do recorte somam (é o que o cache do Global já entrega).
 */
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import { montarMesPorCategoria, type LinhaDoMes } from '@/lib/producao/evolucaoMes';

export interface RebanhoNoMes {
  inicio: number;
  nascimentos: number;
  compras: number;
  transfEntrada: number;
  vendasEAbates: number;
  consumo: number;
  mortes: number;
  transfSaida: number;
  final: number;
  /** final − início */
  variacao: number;
  /** variação ÷ início; `null` com início 0 */
  pct: number | null;
}

/**
 * `rows` = as linhas do cache do recorte (uma fazenda ou o Global); `meses` = os 'AAAA-MM' do mês (1) ou do período (jan → mês), em ordem.
 * O início é o do PRIMEIRO mês, o final o do ÚLTIMO, os movimentos somam. Mês do recorte sem linha nenhuma → `null`.
 */
export function rebanhoNoMes(rows: readonly ZootCategoriaMensal[], meses: readonly string[]): RebanhoNoMes | null {
  if (meses.length === 0) return null;
  const totais: LinhaDoMes[] = [];
  for (const m of meses) {
    const doMes = rows.filter((r) => r.ano_mes === m);
    if (doMes.length === 0) return null;
    const mes = montarMesPorCategoria(doMes, [], 'realizado');
    const total = mes.linhas.find((l) => l.nivel === 'total');
    if (!total) return null;
    totais.push(total);
  }
  const soma = (f: (t: LinhaDoMes) => number) => totais.reduce((s, t) => s + f(t), 0);
  const inicio = totais[0].inicio.cab;
  const final = totais[totais.length - 1].final.cab;
  return {
    inicio,
    nascimentos: soma((t) => t.tipos.nascimento.cab),
    compras: soma((t) => t.tipos.compra.cab),
    transfEntrada: soma((t) => t.tipos.transferencia_entrada.cab),
    vendasEAbates: soma((t) => t.tipos.venda.cab + t.tipos.abate.cab),
    consumo: soma((t) => t.tipos.consumo.cab),
    mortes: soma((t) => t.tipos.morte.cab),
    transfSaida: soma((t) => t.tipos.transferencia_saida.cab),
    final,
    variacao: final - inicio,
    pct: inicio > 0 ? (final - inicio) / inicio : null,
  };
}

/** Os 'AAAA-MM' do recorte: o mês, ou jan → mês no modo período. */
export function mesesDoRecorte(ano: number, mes: number, periodo: boolean): string[] {
  if (!ano || !mes) return [];
  const de = periodo ? 1 : mes;
  return Array.from({ length: mes - de + 1 }, (_, i) => `${ano}-${String(de + i).padStart(2, '0')}`);
}

/** A variação ao lado do saldo final: "+191 · +2,6%" (sem início: só as cabeças). */
export function variacaoDoRebanho(variacao: number, pct: number | null): string {
  const sinal = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const cab = `${sinal(variacao)}${Math.abs(variacao).toLocaleString('pt-BR')}`;
  if (pct == null) return cab;
  return `${cab} · ${sinal(pct)}${Math.abs(pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Mês sem fechamento (o mapa de pastos pendente — a mesma regra da linha "Fechamento faltando") = aviso numa linha reservada do card.
 *  Até 3 fazendas pelo código; mais que isso, o número (os códigos no `title`). Nada pendente = `null`. */
export function avisoSemFechamento(codigos: readonly string[], mesCurto: string): { texto: string; title: string } | null {
  if (codigos.length === 0) return null;
  const quem = codigos.length <= 3 ? codigos.join(', ') : `${codigos.length} fazendas`;
  return {
    texto: `${mesCurto} sem fechamento em ${quem}: números dos lançamentos`,
    title: `${mesCurto} ainda sem fechamento em ${codigos.join(', ')}: os números vêm dos lançamentos e se conferem no fechamento`,
  };
}
