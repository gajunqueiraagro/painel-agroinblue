/**
 * MAPA-GLOBAL-01 — Produção › Geo Pastos com a barra lateral em "Global" (mock aprovado `docs/mocks/mock-geo-global-v1.html`, 31/10).
 * O resumo de todas as fazendas do cliente (as com pecuária) no MESMO mês do shell (D1), com ida e volta para o mapa de cada uma (D6).
 * Os números vêm de `resumoGlobal` (a regra do Gestor, D2); esta tela só desenha. O estado (visão, ordenações, filtro, aba do gráfico,
 * rolagem) mora no `estado` que a página guarda enquanto a tela Geo Pastos está aberta (Q4): o "← Global" volta exatamente como estava.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { Button } from '@/components/ui/button';
import { TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { formatNum } from '@/lib/calculos/formatters';
import { COR_DA_FAIXA, COR_SEM_FECHAMENTO, LIMITE_CARGA_ALTA, LIMITE_SUBLOTADO, textoUaHa } from '@/lib/mapa/faixasLotacao';
import { rotuloDaAtividade } from '@/lib/mapa/camadasDoMapa';
import { mesAbreviado, type ResumoDosPastos } from '@/lib/mapa/mapaDoMes';
import {
  contagemDosFiltros, ordenarLinhas, pedemAtencao, SITUACOES, type Direcao, type FazendaDoGlobal, type FiltroDePastos, type LinhaDaFazenda,
  type LinhaDoPasto, type Situacao,
} from '@/lib/mapa/resumoGlobal';
import type { GeometriaDoGlobal } from '@/hooks/useGeometriasDasFazendas';
import { cn } from '@/lib/utils';

export type ColunaFazenda = 'codigo' | 'nome' | 'pastos' | 'area' | 'cabecas' | 'peso' | 'kgHa' | 'semFech';
export type ColunaPasto = 'codigo' | 'nome' | 'atividade' | 'area' | 'cabecas' | 'peso' | 'kgHa' | 'situacao';
export type AbaDoGrafico = 'lotacao' | 'area' | 'atividade';

export interface EstadoDoGlobal {
  visao: 'fazendas' | 'pastos';
  ordemFazendas: { coluna: ColunaFazenda; direcao: Direcao };
  ordemPastos: { coluna: ColunaPasto; direcao: Direcao };
  ordemAtencao: { coluna: ColunaPasto; direcao: Direcao };
  filtro: FiltroDePastos;
  aba: AbaDoGrafico;
  rolagem: { fazendas: number; atencao: number; pastos: number };
}

export const ESTADO_INICIAL_DO_GLOBAL: EstadoDoGlobal = {
  visao: 'fazendas',
  ordemFazendas: { coluna: 'codigo', direcao: 'asc' },
  ordemPastos: { coluna: 'codigo', direcao: 'asc' },
  ordemAtencao: { coluna: 'kgHa', direcao: 'desc' },
  filtro: 'todos',
  aba: 'lotacao',
  rolagem: { fazendas: 0, atencao: 0, pastos: 0 },
};

const COR_SITUACAO: Record<Situacao, string> = { ...COR_DA_FAIXA, sem_fechamento: COR_SEM_FECHAMENTO };
const NOME_SITUACAO: Record<Situacao, string> = {
  carga_alta: 'Carga alta', sublotado: 'Sublotado', ideal: 'Ideal', vazio: 'Vazio', sem_fechamento: 'Sem fechamento',
};
const LEGENDA_SITUACAO: Record<Situacao, string> = {
  ideal: `Ideal (${LIMITE_SUBLOTADO}–${LIMITE_CARGA_ALTA})`, sublotado: `Sublotado (< ${LIMITE_SUBLOTADO})`,
  carga_alta: `Carga alta (> ${LIMITE_CARGA_ALTA})`, vazio: 'Vazio', sem_fechamento: 'Sem fechamento no mês',
};
const ORDEM_LEGENDA: Situacao[] = ['ideal', 'sublotado', 'carga_alta', 'vazio', 'sem_fechamento'];
const COR_ATIVIDADE: Record<string, string> = { cria: '#D98E3B', recria: '#3E86C6', engorda: '#8E5BB5' };
const COR_ATIVIDADE_OUTRA = '#7A8796';
const CHIPS: FiltroDePastos[] = ['todos', 'carga_alta', 'sublotado', 'ideal', 'vazio', 'sem_fechamento'];
const NOME_CHIP: Record<FiltroDePastos, string> = { todos: 'Todos', ...NOME_SITUACAO, sem_fechamento: 'Sem fech.' };
const LARGURA_DIREITA = 272;
/* fix1 (1): sem hover de FUNDO — trocava o navy por branco a 10% e o rótulo sumia; o hover do cabeçalho que ordena é o do `ThOrdenavel` */
const TH = cn(TH_REGUA, 'sticky top-0 z-[1] bg-primary');
const TD_TXT = cn(TD_REGUA, 'whitespace-nowrap');
const n0 = (v: number | null | undefined) => (v == null ? '—' : formatNum(v, 0));
const n1 = (v: number | null | undefined) => (v == null ? '—' : formatNum(v, 1));

/* ── larguras pelo conteúdo (D7): o texto mais longo da coluna medido com a fonte da régua ── */
let regua: CanvasRenderingContext2D | null = null;
function largura(texto: string, px = 10, peso = 400): number {
  if (typeof document === 'undefined') return texto.length * px * 0.62;
  regua ??= document.createElement('canvas').getContext('2d');
  if (!regua) return texto.length * px * 0.62;
  regua.font = `${peso} ${px}px ${getComputedStyle(document.body).fontFamily}`;
  return Math.ceil(regua.measureText(texto).width);
}
/* fix1 (2): o cabeçalho pede o rótulo + 8 de padding + 12 do lugar da seta de ordenação (10 + 2 de vão, reservado sempre) + 4 de folga
   = +24; eram +14 e "Área ha", "Peso kg" e "Sem fech." passavam da coluna. A célula: o texto + 8 de padding. */
const FOLGA_DO_CABECALHO = 24;
/** o piso da coluna do nome da fazenda (o resto da largura vai para ela; abaixo disso, a tabela rola de lado) */
const NOME_MINIMO = 120;
const colunaPara = (textos: string[], cabecalho: string, extra = 0) =>
  Math.max(largura(cabecalho, 9.5, 500) + FOLGA_DO_CABECALHO, ...textos.map(t => largura(t) + 8)) + extra;

function Quadradinho({ cor }: { cor: string }) {
  return <i className="inline-block h-2 w-2 flex-none rounded-[2px]" style={{ background: cor }} />;
}

/** A barra empilhada da área por situação (Situação). */
function BarraDeSituacao({ areas, largura: w }: { areas: Record<Situacao, number>; largura: number }) {
  const total = SITUACOES.reduce((s, k) => s + areas[k], 0);
  if (total <= 0) return <span className="text-[9.5px] text-muted-foreground">—</span>;
  return (
    <span className="flex h-2 overflow-hidden rounded-[2px]" style={{ width: w }}
      title={ORDEM_LEGENDA.filter(k => areas[k] > 0).map(k => `${NOME_SITUACAO[k]}: ${formatNum(areas[k], 1)} ha`).join(' · ')}>
      {ORDEM_LEGENDA.map(k => areas[k] > 0 && <i key={k} style={{ width: `${(areas[k] / total) * 100}%`, background: COR_SITUACAO[k] }} />)}
    </span>
  );
}

/** O minigráfico dos 12 meses (kg/ha), com a faixa ideal 300–500 sombreada. */
function Minigrafico({ serie, largura: w }: { serie: { anoMes: string; kgHa: number | null }[]; largura: number }) {
  const h = 14;
  const max = Math.max(LIMITE_CARGA_ALTA + 200, ...serie.map(p => p.kgHa ?? 0));
  const y = (v: number) => h - 1 - (v / max) * (h - 2);
  const x = (i: number) => 1 + (i * (w - 2)) / Math.max(1, serie.length - 1);
  const trechos: string[] = [];
  let atual = '';
  serie.forEach((p, i) => {
    if (p.kgHa == null) { if (atual) trechos.push(atual); atual = ''; return; }
    atual += `${atual ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.kgHa).toFixed(1)}`;
  });
  if (atual) trechos.push(atual);
  const titulo = serie.map(p => `${mesAbreviado(p.anoMes)}: ${p.kgHa == null ? '—' : formatNum(p.kgHa, 0)}`).join(' · ');
  return (
    <svg width={w} height={h} className="block" aria-label="lotação nos 12 meses"><title>{titulo}</title>
      <rect x={0} y={y(LIMITE_CARGA_ALTA)} width={w} height={y(LIMITE_SUBLOTADO) - y(LIMITE_CARGA_ALTA)} fill="#2F9E5B" opacity={0.14} />
      {trechos.map((d, i) => <path key={i} d={d} fill="none" stroke="#1B2A44" strokeWidth={1.2} />)}
    </svg>
  );
}

/** A miniatura da fazenda: os polígonos pintados pela situação do mês (equiretangular corrigida pela latitude). */
function MiniMapa({ geometrias, situacaoDe, w, h }: {
  geometrias: GeometriaDoGlobal[]; situacaoDe: (pastoId: string) => Situacao; w: number; h: number;
}) {
  const formas = useMemo(() => {
    const aneis: { g: GeometriaDoGlobal; pts: number[][][] }[] = [];
    for (const g of geometrias) {
      const polis = g.geojson.type === 'Polygon' ? [g.geojson.coordinates] : g.geojson.type === 'MultiPolygon' ? g.geojson.coordinates : [];
      for (const p of polis) aneis.push({ g, pts: p });
    }
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity; let somaLat = 0; let n = 0;
    for (const a of aneis) for (const [lng, lat] of a.pts[0] ?? []) { minX = Math.min(minX, lng); maxX = Math.max(maxX, lng); minY = Math.min(minY, lat); maxY = Math.max(maxY, lat); somaLat += lat; n++; }
    if (!n) return [];
    const k = Math.cos(((somaLat / n) * Math.PI) / 180);
    const larg = (maxX - minX) * k || 1e-9; const alt = maxY - minY || 1e-9;
    const esc = Math.min((w - 4) / larg, (h - 4) / alt);
    const ox = (w - larg * esc) / 2; const oy = (h - alt * esc) / 2;
    return aneis.map(({ g, pts }) => ({
      g,
      d: pts.map(r => r.map(([lng, lat], i) => `${i ? 'L' : 'M'}${(ox + (lng - minX) * k * esc).toFixed(1)},${(oy + (maxY - lat) * esc).toFixed(1)}`).join('') + 'Z').join(''),
    }));
  }, [geometrias, w, h]);
  return (
    <svg width={w} height={h} className="block">
      {formas.map(({ g, d }, i) => {
        if (g.tipo === 'area_total') return <path key={i} d={d} fill="none" stroke="#9AA3AE" strokeDasharray="3 2" strokeWidth={0.8} />;
        const cor = g.tipo === 'pasto' && g.pasto_id ? COR_SITUACAO[situacaoDe(g.pasto_id)] : '#C9CED6';
        return <path key={i} d={d} fill={cor} fillRule="evenodd" stroke="#fff" strokeWidth={0.6} />;
      })}
    </svg>
  );
}

/**
 * O quadro da tabela (D7): o corpo rola com o cabeçalho preso; a linha de total é uma tabela à parte, PRESA NO PÉ do quadro, com o MESMO
 * colgroup (as colunas casam) e a mesma reserva da barra de rolagem; a rolagem de lado do corpo leva o pé junto.
 */
function QuadroDaTabela({ colgroup, larguraMinima, cabecalho, corpo, rodape, refCorpo, onScroll, testid }: {
  colgroup: ReactNode; larguraMinima: number; cabecalho: ReactNode; corpo: ReactNode; rodape?: ReactNode;
  refCorpo: React.RefObject<HTMLDivElement>; onScroll: (ev: React.UIEvent<HTMLDivElement>) => void; testid: string;
}) {
  const refPe = useRef<HTMLDivElement>(null);
  const estilo: React.CSSProperties = { tableLayout: 'fixed', width: '100%', minWidth: larguraMinima };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={refCorpo} className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]" data-testid={testid}
        onScroll={ev => { if (refPe.current) refPe.current.scrollLeft = ev.currentTarget.scrollLeft; onScroll(ev); }}>
        <table className="border-collapse" style={estilo}>{colgroup}<thead>{cabecalho}</thead><tbody>{corpo}</tbody></table>
      </div>
      {rodape && (
        <div ref={refPe} className="flex-none overflow-hidden bg-primary [scrollbar-gutter:stable]">
          <table className="border-collapse" style={estilo}>{colgroup}<tbody>{rodape}</tbody></table>
        </div>
      )}
    </div>
  );
}

function Card({ titulo, extra, children, className, testid }: { titulo?: ReactNode; extra?: ReactNode; children: ReactNode; className?: string; testid?: string }) {
  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]', className)} data-testid={testid}>
      {(titulo || extra) && (
        <div className="flex h-[30px] flex-none items-center gap-2 px-2.5">
          {titulo && <span className="flex-none text-[11px] font-semibold">{titulo}</span>}
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}

function Kpi({ rotulo, valor, unidade, aviso, alerta, testid, title }: {
  rotulo: string; valor: ReactNode; unidade?: string | null; aviso?: string | null; alerta?: boolean; testid?: string; title?: string;
}) {
  return (
    <div className={cn('min-w-0 flex-1 rounded-lg border bg-card px-2.5 py-1', alerta ? 'border-[#D0453A]' : 'border-border')} data-testid={testid} title={title}>
      <div className="flex items-center justify-between gap-1 text-[9.5px] leading-[12px] text-muted-foreground">
        <span className="whitespace-nowrap">{rotulo}</span>
        <span className={cn('whitespace-nowrap text-[#8A5A00]', !aviso && 'invisible')}>{aviso ?? '·'}</span>
      </div>
      <div className="whitespace-nowrap text-[14px] font-semibold leading-[18px] tabular-nums">
        {valor}{unidade ? <span className="ml-1 text-[9.5px] font-normal text-muted-foreground">{unidade}</span> : null}
      </div>
    </div>
  );
}

/** O texto do aviso de cabeças fora do mapa (Q2: nada some em silêncio). */
export const avisoSemMapa = (cab: number) => (cab > 0 ? `${formatNum(cab, 0)} cab em pastos sem mapa` : null);

export interface PropsDoGlobal {
  fazendas: LinhaDaFazenda[];
  total: LinhaDaFazenda;
  pastos: LinhaDoPasto[];
  geometriasPorFazenda: ReadonlyMap<string, GeometriaDoGlobal[]>;
  situacaoDoPasto: (pastoId: string) => Situacao;
  /** O total da visão Pastos com o filtro (a regra do Gestor, `resumoDosPastos`, calculada pela página). */
  resumoDoFiltro: (pastoIds: readonly string[]) => ResumoDosPastos;
  carregando: boolean;
  erro: string | null;
  seletorDeMes: ReactNode;
  estado: EstadoDoGlobal;
  onEstado: (e: EstadoDoGlobal) => void;
  onAbrirFazenda: (fazendaId: string, opcoes?: { pastoId?: string; importar?: boolean }) => void;
}

export function GeoPastosGlobal({
  fazendas, total, pastos, geometriasPorFazenda, situacaoDoPasto, resumoDoFiltro, carregando, erro, seletorDeMes, estado, onEstado,
  onAbrirFazenda,
}: PropsDoGlobal) {
  const [e, setE] = useState<EstadoDoGlobal>(estado);
  const atualizar = (m: Partial<EstadoDoGlobal>) => setE(prev => ({ ...prev, ...m }));
  // a página guarda o estado (Q4); a rolagem mora num ref próprio (sem redesenhar a cada pixel) e entra junto em toda gravação
  const estadoRef = useRef(e);
  estadoRef.current = e;
  const rolagemRef = useRef(estado.rolagem);
  useEffect(() => { onEstado({ ...e, rolagem: rolagemRef.current }); }, [e, onEstado]);
  const rolar = (qual: keyof EstadoDoGlobal['rolagem']) => (ev: React.UIEvent<HTMLDivElement>) => {
    rolagemRef.current = { ...rolagemRef.current, [qual]: ev.currentTarget.scrollTop };
    onEstado({ ...estadoRef.current, rolagem: rolagemRef.current });
  };
  const refFaz = useRef<HTMLDivElement>(null);
  const refAt = useRef<HTMLDivElement>(null);
  const refPas = useRef<HTMLDivElement>(null);
  /* fix1 (2): as larguras se medem de novo quando a fonte da casa termina de carregar (antes disso o canvas mede com a fonte reserva,
     mais estreita, e a coluna nascia curta) */
  const [fontesProntas, setFontesProntas] = useState(false);
  useEffect(() => {
    let vivo = true;
    if (typeof document === 'undefined' || !document.fonts) { setFontesProntas(true); return; }
    document.fonts.ready.then(() => { if (vivo) setFontesProntas(true); });
    return () => { vivo = false; };
  }, []);
  // a rolagem volta como estava quando as linhas já estão desenhadas
  const restaurou = useRef(false);
  useLayoutEffect(() => {
    if (restaurou.current || carregando) return;
    restaurou.current = true;
    if (refFaz.current) refFaz.current.scrollTop = estado.rolagem.fazendas;
    if (refAt.current) refAt.current.scrollTop = estado.rolagem.atencao;
    if (refPas.current) refPas.current.scrollTop = estado.rolagem.pastos;
  }, [carregando, estado.rolagem]);

  const ordenar = <C extends string>(atual: { coluna: C; direcao: Direcao }, coluna: C): { coluna: C; direcao: Direcao } =>
    ({ coluna, direcao: atual.coluna === coluna && atual.direcao === 'asc' ? 'desc' : 'asc' });

  /* ── Fazendas ── */
  const valorFazenda = (l: LinhaDaFazenda, c: ColunaFazenda): number | string | null => ({
    codigo: l.fazenda.codigo, nome: l.fazenda.nome, pastos: l.pastos, area: l.area, cabecas: l.cabecas, peso: l.pesoMedio,
    kgHa: l.kgHa, semFech: l.semFechamento,
  })[c];
  const linhasFaz = useMemo(() => ordenarLinhas(fazendas, l => valorFazenda(l, e.ordemFazendas.coluna), e.ordemFazendas.direcao,
    (a, b) => a.fazenda.codigo.localeCompare(b.fazenda.codigo, 'pt-BR')), [fazendas, e.ordemFazendas]);

  /* ── Pastos e atenção ── */
  const valorPasto = (p: LinhaDoPasto, c: ColunaPasto): number | string | null => ({
    codigo: p.fazenda.codigo, nome: p.nome, atividade: p.atividade ? rotuloDaAtividade(p.atividade) : null, area: p.area,
    cabecas: p.cabecas, peso: p.pesoMedio, kgHa: p.kgHa, situacao: SITUACOES.indexOf(p.situacao),
  })[c];
  const desempatePasto = (a: LinhaDoPasto, b: LinhaDoPasto) =>
    a.fazenda.codigo.localeCompare(b.fazenda.codigo, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });
  const atencao = useMemo(() => {
    const base = pedemAtencao(pastos);
    return e.ordemAtencao.coluna === 'kgHa' && e.ordemAtencao.direcao === 'desc'
      ? base : ordenarLinhas(base, p => valorPasto(p, e.ordemAtencao.coluna), e.ordemAtencao.direcao, desempatePasto);
  }, [pastos, e.ordemAtencao]);
  const contagem = useMemo(() => contagemDosFiltros(pastos), [pastos]);
  const filtrados = useMemo(() => ordenarLinhas(e.filtro === 'todos' ? pastos : pastos.filter(p => p.situacao === e.filtro),
    p => valorPasto(p, e.ordemPastos.coluna), e.ordemPastos.direcao, desempatePasto), [pastos, e.filtro, e.ordemPastos]);
  const totalFiltro = useMemo(() => resumoDoFiltro(filtrados.map(p => p.pastoId)), [filtrados, resumoDoFiltro]);

  /* ── larguras (D7): pelo maior texto do cliente ── */
  const larg = useMemo(() => {
    const todas = [...fazendas, total];
    return {
      cod: colunaPara([...fazendas.map(l => l.fazenda.codigo), ...pastos.map(p => p.fazenda.codigo)], 'Faz.', 0),
      nome: colunaPara([...fazendas.map(l => l.fazenda.nome), `${fazendas.length} fazendas`], 'Fazenda'),
      pastos: colunaPara(todas.map(l => n0(l.pastos)), 'Pastos'),
      area: colunaPara(todas.map(l => n1(l.area)), 'Área ha'),
      cab: colunaPara(todas.map(l => n0(l.cabecas)), 'Cab.', 10), // + o sinal âmbar do "sem mapa"
      peso: colunaPara(todas.map(l => n0(l.pesoMedio)), 'Peso kg'),
      kgHa: colunaPara(todas.map(l => n0(l.kgHa)), 'kg/ha', 12),
      semFech: colunaPara(todas.map(l => n0(l.semFechamento)), 'Sem fech.'),
      pasto: colunaPara([...pastos.map(p => p.nome), `${pastos.length} pastos`], 'Pasto'),
      atividade: colunaPara(pastos.map(p => (p.atividade ? rotuloDaAtividade(p.atividade) : '—')), 'Atividade'),
      pArea: colunaPara(pastos.map(p => n1(p.area)).concat(n1(total.area)), 'Área ha'),
      pCab: colunaPara(pastos.map(p => n0(p.cabecas)).concat(n0(total.cabecas)), 'Cab.'),
      pPeso: colunaPara(pastos.map(p => n0(p.pesoMedio)), 'Peso kg'),
      pKgHa: colunaPara(pastos.map(p => n0(p.kgHa)), 'kg/ha', 12),
      sit: colunaPara(SITUACOES.map(s => NOME_SITUACAO[s]), 'Situação', 12),
    };
  }, [fazendas, total, pastos, fontesProntas]);

  const thF = (c: ColunaFazenda, rotulo: string, direita = false) => (
    <ThOrdenavel coluna={c} rotulo={rotulo} ordem={e.ordemFazendas} alinhaDireita={direita} className={TH}
      onOrdenar={col => atualizar({ ordemFazendas: ordenar(e.ordemFazendas, col) })} />
  );
  const thP = (qual: 'ordemPastos' | 'ordemAtencao', c: ColunaPasto, rotulo: string, direita = false) => (
    <ThOrdenavel coluna={c} rotulo={rotulo} ordem={e[qual]} alinhaDireita={direita} className={TH}
      onOrdenar={col => atualizar({ [qual]: ordenar(e[qual], col) })} />
  );
  /* D7 (Gabriel 31/10): a UA/ha sai da tabela — fica nos cards e no title do kg/ha */
  const celKgHa = (kgHa: number | null, situacao: Situacao | null) => (
    <span className="inline-flex items-center justify-end gap-1">
      {situacao && <Quadradinho cor={COR_SITUACAO[situacao]} />}
      <span>{n0(kgHa)}</span>
    </span>
  );
  /* D7: o "sem mapa" é um sinal âmbar na célula Cab., com o texto inteiro no title */
  const celCabecas = (cab: number | null, semMapa: number, negrito = false) => (
    <td className={cn(TD_REGUA_NUM, negrito && 'font-semibold')} title={avisoSemMapa(semMapa) ?? undefined}>
      <span className="inline-flex items-center justify-end gap-1">
        {semMapa > 0 && <i className="inline-block h-1.5 w-1.5 flex-none rounded-full bg-[#E0A21B]" data-testid="global-sinal-sem-mapa" />}
        <span>{n0(cab)}</span>
      </span>
    </td>
  );
  const situacaoDaFazenda = (l: LinhaDaFazenda): Situacao | null => {
    if (l.kgHa == null) return l.cabecas === 0 ? 'vazio' : null;
    if (l.kgHa <= 0) return 'vazio';
    return l.kgHa < LIMITE_SUBLOTADO ? 'sublotado' : l.kgHa <= LIMITE_CARGA_ALTA ? 'ideal' : 'carga_alta';
  };

  const tabelaDePastos = (linhas: LinhaDoPasto[], qual: 'ordemPastos' | 'ordemAtencao', rodape: ReactNode | null, ref: React.RefObject<HTMLDivElement>,
    onScroll: (ev: React.UIEvent<HTMLDivElement>) => void, testid: string) => (
    <QuadroDaTabela refCorpo={ref} onScroll={onScroll} testid={testid} rodape={rodape}
      larguraMinima={larg.cod + larg.pasto + larg.atividade + larg.pArea + larg.pCab + larg.pPeso + larg.pKgHa + larg.sit}
      colgroup={(
        <colgroup>
          <col style={{ width: larg.cod }} /><col style={{ width: larg.pasto }} /><col /><col style={{ width: larg.pArea }} />
          <col style={{ width: larg.pCab }} /><col style={{ width: larg.pPeso }} /><col style={{ width: larg.pKgHa }} /><col style={{ width: larg.sit }} />
        </colgroup>
      )}
      cabecalho={(
        <tr>
          {thP(qual, 'codigo', 'Faz.')}{thP(qual, 'nome', 'Pasto')}{thP(qual, 'atividade', 'Atividade')}{thP(qual, 'area', 'Área ha', true)}
          {thP(qual, 'cabecas', 'Cab.', true)}{thP(qual, 'peso', 'Peso kg', true)}{thP(qual, 'kgHa', 'kg/ha', true)}{thP(qual, 'situacao', 'Situação')}
        </tr>
      )}
      corpo={(
        <>
          {linhas.map(p => (
            <tr key={p.pastoId} className="cursor-pointer border-b border-border/60 hover:bg-muted/60" onClick={() => onAbrirFazenda(p.fazenda.id, { pastoId: p.pastoId })}
              data-testid="global-linha-pasto">
              <td className={cn(TD_TXT, 'font-semibold')}>{p.fazenda.codigo}</td>
              <td className={TD_TXT}>{p.nome}</td>
              <td className={TD_TXT}>{p.atividade ? rotuloDaAtividade(p.atividade) : '—'}</td>
              <td className={TD_REGUA_NUM}>{n1(p.area)}</td>
              <td className={TD_REGUA_NUM}>{n0(p.cabecas)}</td>
              <td className={TD_REGUA_NUM}>{n0(p.pesoMedio)}</td>
              <td className={TD_REGUA_NUM}>{n0(p.kgHa)}</td>
              <td className={TD_TXT}><span className="inline-flex items-center gap-1"><Quadradinho cor={COR_SITUACAO[p.situacao]} />{NOME_SITUACAO[p.situacao]}</span></td>
            </tr>
          ))}
          {linhas.length === 0 && <tr><td colSpan={8} className={cn(TD_TXT, 'text-muted-foreground')}>{carregando ? 'Lendo o mês…' : 'Nenhum pasto.'}</td></tr>}
        </>
      )} />
  );

  const pedemCount = total.contagem.carga_alta + total.contagem.sem_fechamento;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="geo-global">
      {/* barra 34px (a mesma régua do Gestor): mês, busca, Fazendas | Pastos */}
      <div className="flex h-[34px] flex-none items-center gap-1.5 border-b border-[#D9DEE5] bg-white px-2.5" data-testid="global-barra">
        <div className="flex flex-none items-center gap-1">{seletorDeMes}</div>
        <div className="min-w-0 flex-1" />
        <div className="w-[160px] flex-none" data-testid="global-busca">
          <SearchableSelect value="" onValueChange={v => { const p = pastos.find(x => x.pastoId === v); if (p) onAbrirFazenda(p.fazenda.id, { pastoId: p.pastoId }); }}
            options={pastos.map(p => ({ value: p.pastoId, label: `${p.fazenda.codigo} · ${p.nome}` }))}
            allLabel="Buscar pasto…" allValue="" semTodos placeholder="Buscar pasto…" contentClassName="z-[1100]" triggerClassName="h-[24px] text-[11px]" />
        </div>
        <Segmentado valor={e.visao} onEscolher={v => atualizar({ visao: v })} altura={24}
          opcoes={[{ valor: 'fazendas', rotulo: 'Fazendas' }, { valor: 'pastos', rotulo: 'Pastos' }]} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
        {/* cards */}
        <div className="flex flex-none gap-1.5" data-testid="global-kpis">
          <Kpi rotulo="Fazendas · pastos" valor={<>{fazendas.length}<span className="ml-1 text-[9.5px] font-normal text-muted-foreground">· {n0(total.pastos)} pastos</span></>} />
          <Kpi rotulo="Área de pastos" valor={n1(total.area)} unidade="ha" />
          {/* fix1 (4, Gabriel 01/11): o rótulo diz o que o número é — cabeças fechadas em pastos SEM polígono (o "Alocadas" do Gestor mostra
              só as do mapa); o title abre por fazenda */}
          <Kpi rotulo="Cabeças" valor={n0(total.cabecas)} aviso={avisoSemMapa(total.cabecasSemMapa)} testid="global-kpi-cabecas"
            title={total.cabecasSemMapa > 0 ? fazendas.filter(l => l.cabecasSemMapa > 0).map(l => `${l.fazenda.codigo} ${n0(l.cabecasSemMapa)} cab em pastos sem mapa`).join(' · ') : undefined} />
          <Kpi rotulo="Peso médio" valor={n0(total.pesoMedio)} unidade="kg" />
          <Kpi rotulo="Lotação média" valor={n0(total.kgHa)} unidade={total.kgHa == null ? null : `kg/ha · ${textoUaHa(total.uaHa) ?? ''}`} />
          <Kpi rotulo="Pedem atenção" alerta={pedemCount > 0} testid="global-kpi-atencao"
            valor={<><span className={pedemCount > 0 ? 'text-[#D0453A]' : ''}>{total.contagem.carga_alta}</span><span className="mx-0.5 text-[9.5px] font-normal text-muted-foreground">alta ·</span>
              <span className={pedemCount > 0 ? 'text-[#D0453A]' : ''}>{total.contagem.sem_fechamento}</span><span className="ml-0.5 text-[9.5px] font-normal text-muted-foreground">sem fech.</span></>} />
        </div>

        <div className="grid min-h-0 flex-1 gap-1.5" style={{ gridTemplateColumns: `minmax(0,1fr) ${LARGURA_DIREITA}px` }}>
          {/* coluna esquerda */}
          <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
            {e.visao === 'fazendas' ? (
              <>
                <Card titulo="Fazendas" className="max-h-[45%] flex-none" testid="global-card-fazendas">
                  <QuadroDaTabela refCorpo={refFaz} onScroll={rolar('fazendas')} testid="global-tabela-fazendas"
                    /* fix1 (2): o NOME é a coluna que cede ("…" + o nome inteiro no title): na largura mínima entra só o piso dele, nunca o nome
                       mais longo — com os cabeçalhos inteiros, a soma passava do card a 1126 e a tabela rolava de lado */
                    larguraMinima={larg.cod + Math.min(larg.nome, NOME_MINIMO) + larg.pastos + larg.area + larg.cab + larg.peso + larg.kgHa + 64 + 58 + larg.semFech}
                    colgroup={(
                      <colgroup>
                        <col style={{ width: larg.cod }} /><col /><col style={{ width: larg.pastos }} />
                        <col style={{ width: larg.area }} /><col style={{ width: larg.cab }} /><col style={{ width: larg.peso }} />
                        <col style={{ width: larg.kgHa }} /><col style={{ width: 64 }} /><col style={{ width: 58 }} />
                        <col style={{ width: larg.semFech }} />
                      </colgroup>
                    )}
                    cabecalho={(
                      <tr>
                        {thF('codigo', 'Faz.')}{thF('nome', 'Fazenda')}{thF('pastos', 'Pastos', true)}{thF('area', 'Área ha', true)}
                        {thF('cabecas', 'Cab.', true)}{thF('peso', 'Peso kg', true)}{thF('kgHa', 'kg/ha', true)}
                        <th className={cn(TH, 'text-left')}>Situação</th><th className={cn(TH, 'text-left')}>12 meses</th>
                        {thF('semFech', 'Sem fech.', true)}
                      </tr>
                    )}
                    corpo={<>
                        {linhasFaz.map(l => (
                          <tr key={l.fazenda.id} className="cursor-pointer border-b border-border/60 hover:bg-muted/60" onClick={() => onAbrirFazenda(l.fazenda.id)}
                            data-testid="global-linha-fazenda">
                            <td className={cn(TD_TXT, 'font-semibold')}>{l.fazenda.codigo}</td>
                            <td className={TD_REGUA_TEXTO} title={l.temMapa ? l.fazenda.nome : `${l.fazenda.nome} · sem mapa`}>
                              {l.fazenda.nome}{!l.temMapa && <span className="ml-1 text-[9.5px] text-muted-foreground">sem mapa</span>}</td>
                            <td className={TD_REGUA_NUM}>{n0(l.pastos)}</td>
                            <td className={TD_REGUA_NUM}>{n1(l.area)}</td>
                            {celCabecas(l.cabecas, l.cabecasSemMapa)}
                            <td className={TD_REGUA_NUM}>{n0(l.pesoMedio)}</td>
                            <td className={TD_REGUA_NUM} title={textoUaHa(l.uaHa) ?? undefined}>{celKgHa(l.kgHa, situacaoDaFazenda(l))}</td>
                            <td className={TD_REGUA}><BarraDeSituacao areas={l.areaPorSituacao} largura={56} /></td>
                            <td className={TD_REGUA}><Minigrafico serie={l.serie} largura={50} /></td>
                            <td className={TD_REGUA_NUM}>{n0(l.semFechamento)}</td>
                          </tr>
                        ))}
                    </>}
                    rodape={(
                      <tr className="text-primary-foreground" data-testid="global-total">
                        <td className={TD_TXT} />
                        <td className={cn(TD_TXT, 'font-semibold')}>{fazendas.length} {fazendas.length === 1 ? 'fazenda' : 'fazendas'}</td>
                        <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{n0(total.pastos)}</td>
                        <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{n1(total.area)}</td>
                        {celCabecas(total.cabecas, total.cabecasSemMapa, true)}
                        <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{n0(total.pesoMedio)}</td>
                        <td className={cn(TD_REGUA_NUM, 'font-semibold')} title={textoUaHa(total.uaHa) ?? undefined}>{n0(total.kgHa)}</td>
                        <td className={TD_REGUA}><BarraDeSituacao areas={total.areaPorSituacao} largura={56} /></td>
                        <td className={TD_REGUA} />
                        <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{n0(total.semFechamento)}</td>
                      </tr>
                    )} />
                </Card>
                <Card titulo="Pedem atenção no mês" className="flex-1" testid="global-card-atencao"
                  extra={<span className="whitespace-nowrap text-[9.5px] text-muted-foreground">carga alta, sem fechamento e vazios · clique abre o pasto na fazenda</span>}>
                  {tabelaDePastos(atencao, 'ordemAtencao', null, refAt, rolar('atencao'), 'global-tabela-atencao')}
                </Card>
              </>
            ) : (
              <Card titulo="Pastos" className="flex-1" testid="global-card-pastos"
                extra={(
                  <div className="flex min-w-0 flex-none items-center gap-1" data-testid="global-chips">
                    {CHIPS.map(c => (
                      <button key={c} type="button" onClick={() => atualizar({ filtro: c })}
                        className={cn('inline-flex h-[20px] flex-none items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[10px]',
                          e.filtro === c ? 'border-[#1B2A44] bg-[#1B2A44] text-white' : 'border-border bg-card hover:bg-muted')}>
                        {c !== 'todos' && <Quadradinho cor={COR_SITUACAO[c]} />}{NOME_CHIP[c]} <span className="tabular-nums">{contagem[c]}</span>
                      </button>
                    ))}
                  </div>
                )}>
                {tabelaDePastos(filtrados, 'ordemPastos', (
                  <tr className="text-primary-foreground" data-testid="global-total-pastos">
                    <td className={TD_TXT} />
                    <td className={cn(TD_TXT, 'font-semibold')}>{filtrados.length} pastos</td>
                    <td className={TD_TXT} />
                    <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{n1(totalFiltro.area)}</td>
                    <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{n0(totalFiltro.cabecas)}</td>
                    <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{n0(totalFiltro.pesoMedio)}</td>
                    <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{n0(totalFiltro.lotacao)}</td>
                    <td className={TD_TXT} />
                  </tr>
                ), refPas, rolar('pastos'), 'global-tabela-pastos')}
              </Card>
            )}
          </div>

          {/* coluna direita (largura fixa): miniaturas + gráfico */}
          <div className="flex min-h-0 flex-col gap-1.5">
            {/* fix1 (2c): as miniaturas cedem altura (rolam por dentro) para o gráfico nunca ficar abaixo do mínimo dele */}
            <Card titulo="Mapa das fazendas" className="min-h-[96px] flex-initial" testid="global-miniaturas"
              extra={<span className="ml-auto whitespace-nowrap text-[9.5px] text-muted-foreground">clique para abrir</span>}>
              <div className="grid max-h-[260px] min-h-0 grid-cols-2 gap-1.5 overflow-y-auto px-2 pb-2 [scrollbar-gutter:stable]">
                {fazendas.map(l => (
                  <div key={l.fazenda.id} role="button" tabIndex={0} onClick={() => onAbrirFazenda(l.fazenda.id)}
                    onKeyDown={ev => { if (ev.key === 'Enter') onAbrirFazenda(l.fazenda.id); }}
                    className="cursor-pointer rounded-md border border-border p-1 hover:border-[#2B6CB0]" data-testid="global-miniatura">
                    <div className="flex items-center justify-between text-[10px]">
                      <b>{l.fazenda.codigo}</b>
                      <span className="tabular-nums" style={{ color: situacaoDaFazenda(l) ? COR_SITUACAO[situacaoDaFazenda(l)!] : undefined }}>{n0(l.kgHa)}</span>
                    </div>
                    {l.temMapa ? (
                      <MiniMapa geometrias={geometriasPorFazenda.get(l.fazenda.id) ?? []} situacaoDe={situacaoDoPasto} w={118} h={72} />
                    ) : (
                      <div className="flex h-[72px] flex-col items-center justify-center gap-1 text-[9.5px] text-muted-foreground" data-testid="global-sem-mapa">
                        sem mapa
                        <Button type="button" size="sm" variant="outline" className="h-[20px] px-2 text-[10px]"
                          onClick={ev => { ev.stopPropagation(); onAbrirFazenda(l.fazenda.id, { importar: true }); }}>Importar</Button>
                      </div>
                    )}
                    <div className={cn('h-[12px] text-[9.5px] leading-[12px] text-[#8A5A00]', l.cabecasSemMapa === 0 && 'invisible')}>
                      {l.cabecasSemMapa > 0 ? `${n0(l.cabecasSemMapa)} cab sem mapa` : '·'}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            {/* o mínimo: abas 30 + subtítulo 16 + 3 barras (54) + a legenda de 2 linhas (34) + folgas */}
            <Card className="min-h-[164px] flex-1" testid="global-grafico">
              <div className="flex-none px-2 pt-2">
                <Segmentado valor={e.aba} onEscolher={v => atualizar({ aba: v })} altura={22}
                  opcoes={[{ valor: 'lotacao', rotulo: 'Lotação' }, { valor: 'area', rotulo: 'Área por situação' }, { valor: 'atividade', rotulo: 'Atividade' }]} />
              </div>
              <Grafico aba={e.aba} fazendas={fazendas} onAbrir={id => onAbrirFazenda(id)} />
            </Card>
          </div>
        </div>
        {erro && <div className="flex-none text-[10px] text-[#B03A2E]">{erro}</div>}
      </div>
    </div>
  );
}

/** Os 3 gráficos da coluna direita: lotação contra a faixa 300–500 · área por situação · cabeças por atividade. Clique na barra abre a fazenda. */
function Grafico({ aba, fazendas, onAbrir }: { aba: AbaDoGrafico; fazendas: LinhaDaFazenda[]; onAbrir: (id: string) => void }) {
  const W = 150;
  if (aba === 'lotacao') {
    const max = Math.max(LIMITE_CARGA_ALTA + 200, ...fazendas.map(l => l.kgHa ?? 0));
    const px = (v: number) => (v / max) * W;
    return (
      <QuadroDoGrafico testid="grafico-lotacao" subtitulo={`kg/ha no mês · faixa ideal ${LIMITE_SUBLOTADO}–${LIMITE_CARGA_ALTA} sombreada`}
        legenda={<Legenda itens={ORDEM_LEGENDA.slice(0, 3).map(s => ({ cor: COR_SITUACAO[s], rotulo: LEGENDA_SITUACAO[s] }))} />}>
        {fazendas.map(l => (
          <button key={l.fazenda.id} type="button" onClick={() => onAbrir(l.fazenda.id)} className="flex h-[18px] w-full items-center gap-1.5 hover:bg-muted/60">
            <b className="w-[34px] flex-none text-left text-[10px]">{l.fazenda.codigo}</b>
            <span className="relative h-2 flex-none rounded-[2px] bg-muted" style={{ width: W }}>
              <i className="absolute inset-y-0 bg-[#2F9E5B]/20" style={{ left: px(LIMITE_SUBLOTADO), width: px(LIMITE_CARGA_ALTA) - px(LIMITE_SUBLOTADO) }} />
              {l.kgHa != null && <i className="absolute inset-y-0 left-0 rounded-[2px]" style={{ width: px(l.kgHa), background: COR_SITUACAO[l.kgHa <= 0 ? 'vazio' : l.kgHa < LIMITE_SUBLOTADO ? 'sublotado' : l.kgHa <= LIMITE_CARGA_ALTA ? 'ideal' : 'carga_alta'] }} />}
            </span>
            <span className="ml-auto text-right text-[10px] tabular-nums">{n0(l.kgHa)}</span>
          </button>
        ))}
        <div className="mt-0.5 flex text-[9.5px] tabular-nums text-muted-foreground" style={{ marginLeft: 40, width: W }}>
          <span className="flex-1">0</span><span className="flex-1 text-center">{LIMITE_SUBLOTADO}</span><span className="flex-1 text-center">{LIMITE_CARGA_ALTA}</span><span className="flex-1 text-right">{formatNum(max, 0)}</span>
        </div>
      </QuadroDoGrafico>
    );
  }
  if (aba === 'area') {
    return (
      <QuadroDoGrafico testid="grafico-area" subtitulo="área de pastos por situação no mês"
        legenda={<Legenda itens={ORDEM_LEGENDA.map(s => ({ cor: COR_SITUACAO[s], rotulo: LEGENDA_SITUACAO[s] }))} />}>
        {fazendas.map(l => (
          <button key={l.fazenda.id} type="button" onClick={() => onAbrir(l.fazenda.id)} className="flex h-[18px] w-full items-center gap-1.5 hover:bg-muted/60">
            <b className="w-[34px] flex-none text-left text-[10px]">{l.fazenda.codigo}</b>
            <BarraDeSituacao areas={l.areaPorSituacao} largura={W} />
            <span className="ml-auto text-right text-[10px] tabular-nums">{n1(l.area)}</span>
          </button>
        ))}
      </QuadroDoGrafico>
    );
  }
  const atividades = [...new Set(fazendas.flatMap(l => [...l.cabecasPorAtividade.keys()]))]
    .sort((a, b) => ['cria', 'recria', 'engorda'].indexOf(a) - ['cria', 'recria', 'engorda'].indexOf(b) || a.localeCompare(b));
  const cor = (a: string) => COR_ATIVIDADE[a] ?? COR_ATIVIDADE_OUTRA;
  return (
    <QuadroDoGrafico testid="grafico-atividade" subtitulo="cabeças por atividade do fechamento no mês"
      legenda={<Legenda itens={atividades.map(a => ({ cor: cor(a), rotulo: rotuloDaAtividade(a) }))} />}>
      {fazendas.map(l => {
        const tot = [...l.cabecasPorAtividade.values()].reduce((s, v) => s + v, 0);
        return (
          <button key={l.fazenda.id} type="button" onClick={() => onAbrir(l.fazenda.id)} className="flex h-[18px] w-full items-center gap-1.5 hover:bg-muted/60">
            <b className="w-[34px] flex-none text-left text-[10px]">{l.fazenda.codigo}</b>
            {tot > 0 ? (
              <span className="flex h-2 flex-none overflow-hidden rounded-[2px]" style={{ width: W }}
                title={atividades.filter(a => l.cabecasPorAtividade.get(a)).map(a => `${rotuloDaAtividade(a)}: ${formatNum(l.cabecasPorAtividade.get(a) ?? 0, 0)} cab`).join(' · ')}>
                {atividades.map(a => (l.cabecasPorAtividade.get(a) ?? 0) > 0 && <i key={a} style={{ width: `${((l.cabecasPorAtividade.get(a) ?? 0) / tot) * 100}%`, background: cor(a) }} />)}
              </span>
            ) : <span className="flex-none text-[9.5px] text-muted-foreground" style={{ width: W }}>—</span>}
            <span className="ml-auto text-right text-[10px] tabular-nums">{tot > 0 ? formatNum(tot, 0) : '—'}</span>
          </button>
        );
      })}
    </QuadroDoGrafico>
  );
}

/* fix1 (2c): o subtítulo fica preso logo abaixo das abas e a legenda presa no pé do card; SÓ as barras rolam. Antes os três rolavam
   juntos e, com o card baixo (1126) ou muitas fazendas, a legenda ia para baixo da dobra e o subtítulo passava por trás das abas. */
function QuadroDoGrafico({ testid, subtitulo, legenda, children }: { testid: string; subtitulo: string; legenda: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2 pt-1.5" data-testid={testid}>
      <div className="mb-1 flex-none text-[9.5px] text-muted-foreground">{subtitulo}</div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid={`${testid}-barras`}>{children}</div>
      {legenda}
    </div>
  );
}

function Legenda({ itens }: { itens: { cor: string; rotulo: string }[] }) {
  return (
    <div className="flex flex-none flex-wrap gap-x-2.5 gap-y-1 pt-1.5 text-[9.5px]">
      {itens.map(i => <span key={i.rotulo} className="inline-flex items-center gap-1 whitespace-nowrap"><Quadradinho cor={i.cor} />{i.rotulo}</span>)}
    </div>
  );
}
