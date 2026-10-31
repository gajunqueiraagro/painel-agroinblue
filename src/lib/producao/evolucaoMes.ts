/**
 * PROD-EVOLUCAO-01b — o nível 2 da Evolução do rebanho: o MÊS por categoria, para CONFERIR (mock v4 aprovado pelo Gabriel 30/10 17:13).
 *
 * - As 9 categorias SEMPRE, na ordem do Fechamento (`categorias_rebanho.ordem_exibicao`), com subtotal de Machos e de Fêmeas e o Total — categoria
 *   sem dado no mês aparece com "—" (antes ela SUMIA da tela).
 * - Cada tipo de movimento do mês com CABEÇAS e KG/CAB; o tipo sem movimento no mês fica escondido (a tela avisa quais).
 * - O kg lançado é comparado com o kg/cab FINAL da categoria no Fechamento do mês: âmbar a partir de 15% de diferença, vermelho a partir de 25%
 *   (na evolução de categoria, o "entrou" compara com a categoria de DESTINO).
 * - "Confere": inicial + entradas − saídas + entrou − saiu = final.
 * ⚠ NENHUM NÚMERO MUDA DE FONTE (regra do item, Gabriel 30/10 17:16): saldo inicial, final (`saldo_sistema` no Realizado, como a tela de hoje),
 *   kg/cab final (peso do Fechamento ÷ `saldo_final`), produção biológica e GMD por categoria (PB ÷ cab médias ÷ dias) são as MESMAS contas da
 *   `EvolucaoCategoriaTab` (:120-131, :205-216); só a arrumação é nova.
 */
import type { ZootCategoriaMensal } from '@/hooks/useZootCategoriaMensal';
import type { FluxoTipo } from '@/lib/calculos/zootecnicos';

export const TIPOS_DO_MES: { tipo: FluxoTipo; rotulo: string; lado: 'entrada' | 'saida' }[] = [
  { tipo: 'nascimento', rotulo: 'Nascimento', lado: 'entrada' },
  { tipo: 'compra', rotulo: 'Compra', lado: 'entrada' },
  { tipo: 'transferencia_entrada', rotulo: 'Transf. entrada', lado: 'entrada' },
  { tipo: 'abate', rotulo: 'Abate', lado: 'saida' },
  { tipo: 'venda', rotulo: 'Venda', lado: 'saida' },
  { tipo: 'consumo', rotulo: 'Consumo', lado: 'saida' },
  { tipo: 'morte', rotulo: 'Morte', lado: 'saida' },
  { tipo: 'transferencia_saida', rotulo: 'Transf. saída', lado: 'saida' },
];
const COL_CAB: Record<FluxoTipo, keyof ZootCategoriaMensal> = {
  nascimento: 'cab_nascimento', compra: 'cab_compra', transferencia_entrada: 'cab_transf_entrada', abate: 'cab_abate', venda: 'cab_venda',
  transferencia_saida: 'cab_transf_saida', consumo: 'cab_consumo', morte: 'cab_morte',
};
const COL_KG: Record<FluxoTipo, keyof ZootCategoriaMensal> = {
  nascimento: 'peso_nascimento', compra: 'peso_compra', transferencia_entrada: 'peso_transf_entrada', abate: 'peso_abate', venda: 'peso_venda',
  transferencia_saida: 'peso_transf_saida', consumo: 'peso_consumo', morte: 'peso_morte',
};
/** Os machos do Fechamento (o divisor depois de Touros, `FechamentoTab.tsx:1118`) */
const MACHOS = new Set(['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros']);

export interface CategoriaDoRebanho { codigo: string; nome: string; ordem_exibicao: number }

/** Um par cabeças + kg (o kg é o TOTAL; o kg/cab sai na exibição) */
export interface CabKg { cab: number; kg: number }
const vazio = (): CabKg => ({ cab: 0, kg: 0 });
export const kgPorCab = (v: CabKg): number | null => (v.cab > 0 ? v.kg / v.cab : null);

export interface LinhaDoMes {
  id: string;
  rotulo: string;
  nivel: 'categoria' | 'subtotal' | 'total';
  /** a categoria tem linha no mês (sem linha = "—" em tudo) */
  temDado: boolean;
  inicio: CabKg;
  tipos: Record<FluxoTipo, CabKg>;
  entrou: CabKg;
  saiu: CabKg;
  final: CabKg;
  /** a base do kg/cab final e do GMD: o saldo do Fechamento na categoria, o da tela no total/subtotal (a conta de hoje) */
  finalFechamento: number;
  producaoKg: number | null;
  gmd: number | null;
  dias: number;
}

const somaRows = (rows: ZootCategoriaMensal[], col: keyof ZootCategoriaMensal) => rows.reduce((s, r) => s + (Number(r[col]) || 0), 0);

function linhaDe(id: string, rotulo: string, nivel: LinhaDoMes['nivel'], rows: ZootCategoriaMensal[], cenario: 'realizado' | 'meta'): LinhaDoMes {
  const tipos = {} as Record<FluxoTipo, CabKg>;
  for (const { tipo } of TIPOS_DO_MES) tipos[tipo] = { cab: somaRows(rows, COL_CAB[tipo]), kg: somaRows(rows, COL_KG[tipo]) };
  const si = somaRows(rows, 'saldo_inicial');
  /* o saldo final da tela de hoje: no Realizado o `saldo_sistema` (a cadeia; um nulo no recorte → todos pelo `saldo_final`), senão o `saldo_final`
     (EvolucaoCategoriaTab:205-208, :524-525) */
  const algumNulo = rows.some((r) => r.saldo_sistema == null);
  const sfTela = cenario === 'realizado' && !algumNulo ? rows.reduce((s, r) => s + (r.saldo_sistema ?? 0), 0) : somaRows(rows, 'saldo_final');
  const sfFech = somaRows(rows, 'saldo_final');
  const pb = rows.length ? somaRows(rows, 'producao_biologica') : null;
  const dias = rows[0]?.dias_mes ?? 0;
  /* a MESMA conta de hoje: na CATEGORIA a média de cabeças e o kg/cab final usam o saldo do Fechamento (:120-131); no TOTAL (e nos subtotais,
     que são novos) o saldo da tela (:213-216) */
  const baseFinal = nivel === 'categoria' ? sfFech : sfTela;
  const cabMedias = (si + baseFinal) / 2;
  return {
    id, rotulo, nivel, temDado: rows.length > 0,
    inicio: { cab: si, kg: somaRows(rows, 'peso_total_inicial') },
    tipos,
    entrou: { cab: somaRows(rows, 'evol_cat_entrada'), kg: somaRows(rows, 'peso_evol_cat_entrada') },
    saiu: { cab: somaRows(rows, 'evol_cat_saida'), kg: somaRows(rows, 'peso_evol_cat_saida') },
    final: { cab: sfTela, kg: somaRows(rows, 'peso_total_final') },
    finalFechamento: baseFinal,
    producaoKg: pb,
    gmd: pb != null && cabMedias > 0 && dias > 0 ? pb / cabMedias / dias : null,
    dias,
  };
}

/** kg/cab final da linha = peso do Fechamento ÷ a base (`finalFechamento`) — a conta da tela de hoje */
export const kgCabFinal = (l: LinhaDoMes): number | null => (l.finalFechamento > 0 ? l.final.kg / l.finalFechamento : null);

export interface MesPorCategoria {
  linhas: LinhaDoMes[];
  /** os tipos COM movimento no mês (as colunas); os outros ficam escondidos e a tela diz quais */
  tiposVisiveis: FluxoTipo[];
  tiposEscondidos: FluxoTipo[];
  /** inicial + entradas − saídas + entrou − saiu (Total) e o final da tela */
  confere: { inicio: number; entradas: number; saidas: number; entrou: number; saiu: number; calculado: number; final: number; bate: boolean };
  /** kg/cab final de cada categoria no Fechamento do mês (a régua do desvio) */
  referencia: Map<string, number>;
}

/** O mês por categoria. `rows` = as linhas do cache (com o overlay do Fechamento) DESTE mês, de todas as fazendas do recorte. */
export function montarMesPorCategoria(rows: ZootCategoriaMensal[], categorias: CategoriaDoRebanho[], cenario: 'realizado' | 'meta'): MesPorCategoria {
  const ordenadas = [...categorias].sort((a, b) => a.ordem_exibicao - b.ordem_exibicao);
  const doCodigo = (c: string) => rows.filter((r) => r.categoria_codigo === c);
  const machos = ordenadas.filter((c) => MACHOS.has(c.codigo));
  const femeas = ordenadas.filter((c) => !MACHOS.has(c.codigo));
  const linhas: LinhaDoMes[] = [];
  for (const c of machos) linhas.push(linhaDe(c.codigo, c.nome, 'categoria', doCodigo(c.codigo), cenario));
  linhas.push(linhaDe('machos', 'Machos', 'subtotal', rows.filter((r) => MACHOS.has(r.categoria_codigo)), cenario));
  for (const c of femeas) linhas.push(linhaDe(c.codigo, c.nome, 'categoria', doCodigo(c.codigo), cenario));
  linhas.push(linhaDe('femeas', 'Fêmeas', 'subtotal', rows.filter((r) => !MACHOS.has(r.categoria_codigo)), cenario));
  const total = linhaDe('total', 'Total', 'total', rows, cenario);
  linhas.push(total);

  const tiposVisiveis = TIPOS_DO_MES.filter((t) => total.tipos[t.tipo].cab !== 0).map((t) => t.tipo);
  const tiposEscondidos = TIPOS_DO_MES.filter((t) => total.tipos[t.tipo].cab === 0).map((t) => t.tipo);
  const entradas = TIPOS_DO_MES.filter((t) => t.lado === 'entrada').reduce((s, t) => s + total.tipos[t.tipo].cab, 0);
  const saidas = TIPOS_DO_MES.filter((t) => t.lado === 'saida').reduce((s, t) => s + total.tipos[t.tipo].cab, 0);
  const calculado = total.inicio.cab + entradas - saidas + total.entrou.cab - total.saiu.cab;
  const referencia = new Map<string, number>();
  for (const l of linhas) if (l.nivel === 'categoria') { const k = kgCabFinal(l); if (k != null) referencia.set(l.id, k); }
  return {
    linhas, tiposVisiveis, tiposEscondidos, referencia,
    confere: { inicio: total.inicio.cab, entradas, saidas, entrou: total.entrou.cab, saiu: total.saiu.cab, calculado, final: total.final.cab, bate: calculado === total.final.cab },
  };
}

export const LIMITE_AMBAR = 0.15;
export const LIMITE_VERMELHO = 0.25;
/** desvio do kg/cab lançado sobre a referência (fração; −0,22 = 22% abaixo); sem referência = null */
export const desvio = (kg: number | null, ref: number | null | undefined): number | null => (kg == null || ref == null || ref <= 0 ? null : (kg - ref) / ref);
export const tomDoDesvio = (d: number | null): 'vermelho' | 'ambar' | null =>
  d == null ? null : Math.abs(d) >= LIMITE_VERMELHO ? 'vermelho' : Math.abs(d) >= LIMITE_AMBAR ? 'ambar' : null;

/** Um lançamento do mês, como a lista "Conferir pesos" o lê (`lancamentos`). */
export interface LancamentoDoMes {
  id: string; data: string; tipo: string; categoria: string; categoria_destino: string | null; quantidade: number; peso_medio_kg: number | null;
}
export interface PesoAConferir extends LancamentoDoMes { referencia: number | null; desvio: number | null; tom: 'vermelho' | 'ambar' | null }

/** "Conferir pesos": cada lançamento do mês com peso, do MAIOR desvio para o menor (a evolução compara com a categoria de destino). */
export function pesosAConferir(lancs: LancamentoDoMes[], referencia: Map<string, number>): PesoAConferir[] {
  return lancs
    .filter((l) => l.peso_medio_kg != null && l.peso_medio_kg > 0)
    .map((l) => {
      const ref = referencia.get(l.tipo === 'reclassificacao' && l.categoria_destino ? l.categoria_destino : l.categoria) ?? null;
      const d = desvio(l.peso_medio_kg, ref);
      return { ...l, referencia: ref, desvio: d, tom: tomDoDesvio(d) };
    })
    .sort((a, b) => Math.abs(b.desvio ?? -1) - Math.abs(a.desvio ?? -1));
}
