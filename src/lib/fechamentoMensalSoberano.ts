/**
 * D.0B-i — Camada de dados soberana do fechamento mensal (pura, testável).
 *
 * Tipos e projeções derivadas dos QUATRO contratos de leitura D.0A:
 *   fn_cards_componentes_mes, fn_composicao_componentes_categoria_mes,
 *   fn_pendencias_fechamento_mes (envelope M8), fn_locais_sugeridos_mes.
 *
 * INVARIANTE DA UNIÃO (crítica): a lista da tela NÃO é derivada só dos sugeridos.
 *   Três conjuntos separados; cardsExistentes = componentes + pendências;
 *   sugeridosSemCard = sugeridos cujo pasto ainda não tem card; linhasDaTela = união.
 *   Nenhum card existente desaparece por não estar entre os sugeridos atuais.
 *
 * Ordenação: normais primeiro, ajustes (eh_ajuste=true) sempre no fim.
 *   eh_ajuste vem SEMPRE do envelope da RPC (inclusive pendências, via M8);
 *   NUNCA é derivado no frontend a partir de tipo_uso/tipo_uso_mes/nome/natureza.
 *   Locais sugeridos entram como eh_ajuste=false (a RPC já exclui divergência).
 */

// ── Envelopes das RPCs (tipos locais; ainda ausentes em database.types.ts) ──

export interface ComponenteMensal {
  cliente_id: string;
  fazenda_id: string;
  ano_mes: string;
  fechamento_pasto_id: string;
  pasto_id: string;
  nome_exibicao: string;
  status: string;
  quantidade_total: number;
  peso_total_kg: number | string;      // numeric — precisão preservada (não converter destrutivamente)
  possui_itens: boolean;
  tipo_uso_mes: string | null;
  uso_operacional: string | null;
  uso_operacional_origem: string | null;
  tipo_entidade: string | null;
  natureza_patrimonial: string | null;
  eh_ajuste: boolean;
}

export interface ComposicaoCategoriaMensal {
  cliente_id: string;
  fazenda_id: string;
  ano_mes: string;
  fechamento_pasto_id: string;
  pasto_id: string;
  nome_exibicao: string;
  categoria_id: string;
  categoria_codigo: string | null;
  quantidade: number;
  peso_total_kg: number | string;
  peso_medio_kg: number | string | null;
  status: string;
  tipo_uso_mes: string | null;
  uso_operacional: string | null;
  uso_operacional_origem: string | null;
  tipo_entidade: string | null;
  natureza_patrimonial: string | null;
  eh_ajuste: boolean;
}

export interface PendenciaMensal {
  cliente_id: string;
  fazenda_id: string;
  ano_mes: string;
  fechamento_pasto_id: string;
  pasto_id: string;
  nome_exibicao: string;
  status: string;
  tipo_uso_mes: string | null;
  uso_operacional: string | null;
  uso_operacional_origem: string | null;
  tipo_entidade: string | null;
  natureza_patrimonial: string | null;
  eh_ajuste: boolean;                  // envelope M8 — nunca derivar no frontend
}

export interface LocalSugeridoMensal {
  cliente_id: string;
  fazenda_id: string;
  ano_mes: string;
  pasto_id: string;
  nome_exibicao: string;
  tipo_uso: string | null;
  entra_conciliacao: boolean;
  data_inicio: string | null;
  natureza_patrimonial: string | null;
  sugerir_no_fechamento: boolean;
}

// ── Projeção de UI ──

export interface CardMensalSoberano {
  origem: 'componente' | 'pendencia';
  fechamento_pasto_id: string;
  pasto_id: string;
  nome_exibicao: string;
  status: string;
  tipo_uso_mes: string | null;
  uso_operacional: string | null;
  uso_operacional_origem: string | null;
  tipo_entidade: string | null;
  natureza_patrimonial: string | null;
  eh_ajuste: boolean;
  // componente-only (undefined em pendência):
  quantidade_total?: number;
  peso_total_kg?: number | string;
  possui_itens?: boolean;
}

export type LinhaFechamentoMensal =
  | { tipo: 'card'; pasto_id: string; nome_exibicao: string; eh_ajuste: boolean; card: CardMensalSoberano }
  | { tipo: 'sugerido'; pasto_id: string; nome_exibicao: string; eh_ajuste: boolean; local: LocalSugeridoMensal };

function componenteToCard(c: ComponenteMensal): CardMensalSoberano {
  return {
    origem: 'componente',
    fechamento_pasto_id: c.fechamento_pasto_id,
    pasto_id: c.pasto_id,
    nome_exibicao: c.nome_exibicao,
    status: c.status,
    tipo_uso_mes: c.tipo_uso_mes,
    uso_operacional: c.uso_operacional,
    uso_operacional_origem: c.uso_operacional_origem,
    tipo_entidade: c.tipo_entidade,
    natureza_patrimonial: c.natureza_patrimonial,
    eh_ajuste: c.eh_ajuste,
    quantidade_total: c.quantidade_total,
    peso_total_kg: c.peso_total_kg,
    possui_itens: c.possui_itens,
  };
}

function pendenciaToCard(p: PendenciaMensal): CardMensalSoberano {
  return {
    origem: 'pendencia',
    fechamento_pasto_id: p.fechamento_pasto_id,
    pasto_id: p.pasto_id,
    nome_exibicao: p.nome_exibicao,
    status: p.status,
    tipo_uso_mes: p.tipo_uso_mes,
    uso_operacional: p.uso_operacional,
    uso_operacional_origem: p.uso_operacional_origem,
    tipo_entidade: p.tipo_entidade,
    natureza_patrimonial: p.natureza_patrimonial,
    eh_ajuste: p.eh_ajuste,
  };
}

/** cardsExistentes = componentes + pendências, deduplicados por fechamento_pasto_id (componentes primeiro). */
export function buildCardsExistentes(
  componentes: ComponenteMensal[],
  pendencias: PendenciaMensal[],
): CardMensalSoberano[] {
  const porCard = new Map<string, CardMensalSoberano>();
  for (const c of componentes) if (!porCard.has(c.fechamento_pasto_id)) porCard.set(c.fechamento_pasto_id, componenteToCard(c));
  for (const p of pendencias) if (!porCard.has(p.fechamento_pasto_id)) porCard.set(p.fechamento_pasto_id, pendenciaToCard(p));
  return [...porCard.values()];
}

/** sugeridos cujo pasto ainda NÃO possui card no mês (por pasto_id). */
export function buildSugeridosSemCard(
  locaisSugeridos: LocalSugeridoMensal[],
  cardsExistentes: CardMensalSoberano[],
): LocalSugeridoMensal[] {
  const pastosComCard = new Set(cardsExistentes.map(c => c.pasto_id));
  return locaisSugeridos.filter(l => !pastosComCard.has(l.pasto_id));
}

/**
 * linhasDaTela = cardsExistentes + sugeridosSemCard.
 * Ordenação: normais (eh_ajuste=false) primeiro, ajustes (eh_ajuste=true) ao fim;
 *   dentro de cada grupo por nome_exibicao. Sugeridos são sempre eh_ajuste=false.
 */
export function buildLinhasDaTela(
  cardsExistentes: CardMensalSoberano[],
  sugeridosSemCard: LocalSugeridoMensal[],
): LinhaFechamentoMensal[] {
  const linhas: LinhaFechamentoMensal[] = [
    ...cardsExistentes.map((card): LinhaFechamentoMensal => ({
      tipo: 'card', pasto_id: card.pasto_id, nome_exibicao: card.nome_exibicao, eh_ajuste: card.eh_ajuste, card,
    })),
    ...sugeridosSemCard.map((local): LinhaFechamentoMensal => ({
      tipo: 'sugerido', pasto_id: local.pasto_id, nome_exibicao: local.nome_exibicao, eh_ajuste: false, local,
    })),
  ];
  const porNome = (a: LinhaFechamentoMensal, b: LinhaFechamentoMensal) => a.nome_exibicao.localeCompare(b.nome_exibicao);
  const normais = linhas.filter(l => !l.eh_ajuste).sort(porNome);
  const ajustes = linhas.filter(l => l.eh_ajuste).sort(porNome);
  return [...normais, ...ajustes];
}

// ── Fingerprint determinístico de paridade ──

export interface FechamentoMensalFingerprint {
  componentesIds: string[];
  pendenciasIds: string[];
  sugeridosIds: string[];
  cardsExistentesIds: string[];
  sugeridosSemCardIds: string[];
  linhasPastoIds: string[];            // ordem preservada (captura a ordenação)
  componentesCount: number;
  pendenciasCount: number;
  sugeridosCount: number;
  ajustesFechadosCount: number;
  ajustesPendentesCount: number;
  quantidadePorCategoria: Record<string, number>;
}

export function computeFechamentoMensalFingerprint(input: {
  componentes: ComponenteMensal[];
  pendencias: PendenciaMensal[];
  locaisSugeridos: LocalSugeridoMensal[];
  composicaoPorCategoria: ComposicaoCategoriaMensal[];
  cardsExistentes: CardMensalSoberano[];
  sugeridosSemCard: LocalSugeridoMensal[];
  linhasDaTela: LinhaFechamentoMensal[];
}): FechamentoMensalFingerprint {
  const ordenar = (arr: string[]) => [...arr].sort();
  const quantidadePorCategoria: Record<string, number> = {};
  for (const c of input.composicaoPorCategoria) {
    const cod = c.categoria_codigo ?? '__SEM_CODIGO__';
    quantidadePorCategoria[cod] = (quantidadePorCategoria[cod] ?? 0) + Number(c.quantidade);
  }
  return {
    componentesIds: ordenar(input.componentes.map(c => c.fechamento_pasto_id)),
    pendenciasIds: ordenar(input.pendencias.map(p => p.fechamento_pasto_id)),
    sugeridosIds: ordenar(input.locaisSugeridos.map(l => l.pasto_id)),
    cardsExistentesIds: ordenar(input.cardsExistentes.map(c => c.fechamento_pasto_id)),
    sugeridosSemCardIds: ordenar(input.sugeridosSemCard.map(l => l.pasto_id)),
    linhasPastoIds: input.linhasDaTela.map(l => l.pasto_id),
    componentesCount: input.componentes.length,
    pendenciasCount: input.pendencias.length,
    sugeridosCount: input.locaisSugeridos.length,
    ajustesFechadosCount: input.componentes.filter(c => c.eh_ajuste).length,
    ajustesPendentesCount: input.pendencias.filter(p => p.eh_ajuste).length,
    quantidadePorCategoria,
  };
}
