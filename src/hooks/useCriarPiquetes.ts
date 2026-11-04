/**
 * MAPA-CRIAR-PIQUETES-01 (fatia 1) — o modo "Criar piquetes" da Validação: o pasto escolhido é cortado na tela e a prévia/gravação vão pela
 * `fn_piquetes_criar` (115210), UM gesto:
 *   - pai sem divisões no cadastro → pastos novos (a `fn_piquetes_concluir` do Code 4, chamada por dentro);
 *   - pai que já originou um grupo (o P6) → cada parte LIGA a uma divisão existente (a `fn_piquetes_ligar` do Code 4, chamada por dentro).
 * O contorno do pai FICA (D1 b). A conta mora em `src/lib/mapa/*` (puras, testadas); aqui só o estado, as camadas do mapa e o banco.
 *
 * MAPA-CRIAR-PIQUETES-01 fatia 2a (Gabriel 02/11/2026) — o desenho vira UM dado (`Desenho`: praça + cercas, linhas, corredor) e TODO gesto o
 * troca por um novo (pilha do Desfazer, rascunho no navegador):
 *   - "Praça central" (padrão): praça regular com um vértice por divisão, no centro do pasto, e uma cerca de cada vértice à borda;
 *   - "Linhas que eu traço", "Grade" e "N iguais" (a grade só GERA as linhas; daí é edição de linhas) e o "Corredor";
 *   - clicar numa linha a seleciona (arrastar pontas, deslizar pelo meio, ponto no meio, tirar ponto, apagar); "Régua" livre;
 *   - "Nomear clicando": a próxima letra a cada clique; os nomes ficam presos à divisão pelo ponto interior;
 *   - a prévia e o gravar mandam `p_areas` (praça = benfeitoria, corredor = estrada) e `p_infra` (cocho) — a RPC ganha os dois depois do GO.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { supabase } from '@/integrations/supabase/client';
import { areaDoBancoHa, haDoBanco, paraPlano, type Divisao } from '@/lib/mapa/criarPiquetes';
import { usePontoAPonto } from '@/hooks/usePontoAPonto';
import {
  acrescentarLinha, alternarFixa, alternarSeguir, apagarLinha, cercaDoDesenho, comAreaInterna, comCorredor, comPiqueteCru, comPiqueteDesenhado, comPiqueteEditado, comLarguraDoCorredor,
  comRestante, contaDoPasto, desenhoDaGrade, desenhoVazio, deslizarLinha, divisoesDoDesenho, ehCerca, extrasParaGravar, internasDoDesenho, linhaDoDesenho, linhasDoDesenho,
  moverPontoDaLinha, pontoNaLinha, rotuloDaLinha, semAreaInterna, semPiqueteNoDesenho, tirarPontoDaLinha, TOLERANCIA_SEM_PIQUETE_HA,
  type ConfigDosPiquetes, type Desenho, type ModoDosPiquetes,
} from '@/lib/mapa/desenhoDosPiquetes';
import { areasInternasDoPasto } from '@/lib/mapa/areaCercada';
import type { Ponto } from '@/lib/mapa/edicaoDoPoligono';
import { fraseDaPrevia, pedidoDosPiquetes, secaoDaPrevia, type LinhaDaSecao } from '@/lib/mapa/gravacaoDosPiquetes';
import {
  alvosDeEncaixe, cantosDoPiquete, piqueteDesenhado, comAreaDesejadaPelaLinha, comCantoMovido, comCantoNaBorda, encaixar, fraseDaLinha, fraseDaSaida, linhasQueSaemEVoltam, planoDoPasto,
  pontoDentro, reguaLivre, segmentosDaRegua, semCanto, toleranciaDeEncaixeM, tracadoPelasBordas, trechosDaLinha, type AlvosDeEncaixe, type AreaInterna,
} from '@/lib/mapa/linhasDosPiquetes';
import {
  letraDoIndice, nomearClicando, ordemDaLista, presosDasDivisoes, proximoNomeLivre, semNomes, type GeradorDeNome, type NomePreso,
} from '@/lib/mapa/nomesDosPiquetes';
import { mesesDeInicio, soltosDentroDoPasto, type PoligonoParaPiquete } from '@/lib/mapa/piquetesEmEspera';
import {
  alinharPraca, anguloDoLado, areaDaPraca, areaDesejadaNaPraca, centroideDoPasto, comMedida, comOrientacao, DIAGONAL_PADRAO_M, igualarAreas, ladoMaisLongo,
  ladoMaisPerto, ladosDoPasto, medidasDaPraca, motivoDaPraca, moverCentro, moverVertice, novaPracaCentral, pontasForaDaPraca, pracaDesenhada,
  type FormatoDaPraca, type MedidaDaPraca, type PracaCentral,
} from '@/lib/mapa/pracaCentral';
import {
  guardarRascunhoDosPiquetes, horaDoRascunho, lerRascunhoDosPiquetes, type EstadoDosPiquetes, type RascunhoDosPiquetes,
} from '@/lib/mapa/rascunhoDosPiquetes';
import { desenharRotulosDeSegmentos } from '@/lib/mapa/rotulosDosLados';
import { mapaVivo } from '@/lib/mapa/enquadramentoDoMapa';

export type { ModoDosPiquetes };
/* MAPA-PRACA-ESTAVEL-01: 'referencia' = o clique que troca o lado de referência da cruz é uma FERRAMENTA anunciada na barra (antes todo clique
   perto de um lado do pasto girava a praça e refazia cercas e nomes — homologação 02/11 21:54, Modulo 03) */
/* PIQUETE-POLIGONO-01: 'piquete' = o "+ Piquete" (o polígono clicado ponto a ponto pela ferramenta única, `usePontoAPonto`) */
/* PIQUETE-PRO-01: 'areaInterna' = o "+ Área interna" (praça, corredor ou benfeitoria desenhada ponto a ponto; recorta os piquetes) */
export type FerramentaDosPiquetes = 'tracar' | 'regua' | 'nomear' | 'corredor' | 'desenharPraca' | 'referencia' | 'piquete' | 'areaInterna';
type Geo = GeoJSON.Polygon | GeoJSON.MultiPolygon;
/** A área interna que já existe no pasto (a praça do mapa): nome, área e forma. */
export interface AreaFixaDoPasto { id: string; nome: string; tipo: string; geojson: Geo }
export interface MembroSemDesenho { id: string; nome: string }
/** O grupo que o pai já originou (o P6): a leitura que DECIDE o caminho — falhou = não decide (P146). */
export type GrupoDoPai = { estado: 'lendo' } | { estado: 'erro' } | { estado: 'ok'; grupo: { id: string; nome: string; membros: MembroSemDesenho[] } | null };

export interface PreviaDoCriar {
  caso: 'novo' | 'grupo_existente';
  contornoHa: number | null;
  piquetes: { nome: string; areaHa: number; liga: 'novo' | 'existente' }[];
  somaHa: number;
  difContornoHa: number;
  frase: string | null;
  semDesenho: string | null;
  /** a seção própria (fatia 2a): a praça, o corredor e o cocho — nome, tipo, área — e a frase do mock */
  secao: LinhaDaSecao[];
  fraseLocal: string;
}

export interface PaiDosPiquetes { geometriaId: string; pastoId: string; nome: string; geojson: GeoJSON.Geometry }

const haBr = (ha: number) => haDoBanco(ha).toFixed(2).replace('.', ',');
const latlng = (p: readonly number[]): L.LatLngExpression => [p[1], p[0]];
const rotuloDoMapa = (texto: string) => `<span style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-size:10px;font-weight:600;color:#4c1d95;`
  + `background:rgba(255,255,255,.9);padding:0 3px;border-radius:2px;font-variant-numeric:tabular-nums">${texto}</span>`;
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A frase do banco (P0001 traz a frase pronta); o resto vai ao console e a tela diz uma frase da casa (OC-ABRIR-LENTO-01). */
function fraseDoErro(e: unknown): string {
  const msg = typeof e === 'object' && e && 'message' in e && typeof e.message === 'string' ? e.message : '';
  const code = typeof e === 'object' && e && 'code' in e ? String(e.code) : '';
  if (code === 'P0001' && msg) return msg;
  console.error('[fn_piquetes_criar]', e);
  return 'Não consegui conferir no banco agora. Nada foi gravado; tente de novo.';
}

export const configPadrao = (nomeDoPasto: string, refLado = 0): ConfigDosPiquetes => ({
  modo: 'praca', n: 4, formato: 'regular', medida: { tipo: 'diagonal', metros: DIAGONAL_PADRAO_M }, refLado, cocho: true,
  linhasGrade: 2, colunas: 4, girado: false, larguraCorredor: 6, prefixo: `${nomeDoPasto}-`,
});

function pracaDaConfig(g: GeoJSON.Polygon, c: ConfigDosPiquetes, centro: Ponto): PracaCentral | null {
  if (c.formato === 'livre') return null;
  return novaPracaCentral(g, { centro, n: c.n, formato: c.formato, medida: c.medida, anguloRad: anguloDoLado(g, c.refLado) });
}

/** O desenho de partida do modo (ao abrir ou ao trocar a grade). */
export function desenhoInicial(g: GeoJSON.Polygon, c: ConfigDosPiquetes): Desenho {
  if (c.modo === 'praca') return { ...desenhoVazio(), praca: pracaDaConfig(g, c, centroideDoPasto(g)) };
  if (c.modo === 'grade' || c.modo === 'iguais') return desenhoDaGrade(g, desenhoVazio(), c.modo === 'iguais' ? 1 : c.linhasGrade, c.colunas, c.girado);
  return desenhoVazio();
}

/** O desenho depois de mudar a escolha da barra: só o que a mudança pede é refeito (os ajustes à mão valem até a próxima mudança da forma). */
export function desenhoAposConfig(g: GeoJSON.Polygon, d: Desenho, antes: ConfigDosPiquetes, c: ConfigDosPiquetes): Desenho {
  if (c.modo === 'praca') {
    if (c.formato === 'livre') return d;
    const mudouForma = !d.praca || c.n !== antes.n || c.formato !== antes.formato;
    if (mudouForma) return { praca: pracaDaConfig(g, c, d.praca ? d.praca.centro : centroideDoPasto(g)), linhas: d.praca ? d.linhas : [], corredor: d.corredor };
    if (c.refLado !== antes.refLado && d.praca) return { ...d, praca: comOrientacao(g, d.praca, anguloDoLado(g, c.refLado)) };
    if ((c.medida.tipo !== antes.medida.tipo || c.medida.metros !== antes.medida.metros) && d.praca) return { ...d, praca: comMedida(g, d.praca, c.medida) };
    return d;
  }
  if (c.modo === 'linhas') return antes.modo === 'linhas' ? d : { ...desenhoVazio(), corredor: d.corredor };
  if (c.modo === 'grade' || c.modo === 'iguais') {
    if (c.modo !== antes.modo || c.linhasGrade !== antes.linhasGrade || c.colunas !== antes.colunas || c.girado !== antes.girado) {
      return desenhoDaGrade(g, d, c.modo === 'iguais' ? 1 : c.linhasGrade, c.colunas, c.girado);
    }
  }
  return d;
}

interface Passo { desenho: Desenho; presos: NomePreso[] }
interface Alca {
  chave: string; ponto: Ponto; classe: 'vertice' | 'giro' | 'ponta' | 'meio' | 'deslizar' | 'centro' | 'sel'; titulo: string;
  inicio?: () => void; mover?: (p: Ponto) => void; fim?: () => void; clique?: () => void; direito?: () => void;
}
const ICONES: Record<Alca['classe'], string> = {
  vertice: 'width:11px;height:11px;border-radius:2px;background:#fff;border:2.5px solid #f59e0b',
  giro: 'width:13px;height:13px;border-radius:9999px;background:#fff;border:3px solid #a21caf',
  ponta: 'width:12px;height:12px;border-radius:9999px;background:#fff;border:2.5px solid #7c3aed',
  meio: 'width:10px;height:10px;border-radius:9999px;background:#fff;border:2px solid #a21caf',
  deslizar: 'width:11px;height:11px;transform:rotate(45deg);background:#fff;border:2.5px solid #a21caf',
  centro: 'width:15px;height:15px;border-radius:9999px;background:rgba(245,158,11,.9);border:2.5px solid #fff',
  sel: 'width:12px;height:12px;border-radius:9999px;background:#fff;border:3px solid #2563eb',
};
const iconeDaAlca = (classe: Alca['classe']) => L.divIcon({ className: 'piquete-alca', iconSize: [15, 15],
  html: `<span data-alca="${classe}" style="display:block;box-sizing:border-box;cursor:grab;margin:auto;${ICONES[classe]}"></span>` });
/* MAPA-PRACA-ESTAVEL-01: a alça do centro fica SEMPRE por cima (com a praça pequena na tela, os cantos caíam em cima dela e o arrasto do centro
   pegava um canto e deformava a praça) */
const Z_DA_ALCA: Record<Alca['classe'], number> = { centro: 2000, sel: 1500, deslizar: 1200, ponta: 1100, meio: 1100, giro: 1000, vertice: 900 };
/** Os cantos da praça só ganham alça quando o raio dela na tela passa disto (abaixo, o canto ficaria em cima do centro). */
export const RAIO_MINIMO_DOS_CANTOS_PX = 16;

/** O rótulo curto de uma divisão — a parte DEPOIS do nome do pasto ("A"), a mesma no mapa e na coluna "Div." da lista. */
export function rotuloCurtoDaDivisao(nome: string, paiNome: string, i: number): string {
  const n = nome.trim();
  const curto = n.startsWith(paiNome) ? n.slice(paiNome.length).replace(/^[\s\-·]+/, '') : n;
  return curto || n || letraDoIndice(i);
}

export function useCriarPiquetes({ mapa, pastos, geometrias, clienteId, aoGravar, enquadrar }: {
  mapa: L.Map | null;
  /** MAPA-ZOOM-E-PAINEL-01: o enquadramento passa pelo módulo único (`enquadramentoDoMapa`, o `enquadrarEm` da visão) — nada de `fitBounds` aqui */
  enquadrar: (alvo: L.LatLngBounds, opcoes?: L.FitBoundsOptions) => void;
  pastos: readonly { id: string; nome: string; grupo_id?: string | null; ativo?: boolean | null }[];
  geometrias: readonly { id?: string; pasto_id: string | null; tipo?: string | null; nome_original?: string | null; geojson?: GeoJSON.Geometry }[];
  clienteId: string | null;
  aoGravar: () => void;
}) {
  const [pai, setPai] = useState<PaiDosPiquetes | null>(null);
  const [config, setConfigEstado] = useState<ConfigDosPiquetes>(configPadrao(''));
  const [desenho, setDesenho] = useState<Desenho>(desenhoVazio());
  const [base, setBase] = useState<NomePreso[]>([]);
  const [pilha, setPilha] = useState<Passo[]>([]);
  const [trabalhou, setTrabalhou] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [pontoSel, setPontoSel] = useState<number | null>(null);
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const [avisoDaArea, setAvisoDaArea] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ferramenta, setFerramentaEstado] = useState<FerramentaDosPiquetes | null>(null);
  const [emTraco, setEmTraco] = useState<Ponto[]>([]);
  const [reguaPontos, setReguaPontos] = useState<Ponto[]>([]);
  const [nomeados, setNomeados] = useState(0);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [guardado, setGuardado] = useState<RascunhoDosPiquetes | null>(null);
  const [grupo, setGrupo] = useState<GrupoDoPai>({ estado: 'lendo' });
  const [previa, setPrevia] = useState<PreviaDoCriar | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [zoomTique, setZoomTique] = useState(0);
  /* PIQUETES-PRACA-CONCAVO-01 (item 3): o aviso dos polígonos soltos dentro do pasto, dispensado com "Desenhar mesmo assim" */
  const [soltosDispensados, setSoltosDispensados] = useState(false);
  /* PIQUETE-PRO-01: o piquete com os cantos em edição e o tipo da próxima área interna */
  const [editando, setEditandoEstado] = useState<number | null>(null);
  const [tipoArea, setTipoArea] = useState<AreaInterna['tipo']>('praca');
  const tipoAreaRef = useRef(tipoArea); tipoAreaRef.current = tipoArea;

  /* espelhos para os handlers do mapa (que vivem mais que um render) */
  const desenhoRef = useRef(desenho); desenhoRef.current = desenho;
  const configRef = useRef(config); configRef.current = config;
  const emTracoRef = useRef<Ponto[]>([]);
  const reguaRef = useRef<Ponto[]>([]);
  const selecionadaRef = useRef<string | null>(null); selecionadaRef.current = selecionada;
  const ferramentaRef = useRef<FerramentaDosPiquetes | null>(null); ferramentaRef.current = ferramenta;
  const altRef = useRef(false);
  const alvosDoGestoRef = useRef<AlvosDeEncaixe | null>(null);

  const poligono = pai && pai.geojson.type === 'Polygon' ? pai.geojson : null;
  const poligonoRef = useRef(poligono); poligonoRef.current = poligono;
  /* PIQUETE-POLIGONO-01: no "+ Piquete" cada divisão é um polígono desenhado (na ordem em que nasceu); nos outros modos, o corte de sempre */
  const divisoes: Divisao[] = useMemo(() => (!poligono ? []
    : config.modo === 'poligonos' ? (desenho.piquetes ?? []).map((geojson, coluna) => ({ linha: 0, coluna, geojson, areaHa: areaDoBancoHa(geojson),
      partes: geojson.type === 'MultiPolygon' ? geojson.coordinates.length : 1 }))
    : divisoesDoDesenho(poligono, desenho)), [poligono, desenho, config.modo]);
  const n = divisoes.length;
  /* PIQUETES-PRACA-CONCAVO-01: a linha que sai do pasto e volta (cortada no 1º encontro) e as pontas da praça fora do pasto */
  const saidas = useMemo(() => (poligono ? linhasQueSaemEVoltam(poligono, linhasDoDesenho(desenho)) : []), [poligono, desenho]);
  const pontasFora = useMemo(() => (poligono && desenho.praca ? pontasForaDaPraca(poligono, desenho.praca).indices : []), [poligono, desenho.praca]);
  /* PIQUETE-PRO-01 (item 4): as áreas internas que já existem no pasto (a praça P_06) ficam fora dos piquetes sozinhas — a regra da área cercada */
  const fixasDoPasto: AreaFixaDoPasto[] = useMemo(() => {
    if (!pai || !poligono || config.modo !== 'poligonos') return [];
    const formas = geometrias.flatMap(x => {
      const geo = x.geojson;
      return x.id && x.tipo && (geo?.type === 'Polygon' || geo?.type === 'MultiPolygon') ? [{ id: x.id, tipo: x.tipo, nome: x.nome_original ?? '', geojson: geo }] : [];
    });
    return areasInternasDoPasto({ id: pai.geometriaId, geojson: poligono }, formas);
  }, [pai, poligono, geometrias, config.modo]);
  const fixas = useMemo(() => fixasDoPasto.map(f => f.geojson), [fixasDoPasto]);
  const fixasRef = useRef(fixas); fixasRef.current = fixas;
  /* item 3: Pasto · piquetes · praça/corredores · SEM PIQUETE */
  const conta = useMemo(() => (poligono && config.modo === 'poligonos' ? contaDoPasto(poligono, desenho, fixas) : null), [poligono, desenho, fixas, config.modo]);
  const soltosDoPasto: PoligonoParaPiquete[] = useMemo(
    () => (poligono && pai ? soltosDentroDoPasto(poligono, geometrias, pai.geometriaId) : []), [poligono, pai, geometrias]);
  const soltos = soltosDispensados ? [] : soltosDoPasto;

  // --- o grupo que o pai já originou ------------------------------------------------------------------------------------------------
  const lerGrupo = useCallback(async (paiId: string) => {
    setGrupo({ estado: 'lendo' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: tabela fora do types.ts gerado
    const { data, error } = await (supabase as any).from('pasto_grupos').select('id, nome').eq('pasto_origem_id', paiId).eq('cliente_id', clienteId).maybeSingle();
    if (error) { console.error('[pasto_grupos]', error); setGrupo({ estado: 'erro' }); return; }
    setGrupo({ estado: 'ok', grupo: data ? { id: data.id, nome: data.nome, membros: [] } : null });
  }, [clienteId]);

  const membrosSemDesenho: MembroSemDesenho[] = useMemo(() => {
    if (grupo.estado !== 'ok' || !grupo.grupo) return [];
    const g = grupo.grupo;
    return pastos.filter(p => p.grupo_id === g.id && p.ativo !== false && p.id !== pai?.pastoId && !geometrias.some(x => x.pasto_id === p.id))
      .map(p => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [grupo, pastos, geometrias, pai]);
  const existente = grupo.estado === 'ok' && !!grupo.grupo;

  // --- os nomes presos à divisão (e, no grupo que existe, a ligação) ---------------------------------------------------------------
  const gerar: GeradorDeNome = useCallback(usados => {
    if (existente) {
      const m = membrosSemDesenho.find(x => !usados.ligas.has(x.id));
      return m ? { nome: m.nome, liga: m.id } : { nome: '', liga: null };
    }
    return { nome: proximoNomeLivre(config.prefixo, usados.nomes), liga: null };
  }, [existente, membrosSemDesenho, config.prefixo]);
  const presos = useMemo(() => presosDasDivisoes(divisoes, base, gerar), [divisoes, base, gerar]);
  const presosRef = useRef(presos); presosRef.current = presos;
  useEffect(() => {
    if (JSON.stringify(presos) !== JSON.stringify(base)) setBase(presos);
  }, [presos, base]);
  const nomes = useMemo(() => presos.map(p => p.nome), [presos]);
  const ligas = useMemo(() => presos.map(p => p.liga), [presos]);
  /* o grupo apareceu/sumiu: os nomes recomeçam (membros do cadastro no lugar das letras) */
  const chaveDoCaso = `${pai?.geometriaId ?? ''}|${existente}`;
  const casoAnterior = useRef(chaveDoCaso);
  useEffect(() => {
    if (casoAnterior.current === chaveDoCaso) return;
    casoAnterior.current = chaveDoCaso;
    setBase([]);
  }, [chaveDoCaso]);

  // --- mudar o desenho (UM jeito só, com a pilha do Desfazer) ----------------------------------------------------------------------
  const pilhaRef = useRef<Passo[]>([]);
  const trocarPilha = useCallback((nova: Passo[]) => { pilhaRef.current = nova; setPilha(nova); }, []);
  const empilhar = useCallback(() => {
    trocarPilha([...pilhaRef.current, { desenho: desenhoRef.current, presos: presosRef.current }].slice(-60));
    setTrabalhou(true);
  }, [trocarPilha]);
  /** `empilha: false` = passo AO VIVO de um arrasto (o começo do gesto já empilhou). */
  const mudar = useCallback((f: (d: Desenho) => Desenho, empilha = true) => {
    if (empilha) empilhar();
    const novo = f(desenhoRef.current);
    desenhoRef.current = novo;
    setDesenho(novo); setPrevia(null); setAviso(null);
  }, [empilhar]);

  const desfazer = useCallback(() => {
    if (ferramentaRef.current && emTracoRef.current.length) { const r = emTracoRef.current.slice(0, -1); emTracoRef.current = r; setEmTraco(r); return; }
    if (ferramentaRef.current === 'regua' && reguaRef.current.length) { const r = reguaRef.current.slice(0, -1); reguaRef.current = r; setReguaPontos(r); return; }
    const ultimo = pilhaRef.current[pilhaRef.current.length - 1];
    if (!ultimo) return;
    trocarPilha(pilhaRef.current.slice(0, -1));
    desenhoRef.current = ultimo.desenho;
    setDesenho(ultimo.desenho); setBase(ultimo.presos); setPrevia(null); setSelecionada(null); setPontoSel(null);
  }, [trocarPilha]);

  const editandoRef = useRef<number | null>(null);
  const setEditando = useCallback((i: number | null) => { editandoRef.current = i; setEditandoEstado(i); }, []);
  const setFerramenta = useCallback((f: FerramentaDosPiquetes | null) => {
    ferramentaRef.current = f; setFerramentaEstado(f);
    emTracoRef.current = []; setEmTraco([]);
    reguaRef.current = []; setReguaPontos([]);
    if (f) { setSelecionada(null); setPontoSel(null); setEditando(null); }
  }, [setEditando]);

  /* PIQUETE-POLIGONO-01: o "+ Piquete" é a ferramenta única de clicar ponto a ponto (a do Medir no mapa), em polígono: fecha no 1º ponto e o
     piquete entra no desenho (recortado pelo pasto, sem cobrir os outros); um piquete por clique no botão. Esc desiste dele. */
  /* PIQUETE-PRO-01 (item 2): o ímã do piquete — a borda/canto do pasto, dos outros piquetes e das áreas internas a até 7 px (Alt solta);
     `exceto` = o piquete em edição (o canto não gruda nele mesmo) */
  const alvosDoPiquete = useCallback((exceto = -1): AlvosDeEncaixe | null => {
    const g = poligonoRef.current, d = desenhoRef.current;
    if (!g) return null;
    const formas = [...(d.piquetes ?? []).filter((_p, i) => i !== exceto), ...internasDoDesenho(d).map(a => a.geojson), ...fixasRef.current].map(geojson => ({ geojson }));
    return alvosDeEncaixe(g, [], formas, []);
  }, []);
  const noImaDoPiquete = useCallback((p: Ponto, alvos: AlvosDeEncaixe | null): Ponto => {
    if (!mapa || !mapaVivo(mapa) || altRef.current || !alvos) return p;
    const r = encaixar(p, alvos, toleranciaDeEncaixeM(mapa.getZoom(), p[1]));
    return r ? r.ponto : p;
  }, [mapa]);
  /** a borda comum IGUAL: o trecho entre dois pontos grudados na mesma borda segue a borda (o que o olho não vê como desvio, 14 px) */
  const pelasBordas = useCallback((pts: Ponto[]): Ponto[] => {
    const g = poligonoRef.current, d = desenhoRef.current;
    if (!g || !mapa || !mapaVivo(mapa) || !pts.length) return pts;
    const aneis = [g, ...(d.piquetes ?? []), ...internasDoDesenho(d).map(a => a.geojson), ...fixasRef.current]
      .flatMap(x => (x.type === 'Polygon' ? x.coordinates : x.coordinates.flat())).map(a => a.map((q): Ponto => [q[0], q[1]]));
    return tracadoPelasBordas(pts, aneis, 2 * toleranciaDeEncaixeM(mapa.getZoom(), pts[0][1]));
  }, [mapa]);
  const pontoAPonto = usePontoAPonto({
    mapa: pai && mapa && mapaVivo(mapa) ? mapa : null,
    forma: ferramenta === 'piquete' || ferramenta === 'areaInterna' ? 'poligono' : null,
    unidade: 'ha',
    ajustar: p => noImaDoPiquete(p, alvosDoPiquete()),
    /* item 5: ao vivo, a área que o piquete VAI TER (recortado pelo pasto e pelos vizinhos), em ha */
    areaM2: pts => {
      const g = poligonoRef.current, d = desenhoRef.current;
      if (!g) return 0;
      /* a área interna corta os piquetes: ela só não cobre as outras áreas internas */
      const obst = [...(ferramentaRef.current === 'areaInterna' ? [] : d.piquetes ?? []), ...internasDoDesenho(d).map(a => a.geojson), ...fixasRef.current];
      const r = piqueteDesenhado(g, obst, pts);
      return r ? areaDoBancoHa(r) * 10000 : 0;
    },
    aoTerminar: pts => {
      const g = poligonoRef.current;
      const f = ferramentaRef.current;
      if (g) {
        const caminho = pelasBordas(pts);
        if (f === 'areaInterna') mudar(d => comAreaInterna(g, d, tipoAreaRef.current, caminho, fixasRef.current));
        else mudar(d => comPiqueteDesenhado(g, d, caminho, fixasRef.current));
      }
      setFerramenta(null);
    },
    aoCancelar: () => setFerramenta(null),
  });
  const pontosDoPiquete = pontoAPonto.pontos;
  const pontosDoPiqueteRef = useRef(pontosDoPiquete); pontosDoPiqueteRef.current = pontosDoPiquete;
  const tirarUltimoRef = useRef(pontoAPonto.tirarUltimo); tirarUltimoRef.current = pontoAPonto.tirarUltimo;

  // --- abrir e fechar -----------------------------------------------------------------------------------------------------------------
  /** `inicio` = 'poligonos' (PIQUETE-POLIGONO-01): o "+ Piquete" abre já desenhando o 1º piquete. */
  const abrir = useCallback((p: PaiDosPiquetes, inicio?: ModoDosPiquetes) => {
    const meses = mesesDeInicio(new Date());
    const g = p.geojson.type === 'Polygon' ? p.geojson : null;
    const cfg0 = configPadrao(p.nome, g ? ladoMaisLongo(g) : 0);
    const cfg = inicio ? { ...cfg0, modo: inicio } : cfg0;
    const d = g ? desenhoInicial(g, cfg) : desenhoVazio();
    setPai(p); setPrevia(null); setErro(null); setEscolhida(null); setAvisoDaArea(null); setAviso(null); setMes(meses[meses.length - 1].valor);
    setConfigEstado(cfg); desenhoRef.current = d; setDesenho(d); setBase([]); trocarPilha([]); setTrabalhou(false);
    setSelecionada(null); setPontoSel(null); setConfirmarCancelar(false); setNomeados(0); setFerramenta(g && inicio === 'poligonos' ? 'piquete' : null); setSoltosDispensados(false); setEditando(null); setTipoArea('praca');
    setGuardado(lerRascunhoDosPiquetes(clienteId, p.geometriaId));
    void lerGrupo(p.pastoId);
  }, [lerGrupo, clienteId, setFerramenta, trocarPilha, setEditando]);

  const fechar = useCallback(() => {
    setPai(null); setPrevia(null); setErro(null); setDesenho(desenhoVazio()); desenhoRef.current = desenhoVazio(); trocarPilha([]); setBase([]);
    setConfirmarCancelar(false); setGuardado(null); setFerramenta(null); setSelecionada(null);
  }, [setFerramenta, trocarPilha]);

  /* ---- o rascunho no navegador: guardado a cada passo, "Continuar o rascunho de HH:MM?" ao abrir, apagado ao gravar ou descartar ---- */
  const geometriaId = pai?.geometriaId ?? null;
  useEffect(() => {
    if (!geometriaId || guardado || !trabalhou) return;
    const estado: EstadoDosPiquetes = { desenho, presos, config };
    guardarRascunhoDosPiquetes(clienteId, geometriaId, { em: horaDoRascunho(new Date()), estado });
  }, [geometriaId, guardado, trabalhou, desenho, presos, config, clienteId]);
  const continuarRascunho = useCallback(() => {
    if (!guardado) return;
    const e = guardado.estado;
    setConfigEstado(e.config); desenhoRef.current = e.desenho; setDesenho(e.desenho); setBase(e.presos); trocarPilha([]); setTrabalhou(true); setGuardado(null);
    setFerramenta(null);
  }, [guardado, setFerramenta, trocarPilha]);
  const comecarDoZero = useCallback(() => { guardarRascunhoDosPiquetes(clienteId, geometriaId, null); setGuardado(null); }, [clienteId, geometriaId]);

  const pedirCancelar = useCallback(() => {
    if (trabalhou) setConfirmarCancelar(true); else { guardarRascunhoDosPiquetes(clienteId, geometriaId, null); fechar(); }
  }, [trabalhou, clienteId, geometriaId, fechar]);
  const descartar = useCallback(() => { guardarRascunhoDosPiquetes(clienteId, geometriaId, null); fechar(); }, [clienteId, geometriaId, fechar]);

  // --- as escolhas da barra ---------------------------------------------------------------------------------------------------------
  const mudarConfig = useCallback((parc: Partial<ConfigDosPiquetes>) => {
    const antes = configRef.current;
    const nova = { ...antes, ...parc };
    configRef.current = nova; setConfigEstado(nova);
    const g = poligonoRef.current;
    if (!g) return;
    if (nova.modo === 'praca' && nova.formato === 'livre' && (antes.formato !== 'livre' || antes.modo !== 'praca')) { setFerramenta('desenharPraca'); return; }
    const d = desenhoAposConfig(g, desenhoRef.current, antes, nova);
    if (d !== desenhoRef.current) { mudar(() => d); setSelecionada(null); setPontoSel(null); setEscolhida(null); setAvisoDaArea(null); }
    if (nova.modo === 'linhas' && antes.modo !== 'linhas' && !linhasDoDesenho(desenhoRef.current).length) setFerramenta('tracar');
    if (nova.modo !== 'linhas' && antes.modo === 'linhas' && ferramentaRef.current === 'tracar') setFerramenta(null);
  }, [mudar, setFerramenta]);

  /* quando o grupo existe, começa com tantas partes quantas divisões sem desenho (N iguais) — uma vez por pasto */
  const grupoAplicado = useRef<string | null>(null);
  useEffect(() => {
    /* no "+ Piquete" nada se troca sozinho (o Gabriel desenha cada um) */
    if (configRef.current.modo === 'poligonos') return;
    if (!geometriaId || !existente || membrosSemDesenho.length < 2 || grupoAplicado.current === geometriaId) return;
    grupoAplicado.current = geometriaId;
    mudarConfig({ modo: 'iguais', colunas: membrosSemDesenho.length });
  }, [geometriaId, existente, membrosSemDesenho.length, mudarConfig]);

  // --- gestos sobre o desenho -----------------------------------------------------------------------------------------------------------
  const linhaSel = selecionada ? linhaDoDesenho(desenho, selecionada) : null;
  const cercaSel = selecionada ? cercaDoDesenho(desenho, selecionada) : null;

  const igualar = useCallback(() => {
    const g = poligonoRef.current, d = desenhoRef.current;
    if (!g || !d.praca) return;
    const r = igualarAreas(g, d.praca, { linhas: d.linhas, internas: d.corredor ? [d.corredor] : [] });
    if ('motivo' in r) { setAviso(r.motivo); return; }
    mudar(x => ({ ...x, praca: r.praca }));
  }, [mudar]);
  const alinhar = useCallback(() => {
    const g = poligonoRef.current, d = desenhoRef.current;
    if (!g || !d.praca) return;
    mudar(x => ({ ...x, praca: x.praca ? alinharPraca(g, x.praca) : null }));
  }, [mudar]);
  const alternarCadeado = useCallback(() => { if (selecionadaRef.current) mudar(d => alternarFixa(d, selecionadaRef.current ?? '')); }, [mudar]);
  const alternarSeguirSelecionada = useCallback(() => { if (selecionadaRef.current) mudar(d => alternarSeguir(d, selecionadaRef.current ?? '')); }, [mudar]);
  const apagarSelecionada = useCallback(() => {
    const id = selecionadaRef.current;
    if (!id) return;
    mudar(d => apagarLinha(d, id)); setSelecionada(null); setPontoSel(null);
  }, [mudar]);
  const tirarPonto = useCallback((i?: number) => {
    const id = selecionadaRef.current;
    if (!id) return;
    const k = i ?? pontoSel;
    if (k == null) return;
    mudar(d => tirarPontoDaLinha(d, id, k)); setPontoSel(null);
  }, [mudar, pontoSel]);
  const tirarCorredor = useCallback(() => mudar(d => ({ ...d, corredor: null })), [mudar]);
  /* PIQUETE-PRO-01 (item 1): corrigir o que foi desenhado — cada gesto entra na pilha do Desfazer */
  const editarPiquete = useCallback((i: number) => { setFerramenta(null); setEditando(editandoRef.current === i ? null : i); setEscolhida(i); }, [setFerramenta, setEditando]);
  const apagarPiquete = useCallback((i: number) => { setEditando(null); setEscolhida(null); mudar(d => semPiqueteNoDesenho(d, i)); }, [mudar, setEditando]);
  const restanteViraPiquete = useCallback(() => {
    const g = poligonoRef.current;
    if (!g) return;
    setFerramenta(null);
    mudar(d => comRestante(g, d, fixasRef.current));
  }, [mudar, setFerramenta]);
  const apagarAreaInterna = useCallback((id: string) => mudar(d => semAreaInterna(d, id)), [mudar]);
  const desenharAreaInterna = useCallback((t: AreaInterna['tipo']) => { tipoAreaRef.current = t; setTipoArea(t); setFerramenta('areaInterna'); }, [setFerramenta]);
  const larguraDoCorredor = useCallback((m: number | null) => {
    if (m == null || !(m > 0)) return;
    mudarConfig({ larguraCorredor: m });
    if (desenhoRef.current.corredor) mudar(d => comLarguraDoCorredor(d, m));
  }, [mudar, mudarConfig]);
  const mudarMedida = useCallback((metros: number | null, tipo?: MedidaDaPraca['tipo']) => {
    if (metros == null || !(metros > 0)) return;
    mudarConfig({ medida: { tipo: tipo ?? configRef.current.medida.tipo, metros } });
  }, [mudarConfig]);
  const mudarFormato = useCallback((f: FormatoDaPraca) => {
    const m = configRef.current.medida;
    const medida: MedidaDaPraca = f === 'circulo' ? { tipo: 'raio', metros: m.tipo === 'raio' ? m.metros : m.tipo === 'diagonal' ? m.metros / 2 : DIAGONAL_PADRAO_M / 2 }
      : { tipo: 'diagonal', metros: m.tipo === 'raio' ? m.metros * 2 : m.tipo === 'diagonal' ? m.metros : DIAGONAL_PADRAO_M };
    mudarConfig({ formato: f, medida });
  }, [mudarConfig]);

  const pedirArea = useCallback((i: number, ha: number | null) => {
    const g = poligonoRef.current, d = desenhoRef.current;
    if (!g || ha == null) return;
    setAvisoDaArea(null);
    if (d.praca) {
      const ponto = presosRef.current[i]?.ponto;
      if (!ponto) return;
      const r = areaDesejadaNaPraca(g, d.praca, { linhas: d.linhas, internas: d.corredor ? [d.corredor] : [] }, ponto, ha);
      if ('motivo' in r) { setAvisoDaArea(r.motivo); return; }
      mudar(x => ({ ...x, praca: r.praca }));
      return;
    }
    const r = comAreaDesejadaPelaLinha(g, d.linhas, internasDoDesenho(d), i, ha, selecionadaRef.current);
    if ('motivo' in r) { setAvisoDaArea(r.motivo); return; }
    mudar(x => ({ ...x, linhas: r.linhas }));
  }, [mudar]);

  // --- nomes ------------------------------------------------------------------------------------------------------------------------------
  const setNome = useCallback((i: number, v: string) => setBase(presosRef.current.map((p, k) => (k === i ? { ...p, nome: v } : p))), []);
  const setLiga = useCallback((i: number, v: string | null) => {
    const m = membrosSemDesenho.find(x => x.id === v);
    setBase(presosRef.current.map((p, k) => (k === i ? { ...p, liga: v, nome: m ? m.nome : p.nome } : p)));
  }, [membrosSemDesenho]);
  const nomearNaOrdem = useCallback((i: number) => {
    const nome = `${configRef.current.prefixo}${letraDoIndice(nomeados)}`;
    empilhar();
    setBase(nomearClicando(presosRef.current, i, nome)); setNomeados(k => k + 1); setPrevia(null);
  }, [nomeados, empilhar]);
  const recomecarNomes = useCallback(() => { empilhar(); setBase(semNomes(presosRef.current)); setNomeados(0); setPrevia(null); }, [empilhar]);
  const ordemDaListaDosNomes = useMemo(() => ordemDaLista(nomes), [nomes]);

  // --- o que trava a prévia -----------------------------------------------------------------------------------------------------------
  const motivo = useMemo(() => {
    if (!pai) return null;
    if (!poligono) return 'Este pasto tem o polígono em partes separadas: una as partes antes de criar piquetes.';
    if (grupo.estado === 'lendo') return 'Conferindo se o pasto já tem divisões no cadastro…';
    if (grupo.estado === 'erro') return 'Não consegui verificar se o pasto já tem divisões. Tente de novo.';
    if (emTraco.length && ferramenta !== 'regua') return 'Termine a linha em traçado (duplo clique) ou desfaça os pontos.';
    if (desenho.praca) { const m = motivoDaPraca(poligono, desenho.praca); if (m) return m; }
    if (config.modo === 'poligonos') {
      if (ferramenta === 'piquete' && pontosDoPiquete.length) return 'Feche o piquete no 1º ponto (ou Esc para desistir dele).';
      if (ferramenta === 'areaInterna' && pontosDoPiquete.length) return 'Feche a área interna no 1º ponto (ou Esc para desistir dela).';
      if (n < 2) return 'Desenhe pelo menos 2 piquetes ("+ Piquete").';
      /* PIQUETE-PRO-01 (regra do Gabriel): os piquetes preenchem 100% do pasto — tolerância de 0,01 ha */
      if (conta && conta.semPiqueteHa > TOLERANCIA_SEM_PIQUETE_HA) return `Faltam ${haBr(conta.semPiqueteHa)} ha sem piquete: desenhe ou use "Restante vira piquete".`;
    } else {
      if (!linhasDoDesenho(desenho).length) return 'Risque pelo menos uma linha de lado a lado (ou escolha a praça).';
      if (n < 2) return 'As linhas ainda não dividem o pasto: elas precisam ir de uma borda à outra (ou à praça).';
    }
    const vazia = divisoes.findIndex(d => !d.geojson || d.areaHa <= 0);
    if (vazia >= 0) return `A divisão ${letraDoIndice(vazia)} ficou sem área: deslize a linha.`;
    const partida = divisoes.findIndex(d => d.partes > 1);
    if (partida >= 0) return `A divisão ${letraDoIndice(partida)} saiu em ${divisoes[partida].partes} partes: deslize a linha ou mude a grade.`;
    if (existente) {
      if (n > membrosSemDesenho.length) {
        return `${pai.nome} tem ${membrosSemDesenho.length} ${membrosSemDesenho.length === 1 ? 'divisão' : 'divisões'} sem desenho: faça no máximo ${membrosSemDesenho.length} partes.`;
      }
      if (ligas.some(l => !l)) return 'Escolha a divisão do cadastro de cada parte.';
      if (new Set(ligas).size !== ligas.length) return 'A mesma divisão foi escolhida para duas partes.';
    } else {
      if (nomes.some(x => !x.trim())) return 'Dê nome a todas as divisões.';
      const chaves = nomes.map(x => x.trim().toLowerCase());
      if (new Set(chaves).size !== chaves.length) return 'Duas divisões têm o mesmo nome.';
    }
    return null;
  }, [pai, poligono, grupo, emTraco, ferramenta, desenho, divisoes, n, existente, membrosSemDesenho.length, ligas, nomes, config.modo, pontosDoPiquete.length, conta]);

  // --- o banco ----------------------------------------------------------------------------------------------------------------------------
  const pedido = useCallback((simular: boolean, mesEscolhido?: string | null) => pedidoDosPiquetes({
    paiId: pai?.pastoId, mes: mesEscolhido ?? mes, simular, desenho, cocho: config.cocho,
    piquetes: divisoes.map((d, i) => ({ nome: (existente ? membrosSemDesenho.find(m => m.id === ligas[i])?.nome : nomes[i])?.trim() ?? '',
      geojson: d.geojson, pasto_id: existente ? ligas[i] : null })),
  }), [pai, mes, desenho, config.cocho, divisoes, existente, membrosSemDesenho, ligas, nomes]);

  const prever = useCallback(async (mesEscolhido?: string | null) => {
    if (motivo || !pai) return;
    setConferindo(true); setErro(null);
    const p = pedido(true, mesEscolhido);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_piquetes_criar', p);
    setConferindo(false);
    if (error) { setErro(fraseDoErro(error)); setPrevia(null); return; }
    const piquetes: PreviaDoCriar['piquetes'] = (data.piquetes ?? []).map((x: { nome: string; area_ha: number; liga: 'novo' | 'existente' }) => ({ nome: x.nome, areaHa: Number(x.area_ha), liga: x.liga }));
    const extras = extrasParaGravar(desenho, config.cocho);
    setPrevia({
      caso: data.caso, contornoHa: data.contorno?.area_ha ?? null, somaHa: Number(data.soma_ha), difContornoHa: Number(data.dif_contorno_ha), piquetes,
      frase: data.concluir?.frase ?? data.ligar?.frase ?? null, semDesenho: data.ligar?.sem_desenho ?? null,
      secao: secaoDaPrevia(extras.areas, extras.infra),
      fraseLocal: fraseDaPrevia({ paiNome: pai.nome, caso: data.caso, piquetes, areas: extras.areas, infra: extras.infra }),
    });
  }, [motivo, pai, pedido, desenho, config.cocho]);

  const gravar = useCallback(async () => {
    if (!previa || !pai) return;
    setGravando(true); setErro(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc('fn_piquetes_criar', pedido(false));
    setGravando(false);
    if (error) { setErro(fraseDoErro(error)); return; }
    guardarRascunhoDosPiquetes(clienteId, pai.geometriaId, null);
    fechar();
    aoGravar();
  }, [previa, pai, pedido, fechar, aoGravar, clienteId]);

  // --- o encaixe (7 px; Alt solta) ----------------------------------------------------------------------------------------------------
  const vizinhos = useMemo(() => geometrias.flatMap(x => (x.geojson && x.id !== pai?.geometriaId ? [x.geojson] : [])), [geometrias, pai]);
  /** Os alvos do encaixe; `sem` tira o que está sendo arrastado (senão o ponto gruda em si mesmo). */
  const alvosDe = useCallback((sem: 'nada' | 'praca' | string): AlvosDeEncaixe | null => {
    const g = poligonoRef.current, d = desenhoRef.current;
    if (!g) return null;
    const linhas = linhasDoDesenho(d).filter(l => (sem === 'praca' ? !ehCerca(d, l.id) : l.id !== sem));
    const internas = internasDoDesenho(d).filter(a => !(sem === 'praca' && a.tipo === 'praca'));
    return alvosDeEncaixe(g, linhas, internas, vizinhos);
  }, [vizinhos]);
  const encaixarEm = useCallback((p: Ponto, alvos: AlvosDeEncaixe | null): Ponto => {
    if (!mapa || altRef.current || !alvos) return p;
    const r = encaixar(p, alvos, toleranciaDeEncaixeM(mapa.getZoom(), p[1]));
    return r ? r.ponto : p;
  }, [mapa]);

  useEffect(() => {
    if (!pai) return undefined;
    const aoTeclar = (ev: KeyboardEvent) => { altRef.current = ev.altKey; };
    window.addEventListener('keydown', aoTeclar); window.addEventListener('keyup', aoTeclar);
    return () => { window.removeEventListener('keydown', aoTeclar); window.removeEventListener('keyup', aoTeclar); };
  }, [pai]);

  // --- teclado: Esc (ignora menu/lista/diálogo), Ctrl/Cmd+Z, Backspace ----------------------------------------------------------------------
  useEffect(() => {
    if (!pai) return undefined;
    const aoTeclar = (ev: KeyboardEvent) => {
      const alvo = ev.target;
      const emCampo = alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement;
      if (ev.key === 'Escape') {
        if (emCampo) return;
        /* o Esc que fecha um menu, uma lista ou um diálogo é DELES (achado na prova do MAPA-CRIAR-PIQUETES-01) */
        if (alvo instanceof Element && alvo.closest('[role="menu"], [role="listbox"], [role="dialog"], [data-testid="piquetes-lista"]')) return;
        if (document.querySelector('[role="menu"][data-state="open"], [role="listbox"][data-state="open"], [role="dialog"][data-state="open"]')) return;
        ev.preventDefault(); ev.stopPropagation();
        if (confirmarCancelar) { setConfirmarCancelar(false); return; }
        if (ferramentaRef.current) {
          if (emTracoRef.current.length) { emTracoRef.current = []; setEmTraco([]); return; }
          setFerramenta(null); return;
        }
        if (selecionadaRef.current) { setSelecionada(null); setPontoSel(null); return; }
        if (editandoRef.current != null) { setEditando(null); return; }
        pedirCancelar();
        return;
      }
      if (emCampo) return;
      /* "+ Piquete": o Backspace é da ferramenta (tira o último ponto); o Ctrl+Z, no meio do piquete, também tira o ponto (não o piquete de antes) */
      if (ferramentaRef.current === 'piquete' || ferramentaRef.current === 'areaInterna') {
        if (ev.key === 'Backspace') return;
        if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z' && pontosDoPiqueteRef.current.length) { ev.preventDefault(); tirarUltimoRef.current(); return; }
      }
      if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); desfazer(); return; }
      if (ev.key === 'Backspace' && ferramentaRef.current) { ev.preventDefault(); desfazer(); }
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [pai, confirmarCancelar, pedirCancelar, desfazer, setFerramenta, setEditando]);

  // --- terminar o que está sendo traçado -----------------------------------------------------------------------------------------------
  const terminarTraco = useCallback(() => {
    const pts = emTracoRef.current;
    const f = ferramentaRef.current;
    emTracoRef.current = []; setEmTraco([]);
    if (f === 'regua' || !f) return;
    const g = poligonoRef.current;
    if (!g) return;
    if (f === 'desenharPraca') {
      if (pts.length < 3) return;
      const p = pracaDesenhada(g, pts);
      if (!p) return;
      mudar(d => ({ ...d, praca: p, linhas: [] }));
      setFerramenta(null);
      return;
    }
    if (pts.length < 2) return;
    if (f === 'corredor') { mudar(d => comCorredor(d, pts, configRef.current.larguraCorredor)); setFerramenta(null); return; }
    let novoId = '';
    mudar(d => { const r = acrescentarLinha(d, pts); novoId = r.id; return r.desenho; });
    setFerramenta(null); setSelecionada(novoId); setPontoSel(null);
  }, [mudar, setFerramenta]);

  const adicionarPontoDoTraco = useCallback((p: Ponto) => {
    const ult = emTracoRef.current[emTracoRef.current.length - 1];
    if (ult && ult[0] === p[0] && ult[1] === p[1]) return; // o 2º clique do duplo clique
    const r = [...emTracoRef.current, p];
    emTracoRef.current = r; setEmTraco(r);
  }, []);
  const adicionarPontoDaRegua = useCallback((p: Ponto) => { const r = [...reguaRef.current, p]; reguaRef.current = r; setReguaPontos(r); }, []);

  // --- os cliques do mapa -------------------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!mapa || !pai || !mapaVivo(mapa)) return undefined;
    const contentor = mapa.getContainer();
    const cursor = contentor.style.cursor;
    const dava = mapa.doubleClickZoom.enabled();
    const aoClicar = (ev: L.LeafletMouseEvent) => {
      const g = poligonoRef.current;
      if (!g) return;
      const f = ferramentaRef.current;
      if (f === 'piquete' || f === 'areaInterna') return; // o clique é da ferramenta ponto a ponto
      const bruto: Ponto = [ev.latlng.lng, ev.latlng.lat];
      if (f === 'tracar' || f === 'corredor' || f === 'desenharPraca') { adicionarPontoDoTraco(encaixarEm(bruto, alvosDe('nada'))); return; }
      if (f === 'regua') { adicionarPontoDaRegua(encaixarEm(bruto, alvosDe('nada'))); return; }
      const dentro = divisoes.findIndex(d => pontoDentro(d.geojson, bruto));
      if (f === 'nomear') { if (dentro >= 0) nomearNaOrdem(dentro); return; }
      /* MAPA-PRACA-ESTAVEL-01: só com a ferramenta "Lado de referência" ligada (anunciada na barra) o clique troca o lado; um clique e ela sai */
      if (f === 'referencia') {
        const i = ladoMaisPerto(g, bruto);
        if (i !== configRef.current.refLado) mudarConfig({ refLado: i });
        setFerramenta(null);
        return;
      }
      /* sem ferramenta, o clique no mapa só ESCOLHE a divisão (o realce e a "Área desejada"): nada se refaz */
      setSelecionada(null); setPontoSel(null);
      setEscolhida(dentro >= 0 ? dentro : null);
    };
    const aoDuplo = () => { if (ferramentaRef.current && ferramentaRef.current !== 'regua' && ferramentaRef.current !== 'nomear') terminarTraco(); };
    mapa.on('click', aoClicar); mapa.on('dblclick', aoDuplo);
    mapa.doubleClickZoom.disable();
    if (ferramenta) contentor.style.cursor = ferramenta === 'nomear' || ferramenta === 'referencia' ? 'pointer' : 'crosshair';
    return () => {
      mapa.off('click', aoClicar); mapa.off('dblclick', aoDuplo);
      if (dava) mapa.doubleClickZoom.enable();
      contentor.style.cursor = cursor;
    };
  }, [mapa, pai, ferramenta, divisoes, adicionarPontoDoTraco, adicionarPontoDaRegua, encaixarEm, alvosDe, nomearNaOrdem, mudarConfig, terminarTraco, setFerramenta]);

  // --- as camadas do mapa ---------------------------------------------------------------------------------------------------------------
  /* enquadra o pasto ao abrir (folga para a barra no alto e a lista à direita) */
  useEffect(() => {
    if (!mapa || !pai || !mapaVivo(mapa)) return;
    const b = L.geoJSON(pai.geojson).getBounds();
    if (b.isValid()) enquadrar(b, { paddingTopLeft: [20, 70], paddingBottomRight: [270, 20] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir (o `enquadrar` muda de identidade a cada movimento do mapa)
  }, [mapa, pai]);

  /* o zoom e os créditos (canto de baixo à direita) saem de baixo da lista enquanto o modo está aberto */
  useEffect(() => {
    if (!mapa || !pai || !mapaVivo(mapa)) return undefined;
    const canto = mapa.getContainer().querySelector<HTMLElement>('.leaflet-bottom.leaflet-right');
    if (!canto) return undefined;
    canto.style.marginRight = '262px';
    return () => { canto.style.marginRight = ''; };
  }, [mapa, pai]);

  useEffect(() => {
    if (!mapa || !pai || !mapaVivo(mapa)) return undefined;
    const aoZoom = () => setZoomTique(t => t + 1);
    mapa.on('zoomend', aoZoom);
    return () => { mapa.off('zoomend', aoZoom); };
  }, [mapa, pai]);

  /* 1) as divisões: preenchimento tracejado e, no meio (no ponto preso ao nome), o nome e a área */
  useEffect(() => {
    if (!mapa || !pai || !mapaVivo(mapa)) return undefined;
    const g = L.layerGroup().addTo(mapa);
    divisoes.forEach((d, i) => {
      if (!d.geojson) return;
      L.geoJSON(d.geojson, { style: { color: '#7c3aed', weight: 1, dashArray: '6 4', fillColor: escolhida === i ? '#7c3aed' : '#a78bfa', fillOpacity: escolhida === i ? 0.3 : 0.12 }, pmIgnore: true, interactive: false }).addTo(g);
      const ponto = presos[i]?.ponto ?? [0, 0];
      const nome = (presos[i]?.nome ?? '').trim();
      /* no mapa vai a parte DEPOIS do nome do pasto ("A · 24,95 ha"): o nome inteiro era mais largo que o quadrante e cobria os metros
         dos lados (homologação 02/11); o nome inteiro fica na lista */
      L.marker(latlng(ponto), { interactive: false, pmIgnore: true, icon: L.divIcon({ className: 'piquete-rotulo', iconSize: [0, 0],
        html: rotuloDoMapa(`${escapar(rotuloCurtoDaDivisao(nome, pai.nome, i))} · ${haBr(d.areaHa)} ha`) }) }).addTo(g);
    });
    return () => { g.remove(); };
  }, [mapa, pai, divisoes, presos, escolhida]);

  /* 2) a praça (âmbar), o lado de referência e o cocho */
  useEffect(() => {
    if (!mapa || !pai || !poligono || !mapaVivo(mapa)) return undefined;
    const g = L.layerGroup().addTo(mapa);
    if (desenho.praca) {
      const a = areaDaPraca(desenho.praca);
      L.geoJSON(a.geojson, { style: { color: '#f59e0b', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0.35 }, pmIgnore: true, interactive: false }).addTo(g);
      /* PIQUETES-PRACA-CONCAVO-01: a ponta que cai fora do pasto (no furo ou além da borda) fica marcada em vermelho */
      const vs = desenho.praca.vertices;
      pontasFora.forEach(i => vs[i] && L.circleMarker(latlng(vs[i]), { radius: 4, color: '#dc2626', weight: 2, fillColor: '#fecaca', fillOpacity: 1,
        interactive: false, pmIgnore: true }).addTo(g));
      if (config.cocho) {
        L.marker(latlng(desenho.praca.centro), { interactive: false, pmIgnore: true, icon: L.divIcon({ className: 'piquete-cocho', iconSize: [14, 14],
          html: '<span style="display:block;width:14px;height:14px;border-radius:2px;background:#78350f;border:1.5px solid #fff;box-sizing:border-box"></span>' }) }).addTo(g);
      }
    }
    if (desenho.corredor) L.geoJSON(desenho.corredor.geojson, { style: { color: '#92400e', weight: 1.5, fillColor: '#d6a756', fillOpacity: 0.45 }, pmIgnore: true, interactive: false }).addTo(g);
    if (config.modo === 'praca' && desenho.praca) {
      const l = ladosDoPasto(poligono)[config.refLado];
      if (l) L.polyline([latlng(l.a), latlng(l.b)], { color: '#f59e0b', weight: 5, opacity: 0.8, lineCap: 'round', interactive: false, pmIgnore: true })
        .bindTooltip('lado de referência (clique em outro lado para trocar)', { permanent: false }).addTo(g);
    }
    return () => { g.remove(); };
  }, [mapa, pai, poligono, desenho.praca, desenho.corredor, config.cocho, config.modo, config.refLado, pontasFora]);

  /* PIQUETE-PRO-01: o SEM PIQUETE pintado de vermelho, as áreas internas (as que existem e as desenhadas) e a borda do piquete em edição (clique cria canto) */
  useEffect(() => {
    if (!mapa || !pai || !poligono || !mapaVivo(mapa) || config.modo !== 'poligonos') return undefined;
    const g = L.layerGroup().addTo(mapa);
    if (conta?.semPiquete) L.geoJSON(conta.semPiquete, { style: { color: '#dc2626', weight: 1, fillColor: '#ef4444', fillOpacity: 0.35 }, pmIgnore: true, interactive: false }).addTo(g);
    fixasDoPasto.forEach(f => L.geoJSON(f.geojson, { style: { color: '#b45309', weight: 1.5, dashArray: '3 3', fillColor: '#f59e0b', fillOpacity: 0.25 }, pmIgnore: true, interactive: false }).addTo(g));
    (desenho.internas ?? []).forEach(a => {
      L.geoJSON(a.geojson, { style: { color: '#92400e', weight: 1.5, fillColor: '#d6a756', fillOpacity: 0.5 }, pmIgnore: true, interactive: false }).addTo(g);
    });
    const emEdicao = editando != null ? desenho.piquetes?.[editando] : null;
    if (emEdicao && editando != null && !ferramenta) {
      const i = editando;
      L.geoJSON(emEdicao, { style: { color: '#2563eb', weight: 2.5, fill: false }, pmIgnore: true, interactive: false }).addTo(g);
      const aneis = emEdicao.type === 'Polygon' ? emEdicao.coordinates : emEdicao.coordinates.flat();
      aneis.forEach(anel => {
        const alvo = L.polyline(anel.map(latlng), { weight: 14, opacity: 0, interactive: true, pmIgnore: true, bubblingMouseEvents: false }).addTo(g);
        alvo.on('click', (ev: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(ev);
          mudar(x => { const atual = x.piquetes?.[i]; return atual ? comPiqueteCru(x, i, comCantoNaBorda(atual, [ev.latlng.lng, ev.latlng.lat])) : x; });
        });
      });
    }
    return () => { g.remove(); };
  }, [mapa, pai, poligono, config.modo, conta, fixasDoPasto, desenho.internas, desenho.piquetes, editando, ferramenta, mudar]);

  /* 3) as linhas: a selecionada magenta e grossa; clique seleciona (e, na selecionada, cria ponto) */
  const aoClicarLinha = useCallback((id: string, ll: L.LatLng) => {
    if (selecionadaRef.current === id) { mudar(d => pontoNaLinha(d, id, [ll.lng, ll.lat])); return; }
    setSelecionada(id); setPontoSel(null); setEscolhida(null);
  }, [mudar]);
  useEffect(() => {
    if (!mapa || !pai || !mapaVivo(mapa)) return undefined;
    const g = L.layerGroup().addTo(mapa);
    linhasDoDesenho(desenho).forEach(l => {
      const sel = l.id === selecionada;
      const fixa = !!cercaDoDesenho(desenho, l.id)?.fixa;
      const pts = l.pontos.map(latlng);
      L.polyline(pts, { color: sel ? '#a21caf' : '#5b21b6', weight: sel ? 4 : 2.5, dashArray: fixa && !sel ? '1 0' : undefined, interactive: false, pmIgnore: true }).addTo(g);
      if (!ferramenta) {
        const alvo = L.polyline(pts, { weight: 14, opacity: 0, interactive: true, pmIgnore: true, bubblingMouseEvents: false }).addTo(g);
        alvo.on('click', (ev: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(ev); aoClicarLinha(l.id, ev.latlng); });
      }
    });
    /* PIQUETES-PRACA-CONCAVO-01: NA LINHA, onde ela foi cortada ("Linha 4 cruza a borda 2×: cortada no 1º encontro") */
    saidas.forEach(s => {
      const r = rotuloDaLinha(desenho, s.id);
      L.circleMarker(latlng(s.corte), { radius: 4, color: '#b45309', weight: 2, fillColor: '#fde68a', fillOpacity: 1, interactive: false, pmIgnore: true }).addTo(g);
      L.marker(latlng(s.corte), { interactive: false, pmIgnore: true, icon: L.divIcon({ className: 'piquete-saida', iconSize: [0, 0],
        html: `<span data-testid="piquetes-saida" style="position:absolute;left:6px;top:-7px;white-space:nowrap;font-size:9.5px;font-weight:600;color:#92400e;background:rgba(255,251,235,.95);padding:0 3px;border-radius:2px">${escapar(`${r ? `${r.rotulo} ${r.numero} ` : ''}${fraseDaSaida(s.cruzamentos, s.seguida)}`)}</span>` }) }).addTo(g);
    });
    return () => { g.remove(); };
  }, [mapa, pai, desenho, selecionada, ferramenta, aoClicarLinha, saidas]);

  /* 4) o que está sendo traçado e a régua livre */
  useEffect(() => {
    if (!mapa || !pai || !mapaVivo(mapa)) return undefined;
    const g = L.layerGroup().addTo(mapa);
    const pontos = ferramenta === 'regua' ? reguaPontos : emTraco;
    if (pontos.length) {
      L.polyline(pontos.map(latlng), { color: ferramenta === 'regua' ? '#0f766e' : '#7c3aed', weight: 2, dashArray: '6 4', interactive: false, pmIgnore: true }).addTo(g);
      pontos.forEach(p => L.circleMarker(latlng(p), { radius: 3, color: '#7c3aed', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false, pmIgnore: true }).addTo(g));
    }
    if (ferramenta === 'regua' && reguaPontos.length > 1) {
      const r = reguaLivre(reguaPontos);
      r.parciaisM.forEach((m, i) => L.marker(latlng([(reguaPontos[i][0] + reguaPontos[i + 1][0]) / 2, (reguaPontos[i][1] + reguaPontos[i + 1][1]) / 2]), { interactive: false, pmIgnore: true,
        icon: L.divIcon({ className: 'piquete-regua', iconSize: [0, 0], html: `<span style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-size:9.5px;font-weight:600;color:#0f766e;background:rgba(255,255,255,.92);padding:0 2px;border-radius:2px">${Math.round(m).toLocaleString('pt-BR')} m</span>` }) }).addTo(g));
    }
    return () => { g.remove(); };
  }, [mapa, pai, ferramenta, emTraco, reguaPontos]);

  /* 5) a régua dos lados: o metro de CADA lado de cada divisão, sem repetir o lado comum (o mesmo componente de rótulos dos outros modos) */
  const segmentos = useMemo(() => (poligono ? segmentosDaRegua(poligono, linhasDoDesenho(desenho), internasDoDesenho(desenho)) : []), [poligono, desenho]);
  useEffect(() => {
    if (!mapa || !pai || !mapaVivo(mapa)) return undefined;
    const g = L.layerGroup().addTo(mapa);
    /* no "+ Piquete" na tela só a área de cada piquete (os metros dos lados ficam nos outros modos) */
    if (config.modo !== 'poligonos') desenharRotulosDeSegmentos(mapa, g, segmentos);
    return () => { g.remove(); };
  }, [mapa, pai, segmentos, zoomTique, config.modo]);

  // --- as alças (reaproveitadas: o marcador arrastado nunca é recriado no meio do arrasto) -----------------------------------------------------
  const alcasRef = useRef(new Map<string, { marker: L.Marker; spec: Alca; classe: Alca['classe'] }>());
  const arrastando = useRef<string | null>(null);

  const alcas: Alca[] = useMemo(() => {
    if (!poligono || !pai) return [];
    const lista: Alca[] = [];
    const d = desenho;
    const plano = planoDoPasto(poligono);
    const ativo = !ferramenta;
    /* o raio da praça NA TELA (zoomTique relê a cada zoom): pequeno demais, os cantos não ganham alça (o centro anda inteiro) */
    const raioNaTela = d.praca && mapa && mapaVivo(mapa) ? (() => {
      const c = mapa.latLngToContainerPoint(latlng(d.praca.centro));
      return Math.max(...d.praca.vertices.map(v => c.distanceTo(mapa.latLngToContainerPoint(latlng(v)))));
    })() : 0;
    if (d.praca && ativo) {
      lista.push({ chave: 'centro', ponto: d.praca.centro, classe: 'centro', titulo: 'Arraste: a praça inteira anda',
        inicio: () => { empilhar(); alvosDoGestoRef.current = alvosDe('praca'); },
        mover: p => mudar(x => (x.praca ? { ...x, praca: moverCentro(poligono, x.praca, encaixarEm(p, alvosDoGestoRef.current)) } : x), false), fim: () => { alvosDoGestoRef.current = null; } });
      if (raioNaTela >= RAIO_MINIMO_DOS_CANTOS_PX) d.praca.vertices.forEach((v, i) => {
        lista.push({ chave: `v${i}`, ponto: v, classe: 'vertice', titulo: 'Arraste: o canto da praça (a cerca acompanha)',
          inicio: () => { empilhar(); alvosDoGestoRef.current = alvosDe('praca'); },
          mover: p => mudar(x => (x.praca ? { ...x, praca: moverVertice(poligono, x.praca, i, encaixarEm(p, alvosDoGestoRef.current)) } : x), false), fim: () => { alvosDoGestoRef.current = null; } });
      });
      d.praca.cercas.forEach(c => {
        lista.push({ chave: `g${c.id}`, ponto: c.pontos[c.pontos.length - 1], classe: 'giro', titulo: 'Arraste: gira a cerca em volta da praça (presa à borda)',
          inicio: () => { empilhar(); setSelecionada(c.id); setPontoSel(null); },
          mover: p => mudar(x => moverPontoDaLinha(poligono, x, c.id, (cercaDoDesenho(x, c.id)?.pontos.length ?? 2) - 1, p), false) });
      });
    }
    /* PIQUETE-PRO-01: os cantos do piquete em edição — arrastar (gruda nos vizinhos; recorta ao soltar), botão direito tira */
    const emEdicao = editando != null && ativo && config.modo === 'poligonos' ? d.piquetes?.[editando] ?? null : null;
    if (emEdicao && editando != null) {
      const i = editando;
      let antes: Geo | null = null;
      cantosDoPiquete(emEdicao).forEach(c => {
        lista.push({ chave: `e${i}-${c.parte}-${c.anel}-${c.i}`, ponto: c.p, classe: 'ponta', titulo: 'Arraste o canto · clique na borda cria ponto · botão direito tira',
          inicio: () => { empilhar(); antes = desenhoRef.current.piquetes?.[i] ?? null; alvosDoGestoRef.current = alvosDoPiquete(i); },
          mover: q => mudar(x => { const atual = x.piquetes?.[i]; return atual ? comPiqueteCru(x, i, comCantoMovido(atual, c, noImaDoPiquete(q, alvosDoGestoRef.current))) : x; }, false),
          fim: () => { const a0 = antes; alvosDoGestoRef.current = null; if (a0) mudar(x => comPiqueteEditado(poligono, x, i, a0, fixasRef.current), false); },
          direito: () => mudar(x => {
            const atual = x.piquetes?.[i];
            const sem = atual ? semCanto(atual, c) : null;
            return atual && sem ? comPiqueteEditado(poligono, comPiqueteCru(x, i, sem), i, atual, fixasRef.current) : x;
          }) });
      });
    }
    const sel = selecionada && ativo ? linhaDoDesenho(d, selecionada) : null;
    if (sel && selecionada) {
      const id = selecionada;
      const cerca = cercaDoDesenho(d, id);
      sel.pontos.forEach((p, k) => {
        if (cerca && (k === 0 || k === sel.pontos.length - 1)) return; // as pontas da cerca já têm a alça da praça / do giro
        lista.push({ chave: `p${id}-${k}`, ponto: p, classe: pontoSel === k ? 'sel' : cerca ? 'meio' : 'ponta', titulo: 'Arraste o ponto · clique para escolher · botão direito tira',
          inicio: () => { empilhar(); setPontoSel(k); alvosDoGestoRef.current = alvosDe(id); },
          mover: q => mudar(x => moverPontoDaLinha(poligono, x, id, k, encaixarEm(q, alvosDoGestoRef.current)), false), fim: () => { alvosDoGestoRef.current = null; },
          clique: () => setPontoSel(k), direito: () => tirarPonto(k) });
      });
      const a = paraPlano(plano, sel.pontos[0]), b = paraPlano(plano, sel.pontos[sel.pontos.length - 1]);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 0) {
        const mid: Ponto = [(sel.pontos[0][0] + sel.pontos[sel.pontos.length - 1][0]) / 2, (sel.pontos[0][1] + sel.pontos[sel.pontos.length - 1][1]) / 2];
        const m0 = paraPlano(plano, mid);
        const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
        let baseD: Desenho | null = null;
        lista.push({ chave: `s${id}`, ponto: mid, classe: 'deslizar', titulo: 'Arraste: a linha inteira desliza paralela',
          inicio: () => { empilhar(); baseD = desenhoRef.current; },
          mover: q => { const qp = paraPlano(plano, q); const desloc = (qp[0] - m0[0]) * nx + (qp[1] - m0[1]) * ny; if (baseD) { const b0 = baseD; mudar(() => deslizarLinha(poligono, b0, id, desloc), false); } } });
      }
    }
    return lista;
  }, [poligono, pai, desenho, selecionada, pontoSel, ferramenta, alvosDe, encaixarEm, empilhar, mudar, tirarPonto, mapa, zoomTique, editando, config.modo, alvosDoPiquete, noImaDoPiquete]);

  useEffect(() => {
    const mapaAlcas = alcasRef.current;
    if (!mapa || !pai) {
      mapaAlcas.forEach(x => x.marker.remove()); mapaAlcas.clear();
      return;
    }
    const chaves = new Set(alcas.map(a => a.chave));
    mapaAlcas.forEach((x, k) => { if (!chaves.has(k)) { x.marker.remove(); mapaAlcas.delete(k); } });
    alcas.forEach(a => {
      const existente0 = mapaAlcas.get(a.chave);
      if (existente0) {
        existente0.spec = a;
        if (existente0.classe !== a.classe) { existente0.marker.setIcon(iconeDaAlca(a.classe)); existente0.marker.setZIndexOffset(Z_DA_ALCA[a.classe]); existente0.classe = a.classe; }
        if (arrastando.current !== a.chave) existente0.marker.setLatLng(latlng(a.ponto));
        return;
      }
      const marker = L.marker(latlng(a.ponto), { icon: iconeDaAlca(a.classe), draggable: true, pmIgnore: true, title: a.titulo, keyboard: false, zIndexOffset: Z_DA_ALCA[a.classe] });
      const entrada = { marker, spec: a, classe: a.classe };
      marker.on('dragstart', () => { arrastando.current = a.chave; entrada.spec.inicio?.(); });
      marker.on('drag', () => { const ll = marker.getLatLng(); entrada.spec.mover?.([ll.lng, ll.lat]); });
      marker.on('dragend', () => {
        arrastando.current = null; entrada.spec.fim?.();
        const ll = alcasRef.current.get(a.chave)?.spec.ponto;
        if (ll) marker.setLatLng(latlng(ll));
      });
      marker.on('click', (ev: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(ev); entrada.spec.clique?.(); });
      marker.on('contextmenu', (ev: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(ev); ev.originalEvent.preventDefault(); entrada.spec.direito?.(); });
      marker.addTo(mapa);
      mapaAlcas.set(a.chave, entrada);
    });
  }, [mapa, pai, alcas]);
  useEffect(() => () => { alcasRef.current.forEach(x => x.marker.remove()); alcasRef.current.clear(); }, []);

  // --- o que a barra mostra ---------------------------------------------------------------------------------------------------------------------
  const totalHa = useMemo(() => (poligono ? divisoes.reduce((s, d) => s + d.areaHa, 0) + (desenho.praca ? medidasDaPraca(poligono, desenho.praca).areaHa : 0) : null), [poligono, divisoes, desenho.praca]);
  const medidasPraca = useMemo(() => (poligono && desenho.praca ? medidasDaPraca(poligono, desenho.praca) : null), [poligono, desenho.praca]);
  const fraseDaSelecionada = useMemo(() => {
    if (!poligono || !selecionada) return null;
    const r = rotuloDaLinha(desenho, selecionada);
    const t = trechosDaLinha(poligono, linhasDoDesenho(desenho), internasDoDesenho(desenho), selecionada);
    if (!r || !t) return null;
    const saida = saidas.find(x => x.id === selecionada);
    return saida ? `${fraseDaLinha(r.numero, t.totalM, t.trechosM, r.rotulo)} · ${fraseDaSaida(saida.cruzamentos, saida.seguida)}` : fraseDaLinha(r.numero, t.totalM, t.trechosM, r.rotulo);
  }, [poligono, desenho, selecionada, saidas]);
  const reguaLivreFrase = useMemo(() => {
    if (ferramenta !== 'regua') return null;
    if (reguaPontos.length < 2) return 'Régua: clique ponto a ponto (gruda em cantos e linhas); Esc sai';
    const r = reguaLivre(reguaPontos);
    return `Régua: ${r.parciaisM.map(m => Math.round(m).toLocaleString('pt-BR')).join(' + ')} = ${Math.round(r.totalM).toLocaleString('pt-BR')} m`;
  }, [ferramenta, reguaPontos]);

  return {
    aberto: !!pai, pai, abrir, fechar,
    /* as escolhas da barra */
    config, mudarConfig, mudarMedida, mudarFormato,
    modo: config.modo, setModo: (m: ModoDosPiquetes) => mudarConfig({ modo: m }),
    /* o desenho e as divisões */
    desenho, divisoes, nomes, ligas, presos, setNome, setLiga, ordemDaLista: ordemDaListaDosNomes,
    escolhida, setEscolhida, pedirArea, avisoDaArea,
    grupo, existente, membrosSemDesenho, tentarGrupoDeNovo: () => { if (pai) void lerGrupo(pai.pastoId); },
    /* linhas */
    selecionada, setSelecionada, pontoSel, linhaSel, cercaSel, fraseDaSelecionada, tirarPonto, apagarSelecionada, alternarCadeado,
    ferramenta, setFerramenta, emTraco, terminarTraco, reguaPontos, reguaLivreFrase,
    igualar, alinhar, tirarCorredor, larguraDoCorredor,
    /* nomes clicando */
    nomeados, proximaLetra: letraDoIndice(nomeados), recomecarNomes, nomearDivisao: nomearNaOrdem,
    /* desfazer, cancelar, rascunho */
    desfazer, podeDesfazer: pilha.length > 0 || emTraco.length > 0 || reguaPontos.length > 0, temTrabalho: trabalhou,
    confirmarCancelar, pedirCancelar, descartar, continuarSemDescartar: () => setConfirmarCancelar(false),
    guardado, continuarRascunho, comecarDoZero,
    /* medidas e o que trava */
    totalHa, medidasPraca, aviso, motivo, erro,
    /* PIQUETES-PRACA-CONCAVO-01 */
    saidas, pontasFora, soltos, dispensarSoltos: () => setSoltosDispensados(true), alternarSeguirSelecionada,
    /* PIQUETE-PRO-01 */
    conta, fixasDoPasto, editando, editarPiquete, apagarPiquete, restanteViraPiquete, tipoArea, desenharAreaInterna, apagarAreaInterna,
    previa, setPrevia, prever, gravar, conferindo, gravando, mes, setMes,
  };
}

export type CriarPiquetes = ReturnType<typeof useCriarPiquetes>;
export const letraDaDivisao = letraDoIndice;
