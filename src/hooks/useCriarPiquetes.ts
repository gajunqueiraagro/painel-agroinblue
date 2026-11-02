/**
 * MAPA-CRIAR-PIQUETES-01 (fatia 1) — o modo "Criar piquetes" da Validação: o pasto escolhido é cortado na tela (N iguais ou grade L × C,
 * alças que deslizam as linhas, área desejada numa divisão) e a prévia/gravação vão pela `fn_piquetes_criar` (115210), UM gesto:
 *   - pai sem divisões no cadastro → pastos novos (a `fn_piquetes_concluir` do Code 4, chamada por dentro);
 *   - pai que já originou um grupo (o P6) → cada parte LIGA a uma divisão existente (a `fn_piquetes_ligar` do Code 4, chamada por dentro).
 * O contorno do pai FICA (D1 b). A conta mora em `src/lib/mapa/criarPiquetes.ts`; aqui só o estado, as camadas do mapa e o banco.
 * As camadas são próprias (não passam pelo Geoman da edição): as divisões tracejadas com a área, e uma alça no meio de cada linha.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { supabase } from '@/integrations/supabase/client';
import {
  alcasDosCortes, comAreaDesejada, cortesIguais, divisoesDosCortes, haDoBanco, montar, moverAlca, nomeSugerido,
  type Alca, type Cortes, type Divisao,
} from '@/lib/mapa/criarPiquetes';
import { mesesDeInicio } from '@/lib/mapa/piquetesEmEspera';

export type ModoDosPiquetes = 'iguais' | 'grade';
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
}

export interface PaiDosPiquetes { geometriaId: string; pastoId: string; nome: string; geojson: GeoJSON.Geometry }

const LETRA_DO_ROTULO = (i: number) => nomeSugerido('', i).slice(1);
const haBr = (ha: number) => haDoBanco(ha).toFixed(2).replace('.', ',');
const latlng = (p: readonly number[]): L.LatLngExpression => [p[1], p[0]];
const ESTILO_DO_ROTULO = 'position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-size:10px;font-weight:600;color:#4c1d95;'
  + 'background:rgba(255,255,255,.9);padding:0 3px;border-radius:2px;font-variant-numeric:tabular-nums';

/** A frase do banco (P0001 traz a frase pronta); o resto vai ao console e a tela diz uma frase da casa (OC-ABRIR-LENTO-01). */
function fraseDoErro(e: unknown): string {
  const msg = typeof e === 'object' && e && 'message' in e && typeof e.message === 'string' ? e.message : '';
  const code = typeof e === 'object' && e && 'code' in e ? String(e.code) : '';
  if (code === 'P0001' && msg) return msg;
  console.error('[fn_piquetes_criar]', e);
  return 'Não consegui conferir no banco agora. Nada foi gravado; tente de novo.';
}

export function useCriarPiquetes({ mapa, pastos, geometrias, clienteId, aoGravar }: {
  mapa: L.Map | null;
  pastos: readonly { id: string; nome: string; grupo_id?: string | null; ativo?: boolean | null }[];
  geometrias: readonly { pasto_id: string | null }[];
  clienteId: string | null;
  aoGravar: () => void;
}) {
  const [pai, setPai] = useState<PaiDosPiquetes | null>(null);
  const [modo, setModo] = useState<ModoDosPiquetes>('grade');
  const [linhas, setLinhas] = useState(2);
  const [colunas, setColunas] = useState(4);
  const [girado, setGirado] = useState(false);
  const [cortes, setCortes] = useState<Cortes | null>(null);
  const [nomes, setNomes] = useState<string[]>([]);
  const [ligas, setLigas] = useState<(string | null)[]>([]);
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const [avisoDaArea, setAvisoDaArea] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<GrupoDoPai>({ estado: 'lendo' });
  const [previa, setPrevia] = useState<PreviaDoCriar | null>(null);
  const [mes, setMes] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const poligono = pai && pai.geojson.type === 'Polygon' ? pai.geojson : null;
  const montagem = useMemo(() => (poligono ? montar(poligono, girado) : null), [poligono, girado]);
  const nl = modo === 'iguais' ? 1 : linhas;

  /* refaz as linhas iguais quando muda a grade (os ajustes à mão valem até a próxima mudança da grade) */
  useEffect(() => {
    if (!montagem) { setCortes(null); return; }
    setCortes(cortesIguais(montagem, nl, colunas));
    setEscolhida(null); setAvisoDaArea(null); setPrevia(null);
  }, [montagem, nl, colunas]);

  const divisoes: Divisao[] = useMemo(() => (montagem && cortes ? divisoesDosCortes(montagem, cortes) : []), [montagem, cortes]);
  const n = divisoes.length;

  /* o grupo que o pai já originou (`pasto_grupos.pasto_origem_id`) e os membros SEM desenho */
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

  /* os nomes e as ligações: no caso novo "<pasto>-A…"; no grupo existente, a i-ésima divisão sem desenho (por ordem de nome) */
  useEffect(() => {
    if (!pai) return;
    if (existente) {
      setLigas(Array.from({ length: n }, (_x, i) => membrosSemDesenho[i]?.id ?? null));
      setNomes(Array.from({ length: n }, (_x, i) => membrosSemDesenho[i]?.nome ?? ''));
    } else {
      setLigas(Array.from({ length: n }, () => null));
      setNomes(Array.from({ length: n }, (_x, i) => nomeSugerido(pai.nome, i)));
    }
  }, [pai, n, existente, membrosSemDesenho]);

  const abrir = useCallback((p: PaiDosPiquetes) => {
    const meses = mesesDeInicio(new Date());
    setPai(p); setPrevia(null); setErro(null); setEscolhida(null); setAvisoDaArea(null); setGirado(false); setMes(meses[meses.length - 1].valor);
    void lerGrupo(p.pastoId);
  }, [lerGrupo]);
  const fechar = useCallback(() => { setPai(null); setPrevia(null); setCortes(null); setErro(null); }, []);

  /* quando o grupo existe, começa com tantas partes quantas divisões sem desenho (N iguais) */
  useEffect(() => {
    if (existente && membrosSemDesenho.length >= 2) { setModo('iguais'); setColunas(membrosSemDesenho.length); }
  }, [existente, membrosSemDesenho.length]);

  const pedirArea = useCallback((i: number, ha: number | null) => {
    if (!montagem || !cortes || ha == null) return;
    const d = divisoes[i];
    const r = comAreaDesejada(montagem, cortes, d.linha, d.coluna, ha);
    if ('motivo' in r) setAvisoDaArea(r.motivo); else { setCortes(r.cortes); setAvisoDaArea(null); setPrevia(null); }
  }, [montagem, cortes, divisoes]);

  /* o que trava a prévia (a frase vai para a 2ª linha da barra) */
  const motivo = useMemo(() => {
    if (!pai) return null;
    if (!poligono) return 'Este pasto tem o polígono em partes separadas: una as partes antes de criar piquetes.';
    if (grupo.estado === 'lendo') return 'Conferindo se o pasto já tem divisões no cadastro…';
    if (grupo.estado === 'erro') return 'Não consegui verificar se o pasto já tem divisões. Tente de novo.';
    const vazia = divisoes.findIndex(d => !d.geojson || d.areaHa <= 0);
    if (vazia >= 0) return `A divisão ${LETRA_DO_ROTULO(vazia)} ficou sem área: deslize a linha.`;
    const partida = divisoes.findIndex(d => d.partes > 1);
    if (partida >= 0) return `A divisão ${LETRA_DO_ROTULO(partida)} saiu em ${divisoes[partida].partes} partes: deslize a linha ou mude a grade.`;
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
  }, [pai, poligono, grupo, divisoes, existente, n, membrosSemDesenho.length, ligas, nomes]);

  const pedido = useCallback((simular: boolean) => ({
    p_pasto_pai: pai?.pastoId, p_mes: mes, p_contorno: null, p_simular: simular,
    p_piquetes: divisoes.map((d, i) => ({ nome: (existente ? membrosSemDesenho.find(m => m.id === ligas[i])?.nome : nomes[i])?.trim() ?? '',
      geojson: d.geojson, pasto_id: existente ? ligas[i] : null })),
  }), [pai, mes, divisoes, existente, membrosSemDesenho, ligas, nomes]);

  const prever = useCallback(async (mesEscolhido?: string | null) => {
    if (motivo || !pai) return;
    setConferindo(true); setErro(null);
    const p = { ...pedido(true), p_mes: mesEscolhido ?? mes };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_piquetes_criar', p);
    setConferindo(false);
    if (error) { setErro(fraseDoErro(error)); setPrevia(null); return; }
    setPrevia({
      caso: data.caso, contornoHa: data.contorno?.area_ha ?? null, somaHa: Number(data.soma_ha), difContornoHa: Number(data.dif_contorno_ha),
      piquetes: (data.piquetes ?? []).map((x: { nome: string; area_ha: number; liga: 'novo' | 'existente' }) => ({ nome: x.nome, areaHa: Number(x.area_ha), liga: x.liga })),
      frase: data.concluir?.frase ?? data.ligar?.frase ?? null, semDesenho: data.ligar?.sem_desenho ?? null,
    });
  }, [motivo, pai, pedido, mes]);

  const gravar = useCallback(async () => {
    if (!previa || !pai) return;
    setGravando(true); setErro(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { error } = await (supabase as any).rpc('fn_piquetes_criar', pedido(false));
    setGravando(false);
    if (error) { setErro(fraseDoErro(error)); return; }
    fechar();
    aoGravar();
  }, [previa, pai, pedido, fechar, aoGravar]);

  // --- as camadas do mapa ---------------------------------------------------------------------------------------------------------
  const grupoRef = useRef<L.LayerGroup | null>(null);
  const alcasRef = useRef<{ alca: Alca; marker: L.Marker }[]>([]);
  const arrastada = useRef<number | null>(null);
  const cortesRef = useRef<Cortes | null>(null);
  cortesRef.current = cortes;

  /* enquadra o pasto ao abrir (folga para a barra no alto e a lista à direita) */
  useEffect(() => {
    if (!mapa || !pai) return;
    const b = L.geoJSON(pai.geojson).getBounds();
    if (b.isValid()) mapa.fitBounds(b, { paddingTopLeft: [20, 70], paddingBottomRight: [270, 20] });
  }, [mapa, pai]);

  /* o zoom e os créditos (canto de baixo à direita) saem de baixo da lista enquanto o modo está aberto */
  useEffect(() => {
    if (!mapa || !pai) return undefined;
    const canto = mapa.getContainer().querySelector<HTMLElement>('.leaflet-bottom.leaflet-right');
    if (!canto) return undefined;
    canto.style.marginRight = '262px';
    return () => { canto.style.marginRight = ''; };
  }, [mapa, pai]);

  /* as divisões: tracejado roxo, a letra e a área no meio; clique escolhe (para pedir a área) */
  useEffect(() => {
    if (!mapa) return;
    if (!grupoRef.current) grupoRef.current = L.layerGroup().addTo(mapa);
    const g = grupoRef.current;
    g.clearLayers();
    divisoes.forEach((d, i) => {
      if (!d.geojson) return;
      const camada = L.geoJSON(d.geojson, { style: { color: '#7c3aed', weight: 2, dashArray: '6 4', fillColor: escolhida === i ? '#7c3aed' : '#a78bfa', fillOpacity: escolhida === i ? 0.28 : 0.12 }, pmIgnore: true });
      camada.on('click', () => setEscolhida(i));
      camada.addTo(g);
      // a etiqueta compacta (o mesmo jeito da dos lados): a letra e a área, no meio da divisão
      const meio = camada.getBounds().getCenter();
      L.marker(meio, { interactive: false, pmIgnore: true, icon: L.divIcon({ className: 'piquete-rotulo', iconSize: [0, 0],
        html: `<span style="${ESTILO_DO_ROTULO}">${LETRA_DO_ROTULO(i)} · ${haBr(d.areaHa)} ha</span>` }) }).addTo(g);
    });
    return undefined;
  }, [mapa, divisoes, escolhida]);

  /* as alças: recriadas quando muda o número de linhas; durante o arrasto só a posição das outras muda */
  const chaveDasAlcas = cortes ? `${cortes.linhas.length}|${cortes.colunas.map(c => c.length).join(',')}|${girado}` : '';
  useEffect(() => {
    if (!mapa || !montagem || !cortesRef.current) return undefined;
    const icone = L.divIcon({ className: 'piquete-alca', iconSize: [12, 12],
      html: '<span style="display:block;width:12px;height:12px;border-radius:9999px;background:#fff;border:2.5px solid #7c3aed;box-sizing:border-box;cursor:grab"></span>' });
    const lista = alcasDosCortes(montagem, cortesRef.current).map((alca, k) => {
      const marker = L.marker(latlng(alca.ponto), { icon: icone, draggable: true, pmIgnore: true, title: alca.tipo === 'linha' ? 'Arraste: a linha desliza paralela' : 'Arraste: a linha desliza' });
      marker.on('dragstart', () => { arrastada.current = k; });
      marker.on('drag', () => {
        const ll = marker.getLatLng();
        const atual = cortesRef.current; if (!atual) return;
        setCortes(moverAlca(montagem, atual, alca, [ll.lng, ll.lat]));
      });
      marker.on('dragend', () => {
        arrastada.current = null; setPrevia(null);
        const nova = cortesRef.current ? alcasDosCortes(montagem, cortesRef.current)[k] : null;
        if (nova) marker.setLatLng(latlng(nova.ponto)); // solta no meio da linha (presa entre as vizinhas)
      });
      marker.addTo(mapa);
      return { alca, marker };
    });
    alcasRef.current = lista;
    return () => { lista.forEach(x => x.marker.remove()); alcasRef.current = []; };
  }, [mapa, montagem, chaveDasAlcas]);

  /* cada mudança dos cortes recoloca as alças no meio das linhas (a arrastada segue o mouse até soltar) */
  useEffect(() => {
    if (!montagem || !cortes) return;
    const novas = alcasDosCortes(montagem, cortes);
    alcasRef.current.forEach((x, k) => {
      const nova = novas[k]; if (!nova) return;
      x.alca = nova;
      if (arrastada.current !== k) x.marker.setLatLng(latlng(nova.ponto));
    });
  }, [montagem, cortes]);

  /* fechou: tira tudo do mapa */
  useEffect(() => {
    if (pai) return;
    grupoRef.current?.clearLayers();
    alcasRef.current.forEach(x => x.marker.remove());
    alcasRef.current = [];
  }, [pai]);

  const totalHa = montagem?.totalHa ?? null;
  return {
    aberto: !!pai, pai, abrir, fechar,
    modo, setModo, linhas, setLinhas, colunas, setColunas, girado, setGirado,
    divisoes, nomes, setNome: (i: number, v: string) => setNomes(xs => xs.map((x, k) => (k === i ? v : x))),
    ligas, setLiga: (i: number, v: string | null) => setLigas(xs => xs.map((x, k) => (k === i ? v : x))),
    escolhida, setEscolhida, pedirArea, avisoDaArea,
    grupo, existente, membrosSemDesenho, tentarGrupoDeNovo: () => { if (pai) void lerGrupo(pai.pastoId); },
    totalHa, motivo, erro,
    previa, setPrevia, prever, gravar, conferindo, gravando, mes, setMes,
  };
}

export type CriarPiquetes = ReturnType<typeof useCriarPiquetes>;
export const letraDaDivisao = LETRA_DO_ROTULO;
