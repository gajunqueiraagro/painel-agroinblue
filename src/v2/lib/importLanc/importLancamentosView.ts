// ============================================================================
// importLancamentosView — PR-IMPORT-EXCEL-LANC-01. Selectors PUROS da
// importação de lançamentos por planilha.
//
// Responsabilidades: levantar os valores distintos de cada campo que mapeia
// para uma lista do sistema, PRÉ-RESOLVER o que a máquina consegue, e derivar
// a prévia (o que entra, o que fica de fora e por quê) com os totais.
//
// PURO: sem React, sem supabase, sem efeito. Recebe catálogos já carregados.
// NÃO grava — a gravação é o passo 4, fora deste módulo.
//
// REGRA HERDADA (financeiro_subcentro_aliases): resolução por igualdade
// normalizada apenas. PROIBIDO fuzzy, LIKE, ILIKE. A única tolerância é
// lower/trim/sem-acento, idêntica ao lookup do servidor.
// ============================================================================
import type { ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import {
  resolverContaPorTexto,
  type ContaResolvivel,
} from '@/v2/lib/mesa/resolverConta';
import {
  TIPO_TRANSFERENCIAS,
  type LancamentoExcelRow,
} from '@/v2/lib/excelPreview/parserLancamentos';

// ─── Tipos de apoio ─────────────────────────────────────────────────

/** Alias de subcentro já carregado do banco (financeiro_subcentro_aliases). */
export interface SubcentroAliasRef {
  id: string;
  cliente_id: string | null;   // null = alias global
  alias_text: string;
  plano_conta_id: string;
  subcentro: string;           // resolvido via join com financeiro_plano_contas
}

/** Mês fechado, por (fazenda_id, ano_mes) — de financeiro_fechamentos. */
export type ChaveFechamento = string;   // `${fazenda_id}|${ano_mes}`

export const chaveFechamento = (fazendaId: string, anoMes: string): ChaveFechamento =>
  `${fazendaId}|${anoMes}`;

/** Uma entrada do painel de de-para: valor distinto do Excel → registro do sistema. */
export interface DeParaItem<TValor = string> {
  /** Texto exatamente como veio da planilha (é o futuro alias_text). */
  texto: string;
  /** Quantas linhas usam este texto. */
  qtd: number;
  /** Resolução atual. null = pendente. */
  valor: TValor | null;
  /** Como chegou aqui — governa o selo na tela e o que será persistido. */
  origem: 'alias' | 'cadastro' | 'manual' | 'pendente';
  /** Rótulo legível do registro resolvido (para exibir sem novo lookup). */
  rotulo: string | null;
  /**
   * Para onde o APELIDO apontava antes de o operador trocar. Só é preenchido
   * quando a pré-resolução veio de alias; serve para a tela mostrar de onde o
   * texto saiu, antes da confirmação. Não influencia gravação nenhuma.
   */
  anterior?: string | null;
}

export type DeParaMap = Record<string, DeParaItem>;

export interface CatalogosImport {
  classificacoes: ClassificacaoItem[];
  fazendas: Fazenda[];
  fornecedores: FornecedorV2[];
  contas: ContaResolvivel[];
  aliasesSubcentro: SubcentroAliasRef[];
  /** fornecedorId → aliases (coluna jsonb de financeiro_fornecedores). */
  aliasesFornecedor: Readonly<Record<string, string[]>>;
  /** Chaves de (fazenda, ano_mes) fechados. */
  fechados: ReadonlySet<ChaveFechamento>;
}

// ─── Normalização (única tolerância permitida) ──────────────────────

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ─── Levantamento de distintos ──────────────────────────────────────

function distintos(
  rows: LancamentoExcelRow[],
  campo: (r: LancamentoExcelRow) => string | null,
): Array<{ texto: string; qtd: number }> {
  const acc = new Map<string, number>();
  for (const r of rows) {
    const t = campo(r)?.trim();
    if (!t || t === '-') continue;
    acc.set(t, (acc.get(t) ?? 0) + 1);
  }
  return [...acc.entries()]
    .map(([texto, qtd]) => ({ texto, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.texto.localeCompare(b.texto, 'pt-BR'));
}

// ─── Pré-resolução por campo ────────────────────────────────────────

/**
 * Subcentro. Ordem idêntica à do servidor (fn_classificacao_populate_staging):
 *   1. alias do cliente · 2. alias global · 3. lookup direto no plano.
 */
export function preResolverSubcentro(
  texto: string,
  cat: Pick<CatalogosImport, 'classificacoes' | 'aliasesSubcentro'>,
): Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'> {
  const alvo = normalizar(texto);

  const doCliente = cat.aliasesSubcentro.find(
    (a) => a.cliente_id !== null && normalizar(a.alias_text) === alvo,
  );
  if (doCliente) return { valor: doCliente.subcentro, origem: 'alias', rotulo: doCliente.subcentro };

  const global = cat.aliasesSubcentro.find(
    (a) => a.cliente_id === null && normalizar(a.alias_text) === alvo,
  );
  if (global) return { valor: global.subcentro, origem: 'alias', rotulo: global.subcentro };

  const direto = cat.classificacoes.find((c) => normalizar(c.subcentro) === alvo);
  if (direto) return { valor: direto.subcentro, origem: 'cadastro', rotulo: direto.subcentro };

  return { valor: null, origem: 'pendente', rotulo: null };
}

/**
 * Fazenda. Sem memória própria por decisão do briefing — testa as DUAS chaves
 * do cadastro (codigo_importacao e codigo), que podem divergir entre si
 * (V2Fazendas atualiza só codigo_importacao). O que não resolver fica na sessão.
 */
export function preResolverFazenda(
  texto: string,
  fazendas: Fazenda[],
): Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'> {
  const alvo = normalizar(texto);
  const achou = fazendas.find((f) =>
    (f.codigo_importacao ? normalizar(f.codigo_importacao) === alvo : false) ||
    (f.codigo ? normalizar(f.codigo) === alvo : false) ||
    normalizar(f.nome) === alvo);
  return achou
    ? { valor: achou.id, origem: 'cadastro', rotulo: achou.nome }
    : { valor: null, origem: 'pendente', rotulo: null };
}

/**
 * Fornecedor. Nome exato normalizado (mesma régua do servidor) + aliases do cadastro.
 * Os aliases vêm SEPARADOS porque loadFornecedores (useFinanceiroV2) não seleciona a
 * coluna `aliases`; o hook busca o mapa à parte e injeta aqui. Sem cast.
 */
export function preResolverFornecedor(
  texto: string,
  fornecedores: FornecedorV2[],
  aliasesPorFornecedor: Readonly<Record<string, string[]>>,
): Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'> {
  const alvo = normalizar(texto);

  const porAlias = fornecedores.find((f) =>
    (aliasesPorFornecedor[f.id] ?? []).some((a) => normalizar(String(a)) === alvo));
  if (porAlias) return { valor: porAlias.id, origem: 'alias', rotulo: porAlias.nome };

  const porNome = fornecedores.find((f) => normalizar(f.nome) === alvo);
  if (porNome) return { valor: porNome.id, origem: 'cadastro', rotulo: porNome.nome };

  return { valor: null, origem: 'pendente', rotulo: null };
}

/** Conta bancária. Delega ao resolvedor soberano (camada 0 = alias jsonb do cadastro). */
export function preResolverConta(
  texto: string,
  contas: ContaResolvivel[],
): Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'> {
  const r = resolverContaPorTexto(texto, contas);
  if (!r) return { valor: null, origem: 'pendente', rotulo: null };
  return {
    valor: r.id,
    origem: r.estrategia === 'alias' ? 'alias' : 'cadastro',
    rotulo: r.nome_exibicao,
  };
}

// ─── Montagem dos quatro painéis ────────────────────────────────────

export interface DeParaCompleto {
  subcentro: DeParaMap;
  fazenda: DeParaMap;
  fornecedor: DeParaMap;
  conta: DeParaMap;
}

function montarMapa(
  itens: Array<{ texto: string; qtd: number }>,
  resolver: (texto: string) => Pick<DeParaItem, 'valor' | 'origem' | 'rotulo'>,
): DeParaMap {
  const out: DeParaMap = {};
  for (const { texto, qtd } of itens) {
    const r = resolver(texto);
    out[texto] = { texto, qtd, ...r, anterior: r.origem === 'alias' ? r.rotulo : null };
  }
  return out;
}

export function montarDePara(
  rows: LancamentoExcelRow[],
  cat: CatalogosImport,
): DeParaCompleto {
  return {
    subcentro: montarMapa(distintos(rows, (r) => r.conta_plano_texto), (t) =>
      preResolverSubcentro(t, cat)),
    fazenda: montarMapa(distintos(rows, (r) => r.fazenda_texto), (t) =>
      preResolverFazenda(t, cat.fazendas)),
    fornecedor: montarMapa(distintos(rows, (r) => r.fornecedor_texto), (t) =>
      preResolverFornecedor(t, cat.fornecedores, cat.aliasesFornecedor)),
    conta: montarMapa(distintos(rows, (r) => r.conta_bancaria_texto), (t) =>
      preResolverConta(t, cat.contas)),
  };
}

/** Quantos ainda faltam resolver, por painel e no total. */
export function contarPendentes(dp: DeParaCompleto) {
  const p = (m: DeParaMap) => Object.values(m).filter((i) => i.valor === null).length;
  const subcentro = p(dp.subcentro);
  const fazenda = p(dp.fazenda);
  const fornecedor = p(dp.fornecedor);
  const conta = p(dp.conta);
  return { subcentro, fazenda, fornecedor, conta, total: subcentro + fazenda + fornecedor + conta };
}

// ─── Prévia ─────────────────────────────────────────────────────────

/** Motivos de exclusão. Ordem de precedência = ordem de avaliação em avaliarLinha. */
export type MotivoExclusao =
  | 'transferencia'
  | 'fazenda_nao_resolvida'
  | 'mes_fechado'
  | 'subcentro_nao_resolvido';

export const MOTIVO_LABEL: Record<MotivoExclusao, string> = {
  transferencia: 'Transferência — não é criada por esta importação',
  fazenda_nao_resolvida: 'Fazenda não resolvida',
  mes_fechado: 'Mês fechado para esta fazenda',
  subcentro_nao_resolvido: 'Conta do plano ainda não mapeada',
};

export interface LinhaPrevia {
  row: LancamentoExcelRow;
  /** ano_mes derivado da COMPETÊNCIA — é o trigger do banco que manda. */
  anoMes: string;
  fazendaId: string | null;
  fazendaNome: string | null;
  subcentro: string | null;
  favorecidoId: string | null;
  contaBancariaId: string | null;
  entra: boolean;
  motivo: MotivoExclusao | null;
}

/**
 * ano_mes SEMPRE da data_competencia — espelha
 * trg_00_ano_mes_from_competencia: `NEW.ano_mes := to_char(NEW.data_competencia,'YYYY-MM')`.
 * data_pagamento NÃO governa o mês, e por isso não governa o teste de fechamento.
 */
export function anoMesDaCompetencia(dataCompetencia: string): string {
  return dataCompetencia.slice(0, 7);
}

function valorDe(m: DeParaMap, texto: string | null): DeParaItem | null {
  if (!texto) return null;
  return m[texto.trim()] ?? null;
}

export function avaliarLinha(
  row: LancamentoExcelRow,
  dp: DeParaCompleto,
  fechados: ReadonlySet<ChaveFechamento>,
  fazendaCabecalhoId: string | null,
  fazendaCabecalhoNome: string | null,
): LinhaPrevia {
  const anoMes = anoMesDaCompetencia(row.data_competencia ?? '');

  const itFaz = valorDe(dp.fazenda, row.fazenda_texto);
  const fazendaId = itFaz?.valor ?? fazendaCabecalhoId;
  const fazendaNome = itFaz?.rotulo ?? fazendaCabecalhoNome;

  const itSub = valorDe(dp.subcentro, row.conta_plano_texto);
  const itForn = valorDe(dp.fornecedor, row.fornecedor_texto);
  const itConta = valorDe(dp.conta, row.conta_bancaria_texto);

  const base = {
    row, anoMes, fazendaId, fazendaNome,
    subcentro: itSub?.valor ?? null,
    favorecidoId: itForn?.valor ?? null,
    contaBancariaId: itConta?.valor ?? null,
  };

  // Precedência: o motivo mais estrutural primeiro, para o operador ver a causa
  // raiz e não um sintoma. Transferência não é resolvível por de-para nenhum.
  if (row.tipo_operacao === TIPO_TRANSFERENCIAS) {
    return { ...base, entra: false, motivo: 'transferencia' };
  }
  if (!fazendaId) {
    return { ...base, entra: false, motivo: 'fazenda_nao_resolvida' };
  }
  if (fechados.has(chaveFechamento(fazendaId, anoMes))) {
    return { ...base, entra: false, motivo: 'mes_fechado' };
  }
  if (!base.subcentro) {
    return { ...base, entra: false, motivo: 'subcentro_nao_resolvido' };
  }
  return { ...base, entra: true, motivo: null };
}

export interface TotaisPrevia {
  entram: { qtd: number; valor: number };
  ficamDeFora: { qtd: number; valor: number };
  porMotivo: Array<{ motivo: MotivoExclusao; qtd: number; valor: number }>;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function montarPrevia(
  rows: LancamentoExcelRow[],
  dp: DeParaCompleto,
  fechados: ReadonlySet<ChaveFechamento>,
  fazendaCabecalhoId: string | null,
  fazendaCabecalhoNome: string | null,
): { linhas: LinhaPrevia[]; totais: TotaisPrevia } {
  const linhas = rows.map((r) =>
    avaliarLinha(r, dp, fechados, fazendaCabecalhoId, fazendaCabecalhoNome));

  let qtdEntram = 0, valEntram = 0, qtdFora = 0, valFora = 0;
  const porMotivo = new Map<MotivoExclusao, { qtd: number; valor: number }>();

  for (const l of linhas) {
    const v = Math.abs(Number(l.row.valor) || 0);
    if (l.entra) { qtdEntram++; valEntram += v; continue; }
    qtdFora++; valFora += v;
    if (l.motivo) {
      const cur = porMotivo.get(l.motivo) ?? { qtd: 0, valor: 0 };
      porMotivo.set(l.motivo, { qtd: cur.qtd + 1, valor: cur.valor + v });
    }
  }

  return {
    linhas,
    totais: {
      entram: { qtd: qtdEntram, valor: r2(valEntram) },
      ficamDeFora: { qtd: qtdFora, valor: r2(valFora) },
      porMotivo: [...porMotivo.entries()]
        .map(([motivo, v]) => ({ motivo, qtd: v.qtd, valor: r2(v.valor) }))
        .sort((a, b) => b.qtd - a.qtd),
    },
  };
}

/**
 * Tipo de operação predominante por texto de conta do plano. O PlanoSubcentroSelect
 * filtra a subárvore por tipo; como o de-para é por TEXTO (não por linha), usamos o
 * tipo mais frequente entre as linhas que usam aquele texto. Empate → o primeiro visto.
 */
export function tipoPorContaPlano(rows: LancamentoExcelRow[]): Record<string, string> {
  const cont = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const t = r.conta_plano_texto?.trim();
    if (!t || !r.tipo_operacao) continue;
    const m = cont.get(t) ?? new Map<string, number>();
    m.set(r.tipo_operacao, (m.get(r.tipo_operacao) ?? 0) + 1);
    cont.set(t, m);
  }
  const out: Record<string, string> = {};
  for (const [texto, m] of cont.entries()) {
    let melhor: string | null = null;
    let max = -1;
    for (const [tipo, n] of m.entries()) if (n > max) { max = n; melhor = tipo; }
    if (melhor) out[texto] = melhor;
  }
  return out;
}
