/**
 * REBANHO-ORGAO-01 F3 v3 (mock aprovado 27/11) — "o SISTEMA NA MESMA DATA do saldo do órgão". O banco dá o rebanho do FIM do último mês do
 * cache (`rebanhoHoje`, `fn_rebanho_orgao_fatos`); aqui ele anda até a data do comprovante com os MESMOS lançamentos que a RPC devolve:
 *   · cache de mês ANTERIOR ao da data: soma o efeito do que caiu depois do fim daquele mês até a data;
 *   · cache do MESMO mês (ou posterior): desfaz o que caiu depois da data até o fim do mês do cache.
 * O efeito de cada lançamento por categoria: nascimento +; morte/consumo −; ajuste de entrada + / de saída −; compra/transferência de
 * entrada + / venda, abate, transferência de saída −; reclassificação − na de origem e + na de destino.
 * E os fatos da declaração (nascimentos, mortes, ajustes, reclassificações) param na data: o que veio depois não está no saldo do órgão.
 * ⚠ Pura, sem estimar: categoria que zera some; negativo fica (a tabela mostra e a diferença diz).
 */
import type { FatosDoBanco } from './montarDeclaracao';

/** O último dia do mês 'AAAA-MM' ('AAAA-MM-DD'). */
export function fimDoMes(anoMes: string): string {
  const [a, m] = anoMes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}

type Efeito = { data: string; categoria: string; cab: number };

/** Cada lançamento da fazenda virado em +/− por categoria e data. */
function efeitos(f: FatosDoBanco, fazendaId: string): Efeito[] {
  const daFazenda = <T extends { fazendaId: string }>(xs: readonly T[]) => xs.filter((x) => x.fazendaId === fazendaId);
  return [
    ...daFazenda(f.nascimentos).map((n) => ({ data: n.data, categoria: n.categoria, cab: n.cab })),
    ...daFazenda(f.mortesConsumo).map((m) => ({ data: m.data, categoria: m.categoria, cab: -m.cab })),
    ...daFazenda(f.ajustes).map((a) => ({ data: a.data, categoria: a.categoria, cab: a.sentido === 'entrada' ? a.cab : -a.cab })),
    ...daFazenda(f.movimentos).map((m) => ({ data: m.data, categoria: m.categoria, cab: m.sentido === 'entrada' ? m.cab : -m.cab })),
    ...daFazenda(f.reclassificacoes).flatMap((r) => [{ data: r.data, categoria: r.de, cab: -r.cab }, { data: r.data, categoria: r.para, cab: r.cab }]),
  ];
}

/** O rebanho da fazenda por categoria NA DATA (fim do dia), a partir do cache + os lançamentos. Sem cache da fazenda = []. */
export function rebanhoNaData(f: FatosDoBanco, fazendaId: string, data: string): { categoria: string; cab: number }[] {
  const cache = f.rebanhoHoje.filter((r) => r.fazendaId === fazendaId);
  if (!cache.length) return [];
  const fim = fimDoMes(cache[0].anoMes);
  const saldo = new Map<string, number>();
  for (const r of cache) saldo.set(r.categoria, (saldo.get(r.categoria) ?? 0) + r.cab);
  for (const e of efeitos(f, fazendaId)) {
    const soma = fim < data && e.data > fim && e.data <= data;       // o cache é de antes: anda para a frente
    const desfaz = data < fim && e.data > data && e.data <= fim;     // o cache é de depois: volta
    if (soma) saldo.set(e.categoria, (saldo.get(e.categoria) ?? 0) + e.cab);
    if (desfaz) saldo.set(e.categoria, (saldo.get(e.categoria) ?? 0) - e.cab);
  }
  return [...saldo.entries()].filter(([, cab]) => cab !== 0).map(([categoria, cab]) => ({ categoria, cab }));
}

/** Os fatos como estavam NA DATA: os lançamentos da declaração param nela e o rebanho de cada fazenda é o da data. */
export function fatosNaData(f: FatosDoBanco, data: string): FatosDoBanco {
  const ate = <T extends { data: string }>(xs: readonly T[]) => xs.filter((x) => x.data <= data);
  return {
    ...f,
    ate: data < f.ate ? data : f.ate,
    nascimentos: ate(f.nascimentos), reclassificacoes: ate(f.reclassificacoes), mortesConsumo: ate(f.mortesConsumo), ajustes: ate(f.ajustes),
    rebanhoHoje: f.fazendas.flatMap((fz) => rebanhoNaData(f, fz.id, data).map((r) => ({ fazendaId: fz.id, anoMes: data.slice(0, 7), ...r }))),
  };
}

/** Os lançamentos da declaração DEPOIS da data do saldo (o aviso "baixe o comprovante de hoje"): quantos e quantas cabeças. */
export function depoisDaData(f: FatosDoBanco, fazendaId: string, data: string): { lancamentos: number; cab: number } {
  const xs = [...f.nascimentos, ...f.mortesConsumo, ...f.ajustes].filter((x) => x.fazendaId === fazendaId && x.data > data);
  return { lancamentos: xs.length, cab: xs.reduce((a, x) => a + x.cab, 0) };
}
