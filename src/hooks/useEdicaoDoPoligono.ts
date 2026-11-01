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
  dividirPorLinha, medidasDe, sobreposicoes, unirVizinhos, type Divisao, type Medidas, type Ponto, type Sobreposicao,
} from '@/lib/mapa/edicaoDoPoligono';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';

export type ModoDaEdicao = 'vertices' | 'redesenhar' | 'dividir' | 'unir' | 'apagar' | 'desenhar';

export interface PoligonoDaFazenda {
  id: string;
  nome_original: string;
  geojson: GeoJSON.Geometry;
  pasto_id: string | null;
}

interface Alvo { id: string; versao: number; nome: string; geojson: GeoJSON.Geometry; pasto_id: string | null }

export interface ItemDaPrevia { id: string; nome: string; mudanca: 'criado' | 'alterado' | 'removido'; pasto_antes: string | null; pasto_depois: string | null }
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

const OPCOES_DO_GEOMAN = { snappable: true, snapDistance: 15, allowSelfIntersection: false };

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
    setErro(null);
  }, [limparCamada]);

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

  const iniciar = useCallback(async (m: ModoDaEdicao, id: string | null) => {
    if (!mapa || !camadaRef.current) return;
    encerrar();
    const camada = camadaRef.current;
    let a: Alvo | null = null;
    if (id) { a = await lerAlvo(id); if (!a) return; }
    setModo(m); setAlvo(a);
    if (a) setNomeNovo(`${a.nome} (2)`); else setNomeNovo('Novo polígono');
    /* o polígono vai para o meio do mapa, abaixo da barra de edição (que cobre o topo) */
    if (a) {
      const limites = L.geoJSON(a.geojson).getBounds();
      if (limites.isValid()) mapa.fitBounds(limites, { paddingTopLeft: [24, 210], paddingBottomRight: [24, 24], maxZoom: 18, animate: false }); // sem animação: animado, ele colidia com o redesenho da Validação e o mapa ficava preso no meio do zoom (clique caindo no lugar errado)
    }

    if (m === 'vertices' && a) {
      const grupo = L.geoJSON(a.geojson, { style: { color: '#1d4ed8', weight: 2, fillOpacity: 0.15 } });
      grupo.eachLayer(l => {
        if (!(l instanceof L.Polygon)) return;
        camada.addLayer(l);
        const atualizar = () => setGeometriaNova(l.toGeoJSON().geometry);
        l.on('pm:markerdrag', atualizar);
        l.on('pm:vertexadded', atualizar);
        l.on('pm:vertexremoved', atualizar);
        l.on('pm:edit', atualizar);
        l.pm.enable(OPCOES_DO_GEOMAN);
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
      mapa.pm.enableDraw(m === 'dividir' ? 'Line' : 'Polygon', { ...OPCOES_DO_GEOMAN, finishOn: 'dblclick' });
    }
  }, [mapa, encerrar, lerAlvo]);

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

  const vizinhos = useMemo(() => geometrias.filter(g => g.id !== alvo?.id && g.id !== vizinhoId)
    .map(g => ({ id: g.id, nome: g.nome_original, geojson: g.geojson })), [geometrias, alvo, vizinhoId]);

  const avisos = useMemo<Sobreposicao[]>(() => {
    if (modo === 'apagar' || !geometriaMedida) return [];
    const proprias = modo === 'dividir' && divisao ? [divisao.a, divisao.b] : [geometriaMedida];
    return proprias.flatMap(g => sobreposicoes(g, vizinhos));
  }, [modo, geometriaMedida, divisao, vizinhos]);

  const gesto = useMemo<{ g: Gesto; antes: number; depois: number } | null>(() => {
    if (!modo) return null;
    const antes = alvo ? areaEmHectares(alvo.geojson) : 0;
    if ((modo === 'vertices' || modo === 'redesenhar') && alvo && geometriaNova) {
      return { g: { acao: modo === 'vertices' ? 'editar' : 'redesenhar', alterar: [{ id: alvo.id, versao: alvo.versao, geojson: geometriaNova }] },
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
      return { g: { acao: 'desenhar', criar: [{ geojson: geometriaNova, nome_original: nomeNovo.trim() }] }, antes: 0, depois: areaEmHectares(geometriaNova) };
    }
    return null;
  }, [modo, alvo, geometriaNova, divisao, originalFicaCom, pastoVaiParaNova, nomeNovo, vizinhoId, pastoDoVizinho, geometrias, motivo, destinoDoPasto]);

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
      setPrevia({
        poligonos: Array.isArray(r.poligonos) ? r.poligonos : [],
        pastosSemPoligono: Array.isArray(r.pastos_sem_poligono) ? r.pastos_sem_poligono : [],
        areaAntesHa: gesto.antes, areaDepoisHa: gesto.depois, sobreposicoes: avisos,
      });
    } finally { setGravando(false); }
  }, [gesto, chamar, avisos]);

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
  };
}
