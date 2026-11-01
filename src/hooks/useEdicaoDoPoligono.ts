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
  contornosDaFazenda, cruzamentos as cruzamentosDoAnel, distanciaM, dividirPorLinha, FRASE_DO_CRUZAMENTO, verticeEmCimaDeOutro, medidasDe, MINIMO_SOBREPOSICAO_HA, recortarDosVizinhos, sobreposicoes, unirVizinhos,
  vizinhosDaDivisa, type Divisao, type Medidas, type OperacaoNoVertice, type Ponto, type Sobreposicao,
} from '@/lib/mapa/edicaoDoPoligono';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';

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
  if (e.code === '42501') return 'Sem acesso a esta fazenda.';
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
   achado aqui (`cruzamentos`), com a frase e o ponto destacado, e trava a prévia */
const opcoesDoGeoman = (encaixe: boolean) => ({ snappable: encaixe, snapDistance: DISTANCIA_DO_ENCAIXE_PX, allowSelfIntersection: true });
const latLngsDe = (g: GeoJSON.Polygon): L.LatLng[][] => g.coordinates.map(a => a.map(p => L.latLng(p[1], p[0])));

const pontoDe = (ll: L.LatLng): Ponto => [ll.lng, ll.lat];
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
  aoMudar: () => void;
}) {
  const { mapa, fazendaId, geometrias, aoMudar } = args;
  const camadaRef = useRef<L.FeatureGroup | null>(null);
  const [modo, setModo] = useState<ModoDaEdicao | null>(null);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [geometriaNova, setGeometriaNova] = useState<GeoJSON.Geometry | null>(null);
  const [divisao, setDivisao] = useState<Divisao | null>(null);
  const [originalFicaCom, setOriginalFicaCom] = useState<'a' | 'b'>('a');
  const [pastoVaiParaNova, setPastoVaiParaNova] = useState(false);
  const [vizinhoId, setVizinhoId] = useState<string | null>(null);
  const [pastoDoVizinho, setPastoDoVizinho] = useState(false);
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
  const [recortar, setRecortar] = useState(false);
  const [operacoes, setOperacoesEstado] = useState<OperacaoNoVertice[]>([]);
  const opsRef = useRef<OperacaoNoVertice[]>([]);
  const setOperacoes = useCallback((o: OperacaoNoVertice[]) => { opsRef.current = o; setOperacoesEstado(o); }, []);
  /* item 7: "Desfazer passo" — a forma ANTES de cada passo (e quantas operações havia), para voltar um movimento por vez */
  const passosRef = useRef<{ geo: GeoJSON.Polygon; nOps: number }[]>([]);
  const [nPassos, setNPassos] = useState(0);
  const editadoRef = useRef<L.Polygon | null>(null);
  /* a forma depois do último passo (o "antes" do próximo); o "Desfazer passo" também a acerta */
  const depoisDoUltimoRef = useRef<GeoJSON.Polygon | null>(null);
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
      mapa.doubleClickZoom.enable();
    }
    camadaRef.current?.eachLayer(l => { if (l instanceof L.Polyline) l.pm.disable(); });
    camadaRef.current?.clearLayers();
  }, [mapa]);

  const encerrar = useCallback(() => {
    limparCamada();
    setModo(null); setAlvo(null); setGeometriaNova(null); setDivisao(null); setVizinhoId(null); setPastoDoVizinho(false);
    setOriginalFicaCom('a'); setPastoVaiParaNova(false); setMotivo(''); setDestinoDoPasto(null); setNomeNovo(''); setPrevia(null);
    setErro(null); setOperacoes([]); setRecortar(false);
    passosRef.current = []; setNPassos(0); editadoRef.current = null; depoisDoUltimoRef.current = null;
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
  const enquadrar = useCallback((g: GeoJSON.Geometry) => {
    if (!mapa) return;
    const limites = L.geoJSON(g).getBounds();
    if (limites.isValid()) mapa.fitBounds(limites, { paddingTopLeft: [24, 64], paddingBottomRight: [24, 24], maxZoom: 19, animate: false });
  }, [mapa]);
  const alvoRef = useRef<Alvo | null>(null);
  alvoRef.current = alvo;
  /** Depois que o mapa muda de largura (a lista recolhe ou volta): o Leaflet relê o tamanho e o polígono volta ao meio. */
  const reenquadrar = useCallback(() => {
    if (!mapa) return;
    mapa.invalidateSize({ pan: false });
    if (alvoRef.current) enquadrar(alvoRef.current.geojson);
  }, [mapa, enquadrar]);

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

  const iniciar = useCallback(async (m: ModoDaEdicao, id: string | null) => {
    if (!mapa || !camadaRef.current) return;
    encerrar();
    const camada = camadaRef.current;
    let a: Alvo | null = null;
    if (id) { a = await lerAlvo(id); if (!a) return; }
    setModo(m); setAlvo(a);
    if (a) setNomeNovo(`${a.nome} (2)`); else setNomeNovo('Novo polígono');
    /* o polígono vai para o meio do mapa, abaixo da barra de edição (que cobre o topo) */
    if (a) enquadrar(a.geojson);
    mapa.pm.setGlobalOptions(opcoesDoGeoman(encaixeRef.current));

    if (m === 'vertices' && a) {
      const grupo = L.geoJSON(a.geojson, { style: { color: '#1d4ed8', weight: 2, fillOpacity: 0.15 } });
      grupo.eachLayer(l => {
        if (!(l instanceof L.Polygon)) return;
        camada.addLayer(l);
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
        l.pm.enable(opcoesDoGeoman(encaixeRef.current));
      });
      return;
    }
    if (a) L.geoJSON(a.geojson, { style: { color: '#1d4ed8', weight: 2, dashArray: '4 3', fillOpacity: 0.08 }, pmIgnore: true }).addTo(camada);
    if (m === 'redesenhar' || m === 'desenhar' || m === 'dividir') {
      mapa.on('pm:create', (e) => {
        const g = geometriaDaCamada(e.layer);
        mapa.removeLayer(e.layer);
        if (!g) return;
        if (m === 'dividir') {
          const r = dividirPorLinha(a?.geojson ?? g, pontosDaLinha(g));
          if ('motivo' in r) { setErro(r.motivo); return; }
          setErro(null); setDivisao(r.valor);
          camada.addLayer(L.geoJSON(r.valor.a, { style: { color: '#15803d', weight: 2, fillOpacity: 0.25 }, pmIgnore: true }));
          camada.addLayer(L.geoJSON(r.valor.b, { style: { color: '#b45309', weight: 2, fillOpacity: 0.25 }, pmIgnore: true }));
          return;
        }
        if (g.type !== 'Polygon') return;
        setGeometriaNova(g);
        camada.addLayer(L.geoJSON(g, { style: { color: '#15803d', weight: 2, fillOpacity: 0.25 }, pmIgnore: true }));
      });
      /* o duplo clique termina o desenho (e não dá zoom: o zoom do duplo clique volta ao encerrar) */
      mapa.doubleClickZoom.disable();
      mapa.pm.enableDraw(m === 'dividir' ? 'Line' : 'Polygon', { ...opcoesDoGeoman(encaixeRef.current), finishOn: 'dblclick' });
    }
  }, [mapa, encerrar, lerAlvo, enquadrar]);

  // unir: o vizinho escolhido entra na conta
  const candidatosAUnir = useMemo(() => {
    if (modo !== 'unir' || !alvo) return [];
    return geometrias.filter(g => g.id !== alvo.id && unirVizinhos(alvo.geojson, g.geojson).ok);
  }, [modo, alvo, geometrias]);
  useEffect(() => {
    if (modo !== 'unir' || !alvo || !vizinhoId) return;
    const v = geometrias.find(g => g.id === vizinhoId);
    if (!v) return;
    const r = unirVizinhos(alvo.geojson, v.geojson);
    if ('motivo' in r) { setErro(r.motivo); setGeometriaNova(null); return; }
    setErro(null); setGeometriaNova(r.valor);
  }, [modo, alvo, vizinhoId, geometrias]);

  /** A geometria que vale agora para medir (a nova; no dividir, a metade que fica com o original). */
  const geometriaMedida = useMemo<GeoJSON.Geometry | null>(() => {
    if (modo === 'dividir' && divisao) return originalFicaCom === 'a' ? divisao.a : divisao.b;
    return geometriaNova ?? alvo?.geojson ?? null;
  }, [modo, divisao, originalFicaCom, geometriaNova, alvo]);

  const medidas = useMemo<Medidas | null>(() => (geometriaMedida ? medidasDe(geometriaMedida) : null), [geometriaMedida]);

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
    setOperacoes(opsRef.current.slice(0, p.nOps));
    setGeometriaNova(passosRef.current.length === 0 ? null : p.geo);
  }, [setOperacoes]);
  // Ctrl/Cmd+Z na edição de vértices = desfazer passo (fora de campo de texto)
  useEffect(() => {
    if (modo !== 'vertices') return;
    const aoTeclar = (ev: KeyboardEvent) => {
      const alvoDaTecla = ev.target;
      if (alvoDaTecla instanceof HTMLInputElement || alvoDaTecla instanceof HTMLTextAreaElement) return;
      if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && ev.key.toLowerCase() === 'z') { ev.preventDefault(); desfazerPasso(); }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [modo, desfazerPasso]);

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
  useEffect(() => {
    const g = rotulosRef.current;
    if (!g) return;
    g.clearLayers();
    if (!modo || modo === 'apagar' || !geometriaMedida || geometriaMedida.type !== 'Polygon') return;
    const anel = geometriaMedida.coordinates[0] ?? [];
    const n = anel.length;
    if (n < 4 || n > 41) return;
    const fechado = anel[0][0] === anel[n - 1][0] && anel[0][1] === anel[n - 1][1];
    const pontos = fechado ? anel.slice(0, -1) : anel;
    pontos.forEach((p, i) => {
      const q = pontos[(i + 1) % pontos.length];
      const m = Math.round(distanciaM(p, q));
      const icone = L.divIcon({ className: 'lado-do-poligono', iconSize: [0, 0],
        html: `<span style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-size:9.5px;font-weight:600;color:#1e3a8a;background:rgba(255,255,255,.85);padding:0 2px;border-radius:2px;font-variant-numeric:tabular-nums">${m.toLocaleString('pt-BR')} m</span>` });
      L.marker([(p[1] + q[1]) / 2, (p[0] + q[0]) / 2], { icon: icone, interactive: false, pmIgnore: true }).addTo(g);
    });
    /* o destaque do cruzamento fica ACIMA dos rótulos dos lados (num laço pequeno eles o cobriam) */
    for (const c of cruzamentos) {
      const anelVermelho = L.divIcon({ className: 'cruzamento-do-poligono', iconSize: [0, 0],
        html: '<span style="position:absolute;transform:translate(-50%,-50%);width:20px;height:20px;border-radius:50%;border:2.5px solid #dc2626;background:rgba(254,202,202,.55)"></span>' });
      L.marker([c[1], c[0]], { icon: anelVermelho, interactive: false, pmIgnore: true, zIndexOffset: 1000 }).addTo(g);
    }
  }, [mapa, modo, geometriaMedida, cruzamentos]);

  const vizinhosAntes = useMemo(() => geometrias.filter(g => g.id !== alvo?.id && g.id !== vizinhoId)
    .map(g => ({ id: g.id, nome: g.nome_original, tipo: g.tipo, geojson: g.geojson })), [geometrias, alvo, vizinhoId]);

  // MAPA-EDITAR-POLIGONO-02: o contorno da fazenda ("Area Total") cobre os pastos por definição — não é sobreposição
  const contornos = useMemo(() => contornosDaFazenda(geometrias.map(g => ({ id: g.id, nome: g.nome_original, tipo: g.tipo, geojson: g.geojson }))),
    [geometrias]);

  /* MAPA-EDITAR-POLIGONO-02 (itens 5 e 6): a forma nova de cada vizinho — a divisa que anda junto (só no editar vértices) e o recorte
     (desenhar, vértices, redesenhar). Os dois saem do contorno da fazenda. */
  const afetados = useMemo<{ lista: { id: string; nome: string; antes: GeoJSON.Geometry; depois: GeoJSON.Geometry }[]; erro: string | null }>(() => {
    const vazio = { lista: [], erro: null };
    if (!modo) return vazio;
    const novas = new Map<string, GeoJSON.Geometry>();
    if (modo === 'vertices' && divisaJunto) {
      for (const v of vizinhosDaDivisa(vizinhosAntes, operacoes, contornos)) novas.set(v.id, v.geojson);
    }
    if (recortar && geometriaNova && (modo === 'vertices' || modo === 'redesenhar' || modo === 'desenhar')) {
      const atuais = vizinhosAntes.map(v => ({ ...v, geojson: novas.get(v.id) ?? v.geojson }));
      const r = recortarDosVizinhos(geometriaNova, atuais, contornos);
      if ('motivo' in r) return { lista: [], erro: r.motivo };
      for (const v of r.valor) novas.set(v.id, v.geojson);
    }
    return {
      lista: vizinhosAntes.filter(v => novas.has(v.id)).map(v => ({ id: v.id, nome: v.nome, antes: v.geojson, depois: novas.get(v.id) ?? v.geojson })),
      erro: null,
    };
  }, [modo, divisaJunto, recortar, geometriaNova, vizinhosAntes, operacoes, contornos]);

  const vizinhos = useMemo(() => {
    const novas = new Map(afetados.lista.map(a => [a.id, a.depois]));
    return vizinhosAntes.map(v => ({ ...v, geojson: novas.get(v.id) ?? v.geojson }));
  }, [vizinhosAntes, afetados]);

  const avisos = useMemo<Sobreposicao[]>(() => {
    if (modo === 'apagar' || !geometriaMedida) return [];
    const proprias = modo === 'dividir' && divisao ? [divisao.a, divisao.b] : [geometriaMedida];
    return proprias.flatMap(g => sobreposicoes(g, vizinhos, MINIMO_SOBREPOSICAO_HA, contornos));
  }, [modo, geometriaMedida, divisao, vizinhos, contornos]);

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
    if (modo === 'unir' && alvo && geometriaNova && vizinhoId) {
      const v = geometrias.find(x => x.id === vizinhoId);
      if (!v) return null;
      const alterar: Record<string, unknown> = { id: alvo.id, versao: alvo.versao, geojson: geometriaNova };
      if (pastoDoVizinho && v.pasto_id) alterar.pasto_id = v.pasto_id;
      return { g: { acao: 'unir', alterar: [alterar], remover: [{ id: v.id, versao: -1 }] },
        antes: antes + areaEmHectares(v.geojson), depois: areaEmHectares(geometriaNova) };
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
  }, [modo, alvo, geometriaNova, divisao, originalFicaCom, pastoVaiParaNova, nomeNovo, vizinhoId, pastoDoVizinho, geometrias, motivo, destinoDoPasto, afetados, cruzamentos]);

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
    setGravando(true); setErro(null);
    try {
      const r = await chamar(true);
      if (!r) return;
      /* a área de cada polígono antes × depois, pela conta da tela (o alvo, os vizinhos que mudam junto, o criado) */
      const areas = new Map<string, [number | null, number | null]>();
      if (alvo) areas.set(alvo.id, [areaEmHectares(alvo.geojson), geometriaMedida && modo !== 'apagar' ? areaEmHectares(geometriaMedida) : null]);
      for (const a of afetados.lista) areas.set(a.id, [areaEmHectares(a.antes), areaEmHectares(a.depois)]);
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
  }, [gesto, chamar, avisos, alvo, geometriaMedida, modo, afetados, geometriaNova]);

  const gravar = useCallback(async () => {
    setGravando(true); setErro(null);
    try {
      const r = await chamar(false);
      if (!r) return false;
      setUltimoGesto(typeof r.gesto_id === 'string' ? r.gesto_id : null);
      encerrar();
      aoMudar();
      return true;
    } finally { setGravando(false); }
  }, [chamar, encerrar, aoMudar]);

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
    modo, alvo, iniciar, cancelar: encerrar, medidas, avisos, gesto, previa, setPrevia, prever, gravar, gravando, erro, setErro,
    divisao, originalFicaCom, setOriginalFicaCom, pastoVaiParaNova, setPastoVaiParaNova,
    candidatosAUnir, vizinhoId, setVizinhoId, pastoDoVizinho, setPastoDoVizinho,
    motivo, setMotivo, destinoDoPasto, setDestinoDoPasto, nomeNovo, setNomeNovo,
    ultimoGesto, desfazer, apagarVarios,
    encaixe, setEncaixe, divisaJunto, setDivisaJunto, recortar, setRecortar, afetados: afetados.lista, erroDoRecorte: afetados.erro,
    reenquadrar, desfazerPasso, podeDesfazerPasso: nPassos > 0, cruzamentos, fraseDoCruzamento: cruzamentos.length ? FRASE_DO_CRUZAMENTO : null,
  };
}
