/**
 * MAPA-02a — o mapa de pastos em tela cheia (mock aprovado `docs/mocks/mock-mapa-pastos-v2.html`, 31/10/2026), SOMENTE LEITURA.
 * Um mês só (D1), escolhido no seletor da barra: todo número vem do `useMapaDoMes` (o fechamento DAQUELE mês; atividade =
 * `tipo_uso_mes`, D3); as faixas de lotação vêm de `faixasLotacao.ts` (D2, 300/500); as camadas e a legenda, de `camadasDoMapa.ts`.
 * Desenho: pastos pela camada; áreas pelo `fazenda_geometrias.tipo`; `area_total` só contorno tracejado, por baixo e sem clique;
 * área que não é pasto mostra o nome ao passar o mouse e não abre o painel. Clique no pasto abre o painel de vidro (286px, fix1 C).
 * Estabilidade visual: barra, KPIs, filtros, painel e legenda têm lugar e largura fixos — trocar camada, mês, filtro ou pasto não move
 * nada. O painel é só leitura (fix1 B): o vínculo do polígono com o pasto fica só na aba Validação.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { itemFunciona, MENU_ADICIONAR, subitemFunciona } from '@/lib/mapa/menuAdicionar';
import type { TipoDeArea } from '@/lib/mapa/tiposDeArea';
import { ChevronDown, ChevronLeft, ListFilter, MapPin, Plus, Upload, X } from 'lucide-react';
import { formatNum } from '@/lib/calculos/formatters';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';
import { areaEmHectares } from '@/lib/mapa/areaDoPoligono';
import { divisoesNoPainel, type Divisao } from '@/lib/mapa/unidadesDoMapa';
import { areaCercadaDoPasto } from '@/lib/mapa/areaCercada';
import { arrumarRotulos, distanciaABorda, pontoMaisInterno, type Aneis, type Ponto } from '@/lib/mapa/rotulosDoMapa';
import { COR_DA_FAIXA, faixaDaLotacaoUa, textoUaHa, uaPorHa } from '@/lib/mapa/faixasLotacao';
import { tituloDosLotes } from '@/lib/mapa/lotesDoPasto';
import { fechamentoDoMesAberto, mesAbreviado, mesCurtoNumerico, resumoDosPastos, type DadosDoPastoNoMes } from '@/lib/mapa/mapaDoMes';
import { CAMADAS, CAMADAS_EM_BREVE, corDaArea, corDoPasto, legendaDaCamada, rotuloDaAtividade, type CamadaDoMapa } from '@/lib/mapa/camadasDoMapa';
import { FUNDOS } from '@/lib/mapa/fundoDoMapa';
import { EVENTO_LIMITE_DOS_CREDITOS } from '@/lib/mapa/creditosDoMapa';
import { InfraPainel } from '@/components/mapa-geo/InfraPainel';
import { useInfraestruturas } from '@/hooks/useInfraestruturas';
import { useLavouraDaFazenda } from '@/hooks/useLavouraDaFazenda';
import { lavouraDoPastoNoMes, rotuloDaLavoura, type LavouraDoMes } from '@/lib/mapa/lavouraDoMes';
import { familiaForaDaPecuaria, type FamiliaForaDaPecuaria } from '@/lib/mapa/usoDoPasto';
import { dataBR } from '@/lib/datas/dataBR';
import { contagemPorTipo, definicaoDoTipo, iconeDaInfra, pastoNoPonto, pontoDaInfra, tipoDePontoPeloRotulo, type TipoInfra } from '@/lib/mapa/infraestrutura';
/* MAPA-CONTROLES-01 / MAPA-COMPACTO-01: o que a legenda deixa livre à direita para os créditos no rodapé = 12 (a margem da legenda) +
   8 de folga + 10 (a margem do controle do Leaflet) + a largura MEDIDA dos créditos (o texto muda com a área à vista) */
const FOLGA_DA_LEGENDA_PX = 12 + 8 + 10;

interface Props {
  geometrias: FazendaGeometria[];
  pastos: Pasto[];
  /** MAPA-PIQUETES-03: as divisões de cada unidade (pai + grupo) no mês — linhas finas por dentro do contorno, sem rótulo nem cor. */
  divisoes?: ReadonlyMap<string, readonly Divisao<FazendaGeometria>[]>;
  /** O mês do mapa ('AAAA-MM'). */
  anoMes: string;
  /** Por pasto vigente no mês (`useMapaDoMes`). */
  dadosDoMes: Map<string, DadosDoPastoNoMes>;
  carregandoMes: boolean;
  erroDoMes: string | null;
  geoLoading: boolean;
  onImportar: () => void;
  /** MAPA-AREA-TIPO-01: Adicionar › Área › [tipo] — vai à Validação para marcar um polígono existente com o tipo */
  onClassificarArea?: (tipo: TipoDeArea) => void;
  /** MAPA-02f-b: a fazenda e o cliente da infraestrutura (sem fazenda, o menu Infraestrutura fica "em breve") */
  fazendaId?: string;
  clienteId?: string | null;
  /** MAPA-GLOBAL-01 (D6): a fazenda foi aberta pelo Global — o "← Global" aparece no espaço reservado do início da barra. */
  voltarAoGlobal?: () => void;
  /** MAPA-GLOBAL-01 (D6): o pasto clicado no Global abre selecionado, com o painel aberto. */
  pastoInicialId?: string | null;
  onRenderedChange?: (count: number) => void;
  /** O seletor de ano/mês (o mesmo do Fechamento Área, mês compartilhado). */
  seletorDeMes: ReactNode;
  /** A troca de vista (Gestor · Operação · Validação). */
  trocaDeVista: ReactNode;
}

const VIDRO = 'rounded-[10px] border border-white/60 bg-white/[0.78] shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-[14px] backdrop-saturate-[1.2]';
/* fix1 (2): o rótulo do pasto — nome 10px/600, kg/ha 9,5px (o piso da casa) mais claro; tamanho fixo em qualquer zoom */
const ROTULO_NOME_PX = 10;
const ROTULO_SUB_PX = 9.5;
const ROTULO_ALTURA_NOME = 12;
const ROTULO_ALTURA_SUB = 11;
/* o ponto interno e a largura do pasto se medem uma vez, nesta escala fixa; no zoom z vale × 2^(z − ZOOM_DE_MEDIDA) */
const ZOOM_DE_MEDIDA = 20;

interface RotuloDoPasto {
  id: string; nome: string; sub: string; ancora: L.LatLng; folga: number; largura: number; prioridade: number;
  /** Os anéis do pasto na escala de medida (para conferir se a caixa do rótulo fica dentro). */
  aneis: Aneis;
}

let reguaDoTexto: CanvasRenderingContext2D | null = null;
function larguraDoTexto(texto: string, px: number, peso: number): number {
  if (typeof document === 'undefined') return texto.length * px * 0.6;
  reguaDoTexto ??= document.createElement('canvas').getContext('2d');
  if (!reguaDoTexto) return texto.length * px * 0.6;
  reguaDoTexto.font = `${peso} ${px}px ${getComputedStyle(document.body).fontFamily}`;
  return Math.ceil(reguaDoTexto.measureText(texto).width) + 2;
}

/** Os anéis do maior polígono da geometria (Polygon ou MultiPolygon), em pixels na escala de medida. */
function aneisEmPixels(mapa: L.Map, geo: FazendaGeometria['geojson']): Aneis | null {
  const para = (anel: number[][]): Ponto[] => anel.map(([lng, lat]) => { const pt = mapa.project(L.latLng(lat, lng), ZOOM_DE_MEDIDA); return [pt.x, pt.y]; });
  const areaDe = (a: Ponto[]) => Math.abs(a.reduce((s, [x, y], i) => { const [x2, y2] = a[(i + 1) % a.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
  if (geo.type === 'Polygon') return geo.coordinates.map(para);
  if (geo.type === 'MultiPolygon') {
    let melhor: Aneis | null = null; let maior = -1;
    for (const pol of geo.coordinates) { const a = pol.map(para); const ar = a[0] ? areaDe(a[0]) : 0; if (ar > maior) { maior = ar; melhor = a; } }
    return melhor;
  }
  return null;
}
const MENU_ACIMA = 'z-[1100]';
const SEM_ATIVIDADE = '__sem__';

type Filtros = {
  pastos: boolean; areas: boolean; semUso: boolean; nomes: boolean;
  atividadesOcultas: Set<string>; comAnimais: boolean; vazio: boolean; semFechamento: boolean;
  /** MAPA-02f-b: a infraestrutura (liga/desliga tudo) e os tipos escondidos */
  infra: boolean; infraOcultos: Set<string>;
};
const FILTROS_INICIAIS: Filtros = {
  pastos: true, areas: true, semUso: true, nomes: true, atividadesOcultas: new Set(), comAnimais: true, vazio: true, semFechamento: true,
  infra: true, infraOcultos: new Set(),
};

function numero(v: number | null | undefined, casas = 0, sufixo = ''): string {
  return v == null ? '—' : `${formatNum(v, casas)}${sufixo}`;
}

/* MAPA-COMPACTO-01: o card mais baixo (28 px: rótulo 11 + valor 15 + 2) e com menos padding; "cab." e "UA/ha" seguem menores */
function Kpi({ rotulo, valor, unidade, largura = 80 }: { rotulo: string; valor: string; unidade?: string | null; largura?: number }) {
  return (
    <div className="flex-none rounded-md bg-white/70 px-1.5 py-px" style={{ width: largura }}>
      <div className="text-[9.5px] leading-[11px] text-[#4A5361]">{rotulo}</div>
      <div className="whitespace-nowrap text-[12px] font-semibold leading-[15px] tabular-nums">
        {valor}{unidade ? <span className="ml-0.5 text-[10px] font-normal text-[#4A5361]">{unidade}</span> : null}
      </div>
    </div>
  );
}

/* MAPA-PAINEL-COMPACTO-01: a célula mais baixa (rótulo 11 + valor 14), menos padding; `nota` = uma linha secundária (a área do mapa) */
function Cel({ rotulo, valor, destaque, unidade, nota, tituloNota }: {
  rotulo: string; valor: string; destaque?: boolean; unidade?: string | null; nota?: string | null; tituloNota?: string;
}) {
  return (
    <div className={`rounded-md px-1 py-px ${destaque ? 'bg-[#FFF6D6]' : 'bg-white/75'}`}>
      <div className="text-[9.5px] leading-[11px] text-[#4A5361]">{rotulo}</div>
      <div className="whitespace-nowrap text-[11px] font-semibold leading-[14px] tabular-nums">
        {valor}{unidade ? <span className="ml-1 text-[9.5px] font-normal text-[#4A5361]">{unidade}</span> : null}
      </div>
      {nota && <div className="whitespace-nowrap text-[9.5px] leading-[11px] text-[#5A6472]" title={tituloNota} data-testid="mapa-painel-area-mapa">{nota}</div>}
    </div>
  );
}

/** MAPA-PAINEL-COMPACTO-01: campo sem valor fica em BRANCO no painel (Gabriel 01/11), não "—". */
function branco(v: number | null | undefined, casas = 0, unidade = ''): string {
  return v == null ? '' : `${formatNum(v, casas)}${unidade}`;
}

/** MAPA-ATIVIDADE-LAVOURA-01: uma linha rótulo · valor do bloco da lavoura (o valor quebra; fora de tabela nada de "…"). */
function LinhaDoUso({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="grid grid-cols-[86px_1fr] gap-1 text-[10px] leading-[13px]">
      <span className="text-[#4A5361]">{rotulo}</span>
      <span className="break-words font-semibold tabular-nums text-[#1d232b]">{valor}</span>
    </div>
  );
}

/**
 * MAPA-ATIVIDADE-LAVOURA-01 — o painel do pasto FORA da pecuária no mês: sem cabeças, lotação, categorias nem histórico de lotação.
 * Lavoura: cultura, safra, área plantada (e variedade, situação, plantio, colheita) da safra que contém o mês (D4). Os outros usos dizem o
 * uso e que o rebanho não se aplica.
 */
function BlocoForaDaPecuaria({ familia, uso, lavoura, lida, erro, mes }: {
  familia: FamiliaForaDaPecuaria; uso: string; lavoura: LavouraDoMes | null; lida: boolean; erro: string | null; mes: string;
}) {
  if (familia !== 'lavoura') {
    return (
      <div className="mt-2 text-[10px] leading-[13px] text-[#4A5361]" data-testid="mapa-painel-uso">
        <b className="font-semibold text-[#1d232b]">{uso}</b> no mês: sem rebanho — cabeças e lotação não se aplicam.
      </div>
    );
  }
  return (
    <div className="mt-2" data-testid="mapa-painel-lavoura">
      <div className="mb-0.5 text-[9.5px] font-semibold leading-[12px] text-[#4A5361]">Lavoura</div>
      {erro ? <div className="text-[10px] leading-[13px] text-[#B03A2E]">{erro}</div>
        : !lida ? <div className="text-[10px] leading-[13px] text-[#5A6472]">Lendo a lavoura…</div>
          : !lavoura ? <div className="text-[10px] leading-[13px] text-[#5A6472]">Nenhuma safra de lavoura cadastrada que contenha {mes}.</div>
            : (
              <div className="flex flex-col gap-px">
                <LinhaDoUso rotulo="Cultura" valor={lavoura.culturas.join(' + ') || '—'} />
                <LinhaDoUso rotulo="Safra" valor={lavoura.safra} />
                <LinhaDoUso rotulo="Área plantada" valor={lavoura.areaPlantadaHa == null ? '—' : `${formatNum(lavoura.areaPlantadaHa, 1)} ha`} />
                <LinhaDoUso rotulo="Variedade" valor={lavoura.variedades.join(' + ') || '—'} />
                <LinhaDoUso rotulo="Situação" valor={lavoura.status ?? '—'} />
                <LinhaDoUso rotulo="Plantio" valor={dataBR(lavoura.plantio)} />
                {lavoura.colheitaReal
                  ? <LinhaDoUso rotulo="Colheita" valor={dataBR(lavoura.colheitaReal)} />
                  : <LinhaDoUso rotulo="Colheita prevista" valor={dataBR(lavoura.colheitaPrevista)} />}
              </div>
            )}
    </div>
  );
}

function LinhaFiltro({ rotulo, marcado, onChange, n }: { rotulo: string; marcado: boolean; onChange: (v: boolean) => void; n?: number }) {
  return (
    <label className="flex h-[20px] cursor-pointer items-center gap-1.5 text-[10px]">
      <Checkbox checked={marcado} onCheckedChange={v => onChange(v === true)} className="h-3 w-3 rounded-[2px] [&_svg]:h-2.5 [&_svg]:w-2.5" />
      <span className="min-w-0 flex-1 truncate" title={rotulo}>{rotulo}</span>
      {n != null ? <span className="w-6 flex-none text-right text-[9.5px] tabular-nums text-[#5A6472]">{n}</span> : null}
    </label>
  );
}

/** Põe os rótulos no zoom atual: cada pasto mostra nome + kg/ha, só o nome ou nada (fica no hover); nunca dois se sobrepõem. */
function desenharRotulos(mapa: L.Map, camada: L.LayerGroup, lista: readonly RotuloDoPasto[]) {
  camada.clearLayers();
  if (lista.length === 0) return;
  const escala = Math.pow(2, mapa.getZoom() - ZOOM_DE_MEDIDA);
  const porId = new Map(lista.map(r => [r.id, r]));
  const modos = arrumarRotulos(lista.map(r => {
    const pt = mapa.project(r.ancora, mapa.getZoom());
    return {
      id: r.id, x: pt.x, y: pt.y, folga: r.folga * escala, larguraDoPasto: r.largura * escala,
      larguraNome: larguraDoTexto(r.nome, ROTULO_NOME_PX, 600), alturaNome: ROTULO_ALTURA_NOME,
      larguraSub: larguraDoTexto(r.sub, ROTULO_SUB_PX, 400), alturaSub: ROTULO_ALTURA_SUB, prioridade: r.prioridade,
      dentro: (x: number, y: number) => distanciaABorda(x / escala, y / escala, r.aneis) >= 0,
    };
  }));
  modos.forEach((modo, id) => {
    const r = porId.get(id);
    if (!r || modo === 'oculto') return;
    const sub = modo === 'completo'
      ? `<div style="font-weight:400;font-size:${ROTULO_SUB_PX}px;line-height:${ROTULO_ALTURA_SUB}px;opacity:.88">${escaparHtml(r.sub)}</div>` : '';
    L.marker(r.ancora, {
      interactive: false,
      icon: L.divIcon({
        className: '',
        iconSize: [0, 0],
        html: `<div data-rotulo-pasto="${modo}" style="transform:translate(-50%,-50%);white-space:nowrap;text-align:center;color:#fff;font-size:${ROTULO_NOME_PX}px;font-weight:600;line-height:${ROTULO_ALTURA_NOME}px;text-shadow:0 1px 2px #000,0 0 2px #000">${escaparHtml(r.nome)}${sub}</div>`,
      }),
    }).addTo(camada);
  });
}

/** O número em cima da barra do histórico: até 999 inteiro; de 1.000 em diante "1,1k" (a barra tem ~18px; o valor inteiro fica no title). */
function valorDaBarra(v: number): string {
  return v >= 999.5 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : formatNum(v, 0);
}

/** MAPA-ATIVIDADE-LAVOURA-01: a família do pasto FORA da pecuária no mês (null = pecuária ou fora da vigência). */
function familiaDoPasto(d: DadosDoPastoNoMes | null | undefined): FamiliaForaDaPecuaria | null {
  return d && !d.pecuaria ? familiaForaDaPecuaria(d.usoDoMes) : null;
}

/** MAPA-ATIVIDADE-LAVOURA-01: o rótulo do pasto fora da pecuária (nunca "vazio"): lavoura com a cultura da safra do mês; o resto, o uso. */
function rotuloForaDaPecuaria(d: DadosDoPastoNoMes, lavoura: LavouraDoMes | null): string {
  return familiaDoPasto(d) === 'lavoura' ? rotuloDaLavoura(lavoura) : rotuloDaAtividade(d.usoDoMes);
}

function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function MapaGestorView({
  geometrias, pastos, anoMes, dadosDoMes, carregandoMes, erroDoMes, geoLoading, onImportar, onClassificarArea, onRenderedChange,
  seletorDeMes, trocaDeVista, voltarAoGlobal, pastoInicialId, fazendaId, clienteId, divisoes,
}: Props) {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [camada, setCamada] = useState<CamadaDoMapa>('situacao');
  /* MAPA-PAINEL-LOTE-UA-01 (Gabriel 02/11): o histórico abre SEMPRE em UA/ha; o kg/ha troca, e a escolha não é lembrada (volta ao trocar de pasto) */
  const [serieDoHistorico, setSerieDoHistorico] = useState<'kg' | 'ua'>('ua');
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIAIS);
  const [creditosNoRodape, setCreditosNoRodape] = useState(true); // MAPA-CONTROLES-01
  const [larguraDosCreditos, setLarguraDosCreditos] = useState(0); // MAPA-COMPACTO-01: medida, não o pior caso
  const quadroRef = useRef<HTMLDivElement>(null);
  const legendaRef = useRef<HTMLDivElement>(null);
  const enquadrouRef = useRef('');
  const camadasRef = useRef(new Map<string, L.GeoJSON>());
  const rotulosRef = useRef<RotuloDoPasto[]>([]);

  const { mapContainerRef, mapInstanceRef, featureLayerRef, labelLayerRef, status: mapStatus, reportRenderedGeometries,
    fundo, trocarFundo } = useStableLeafletMap({ debugName: 'MapaGestor', labelZoomThreshold: 0 });

  const pastoPorId = useMemo(() => new Map(pastos.map(p => [p.id, p])), [pastos]);
  const hasGeo = geometrias.length > 0;
  const geoPastos = useMemo(() => geometrias.filter(g => g.tipo === 'pasto' && !!g.pasto_id), [geometrias]);
  const geoSelecionada = selecionadoId ? geoPastos.find(g => g.id === selecionadoId) ?? null : null;
  const pastoSelecionado = geoSelecionada?.pasto_id ? pastoPorId.get(geoSelecionada.pasto_id) ?? null : null;
  /* MAPA-02f-b: a infraestrutura — colocar (um clique no mapa), ver, editar (arrastar o ponto) e desativar */
  const { infras, bens, salvar: salvarInfra, desativar: desativarInfra, criarBem: criarBemDaInfra, recarregar: recarregarInfra } = useInfraestruturas(fazendaId);
  const [colocandoTipo, setColocandoTipo] = useState<TipoInfra | null>(null);
  const [pontoNovo, setPontoNovo] = useState<{ lon: number; lat: number } | null>(null);
  const [infraSelId, setInfraSelId] = useState<string | null>(null);
  const [editandoInfra, setEditandoInfra] = useState(false);
  const [pontoEditado, setPontoEditado] = useState<{ lon: number; lat: number } | null>(null);
  const colocandoRef = useRef<TipoInfra | null>(null);
  colocandoRef.current = colocandoTipo;
  const infraLayerRef = useRef<L.LayerGroup | null>(null);
  const infraSel = infraSelId ? infras.find(i => i.id === infraSelId) ?? null : null;
  const infraPainelAberto = (!!colocandoTipo && !!pontoNovo) || !!infraSel;
  const fecharInfra = () => { setColocandoTipo(null); setPontoNovo(null); setInfraSelId(null); setEditandoInfra(false); setPontoEditado(null); };
  const painelAberto = Boolean(geoSelecionada && pastoSelecionado) || infraPainelAberto;
  const dadosSelecionado = pastoSelecionado ? dadosDoMes.get(pastoSelecionado.id) ?? null : null;
  /* MAPA-ATIVIDADE-LAVOURA-01: a lavoura dos pastos da fazenda (a safra do mês se escolhe na lib, D4) */
  const { registros: registrosDeLavoura, lido: lavouraLida, erro: erroDaLavoura } = useLavouraDaFazenda(fazendaId, clienteId);
  const familiaSelecionada = familiaDoPasto(dadosSelecionado);
  const lavouraSelecionada = pastoSelecionado && familiaSelecionada === 'lavoura'
    ? lavouraDoPastoNoMes(registrosDeLavoura, pastoSelecionado.id, anoMes) : null;

  useEffect(() => { setSerieDoHistorico('ua'); }, [selecionadoId]);

  // o polígono deixou de ser pasto (vínculo removido) ou sumiu: o painel fecha
  useEffect(() => {
    if (selecionadoId && !geoPastos.some(g => g.id === selecionadoId)) setSelecionadoId(null);
  }, [selecionadoId, geoPastos]);

  /* ── KPIs da fazenda no mês: os pastos com polígono, vigentes no mês ── */
  // MAPA-GLOBAL-01: a regra mora na lib (`resumoDosPastos`), a MESMA do Global
  const kpis = useMemo(() => {
    const r = resumoDosPastos(geoPastos.map(g => g.pasto_id!), dadosDoMes, id => pastoPorId.get(id)?.area_produtiva_ha);
    return { ...r, uaHa: r.cabecas == null ? null : uaPorHa(r.cabecas, r.pesoMedio, r.area) };
  }, [geoPastos, dadosDoMes, pastoPorId]);

  /* fix1 E: o fechamento de pastos do mês ainda não está fechado (algum pasto do mapa com status ≠ 'fechado') */
  const fechamentoAberto = useMemo(() => fechamentoDoMesAberto(dadosDoMes, geoPastos.map(g => g.pasto_id!)), [dadosDoMes, geoPastos]);

  /* ── Contagens dos filtros ── */
  const contagens = useMemo(() => {
    const atividades = new Map<string, number>();
    let comAnimais = 0; let vazio = 0; let semFechamento = 0;
    const atividadesDaPecuaria = new Set<string>(); const familias = new Set<FamiliaForaDaPecuaria>();
    for (const g of geoPastos) {
      const d = dadosDoMes.get(g.pasto_id!);
      /* MAPA-ATIVIDADE-LAVOURA-01: fora da pecuária conta só no filtro de atividade (pelo uso do mês), nunca em "Vazio"/"Sem fechamento" */
      const familia = familiaDoPasto(d);
      if (d && familia) {
        const u = d.usoDoMes ?? SEM_ATIVIDADE;
        atividades.set(u, (atividades.get(u) ?? 0) + 1);
        familias.add(familia);
        continue;
      }
      if (!d || !d.temFechamento) { semFechamento++; continue; }
      if ((d.cabecas ?? 0) > 0) comAnimais++; else vazio++;
      const a = d.atividade ?? SEM_ATIVIDADE;
      atividades.set(a, (atividades.get(a) ?? 0) + 1);
      if (a !== SEM_ATIVIDADE) atividadesDaPecuaria.add(a);
    }
    return {
      pastos: geoPastos.length,
      areas: geometrias.filter(g => g.tipo !== 'pasto' && g.tipo !== 'area_sem_uso' && g.tipo !== 'area_total').length,
      semUso: geometrias.filter(g => g.tipo === 'area_sem_uso').length,
      atividades: [...atividades.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      comAnimais, vazio, semFechamento, atividadesDaPecuaria: [...atividadesDaPecuaria], familias: [...familias],
    };
  }, [geoPastos, geometrias, dadosDoMes]);

  const legenda = useMemo(() => legendaDaCamada(camada, contagens.atividadesDaPecuaria, contagens.familias), [camada, contagens]);

  /* ── Desenho ── */
  useEffect(() => {
    if (mapStatus !== 'ready') return;
    const mapa = mapInstanceRef.current;
    const grupo = featureLayerRef.current;
    const rotulos = labelLayerRef.current;
    if (!mapa || !grupo || !rotulos) return;
    grupo.clearLayers();
    rotulos.clearLayers();
    camadasRef.current.clear();

    const dadoDe = (g: FazendaGeometria) => (g.pasto_id ? dadosDoMes.get(g.pasto_id) ?? null : null);
    const visivel = (g: FazendaGeometria): boolean => {
      if (g.tipo === 'area_total') return filtros.areas;
      if (g.tipo === 'area_sem_uso') return filtros.semUso;
      if (g.tipo !== 'pasto' || !g.pasto_id) return filtros.areas;
      if (!filtros.pastos) return false;
      const d = dadoDe(g);
      if (d && familiaDoPasto(d)) return !filtros.atividadesOcultas.has(d.usoDoMes ?? SEM_ATIVIDADE);
      if (!d || !d.temFechamento) return filtros.semFechamento;
      if ((d.cabecas ?? 0) > 0 ? !filtros.comAnimais : !filtros.vazio) return false;
      return !filtros.atividadesOcultas.has(d.atividade ?? SEM_ATIVIDADE);
    };
    const nomeDe = (g: FazendaGeometria) => (g.pasto_id ? pastoPorId.get(g.pasto_id)?.nome : null) ?? g.nome_original ?? 'Sem nome';

    const limites = L.latLngBounds([]);
    let desenhados = 0;
    const candidatos: RotuloDoPasto[] = [];
    // área total por baixo de tudo; depois as áreas; os pastos por cima
    const peso = (g: FazendaGeometria) => (g.tipo === 'area_total' ? 0 : g.tipo === 'pasto' ? 2 : 1);
    for (const g of [...geometrias].sort((a, b) => peso(a) - peso(b))) {
      if (!visivel(g)) continue;
      try {
        const ehPasto = g.tipo === 'pasto' && !!g.pasto_id;
        const sel = g.id === selecionadoId;
        const d = ehPasto ? dadoDe(g) : null;
        const estilo: L.PathOptions = g.tipo === 'area_total'
          ? { color: '#ffffff', weight: 1.5, dashArray: '6 4', fill: false }
          : ehPasto
            ? {
              color: sel ? '#ffffff' : 'rgba(255,255,255,0.85)', weight: sel ? 3 : 1, fillOpacity: sel ? 0.65 : 0.45,
              fillColor: corDoPasto(camada, {
                foraDaPecuaria: familiaDoPasto(d),
                temFechamento: !!d?.temFechamento, kgHa: d?.kgHa ?? null, cabecas: d?.cabecas ?? null, faixa: d?.faixa ?? null,
                atividade: d?.atividade ?? null,
              }),
            }
            : { color: 'rgba(255,255,255,0.85)', weight: 1, fillColor: corDaArea(g.tipo), fillOpacity: 0.45 };
        const camadaGeo = L.geoJSON(g.geojson, { style: estilo, interactive: g.tipo !== 'area_total' });
        const b = camadaGeo.getBounds();
        if (b.isValid()) { limites.extend(b); desenhados++; }
        const nome = nomeDe(g);
        if (ehPasto) {
          camadaGeo.on('click', () => { if (colocandoRef.current) return; setInfraSelId(null); setSelecionadoId(g.id); });
          const sub = d && familiaDoPasto(d) ? rotuloForaDaPecuaria(d, lavouraDoPastoNoMes(registrosDeLavoura, g.pasto_id!, anoMes))
            : !d || !d.temFechamento ? '—' : (d.cabecas ?? 0) === 0 ? 'vazio' : `${formatNum(d.kgHa ?? 0, 0)} kg/ha`;
          // o hover mostra sempre o nome e o kg/ha (é onde fica o rótulo que não coube)
          camadaGeo.bindTooltip(`${nome} · ${sub}`, { sticky: true });
          if (filtros.nomes && b.isValid()) {
            const aneis = aneisEmPixels(mapa, g.geojson);
            if (aneis && aneis[0]?.length >= 3) {
              const polo = pontoMaisInterno(aneis, 2);
              const xs = aneis[0].map(pt => pt[0]);
              candidatos.push({
                id: g.id, nome, sub, ancora: mapa.unproject(L.point(polo.x, polo.y), ZOOM_DE_MEDIDA), folga: polo.folga,
                largura: Math.max(...xs) - Math.min(...xs), prioridade: areaEmHectares(g.geojson), aneis,
              });
            }
          }
        } else if (g.tipo !== 'area_total') {
          camadaGeo.bindTooltip(nome, { sticky: true });
        }
        camadaGeo.addTo(grupo);
        camadasRef.current.set(g.id, camadaGeo);
        /* MAPA-PIQUETES-03: as divisões da unidade (os piquetes do mês) — só linhas finas por dentro, sem preenchimento, rótulo nem clique */
        for (const dv of (ehPasto && g.pasto_id ? divisoes?.get(g.pasto_id) ?? [] : [])) {
          if (!dv.poligono) continue;
          L.geoJSON(dv.poligono.geojson, { style: { color: 'rgba(255,255,255,0.7)', weight: 0.75, fill: false }, interactive: false }).addTo(grupo);
        }
      } catch {
        /* polígono inválido: fica de fora */
      }
    }
    rotulosRef.current = candidatos;
    reportRenderedGeometries(desenhados);
    onRenderedChange?.(desenhados);
    /* MAPA-EDITAR-POLIGONO-07 (Gabriel 15:09): o enquadramento automático só na troca de FAZENDA (e no 1º carregamento). A chave era a
       lista de ids dos polígonos: toda gravação que cria/remove um (desenhar, dividir, unir, apagar) reenquadrava a fazenda inteira. */
    const chave = geometrias[0]?.fazenda_id ?? '';
    if (limites.isValid() && enquadrouRef.current !== chave) {
      enquadrouRef.current = chave;
      try { mapa.fitBounds(limites, { paddingTopLeft: [240, 70], paddingBottomRight: [20, 60], animate: false, maxZoom: 16 }); } catch { /* */ }
    }
    // depois do enquadramento: os rótulos se arrumam no zoom em que o mapa vai ficar
    desenharRotulos(mapa, rotulos, candidatos);
  }, [mapStatus, geometrias, dadosDoMes, camada, filtros, selecionadoId, pastoPorId, mapInstanceRef, featureLayerRef, labelLayerRef,
    reportRenderedGeometries, onRenderedChange, registrosDeLavoura, anoMes, divisoes]);

  /* MAPA-02f-b: a camada dos ÍCONES da infraestrutura (acima dos pastos; tamanho fixo em qualquer zoom; o rótulo no hover). Clique abre o
     painel (só leitura); na edição o ponto escolhido se arrasta; o ponto novo (ainda sem gravar) também. */
  useEffect(() => {
    const mapa = mapInstanceRef.current;
    if (mapStatus !== 'ready' || !mapa) return;
    if (!infraLayerRef.current) infraLayerRef.current = L.layerGroup().addTo(mapa);
    const grupo = infraLayerRef.current;
    grupo.clearLayers();
    const icone = (tipo: string, sel: boolean) => L.divIcon({ html: iconeDaInfra(tipo, sel), className: 'mapa-infra-icone', iconSize: [18, 18], iconAnchor: [9, 9] });
    if (filtros.infra) {
      for (const i of infras) {
        if (filtros.infraOcultos.has(i.tipo)) continue;
        const sel = i.id === infraSelId;
        const pt = sel && pontoEditado ? pontoEditado : pontoDaInfra(i.geometria);
        if (!pt) continue;
        const m = L.marker([pt.lat, pt.lon], { icon: icone(i.tipo, sel), draggable: sel && editandoInfra, keyboard: false, zIndexOffset: sel ? 1000 : 0 });
        m.bindTooltip(`${definicaoDoTipo(i.tipo)?.rotulo ?? i.tipo}${i.nome ? ` · ${i.nome}` : ''}`, { direction: 'top', offset: [0, -8] });
        m.on('click', ev => { L.DomEvent.stopPropagation(ev); if (colocandoRef.current) return; setSelecionadoId(null); setPontoEditado(null); setInfraSelId(i.id); });
        m.on('dragend', () => { const ll = m.getLatLng(); setPontoEditado({ lon: ll.lng, lat: ll.lat }); });
        m.addTo(grupo);
      }
    }
    if (colocandoTipo && pontoNovo) {
      const m = L.marker([pontoNovo.lat, pontoNovo.lon], { icon: icone(colocandoTipo, true), draggable: true, keyboard: false, zIndexOffset: 1000 });
      m.on('dragend', () => { const ll = m.getLatLng(); setPontoNovo({ lon: ll.lng, lat: ll.lat }); });
      m.addTo(grupo);
    }
  }, [mapStatus, mapInstanceRef, infras, filtros.infra, filtros.infraOcultos, infraSelId, editandoInfra, pontoEditado, colocandoTipo, pontoNovo]);
  /* o clique no mapa, no modo de colocar, marca (ou move) o ponto novo */
  useEffect(() => {
    const mapa = mapInstanceRef.current;
    if (mapStatus !== 'ready' || !mapa || !colocandoTipo) return;
    const aoClicar = (ev: L.LeafletMouseEvent) => setPontoNovo({ lon: ev.latlng.lng, lat: ev.latlng.lat });
    mapa.on('click', aoClicar);
    return () => { mapa.off('click', aoClicar); };
  }, [mapStatus, mapInstanceRef, colocandoTipo]);

  /* fix1 (2): o rótulo tem tamanho fixo na tela, então a colisão se refaz a cada zoom */
  useEffect(() => {
    if (mapStatus !== 'ready') return;
    const mapa = mapInstanceRef.current;
    const rotulos = labelLayerRef.current;
    if (!mapa || !rotulos) return;
    const refazer = () => desenharRotulos(mapa, rotulos, rotulosRef.current);
    mapa.on('zoomend', refazer);
    return () => { mapa.off('zoomend', refazer); };
  }, [mapStatus, mapInstanceRef, labelLayerRef]);

  /* MAPA-GLOBAL-01 (D6): o pasto clicado no Global abre selecionado e enquadrado (uma vez por pedido) */
  const pastoInicialFeitoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pastoInicialId || pastoInicialFeitoRef.current === pastoInicialId || mapStatus !== 'ready') return;
    const g = geoPastos.find(x => x.pasto_id === pastoInicialId);
    const camadaGeo = g ? camadasRef.current.get(g.id) : undefined;
    if (!g || !camadaGeo) return;
    pastoInicialFeitoRef.current = pastoInicialId;
    setSelecionadoId(g.id);
    const mapa = mapInstanceRef.current;
    const b = camadaGeo.getBounds();
    if (mapa && b.isValid()) mapa.fitBounds(b, { paddingTopLeft: [filtrosAbertos ? 240 : 20, 70], paddingBottomRight: [314, 60], maxZoom: 16 });
  });

  const enquadrar = (limites: L.LatLngBounds, comPainel: boolean) => {
    const mapa = mapInstanceRef.current;
    if (!mapa || !limites.isValid()) return;
    mapa.fitBounds(limites, { paddingTopLeft: [filtrosAbertos ? 240 : 20, 70], paddingBottomRight: [comPainel ? 314 : 20, 60], maxZoom: 16 });
  };
  const fazendaInteira = () => {
    const l = L.latLngBounds([]);
    camadasRef.current.forEach(c => { const b = c.getBounds(); if (b.isValid()) l.extend(b); });
    enquadrar(l, !!selecionadoId);
  };
  const irParaPasto = (pastoId: string) => {
    const g = geoPastos.find(x => x.pasto_id === pastoId);
    if (!g) return;
    setSelecionadoId(g.id);
    /* -07: escolher o pasto NÃO muda o zoom; fora da tela, o mapa só desliza até ele ("Fazenda inteira" enquadra quando se quer) */
    const mapa = mapInstanceRef.current;
    const b = (camadasRef.current.get(g.id) ?? L.geoJSON(g.geojson)).getBounds();
    if (mapa && b.isValid() && !mapa.getBounds().intersects(b)) mapa.panTo(b.getCenter()); // só quando está TODO fora da tela
  };

  const opcoesBusca = useMemo(() => geoPastos
    .map(g => ({ value: g.pasto_id!, label: pastoPorId.get(g.pasto_id!)?.nome ?? g.nome_original }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true })), [geoPastos, pastoPorId]);

  const camadaAtual = CAMADAS.find(c => c.valor === camada);
  const nomeCamada = camadaAtual?.rotulo ?? '';
  const nomeCurtoCamada = camadaAtual?.curto ?? nomeCamada;
  const mesDoMapa = mesCurtoNumerico(anoMes);
  let subtitulo = '';
  if (pastoSelecionado) {
    if (!dadosSelecionado) subtitulo = `Fora da vigência em ${mesDoMapa}`;
    else if (familiaSelecionada) {
      /* MAPA-ATIVIDADE-LAVOURA-01: o uso do mês; sem fechamento, o do cadastro (D1) */
      subtitulo = `${rotuloForaDaPecuaria(dadosSelecionado, lavouraSelecionada)} · ${dadosSelecionado.temFechamento ? `fechamento ${mesDoMapa}` : `pelo cadastro (sem fechamento em ${mesDoMapa})`}`;
    } else if (!dadosSelecionado.temFechamento) {
      subtitulo = `Sem fechamento em ${mesDoMapa}${dadosSelecionado.ultimoFechamento ? ` · último fechamento ${mesCurtoNumerico(dadosSelecionado.ultimoFechamento)}` : ''}`;
    } else subtitulo = `${rotuloDaAtividade(dadosSelecionado.atividade)} · fechamento ${mesDoMapa}`;
  }
  const hist = dadosSelecionado?.historico ?? [];
  const lotes = tituloDosLotes(dadosSelecionado?.categorias ?? [], !!dadosSelecionado?.temFechamento);
  /* MAPA-PAINEL-COMPACTO-01: a escala das barras segue a série escolhida (kg/ha ou UA/ha) */
  const maxDoHistorico = Math.max(serieDoHistorico === 'kg' ? 1 : 0.1, ...hist.map(h => (serieDoHistorico === 'kg' ? h.kgHa : h.uaHa) ?? 0));
  /* a área MEDIDA no mapa (o polígono do pasto) ao lado da oficial do cadastro; a diferença com sinal, só se passa de 0,05 ha */
  const areaDoMapa = geoSelecionada ? areaEmHectares(geoSelecionada.geojson) : null;
  /* MAPA-PAINEL-CERCADA-01: útil + áreas internas (os polígonos de área dentro do contorno do pasto) */
  const cercada = useMemo(() => (geoSelecionada ? areaCercadaDoPasto(geoSelecionada, geometrias) : null), [geoSelecionada, geometrias]);
  const divisoesSelecionadas = useMemo(() => {
    const lista = pastoSelecionado ? divisoes?.get(pastoSelecionado.id) ?? [] : [];
    return lista.length ? divisoesNoPainel(lista) : null;
  }, [pastoSelecionado, divisoes]);
  const diferencaDaArea = (() => {
    const oficial = pastoSelecionado?.area_produtiva_ha;
    if (areaDoMapa == null || oficial == null) return null;
    const d = areaDoMapa - oficial;
    return Math.abs(d) < 0.05 ? null : `${d > 0 ? '+' : '−'}${formatNum(Math.abs(d), 1)}`;
  })();

  /* MAPA-CONTROLES-01: com o painel fechado, os créditos vão para o rodapé à direita SÓ se cabem ao lado da legenda inteira; senão sobem
     para logo acima da faixa da legenda, ainda encostados à direita — nunca por baixo dela (D4).
     MAPA-COMPACTO-01: a conta usa a largura MEDIDA dos créditos (antes, o pior caso de 360 px), e mede de novo quando o quadro, a legenda,
     o conteúdo dela ou o texto dos créditos mudam. */
  useEffect(() => {
    const quadro = quadroRef.current; if (!quadro) return;
    const creditos = quadro.querySelector<HTMLElement>('[data-testid="mapa-creditos"]');
    const medir = () => {
      const larguraDaLegenda = legendaRef.current?.scrollWidth ?? 0;
      /* a largura com o texto INTEIRO (gravada pelos créditos): decidir pela largura limitada faria o canto ir e voltar */
      const larguraDeles = Number(creditos?.dataset.larguraInteira ?? creditos?.offsetWidth ?? 0) || 0;
      const noRodape = !painelAberto && quadro.clientWidth >= larguraDaLegenda + FOLGA_DA_LEGENDA_PX + larguraDeles;
      setLarguraDosCreditos(larguraDeles);
      setCreditosNoRodape(noRodape);
      /* fora do rodapé os créditos sobem à altura dos Filtros: o espaço deles vai da borda dos Filtros (12 + 190 + 8) até o painel
         (264 + 10; o painel tem 248 desde o MAPA-PAINEL-COMPACTO-01) ou a borda do mapa (10); sem lugar para o texto inteiro, viram o botão "Fontes dos dados" (nunca cortado) */
      const limite = noRodape ? Number.MAX_SAFE_INTEGER
        : quadro.clientWidth - (painelAberto ? 274 : 10) - (filtrosAbertos && hasGeo ? 210 : 12);
      creditos?.dispatchEvent(new CustomEvent(EVENTO_LIMITE_DOS_CREDITOS, { detail: limite }));
    };
    medir();
    /* MAPA-PAINEL-COMPACTO-01: mede de novo no quadro seguinte — logo depois de trocar a camada a legenda ainda não se acomodou e o canto
       ficava no rodapé colado nela (visto no gate: Atividade a 1126, às vezes) */
    const quadroSeguinte = requestAnimationFrame(medir);
    if (typeof ResizeObserver === 'undefined') return () => cancelAnimationFrame(quadroSeguinte);
    const ro = new ResizeObserver(medir);
    ro.observe(quadro);
    if (legendaRef.current) ro.observe(legendaRef.current);
    if (creditos) ro.observe(creditos);
    return () => { cancelAnimationFrame(quadroSeguinte); ro.disconnect(); };
  }, [hasGeo, nomeCamada, legenda, erroDoMes, carregandoMes, mapStatus, painelAberto, filtrosAbertos]);
  /* MAPA-COMPACTO-01: sem lugar no rodapé (ou com o painel aberto), o canto sobe só até logo acima da legenda (22 px a 12 do pé = topo a
     34; a caixa dos créditos começa a 30 + 7 de margem = 37) */
  const canto = painelAberto
    ? '[&_.leaflet-bottom.leaflet-right]:bottom-[30px] [&_.leaflet-bottom.leaflet-right]:right-[264px]'
    : creditosNoRodape
      ? '[&_.leaflet-bottom.leaflet-right]:bottom-0 [&_.leaflet-bottom.leaflet-right]:right-0'
      : '[&_.leaflet-bottom.leaflet-right]:bottom-[30px] [&_.leaflet-bottom.leaflet-right]:right-0';

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="mapa-gestor">
      {/* Barra 40px */}
      <div className="relative z-[600] flex h-[34px] flex-none items-center gap-1.5 border-b border-[#D9DEE5] bg-white px-2.5" data-testid="mapa-barra">
        {/* MAPA-GLOBAL-01 (D6): o lugar do "← Global" existe sempre (largura fixa): aparecer não empurra os outros botões */}
        <div className="w-[56px] flex-none" data-testid="mapa-volta-global">
          {voltarAoGlobal && (
            <Button type="button" variant="ghost" size="sm" className="h-[24px] w-full justify-start gap-0 px-0.5 text-[11px] font-semibold text-[#2B6CB0]" onClick={voltarAoGlobal}>
              <ChevronLeft className="h-3 w-3" /> Global
            </Button>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setFiltrosAbertos(v => !v)}
          className={`h-[24px] w-[72px] flex-none gap-1 px-2 text-[11px] ${filtrosAbertos ? 'border-[#1B2A44] bg-[#1B2A44] text-white hover:bg-[#1B2A44] hover:text-white' : ''}`}>
          <ListFilter className="h-3 w-3" /> Filtros
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" className="h-[24px] w-[100px] flex-none gap-1 bg-[#2F7D4F] px-2 text-[11px] text-white hover:bg-[#2F7D4F]/90">
              <Plus className="h-3 w-3" /> Adicionar <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={`${MENU_ACIMA} w-[230px]`} data-testid="menu-adicionar">
            {MENU_ADICIONAR.map((gr, gi) => (
              <div key={gr.grupo ?? gi}>
                {gr.grupo && <><DropdownMenuSeparator /><DropdownMenuLabel>{gr.grupo}</DropdownMenuLabel></>}
                {gr.itens.map(item => item.itens ? (
                  <DropdownMenuSub key={item.rotulo}>
                    <DropdownMenuSubTrigger className="justify-between">
                      <span>{item.rotulo}</span>
                      {/* MAPA-AREA-TIPO-01: o selo "em breve" só quando nada do submenu funciona */}
                      <span className={`ml-auto mr-1 rounded-full bg-white/15 px-1.5 text-[9.5px] ${(onClassificarArea && item.itens.some(subitemFunciona))
                        || (fazendaId && item.itens.some(sub => tipoDePontoPeloRotulo(sub.rotulo) && item.rotulo === 'Infraestrutura')) ? 'invisible' : ''}`}>em breve</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className={`${MENU_ACIMA} max-h-[70vh] w-[220px] overflow-y-auto`}>
                      {item.itens.map((sub, si) => (
                        <div key={sub.rotulo}>
                          {sub.grupo && sub.grupo !== item.itens?.[si - 1]?.grupo && <DropdownMenuLabel>{sub.grupo}</DropdownMenuLabel>}
                          {subitemFunciona(sub) && onClassificarArea ? (
                            <DropdownMenuItem onSelect={() => onClassificarArea(sub.tipo)} title="Marca um polígono do mapa com este tipo, na Validação">
                              {sub.rotulo}
                            </DropdownMenuItem>
                          ) : item.rotulo === 'Infraestrutura' && fazendaId && tipoDePontoPeloRotulo(sub.rotulo) ? (
                            /* MAPA-02f-b: entra no modo de colocar (um clique no mapa); a cerca (só linha) fica para a 02f-c */
                            <DropdownMenuItem onSelect={() => { fecharInfra(); setSelecionadoId(null); setColocandoTipo(tipoDePontoPeloRotulo(sub.rotulo)); }}
                              data-testid={`infra-colocar-${tipoDePontoPeloRotulo(sub.rotulo)}`}>
                              <span className="mr-1.5 inline-flex" dangerouslySetInnerHTML={{ __html: iconeDaInfra(tipoDePontoPeloRotulo(sub.rotulo) ?? '') }} />{sub.rotulo}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem disabled>{sub.rotulo}</DropdownMenuItem>
                          )}
                        </div>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : itemFunciona(item) ? (
                  <DropdownMenuItem key={item.rotulo} onSelect={onImportar}><Upload className="mr-1.5 h-3 w-3" />{item.rotulo}</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={item.rotulo} disabled className="justify-between">
                    <span>{item.rotulo}</span><span className="rounded-full bg-white/15 px-1.5 text-[9.5px]">em breve</span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" title={`Camadas: ${nomeCamada}`}
              className="h-[24px] w-[152px] flex-none justify-between gap-1 bg-[#2B6CB0] px-2 text-[11px] text-white hover:bg-[#2B6CB0]/90">
              <span className="truncate">Camadas: <b className="font-semibold">{nomeCurtoCamada}</b></span>
              <ChevronDown className="h-3 w-3 flex-none" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className={`${MENU_ACIMA} w-[250px]`}>
            <DropdownMenuLabel>Rebanho</DropdownMenuLabel>
            {CAMADAS.map(c => (
              <DropdownMenuItem key={c.valor} onSelect={() => setCamada(c.valor)} className={c.valor === camada ? 'font-semibold' : ''}>
                {c.rotulo}
              </DropdownMenuItem>
            ))}
            {/* MAPA-02b (D5): o fundo do mapa — a escolha fica salva por usuário (todos os mapas da casa a seguem, P2) */}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Fundo</DropdownMenuLabel>
            {FUNDOS.map(f => (
              <DropdownMenuItem key={f.valor} onSelect={() => trocarFundo(f.valor)} className={f.valor === fundo ? 'font-semibold' : ''}
                data-testid={`mapa-fundo-${f.valor}`}>
                {f.rotulo}
              </DropdownMenuItem>
            ))}
            {CAMADAS_EM_BREVE.map(gr => (
              <div key={gr.grupo}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{gr.grupo}</DropdownMenuLabel>
                {gr.itens.map(i => (
                  <DropdownMenuItem key={i} disabled className="justify-between">
                    <span>{i}</span><span className="rounded-full bg-white/15 px-1.5 text-[9.5px]">em breve</span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="min-w-0 flex-1" />
        <div className="flex flex-none items-center gap-1">{seletorDeMes}</div>
        <Button type="button" variant="outline" size="sm" className="h-[24px] w-[92px] flex-none px-1.5 text-[11px]" onClick={fazendaInteira}>
          Fazenda inteira
        </Button>
        <div className="w-[124px] flex-none" data-testid="mapa-busca">
          {/* a busca só leva ao pasto (mostra sempre "Buscar pasto…"): o escolhido aparece no painel, e um nome longo cortado aqui seria "…" fora de tabela */}
          <SearchableSelect value="" onValueChange={v => { if (v) irParaPasto(v); }}
            options={opcoesBusca} allLabel="Buscar pasto…" allValue="" semTodos placeholder="Buscar pasto…"
            contentClassName={MENU_ACIMA} triggerClassName="h-[24px] text-[11px]" />
        </div>
        <div className="flex-none">{trocaDeVista}</div>
      </div>

      {/* Mapa + vidros */}
      {/* MAPA-CONTROLES-01 (Gabriel 31/10, D1/D2): o canto do zoom e dos créditos do Google só abre espaço para o painel do pasto quando ele
          está na tela — aberto, os dois ficam encostados à esquerda dele, acima da legenda (264 = 248 do painel + 12 da margem + 4; era 302 com o painel de 286); fechado,
          voltam para a borda direita: os créditos no rodapé (ou logo acima da legenda, se não cabem ao lado dela) e o + / − acima deles.
          EXCEÇÃO DECLARADA ao UI-SEM-DESLOCAR-01, só para o zoom e os créditos: abrir/fechar o pasto os move; barra, KPIs, Filtros,
          legenda e painel seguem fixos. */}
      <div ref={quadroRef} className={`relative min-h-0 flex-1 bg-[#3a4436] ${canto} ${colocandoTipo ? '[&_.leaflet-container]:cursor-crosshair' : ''}`}>
        <div className="absolute inset-0">
          {/* fix1 (1): o Chrome desenhava um retângulo azul (contorno de foco) no polígono clicado (Gabriel, proto, 31/10 08:27): sem contorno
              de foco SÓ nos polígonos do mapa; o foco de teclado do resto da tela continua */}
          <div ref={mapContainerRef} className="h-full w-full [&_path.leaflet-interactive:focus]:outline-none" data-testid="mapa-gestor-mapa" />
        </div>

        {hasGeo && (
          /* MAPA-COMPACTO-01: os cards a 6 px do topo, mais baixos, e o vidro na largura do CONTEÚDO (os 4 cards). O aviso do fechamento
             aberto saiu de dentro do vidro (o lugar reservado dele era o vazio à direita): é um selo à parte, ao lado, que aparece sem
             mover nada (é sobreposição, não ocupa lugar no vidro). */
          <div className="absolute left-3 top-1.5 z-[500] flex items-start gap-1.5">
            <div className={`flex gap-[2px] p-[2px] ${VIDRO}`} data-testid="mapa-kpis">
              <Kpi rotulo="Alocadas" valor={numero(kpis.cabecas)} unidade={kpis.cabecas == null ? undefined : 'cab.'} />
              <Kpi rotulo="Peso méd." valor={numero(kpis.pesoMedio, 0, ' kg')} />
              <Kpi rotulo="Lotação" valor={numero(kpis.lotacao, 0, ' kg/ha')} unidade={textoUaHa(kpis.uaHa)} largura={128} />
              <Kpi rotulo="Área pastos" valor={numero(kpis.area, 1, ' ha')} />
            </div>
            <div className={`mt-[2px] whitespace-nowrap rounded-md bg-[#FFF6D6]/95 px-1.5 py-px text-[9.5px] leading-[14px] text-[#8A5A00] shadow-sm ${fechamentoAberto ? '' : 'invisible'}`}
              data-testid="mapa-fechamento-aberto" aria-hidden={!fechamentoAberto}>
              fechamento de {mesDoMapa} aberto
            </div>
          </div>
        )}

        {hasGeo && filtrosAbertos && (
          <div className={`absolute bottom-[42px] left-3 top-[44px] z-[500] w-[190px] overflow-y-auto px-2.5 py-2 ${VIDRO}`} data-testid="mapa-filtros">
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
              Filtros
              <button type="button" className="text-[10.5px] font-normal text-[#2B6CB0]" onClick={() => setFiltrosAbertos(false)}>Ocultar</button>
            </div>
            <div className="mb-1 mt-2.5 text-[9.5px] font-semibold text-[#4A5361]">Mostrar no mapa</div>
            <LinhaFiltro rotulo="Pastos" marcado={filtros.pastos} n={contagens.pastos} onChange={v => setFiltros(f => ({ ...f, pastos: v }))} />
            <LinhaFiltro rotulo="Áreas da fazenda" marcado={filtros.areas} n={contagens.areas} onChange={v => setFiltros(f => ({ ...f, areas: v }))} />
            <LinhaFiltro rotulo="Área sem uso (terceiros)" marcado={filtros.semUso} n={contagens.semUso} onChange={v => setFiltros(f => ({ ...f, semUso: v }))} />
            <LinhaFiltro rotulo="Nomes dos pastos" marcado={filtros.nomes} onChange={v => setFiltros(f => ({ ...f, nomes: v }))} />
            <div className="mb-1 mt-2.5 text-[9.5px] font-semibold text-[#4A5361]">Atividade ({mesDoMapa})</div>
            {contagens.atividades.length === 0 ? <div className="text-[10.5px] text-[#5A6472]">—</div> : contagens.atividades.map(([a, n]) => (
              <LinhaFiltro key={a} rotulo={a === SEM_ATIVIDADE ? 'Sem atividade' : rotuloDaAtividade(a)} marcado={!filtros.atividadesOcultas.has(a)} n={n}
                onChange={v => setFiltros(f => {
                  const s = new Set(f.atividadesOcultas);
                  if (v) s.delete(a); else s.add(a);
                  return { ...f, atividadesOcultas: s };
                })} />
            ))}
            <div className="mb-1 mt-2.5 text-[9.5px] font-semibold text-[#4A5361]">Situação</div>
            <LinhaFiltro rotulo="Com animais" marcado={filtros.comAnimais} n={contagens.comAnimais} onChange={v => setFiltros(f => ({ ...f, comAnimais: v }))} />
            <LinhaFiltro rotulo="Vazio" marcado={filtros.vazio} n={contagens.vazio} onChange={v => setFiltros(f => ({ ...f, vazio: v }))} />
            <LinhaFiltro rotulo="Sem fechamento no mês" marcado={filtros.semFechamento} n={contagens.semFechamento}
              onChange={v => setFiltros(f => ({ ...f, semFechamento: v }))} />
            {/* MAPA-02f-b: liga/desliga toda a infraestrutura e um por tipo presente, com a contagem */}
            <div className="mb-1 mt-2.5 text-[9.5px] font-semibold text-[#4A5361]">Infraestruturas</div>
            <LinhaFiltro rotulo="Mostrar infraestrutura" marcado={filtros.infra} n={infras.length} onChange={v => setFiltros(f => ({ ...f, infra: v }))} />
            {contagemPorTipo(infras).map(t => (
              <LinhaFiltro key={t.tipo} rotulo={t.rotulo} marcado={filtros.infra && !filtros.infraOcultos.has(t.tipo)} n={t.n}
                onChange={v => setFiltros(f => {
                  const s = new Set(f.infraOcultos);
                  if (v) s.delete(t.tipo); else s.add(t.tipo);
                  return { ...f, infraOcultos: s, infra: v ? true : f.infra };
                })} />
            ))}
          </div>
        )}

        {/* MAPA-02f-b: o modo de colocar — um clique no mapa marca o ponto */}
        {colocandoTipo && !pontoNovo && (
          <div className={`absolute left-1/2 top-1.5 z-[600] flex -translate-x-1/2 items-center gap-2 px-2.5 py-1 text-[10.5px] ${VIDRO}`} data-testid="infra-modo-colocar">
            <span dangerouslySetInnerHTML={{ __html: iconeDaInfra(colocandoTipo) }} />
            Clique no mapa onde fica o <b className="font-semibold">{definicaoDoTipo(colocandoTipo)?.rotulo}</b>
            <button type="button" className="text-[#2B6CB0]" onClick={fecharInfra}>Cancelar</button>
          </div>
        )}
        {infraPainelAberto && fazendaId && (colocandoTipo || infraSel) && (
          <InfraPainel key={infraSel?.id ?? `novo-${colocandoTipo}`}
            className={`absolute bottom-3 right-3 top-3 z-[500] flex w-[248px] flex-col overflow-hidden ${VIDRO}`}
            fazendaId={fazendaId} clienteId={clienteId ?? null}
            tipo={infraSel ? (definicaoDoTipo(infraSel.tipo)?.tipo ?? 'cocho') : (colocandoTipo ?? 'cocho')}
            infra={infraSel}
            ponto={infraSel ? (pontoEditado ?? pontoDaInfra(infraSel.geometria) ?? { lon: 0, lat: 0 }) : (pontoNovo ?? { lon: 0, lat: 0 })}
            pastoSugerido={pontoNovo ? pastoNoPonto(pontoNovo.lon, pontoNovo.lat, geoPastos) : null}
            pastos={pastos} bens={bens} salvar={salvarInfra} desativar={desativarInfra} criarBem={criarBemDaInfra}
            onEditando={setEditandoInfra}
            onGravou={() => { fecharInfra(); recarregarInfra(); }}
            onFechar={fecharInfra} />
        )}

        {geoSelecionada && pastoSelecionado && !infraPainelAberto && (
          /* MAPA-PAINEL-COMPACTO-01 (Gabriel 01/11): o painel do pasto mais estreito (248 px, era 286), menos padding, fontes menores (piso
             9,5 px), nada quebra; categorias com o LOTE de cada registro (uma linha por registro); histórico em kg/ha | UA/ha; mês vedado
             marcado; campo sem valor em BRANCO; a área do MAPA ao lado da oficial, com a diferença (só leitura — quem adota é o cadastro). */
          <div className={`absolute bottom-3 right-3 top-3 z-[500] flex w-[248px] flex-col overflow-hidden ${VIDRO}`} data-testid="mapa-painel">
            <div className="flex-none border-b border-black/[0.08] px-2 pb-1.5 pt-2">
              <div className="flex items-start gap-1.5">
                <b className="min-w-0 break-words text-[12px] leading-[15px]">{pastoSelecionado.nome}</b>
                <span className="flex-none rounded-lg bg-[#E3F2E8] px-1.5 py-px text-[9.5px] font-semibold leading-[13px] text-[#2F6E45]">Vinculado</span>
                <button type="button" aria-label="Fechar" className="ml-auto flex-none text-[#4A5361] hover:text-[#1d232b]" onClick={() => setSelecionadoId(null)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* duas linhas reservadas: o subtítulo longo quebra (fora de tabela, nada de "…") e nada abaixo se desloca */}
              <div className="mt-0.5 h-[24px] overflow-hidden text-[9.5px] leading-[12px] text-[#4A5361]">{subtitulo}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
              <div className="grid grid-cols-2 gap-1">
                <Cel rotulo="Área" valor={branco(pastoSelecionado.area_produtiva_ha, 1, ' ha')}
                  nota={areaDoMapa == null ? null : `mapa ${formatNum(areaDoMapa, 1)} ha${diferencaDaArea ? ` · ${diferencaDaArea}` : ''}`}
                  tituloNota="A área do mapa é medição (só leitura); a oficial é a do cadastro do pasto." />
                {!familiaSelecionada && (
                  <>
                    <Cel rotulo="Cabeças" valor={branco(dadosSelecionado?.cabecas)} />
                    <Cel rotulo="Peso méd." valor={branco(dadosSelecionado?.pesoMedioKg, 0, ' kg')} />
                    <Cel rotulo="Lotação kg/ha" valor={branco(dadosSelecionado?.kgHa)} destaque
                      unidade={textoUaHa(dadosSelecionado?.temFechamento ? uaPorHa(dadosSelecionado.cabecas, dadosSelecionado.pesoMedioKg, pastoSelecionado.area_produtiva_ha) : null)} />
                  </>
                )}
              </div>
              {/* MAPA-PAINEL-CERCADA-01: a área cercada = a útil (o polígono do pasto) + as áreas internas (os polígonos de área dentro dele);
                  só leitura, medição do mapa (a oficial é a do cadastro) */}
              {cercada && (
                <div className="mt-1 h-[24px] overflow-hidden text-[9.5px] leading-[12px] text-[#4A5361]" data-testid="mapa-painel-cercada"
                  title={cercada.internas.length ? `Áreas internas: ${cercada.internas.map(i => `${i.nome} ${formatNum(i.ha, 1)} ha`).join(' · ')}` : 'Nenhuma área interna no pasto'}>
                  {/* duas linhas reservadas: fora de tabela o texto quebra (nunca "…"), e nada abaixo se desloca */}
                  Área cercada: <b className="font-semibold text-[#1d232b]">{formatNum(cercada.cercadaHa, 1)} ha</b>
                  {' '}<span className="whitespace-nowrap">(útil {formatNum(cercada.utilHa, 1)} + áreas internas {formatNum(cercada.internasHa, 1)})</span>
                </div>
              )}
              {/* MAPA-PIQUETES-03: "4 divisões: 7A 24,8 · … = 97,5 ha" — duas linhas reservadas (quebra, nunca "…"; longa vira a forma curta + title) */}
              {divisoesSelecionadas && (
                <div className="mt-0.5 h-[24px] overflow-hidden text-[9.5px] leading-[12px] text-[#4A5361]" data-testid="mapa-painel-divisoes"
                  title={divisoesSelecionadas.title}>
                  {divisoesSelecionadas.texto}
                </div>
              )}
              {familiaSelecionada && dadosSelecionado && (
                <BlocoForaDaPecuaria familia={familiaSelecionada} uso={rotuloDaAtividade(dadosSelecionado.usoDoMes)} lavoura={lavouraSelecionada}
                  lida={lavouraLida} erro={erroDaLavoura} mes={mesDoMapa} />
              )}
              {!familiaSelecionada && (<>
              {/* MAPA-PAINEL-LOTE-UA-01: o título é o LOTE do mês ("Lote X" · "Lotes: A · B" · "Sem lote"); duas linhas reservadas (fora de
                  tabela o texto quebra, nunca "…"; o inteiro também no title) */}
              <div className="mb-0.5 mt-2 h-[24px] overflow-hidden break-words text-[9.5px] font-semibold leading-[12px] text-[#4A5361]"
                title={lotes.titulo} data-testid="mapa-painel-lotes">{lotes.titulo}</div>
              {/* tabela: uma linha por REGISTRO do fechamento (categoria · cab · peso; o lote por linha só com mais de um); "…" com o inteiro no title */}
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }} data-reticencias-com-title data-testid="mapa-painel-categorias">
                <colgroup><col />{lotes.varios && <col style={{ width: 54 }} />}<col style={{ width: 30 }} /><col style={{ width: 44 }} /></colgroup>
                <thead>
                  <tr className="text-[9.5px] text-[#5A6472]">
                    <th className="h-[14px] px-0.5 text-left font-normal">Categoria</th>{lotes.varios && <th className="h-[14px] px-0.5 text-left font-normal">Lote</th>}
                    <th className="h-[14px] px-0.5 text-right font-normal">Cab.</th><th className="h-[14px] px-0.5 text-right font-normal">Peso</th>
                  </tr>
                </thead>
                <tbody>
                  {(dadosSelecionado?.categorias ?? []).map((c, i) => (
                    <tr key={`${c.nome}-${c.lote ?? ''}-${i}`}>
                      <td className="h-[16px] truncate px-0.5 text-[10px]" title={c.nome}>{c.nome}</td>
                      {lotes.varios && <td className="h-[16px] truncate px-0.5 text-[9.5px] text-[#5A6472]" title={c.lote ?? undefined}>{c.lote ?? ''}</td>}
                      <td className="h-[16px] px-0.5 text-right text-[10px] font-semibold tabular-nums">{formatNum(c.quantidade, 0)}</td>
                      <td className="h-[16px] whitespace-nowrap px-0.5 text-right text-[9.5px] tabular-nums text-[#5A6472]">{branco(c.peso_medio_kg, 0, ' kg')}</td>
                    </tr>
                  ))}
                  {(dadosSelecionado?.categorias.length ?? 0) > 1 && (
                    <tr className="border-t border-black/[0.12]" data-testid="mapa-painel-total">
                      <td className="h-[16px] px-0.5 text-[10px] font-semibold">Total</td>{lotes.varios && <td />}
                      <td className="h-[16px] px-0.5 text-right text-[10px] font-semibold tabular-nums">{branco(dadosSelecionado?.cabecas)}</td>
                      <td className="h-[16px] whitespace-nowrap px-0.5 text-right text-[9.5px] font-semibold tabular-nums">{branco(dadosSelecionado?.pesoMedioKg, 0, ' kg')}</td>
                    </tr>
                  )}
                  {(dadosSelecionado?.categorias.length ?? 0) === 0 && dadosSelecionado?.temFechamento && (
                    <tr><td colSpan={lotes.varios ? 4 : 3} className="h-[16px] px-0.5 text-[10px] text-[#5A6472]">Sem animais no fechamento do mês</td></tr>
                  )}
                </tbody>
              </table>
              <div className="mb-0.5 mt-2 flex items-center justify-between text-[9.5px] font-semibold leading-[12px] text-[#4A5361]">
                <span>Histórico de lotação</span>
                <Segmentado valor={serieDoHistorico} onEscolher={setSerieDoHistorico} altura={20} fonte={9.5}
                  opcoes={[{ valor: 'ua', rotulo: 'UA/ha' }, { valor: 'kg', rotulo: 'kg/ha' }]} />
              </div>
              <div className="flex h-[72px] items-end gap-[3px] pt-1" data-testid="mapa-historico">
                {hist.map(h => {
                  const v = serieDoHistorico === 'kg' ? h.kgHa : h.uaHa;
                  /* a cor segue a régua NA UNIDADE MOSTRADA (kg/ha 300/500 · UA/ha 0,67/1,11, LOTACAO-REF D2) */
                  const faixa = serieDoHistorico === 'kg' ? h.faixa : faixaDaLotacaoUa(h.uaHa);
                  const titulo = `${mesAbreviado(h.anoMes)}/${h.anoMes.slice(2, 4)}: ${h.vedado ? 'vedado' : v == null ? 'sem fechamento'
                    : serieDoHistorico === 'kg' ? `${formatNum(v, 0)} kg/ha` : `${formatNum(v, 2)} UA/ha`}`;
                  return (
                    <div key={h.anoMes} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={titulo} data-vedado={h.vedado || undefined}>
                      <span className="mb-px block text-center text-[9.5px] leading-[11px] tabular-nums">
                        {h.vedado ? 'V' : v == null ? '' : serieDoHistorico === 'kg' ? valorDaBarra(v) : formatNum(v, 1)}
                      </span>
                      {h.vedado ? (
                        <div className="h-[6px] w-full rounded-t-[2px] bg-[repeating-linear-gradient(45deg,#9AA3AE_0,#9AA3AE_2px,transparent_2px,transparent_4px)]" />
                      ) : v != null && (
                        <div className="w-full rounded-t-[2px]" style={{ height: Math.max(2, (v / maxDoHistorico) * 50), background: faixa ? COR_DA_FAIXA[faixa] : COR_DA_FAIXA.vazio }} />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-0.5 flex gap-[3px]">
                {hist.map(h => <div key={h.anoMes} className="min-w-0 flex-1 text-center text-[9.5px] leading-[11px] text-[#5A6472]">{mesAbreviado(h.anoMes)}</div>)}
              </div>
              {hist.some(h => h.vedado) && <div className="mt-0.5 text-[9.5px] leading-[12px] text-[#5A6472]">V = vedado no mês</div>}
              </>)}
              {pastoSelecionado.observacoes && (
                <>
                  <div className="mb-0.5 mt-2 text-[9.5px] font-semibold leading-[12px] text-[#4A5361]">Observações</div>
                  <p className="text-[10px] leading-[13px] text-[#1d232b]">{pastoSelecionado.observacoes}</p>
                </>
              )}
              <div className="mb-0.5 mt-2 text-[9.5px] font-semibold leading-[12px] text-[#4A5361]">Satélite (vigor do capim)</div>
              <div className="text-[10px] text-[#5A6472]">Em breve.</div>
            </div>
          </div>
        )}

        {hasGeo && (
          /* fix1 (4): a legenda tem o tamanho do conteúdo, à esquerda, e nunca passa por baixo do painel do pasto.
             MAPA-CONTROLES-01: com os créditos no rodapé (painel fechado), a legenda reserva o lugar MEDIDO deles e nunca os cobre; com
             eles acima da faixa, ela tem a largura toda.
             MAPA-COMPACTO-01: uma linha de 22 px, 9,5 px, quadradinhos de 8 px, padding mínimo, vidro discreto; o título é o nome curto
             da camada (o inteiro no title) */
          <div ref={legendaRef} className={`absolute bottom-3 left-3 z-[500] flex h-[22px] w-fit items-center gap-1.5 overflow-hidden rounded-md border border-white/60 bg-white/[0.8] px-1.5 text-[9.5px] leading-[12px] shadow-[0_1px_4px_rgba(0,0,0,0.18)] backdrop-blur-[6px]`}
            style={{ maxWidth: painelAberto ? 'calc(100% - 284px)' : creditosNoRodape ? `calc(100% - ${FOLGA_DA_LEGENDA_PX + larguraDosCreditos}px)` : 'calc(100% - 24px)' }}
            data-testid="mapa-legenda" title={nomeCamada}>
            <b className="flex-none whitespace-nowrap font-semibold">{nomeCurtoCamada}</b>
            {legenda.map(i => (
              <span key={i.rotulo} className="flex flex-none items-center gap-[3px] whitespace-nowrap">
                <i className="inline-block h-2 w-2 rounded-[2px]" style={{ background: i.cor }} />{i.rotulo}
              </span>
            ))}
            {/* o mês já está no seletor da barra: aqui só a leitura em curso ou o erro */}
            {(erroDoMes || carregandoMes) && (
              <span className="flex-none whitespace-nowrap text-[#4A5361]">
                {erroDoMes ? <span className="text-[#B03A2E]">{erroDoMes}</span> : 'Lendo o mês…'}
              </span>
            )}
          </div>
        )}

        {geoLoading && (
          <div className="absolute inset-0 z-[700] flex items-center justify-center bg-background/50">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {!hasGeo && !geoLoading && (
          <div className="absolute inset-0 z-[700] flex flex-col items-center justify-center gap-2 bg-card">
            <MapPin className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-[11px] text-muted-foreground">Nenhum mapa importado</p>
            <Button size="sm" variant="outline" className="h-[26px] text-[11px]" onClick={onImportar}>
              <Upload className="mr-1 h-3 w-3" /> Importar mapa (KML/KMZ)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
