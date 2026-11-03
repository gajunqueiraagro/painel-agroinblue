import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Link2, Unlink, Pencil, Trash2, CheckCheck, MapPin, Search, Filter,
  X, Save, ChevronDown, ChevronRight, ChevronLeft, Spline, PenTool, Scissors, Merge, LayoutGrid, Tag, Layers, Maximize2, Scan, PenLine, type LucideIcon,
  Landmark,
} from 'lucide-react';
import { casaNoNomeDoPoligono, TIPOS_DE_CONTORNO } from '@/lib/mapa/edicaoDoPoligono';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';
import { trocarLimites, useEnquadramentoDoMapa, type LimitesDaFazenda } from '@/lib/mapa/enquadramentoDoMapa';
import type { Pasto } from '@/hooks/usePastos';
import { CromoDoMapa } from '@/components/mapa-geo/CromoDoMapa';
import { ClassificarPoligono } from '@/components/mapa-geo/ClassificarPoligono';
import { DicaDoMapa } from '@/components/mapa-geo/DicaDoMapa';
import { EstruturaDaArea } from '@/components/mapa-geo/EstruturaDaArea';
import { useInfraestruturas } from '@/hooks/useInfraestruturas';
import { useClassificarPoligono } from '@/hooks/useClassificarPoligono';
import { definicaoDoTipoDeArea, ehTipoDeArea, rotuloDoTipo, type TipoDeArea } from '@/lib/mapa/tiposDeArea';
/* MAPA-DICAS-01 (área): a área do mapa é a do banco, nos quatro lugares (barra, lista, rótulo no mapa, dica) */
import { areaDoMapaHa, dicaDasMedidas, fraseDoCadastro, numHa2, perimetroDoMapaM, rotuloDeAreaVisivel, textoHa1, textoHa2 } from '@/lib/mapa/areaNaValidacao';
/* MAPA-EDITAR-POLIGONO-01 — a edição de polígono é um módulo próprio (hook + barra); aqui só o encaixe */
import { useEdicaoDoPoligono, type ModoDaEdicao } from '@/hooks/useEdicaoDoPoligono';
import { BarraDeEdicaoDoPoligono, DesfazerUltimaEdicao } from '@/components/mapa-geo/BarraDeEdicaoDoPoligono';
import { CriarPiquetesNoMapa } from '@/components/mapa-geo/CriarPiquetes';
import { useCriarPiquetes } from '@/hooks/useCriarPiquetes';
import { toast } from 'sonner';
import { useFazenda } from '@/contexts/FazendaContext';
/* MAPA-PIQUETES-02 — os piquetes são um módulo próprio (espera + prévia + gravar); aqui só o encaixe */
import { ConcluirPiquetesDialog, MarcarPiquete, PiquetesEmEspera } from '@/components/mapa-geo/PiquetesDoPoligono';
import { usePiquetesEmEspera } from '@/hooks/usePiquetes';
import { pastosMudaramPorFora } from '@/hooks/usePastos';
import type { PiqueteEmEspera } from '@/lib/mapa/piquetesEmEspera';

const CHAVE_LISTA_RECOLHIDA = 'mapa-validacao-lista-recolhida';

type FilterStatus = 'all' | 'vinculado' | 'area' | 'sem_vinculo';

/* MAPA-ZOOM-E-PAINEL-01: a barra do polígono é de ÍCONES (o texto vai no `title`/`aria-label`); o Apagar fica separado, à direita */
const GESTOS: ReadonlyArray<[ModoDaEdicao, string, LucideIcon]> = [
  ['vertices', 'Vértices', Spline], ['redesenhar', 'Redesenhar', PenTool], ['dividir', 'Dividir', Scissors], ['unir', 'Unir', Merge],
];

/* MAPA-DICAS-01: a frase de cada ícone da barra (o que o botão faz de fato: `edicao.iniciar(modo)`; o Unir abre a união com os vizinhos
   que se marcam no mapa; o Dividir é o corte avulso — o piquete é o botão "Piquetes") */
const FRASE_DO_GESTO: Partial<Record<ModoDaEdicao, string>> = {
  vertices: 'Ajustar o contorno: arraste os pontos, clique na linha para criar ponto.',
  redesenhar: 'Desenhar este contorno de novo do zero; o pasto continua o mesmo.',
  dividir: 'Cortar este polígono em dois com uma linha (corte avulso, não piquete).',
  unir: 'Juntar este polígono com vizinhos selecionados num só.',
};

interface Props {
  geometrias: FazendaGeometria[];
  pastos: Pasto[];
  geoLoading: boolean;
  onUpdate: (id: string, updates: { nome_original?: string; pasto_id?: string | null }) => Promise<boolean>;
  onDelete: (ids: string[]) => Promise<boolean>;
  onRefresh: () => void;
  /** @deprecated MAPA-AREA-TIPO-01: o vínculo vai pelo escritor do banco (ClassificarPoligono); a prop fica opcional só para quem ainda a passa */
  onLink?: (geoId: string, pastoId: string | null) => Promise<boolean>;
  /** MAPA-AREA-TIPO-01: o tipo pedido pelo Adicionar › Área — o próximo polígono escolhido abre "É área" com ele */
  tipoPedido?: TipoDeArea | null;
  onTipoPedidoUsado?: () => void;
  /** MAPA-AREA-TIPOS-02: abre o Gestor com o painel da infraestrutura (a ficha e o Patrimônio da estrutura com valor) */
  onAbrirInfraNoGestor?: (infraId: string) => void;
  /** MAPA-AREA-TIPOS-02: como o pedido abre — "desenhar" (padrão, Adicionar › Área) ou "escolher" (a infraestrutura de área existente) */
  modoInicialDoPedido?: 'desenhar' | 'escolher';
}

/* MAPA-AREA-TIPO-01 (Gabriel 01/11): o vínculo e o tipo de área saem do UPDATE direto e vão pelo escritor do banco
   (`fn_mapa_geometria_classificar`: prévia, trilha e a memória que o "Atualizar mapa" respeita), no painel do polígono. */
export function ValidacaoPoligonosView({ geometrias, pastos, geoLoading, onUpdate, onDelete, onRefresh, tipoPedido, onTipoPedidoUsado, onAbrirInfraNoGestor, modoInicialDoPedido }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [classificandoId, setClassificandoId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; label: string } | null>(null);
  const [saving, setSaving] = useState(false);

  /* MAPA-02b (D1): o mapa nasce pelo hook da casa (o fundo, os créditos e o zoom são os mesmos do Gestor e da Operação); antes ela
     criava o próprio `L.map` com o OpenStreetMap fixo. */
  const { mapContainerRef: mapRef, mapInstanceRef: mapInstance, featureLayerRef: layerRef, status: statusDoMapa } =
    useStableLeafletMap({ debugName: 'ValidacaoPoligonos' });
  const boundsMap = useRef<Map<string, L.LatLngBounds>>(new Map());
  /* MAPA-DICAS-01 (área): os rótulos do mapa (nome + a linha da área, que só aparece com zoom e tamanho que comportem) */
  const rotulosRef = useRef<Map<string, { marker: L.Marker; nome: string; area: string | null; comArea: boolean; bounds: L.LatLngBounds }>>(new Map());
  const iconeDoRotulo = (nome: string, area: string | null, comArea: boolean) => L.divIcon({
    className: 'pasto-label', iconSize: [0, 0],
    html: `<div style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;text-align:center;line-height:1.1">`
      + `<span style="display:block;font-size:9px;font-weight:600;color:hsl(222,47%,11%);text-shadow:0 0 3px white,0 0 3px white;">${nome}</span>`
      + (comArea && area ? `<span data-testid="rotulo-area" style="display:block;font-size:8px;font-weight:500;font-variant-numeric:tabular-nums;color:hsl(222,30%,25%);text-shadow:0 0 3px white,0 0 3px white;">${area}</span>` : '')
      + `</div>`,
  });
  const atualizarRotulosDeArea = useCallback(() => {
    const map = mapInstance.current;
    if (!map || !map.getPane('mapPane')) return;
    const zoom = map.getZoom();
    rotulosRef.current.forEach((r) => {
      let visivel = false;
      if (r.area) {
        const sw = map.latLngToContainerPoint(r.bounds.getSouthWest()), ne = map.latLngToContainerPoint(r.bounds.getNorthEast());
        visivel = rotuloDeAreaVisivel(Math.abs(ne.x - sw.x), Math.abs(sw.y - ne.y), zoom, r.area);
      }
      if (visivel !== r.comArea) { r.comArea = visivel; r.marker.setIcon(iconeDoRotulo(r.nome, r.area, visivel)); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInstance]);
  /* MAPA-ZOOM-ENTRE-VISOES-01 (era o -07: "a tela pula para a fazenda toda"): o mapa só se enquadra SOZINHO na troca de fazenda e na 1ª
     abertura dela; nas demais volta ao enquadramento guardado (`useEnquadramentoDoMapa`, o mesmo do Gestor e da Operação). */
  const [limitesDaFazenda, setLimitesDaFazenda] = useState<LimitesDaFazenda | null>(null);
  const { fazendaAtual } = useFazenda();
  const { verFazendaInteira: enquadrarFazenda, enquadrarPoligono, enquadrarEm } = useEnquadramentoDoMapa({
    mapa: statusDoMapa === 'ready' ? mapInstance.current : null,
    clienteId: fazendaAtual?.cliente_id, fazendaId: fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null,
    limitesDaFazenda, opcoesDoAjuste: { padding: [30, 30], maxZoom: 17 },
  });
  /* MAPA-DICAS-01 (área): o polígono recém-CRIADO (desenhar, dividir, unir…) abre selecionado: o id vem da gravação e a seleção espera o
     recarregamento trazê-lo */
  const [aSelecionar, setASelecionar] = useState<string | null>(null);
  /* MAPA-AREA-TIPOS-02 (Gabriel 02/11 15:54): o pedido do Adicionar › Área oferece "Desenhar nova" (padrão) e "Escolher existente". O tipo do
     desenho em curso fica num ref: o polígono que a gravação do desenho criar é classificado com ele pelo escritor de sempre
     (`fn_mapa_geometria_classificar`) — se a classificação recusar, o polígono novo fica selecionado com o Classificar aberto no tipo pedido. */
  const [modoDoPedido, setModoDoPedido] = useState<'desenhar' | 'escolher'>(modoInicialDoPedido ?? 'desenhar');
  useEffect(() => { setModoDoPedido(modoInicialDoPedido ?? 'desenhar'); }, [tipoPedido, modoInicialDoPedido]);
  const desenhoDoPedidoRef = useRef<TipoDeArea | null>(null);
  const { gravar: classificarCriado } = useClassificarPoligono();
  const aoMudarGeometrias = useCallback((criadoId?: string) => {
    if (criadoId) setASelecionar(criadoId);
    const tipo = desenhoDoPedidoRef.current;
    desenhoDoPedidoRef.current = null;
    if (criadoId && tipo) {
      void classificarCriado(criadoId, { tipo }, 'desenhado pelo Adicionar › Área').then(r => {
        if (r.ok) onTipoPedidoUsado?.();
        else { console.error('[validacao] classificar o desenhado', r.motivo); setModoDoPedido('escolher'); }
        onRefresh();
      });
      return;
    }
    onRefresh();
  }, [onRefresh, classificarCriado, onTipoPedidoUsado]);
  useEffect(() => {
    if (aSelecionar && geometrias.some(g => g.id === aSelecionar)) { setFocusedId(aSelecionar); setASelecionar(null); }
  }, [aSelecionar, geometrias]);
  /* MAPA-AREA-TIPOS-02 (D3): as infraestruturas da fazenda, para saber qual estrutura com valor já virou infraestrutura */
  const { infras, estruturaDaArea, recarregar: recarregarInfras } = useInfraestruturas(fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.id : undefined);
  const edicao = useEdicaoDoPoligono({
    mapa: statusDoMapa === 'ready' ? mapInstance.current : null,
    fazendaId: fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null,
    geometrias, aoMudar: aoMudarGeometrias,
    clienteId: fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.cliente_id : null,
    /* -09: o polígono selecionado também mostra os metros dos lados */
    selecionado: focusedId ? geometrias.find(g => g.id === focusedId)?.geojson ?? null : null,
  });
  /* MAPA-CRIAR-PIQUETES-01 (fatia 1): o "Criar piquetes" do polígono ligado a um pasto — camadas próprias no mesmo mapa; grava pela
     `fn_piquetes_criar` (pastos novos, ou liga às divisões que o pasto já tem no cadastro); o contorno do pai fica */
  const piq = useCriarPiquetes({
    mapa: statusDoMapa === 'ready' ? mapInstance.current : null, pastos, geometrias,
    clienteId: fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.cliente_id : null,
    enquadrar: enquadrarEm, // MAPA-ZOOM-E-PAINEL-01: o enquadramento ao abrir os piquetes passa pelo módulo único
    aoGravar: () => {
      onRefresh();
      if (fazendaAtual?.cliente_id) pastosMudaramPorFora(fazendaAtual.cliente_id);
      toast.success('Piquetes gravados.');
    },
  });
  /* o polígono em edição sai do desenho da lista (a barra o desenha na camada dela); no apagar ele fica à vista */
  const emEdicaoId = edicao.alvo && edicao.modo !== 'apagar' ? edicao.alvo.id : null;
  /* durante a edição os polígonos da lista não respondem a clique: o clique é do desenho (senão focava o vizinho e dava zoom nele) */
  const editando = !!edicao.modo || piq.aberto;
  /* -04: no unir, o clique no mapa põe/tira o polígono da união (os outros gestos seguem com o mapa inerte: o clique é do desenho) */
  const unindo = edicao.modo === 'unir';
  const { unidos, alternarNaUniao } = edicao;
  /* MAPA-EDITAR-POLIGONO-02 (item 1): na edição o MAPA ganha a tela — a lista recolhe numa faixa de 24 px (dá para reabrir); ao sair da
     edição volta como estava. Mudou a largura do mapa = o Leaflet relê o tamanho e o polígono volta ao meio. */
  const [listaReaberta, setListaReaberta] = useState(false);
  /* MAPA-EDITAR-POLIGONO-02b (Gabriel 14:19, Pureza: "aba tão grande e o mapa tão pequeno"): fora da edição a lista também recolhe, e a
     escolha fica lembrada na sessão; na edição ela recolhe sempre (dá para reabrir) e volta ao que estava ao sair */
  const [recolhidaFora, setRecolhidaForaEstado] = useState<boolean>(() => {
    try { return sessionStorage.getItem(CHAVE_LISTA_RECOLHIDA) === '1'; } catch { return false; }
  });
  const setRecolhidaFora = (v: boolean) => {
    setRecolhidaForaEstado(v);
    try { sessionStorage.setItem(CHAVE_LISTA_RECOLHIDA, v ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta tela */ }
  };
  const listaRecolhida = editando ? !listaReaberta : recolhidaFora;
  const recolherLista = () => (editando ? setListaReaberta(false) : setRecolhidaFora(true));
  const abrirLista = () => (editando ? setListaReaberta(true) : setRecolhidaFora(false));
  useEffect(() => { if (!editando) setListaReaberta(false); }, [editando]);
  const { reenquadrar } = edicao;
  useEffect(() => {
    const t = setTimeout(() => reenquadrar(), 60);
    return () => clearTimeout(t);
  }, [listaRecolhida, reenquadrar]);
  const [motivoDoLote, setMotivoDoLote] = useState('');
  /* MAPA-PIQUETES-02 — a espera (nada grava) e o diálogo do "Concluir piquetes de <pasto>" */
  const piquetes = usePiquetesEmEspera();
  const [concluindo, setConcluindo] = useState<{ paiId: string; lista: PiqueteEmEspera[] } | null>(null);
  const [recusasDoLote, setRecusasDoLote] = useState<string | null>(null);

  // Filter & search
  const filtered = useMemo(() => {
    let list = [...geometrias];
    if (filterStatus === 'vinculado') list = list.filter(g => g.pasto_id);
    if (filterStatus === 'area') list = list.filter(g => ehTipoDeArea(g.tipo) || g.tipo === 'area_total');
    if (filterStatus === 'sem_vinculo') list = list.filter(g => g.tipo === 'outra');
    if (searchTerm.trim()) {
      /* P134: sem acento, cedilha e maiúscula nos dois lados (`casaNaBusca`, a regra única) */
      list = list.filter(g => casaNoNomeDoPoligono(g.nome_original, searchTerm)); // -04: tolerante (6b = 6B = P6B), sobre o P134
    }
    return list;
  }, [geometrias, filterStatus, searchTerm]);

  /* -04: depois de unir/apagar, os marcados que sumiram saem da seleção (senão "4 selecionados" e "Unir (4)" seguiam com ids mortos) */
  useEffect(() => {
    setSelectedIds(prev => {
      const vivos = new Set(geometrias.map(g => g.id));
      const ficam = [...prev].filter(id => vivos.has(id));
      return ficam.length === prev.size ? prev : new Set(ficam);
    });
  }, [geometrias]);

  const stats = useMemo(() => ({
    total: geometrias.length,
    vinculados: geometrias.filter(g => g.pasto_id).length,
    areas: geometrias.filter(g => ehTipoDeArea(g.tipo) || g.tipo === 'area_total').length,
    semVinculo: geometrias.filter(g => g.tipo === 'outra').length,
  }), [geometrias]);

  // Draw polygons
  useEffect(() => {
    const map = mapInstance.current;
    const lg = layerRef.current;
    if (!map || !lg) return;
    const timer = setTimeout(() => {
      map.invalidateSize();
      lg.clearLayers();
      boundsMap.current.clear();
      rotulosRef.current.clear();
      if (geometrias.length === 0) return;
      const allBounds: L.LatLngBounds[] = [];
      geometrias.forEach((geo) => {
        if (geo.id === emEdicaoId) return;
        try {
          const isFocused = focusedId === geo.id;
          const isChecked = selectedIds.has(geo.id) || unidos.includes(geo.id);
          const layer = L.geoJSON(geo.geojson as any, {
            interactive: !editando || unindo,
            /* -02 (item 4a): o contorno da fazenda nunca é ponto de encaixe na edição */
            snapIgnore: TIPOS_DE_CONTORNO.includes(geo.tipo),
            style: {
              /* MAPA-ZOOM-E-PAINEL-01: o gate acha o polígono selecionado por esta classe do `path` */
              className: isFocused ? 'poligono-selecionado' : undefined,
              color: isFocused ? 'hsl(213, 80%, 40%)' : isChecked ? 'hsl(45, 70%, 45%)' : geo.pasto_id ? 'hsl(213, 48%, 32%)' : 'hsl(220, 8%, 50%)',
              weight: isFocused ? 3 : isChecked ? 2.5 : 1.2,
              fillColor: isFocused ? 'hsl(213, 70%, 50%)' : isChecked ? 'hsl(45, 80%, 60%)' : geo.pasto_id ? 'hsl(213, 50%, 58%)' : 'hsl(220, 8%, 72%)',
              fillOpacity: isFocused ? 0.5 : isChecked ? 0.4 : 0.22,
            },
          });
          const b = layer.getBounds();
          if (!b.isValid()) return;
          boundsMap.current.set(geo.id, b);
          if (geo.nome_original) {
            const center = b.getCenter();
            const ha = areaDoMapaHa(geo.geojson);
            const area = ha != null ? textoHa1(ha) : null;
            const marker = L.marker(center, { icon: iconeDoRotulo(geo.nome_original, area, false), interactive: false }).addTo(lg);
            rotulosRef.current.set(geo.id, { marker, nome: geo.nome_original, area, comArea: false, bounds: b });
          }
          if (!editando) layer.on('click', () => setFocusedId(geo.id));
          else if (unindo) layer.on('click', () => alternarNaUniao(geo.id));
          layer.addTo(lg);
          allBounds.push(b);
        } catch {}
      });
      atualizarRotulosDeArea();
      /* MAPA-ZOOM-ENTRE-VISOES-01: o desenho só entrega os limites ao hook (nunca enquadra) */
      const fazendaDaVista = geometrias[0]?.fazenda_id;
      if (allBounds.length > 0 && !emEdicaoId && fazendaDaVista) {
        const combined = L.latLngBounds(allBounds[0].getSouthWest(), allBounds[0].getNorthEast());
        for (const b of allBounds) combined.extend(b);
        setLimitesDaFazenda(ant => trocarLimites(ant, fazendaDaVista, combined));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [geometrias, focusedId, selectedIds, statusDoMapa, emEdicaoId, editando, unindo, unidos, alternarNaUniao, atualizarRotulosDeArea]);

  /* MAPA-DICAS-01 (área): a linha da área do rótulo some no zoom afastado e reaparece no aproximado (a mesma ideia dos metros dos lados) */
  useEffect(() => {
    const map = statusDoMapa === 'ready' ? mapInstance.current : null;
    if (!map) return;
    map.on('zoomend moveend', atualizarRotulosDeArea);
    return () => { map.off('zoomend moveend', atualizarRotulosDeArea); };
  }, [statusDoMapa, mapInstance, atualizarRotulosDeArea]);

  /* MAPA-ZOOM-E-PAINEL-01 ("clique no polígono = pasto inteiro"): SELECIONAR um polígono (no mapa ou na lista) enquadra ele inteiro na área
     visível — descontando a barra do polígono e os botões do topo, com folga e 0,3 s (`enquadrarPoligono`, o mesmo caminho do "Ver fazenda
     inteira"; o `moveend` guarda). NÃO reenquadra: em qualquer edição (gesto, Piquetes), no clique de novo no MESMO polígono (o id não muda,
     o efeito não roda) e ao fechar a barra (`focusedId` nulo). */
  const cartaoDoMapaRef = useRef<HTMLDivElement>(null);
  const boundsDoPoligono = (id: string): L.LatLngBounds | null => {
    const doDesenho = boundsMap.current.get(id);
    if (doDesenho && doDesenho.isValid()) return doDesenho;
    const geo = geometrias.find(g => g.id === id);
    if (!geo) return null;
    try { const b = L.geoJSON(geo.geojson as any).getBounds(); return b.isValid() ? b : null; } catch { return null; }
  };
  const pastoInteiro = () => {
    if (!focusedId) return;
    enquadrarPoligono(boundsDoPoligono(focusedId), cartaoDoMapaRef.current);
  };
  useEffect(() => {
    if (!focusedId || editando) return;
    /* espera a barra do polígono pintar (o padding é a sobreposição REAL) */
    const t = setTimeout(pastoInteiro, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId]);

  /* -07: o enquadramento da fazenda inteira só quando o operador pede */
  const verFazendaInteira = () => {
    const todos = [...boundsMap.current.values()];
    if (todos.length === 0) return;
    enquadrarFazenda(todos.reduce((acc, b) => L.latLngBounds(acc.getSouthWest(), acc.getNorthEast()).extend(b)));
  };

  // Helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(filtered.map(g => g.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const isAllSelected = filtered.length > 0 && filtered.every(g => selectedIds.has(g.id));

  const startEdit = (geo: FazendaGeometria) => {
    setEditingId(geo.id);
    setEditName(geo.nome_original || '');
  };
  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    await onUpdate(editingId, { nome_original: editName });
    setEditingId(null);
    setSaving(false);
  };

  const startLink = (geo: FazendaGeometria) => {
    setFocusedId(geo.id);
    setClassificandoId(geo.id);
  };

  /* D4 (Gabriel 01/11): o "Excluir" virou o APAGAR da edição — motivo, trilha e desfazer, pela fn_geometria_gravar (nunca DELETE direto) */
  const confirmDelete = (ids: string[], label: string) => { setMotivoDoLote(''); setRecusasDoLote(null); setDeleteConfirm({ ids, label }); };
  const executeDelete = async () => {
    if (!deleteConfirm || !motivoDoLote.trim()) return;
    setSaving(true);
    const recusas = await edicao.apagarVarios(deleteConfirm.ids, motivoDoLote);
    if (recusas.length > 0) {
      setRecusasDoLote(recusas.map(r => `${r.nome}: ${r.frase}`).join(' · '));
      setSaving(false);
      return;
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      deleteConfirm.ids.forEach(id => next.delete(id));
      return next;
    });
    setDeleteConfirm(null);
    setSaving(false);
  };

  const getPastoName = (pastoId: string | null) => {
    if (!pastoId) return null;
    return pastos.find(p => p.id === pastoId)?.nome || null;
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Stats bar */}
      <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-[10px] h-5">{stats.total} polígonos</Badge>
        <Badge variant="outline" className="text-[10px] h-5 text-green-700 border-green-300">{stats.vinculados} pastos</Badge>
        <Badge variant="outline" className="text-[10px] h-5">{stats.areas} áreas</Badge>
        <Badge variant="outline" className="text-[10px] h-5 text-orange-700 border-orange-300">{stats.semVinculo} sem classificação</Badge>
        {selectedIds.size > 0 && (
          <Badge variant="default" className="text-[10px] h-5">{selectedIds.size} selecionados</Badge>
        )}
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        {/* Left: list panel */}
        {listaRecolhida ? (
          <Card className="hidden w-6 flex-shrink-0 items-start justify-center overflow-hidden pt-2 sm:flex" data-testid="validacao-lista-recolhida">
            <Button variant="ghost" size="sm" className="h-6 w-5 p-0" onClick={abrirLista} title="Mostrar a lista de polígonos"
              data-testid="validacao-reabrir-lista">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Card>
        ) : (
        <Card className="flex flex-col w-full sm:w-[240px] flex-shrink-0 overflow-hidden" data-testid="validacao-lista">
          <Button variant="ghost" size="sm" className="hidden h-5 justify-start gap-1 rounded-none border-b border-border px-2 text-[9.5px] sm:flex"
            onClick={recolherLista} title="Recolher a lista (o mapa ganha a tela)" data-testid="validacao-recolher-lista">
            <ChevronLeft className="h-3 w-3" />Recolher a lista
          </Button>
          {/* Search + filter bar */}
          <div className="px-2 py-1 border-b border-border space-y-1">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar"
                  className="h-6 pl-7 text-[11px]"
                />
              </div>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
                <SelectTrigger className="h-6 w-[104px] text-[11px]">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="vinculado">Pastos</SelectItem>
                  <SelectItem value="area">Áreas</SelectItem>
                  <SelectItem value="sem_vinculo">Sem classificação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Batch actions */}
            {/* -02b/-04: na lista de 240 px as ações em lote quebram linha em vez de sumir pela direita */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2" onClick={isAllSelected ? deselectAll : selectAll}>
                <CheckCheck className="h-3 w-3 mr-1" />
                {isAllSelected ? 'Desmarcar' : 'Selecionar'} todos
              </Button>
              {selectedIds.size > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                    onClick={() => confirmDelete(Array.from(selectedIds), `${selectedIds.size} polígono(s) selecionado(s)`)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />Apagar ({selectedIds.size})
                  </Button>
                  {selectedIds.size >= 2 && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" data-testid="unir-selecionados"
                      onClick={() => void edicao.iniciarUniao(Array.from(selectedIds))} title="Unir selecionados: os marcados viram um polígono só (o primeiro fica; prévia antes de gravar)">
                      Unir ({selectedIds.size})
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                    onClick={() => {
                      /* MAPA-AREA-TIPO-01: só os SEM CLASSIFICAÇÃO — área classificada (reserva, APP, curral…) não tem pasto e não é lixo */
                      const semVinculo = geometrias.filter(g => g.tipo === 'outra').map(g => g.id);
                      if (semVinculo.length > 0) confirmDelete(semVinculo, `${semVinculo.length} polígono(s) sem classificação`);
                    }}
                  >
                    <Unlink className="h-3 w-3 mr-1" />Apagar sem classificação
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* -09 (Gabriel 17:42, Pureza com 141 polígonos: "compactar mais para aparecer mais linhas") — UMA linha por polígono, numa
              TABELA de largura fixa (a regra de corte da casa: nome longo em tabela corta com "…" e o inteiro no title, nunca empilha):
              [caixa] nome · selo do vínculo (o nome do pasto, "sem vínculo" em laranja ou o tipo da área) · ações em ícones */}
          <div className="flex-1 overflow-y-auto" data-testid="validacao-lista-linhas">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Nenhum polígono encontrado.</div>
            ) : (
              <table className="w-full table-fixed border-collapse text-[11px]">
                <colgroup><col style={{ width: 22 }} /><col /><col style={{ width: 46 }} /><col style={{ width: 72 }} /><col style={{ width: 58 }} /></colgroup>
                <tbody>
                  {filtered.map(geo => {
                    const isFocused = focusedId === geo.id;
                    const pastoName = getPastoName(geo.pasto_id);
                    const isEditing = editingId === geo.id;
                    const selo = pastoName ?? (geo.tipo === 'outra' ? 'sem vínculo' : rotuloDoTipo(geo.tipo));
                    return (
                      <tr key={geo.id} className={`h-8 cursor-pointer border-b border-border ${isFocused ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                        onClick={() => setFocusedId(geo.id)} data-testid="validacao-linha">
                        <td className="pl-2 align-middle">
                          <Checkbox checked={selectedIds.has(geo.id)} onCheckedChange={() => toggleSelect(geo.id)} onClick={e => e.stopPropagation()}
                            className="h-3.5 w-3.5" />
                        </td>
                        {isEditing ? (
                          <td colSpan={4} className="pr-1 align-middle">
                            <div className="flex gap-1">
                              <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-6 flex-1 text-[11px]" autoFocus
                                onClick={e => e.stopPropagation()}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }} />
                              <Button size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); saveEdit(); }} disabled={saving}>
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); setEditingId(null); }}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="truncate pr-1 align-middle font-medium text-foreground" title={geo.nome_original || 'Sem nome'} data-testid="validacao-nome">
                              {geo.nome_original || 'Sem nome'}
                            </td>
                            {/* MAPA-DICAS-01 (área): "ha" à direita do nome — 46 px = "9.999,99" a 10 px tabular (≈ 44), nunca corta */}
                            <td className="whitespace-nowrap pr-1 text-right align-middle text-[10px] tabular-nums text-foreground" data-testid="validacao-area">
                              {(() => { const ha = areaDoMapaHa(geo.geojson); return ha != null ? numHa2(ha) : '—'; })()}
                            </td>
                            <td className={`truncate pr-1 align-middle text-[9.5px] ${pastoName ? 'text-green-700' : geo.tipo === 'outra' ? 'text-orange-600' : 'text-muted-foreground'}`}
                              title={pastoName ? `Pasto → ${pastoName}` : selo} data-testid={pastoName ? 'validacao-selo-pasto' : undefined}>
                              {selo}
                            </td>
                            <td className="pr-1 align-middle">
                              <div className="flex items-center justify-end gap-0">
                                <Button variant="ghost" size="sm" className="h-[18px] w-[18px] p-0 text-muted-foreground hover:text-foreground"
                                  onClick={e => { e.stopPropagation(); startLink(geo); }} title="Classificar (pasto ou área)">
                                  <Link2 className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-[18px] w-[18px] p-0 text-muted-foreground hover:text-foreground"
                                  onClick={e => { e.stopPropagation(); startEdit(geo); }} title="Editar nome">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-[18px] w-[18px] p-0 text-muted-foreground hover:text-destructive"
                                  onClick={e => { e.stopPropagation(); setFocusedId(geo.id); void edicao.iniciar('apagar', geo.id); }}
                                  title="Apagar (com motivo; dá para desfazer)">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* MAPA-PIQUETES-02 — os piquetes em espera, por pasto-pai, com o "Concluir piquetes de <pasto>" */}
          <PiquetesEmEspera espera={piquetes.espera} pastos={pastos} onTirar={piquetes.tirar}
            onConcluir={(paiId, lista) => setConcluindo({ paiId, lista })} />
        </Card>
        )}

        {/* Right: map preview */}
        <Card ref={cartaoDoMapaRef} className="hidden sm:flex flex-1 min-h-0 relative overflow-hidden">
          {/* o `.leaflet-container { position: relative }` do index.css vencia a classe `absolute` e o mapa ficava com largura 0 (achado no
              MAPA-EDITAR-POLIGONO-01): a posição vai no estilo da própria div, sem mexer na regra global */}
          <div ref={mapRef} className="absolute inset-0 rounded-lg" style={{ zIndex: 0, position: 'absolute' }} />
          <BarraDeEdicaoDoPoligono edicao={edicao} geometrias={geometrias} nomeDoPasto={getPastoName}
            areaCadastroHa={pastos.find(p => p.id === edicao.alvo?.pasto_id)?.area_produtiva_ha ?? null} />
          {!piq.aberto && <DesfazerUltimaEdicao edicao={edicao} />}
          <CriarPiquetesNoMapa piq={piq} />
          {/* MAPA-ZOOM-E-PAINEL-01 (Gabriel 02/11 07:40: "este modal está muito grande, tirando a visão do mapa"): no alto UMA linha — a BARRA
              do polígono (1 linha, ícones, a largura do conteúdo) à esquerda e os botões do mapa à direita; o nome cede ("…" + `title`), os
              botões nunca. O que está marcado `data-sobre-o-mapa` é descontado do enquadramento do "pasto inteiro". */}
          <CromoDoMapa estado={{ editando: !!edicao.modo, piquetesAberto: piq.aberto, pedindoPoligono: !!tipoPedido, selecionado: !!focusedId }}
            rotuloDoPedido={tipoPedido ? rotuloDoTipo(tipoPedido) : null} onCancelarPedido={() => { desenhoDoPedidoRef.current = null; onTipoPedidoUsado?.(); }}
            modoDoPedido={modoDoPedido}
            onDesenharNova={() => {
              if (!tipoPedido) return;
              setModoDoPedido('desenhar');
              desenhoDoPedidoRef.current = tipoPedido;
              void edicao.iniciar('desenhar', null).then(() => edicao.setNomeNovo(rotuloDoTipo(tipoPedido)));
            }}
            onEscolherExistente={() => { desenhoDoPedidoRef.current = null; setModoDoPedido('escolher'); }}
            painel={focusedId ? (() => {
              const geo = geometrias.find(g => g.id === focusedId);
              if (!geo) return <span />;
              const pName = getPastoName(geo.pasto_id);
              const nome = geo.nome_original || 'Sem nome';
              const sub = pName ? `Pasto → ${pName}` : rotuloDoTipo(geo.tipo);
              const classificando = classificandoId === geo.id || (!!tipoPedido && classificandoId === null);
              const fecharClassificar = () => { setClassificandoId(null); onTipoPedidoUsado?.(); };
              const naEspera = piquetes.espera.some(x => x.geometriaId === geo.id);
              const icone = 'h-6 w-6 flex-none p-0 text-muted-foreground hover:text-foreground';
              const haDoMapa = areaDoMapaHa(geo.geojson);
              const cadastroHa = pastos.find(p => p.id === geo.pasto_id)?.area_produtiva_ha ?? null;
              const fraseCadastro = fraseDoCadastro(haDoMapa, cadastroHa);
              return (
                <div className="pointer-events-auto flex h-8 min-w-0 items-center gap-0.5 rounded-md border border-border bg-card/95 px-1.5 text-[10px] shadow-sm backdrop-blur-sm"
                  data-testid="validacao-painel-poligono" data-sobre-o-mapa>
                  {/* MAPA-DICAS-01 (área): o nome cede ("…" e o inteiro na dica); a área e o cadastro são números e nunca cortam; o perímetro vai na dica */}
                  <DicaDoMapa nome={nome} frase={`${sub}. ${dicaDasMedidas(perimetroDoMapaM(geo.geojson), haDoMapa, cadastroHa)}`}>
                    <span tabIndex={0} aria-label={`${nome} · ${sub}`} className="min-w-0 max-w-[260px] flex-initial truncate pr-1 font-semibold text-foreground" data-testid="validacao-painel-nome">
                      {nome}<span className="font-normal text-muted-foreground"> · {sub}</span>
                    </span>
                  </DicaDoMapa>
                  <span className="flex-none whitespace-nowrap pr-1 font-semibold tabular-nums text-foreground" data-testid="validacao-painel-area">
                    {haDoMapa != null ? textoHa2(haDoMapa) : '— ha'}
                    {fraseCadastro && <span className="font-normal text-muted-foreground" data-testid="validacao-painel-cadastro"> · {fraseCadastro}</span>}
                  </span>
                  {/* MAPA-EDITAR-POLIGONO-01 — os gestos da edição; o "É pasto / É área" é do Code 6 */}
                  <div className="flex flex-none items-center gap-0.5" data-testid="editar-poligono">
                    {GESTOS.map(([m, rotulo, Icone]) => (
                      <DicaDoMapa key={m} nome={rotulo} frase={FRASE_DO_GESTO[m] ?? rotulo}>
                        <Button variant="ghost" size="sm" className={icone} aria-label={rotulo} onClick={() => void edicao.iniciar(m, geo.id)}>
                          <Icone className="h-3.5 w-3.5" />
                        </Button>
                      </DicaDoMapa>
                    ))}
                    {/* MAPA-CRIAR-PIQUETES-01: só no polígono ligado a um pasto (o pasto vira o pai das divisões) */}
                    {geo.pasto_id && (
                      <DicaDoMapa nome="Piquetes" frase="Criar as divisões (piquetes) dentro deste pasto.">
                        <Button variant="ghost" size="sm" className={icone} data-testid="editar-piquetes" aria-label="Piquetes"
                          onClick={() => { if (geo.pasto_id) piq.abrir({ geometriaId: geo.id, pastoId: geo.pasto_id, nome: pName ?? geo.nome_original, geojson: geo.geojson }); }}>
                          <LayoutGrid className="h-3.5 w-3.5" />
                        </Button>
                      </DicaDoMapa>
                    )}
                  </div>
                  <div className="flex flex-none items-center gap-0.5 border-l border-border pl-0.5" data-testid="validacao-gestos">
                    {/* Classificar e "É piquete de…" abrem um popover pequeno no ícone: a barra não cresce */}
                    <Popover open={classificando} onOpenChange={(v) => { if (v) setClassificandoId(geo.id); else fecharClassificar(); }}>
                      <DicaDoMapa nome="Classificar" frase="Dizer o que é: pasto, piquete de outro pasto ou área (mata, curral, sede…).">
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className={icone} aria-label="Classificar" data-testid="validacao-classificar">
                            <Tag className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                      </DicaDoMapa>
                      <PopoverContent align="start" className="w-[300px] p-2" data-testid="validacao-popover">
                        <ClassificarPoligono key={`${geo.id}-${tipoPedido ?? ''}`} geo={geo} pastos={pastos} geometrias={geometrias} tipoInicial={tipoPedido}
                          onGravou={() => { fecharClassificar(); setFocusedId(geo.id); onRefresh(); }} onFechar={fecharClassificar} />
                      </PopoverContent>
                    </Popover>
                    {/* MAPA-AREA-TIPOS-02 (D3): a estrutura com valor (armazém, curral, sede…) vira infraestrutura; a ficha e o bem são os do
                        painel da infraestrutura — um ícone a mais na barra, só nesses tipos */}
                    {definicaoDoTipoDeArea(geo.tipo)?.infra && (
                      <Popover key={`patr-${geo.id}`}>
                        <DicaDoMapa nome="Patrimônio" frase="Esta estrutura tem valor: vira infraestrutura (com ficha) e o bem nasce pelo mesmo caminho das fichas.">
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className={icone} aria-label="Patrimônio" data-testid="validacao-patrimonio">
                              <Landmark className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                        </DicaDoMapa>
                        <PopoverContent align="start" className="w-[300px] p-2" data-testid="validacao-popover">
                          <EstruturaDaArea geometriaId={geo.id} tipoDaArea={geo.tipo} infras={infras} estruturaDaArea={estruturaDaArea}
                            onCriou={recarregarInfras} onAbrirNoGestor={onAbrirInfraNoGestor} />
                        </PopoverContent>
                      </Popover>
                    )}
                    {/* MAPA-PIQUETES-02 — "É piquete de…": o polígono fica EM ESPERA; o "Concluir" mora no rodapé da lista */}
                    {!geo.pasto_id && (
                      <Popover key={geo.id}>
                        <DicaDoMapa nome={naEspera ? 'É piquete de… (em espera)' : 'É piquete de…'}
                          frase={naEspera ? 'Este desenho já espera como piquete de um pasto; aqui você troca o pasto ou tira da espera.' : 'Dizer que este desenho é um piquete de um pasto; ele espera até você concluir os piquetes desse pasto.'}>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className={`${icone} ${naEspera ? 'text-[#a15c00]' : ''}`}
                              aria-label="É piquete de…" data-testid="validacao-piquete-de">
                              <Layers className="h-3.5 w-3.5" />
                            </Button>
                          </PopoverTrigger>
                        </DicaDoMapa>
                        <PopoverContent align="start" className="w-[300px] p-2" data-testid="validacao-popover">
                          <MarcarPiquete poligono={geo} pastos={pastos} espera={piquetes.espera} onMarcar={piquetes.marcar} onTirar={piquetes.tirar} />
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  <div className="flex flex-none items-center gap-0.5 border-l border-border pl-0.5">
                    <DicaDoMapa nome="Apagar" frase="Tirar este desenho do mapa. Fica na trilha e dá para desfazer.">
                      <Button variant="ghost" size="sm" className="h-6 w-6 flex-none p-0 text-destructive hover:text-destructive"
                        aria-label="Apagar" data-testid="editar-apagar" onClick={() => void edicao.iniciar('apagar', geo.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </DicaDoMapa>
                    <DicaDoMapa nome="Fechar" frase="Fechar o painel sem mudar nada.">
                      <Button variant="ghost" size="sm" className={icone} aria-label="Fechar" data-testid="validacao-painel-fechar" onClick={() => { setFocusedId(null); setClassificandoId(null); }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </DicaDoMapa>
                  </div>
                </div>
              );
            })() : null}
            botoes={
              <div className="pointer-events-auto flex flex-none gap-1.5" data-sobre-o-mapa data-testid="validacao-botoes-topo">
                {/* MAPA-CROMO-01: com um polígono selecionado a barra dele divide a linha — os botões viram ÍCONES (title/aria-label com o
                    texto) para o nome do polígono caber inteiro (a 1126 ele saía com "…") */}
                <DicaDoMapa nome="Ver fazenda inteira" frase="Afastar o mapa para mostrar todos os desenhos da fazenda.">
                  <Button variant="outline" size="sm" className={`h-6 bg-card text-[11px] ${focusedId ? 'w-6 p-0' : 'px-2'}`} onClick={verFazendaInteira}
                    data-testid="validacao-ver-fazenda" aria-label="Ver fazenda inteira">
                    {focusedId ? <Maximize2 className="h-3.5 w-3.5" /> : 'Ver fazenda inteira'}
                  </Button>
                </DicaDoMapa>
                {focusedId && (
                  <DicaDoMapa nome="Pasto inteiro" frase="Enquadrar o polígono selecionado na área visível do mapa.">
                    <Button variant="outline" size="sm" className="h-6 w-6 bg-card p-0 text-[11px]" onClick={pastoInteiro} data-testid="validacao-pasto-inteiro"
                      aria-label="Pasto inteiro">
                      <Scan className="h-3.5 w-3.5" />
                    </Button>
                  </DicaDoMapa>
                )}
                <DicaDoMapa nome="Desenhar polígono novo" frase="Riscar no mapa, ponto a ponto, um desenho novo; ele só entra depois da prévia e do gravar.">
                  <Button variant="outline" size="sm" className={`h-6 bg-card text-[11px] ${focusedId ? 'w-6 p-0' : 'px-2'}`}
                    onClick={() => void edicao.iniciar('desenhar', null)} data-testid="edicao-desenhar-novo" aria-label="Desenhar polígono novo">
                    {focusedId ? <PenLine className="h-3.5 w-3.5" /> : 'Desenhar polígono novo'}
                  </Button>
                </DicaDoMapa>
              </div>
            } />
          {geometrias.length === 0 && !edicao.modo && (
            <div className="absolute inset-0 flex items-center justify-center bg-card z-10 rounded-lg">
              <p className="text-sm text-muted-foreground">Nenhum polígono para exibir</p>
            </div>
          )}
        </Card>
      </div>

      {concluindo && (
        <ConcluirPiquetesDialog aberto paiId={concluindo.paiId} piquetes={concluindo.lista}
          nomeDoPai={pastos.find(p => p.id === concluindo.paiId)?.nome ?? 'o pasto'}
          onFechar={() => setConcluindo(null)}
          onGravado={(paiId) => {
            piquetes.concluido(paiId);
            onRefresh();
            if (fazendaAtual?.cliente_id) pastosMudaramPorFora(fazendaAtual.cliente_id);
          }} />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar polígonos</AlertDialogTitle>
            <AlertDialogDescription>
              Apagar {deleteConfirm?.label}? Fica na trilha e dá para desfazer. Polígono ligado a pasto não se apaga em lote: desligue o
              vínculo antes ou apague-o pela edição, escolhendo quem fica com o pasto.
            </AlertDialogDescription>
            <Input value={motivoDoLote} onChange={e => setMotivoDoLote(e.target.value)} placeholder="Motivo (obrigatório)" className="h-7 text-xs"
              data-testid="apagar-lote-motivo" />
            {recusasDoLote && <p className="text-[11px] font-medium text-red-600" data-testid="apagar-lote-recusas">Não apagados: {recusasDoLote}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(ev) => { ev.preventDefault(); void executeDelete(); }} disabled={saving || !motivoDoLote.trim()}
              title={motivoDoLote.trim() ? undefined : 'Diga o motivo'} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {saving ? 'Apagando...' : 'Apagar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
