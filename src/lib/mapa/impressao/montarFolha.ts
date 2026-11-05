/**
 * MAPA-IMPRESSAO-01 — a folha PRONTA para desenhar: recebe o que o Gestor já tem (as UNIDADES do mês — `unidadesDoMapa` —, a área do
 * mês, o uso do mês, o cadastro da fazenda) e devolve tudo em mm. O PDF só desenha o que vem daqui; nada de conta lá dentro.
 */
import { areaDoBancoHa } from '@/lib/mapa/criarPiquetes';
import { rotuloDoTipo } from '@/lib/mapa/tiposDeArea';
import {
  arrumarNaFolha, caminhoSvg, enquadrar, poligonosDe, escalaGrafica, geometriaNaFolha, gradeDaFolha, hachura, layoutDaFolha, textoDaEscala,
  type Enquadramento, type EscalaGrafica, type Geometria, type LayoutDaFolha, type LinhaDaGrade, type RotuloNaFolha, type TamanhoDaFolha,
} from './folhaDoMapa';
import { classeDaArea, classeDoPasto, ORDEM_DAS_CLASSES, type ClasseDaFolha } from './classesDaFolha';
import type { ResumoDeAreas } from './resumoDeAreas';
import { grausMinutos } from './utm';

export interface PoligonoDaFolha { id: string; tipo: string; pastoId: string | null; nome: string; geojson: Geometria }
export interface UnidadeDaFolha { nome: string; areaHa: number | null; uso: string | null }

export interface EntradaDaFolha {
  tamanho: TamanhoDaFolha;
  anoMes: string;
  identificacao: {
    cliente: string; fazenda: string; municipio: string | null; uf: string | null;
    matricula: number | null; matriculaConferidaEm: string | null; geradoEm: string;
  };
  /** os polígonos do mês (os do Gestor: sem os dos piquetes, que vão em `divisoes`) */
  poligonos: readonly PoligonoDaFolha[];
  /** pasto (o id da unidade) → nome, área do mês da unidade, uso do mês */
  unidades: ReadonlyMap<string, UnidadeDaFolha>;
  /** as divisões (piquetes) do mês: linhas finas, sem rótulo */
  divisoes: readonly Geometria[];
  resumo: ResumoDeAreas;
  semDesenho: readonly string[];
}

export interface DesenhoDaFolha { id: string; classe: ClasseDaFolha; caminho: string; hachuras: [number, number, number, number][] }

export interface FolhaPronta {
  layout: LayoutDaFolha;
  enq: Enquadramento;
  escalaTexto: string;
  grade: { intervalo: number; linhas: LinhaDaGrade[] };
  escala: EscalaGrafica;
  desenhos: DesenhoDaFolha[];
  divisoes: string[];
  rotulos: RotuloNaFolha[];
  /** os ids dos rótulos que são medida do desenho (itálico) */
  medidas: Set<string>;
  legenda: ClasseDaFolha[];
  identificacao: [string, string][];
  /** a frase do norte (convergência) */
  norte: { angulo: number; frase: string };
  resumo: ResumoDeAreas;
  notas: string[];
  /** corpo das letras (mm) */
  corpo: { nome: number; sub: number; texto: number; titulo: number; pequeno: number };
}

const ha2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ha1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesTexto = (anoMes: string) => `${MESES[Number(anoMes.slice(5, 7)) - 1]}/${anoMes.slice(0, 4)}`;
/** dd/mm/aaaa de um ISO (só a data) */
export const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** `null` = nenhum polígono (não há o que imprimir). */
export function montarFolha(e: EntradaDaFolha): FolhaPronta | null {
  const layout = layoutDaFolha(e.tamanho);
  const enq = enquadrar(e.poligonos.map((p) => p.geojson), layout);
  if (!enq) return null;
  const { s } = layout;
  /* o painel cresce com a folha (s); os rótulos do MAPA crescem pela raiz (A0: ×1,68, letra de ~4 mm): na parede se lê de perto, e a
     letra ×2,83 esconderia os pastos pequenos que a folha grande existe para mostrar */
  const r = Math.sqrt(s);
  const corpo = { nome: 2.5 * r, sub: 2.1 * r, texto: 2.5 * s, titulo: 3 * s, pequeno: 2.15 * s };

  const comClasse = e.poligonos.map((p) => {
    const u = p.pastoId ? e.unidades.get(p.pastoId) : undefined;
    const classe = p.tipo === 'pasto' ? classeDoPasto(u?.uso ?? null) : classeDaArea(p.tipo);
    return { p, u, classe, folha: geometriaNaFolha(p.geojson, enq, layout) };
  });
  const ordem = (c: ClasseDaFolha) => ORDEM_DAS_CLASSES.indexOf(c);
  /* desenho: o limite por baixo, depois as áreas, os pastos por cima (um pasto nunca fica escondido sob uma área) */
  const desenhos = [...comClasse]
    .sort((a, b) => Number(a.p.tipo === 'pasto') - Number(b.p.tipo === 'pasto') || ordem(a.classe) - ordem(b.classe))
    .map(({ p, classe, folha }) => ({
      id: p.id, classe, caminho: caminhoSvg(folha), hachuras: classe === 'reserva' ? hachura(folha, 2 * s) : [],
    }));

  const medidas = new Set<string>();
  const pedidos = comClasse.filter((c) => c.classe !== 'limite').map(({ p, u, folha }) => {
    const area = areaDoPoligono(p.geojson);
    if (p.tipo === 'pasto') {
      const a = u?.areaHa;
      return { id: p.id, poligonos: folha, nome: u?.nome ?? p.nome, sub: a == null ? '—' : `${ha2(a)} ha`, prioridade: area };
    }
    medidas.add(p.id);
    return { id: p.id, poligonos: folha, nome: p.nome || rotuloDoTipo(p.tipo), sub: area >= 1 ? `≈ ${ha1(area)} ha` : null, prioridade: area / 10 };
  });
  const rotulos = arrumarNaFolha(pedidos, corpo.nome, corpo.sub);

  const presentes = new Set(desenhos.map((d) => d.classe));
  const legenda = ORDEM_DAS_CLASSES.filter((c) => presentes.has(c));

  const id = e.identificacao;
  const identificacao: [string, string][] = [
    ['Cliente', id.cliente],
    ['Fazenda', id.fazenda],
    ['Município', id.municipio ? `${id.municipio.trim()}${id.uf ? ` – ${id.uf}` : ''}` : '—'],
    ['Matrícula', id.matricula == null ? '—' : `${ha2(id.matricula)} ha${id.matriculaConferidaEm ? ` (conferida em ${dataBr(id.matriculaConferidaEm)})` : ''}`],
    ['Dados de', mesTexto(e.anoMes)],
    ['Data', dataBr(id.geradoEm)],
    ['Projeção', `UTM, SIRGAS 2000, fuso ${enq.fuso.numero}${enq.fuso.sul ? 'S' : 'N'}`],
    ['Folha', `${e.tamanho} paisagem · ${textoDaEscala(enq.escala)}`],
  ];
  const conv = enq.convergencia;
  const norte = { angulo: conv, frase: `Convergência meridiana: ${grausMinutos(conv)} ${conv < 0 ? 'a oeste' : 'a leste'} (seta = norte verdadeiro)` };

  const ocultos = rotulos.filter((r) => r.modo === 'oculto' && !medidas.has(r.id)).map((r) => r.nome);
  const notas: string[] = [];
  if (ocultos.length) notas.push(`Nome que não coube no desenho: ${ocultos.join(', ')}.`);
  if (e.semDesenho.length) notas.push(`${e.semDesenho.length === 1 ? 'Pasto' : `${e.semDesenho.length} pastos`} sem desenho no mapa: ${e.semDesenho.join(', ')}.`);

  return {
    layout, enq, escalaTexto: textoDaEscala(enq.escala), grade: gradeDaFolha(enq, layout), escala: escalaGrafica(enq, layout),
    desenhos, divisoes: e.divisoes.map((g) => caminhoSvg(geometriaNaFolha(g, enq, layout))), rotulos, medidas, legenda, identificacao,
    norte, resumo: e.resumo, notas, corpo,
  };
}

/** A medida do desenho (ha), a mesma conta do banco (`_fn_area_geodesica_ha`, espelho `areaDoBancoHa`; MultiPolygon soma as partes). */
export function areaDoPoligono(g: Geometria): number {
  const partes = poligonosDe(g).map((p) => p.map((a) => a.map((c) => [c[0], c[1]])));
  return partes.length ? areaDoBancoHa({ type: 'MultiPolygon', coordinates: partes }) : 0;
}
