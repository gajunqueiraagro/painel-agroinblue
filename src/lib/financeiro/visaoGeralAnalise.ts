/**
 * FIN-VISAO-GERAL-01 PR 4 (SPEC §4, §6, §7) — o MODAL DE ANÁLISE da Visão Geral: tipos, o pedido ao banco e a NAVEGAÇÃO.
 * A tela NUNCA soma: valor, meta, Dif. R$, %, KPIs, fatias do donut e faixa da régua vêm prontos da `fn_vg_analise`. Aqui só se
 * decide O QUE pedir (aba, foco, item do gráfico, mês, critério, unidade) e se escreve o número que veio.
 *   · Árvore: Raiz (lado) › Grupo › Atividade › Centro › Subcentro. Um nó é o seu CAMINHO ([grupo, atividade, centro, subcentro] até a
 *     profundidade dele; atividade/centro nulos vão como null).
 *   · ABA = o grupo (ou a raiz) da tabela da esquerda e do resumo; FOCO = o nó cujos SUBCENTROS vão na tabela da direita (P100, 111951:
 *     todos os do nível 4 abaixo dele — nunca os filhos, que repetiam a esquerda); GRÁFICO = o foco, um filho dele ou um desses
 *     subcentros.
 */
import { supabase } from '@/integrations/supabase/client';
import { pct1, type LadoVG } from '@/lib/financeiro/visaoGeral';

export type CriterioVG = 'mes' | 'media' | 'acumulado';
export type UnidadeVG = 'rs' | 'rs_cab' | 'rs_ua' | 'rs_arroba' | 'rs_ha_prod' | 'rs_ha_pec' | 'rs_ha_agri' | 'rs_ha_plant';
export type CaminhoVG = (string | null)[];
export type FaixaMetaVG = 'boa' | 'ideal' | 'risco' | 'critica';

export interface LinhaAnaliseVG {
  caminho: CaminhoVG; rotulo: string; grupo: string | null;
  valor: number | null; meta: number | null; dif: number | null; pct: number | null; razao: number | null;
  qtd: number; unidade_valida: boolean; faixa: FaixaMetaVG | null;
  /** P100: só nas linhas da tabela da direita (os subcentros) — o centro do subcentro */
  centro?: string | null;
  /** VG-CUSTEIO-FIXO-VARIAVEL-01: só nas linhas de CENTRO — o bloco pelo `grupo_custo` do Plano de Contas */
  bloco?: BlocoCentroVG;
}
export type BlocoCentroVG = 'variavel' | 'fixo' | 'sem';
/** VG-CUSTEIO-FIXO-VARIAVEL-01 (115510): o SUBTOTAL de um bloco de centros — do banco, na mesma conta das linhas (a tela não soma) */
export interface BlocoAnaliseVG {
  bloco: BlocoCentroVG; rotulo: string; centros: number;
  valor: number | null; meta: number | null; dif: number | null; pct: number | null; razao: number | null;
  qtd: number; unidade_valida: boolean;
}
export interface PontoAnaliseVG { am: string; realizado: number | null; previsto: number | null; total: number | null; media: number | null; meta: number | null }
export interface AnaliseVG {
  lado: LadoVG; mes: string; criterio: CriterioVG; unidade: UnidadeVG; meses_janela: number;
  periodo: { de: string; ate_mes: string };
  abas: { grupo: string; rotulo: string }[];
  unidades: { id: UnidadeVG; rotulo: string; valida: boolean }[];
  resumo: (LinhaAnaliseVG & { valor_rs: number | null; pct_da_raiz: number | null;
    fatias: { caminho: CaminhoVG; rotulo: string; grupo: string | null; pct: number | null }[] }) | null;
  /** P100 v4 (111952): a tabela da ESQUERDA navega um nível por vez — `nivel` = o caminho do nível mostrado (a aba, a atividade
      escolhida, ou a atividade do centro escolhido); `total` = ele; `linhas` = os filhos dele */
  tabela: { total: LinhaAnaliseVG | null; linhas: LinhaAnaliseVG[]; nivel?: CaminhoVG;
    /** VG-CUSTEIO-FIXO-VARIAVEL-01 (115510): no nível de uma atividade de produção, os blocos (variável, fixo, sem classificação) na
        ordem do DRE; fora dele, nulo */
    blocos?: BlocoAnaliseVG[] | null };
  foco: { total: LinhaAnaliseVG | null; linhas: LinhaAnaliseVG[] };
  grafico: {
    item: LinhaAnaliseVG | null; caminho: { caminho: CaminhoVG; rotulo: string }[]; irmaos: CaminhoVG[]; serie: PontoAnaliseVG[];
    /** P103 (111954): no ACUMULADO a `serie` é acumulada mês a mês (colunas e meta; `media` nula); `mes` = o acumulado até o mês,
        `meta` = a meta acumulada (no mês e na média, a do mês), `media` e `tendencia` nulas */
    kpis: { mes: number | null; meta?: number | null; media: number | null; vs_meta: number | null; tendencia: number | null } | null;
  };
}

/** o que o modal pede: muda por clique; o resto (período, contas, fazenda, atividade, status) vem da tela */
export interface EstadoAnaliseVG {
  lado: LadoVG; aba: string | null; foco: CaminhoVG; grafico: CaminhoVG | null; am: string; criterio: CriterioVG; unidade: UnidadeVG;
}
export interface ContextoAnaliseVG {
  clienteId: string; de: string; ate: string; contas: string[] | null; fazendas: string[] | null; atividade: string | null; hoje: string;
  status: string[]; comVencidos: boolean;
}

export const estadoInicialAnalise = (lado: LadoVG, grupo: string | null, am: string): EstadoAnaliseVG => ({
  lado, aba: grupo, foco: grupo ? [grupo] : [], grafico: null, am, criterio: 'mes', unidade: 'rs',
});

export async function carregarAnaliseVG(ctx: ContextoAnaliseVG, e: EstadoAnaliseVG): Promise<AnaliseVG> {
  const { data, error } = await (supabase.rpc as any)('fn_vg_analise', {
    p_cliente: ctx.clienteId, p_de: ctx.de, p_ate: ctx.ate, p_mes: e.am, p_lado: e.lado,
    p_aba: e.aba, p_foco: e.foco, p_grafico: e.grafico, p_criterio: e.criterio, p_unidade: e.unidade,
    p_contas: ctx.contas, p_fazendas: ctx.fazendas, p_atividade: ctx.atividade, p_hoje: ctx.hoje,
    p_status: ctx.status, p_incluir_vencidos: ctx.comVencidos,
  });
  if (error) throw new Error(error.message);
  return data as AnaliseVG;
}

// ── navegação (nunca soma: só escolhe caminhos que o banco devolveu) ─────────────────────────────────────────────────────────
export const mesmoCaminho = (a: CaminhoVG | null | undefined, b: CaminhoVG | null | undefined) =>
  !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
export const chaveCaminho = (c: CaminhoVG) => JSON.stringify(c);

/** a aba: a raiz (null) ou um grupo — o foco e o gráfico voltam para ela */
export const irParaAba = (e: EstadoAnaliseVG, grupo: string | null): EstadoAnaliseVG =>
  ({ ...e, aba: grupo, foco: grupo ? [grupo] : [], grafico: null });

/**
 * VG-CUSTEIO-FIXO-VARIAVEL-01 — as linhas da esquerda nos BLOCOS que o banco mandou (na ordem dele: variável, fixo, sem classificação),
 * cada linha com o índice que tinha (a cor e o testid não mudam) e, dentro do bloco, na ordem de hoje. Sem `blocos`, `null` (a lista
 * corrida de hoje). Só agrupa: o subtotal é o do banco.
 */
export function linhasEmBlocos(tabela: AnaliseVG['tabela']): { bloco: BlocoAnaliseVG; linhas: { l: LinhaAnaliseVG; i: number }[] }[] | null {
  if (!tabela.blocos || tabela.blocos.length === 0) return null;
  const comIndice = tabela.linhas.map((l, i) => ({ l, i }));
  return tabela.blocos.map((bloco) => ({ bloco, linhas: comIndice.filter((x) => (x.l.bloco ?? 'sem') === bloco.bloco) }));
}

/** clique numa linha da tabela da ESQUERDA (um filho do nível mostrado, ou o total = o próprio nível): ela vira a SELEÇÃO (o foco).
    P100 v4: a esquerda navega — grupo ou atividade escolhidos DESCEM (a tabela passa a mostrar os filhos deles); o centro fica só
    selecionado (o último nível dela). O gráfico volta à seleção. */
export const escolherNaEsquerda = (e: EstadoAnaliseVG, caminho: CaminhoVG): EstadoAnaliseVG => ({ ...e, foco: caminho, grafico: null });

/** "‹" do título da esquerda: sobe um nível (nunca acima da aba) — a seleção vira o nível de cima */
export const subirNaEsquerda = (e: EstadoAnaliseVG, nivel: CaminhoVG): EstadoAnaliseVG =>
  (nivel.length <= (e.aba ? 1 : 0) ? e : { ...e, foco: nivel.slice(0, -1), grafico: null });
/** o título da tabela da esquerda pelo nível mostrado */
export const TITULO_NIVEL_ESQ = ['Grupos', 'Atividades', 'Centros'] as const;

/** clique numa linha da tabela da DIREITA (um subcentro do foco): o gráfico mostra ela; clicar de novo volta ao foco */
export const escolherNaDireita = (e: EstadoAnaliseVG, caminho: CaminhoVG): EstadoAnaliseVG =>
  ({ ...e, grafico: mesmoCaminho(e.grafico, caminho) ? null : caminho });

/** "abrir" um filho do foco: ele vira o foco (desce um nível; o subcentro é o último) */
export const descer = (e: EstadoAnaliseVG, caminho: CaminhoVG): EstadoAnaliseVG =>
  (caminho.length >= 4 ? e : { ...e, foco: caminho, grafico: null });

/** o caminho clicável do gráfico: a raiz e o grupo trocam a ABA (como no mock); abaixo, o nível vira o foco */
export const irParaCaminho = (e: EstadoAnaliseVG, caminho: CaminhoVG): EstadoAnaliseVG => {
  if (caminho.length === 0) return irParaAba(e, null);
  if (caminho.length === 1) return irParaAba(e, caminho[0]);
  return { ...e, foco: caminho, grafico: null };
};

/** ‹ › entre os irmãos do item do gráfico (a ordem é a do banco). O foco sem item escolhido anda ele mesmo; no 1º nível, a aba anda
    junto (o foco nunca sai da aba). */
export const andarEntreIrmaos = (e: EstadoAnaliseVG, irmaos: CaminhoVG[], passo: 1 | -1): EstadoAnaliseVG => {
  if (irmaos.length < 2) return e;
  const atual = e.grafico ?? e.foco;
  const i = irmaos.findIndex((c) => mesmoCaminho(c, atual));
  const prox = irmaos[(Math.max(i, 0) + passo + irmaos.length) % irmaos.length];
  if (e.grafico) return { ...e, grafico: prox };
  if (prox.length === 1 && e.aba !== null) return irParaAba(e, prox[0]);
  return { ...e, foco: prox };
};

// ── escrita ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** variação com sinal (vs meta, tendência, %): "+12,3%" / "−4,0%" — o número é o do banco */
export const pctVar = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${pct1(v)}`);

export const ROTULO_CRITERIO = (am: string, rotuloMes: (am: string) => string): Record<CriterioVG, string> =>
  ({ mes: rotuloMes(am), media: 'Média do período', acumulado: 'Acumulado' });

/** os nomes da régua "vs meta" pelo lado (a faixa vem do banco) */
export const ROTULO_FAIXA: Record<LadoVG, Record<FaixaMetaVG, string>> = {
  /* P103 — rótulos CURTOS, que cabem na faixa em toda largura (a régua tem 180px; a faixa estreita, 18% = 32px): sem "…". Antes
     "na meta" e "muito abaixo" cortavam ("na meta" → "na met") */
  saida: { boa: 'economia', ideal: 'ideal', risco: 'risco', critica: 'crítico' },
  entrada: { boa: 'acima', ideal: 'meta', risco: 'abaixo', critica: 'crítico' },
};
export const COR_FAIXA: Record<FaixaMetaVG, { fundo: string; texto: string }> = {
  boa: { fundo: '#3b6db3', texto: '#fff' }, ideal: { fundo: '#6fb3d9', texto: '#10304a' },
  risco: { fundo: '#f2d34f', texto: '#4a3b00' }, critica: { fundo: '#d9534f', texto: '#fff' },
};
/** onde a marca fica na régua: posição do desenho pela razão valor/meta que o banco devolveu (os cortes da régua são os do banco) */
export function posicaoNaRegua(lado: LadoVG, razao: number | null): number | null {
  if (razao == null) return null;
  const r = razao;
  const p = lado === 'saida'
    ? (r < 0.9 ? (r / 0.9) * 36 : r < 1 ? 36 + ((r - 0.9) / 0.1) * 18 : r < 1.15 ? 54 + ((r - 1) / 0.15) * 18 : 72 + Math.min(1, (r - 1.15) / 0.35) * 28)
    : (r >= 1.1 ? Math.min(36, (1 - Math.min(1, (r - 1.1) / 0.4)) * 36) : r >= 1 ? 36 + ((1.1 - r) / 0.1) * 18 : r >= 0.85 ? 54 + ((1 - r) / 0.15) * 18 : 72 + Math.min(1, (0.85 - r) / 0.35) * 28);
  return Math.max(0, Math.min(100, p));
}
