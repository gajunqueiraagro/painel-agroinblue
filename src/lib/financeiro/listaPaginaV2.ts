/**
 * FIN-V2-DESEMPENHO-01b — a lista de Lançamentos Financeiros paginada NO SERVIDOR (`fn_fin_v2_lista_pagina`, a RPC do 01a).
 * Aqui: os filtros CRUS da tela no formato da RPC (`filtrosDaPaginaV2`), a ordem (`ordemDaPaginaV2`), o leitor da resposta sem cast
 * (peça torta = nulo inteiro, nunca zeros inventados) e as frases do rodapé. Quem filtra, ordena, conta e soma é o BANCO; a tela só
 * desenha a página e lê os totais do recorte INTEIRO.
 */
import type { LancamentoV2 } from '@/hooks/useFinanceiroV2';
import type { TotaisDaListaV2 } from '@/lib/financeiro/totaisDaListaV2';
import type { ModoSemCaixa, NivelClassificacao } from '@/lib/financeiro/colunasDaListaV2';
import { reservaDeNumero } from '@/components/ui/regua-tabela';

/** O estado dos filtros da tela, como ela o guarda (sentinela `__all__` = Todos). */
export interface FiltrosDaTelaV2 {
  fazendaId: string; anos: readonly string[]; meses: readonly string[]; dimensao: 'financeira' | 'competencia' | 'vencimento' | 'pagamento';
  tipoOperacao: string; status: readonly string[]; contaOrigem: string; contaDestino: string;
  macro: string; grupo: string; centro: string; subcentro: string; safra: string; cultura: string; atividade: string;
  produto: string; documento: string; fornecedor: string; modoSemCaixa: ModoSemCaixa;
}

const valor = (v: string) => (v && v !== '__all__' ? v : undefined);
const inteiros = (xs: readonly string[]) => xs.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);

/** Os filtros no formato de `p_filtros` (ausente = Todos). O produto e o documento vão como digitados (a RPC compara como a tela). */
export function filtrosDaPaginaV2(f: FiltrosDaTelaV2): Record<string, unknown> {
  const out: Record<string, unknown> = { dimensao: f.dimensao, modo_sem_caixa: f.modoSemCaixa };
  const por: [string, string | undefined][] = [
    ['fazenda_id', valor(f.fazendaId)], ['tipo_operacao', valor(f.tipoOperacao)], ['conta_origem', valor(f.contaOrigem)],
    ['conta_destino', valor(f.contaDestino)], ['macro', valor(f.macro)], ['grupo', valor(f.grupo)], ['centro', valor(f.centro)],
    ['subcentro', valor(f.subcentro)], ['safra', valor(f.safra)], ['cultura', valor(f.cultura)], ['atividade', valor(f.atividade)],
    ['fornecedor_id', valor(f.fornecedor)],
    ['produto', f.produto.trim() ? f.produto : undefined], ['documento', f.documento.trim() ? f.documento : undefined],
  ];
  for (const [k, v] of por) if (v !== undefined) out[k] = v;
  const anos = inteiros(f.anos); const meses = inteiros(f.meses);
  if (anos.length) out.anos = anos;
  if (meses.length) out.meses = meses;
  if (f.status.length) out.status = [...f.status];
  return out;
}

export type CampoDeOrdemV2 = 'default' | 'data' | 'venc' | 'pgto' | 'valor' | 'produto' | 'fornecedor' | 'centro' | 'status' | 'doc' | 'safra';
/** A ordem no formato de `p_ordem`; os campos têm os MESMOS nomes do `SortField` da tela. */
export function ordemDaPaginaV2(campo: CampoDeOrdemV2, dir: 'asc' | 'desc', nivel: NivelClassificacao): Record<string, string> {
  return { campo, dir, nivel };
}

export interface PaginaDaListaV2 {
  linhas: LancamentoV2[];
  /** os ids com vínculo vivo de extrato, como a RPC os marca (`conciliado`) */
  conciliados: ReadonlySet<string>;
  total: number;
  totais: TotaisDaListaV2;
  semCaixa: { linhas: number; total: number };
  /** FIN-V2-FILTRO-FORNECEDOR-01 — quantos lançamentos cada fornecedor tem no recorte (SEM o filtro de fornecedor), da RPC */
  usoPorFornecedor: ReadonlyMap<string, number>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/* sem cast: o objeto se lê campo a campo (`Reflect.get`); o que não é objeto vira nulo */
const obj = (v: unknown): object | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null);
const g = (o: object, k: string): unknown => Reflect.get(o, k);
function ehLinha(v: unknown): v is LancamentoV2 {
  const o = obj(v);
  return !!o && typeof g(o, 'id') === 'string' && typeof g(o, 'cliente_id') === 'string';
}

/** FIN-V2-DESEMPENHO-01c — o leitor da resposta "só linhas" (`so_linhas`: trocar de página sem recontar): as linhas, os conciliados e
 *  o total; peça torta = nulo. */
export function lerLinhasV2(r: unknown): Pick<PaginaDaListaV2, 'linhas' | 'conciliados' | 'total'> | null {
  const o = obj(r); if (!o) return null;
  const total = num(g(o, 'total_linhas')); const brutas = g(o, 'linhas');
  if (total === null || !Array.isArray(brutas)) return null;
  const linhas: LancamentoV2[] = [];
  const conciliados = new Set<string>();
  for (const l of brutas) {
    if (!ehLinha(l)) return null;
    linhas.push(l);
    if (g(l, 'conciliado') === true) conciliados.add(l.id);
  }
  return { linhas, conciliados, total };
}

/** P73 — o leitor da resposta "só os ids salvos" (`so_ids`): as linhas e os conciliados, sem total (a RPC não reconta); peça torta = nulo. */
export function lerSoIdsV2(r: unknown): Pick<PaginaDaListaV2, 'linhas' | 'conciliados'> | null {
  const o = obj(r); if (!o) return null;
  const brutas = g(o, 'linhas');
  if (!Array.isArray(brutas)) return null;
  const linhas: LancamentoV2[] = [];
  const conciliados = new Set<string>();
  for (const l of brutas) {
    if (!ehLinha(l)) return null;
    linhas.push(l);
    if (g(l, 'conciliado') === true) conciliados.add(l.id);
  }
  return { linhas, conciliados };
}

/* P73 — o que, mudando na linha, mexe nos totais do rodapé, no "sem caixa" ou no uso por fornecedor do recorte */
const CAMPOS_DOS_TOTAIS = ['valor', 'sinal', 'tipo_operacao', 'status_transacao', 'sem_movimentacao_caixa', 'conta_bancaria_id',
  'conta_destino_id', 'conta_efetiva_id', 'cancelado', 'favorecido_id'];
const FILTROS_DE_CONTA = ['macro', 'grupo', 'centro', 'subcentro'];

/** P73 — salvou: os totais do recorte precisam ser relidos? Sim quando um campo que soma mudou, ou quando a linha é (ou era) DIVIDIDA
 *  com filtro de conta ativo (o total soma o valor da PARTE, que a linha não mostra). */
export function precisaDosTotaisV2(antes: LancamentoV2, depois: LancamentoV2, filtros: Record<string, unknown>): boolean {
  if (CAMPOS_DOS_TOTAIS.some((k) => g(antes, k) !== g(depois, k))) return true;
  const dividida = g(antes, 'classificacao_dividida') === true || g(depois, 'classificacao_dividida') === true;
  return dividida && FILTROS_DE_CONTA.some((k) => g(filtros, k) !== undefined);
}

/** P73 — a página com as linhas relidas no LUGAR delas (mesma posição); a marca de conciliado dessas linhas sai da releitura. */
export function trocarLinhasV2(pagina: PaginaDaListaV2, novas: Pick<PaginaDaListaV2, 'linhas' | 'conciliados'>): PaginaDaListaV2 {
  const porId = new Map(novas.linhas.map((l) => [l.id, l]));
  const conciliados = new Set(pagina.conciliados);
  for (const id of porId.keys()) { if (novas.conciliados.has(id)) conciliados.add(id); else conciliados.delete(id); }
  return { ...pagina, linhas: pagina.linhas.map((l) => porId.get(l.id) ?? l), conciliados };
}

/** O leitor da resposta: qualquer peça torta = nulo (a tela diz que não carregou; nunca "0 lançamentos"). */
export function lerPaginaV2(r: unknown): PaginaDaListaV2 | null {
  const o = obj(r); if (!o) return null;
  const base = lerLinhasV2(r); const t = obj(g(o, 'totais')); const sc = obj(g(o, 'sem_caixa'));
  const forn = obj(g(o, 'fornecedores'));
  if (!base || !t || !sc || !forn) return null;
  const entradas = num(g(t, 'entradas')), saidas = num(g(t, 'saidas')), transferencias = num(g(t, 'transferencias'));
  const entradasSemCaixa = num(g(t, 'entradas_sem_caixa')), saidasSemCaixa = num(g(t, 'saidas_sem_caixa'));
  const scLinhas = num(g(sc, 'linhas')), scTotal = num(g(sc, 'total'));
  if (entradas === null || saidas === null || transferencias === null || entradasSemCaixa === null || saidasSemCaixa === null
    || scLinhas === null || scTotal === null) return null;
  const { linhas, conciliados, total } = base;
  const usoPorFornecedor = new Map<string, number>();
  for (const [id, v] of Object.entries(forn)) {
    const n = num(v);
    if (n === null) return null;
    usoPorFornecedor.set(id, n);
  }
  return {
    linhas, conciliados, total,
    totais: { entradas, saidas, transferencias, entradasSemCaixa, saidasSemCaixa },
    semCaixa: { linhas: scLinhas, total: scTotal },
    usoPorFornecedor,
  };
}

/**
 * FIN-V2-FILTRO-FORNECEDOR-01 (Gabriel 22/10: "tem que aparecer só o que é ativo… isso tava funcionando") — a lista do filtro de
 * fornecedor: os cadastros ATIVOS; o inativo só quando tem lançamento no recorte; o MESCLADO nunca (o nome antigo dele acha o destino
 * pelos apelidos). Cada um com o uso do servidor no recorte (`usoPorFornecedor`); sem a contagem ainda (página carregando), uso nulo.
 */
export function fornecedoresDoFiltroV2<F extends { id: string; ativo?: boolean | null; fundido_em_id?: string | null }>(
  cadastro: readonly F[], uso: ReadonlyMap<string, number> | null,
): (F & { uso: number | null })[] {
  const lista: (F & { uso: number | null })[] = [];
  for (const f of cadastro) {
    if (f.fundido_em_id) continue;
    const n = uso ? (uso.get(f.id) ?? 0) : null;
    if (f.ativo === false && !(n && n > 0)) continue;
    lista.push({ ...f, uso: n });
  }
  return lista;
}

/** "Mostrando 1–200 de 5.303" — com zero, "Nenhum lançamento" */
export function intervaloDaPaginaV2(total: number, pagina: number, porPagina: number): string {
  if (total <= 0) return 'Nenhum lançamento';
  const de = pagina * porPagina + 1, ate = Math.min((pagina + 1) * porPagina, total);
  return `Mostrando ${de.toLocaleString('pt-BR')}–${ate.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`;
}
export const paginasDaListaV2 = (total: number, porPagina: number) => Math.max(1, Math.ceil(total / porPagina));

/** As reservas dos textos do rodapé (o maior possível para o maior total já lido; algarismos tabulares): nada se desloca. */
export function reservasDaPaginaV2(maiorTotal: number): { intervalo: string; pagina: string } {
  const d = Math.max(1, String(Math.max(0, Math.floor(maiorTotal))).length);
  const n = reservaDeNumero(d);
  return { intervalo: `Mostrando ${n}–${n} de ${n}`, pagina: `Página ${n} de ${n}` };
}

/* a memória do "Por página" desta lista, por usuário e navegador; sem armazenamento, o padrão (200) */
export const POR_PAGINA_V2 = [50, 100, 200] as const;
export type PorPaginaV2 = (typeof POR_PAGINA_V2)[number];
export type PorPaginaV2Texto = '50' | '100' | '200';
export const porPaginaV2DoTexto = (v: PorPaginaV2Texto): PorPaginaV2 => (v === '50' ? 50 : v === '100' ? 100 : 200);
export const textoDoPorPaginaV2 = (v: PorPaginaV2): PorPaginaV2Texto => (v === 50 ? '50' : v === 100 ? '100' : '200');
const CHAVE = 'fin-v2-lista-por-pagina:';
export function lerPorPaginaV2(usuario: string | null): PorPaginaV2 {
  try {
    const v = Number(window.localStorage.getItem(CHAVE + (usuario ?? 'sem-usuario')));
    return v === 50 || v === 100 ? v : 200;
  } catch { return 200; }
}
export function guardarPorPaginaV2(usuario: string | null, v: PorPaginaV2): void {
  try { window.localStorage.setItem(CHAVE + (usuario ?? 'sem-usuario'), String(v)); } catch { /* sem armazenamento: só a sessão */ }
}

/** Sem resposta do servidor: zeros só como peça vazia; a faixa mostra "—" (quem decide é `paginaDaLista` nulo). */
export const TOTAIS_VAZIOS: TotaisDaListaV2 = { entradas: 0, saidas: 0, transferencias: 0, entradasSemCaixa: 0, saidasSemCaixa: 0 };
