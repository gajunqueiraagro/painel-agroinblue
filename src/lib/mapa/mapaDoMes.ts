/**
 * MAPA-02a — o MÊS do mapa de pastos montado num lugar só (D1, Gabriel 31/10/2026: um mês único, escolhido no seletor).
 * Puro: recebe o que o `useMapaDoMes` leu e devolve, por pasto VIGENTE no mês, o fechamento DAQUELE mês.
 * - kg/ha = Σ(quantidade × peso médio) ÷ `area_produtiva_ha` do cadastro (a mesma conta do Fechamento);
 * - atividade = `tipo_uso_mes` do fechamento do mês (D3), nunca o `tipo_uso` do cadastro;
 * - pasto sem fechamento no mês: tudo "—" (null), com o último fechamento ANTERIOR para o selo "último fechamento mm/aa";
 * - histórico: os 12 meses corridos até o mês escolhido; mês sem fechamento = null (barra ausente).
 * Antes eram três leituras: `usePastoOcupacao` (o último fechamento DE CADA PASTO, de qualquer mês) e as categorias do Gestor e da
 * Operação (cada uma o último fechamento do pasto).
 */
import { faixaDaLotacao, statusDaFaixa, uaPorHa, type FaixaLotacao, type StatusOcupacao } from '@/lib/mapa/faixasLotacao';

export interface PastoDoMapa {
  id: string;
  nome: string;
  area_produtiva_ha: number | null;
}

export interface FechamentoLido {
  id: string;
  pasto_id: string;
  ano_mes: string;
  tipo_uso_mes: string | null;
  /** 'fechado' | 'aberto' | 'rascunho' (fix1 E: o aviso "fechamento aberto"). */
  status?: string | null;
}

export interface ItemLido {
  fechamento_id: string;
  quantidade: number;
  peso_medio_kg: number | null;
  categoria_id: string;
  /** MAPA-PAINEL-COMPACTO-01: o lote da linha do fechamento (texto livre do operador; null = sem lote). */
  lote?: string | null;
}

export interface CategoriaDoPasto {
  nome: string;
  quantidade: number;
  peso_medio_kg: number | null;
  /** MAPA-PAINEL-COMPACTO-01: o lote da linha (uma linha do painel por registro do fechamento). */
  lote: string | null;
}

export interface MesDoHistorico {
  anoMes: string;
  kgHa: number | null;
  /** O peso total (kg) do fechamento do mês (null = sem fechamento): para somar a série de uma fazenda (MAPA-GLOBAL-01). */
  pesoTotalKg: number | null;
  faixa: FaixaLotacao | null;
  /** MAPA-PAINEL-COMPACTO-01: UA/ha do mês (calcUA/calcUAHa, pela `uaPorHa` da casa; null = sem fechamento ou sem área). */
  uaHa: number | null;
  /** MAPA-PAINEL-COMPACTO-01: o fechamento do mês marcou o pasto como VEDADO (`tipo_uso_mes = 'vedado'`). */
  vedado: boolean;
}

export interface DadosDoPastoNoMes {
  pastoId: string;
  /** Há fechamento deste pasto no mês escolhido. Sem ele, cabeças/peso/kg/ha/atividade são null ("—"). */
  temFechamento: boolean;
  /** O fechamento do mês tem status 'fechado' (null = sem fechamento no mês). */
  fechado: boolean | null;
  cabecas: number | null;
  pesoTotalKg: number | null;
  pesoMedioKg: number | null;
  kgHa: number | null;
  faixa: FaixaLotacao | null;
  atividade: string | null;
  categorias: CategoriaDoPasto[];
  /** A categoria com mais cabeças no mês (o `categoria_principal` que a Operação lia). */
  categoriaPrincipalId: string | null;
  /** Sem fechamento no mês: o mês do último fechamento ANTERIOR ('AAAA-MM'), se houver. */
  ultimoFechamento: string | null;
  historico: MesDoHistorico[];
}

/** O formato que a aba Operação já lia (o `PastoOcupacao` do hook antigo). */
export interface PastoOcupacao {
  pasto_id: string;
  cabecas: number;
  peso_total_kg: number;
  peso_medio_kg: number | null;
  categoria_principal: string | null;
  kg_ha: number | null;
  status: StatusOcupacao;
}

/** 'AAAA-MM' de n meses antes (n ≥ 0). */
export function mesAntes(anoMes: string, n: number): string {
  const [a, m] = anoMes.split('-').map(Number);
  const total = a * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Os 12 meses corridos que terminam em `anoMes`, do mais antigo ao mais novo. */
export function dozeMesesAte(anoMes: string): string[] {
  return Array.from({ length: 12 }, (_, i) => mesAntes(anoMes, 11 - i));
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** 'AAAA-MM' → 'mm/aa' (o selo "último fechamento"). */
export function mesCurtoNumerico(anoMes: string): string {
  return `${anoMes.slice(5, 7)}/${anoMes.slice(2, 4)}`;
}
/** 'AAAA-MM' → 'set' (o rótulo do histórico). */
export function mesAbreviado(anoMes: string): string {
  return MESES_CURTOS[Number(anoMes.slice(5, 7)) - 1] ?? anoMes;
}

export function montarMapaDoMes(entrada: {
  anoMes: string;
  vigentes: readonly PastoDoMapa[];
  fechamentos: readonly FechamentoLido[];
  itens: readonly ItemLido[];
  nomeDaCategoria: (id: string) => string;
}): Map<string, DadosDoPastoNoMes> {
  const { anoMes, vigentes, fechamentos, itens, nomeDaCategoria } = entrada;
  const janela = new Set(dozeMesesAte(anoMes));
  const porFechamento = new Map<string, ItemLido[]>();
  for (const it of itens) porFechamento.set(it.fechamento_id, [...(porFechamento.get(it.fechamento_id) ?? []), it]);

  const fechamentosDoPasto = new Map<string, FechamentoLido[]>();
  for (const f of fechamentos) {
    if (f.ano_mes > anoMes) continue;
    fechamentosDoPasto.set(f.pasto_id, [...(fechamentosDoPasto.get(f.pasto_id) ?? []), f]);
  }

  const resultado = new Map<string, DadosDoPastoNoMes>();
  for (const p of vigentes) {
    const lista = (fechamentosDoPasto.get(p.id) ?? []).slice().sort((a, b) => (a.ano_mes < b.ano_mes ? 1 : -1));
    const area = p.area_produtiva_ha && p.area_produtiva_ha > 0 ? p.area_produtiva_ha : null;
    const somar = (f: FechamentoLido) => {
      const its = porFechamento.get(f.id) ?? [];
      const cabecas = its.reduce((s, i) => s + (i.quantidade || 0), 0);
      const pesoTotal = its.reduce((s, i) => s + (i.quantidade || 0) * (i.peso_medio_kg || 0), 0);
      return { its, cabecas, pesoTotal, kgHa: area ? pesoTotal / area : null };
    };

    const doMes = lista.find(f => f.ano_mes === anoMes) ?? null;
    const historico: MesDoHistorico[] = dozeMesesAte(anoMes).map(m => {
      const f = lista.find(x => x.ano_mes === m);
      if (!f || !janela.has(m)) return { anoMes: m, kgHa: null, pesoTotalKg: null, faixa: null, uaHa: null, vedado: false };
      const { kgHa, pesoTotal, cabecas } = somar(f);
      return { anoMes: m, kgHa, pesoTotalKg: pesoTotal, faixa: faixaDaLotacao(kgHa),
        uaHa: uaPorHa(cabecas, cabecas > 0 ? pesoTotal / cabecas : null, area), vedado: f.tipo_uso_mes === 'vedado' };
    });

    if (!doMes) {
      resultado.set(p.id, {
        pastoId: p.id, temFechamento: false, fechado: null, cabecas: null, pesoTotalKg: null, pesoMedioKg: null, kgHa: null, faixa: null,
        atividade: null, categorias: [], categoriaPrincipalId: null, ultimoFechamento: lista[0]?.ano_mes ?? null, historico,
      });
      continue;
    }
    const { its, cabecas, pesoTotal, kgHa } = somar(doMes);
    resultado.set(p.id, {
      pastoId: p.id,
      temFechamento: true,
      fechado: doMes.status === 'fechado',
      cabecas,
      pesoTotalKg: pesoTotal,
      pesoMedioKg: cabecas > 0 ? pesoTotal / cabecas : null,
      kgHa,
      faixa: faixaDaLotacao(kgHa),
      atividade: doMes.tipo_uso_mes,
      categorias: its
        .filter(i => (i.quantidade || 0) > 0)
        .map(i => ({ nome: nomeDaCategoria(i.categoria_id), quantidade: i.quantidade, peso_medio_kg: i.peso_medio_kg, lote: i.lote?.trim() || null }))
        .sort((a, b) => b.quantidade - a.quantidade),
      categoriaPrincipalId: its.reduce<ItemLido | null>((m, i) => ((i.quantidade || 0) > (m?.quantidade ?? 0) ? i : m), null)?.categoria_id ?? null,
      ultimoFechamento: null,
      historico,
    });
  }
  return resultado;
}

/** O mapa no formato que a Operação já lia: só os pastos COM fechamento no mês. */
export function ocupacoesDoMes(dados: ReadonlyMap<string, DadosDoPastoNoMes>): Map<string, PastoOcupacao> {
  const m = new Map<string, PastoOcupacao>();
  dados.forEach((d, id) => {
    if (!d.temFechamento) return;
    m.set(id, {
      pasto_id: id,
      cabecas: d.cabecas ?? 0,
      peso_total_kg: d.pesoTotalKg ?? 0,
      peso_medio_kg: d.pesoMedioKg,
      categoria_principal: d.categoriaPrincipalId,
      kg_ha: d.kgHa,
      status: statusDaFaixa(d.faixa),
    });
  });
  return m;
}

/**
 * MAPA-02a-fix1 (A) — o mês em que o mapa ABRE numa fazenda: o último mês com fechamento de pastos DAQUELA fazenda
 * (`fechamento_pastos`); sem nenhum, o mês de hoje. Antes era o último mês com P1 oficial (na 3M dava dez/25 com pastos fechados até set/26).
 */
export function mesDeAbertura(ultimoComFechamento: string | null, hoje: string): string {
  return ultimoComFechamento && /^\d{4}-\d{2}$/.test(ultimoComFechamento) ? ultimoComFechamento : hoje.slice(0, 7);
}

/**
 * MAPA-02a-fix1 (E) — o fechamento de pastos do mês está ABERTO: algum dos pastos do mapa tem fechamento no mês com status ≠ 'fechado'
 * ('aberto' ou 'rascunho'). Pasto sem fechamento no mês não conta (é o "sem fechamento", outra coisa). Os números aparecem do mesmo jeito.
 */
export function fechamentoDoMesAberto(dados: ReadonlyMap<string, DadosDoPastoNoMes>, pastoIds: Iterable<string>): boolean {
  for (const id of pastoIds) {
    const d = dados.get(id);
    if (d?.temFechamento && d.fechado === false) return true;
  }
  return false;
}

/**
 * MAPA-GLOBAL-01 (D2) — os números de um conjunto de pastos no mês, pela regra ÚNICA do Gestor (antes no `MapaGestorView`): a área soma
 * todo pasto vigente do conjunto (com ou sem fechamento); cabeças e peso somam só os que têm fechamento; peso médio = peso total ÷
 * cabeças; lotação = peso total ÷ área total (nunca média das médias). Sem nenhum fechamento: "—" (null). O Gestor passa os pastos COM
 * polígono da fazenda; o Global, os de cada fazenda e, para o total do cliente, todos.
 */
export interface ResumoDosPastos {
  cabecas: number | null;
  pesoTotalKg: number | null;
  pesoMedio: number | null;
  lotacao: number | null;
  area: number | null;
}
export function resumoDosPastos(
  pastoIds: Iterable<string>,
  dados: ReadonlyMap<string, DadosDoPastoNoMes>,
  areaDe: (pastoId: string) => number | null | undefined,
): ResumoDosPastos {
  let cab = 0; let pesoTotal = 0; let area = 0; let algum = false;
  for (const id of pastoIds) {
    const d = dados.get(id);
    if (!d) continue;
    area += areaDe(id) ?? 0;
    if (!d.temFechamento) continue;
    algum = true;
    cab += d.cabecas ?? 0;
    pesoTotal += d.pesoTotalKg ?? 0;
  }
  return {
    cabecas: algum ? cab : null,
    pesoTotalKg: algum ? pesoTotal : null,
    pesoMedio: algum && cab > 0 ? pesoTotal / cab : null,
    lotacao: algum && area > 0 ? pesoTotal / area : null,
    area: area > 0 ? area : null,
  };
}

/** MAPA-PERF-01 — a linha lida de `fechamento_pastos` com os itens embutidos (`fechamento_pasto_itens(...)`). */
export interface FechamentoComItens extends FechamentoLido {
  fazenda_id?: string | null;
  fechamento_pasto_itens?: ItemLido[] | null;
}

/**
 * MAPA-PERF-01 — separa o que veio numa consulta só (fechamentos da janela com os itens embutidos) no formato da `montarMapaDoMes`:
 * só as fazendas pedidas, só os meses da janela e cada fechamento UMA vez (o banco já filtra; aqui é a garantia de que nada de fora
 * nem repetido entra na conta).
 */
export function separarFechamentosEItens(linhas: readonly FechamentoComItens[], fazendaIds: readonly string[], janela: readonly string[]):
  { fechamentos: FechamentoLido[]; itens: ItemLido[] } {
  const meses = new Set(janela);
  const fazendas = new Set(fazendaIds);
  const fechamentos: FechamentoLido[] = [];
  const itens: ItemLido[] = [];
  const vistos = new Set<string>();
  for (const l of linhas) {
    if ((l.fazenda_id != null && !fazendas.has(l.fazenda_id)) || !meses.has(l.ano_mes) || vistos.has(l.id)) continue;
    vistos.add(l.id);
    fechamentos.push({ id: l.id, pasto_id: l.pasto_id, ano_mes: l.ano_mes, tipo_uso_mes: l.tipo_uso_mes, status: l.status });
    for (const i of l.fechamento_pasto_itens ?? []) itens.push({ ...i, fechamento_id: l.id });
  }
  return { fechamentos, itens };
}
