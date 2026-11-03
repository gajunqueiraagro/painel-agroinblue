/**
 * MAPA-EDITAR-POLIGONO-01 — o gesto de editar polígono na Validação (Gabriel 01/11/2026), num hook próprio: liga o Geoman (grátis) numa
 * CAMADA PRÓPRIA do mapa (a Validação redesenha os polígonos dela a cada clique), mede ao vivo pela lib única (`edicaoDoPoligono`),
 * monta o gesto e grava SÓ pela `fn_geometria_gravar` (prévia = a própria função com simular; trilha; desfazer pela
 * `fn_geometria_desfazer`). Cancelar = tirar a camada, nada gravado. A área oficial é a do cadastro: aqui só a "área do mapa".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { supabase } from '@/integrations/supabase/client';
import {
  contornosDaFazenda, corrigirPoligono, ladosM, temPontosAmontoados, type Correcao, cruzamentos as cruzamentosDoAnel, distanciaM, dividirPorLinha, FRASE_DO_CRUZAMENTO, verticeEmCimaDeOutro, medidasDe, MINIMO_SOBREPOSICAO_HA, recortarDosVizinhos, sobreposicoes, distanciaEntrePoligonosM, TIPOS_DE_CONTORNO, TOLERANCIA_FRESTA_M, unirVarios,
  vizinhosDaDivisa, type Divisao, type Medidas, type OperacaoNoVertice, type Ponto, type Sobreposicao,
} from '@/lib/mapa/edicaoDoPoligono';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';
import { desenharRotulosDosLados } from '@/lib/mapa/rotulosDosLados';
import { fraseDo42501 } from '@/lib/mapa/fraseDaPermissao';
import { idsDoAlterar, recortarPorPadrao, travaDaLinha, vaiPelaLinha } from '@/lib/mapa/piquetesVolta';

export type ModoDaEdicao = 'vertices' | 'redesenhar' | 'dividir' | 'unir' | 'apagar' | 'desenhar';

export interface PoligonoDaFazenda {
  id: string;
  nome_original: string;
  geojson: GeoJSON.Geometry;
  pasto_id: string | null;
  tipo?: string | null;
}

interface Alvo { id: string; versao: number; nome: string; geojson: GeoJSON.Geometry; pasto_id: string | null }

export interface ItemDaPrevia {
  id: string; nome: string; mudanca: 'criado' | 'alterado' | 'removido'; pasto_antes: string | null; pasto_depois: string | null;
  /** MAPA-EDITAR-POLIGONO-02: a área do mapa deste polígono antes × depois (a conta é da tela; null = não se aplica) */
  areaAntesHa?: number | null; areaDepoisHa?: number | null;
}
export interface Previa {
  poligonos: ItemDaPrevia[];
  pastosSemPoligono: { pasto_id: string; nome: string }[];
  areaAntesHa: number;
  areaDepoisHa: number;
  sobreposicoes: Sobreposicao[];
}

type Gesto = Record<string, unknown>;

/** O que a função do banco devolve como frase pronta (22023/40001/P0002 já vêm em português); o resto vira frase genérica. */
function fraseDoErro(e: { code?: string; message?: string } | null): string {
  if (!e) return 'Não consegui gravar o polígono.';
  if (e.code === '42501') return fraseDo42501(e.message);
  if (e.code && ['22023', '40001', 'P0002', 'P0001'].includes(e.code) && e.message) return e.message;
  return 'Não consegui gravar o polígono. Tente de novo.';
}

/* MAPA-EDITAR-POLIGONO-02 (item 4): o encaixe "pulava uns metros" — 7 px (antes 15) e desligável (botão na barra; Alt/Option segurado
   desliga enquanto arrasta: o Geoman testa o `altKey` do evento); o contorno da fazenda nunca é alvo do encaixe (`snapIgnore` na Validação) */
export const DISTANCIA_DO_ENCAIXE_PX = 7;
/* na edição o zoom passa do último nível da imagem (a imagem do último nível é ampliada), para pôr o ponto na cerca */
export const ZOOM_MAXIMO_NA_EDICAO = 22;
const CHAVE_DO_ENCAIXE = 'mapa-edicao-encaixe';
function lerEncaixe(): boolean {
  try { return sessionStorage.getItem(CHAVE_DO_ENCAIXE) !== '0'; } catch { return true; }
}
function gravarEncaixe(v: boolean) {
  try { sessionStorage.setItem(CHAVE_DO_ENCAIXE, v ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta tela */ }
}
/* allowSelfIntersection: true — com false o Geoman pintava de vermelho e DESFAZIA o ponto sem dizer por quê (item 7); o cruzamento agora é
   achado aqui (`cruzamentos`), com a frase e o ponto destacado, e trava a prévia.
   tooltips: false — MAPA-DICA-GEOMAN-01 (Gabriel 02/11 21:43, Sta. Tereza): a dica do Geoman que segue o cursor ("Clique no primeiro marcador
   para finalizar") tapava justo o ponto do clique; a instrução fica só na barra de cima. Vale em TODO modo (estas são as opções únicas). */
export const opcoesDoGeoman = (encaixe: boolean) => ({ snappable: encaixe, snapDistance: DISTANCIA_DO_ENCAIXE_PX, allowSelfIntersection: true, tooltips: false });
const latLngsDe = (g: GeoJSON.Polygon): L.LatLng[][] => g.coordinates.map(a => a.map(p => L.latLng(p[1], p[0])));

/* -08 (Gabriel 16:00, Sta. Tereza: "o único caminho é Cancelar e perder tudo"): o desenho novo é guardado no NAVEGADOR (localStorage, por
   cliente + fazenda) a cada mudança; ao voltar, "Continuar o desenho de HH:MM". Some ao gravar ou ao descartar com confirmação. */
export interface RascunhoGuardado { geojson: GeoJSON.Polygon; nome: string; em: string }
const chaveDoRascunho = (cliente: string | null | undefined, fazenda: string | null | undefined) => `mapa-rascunho:${cliente ?? '-'}:${fazenda ?? '-'}`;
export function lerRascunhoGuardado(cliente: string | null | undefined, fazenda: string | null | undefined): RascunhoGuardado | null {
  try {
    const txt = localStorage.getItem(chaveDoRascunho(cliente, fazenda));
    if (!txt) return null;
    const v: unknown = JSON.parse(txt);
    if (!v || typeof v !== 'object') return null;
    const g: unknown = Reflect.get(v, 'geojson'), nome: unknown = Reflect.get(v, 'nome'), em: unknown = Reflect.get(v, 'em');
    if (!g || typeof g !== 'object' || Reflect.get(g, 'type') !== 'Polygon') return null;
    const coords: unknown = Reflect.get(g, 'coordinates');
    if (!Array.isArray(coords)) return null;
    const aneis = coords.filter((a): a is number[][] => Array.isArray(a) && a.every(p => Array.isArray(p) && p.length >= 2 && p.every(n => typeof n === 'number')));
    if (aneis.length === 0 || aneis[0].length < 4) return null;
    return { geojson: { type: 'Polygon', coordinates: aneis }, nome: typeof nome === 'string' ? nome : 'Novo polígono', em: typeof em === 'string' ? em : '' };
  } catch { return null; }
}
export function guardarRascunho(cliente: string | null | undefined, fazenda: string | null | undefined, r: RascunhoGuardado | null) {
  try {
    if (r) localStorage.setItem(chaveDoRascunho(cliente, fazenda), JSON.stringify(r));
    else localStorage.removeItem(chaveDoRascunho(cliente, fazenda));
  } catch { /* sem armazenamento: o rascunho vale só nesta tela */ }
}

const pontoDe = (ll: L.LatLng): Ponto => [ll.lng, ll.lat];
const pt2 = (q: readonly number[]): Ponto => [q[0], q[1]];
/** O ponto do marcador do vértice (o Geoman entrega o evento do marcador sem tipo). */
function pontoDoMarcador(ev: unknown): Ponto | null {
  const alvo = ev && typeof ev === 'object' && 'target' in ev ? ev.target : null;
  return alvo instanceof L.Marker ? pontoDe(alvo.getLatLng()) : null;
}
/** Os dois vizinhos de um ponto no anel externo da camada (o lado em que o vértice novo entrou). */
function ladoDoVertice(l: L.Polygon, p: Ponto): [Ponto, Ponto] | null {
  const ll = l.getLatLngs()[0];
  if (!Array.isArray(ll)) return null;
  const anel = ll.filter((x): x is L.LatLng => x instanceof L.LatLng).map(pontoDe);
  const i = anel.findIndex(q => distanciaM(q, p) < 0.01);
  if (i < 0 || anel.length < 3) return null;
  return [anel[(i - 1 + anel.length) % anel.length], anel[(i + 1) % anel.length]];
}

function geometriaDaCamada(l: L.Layer): GeoJSON.Geometry | null {
  if (l instanceof L.Polyline) return l.toGeoJSON().geometry;
  return null;
}

function pontosDaLinha(g: GeoJSON.Geometry | null): Ponto[] {
  if (!g || g.type !== 'LineString') return [];
  return g.coordinates.map(p => [p[0], p[1]]);
}

export function useEdicaoDoPoligono(args: {
  mapa: L.Map | null;
  fazendaId: string | null;
  geometrias: readonly PoligonoDaFazenda[];
  /** MAPA-DICAS-01 (área): depois de gravar, devolve o id do polígono CRIADO (se houve) para a tela selecioná-lo */
  aoMudar: (criadoId?: string) => void;
  /** -08: para guardar o rascunho do desenho no navegador por cliente + fazenda */
  clienteId?: string | null;
  /** -09: o polígono selecionado na Validação (fora da edição) também mostra os metros dos lados */
  selecionado?: GeoJSON.Geometry | null;
  /** MAPA-CRIAR-PIQUETES-01 (2b, "Mover linha"): os ids dos polígonos das divisões do MESMO grupo — o gesto só vale entre duas delas */
  divisoesDaLinha?: ReadonlySet<string> | null;
  /** MAPA-PIQUETES-MANUAL-01 (4): os polígonos que são divisões de um grupo ativo (o desenho que cai sobre eles nasce com o recortar ligado) */
  piquetes?: ReadonlySet<string> | null;
}) {
  const { mapa, fazendaId, geometrias, aoMudar, clienteId, selecionado, divisoesDaLinha = null, piquetes = null } = args;
  const camadaRef = useRef<L.FeatureGroup | null>(null);
  const [modo, setModo] = useState<ModoDaEdicao | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [geometriaNova, setGeometriaNova] = useState<GeoJSON.Geometry | null>(null);
  const [divisao, setDivisao] = useState<Divisao | null>(null);
  const [originalFicaCom, setOriginalFicaCom] = useState<'a' | 'b'>('a');
  const [pastoVaiParaNova, setPastoVaiParaNova] = useState(false);
  /* MAPA-EDITAR-POLIGONO-04: o unir junta VÁRIOS — o alvo fica (com a forma da união) e os `unidos` somem nele; `ficaComDe` = o polígono
     cujo pasto o resultado herda ('' = sem classificação; o padrão é o próprio alvo) */
  const [unidos, setUnidos] = useState<string[]>([]);
  const [ficaComDe, setFicaComDe] = useState<string>('');
  const [motivo, setMotivo] = useState('');
  const [destinoDoPasto, setDestinoDoPasto] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState('');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [ultimoGesto, setUltimoGesto] = useState<string | null>(null);
  /* MAPA-EDITAR-POLIGONO-02 */
  const [encaixe, setEncaixeEstado] = useState<boolean>(lerEncaixe);
  const [divisaJunto, setDivisaJunto] = useState(true);
  const [recortar, setRecortarEstado] = useState(false);
  /* MAPA-PIQUETES-MANUAL-01 (4): a escolha do operador (ou o padrão já aplicado) vale até o fim do gesto */
  const recortarDecidido = useRef(false);
  const setRecortar = useCallback((v: boolean) => { recortarDecidido.current = true; setRecortarEstado(v); }, []);
  /* MAPA-CRIAR-PIQUETES-01 (2b): "Mover linha" = o modo vértices com a divisa junto OBRIGATÓRIA; o Gravar vai pela `fn_piquetes_mover_linha`
     (diálogo próprio, com mês e motivo) em vez da `fn_geometria_gravar`; `linhaAberta` = o diálogo da prévia está aberto */
  const [moverLinha, setMoverLinha] = useState(false);
  const [linhaAberta, setLinhaAberta] = useState(false);
  const [operacoes, setOperacoesEstado] = useState<OperacaoNoVertice[]>([]);
  const opsRef = useRef<OperacaoNoVertice[]>([]);
  const setOperacoes = useCallback((o: OperacaoNoVertice[]) => { opsRef.current = o; setOperacoesEstado(o); }, []);
  /* item 7: "Desfazer passo" — a forma ANTES de cada passo (e quantas operações havia), para voltar um movimento por vez */
  const passosRef = useRef<{ geo: GeoJSON.Polygon; nOps: number }[]>([]);
  const [nPassos, setNPassos] = useState(0);
  const editadoRef = useRef<L.Polygon | null>(null);
  /* a forma depois do último passo (o "antes" do próximo); o "Desfazer passo" também a acerta */
  const depoisDoUltimoRef = useRef<GeoJSON.Polygon | null>(null);
  /* -05: cria um vértice num ponto da linha do polígono em edição (o clique na linha e os pontos do meio dos trechos visíveis) */
  const acrescentarRef = useRef<((p: Ponto) => void) | null>(null);
  /* o clique na linha é ouvido no MAPA (a 1 px fora do traço o clique não cai na camada do polígono); sai ao encerrar */
  const cliqueNaLinhaRef = useRef<((ev: L.LeafletMouseEvent) => void) | null>(null);
  /* -06: o desenho AO VIVO (pontos postos + cursor) e o rascunho editável depois de fechar */
  const [pontosDoDesenho, setPontosDoDesenho] = useState<Ponto[]>([]);
  const [cursorDoDesenho, setCursorDoDesenho] = useState<Ponto | null>(null);
  const [temRascunho, setTemRascunho] = useState(false);
  const moverRef = useRef<((ev: L.LeafletMouseEvent) => void) | null>(null);
  /* -08: durante o desenho — a camada que o Geoman está desenhando (para reler os pontos), e a confirmação do Esc */
  const desenhoRef = useRef<L.Polyline | null>(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  /* -08: "Tirar ponto" — clicar num ponto o escolhe e o botão o tira; o botão direito segue tirando direto */
  const [verticeEscolhido, setVerticeEscolhido] = useState<Ponto | null>(null);
  const tirarRef = useRef<((p: Ponto) => void) | null>(null);
  const [guardado, setGuardado] = useState<RascunhoGuardado | null>(null);
  useEffect(() => { setGuardado(lerRascunhoGuardado(clienteId, fazendaId)); }, [clienteId, fazendaId]);
  /* item 8: o "Corrigir automaticamente" do polígono que veio inválido (o que mudou, para a barra dizer) */
  const [correcao, setCorrecao] = useState<Correcao | null>(null);
  const encaixeRef = useRef(encaixe);
  encaixeRef.current = encaixe;
  const setEncaixe = useCallback((v: boolean) => {
    setEncaixeEstado(v); gravarEncaixe(v);
    if (mapa) mapa.pm.setGlobalOptions(opcoesDoGeoman(v));
  }, [mapa]);

  const limparCamada = useCallback(() => {
    if (mapa) {
      mapa.pm.disableDraw();
      mapa.off('pm:create');
      if (cliqueNaLinhaRef.current) { mapa.off('click', cliqueNaLinhaRef.current); cliqueNaLinhaRef.current = null; }
      mapa.off('pm:drawstart');
      if (moverRef.current) { mapa.off('mousemove', moverRef.current); moverRef.current = null; }
      mapa.doubleClickZoom.enable();
    }
    camadaRef.current?.eachLayer(l => { if (l instanceof L.Polyline) l.pm.disable(); });
    camadaRef.current?.clearLayers();
  }, [mapa]);

  const encerrar = useCallback(() => {
    limparCamada();
    setModo(null); setAlvo(null); setGeometriaNova(null); setDivisao(null); setUnidos([]); setFicaComDe('');
    setOriginalFicaCom('a'); setPastoVaiParaNova(false); setMotivo(''); setDestinoDoPasto(null); setNomeNovo(''); setPrevia(null);
    setErro(null); setOperacoes([]); setRecortarEstado(false); recortarDecidido.current = false; setMoverLinha(false); setLinhaAberta(false);
    passosRef.current = []; setNPassos(0); editadoRef.current = null; depoisDoUltimoRef.current = null; acrescentarRef.current = null;
    setPontosDoDesenho([]); setCursorDoDesenho(null); setTemRascunho(false); setConfirmarCancelar(false); desenhoRef.current = null;
    setVerticeEscolhido(null); tirarRef.current = null; setCorrecao(null);
  }, [limparCamada, setOperacoes]);

  // a camada própria nasce com o mapa e sai com ele
  useEffect(() => {
    if (!mapa) return;
    const g = L.featureGroup().addTo(mapa);
    camadaRef.current = g;
    mapa.pm.setLang('pt_br'); // as dicas do desenho ("clique para pôr o primeiro ponto") em português: a página é pt-BR
    return () => { g.remove(); camadaRef.current = null; };
  }, [mapa]);

  /** Lê a linha do banco na hora (a versão que vai junto no gesto é a de agora, nunca a da lista em memória). */
  const lerAlvo = useCallback(async (id: string): Promise<Alvo | null> => {
    const { data, error } = await (supabase as any).from('fazenda_geometrias')
      .select('id, versao, nome_original, geojson, pasto_id').eq('id', id).maybeSingle();
    if (error || !data) { console.error('[edicao] leitura do polígono', error); setErro('Não consegui ler o polígono. Recarregue o mapa.'); return null; }
    return { id: data.id, versao: data.versao, nome: data.nome_original, geojson: data.geojson, pasto_id: data.pasto_id };
  }, []);

  /** O polígono no meio do mapa, abaixo da barra de edição (2 linhas no topo: 64 px). Sem animação: animado, ele colidia com o
   *  redesenho da Validação e o mapa ficava preso no meio do zoom (clique caindo no lugar errado). */
  /* -07: abrir a edição NÃO muda o zoom (o operador escolheu o zoom para pôr o ponto na cerca); o polígono fora da tela só faz o mapa
     deslizar até ele */
  const enquadrar = useCallback((g: GeoJSON.Geometry) => {
    if (!mapa) return;
    const limites = L.geoJSON(g).getBounds();
    if (limites.isValid() && !mapa.getBounds().intersects(limites)) mapa.panTo(limites.getCenter(), { animate: false });
  }, [mapa]);
  const alvoRef = useRef<Alvo | null>(null);
  alvoRef.current = alvo;
  /** Depois que o mapa muda de largura (a lista recolhe ou volta): o Leaflet relê o tamanho e o polígono volta ao meio. */
  const reenquadrar = useCallback(() => {
    if (!mapa) return;
    mapa.invalidateSize({ pan: true, animate: false }); // -07: mantém o CENTRO e o zoom quando a lista recolhe/volta
  }, [mapa]);

  /* MAPA-EDITAR-POLIGONO-02 (item 4d): na edição o zoom vai até 22 — a imagem do último nível que o provedor tem é ampliada
     (`maxNativeZoom`); o fundo que volta a baixar o zoom máximo (a vista do satélite) é seguido e o zoom sobe de novo; ao sair, volta. */
  useEffect(() => {
    if (!mapa || !modo) return;
    let nativo = mapa.getMaxZoom();
    const tocadas = new Map<L.TileLayer, number | undefined>(); // a camada → o zoom máximo dela antes da edição
    const subir = () => {
      const atual = mapa.getMaxZoom();
      if (atual >= ZOOM_MAXIMO_NA_EDICAO) return;
      nativo = atual;
      mapa.eachLayer(l => {
        if (!(l instanceof L.TileLayer)) return;
        if (!tocadas.has(l)) tocadas.set(l, l.options.maxZoom);
        l.options.maxNativeZoom = nativo;
        l.options.maxZoom = ZOOM_MAXIMO_NA_EDICAO;
      });
      mapa.setMaxZoom(ZOOM_MAXIMO_NA_EDICAO);
    };
    subir();
    mapa.on('zoomlevelschange', subir);
    return () => {
      mapa.off('zoomlevelschange', subir);
      tocadas.forEach((max, l) => { l.options.maxNativeZoom = undefined; l.options.maxZoom = max; });
      if (mapa.getZoom() > nativo) mapa.setZoom(nativo, { animate: false });
      mapa.setMaxZoom(nativo);
      /* NUNCA `redraw()`: ele recalcula o nível das imagens SEM arredondar o zoom (zoomSnap 0,25) e pedia o nível "14,25" — o fundo
         sumia ao sair da edição. O reinício de vista (o mesmo de uma troca de zoom) arredonda e relê as imagens com o máximo de volta. */
      if (tocadas.size > 0) { mapa.fire('viewprereset'); mapa.fire('viewreset'); }
    };
  }, [mapa, modo]);

  const iniciar = useCallback(async (m: ModoDaEdicao, id: string | null, opcoes?: { retomar?: RascunhoGuardado; moverLinha?: boolean }) => {
    if (!mapa || !camadaRef.current) return;
    encerrar();
    const camada = camadaRef.current;
    let a: Alvo | null = null;
    if (id) { a = await lerAlvo(id); if (!a) return; }
    setModo(m); setAlvo(a); setMoverLinha(m === 'vertices' && !!opcoes?.moverLinha);
    if (a) setNomeNovo(`${a.nome} (2)`); else setNomeNovo('Novo polígono');
    if (a && m === 'unir') setFicaComDe(a.id);
    /* o polígono vai para o meio do mapa, abaixo da barra de edição (que cobre o topo) */
    if (a) enquadrar(a.geojson);
    mapa.pm.setGlobalOptions(opcoesDoGeoman(encaixeRef.current));

    /* a edição de vértices de um polígono na camada própria (o existente ou o RASCUNHO recém-desenhado, -06): medidas, passos, juntar
       pontos, divisa junto, clique na linha cria ponto (-05) */
    const ligarVertices = (l: L.Polygon) => {
      const atualizar = () => setGeometriaNova(l.toGeoJSON().geometry);
      editadoRef.current = l;
      const formaAgora = (): GeoJSON.Polygon | null => { const g = l.toGeoJSON().geometry; return g.type === 'Polygon' ? g : null; };
      depoisDoUltimoRef.current = formaAgora();
      /** Fecha um passo: guarda a forma de antes (para o "Desfazer passo") e anota a operação (para a divisa andar junto, item 5). */
      const fecharPasso = (op: OperacaoNoVertice | null) => {
        const antes = depoisDoUltimoRef.current;
        if (antes) { passosRef.current.push({ geo: antes, nOps: opsRef.current.length }); setNPassos(passosRef.current.length); }
        if (op) setOperacoes([...opsRef.current, op]);
        depoisDoUltimoRef.current = formaAgora();
        atualizar();
      };
      let deOnde: Ponto | null = null;
      l.on('pm:markerdragstart', (e) => { deOnde = pontoDoMarcador(e.markerEvent); });
      l.on('pm:markerdragend', (e) => {
        const para = pontoDoMarcador(e.markerEvent);
        const de = deOnde;
        deOnde = null;
        if (!de || !para || distanciaM(de, para) <= 0.001) { atualizar(); return; }
        /* item 7: soltou a menos de 0,5 m de outro ponto do MESMO polígono = junta os dois (nada de pontos amontoados) */
        const g = formaAgora();
        const anel = g?.coordinates[0] ?? [];
        const i = anel.findIndex(q => distanciaM(q, para) < 0.001);
        const outro = g && i >= 0 ? verticeEmCimaDeOutro(anel, i) : null;
        if (g && i >= 0 && outro !== null) {
          const n = anel.length - 1;
          const aberto = anel.slice(0, n).filter((_q, k) => k !== i);
          l.pm.disable();
          l.setLatLngs(latLngsDe({ type: 'Polygon', coordinates: [[...aberto, aberto[0]], ...g.coordinates.slice(1)] }));
          l.pm.enable(opcoesDoGeoman(encaixeRef.current));
          fecharPasso({ tipo: 'tirar', de });
          return;
        }
        fecharPasso({ tipo: 'mover', de, para });
      });
      l.on('pm:vertexadded', (e) => {
        const p = pontoDe(e.latlng);
        const lado = ladoDoVertice(l, p);
        fecharPasso(lado ? { tipo: 'acrescentar', entre: lado, ponto: p } : null);
      });
      l.on('pm:vertexremoved', (e) => {
        fecharPasso({ tipo: 'tirar', de: pontoDe(e.marker.getLatLng()) });
      });
      l.on('pm:markerdrag', atualizar);
      /* MAPA-EDITAR-POLIGONO-05 (Gabriel 14:54, Pureza › Massay 01: "como crio um vértice aqui?"): o ponto do meio do Geoman fica no meio
         do LADO, fora da tela num lado longo com zoom alto. Agora o CLIQUE simples em qualquer lugar da linha (até 8 px dela) cria o vértice
         ali — o ponto projetado na linha, sem encaixe —, é um passo (o "Desfazer passo" o volta) e anda junto na divisa compartilhada. */
      const acrescentarAqui = (p: Ponto) => {
        const g = formaAgora();
        if (!g) return;
        const anel = g.coordinates[0];
        const px = (q: readonly number[]) => mapa.latLngToContainerPoint([q[1], q[0]]);
        const c = px(p);
        let melhor = -1, menor = Infinity;
        for (let i = 0; i + 1 < anel.length; i++) {
          const a = px(anel[i]), b = px(anel[i + 1]);
          const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
          const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2));
          const d = Math.hypot(a.x + k * dx - c.x, a.y + k * dy - c.y);
          if (d < menor) { menor = d; melhor = i; }
        }
        if (melhor < 0) return;
        const a = px(anel[melhor]), b = px(anel[melhor + 1]);
        const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
        const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2));
        const naLinha = mapa.containerPointToLatLng([a.x + k * dx, a.y + k * dy]);
        const ponto: Ponto = [naLinha.lng, naLinha.lat];
        const novo = [...anel.slice(0, melhor + 1), ponto, ...anel.slice(melhor + 1)];
        l.pm.disable();
        l.setLatLngs(latLngsDe({ type: 'Polygon', coordinates: [novo, ...g.coordinates.slice(1)] }));
        l.pm.enable(opcoesDoGeoman(encaixeRef.current));
        fecharPasso({ tipo: 'acrescentar', entre: [pt2(anel[melhor]), pt2(anel[melhor + 1])], ponto });
      };
      acrescentarRef.current = acrescentarAqui;
      /* -08: clicar num ponto o escolhe; "Tirar ponto" o tira (um passo: o Desfazer volta) */
      l.on('pm:vertexclick', (ev) => { const p = pontoDoMarcador(ev.markerEvent); if (p) setVerticeEscolhido(p); });
      tirarRef.current = (p: Ponto) => {
        const g = formaAgora();
        if (!g) return;
        const n = g.coordinates[0].length - 1;
        if (n <= 3) { setErro('Um polígono precisa de pelo menos 3 pontos.'); return; }
        const aberto = g.coordinates[0].slice(0, n).filter(q => distanciaM(q, p) > 0.01);
        if (aberto.length === n) return;
        l.pm.disable();
        l.setLatLngs(latLngsDe({ type: 'Polygon', coordinates: [[...aberto, aberto[0]], ...g.coordinates.slice(1)] }));
        l.pm.enable(opcoesDoGeoman(encaixeRef.current));
        setVerticeEscolhido(null);
        fecharPasso({ tipo: 'tirar', de: p });
      };
      const aoClicarNaLinha = (ev: L.LeafletMouseEvent) => {
        const c = mapa.latLngToContainerPoint(ev.latlng);
        const g = formaAgora();
        if (!g) return;
        const anel = g.coordinates[0];
        const perto = anel.some((q, i) => {
          if (i + 1 >= anel.length) return false;
          const a = mapa.latLngToContainerPoint([q[1], q[0]]), b = mapa.latLngToContainerPoint([anel[i + 1][1], anel[i + 1][0]]);
          const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
          const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2));
          return Math.hypot(a.x + k * dx - c.x, a.y + k * dy - c.y) <= 8;
        });
        if (perto) acrescentarAqui([ev.latlng.lng, ev.latlng.lat]);
      };
      cliqueNaLinhaRef.current = aoClicarNaLinha;
      mapa.on('click', aoClicarNaLinha);
      l.pm.enable(opcoesDoGeoman(encaixeRef.current));
    };
    if (m === 'vertices' && a) {
      L.geoJSON(a.geojson, { style: { color: '#1d4ed8', weight: 2, fillOpacity: 0.15 } }).eachLayer(l => {
        if (!(l instanceof L.Polygon)) return;
        camada.addLayer(l);
        ligarVertices(l);
      });
      return;
    }
    if (a) L.geoJSON(a.geojson, { style: { color: '#1d4ed8', weight: 2, dashArray: '4 3', fillOpacity: 0.08 }, pmIgnore: true }).addTo(camada);
    /* -06: o polígono fechado NÃO vai direto para a prévia: vira RASCUNHO em edição de vértices (medidas, encaixe, recortar, desfazer,
       clique na linha, tirar ponto) e só o "Prévia e gravar" leva ao banco; Cancelar (com confirmação) descarta */
    const abrirRascunho = (g: GeoJSON.Polygon) => {
      const rascunho = L.polygon(latLngsDe(g), { color: '#15803d', weight: 2, fillOpacity: 0.2 });
      camada.addLayer(rascunho);
      setGeometriaNova(g);
      setTemRascunho(true);
      ligarVertices(rascunho);
    };
    /* -08: "Continuar o desenho de HH:MM" — o rascunho guardado volta direto como rascunho editável */
    if (m === 'desenhar' && opcoes?.retomar) {
      setNomeNovo(opcoes.retomar.nome);
      mapa.doubleClickZoom.disable();
      abrirRascunho(opcoes.retomar.geojson);
      const lim = L.geoJSON(opcoes.retomar.geojson).getBounds();
      if (lim.isValid() && !mapa.getBounds().intersects(lim)) mapa.panTo(lim.getCenter(), { animate: false });
      return;
    }
    if (m === 'redesenhar' || m === 'desenhar' || m === 'dividir') {
      /* -06: AO VIVO enquanto desenha — os pontos postos (o vértice que o Geoman acrescenta) e o cursor (o lado elástico) */
      mapa.on('pm:drawstart', (e) => {
        const wl = e.workingLayer;
        if (!(wl instanceof L.Polyline)) return;
        desenhoRef.current = wl;
        wl.on('pm:vertexadded', () => {
          const ll = wl.getLatLngs();
          setPontosDoDesenho(ll.filter((x): x is L.LatLng => x instanceof L.LatLng).map(pontoDe));
        });
      });
      /* um quadro por vez, mas sempre com o ÚLTIMO movimento (descartar o que chega no meio perdia o cursor parado num ponto só) */
      let quadro = 0;
      let ultimo: L.LatLng | null = null;
      const aoMover = (ev: L.LeafletMouseEvent) => {
        ultimo = ev.latlng;
        if (quadro) return;
        quadro = requestAnimationFrame(() => { quadro = 0; if (ultimo) setCursorDoDesenho(pontoDe(ultimo)); });
      };
      moverRef.current = aoMover;
      mapa.on('mousemove', aoMover);
      const pararAoVivo = () => {
        mapa.off('mousemove', aoMover); moverRef.current = null;
        setPontosDoDesenho([]); setCursorDoDesenho(null);
      };
      mapa.on('pm:create', (e) => {
        const g = geometriaDaCamada(e.layer);
        mapa.removeLayer(e.layer);
        pararAoVivo();
        desenhoRef.current = null; setConfirmarCancelar(false);
        if (!g) return;
        if (m === 'dividir') {
          /* -06: a linha do corte fica EDITÁVEL (arrastar/acrescentar ponto) e a divisão se refaz a cada ajuste, antes da prévia */
          const metades = L.featureGroup().addTo(camada);
          const linha = L.polyline(pontosDaLinha(g).map(p => L.latLng(p[1], p[0])), { color: '#7c3aed', weight: 2, dashArray: '6 4' });
          camada.addLayer(linha);
          const refazer = () => {
            metades.clearLayers();
            const gl = linha.toGeoJSON().geometry;
            const r = dividirPorLinha(a?.geojson ?? gl, pontosDaLinha(gl));
            if ('motivo' in r) { setErro(r.motivo); setDivisao(null); return; }
            setErro(null); setDivisao(r.valor);
            metades.addLayer(L.geoJSON(r.valor.a, { style: { color: '#15803d', weight: 2, fillOpacity: 0.25 }, pmIgnore: true, interactive: false }));
            metades.addLayer(L.geoJSON(r.valor.b, { style: { color: '#b45309', weight: 2, fillOpacity: 0.25 }, pmIgnore: true, interactive: false }));
          };
          refazer();
          linha.on('pm:markerdragend', refazer);
          linha.on('pm:vertexadded', refazer);
          linha.on('pm:vertexremoved', refazer);
          linha.pm.enable(opcoesDoGeoman(encaixeRef.current));
          setTemRascunho(true);
          return;
        }
        if (g.type !== 'Polygon') return;
        abrirRascunho(g);
      });
      /* o duplo clique termina o desenho (e não dá zoom: o zoom do duplo clique volta ao encerrar) */
      mapa.doubleClickZoom.disable();
      mapa.pm.enableDraw(m === 'dividir' ? 'Line' : 'Polygon', { ...opcoesDoGeoman(encaixeRef.current), finishOn: 'dblclick' });
    }
  }, [mapa, encerrar, lerAlvo, enquadrar]);

  /** -04: começa o unir já com vários (os marcados na lista): o 1º fica, os outros somem nele. */
  const iniciarUniao = useCallback(async (ids: readonly string[]) => {
    if (ids.length < 2) return;
    await iniciar('unir', ids[0]);
    setUnidos(ids.slice(1));
  }, [iniciar]);
  /** -04: no unir, o clique no mapa (ou o "acrescentar") põe ou tira o polígono da união. */
  const alternarNaUniao = useCallback((id: string) => {
    if (modo !== 'unir' || !alvo || id === alvo.id) return;
    setUnidos(u => (u.includes(id) ? u.filter(x => x !== id) : [...u, id]));
    setFicaComDe(f => (f === id ? alvo.id : f));
  }, [modo, alvo]);
  // os candidatos: quem encosta (até 2 m: a fresta do KMZ) no alvo ou em algum já escolhido — nunca o contorno da fazenda
  const candidatosAUnir = useMemo(() => {
    if (modo !== 'unir' || !alvo) return [];
    const membros = [alvo.geojson, ...geometrias.filter(g => unidos.includes(g.id)).map(g => g.geojson)];
    return geometrias.filter(g => g.id !== alvo.id && !unidos.includes(g.id) && !TIPOS_DE_CONTORNO.includes(g.tipo ?? '')
      && membros.some(m => distanciaEntrePoligonosM(m, g.geojson) <= TOLERANCIA_FRESTA_M));
  }, [modo, alvo, unidos, geometrias]);
  const membrosDaUniao = useMemo(() => (modo === 'unir' && alvo
    ? [{ id: alvo.id, nome: alvo.nome, geojson: alvo.geojson, pasto_id: alvo.pasto_id },
       ...unidos.map(id => geometrias.find(g => g.id === id)).filter((g): g is PoligonoDaFazenda => !!g)
         .map(g => ({ id: g.id, nome: g.nome_original, geojson: g.geojson, pasto_id: g.pasto_id }))]
    : []), [modo, alvo, unidos, geometrias]);
  useEffect(() => {
    if (modo !== 'unir' || !alvo) return;
    if (membrosDaUniao.length < 2) { setGeometriaNova(null); setErro(null); return; }
    const r = unirVarios(membrosDaUniao);
    if ('motivo' in r) { setErro(r.motivo); setGeometriaNova(null); return; }
    setErro(null); setGeometriaNova(r.valor.geojson);
  }, [modo, alvo, membrosDaUniao]);
  const somaDaUniaoHa = useMemo(() => membrosDaUniao.reduce((t, m) => t + areaEmHectares(m.geojson), 0), [membrosDaUniao]);

  /** A geometria que vale agora para medir (a nova; no dividir, a metade que fica com o original). */
  const geometriaMedida = useMemo<GeoJSON.Geometry | null>(() => {
    if (modo === 'dividir' && divisao) return originalFicaCom === 'a' ? divisao.a : divisao.b;
    return geometriaNova ?? alvo?.geojson ?? null;
  }, [modo, divisao, originalFicaCom, geometriaNova, alvo]);

  /* -06: enquanto desenha (antes de fechar), o trajeto aberto + o cursor: lados (o elástico incluso), perímetro e, a partir do 3º ponto, a
     área com o polígono fechado no 1º ponto — a MESMA conta da edição (`ladosM`/`areaEmHectares`) */
  const desenhando = (modo === 'desenhar' || modo === 'redesenhar' || modo === 'dividir') && !temRascunho && pontosDoDesenho.length > 0;
  const trajetoDoDesenho = useMemo<Ponto[]>(() => (desenhando ? (cursorDoDesenho ? [...pontosDoDesenho, cursorDoDesenho] : pontosDoDesenho) : []),
    [desenhando, pontosDoDesenho, cursorDoDesenho]);
  const fechaODesenho = modo !== 'dividir' && trajetoDoDesenho.length >= 3;
  const medidasAoVivo = useMemo<Medidas | null>(() => {
    if (!desenhando || trajetoDoDesenho.length < 2) return null;
    const lados = ladosM(fechaODesenho ? [...trajetoDoDesenho, trajetoDoDesenho[0]] : trajetoDoDesenho);
    const ladosAbertos = fechaODesenho ? lados : lados.slice(0, trajetoDoDesenho.length - 1);
    const areaHa = fechaODesenho ? areaEmHectares({ type: 'Polygon', coordinates: [[...trajetoDoDesenho, trajetoDoDesenho[0]]] }) : 0;
    return { areaHa, perimetroM: ladosAbertos.reduce((t, l) => t + l, 0), ladosM: ladosAbertos };
  }, [desenhando, trajetoDoDesenho, fechaODesenho]);
  const medidas = useMemo<Medidas | null>(() => medidasAoVivo ?? (geometriaMedida ? medidasDe(geometriaMedida) : null), [medidasAoVivo, geometriaMedida]);

  /** item 7: volta UM movimento (a forma de antes do último passo e as operações daquela hora). Sem passos, nada. */
  const desfazerPasso = useCallback(() => {
    const l = editadoRef.current;
    const p = passosRef.current.pop();
    if (!l || !p) return;
    setNPassos(passosRef.current.length);
    l.pm.disable();
    l.setLatLngs(latLngsDe(p.geo));
    l.pm.enable(opcoesDoGeoman(encaixeRef.current));
    depoisDoUltimoRef.current = p.geo;
    setCorrecao(null);
    setOperacoes(opsRef.current.slice(0, p.nOps));
    // no editar vértices, sem passos = o polígono como estava (nada a gravar); no rascunho (-06) a forma desenhada continua valendo
    setGeometriaNova(passosRef.current.length === 0 && modo === 'vertices' ? null : p.geo);
  }, [setOperacoes, modo]);
  // Ctrl/Cmd+Z na edição de vértices e no RASCUNHO (-08) = desfazer passo (fora de campo de texto)
  useEffect(() => {
    if (modo !== 'vertices' && !temRascunho) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      const alvoDaTecla = ev.target;
      if (alvoDaTecla instanceof HTMLInputElement || alvoDaTecla instanceof HTMLTextAreaElement) return;
      if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); desfazerPasso(); }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [modo, temRascunho, desfazerPasso]);

  /** item 8: corrige o polígono em edição (junta os amontoados, tira o laço) — é um PASSO (o "Desfazer passo" o volta); a prévia mostra
   *  a área antes × depois e grava como "editar" (trilha e desfazer). */
  const corrigir = useCallback(() => {
    const l = editadoRef.current;
    const g = l ? l.toGeoJSON().geometry : null;
    if (!l || !g) return;
    const r = corrigirPoligono(g);
    if ('motivo' in r) { setErro(r.motivo); return; }
    const antes = depoisDoUltimoRef.current;
    if (antes) { passosRef.current.push({ geo: antes, nOps: opsRef.current.length }); setNPassos(passosRef.current.length); }
    l.pm.disable();
    l.setLatLngs(latLngsDe(r.valor.geojson));
    l.pm.enable(opcoesDoGeoman(encaixeRef.current));
    depoisDoUltimoRef.current = r.valor.geojson;
    setErro(null); setCorrecao(r.valor); setGeometriaNova(r.valor.geojson);
  }, []);

  /* -08: o método interno do desenho do Geoman (`_removeLastVertex`, `_finishShape` — o mesmo que a barra dele usa), sem cast */
  const chamarNoDesenho = useCallback((metodo: string) => {
    if (!mapa) return;
    const draw: unknown = Reflect.get(mapa.pm, 'Draw');
    const forma: unknown = draw && typeof draw === 'object' ? Reflect.get(draw, modo === 'dividir' ? 'Line' : 'Polygon') : null;
    const fn: unknown = forma && typeof forma === 'object' ? Reflect.get(forma, metodo) : null;
    if (typeof fn === 'function' && forma) Reflect.apply(fn, forma, []);
  }, [mapa, modo]);
  /** -08: tira o ÚLTIMO ponto do desenho (Backspace, Ctrl/Cmd+Z ou o botão), quantas vezes precisar. */
  const desfazerPonto = useCallback(() => {
    chamarNoDesenho('_removeLastVertex');
    const wl = desenhoRef.current;
    const ll = wl ? wl.getLatLngs() : [];
    setPontosDoDesenho(ll.filter((x): x is L.LatLng => x instanceof L.LatLng).map(pontoDe));
  }, [chamarNoDesenho]);
  /** -08: o Geoman não deixa ARRASTAR um ponto no meio do desenho — "Fechar e ajustar" fecha agora e cai no rascunho, onde tudo arrasta. */
  const fecharEAjustar = useCallback(() => { chamarNoDesenho('_finishShape'); }, [chamarNoDesenho]);
  const desenhandoAgora = (modo === 'desenhar' || modo === 'redesenhar' || modo === 'dividir') && !temRascunho;
  useEffect(() => {
    if (!desenhandoAgora) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      const alvoDaTecla = ev.target;
      if (alvoDaTecla instanceof HTMLInputElement || alvoDaTecla instanceof HTMLTextAreaElement) return;
      if (ev.key === 'Backspace' || ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z')) {
        ev.preventDefault(); ev.stopPropagation(); desfazerPonto();
      }
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [desenhandoAgora, desfazerPonto]);
  /* -08: NUNCA perder trabalho — havendo trabalho (pontos postos, rascunho ou mudança), Esc e Cancelar PERGUNTAM antes de descartar */
  const temTrabalho = pontosDoDesenho.length > 0 || temRascunho || !!geometriaNova || !!divisao || operacoes.length > 0;
  const descartar = useCallback(() => {
    if (modo === 'desenhar') { guardarRascunho(clienteId, fazendaId, null); setGuardado(null); }
    encerrar();
  }, [modo, clienteId, fazendaId, encerrar]);
  const pedirCancelar = useCallback(() => { if (temTrabalho) setConfirmarCancelar(true); else encerrar(); }, [temTrabalho, encerrar]);
  useEffect(() => {
    if (!modo) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      const alvoDaTecla = ev.target;
      if (alvoDaTecla instanceof HTMLInputElement || alvoDaTecla instanceof HTMLTextAreaElement) return;
      /* -09 (achado na prova do MAPA-CRIAR-PIQUETES-01): o Esc que fecha o "Opções ▾"/"Mais ▾" (ou uma lista, ou um diálogo) é DELES —
         antes ele também pedia para descartar a edição */
      if (alvoDaTecla instanceof Element && alvoDaTecla.closest('[role="menu"], [role="listbox"], [role="dialog"]')) return;
      if (document.querySelector('[role="menu"][data-state="open"]')) return;
      ev.preventDefault(); ev.stopPropagation(); pedirCancelar();
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [modo, pedirCancelar]);
  /* -08: o desenho novo vai para o navegador a cada mudança (o polígono do rascunho, ou os pontos a partir do 3º) */
  useEffect(() => {
    if (modo !== 'desenhar') return;
    let g: GeoJSON.Polygon | null = null;
    if (temRascunho && geometriaNova && geometriaNova.type === 'Polygon') g = geometriaNova;
    else if (pontosDoDesenho.length >= 3) g = { type: 'Polygon', coordinates: [[...pontosDoDesenho, pontosDoDesenho[0]]] };
    if (!g) return;
    const agora = new Date();
    const r: RascunhoGuardado = { geojson: g, nome: nomeNovo, em: `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}` };
    guardarRascunho(clienteId, fazendaId, r);
    setGuardado(r);
  }, [modo, temRascunho, geometriaNova, pontosDoDesenho, nomeNovo, clienteId, fazendaId]);
  const retomarRascunho = useCallback(() => { if (guardado) void iniciar('desenhar', null, { retomar: guardado }); }, [guardado, iniciar]);
  const esquecerGuardado = useCallback(() => { guardarRascunho(clienteId, fazendaId, null); setGuardado(null); }, [clienteId, fazendaId]);
  const tirarPonto = useCallback(() => { if (verticeEscolhido) tirarRef.current?.(verticeEscolhido); }, [verticeEscolhido]);

  /** item 7: onde a linha cruza ela mesma (só o anel externo do polígono que vale agora). */
  const cruzamentos = useMemo<Ponto[]>(() => {
    if (!modo || modo === 'apagar' || modo === 'dividir' || !geometriaMedida || geometriaMedida.type !== 'Polygon') return [];
    return cruzamentosDoAnel(geometriaMedida.coordinates[0] ?? []);
  }, [modo, geometriaMedida]);

  /* MAPA-EDITAR-POLIGONO-02 (Gabriel 01/11): o comprimento de cada lado vai no PRÓPRIO mapa, no meio do lado (a barra ficou compacta).
     Camada só de rótulos, sem clique; some ao encerrar. Acima de 40 lados não desenha (vira ruído; o "ver lados" da barra mostra). */
  const rotulosRef = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!mapa) return;
    const g = L.layerGroup().addTo(mapa);
    rotulosRef.current = g;
    return () => { g.remove(); rotulosRef.current = null; };
  }, [mapa]);
  /* -09: os METROS DOS LADOS numa camada própria, por UM componente (`desenharRotulosDosLados`), em todo modo e no polígono selecionado;
     refeitos a cada zoom/movimento (o que cabe na tela muda) */
  const ladosRef = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!mapa) return;
    const g = L.layerGroup().addTo(mapa);
    ladosRef.current = g;
    return () => { g.remove(); ladosRef.current = null; };
  }, [mapa]);
  useEffect(() => {
    const g = ladosRef.current;
    if (!mapa || !g) return;
    let pontos: number[][] = [];
    let fechar = true;
    const anelDe = (geo: GeoJSON.Geometry | null | undefined): number[][] => {
      if (!geo || geo.type !== 'Polygon') return [];
      const anel = geo.coordinates[0] ?? [];
      const n = anel.length;
      return n > 1 && anel[0][0] === anel[n - 1][0] && anel[0][1] === anel[n - 1][1] ? anel.slice(0, -1) : anel;
    };
    if (modo && modo !== 'apagar') {
      /* -06: desenhando, os lados do TRAJETO (o elástico até o cursor e, com 3+ pontos, o de fechar); senão, os do polígono */
      if (desenhando) { pontos = trajetoDoDesenho; fechar = fechaODesenho; }
      else pontos = anelDe(geometriaMedida);
    } else if (!modo) pontos = anelDe(selecionado);
    const redesenhar = () => desenharRotulosDosLados(mapa, g, pontos, fechar);
    redesenhar();
    mapa.on('zoomend moveend', redesenhar);
    return () => { mapa.off('zoomend moveend', redesenhar); g.clearLayers(); };
  }, [mapa, modo, geometriaMedida, desenhando, trajetoDoDesenho, fechaODesenho, selecionado]);
  useEffect(() => {
    const g = rotulosRef.current;
    if (!g) return;
    g.clearLayers();
    if (!modo || modo === 'apagar') return;
    if (verticeEscolhido) {
      const anelAzul = L.divIcon({ className: 'ponto-escolhido', iconSize: [0, 0],
        html: '<span style="position:absolute;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;border:2.5px solid #1d4ed8;background:rgba(191,219,254,.5)"></span>' });
      L.marker([verticeEscolhido[1], verticeEscolhido[0]], { icon: anelAzul, interactive: false, pmIgnore: true, zIndexOffset: 900 }).addTo(g);
    }
    /* o destaque do cruzamento fica ACIMA dos rótulos dos lados (num laço pequeno eles o cobriam) */
    /* -08: "qual ponto mexer" — o ponto do polígono mais perto de cada cruzamento ganha um anel LARANJA (é ele que se arrasta ou tira) */
    const anelDoPoligono = geometriaMedida && geometriaMedida.type === 'Polygon' ? geometriaMedida.coordinates[0].slice(0, -1) : [];
    for (const c of cruzamentos) {
      let maisPerto: number[] | null = null;
      for (const q of anelDoPoligono) if (!maisPerto || distanciaM(q, c) < distanciaM(maisPerto, c)) maisPerto = q;
      if (maisPerto) {
        const anelLaranja = L.divIcon({ className: 'ponto-para-mexer', iconSize: [0, 0],
          html: '<span title="Mova ou tire este ponto" style="position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;border:3px solid #ea580c;background:rgba(254,215,170,.45)"></span>' });
        L.marker([maisPerto[1], maisPerto[0]], { icon: anelLaranja, interactive: false, pmIgnore: true, zIndexOffset: 950 }).addTo(g);
      }
    }
    for (const c of cruzamentos) {
      const anelVermelho = L.divIcon({ className: 'cruzamento-do-poligono', iconSize: [0, 0],
        html: '<span style="position:absolute;transform:translate(-50%,-50%);width:20px;height:20px;border-radius:50%;border:2.5px solid #dc2626;background:rgba(254,202,202,.55)"></span>' });
      L.marker([c[1], c[0]], { icon: anelVermelho, interactive: false, pmIgnore: true, zIndexOffset: 1000 }).addTo(g);
    }
  }, [mapa, modo, geometriaMedida, cruzamentos, desenhando, trajetoDoDesenho, fechaODesenho, verticeEscolhido]);

  const vizinhosAntes = useMemo(() => geometrias.filter(g => g.id !== alvo?.id && !unidos.includes(g.id))
    .map(g => ({ id: g.id, nome: g.nome_original, tipo: g.tipo, geojson: g.geojson })), [geometrias, alvo, unidos]);

  useEffect(() => {
    if (modo !== 'desenhar' || recortarDecidido.current || !recortarPorPadrao(geometriaNova, vizinhosAntes, piquetes)) return;
    recortarDecidido.current = true; setRecortarEstado(true);
  }, [modo, geometriaNova, vizinhosAntes, piquetes]);

  // MAPA-EDITAR-POLIGONO-02: o contorno da fazenda ("Area Total") cobre os pastos por definição — não é sobreposição
  const contornos = useMemo(() => contornosDaFazenda(geometrias.map(g => ({ id: g.id, nome: g.nome_original, tipo: g.tipo, geojson: g.geojson }))),
    [geometrias]);

  /* MAPA-EDITAR-POLIGONO-02 (itens 5 e 6): a forma nova de cada vizinho — a divisa que anda junto (só no editar vértices) e o recorte
     (desenhar, vértices, redesenhar). Os dois saem do contorno da fazenda. */
  const afetados = useMemo<{ lista: { id: string; nome: string; antes: GeoJSON.Geometry; depois: GeoJSON.Geometry }[]; erro: string | null }>(() => {
    const vazio = { lista: [], erro: null };
    if (!modo) return vazio;
    const novas = new Map<string, GeoJSON.Geometry>();
    if (modo === 'vertices' && (divisaJunto || moverLinha)) {
      for (const v of vizinhosDaDivisa(vizinhosAntes, operacoes, contornos)) novas.set(v.id, v.geojson);
    }
    if (recortar && !moverLinha && geometriaNova && (modo === 'vertices' || modo === 'redesenhar' || modo === 'desenhar')) {
      const atuais = vizinhosAntes.map(v => ({ ...v, geojson: novas.get(v.id) ?? v.geojson }));
      const r = recortarDosVizinhos(geometriaNova, atuais, contornos);
      if ('motivo' in r) return { lista: [], erro: r.motivo };
      for (const v of r.valor) novas.set(v.id, v.geojson);
    }
    return {
      lista: vizinhosAntes.filter(v => novas.has(v.id)).map(v => ({ id: v.id, nome: v.nome, antes: v.geojson, depois: novas.get(v.id) ?? v.geojson })),
      erro: null,
    };
  }, [modo, divisaJunto, moverLinha, recortar, geometriaNova, vizinhosAntes, operacoes, contornos]);

  const vizinhos = useMemo(() => {
    const novas = new Map(afetados.lista.map(a => [a.id, a.depois]));
    return vizinhosAntes.map(v => ({ ...v, geojson: novas.get(v.id) ?? v.geojson }));
  }, [vizinhosAntes, afetados]);

  const avisos = useMemo<Sobreposicao[]>(() => {
    if (modo === 'apagar' || !geometriaMedida) return [];
    const proprias = modo === 'dividir' && divisao ? [divisao.a, divisao.b] : [geometriaMedida];
    return proprias.flatMap(g => sobreposicoes(g, vizinhos, MINIMO_SOBREPOSICAO_HA, contornos));
  }, [modo, geometriaMedida, divisao, vizinhos, contornos]);

  /* -05: num lado longo com o meio FORA da tela, um "ponto do meio" no meio do TRECHO VISÍVEL (o do Geoman fica no meio do lado);
     clicar nele cria o vértice ali. Refeito a cada movimento do mapa. */
  const meiosRef = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!mapa) return;
    const g = L.layerGroup().addTo(mapa);
    meiosRef.current = g;
    return () => { g.remove(); meiosRef.current = null; };
  }, [mapa]);
  useEffect(() => {
    const g = meiosRef.current;
    if (!mapa || !g) return;
    const desenhar = () => {
      g.clearLayers();
      if (modo !== 'vertices' || !geometriaMedida || geometriaMedida.type !== 'Polygon') return;
      const t = mapa.getSize();
      const anel = geometriaMedida.coordinates[0];
      for (let i = 0; i + 1 < anel.length; i++) {
        const a = mapa.latLngToContainerPoint([anel[i][1], anel[i][0]]), b = mapa.latLngToContainerPoint([anel[i + 1][1], anel[i + 1][0]]);
        const meio = a.add(b).divideBy(2);
        if (meio.x >= 0 && meio.y >= 0 && meio.x <= t.x && meio.y <= t.y) continue; // o do Geoman está à vista
        // recorte do lado na janela (Liang–Barsky)
        let t0 = 0, t1 = 1;
        const dx = b.x - a.x, dy = b.y - a.y;
        const lados: [number, number][] = [[-dx, a.x], [dx, t.x - a.x], [-dy, a.y], [dy, t.y - a.y]];
        let fora = false;
        for (const [pp, qq] of lados) {
          if (pp === 0) { if (qq < 0) { fora = true; break; } continue; }
          const r = qq / pp;
          if (pp < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
        }
        if (fora || t1 - t0 <= 0 || Math.hypot(dx, dy) * (t1 - t0) < 60) continue;
        const k = (t0 + t1) / 2;
        const ll = mapa.containerPointToLatLng([a.x + k * dx, a.y + k * dy]);
        const icone = L.divIcon({ className: 'meio-do-trecho', iconSize: [0, 0],
          html: '<span style="position:absolute;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #3388ff;opacity:.85;cursor:pointer"></span>' });
        const mk = L.marker(ll, { icon: icone, pmIgnore: true, zIndexOffset: 500, title: 'Clique para criar um vértice aqui' });
        mk.on('click', () => acrescentarRef.current?.([ll.lng, ll.lat]));
        mk.addTo(g);
      }
    };
    desenhar();
    mapa.on('moveend zoomend', desenhar);
    return () => { mapa.off('moveend zoomend', desenhar); g.clearLayers(); };
  }, [mapa, modo, geometriaMedida]);

  /* os vizinhos que mudam aparecem tracejados em laranja (o que vai ser gravado junto) */
  const vizinhosRef = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!mapa) return;
    const g = L.layerGroup().addTo(mapa);
    vizinhosRef.current = g;
    return () => { g.remove(); vizinhosRef.current = null; };
  }, [mapa]);
  useEffect(() => {
    const g = vizinhosRef.current;
    if (!g) return;
    g.clearLayers();
    for (const a of afetados.lista) {
      L.geoJSON(a.depois, { style: { color: '#c2410c', weight: 2, dashArray: '5 4', fillOpacity: 0.12 }, pmIgnore: true, interactive: false }).addTo(g);
    }
  }, [afetados]);

  const gesto = useMemo<{ g: Gesto; antes: number; depois: number } | null>(() => {
    if (!modo) return null;
    if (cruzamentos.length > 0) return null; // item 7: polígono que cruza ele mesmo não vai à prévia
    const antes = alvo ? areaEmHectares(alvo.geojson) : 0;
    const juntos = afetados.lista.map(v => ({ id: v.id, versao: -1, geojson: v.depois }));
    if ((modo === 'vertices' || modo === 'redesenhar') && alvo && geometriaNova) {
      if (afetados.erro) return null;
      return { g: { acao: modo === 'vertices' ? 'editar' : 'redesenhar', alterar: [{ id: alvo.id, versao: alvo.versao, geojson: geometriaNova }, ...juntos] },
        antes, depois: areaEmHectares(geometriaNova) };
    }
    if (modo === 'dividir' && alvo && divisao) {
      const fica = originalFicaCom === 'a' ? divisao.a : divisao.b;
      const nova = originalFicaCom === 'a' ? divisao.b : divisao.a;
      const alterar: Record<string, unknown> = { id: alvo.id, versao: alvo.versao, geojson: fica };
      const criar: Record<string, unknown> = { geojson: nova, nome_original: nomeNovo.trim() };
      if (pastoVaiParaNova && alvo.pasto_id) { alterar.pasto_id = null; criar.pasto_id = alvo.pasto_id; }
      return { g: { acao: 'dividir', alterar: [alterar], criar: [criar] }, antes, depois: areaEmHectares(fica) + areaEmHectares(nova) };
    }
    if (modo === 'unir' && alvo && geometriaNova && membrosDaUniao.length >= 2) {
      const alterar: Record<string, unknown> = { id: alvo.id, versao: alvo.versao, geojson: geometriaNova };
      // o pasto do resultado: o do polígono escolhido; '' = sem classificação (desliga o pasto do alvo, se houver)
      const fica = membrosDaUniao.find(m => m.id === ficaComDe);
      if (!fica) { if (alvo.pasto_id) alterar.pasto_id = null; }
      else if (fica.id !== alvo.id) alterar.pasto_id = fica.pasto_id;
      return { g: { acao: 'unir', alterar: [alterar], remover: membrosDaUniao.slice(1).map(m => ({ id: m.id, versao: -1 })) },
        antes: somaDaUniaoHa, depois: areaEmHectares(geometriaNova) };
    }
    if (modo === 'apagar' && alvo) {
      const g: Gesto = { acao: 'apagar', motivo: motivo.trim(), remover: [{ id: alvo.id, versao: alvo.versao }] };
      if (alvo.pasto_id && destinoDoPasto) g.alterar = [{ id: destinoDoPasto, versao: -1, pasto_id: alvo.pasto_id }];
      return { g, antes, depois: 0 };
    }
    if (modo === 'desenhar' && geometriaNova) {
      if (afetados.erro) return null;
      const g: Gesto = { acao: 'desenhar', criar: [{ geojson: geometriaNova, nome_original: nomeNovo.trim() }] };
      if (juntos.length) g.alterar = juntos;
      return { g, antes: 0, depois: areaEmHectares(geometriaNova) };
    }
    return null;
  }, [modo, alvo, geometriaNova, divisao, originalFicaCom, pastoVaiParaNova, nomeNovo, membrosDaUniao, ficaComDe, somaDaUniaoHa, geometrias, motivo, destinoDoPasto, afetados, cruzamentos]);

  /** A versão de cada polígono que entra no gesto sem ser o alvo (vizinho do unir, destino do apagar) é lida na hora. */
  const comVersoesFrescas = useCallback(async (g: Gesto): Promise<Gesto | null> => {
    const trocar = async (lista: unknown): Promise<unknown[] | null> => {
      if (!Array.isArray(lista)) return [];
      const saida: unknown[] = [];
      for (const item of lista) {
        if (item && typeof item === 'object' && 'versao' in item && item.versao === -1 && 'id' in item && typeof item.id === 'string') {
          const lido = await lerAlvo(item.id);
          if (!lido) return null;
          saida.push({ ...item, versao: lido.versao });
        } else saida.push(item);
      }
      return saida;
    };
    const alterar = await trocar(g.alterar);
    const remover = await trocar(g.remover);
    if (!alterar || !remover) return null;
    return { ...g, ...(g.alterar ? { alterar } : {}), ...(g.remover ? { remover } : {}) };
  }, [lerAlvo]);

  const chamar = useCallback(async (simular: boolean) => {
    if (!fazendaId || !gesto) return null;
    const g = await comVersoesFrescas(gesto.g);
    if (!g) return null;
    const { data, error } = await (supabase as any).rpc('fn_geometria_gravar', { p_fazenda_id: fazendaId, p_gesto: g, p_simular: simular });
    if (error) { console.error('[edicao] fn_geometria_gravar', error); setErro(fraseDoErro(error)); return null; }
    return data;
  }, [fazendaId, gesto, comVersoesFrescas]);

  const prever = useCallback(async () => {
    if (!gesto) return;
    /* MAPA-CRIAR-PIQUETES-01 (2b): na "Mover linha" a prévia é a da `fn_piquetes_mover_linha` (diálogo próprio, com o mapinha); o gesto que
       tocou mais (ou menos) que as duas divisões do grupo nem chega lá — a barra já mostra a frase */
    /* MAPA-PIQUETES-MANUAL-01 (2): os vértices de um piquete com a divisa junto entre duas IRMÃS também vão pela `fn_piquetes_mover_linha` */
    if (vaiPelaLinha({ modo, moverLinha, divisaJunto, recortar, ids: idsDoAlterar(gesto.g), divisoesDoGrupo: divisoesDaLinha })) {
      if (!travaDaLinha(idsDoAlterar(gesto.g), divisoesDaLinha)) { setErro(null); setLinhaAberta(true); }
      return;
    }
    setGravando(true); setErro(null);
    try {
      const r = await chamar(true);
      if (!r) return;
      /* a área de cada polígono antes × depois, pela conta da tela (o alvo, os vizinhos que mudam junto, o criado) */
      const areas = new Map<string, [number | null, number | null]>();
      if (alvo) areas.set(alvo.id, [areaEmHectares(alvo.geojson), geometriaMedida && modo !== 'apagar' ? areaEmHectares(geometriaMedida) : null]);
      for (const a of afetados.lista) areas.set(a.id, [areaEmHectares(a.antes), areaEmHectares(a.depois)]);
      for (const m of membrosDaUniao.slice(1)) areas.set(m.id, [areaEmHectares(m.geojson), null]); // -04: os que somem na união
      const lista: ItemDaPrevia[] = (Array.isArray(r.poligonos) ? r.poligonos : []).map((p: ItemDaPrevia) => {
        const ar = areas.get(p.id);
        if (ar) return { ...p, areaAntesHa: ar[0], areaDepoisHa: p.mudanca === 'removido' ? null : ar[1] };
        if (p.mudanca === 'criado' && geometriaNova && modo === 'desenhar') return { ...p, areaAntesHa: null, areaDepoisHa: areaEmHectares(geometriaNova) };
        return p;
      });
      setPrevia({
        poligonos: lista,
        pastosSemPoligono: Array.isArray(r.pastos_sem_poligono) ? r.pastos_sem_poligono : [],
        areaAntesHa: gesto.antes, areaDepoisHa: gesto.depois, sobreposicoes: avisos,
      });
    } finally { setGravando(false); }
  }, [gesto, chamar, avisos, alvo, geometriaMedida, modo, afetados, geometriaNova, membrosDaUniao, moverLinha, divisoesDaLinha, divisaJunto, recortar]);

  const gravar = useCallback(async () => {
    setGravando(true); setErro(null);
    try {
      const r = await chamar(false);
      if (!r) return false;
      setUltimoGesto(typeof r.gesto_id === 'string' ? r.gesto_id : null);
      if (modo === 'desenhar') { guardarRascunho(clienteId, fazendaId, null); setGuardado(null); }
      encerrar();
      const criado = (Array.isArray(r.poligonos) ? r.poligonos : []).find((p: ItemDaPrevia) => p.mudanca === 'criado');
      aoMudar(criado && typeof criado.id === 'string' ? criado.id : undefined);
      return true;
    } finally { setGravando(false); }
  }, [chamar, encerrar, aoMudar, modo, clienteId, fazendaId]);

  const desfazer = useCallback(async (gestoId: string) => {
    setGravando(true); setErro(null);
    try {
      const { error } = await (supabase as any).rpc('fn_geometria_desfazer', { p_gesto_id: gestoId, p_simular: false });
      if (error) { console.error('[edicao] fn_geometria_desfazer', error); setErro(fraseDoErro(error)); return false; }
      if (gestoId === ultimoGesto) setUltimoGesto(null);
      aoMudar();
      return true;
    } finally { setGravando(false); }
  }, [aoMudar, ultimoGesto]);

  /** Apagar vários (o "Excluir" da lista virou Apagar, D4): um gesto por polígono, o mesmo motivo; devolve as recusas. */
  const apagarVarios = useCallback(async (ids: readonly string[], motivoDeTodos: string) => {
    const recusas: { nome: string; frase: string }[] = [];
    if (!fazendaId) return recusas;
    setGravando(true);
    try {
      for (const id of ids) {
        const a = await lerAlvo(id);
        if (!a) { recusas.push({ nome: id, frase: 'não encontrado' }); continue; }
        const { error } = await (supabase as any).rpc('fn_geometria_gravar', {
          p_fazenda_id: fazendaId, p_simular: false,
          p_gesto: { acao: 'apagar', motivo: motivoDeTodos.trim(), remover: [{ id: a.id, versao: a.versao }] },
        });
        if (error) { console.error('[edicao] apagar', error); recusas.push({ nome: a.nome, frase: fraseDoErro(error) }); }
      }
      aoMudar();
      return recusas;
    } finally { setGravando(false); }
  }, [fazendaId, lerAlvo, aoMudar]);

  // sair da tela: nada fica ligado no mapa
  useEffect(() => () => { limparCamada(); }, [limparCamada]);

  return {
    moverLinha, linhaAberta, fecharLinha: () => setLinhaAberta(false), divisoesDaLinha, formaNova: geometriaNova,
    modo, alvo, iniciar, cancelar: encerrar, medidas, avisos, gesto, previa, setPrevia, prever, gravar, gravando, erro, setErro,
    divisao, originalFicaCom, setOriginalFicaCom, pastoVaiParaNova, setPastoVaiParaNova,
    candidatosAUnir, unidos, alternarNaUniao, iniciarUniao, membrosDaUniao, ficaComDe, setFicaComDe, somaDaUniaoHa,
    motivo, setMotivo, destinoDoPasto, setDestinoDoPasto, nomeNovo, setNomeNovo,
    ultimoGesto, desfazer, apagarVarios,
    encaixe, setEncaixe, divisaJunto, setDivisaJunto, recortar, setRecortar, afetados: afetados.lista, erroDoRecorte: afetados.erro,
    reenquadrar, desfazerPasso, podeDesfazerPasso: nPassos > 0, desenhando, temRascunho,
    desenhandoAgora, pontosNoDesenho: pontosDoDesenho.length, desfazerPonto, fecharEAjustar, confirmarCancelar, setConfirmarCancelar,
    pedirCancelar, descartar, guardado, retomarRascunho, esquecerGuardado, verticeEscolhido, tirarPonto, cruzamentos, corrigir, correcao,
    podeCorrigir: (modo === 'vertices' || (temRascunho && (modo === 'desenhar' || modo === 'redesenhar'))) && !!geometriaMedida && (cruzamentos.length > 0 || temPontosAmontoados(geometriaMedida)), fraseDoCruzamento: cruzamentos.length ? FRASE_DO_CRUZAMENTO : null,
  };
}
