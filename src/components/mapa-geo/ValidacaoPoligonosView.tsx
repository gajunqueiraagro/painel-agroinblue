import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TextoReservado } from '@/components/ui/regua-tabela';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Link2, Pencil, Trash2, CheckCheck, MapPin, Search, Filter,
  X, Save, ChevronDown, ChevronRight, ChevronLeft, Spline, PenTool, Scissors, Merge, LayoutGrid, Tag, Layers, Maximize2, Scan, PenLine, Move, Combine, Undo2, type LucideIcon,
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
import {
  areaDoMapaHa, dicaDasMedidas, ehRotuloDePraca, etiquetaDoVinculo, fraseDoCadastro, numHa2, perimetroDoMapaM, pracasEscondidas, rotuloDeAreaVisivel, textoHa1, textoHa2,
  type CaixaDoRotulo,
} from '@/lib/mapa/areaNaValidacao';
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
/* MAPA-CRIAR-PIQUETES-01 (2b, o caminho de volta): Mover linha · Juntar com… · Desfazer piquetes — diálogos de prévia com mini-mapa */
import { DesfazerPiquetesDialog, EscolherVizinhaParaJuntar, JuntarDialog, MoverLinhaDialog } from '@/components/mapa-geo/PiquetesVolta';
import { grupoDaDivisao, grupoDoPai, irmasQueEncostam, uniaoDasDuas } from '@/lib/mapa/piquetesVolta';
/* MAPA-PIQUETES-04 — o contorno do pai só pega o clique na borda (as divisões, no miolo) */
import { contornosDePai } from '@/lib/mapa/unidadesDoMapa';
import { useGruposComOrigem } from '@/hooks/useGruposComOrigem';
import { contornoDasDivisoes } from '@/lib/mapa/contornoDasDivisoes';
import { avisoSemDesenho, pastosSemDesenho } from '@/lib/mapa/unidadesDoMapa';

const CHAVE_LISTA_RECOLHIDA = 'mapa-validacao-lista-recolhida';

/* MAPA-LISTA-SEM-PULO-01: o motivo de cada botão da faixa de ações estar inativo (vai no `title`) */
const MOTIVO_UNIR = 'Marque pelo menos 2 polígonos para unir';
const MOTIVO_APAGAR = 'Marque polígonos para apagar';
const MOTIVO_SEM_CLASSIFICACAO = 'Nenhum polígono sem classificação para apagar';

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
  const rotulosRef = useRef<Map<string, { marker: L.Marker; nome: string; area: string | null; comArea: boolean; bounds: L.LatLngBounds; praca: boolean; pasto: boolean }>>(new Map());
  /* MAPA-LISTA-COMPACTA-01: o rótulo de praça é menor (8 px) e cinza */
  const iconeDoRotulo = (nome: string, area: string | null, comArea: boolean, praca = false) => L.divIcon({
    className: 'pasto-label', iconSize: [0, 0],
    html: `<div style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;text-align:center;line-height:1.1">`
      + (praca
        ? `<span data-rotulo-praca="1" style="display:block;font-size:8px;font-weight:500;color:hsl(220,8%,42%);text-shadow:0 0 3px white,0 0 3px white;">${nome}</span>`
        : `<span style="display:block;font-size:9px;font-weight:600;color:hsl(222,47%,11%);text-shadow:0 0 3px white,0 0 3px white;">${nome}</span>`)
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
      if (visivel !== r.comArea) { r.comArea = visivel; r.marker.setIcon(iconeDoRotulo(r.nome, r.area, visivel, r.praca)); }
    });
    /* MAPA-LISTA-COMPACTA-01: o rótulo da praça que encosta no de um pasto não é desenhado (o pasto vence) — medido na tela a cada zoom/arraste */
    const caixa = (id: string, el: HTMLElement | null | undefined): CaixaDoRotulo[] => {
      const s = el?.querySelector('span'); if (!s) return [];
      const r = s.getBoundingClientRect(); return r.width > 0 ? [{ id, left: r.left, top: r.top, right: r.right, bottom: r.bottom }] : [];
    };
    const todos = [...rotulosRef.current.entries()];
    todos.forEach(([, r]) => { const el = r.marker.getElement(); if (r.praca && el) el.style.visibility = ''; });
    const esconder = pracasEscondidas(
      todos.flatMap(([id, r]) => (r.praca ? caixa(id, r.marker.getElement()) : [])),
      todos.flatMap(([id, r]) => (r.pasto ? caixa(id, r.marker.getElement()) : [])));
    todos.forEach(([id, r]) => { const el = r.marker.getElement(); if (el && esconder.has(id)) el.style.visibility = 'hidden'; });
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
  /* MAPA-CRIAR-PIQUETES-01 (2b): quem é divisão de um grupo (o pasto está num grupo que nasceu de outro) e quem é o PAI (`pasto_origem_id`) —
     é por isso que "Mover linha"/"Juntar com…" e "Desfazer piquetes" só aparecem onde se aplicam. A leitura se refaz depois de gravar. */
  const [tiqueDosGrupos, setTiqueDosGrupos] = useState(0);
  const idsDaFazenda = useMemo(() => (fazendaAtual && fazendaAtual.id !== '__global__' ? [fazendaAtual.id] : []), [fazendaAtual]);
  const { grupos } = useGruposComOrigem(idsDaFazenda, tiqueDosGrupos);
  const grupoDoFoco = useMemo(() => {
    const g = focusedId ? geometrias.find(x => x.id === focusedId) : null;
    return g ? grupoDaDivisao(g.pasto_id, pastos, grupos) : null;
  }, [focusedId, geometrias, pastos, grupos]);
  /* as irmãs do mesmo grupo que encostam no polígono selecionado: candidatas do "Juntar com…" (e o único lugar da linha que se move) */
  const irmasDoFoco = useMemo(() => {
    const g = focusedId ? geometrias.find(x => x.id === focusedId) : null;
    return g && grupoDoFoco ? irmasQueEncostam(g, grupoDoFoco, pastos, geometrias) : [];
  }, [focusedId, geometrias, grupoDoFoco, pastos]);
  const divisoesDaLinha = useMemo(() => {
    if (!grupoDoFoco) return null;
    const doGrupo = new Set(pastos.filter(p => p.grupo_id === grupoDoFoco.id).map(p => p.id));
    return new Set(geometrias.filter(x => x.pasto_id && doGrupo.has(x.pasto_id)).map(x => x.id));
  }, [grupoDoFoco, pastos, geometrias]);
  const [juntandoDe, setJuntandoDe] = useState<string | null>(null);
  const [juntarRecusa, setJuntarRecusa] = useState<string | null>(null);
  const [juntando, setJuntando] = useState<{ fica: FazendaGeometria; sai: FazendaGeometria; uniao: GeoJSON.Polygon } | null>(null);
  const [desfazendo, setDesfazendo] = useState<{ grupoId: string; paiPastoId: string } | null>(null);
  /* MAPA-PIQUETES-MANUAL-01 (4): os polígonos que são divisões de um grupo ativo com origem (o desenho sobre eles nasce recortando) */
  const poligonosDePiquetes = useMemo(() => {
    const pastosEmGrupo = new Set(pastos.filter(p => p.grupo_id && grupos.some(g => g.id === p.grupo_id && g.ativo)).map(p => p.id));
    return new Set(geometrias.filter(x => x.pasto_id && pastosEmGrupo.has(x.pasto_id)).map(x => x.id));
  }, [pastos, grupos, geometrias]);
  /* MAPA-AREA-TIPOS-02 (D3): as infraestruturas da fazenda, para saber qual estrutura com valor já virou infraestrutura */
  const { infras, estruturaDaArea, recarregar: recarregarInfras } = useInfraestruturas(fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.id : undefined);
  const edicao = useEdicaoDoPoligono({
    divisoesDaLinha, piquetes: poligonosDePiquetes,
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

  /* MAPA-CRIAR-PIQUETES-01 (2b) — "Juntar com…": a escolhida (no mapa ou na lista) é quem SAI; a selecionada FICA (D6 a: A absorve B). A união sai
     da MESMA `unirVarios` do Concluir piquetes e tem de dar UM polígono; senão a frase fica no popover (nunca toast). */
  const escolherParaJuntar = (saiGeoId: string) => {
    const fica = geometrias.find(g => g.id === focusedId);
    const sai = geometrias.find(g => g.id === saiGeoId);
    if (!fica || !sai) return;
    const r = uniaoDasDuas({ id: fica.id, nome: fica.nome_original, geojson: fica.geojson }, { id: sai.id, nome: sai.nome_original, geojson: sai.geojson });
    if ('motivo' in r) { setJuntarRecusa(r.motivo); return; }
    setJuntarRecusa(null); setJuntandoDe(null);
    setJuntando({ fica, sai, uniao: r.valor });
  };
  const escolherParaJuntarRef = useRef(escolherParaJuntar);
  escolherParaJuntarRef.current = escolherParaJuntar;
  /* trocou o polígono selecionado: a escolha da vizinha e a frase dela não valem mais */
  useEffect(() => { setJuntandoDe(null); setJuntarRecusa(null); }, [focusedId]);
  const desenhosPorId = useMemo(() => new Map(geometrias.map(g => [g.id, g.geojson])), [geometrias]);
  const candidatasAJuntar = useMemo(() => (juntandoDe ? new Set(irmasDoFoco.map(i => i.id)) : new Set<string>()), [juntandoDe, irmasDoFoco]);
  const depoisDeMexerNosPastos = () => {
    onRefresh();
    setTiqueDosGrupos(t => t + 1);
    if (fazendaAtual?.cliente_id) pastosMudaramPorFora(fazendaAtual.cliente_id);
  };
  /* MAPA-PIQUETES-04 (Gabriel 02/11 10:40, Sta. Rita: "não dá para clicar em 20A-1-A pois o 20A-1 fica por cima"): o contorno de um pai
     com divisão desenhada vai POR CIMA e só com a linha (sem preenchimento, o clique pega só na borda); as divisões vão por baixo,
     preenchidas, e o clique no miolo abre a divisão. Pai sem divisão desenhada segue como pasto comum. */
  /* MAPA-PIQUETES-04: o pai sem polígono leva o contorno (a união das divisões marcadas) no mesmo gesto */
  const contornoDoConcluir = useMemo(() => {
    if (!concluindo || geometrias.some(g => g.pasto_id === concluindo.paiId)) return null;
    const ids = new Set(concluindo.lista.map(x => x.geometriaId));
    return contornoDasDivisoes(geometrias.filter(g => ids.has(g.id)).map(g => ({ id: g.id, nome: g.nome_original, geojson: g.geojson })));
  }, [concluindo, geometrias]);
  /* MAPA-PIQUETES-04: os pastos vigentes HOJE sem polígono (a Validação é onde se desenha): "Pasto sem desenho: P25" no topo da lista */
  const semDesenho = useMemo(() => {
    const h = new Date();
    const mes = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
    return avisoSemDesenho(pastosSemDesenho(pastos.filter(p => geometrias.some(g => g.fazenda_id === p.fazenda_id)), geometrias, mes), 44);
  }, [pastos, geometrias]);
  const fazendasDaVista = useMemo(() => [...new Set(geometrias.map(g => g.fazenda_id))], [geometrias]);
  const { grupos: gruposComOrigem } = useGruposComOrigem(fazendasDaVista, tiqueDosGrupos); // merge 03/11: relê depois de juntar/desfazer (2b)
  const contornos = useMemo(() => contornosDePai(geometrias, pastos, gruposComOrigem), [geometrias, pastos, gruposComOrigem]);

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
      // MAPA-PIQUETES-04: os contornos de pai por último (por cima), só a linha
      const naOrdem = [...geometrias.filter(g => !contornos.has(g.id)), ...geometrias.filter(g => contornos.has(g.id))];
      naOrdem.forEach((geo) => {
        if (geo.id === emEdicaoId) return;
        try {
          const isFocused = focusedId === geo.id;
          const candidataAJuntar = candidatasAJuntar.has(geo.id);
          const isChecked = selectedIds.has(geo.id) || unidos.includes(geo.id) || candidataAJuntar;
          const ehContorno = contornos.has(geo.id);
          const layer = L.geoJSON(geo.geojson as any, {
            interactive: !editando || unindo || candidataAJuntar,
            /* -02 (item 4a): o contorno da fazenda nunca é ponto de encaixe na edição */
            snapIgnore: TIPOS_DE_CONTORNO.includes(geo.tipo),
            style: {
              color: isFocused ? 'hsl(213, 80%, 40%)' : isChecked ? 'hsl(45, 70%, 45%)' : geo.pasto_id ? 'hsl(213, 48%, 32%)' : 'hsl(220, 8%, 50%)',
              weight: isFocused ? 3 : isChecked ? 2.5 : 1.2,
              fillColor: isFocused ? 'hsl(213, 70%, 50%)' : isChecked ? 'hsl(45, 80%, 60%)' : geo.pasto_id ? 'hsl(213, 50%, 58%)' : 'hsl(220, 8%, 72%)',
              fillOpacity: isFocused ? 0.5 : isChecked ? 0.4 : 0.22,
              // MAPA-PIQUETES-04: o contorno do pai sem preenchimento (o miolo não pega o clique) e com a borda mais grossa para clicar
              ...(ehContorno ? { fill: false, weight: isFocused ? 4 : 3 } : {}),
              /* MAPA-ZOOM-E-PAINEL-01: o gate acha o polígono selecionado por `poligono-selecionado`; MAPA-PIQUETES-04: `validacao-contorno-pai` */
              className: ['validacao-poligono', ehContorno ? 'validacao-contorno-pai' : '', isFocused ? 'poligono-selecionado' : ''].filter(Boolean).join(' '),
            },
          });
          const b = layer.getBounds();
          if (!b.isValid()) return;
          boundsMap.current.set(geo.id, b);
          if (geo.nome_original) {
            const center = b.getCenter();
            const ha = areaDoMapaHa(geo.geojson);
            const area = ha != null ? textoHa1(ha) : null;
            const praca = ehRotuloDePraca(geo.tipo, geo.nome_original);
            const marker = L.marker(center, { icon: iconeDoRotulo(geo.nome_original, area, false, praca), interactive: false }).addTo(lg);
            rotulosRef.current.set(geo.id, { marker, nome: geo.nome_original, area, comArea: false, bounds: b, praca, pasto: !!geo.pasto_id });
          }
          if (candidataAJuntar) layer.on('click', () => escolherParaJuntarRef.current(geo.id));
          else if (!editando) layer.on('click', () => setFocusedId(geo.id));
          else if (unindo) layer.on('click', () => alternarNaUniao(geo.id));
          layer.addTo(lg);
          // MAPA-PIQUETES-04: o id no elemento (o gate clica no miolo de cada divisão e na borda do pai)
          layer.eachLayer(l => { const el = l instanceof L.Path ? l.getElement() : null; el?.setAttribute('data-geo-id', geo.id); });
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
  }, [geometrias, focusedId, selectedIds, statusDoMapa, emEdicaoId, editando, unindo, unidos, alternarNaUniao, contornos, atualizarRotulosDeArea, candidatasAJuntar]);

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

  /* MAPA-CRIAR-PIQUETES-01 (2b): o diálogo do "Mover linha" nasce do gesto de vértices — as DUAS divisões (a editada e a que andou junto na divisa) */
  const dadosDaLinha = (() => {
    const alvo = edicao.alvo, outra = edicao.afetados[0];
    const outraGeo = outra ? geometrias.find(g => g.id === outra.id) : null;
    if (!edicao.linhaAberta || !alvo?.pasto_id || !edicao.formaNova || edicao.afetados.length !== 1 || !outra || !outraGeo?.pasto_id || !fazendaAtual) return null;
    return {
      a: { pastoId: alvo.pasto_id, geoId: alvo.id, nome: alvo.nome, antes: alvo.geojson, depois: edicao.formaNova },
      b: { pastoId: outraGeo.pasto_id, geoId: outra.id, nome: outra.nome, antes: outra.antes, depois: outra.depois },
    };
  })();

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Stats bar */}
      <div className="flex-shrink-0 flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-[10px] h-5">{stats.total} polígonos</Badge>
        <Badge variant="outline" className="text-[10px] h-5 text-green-700 border-green-300">{stats.vinculados} pastos</Badge>
        <Badge variant="outline" className="text-[10px] h-5">{stats.areas} áreas</Badge>
        <Badge variant="outline" className="text-[10px] h-5 text-orange-700 border-orange-300">{stats.semVinculo} sem classificação</Badge>
        {/* MAPA-LISTA-SEM-PULO-01: o selo da seleção tem lugar e largura reservados (sempre presente; só a cor muda com a seleção) */}
        <Badge variant={selectedIds.size > 0 ? 'default' : 'outline'} className="text-[10px] h-5" data-testid="validacao-contador">
          <TextoReservado texto={`${selectedIds.size} selecionados`} reserva="99.999 selecionados" />
        </Badge>
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
          {/* MAPA-PIQUETES-04: nenhum pasto some em silêncio — lugar reservado (14 px), a lista inteira no title */}
          <div className={`h-[14px] flex-none truncate border-b border-border px-2 text-[9.5px] leading-[14px] text-[#8A5A00] ${semDesenho ? '' : 'invisible'}`}
            data-testid="validacao-sem-desenho" title={semDesenho?.title} aria-hidden={!semDesenho}>
            {semDesenho?.texto ?? '·'}
          </div>
          {/* Search + filter bar */}
          <div className="px-2 py-1 border-b border-border space-y-1">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar"
                  className="h-[22px] pl-6 text-[10px]"
                />
              </div>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
                <SelectTrigger className="h-[22px] w-[96px] px-2 text-[10px]">
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
            {/* MAPA-LISTA-SEM-PULO-01 (Gabriel 02/11, UI-ESPACO-RESERVADO): a faixa de ações tem ALTURA FIXA (2 linhas de 24 px) e está SEMPRE
                presente — os botões que dependem da seleção ficam à vista e inativos (o motivo no `title`), nunca somem nem aparecem; marcar
                a caixa de um polígono não desloca a lista. O `title` do botão inativo vai também no invólucro (o inativo não recebe o mouse). */}
            {/* MAPA-LISTA-COMPACTA-01 (Gabriel 03/11 11:01): a régua pequena — 2 linhas de 20 px (as 4 ações não cabem numa de 240 px) */}
            <div className="flex h-[42px] flex-col gap-0.5" data-testid="validacao-lista-acoes">
              <div className="flex h-5 items-center gap-x-1.5">
                <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={isAllSelected ? deselectAll : selectAll}
                  disabled={filtered.length === 0} title={filtered.length === 0 ? 'Nenhum polígono na lista para selecionar' : isAllSelected ? 'Tirar a marca de todos os polígonos da lista' : 'Marcar todos os polígonos da lista'}
                  data-testid="validacao-selecionar-todos">
                  <CheckCheck className="h-3 w-3 mr-1" />
                  <TextoReservado texto={`${isAllSelected ? 'Desmarcar' : 'Selecionar'} todos`} reserva="Selecionar todos" />
                </Button>
                <span title={selectedIds.size > 0 ? undefined : MOTIVO_APAGAR} className="inline-flex">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] px-1.5 text-destructive hover:text-destructive disabled:text-muted-foreground"
                    data-testid="apagar-selecionados"
                    disabled={selectedIds.size === 0}
                    title={selectedIds.size > 0 ? `Apagar os ${selectedIds.size} polígonos marcados` : MOTIVO_APAGAR}
                    onClick={() => confirmDelete(Array.from(selectedIds), `${selectedIds.size} polígono(s) selecionado(s)`)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /><TextoReservado texto={`Apagar (${selectedIds.size})`} reserva="Apagar (999)" />
                  </Button>
                </span>
              </div>
              <div className="flex h-5 items-center gap-x-1.5">
                <span title={selectedIds.size >= 2 ? undefined : MOTIVO_UNIR} className="inline-flex">
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 disabled:text-muted-foreground" data-testid="unir-selecionados"
                    disabled={selectedIds.size < 2}
                    onClick={() => void edicao.iniciarUniao(Array.from(selectedIds))}
                    title={selectedIds.size >= 2 ? 'Unir selecionados: os marcados viram um polígono só (o primeiro fica; prévia antes de gravar)' : MOTIVO_UNIR}>
                    <TextoReservado texto={`Unir (${selectedIds.size})`} reserva="Unir (999)" />
                  </Button>
                </span>
                <span title={stats.semVinculo > 0 ? undefined : MOTIVO_SEM_CLASSIFICACAO} className="inline-flex">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] px-1.5 text-destructive hover:text-destructive disabled:text-muted-foreground"
                    data-testid="apagar-sem-classificacao"
                    disabled={stats.semVinculo === 0}
                    title={stats.semVinculo > 0 ? `Apagar os ${stats.semVinculo} polígonos sem classificação (área classificada não entra)` : MOTIVO_SEM_CLASSIFICACAO}
                    onClick={() => {
                      /* MAPA-AREA-TIPO-01: só os SEM CLASSIFICAÇÃO — área classificada (reserva, APP, curral…) não tem pasto e não é lixo */
                      const semVinculo = geometrias.filter(g => g.tipo === 'outra').map(g => g.id);
                      if (semVinculo.length > 0) confirmDelete(semVinculo, `${semVinculo.length} polígono(s) sem classificação`);
                    }}
                  >
                    {/* gate 03/11: sem o ícone e com o "Unir" (curto) ao lado ele cabe inteiro na lista de 240 px */}Apagar sem classificação
                  </Button>
                </span>
              </div>
            </div>
          </div>

          {/* -09 (Gabriel 17:42, Pureza com 141 polígonos: "compactar mais para aparecer mais linhas") — UMA linha por polígono, numa
              TABELA de largura fixa (a regra de corte da casa: nome longo em tabela corta com "…" e o inteiro no title, nunca empilha):
              [caixa] nome · selo do vínculo (o nome do pasto, "sem vínculo" em laranja ou o tipo da área) · ações em ícones */}
          <div className="flex-1 overflow-y-auto" data-testid="validacao-lista-linhas">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Nenhum polígono encontrado.</div>
            ) : (
              /* MAPA-LISTA-COMPACTA-01 (Gabriel 03/11 11:01, Pureza: "nada de texto grande"; nomes cortados em 40 px): a régua da tabela (10 px, linha
                 de 26 px), 4 colunas — [caixa 18] nome (a SOBRA, ~134 px: o nome inteiro; o vínculo vira etiqueta cinza ao lado, que cede primeiro)
                 · ha (42, 9,5 px, 2 casas, à direita) · ações (3 ícones de 12 px em 15 px, lugar reservado) */
              <table className="w-full table-fixed border-collapse text-[10px]">
                <colgroup><col style={{ width: 18 }} /><col /><col style={{ width: 42 }} /><col style={{ width: 50 }} /></colgroup>
                <tbody>
                  {filtered.map(geo => {
                    const isFocused = focusedId === geo.id;
                    const pastoName = getPastoName(geo.pasto_id);
                    const isEditing = editingId === geo.id;
                    const selo = pastoName ?? (geo.tipo === 'outra' ? 'sem vínculo' : rotuloDoTipo(geo.tipo));
                    return (
                      <tr key={geo.id} className={`h-[26px] cursor-pointer border-b border-border ${isFocused ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                        onClick={() => setFocusedId(geo.id)} data-testid="validacao-linha">
                        <td className="pl-1.5 align-middle">
                          <Checkbox checked={selectedIds.has(geo.id)} onCheckedChange={() => toggleSelect(geo.id)} onClick={e => e.stopPropagation()}
                            className="h-3 w-3" />
                        </td>
                        {isEditing ? (
                          <td colSpan={3} className="pr-1 align-middle">
                            <div className="flex gap-1">
                              <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-5 flex-1 px-1 text-[10px]" autoFocus
                                onClick={e => e.stopPropagation()}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }} />
                              <Button size="sm" className="h-5 w-5 p-0" onClick={e => { e.stopPropagation(); saveEdit(); }} disabled={saving}>
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={e => { e.stopPropagation(); setEditingId(null); }}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        ) : (
                          <>
                            {/* o nome tem a prioridade (só corta se não couber sozinho; o inteiro no title); a etiqueta do vínculo cede primeiro */}
                            <td className="overflow-hidden pr-1 align-middle" title={`${geo.nome_original || 'Sem nome'} · ${pastoName ? `Pasto → ${pastoName}` : selo}`}
                              data-testid="validacao-nome">
                              <div className="flex min-w-0 items-baseline gap-1">
                                <span className="max-w-full flex-none truncate font-medium text-foreground" data-testid="validacao-nome-texto">{geo.nome_original || 'Sem nome'}</span>
                                <span className={`min-w-0 truncate text-[9px] ${geo.tipo === 'outra' && !pastoName ? 'text-orange-600' : 'text-muted-foreground'}`}
                                  title={pastoName ? `Pasto → ${pastoName}` : selo} data-testid={pastoName ? 'validacao-selo-pasto' : 'validacao-selo'}>
                                  {etiquetaDoVinculo(geo.nome_original, pastoName, selo)}
                                </span>
                              </div>
                            </td>
                            {/* MAPA-DICAS-01 (área): "ha" à direita — 42 px = "9.999,99" a 9,5 px tabular (≈ 40), nunca corta */}
                            <td className="whitespace-nowrap pr-1 text-right align-middle text-[9.5px] tabular-nums text-foreground" data-testid="validacao-area">
                              {(() => { const ha = areaDoMapaHa(geo.geojson); return ha != null ? numHa2(ha) : '—'; })()}
                            </td>
                            <td className="pr-1 align-middle">
                              <div className="flex items-center justify-end gap-0">
                                <Button variant="ghost" size="sm" className="h-[15px] w-[15px] p-0 text-muted-foreground [&_svg]:size-3 hover:text-foreground"
                                  onClick={e => { e.stopPropagation(); startLink(geo); }} title="Classificar (pasto ou área)">
                                  <Link2 className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-[15px] w-[15px] p-0 text-muted-foreground [&_svg]:size-3 hover:text-foreground"
                                  onClick={e => { e.stopPropagation(); startEdit(geo); }} title="Editar nome">
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-[15px] w-[15px] p-0 text-muted-foreground [&_svg]:size-3 hover:text-destructive"
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
          {/* PIQUETES-PRACA-CONCAVO-01 (item 3): os soltos dentro do pasto vão para a espera do "É piquete de" (nada grava; o Concluir é o de sempre) */}
          <CriarPiquetesNoMapa piq={piq} aoUsarPiqueteDe={soltos => {
            const pai = piq.pai;
            if (!pai) return;
            const recusas = soltos.flatMap(p => { const r = piquetes.marcar(p, pai.pastoId); return r ? [`${p.nome_original || 'sem nome'}: ${r}`] : []; });
            piq.fechar();
            const marcados = soltos.length - recusas.length;
            if (marcados) toast.success(`${marcados} ${marcados === 1 ? 'polígono espera' : 'polígonos esperam'} como piquete de ${pai.nome}: confira e conclua na lista.`);
            if (recusas.length) toast.warning(`Ficaram de fora: ${recusas.join(' · ')}`);
          }} />
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
              /* MAPA-PIQUETES-MANUAL-01 (gate 03/11): o pasto com o MESMO nome do polígono não se repete ("P_09 Retiro de Cima · Pasto"): a barra
                 do pai ganhou o "Desfazer piquetes" e o nome repetido passava da caixa a 1126 px */
              const sub = pName ? (pName.trim() === (geo.nome_original ?? '').trim() ? 'Pasto' : `Pasto → ${pName}`) : rotuloDoTipo(geo.tipo);
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
                    {/* MAPA-CRIAR-PIQUETES-01 (2b, D8) — o caminho de volta: só onde se aplica (divisão de um grupo que nasceu de um pasto; o pai do grupo) */}
                    {geo.pasto_id && grupoDaDivisao(geo.pasto_id, pastos, grupos) && (() => {
                      const semVizinha = irmasDoFoco.length === 0;
                      const porque = 'Nenhuma divisão do mesmo grupo encosta nesta.';
                      return (
                        <>
                          <DicaDoMapa nome="Mover linha" desabilitado={semVizinha}
                            frase={semVizinha ? porque : 'Arrastar a divisa entre esta divisão e a vizinha do mesmo grupo; a área oficial das duas vale a do mapa a partir de um mês.'}>
                            <Button variant="ghost" size="sm" className={icone} data-testid="editar-mover-linha" aria-label="Mover linha" disabled={semVizinha}
                              onClick={() => void edicao.iniciar('vertices', geo.id, { moverLinha: true })}>
                              <Move className="h-3.5 w-3.5" />
                            </Button>
                          </DicaDoMapa>
                          <Popover open={juntandoDe === geo.id} onOpenChange={(v) => { setJuntandoDe(v ? geo.id : null); setJuntarRecusa(null); }}>
                            <DicaDoMapa nome="Juntar com…" desabilitado={semVizinha}
                              frase={semVizinha ? porque : 'Juntar esta divisão com uma vizinha do mesmo grupo: esta fica e absorve a outra, que encerra no mês anterior.'}>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className={icone} data-testid="editar-juntar" aria-label="Juntar com…" disabled={semVizinha}>
                                  <Combine className="h-3.5 w-3.5" />
                                </Button>
                              </PopoverTrigger>
                            </DicaDoMapa>
                            {/* o clique no mapa (numa divisão destacada) também escolhe: o popover não fecha por clique fora */}
                            <PopoverContent align="start" className="w-[300px] p-2" data-testid="validacao-popover" onInteractOutside={(ev) => ev.preventDefault()}>
                              <EscolherVizinhaParaJuntar nome={nome} recusa={juntarRecusa} aoEscolher={escolherParaJuntar}
                                irmas={irmasDoFoco.map(i => { const ha = areaDoMapaHa(i.geojson); return { id: i.id, nome: i.nome_original, ha: ha != null ? textoHa2(ha) : '— ha' }; })} />
                            </PopoverContent>
                          </Popover>
                        </>
                      );
                    })()}
                    {geo.pasto_id && grupoDoPai(geo.pasto_id, grupos) && (
                      <DicaDoMapa nome="Desfazer piquetes" frase="Desfazer a divisão deste pasto em piquetes: ele volta a valer inteiro e as divisões ficam inativas. Só vale sem nada lançado nelas.">
                        <Button variant="ghost" size="sm" className={icone} data-testid="editar-desfazer-piquetes" aria-label="Desfazer piquetes"
                          onClick={() => { const g = grupoDoPai(geo.pasto_id, grupos); if (g && geo.pasto_id) setDesfazendo({ grupoId: g.id, paiPastoId: geo.pasto_id }); }}>
                          <Undo2 className="h-3.5 w-3.5" />
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
        <ConcluirPiquetesDialog aberto paiId={concluindo.paiId} piquetes={concluindo.lista} contorno={contornoDoConcluir}
          nomeDoPai={pastos.find(p => p.id === concluindo.paiId)?.nome ?? 'o pasto'}
          onFechar={() => setConcluindo(null)}
          onGravado={(paiId) => {
            piquetes.concluido(paiId);
            onRefresh();
            if (fazendaAtual?.cliente_id) pastosMudaramPorFora(fazendaAtual.cliente_id);
          }} />
      )}

      {dadosDaLinha && fazendaAtual && (
        <MoverLinhaDialog fazendaId={fazendaAtual.id} a={dadosDaLinha.a} b={dadosDaLinha.b} aoFechar={edicao.fecharLinha}
          aoGravar={() => { edicao.cancelar(); depoisDeMexerNosPastos(); }} />
      )}
      {juntando && juntando.fica.pasto_id && juntando.sai.pasto_id && (
        <JuntarDialog uniao={juntando.uniao} aoFechar={() => setJuntando(null)} aoGravar={depoisDeMexerNosPastos}
          fica={{ pastoId: juntando.fica.pasto_id, geoId: juntando.fica.id, nome: juntando.fica.nome_original, geojson: juntando.fica.geojson }}
          sai={{ pastoId: juntando.sai.pasto_id, geoId: juntando.sai.id, nome: juntando.sai.nome_original, geojson: juntando.sai.geojson }} />
      )}
      {desfazendo && (
        <DesfazerPiquetesDialog grupoId={desfazendo.grupoId} aoFechar={() => setDesfazendo(null)} aoGravar={depoisDeMexerNosPastos}
          nomeDoPai={pastos.find(p => p.id === desfazendo.paiPastoId)?.nome ?? geometrias.find(g => g.pasto_id === desfazendo.paiPastoId)?.nome_original ?? 'o pasto'}
          geoDoPai={geometrias.find(g => g.pasto_id === desfazendo.paiPastoId)?.geojson ?? null} desenhos={desenhosPorId} />
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
