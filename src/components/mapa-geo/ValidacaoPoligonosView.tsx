import { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Link2, Unlink, Pencil, Trash2, CheckCheck, MapPin, Search, Filter,
  X, Save, ChevronDown, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { casaNoNomeDoPoligono, TIPOS_DE_CONTORNO } from '@/lib/mapa/edicaoDoPoligono';
import type { FazendaGeometria } from '@/hooks/usePastoGeometrias';
import { useStableLeafletMap } from '@/hooks/useStableLeafletMap';
import type { Pasto } from '@/hooks/usePastos';
import { ClassificarPoligono } from '@/components/mapa-geo/ClassificarPoligono';
import { ehTipoDeArea, rotuloDoTipo, type TipoDeArea } from '@/lib/mapa/tiposDeArea';
/* MAPA-EDITAR-POLIGONO-01 — a edição de polígono é um módulo próprio (hook + barra); aqui só o encaixe */
import { useEdicaoDoPoligono, type ModoDaEdicao } from '@/hooks/useEdicaoDoPoligono';
import { BarraDeEdicaoDoPoligono, DesfazerUltimaEdicao } from '@/components/mapa-geo/BarraDeEdicaoDoPoligono';
import { useFazenda } from '@/contexts/FazendaContext';
/* MAPA-PIQUETES-02 — os piquetes são um módulo próprio (espera + prévia + gravar); aqui só o encaixe */
import { ConcluirPiquetesDialog, MarcarPiquete, PiquetesEmEspera } from '@/components/mapa-geo/PiquetesDoPoligono';
import { usePiquetesEmEspera } from '@/hooks/usePiquetes';
import { pastosMudaramPorFora } from '@/hooks/usePastos';
import type { PiqueteEmEspera } from '@/lib/mapa/piquetesEmEspera';

const CHAVE_LISTA_RECOLHIDA = 'mapa-validacao-lista-recolhida';

type FilterStatus = 'all' | 'vinculado' | 'area' | 'sem_vinculo';

const GESTOS: ReadonlyArray<[ModoDaEdicao, string]> = [
  ['vertices', 'Vértices'], ['redesenhar', 'Redesenhar'], ['dividir', 'Dividir'], ['unir', 'Unir'], ['apagar', 'Apagar'],
];

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
}

/* MAPA-AREA-TIPO-01 (Gabriel 01/11): o vínculo e o tipo de área saem do UPDATE direto e vão pelo escritor do banco
   (`fn_mapa_geometria_classificar`: prévia, trilha e a memória que o "Atualizar mapa" respeita), no painel do polígono. */
export function ValidacaoPoligonosView({ geometrias, pastos, geoLoading, onUpdate, onDelete, onRefresh, tipoPedido, onTipoPedidoUsado }: Props) {
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
  /* MAPA-EDITAR-POLIGONO-07 (Gabriel 15:09: "a tela pula para a fazenda toda"): o mapa só se enquadra SOZINHO na troca de fazenda (e no
     1º carregamento). Antes, o desenho refazia o fitBounds a cada seleção/gravação e o foco num polígono dava zoom nele. */
  const enquadradoRef = useRef<string | null>(null);
  const { fazendaAtual } = useFazenda();
  const edicao = useEdicaoDoPoligono({
    mapa: statusDoMapa === 'ready' ? mapInstance.current : null,
    fazendaId: fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null,
    geometrias, aoMudar: onRefresh,
    clienteId: fazendaAtual && fazendaAtual.id !== '__global__' ? fazendaAtual.cliente_id : null,
    /* -09: o polígono selecionado também mostra os metros dos lados */
    selecionado: focusedId ? geometrias.find(g => g.id === focusedId)?.geojson ?? null : null,
  });
  /* o polígono em edição sai do desenho da lista (a barra o desenha na camada dela); no apagar ele fica à vista */
  const emEdicaoId = edicao.alvo && edicao.modo !== 'apagar' ? edicao.alvo.id : null;
  /* durante a edição os polígonos da lista não respondem a clique: o clique é do desenho (senão focava o vizinho e dava zoom nele) */
  const editando = !!edicao.modo;
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
            const label = L.divIcon({
              className: 'pasto-label',
              html: `<span style="font-size:9px;font-weight:600;color:hsl(222,47%,11%);text-shadow:0 0 3px white,0 0 3px white;">${geo.nome_original}</span>`,
            });
            L.marker(center, { icon: label, interactive: false }).addTo(lg);
          }
          if (!editando) layer.on('click', () => setFocusedId(geo.id));
          else if (unindo) layer.on('click', () => alternarNaUniao(geo.id));
          layer.addTo(lg);
          allBounds.push(b);
        } catch {}
      });
      const fazendaDaVista = geometrias[0]?.fazenda_id ?? '';
      if (allBounds.length > 0 && !emEdicaoId && enquadradoRef.current !== fazendaDaVista) {
        enquadradoRef.current = fazendaDaVista;
        const combined = allBounds.reduce((acc, b) => acc.extend(b));
        map.fitBounds(combined, { padding: [30, 30], maxZoom: 17 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [geometrias, focusedId, selectedIds, statusDoMapa, emEdicaoId, editando, unindo, unidos, alternarNaUniao]);

  // Focus on selected polygon
  useEffect(() => {
    if (!focusedId || editando) return;
    const map = mapInstance.current;
    const b = boundsMap.current.get(focusedId);
    /* -07: selecionar NÃO muda o zoom; fora da tela, o mapa só desliza até ele */
    if (map && b && !map.getBounds().intersects(b)) map.panTo(b.getCenter()); // só quando está TODO fora da tela
  }, [focusedId]);

  /* -07: o enquadramento da fazenda inteira só quando o operador pede */
  const verFazendaInteira = () => {
    const map = mapInstance.current;
    const todos = [...boundsMap.current.values()];
    if (!map || todos.length === 0) return;
    map.fitBounds(todos.reduce((acc, b) => L.latLngBounds(acc.getSouthWest(), acc.getNorthEast()).extend(b)), { padding: [30, 30], maxZoom: 17 });
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
                <colgroup><col style={{ width: 22 }} /><col /><col style={{ width: 72 }} /><col style={{ width: 58 }} /></colgroup>
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
                          <td colSpan={3} className="pr-1 align-middle">
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
        <Card className="hidden sm:flex flex-1 min-h-0 relative overflow-hidden">
          {/* o `.leaflet-container { position: relative }` do index.css vencia a classe `absolute` e o mapa ficava com largura 0 (achado no
              MAPA-EDITAR-POLIGONO-01): a posição vai no estilo da própria div, sem mexer na regra global */}
          <div ref={mapRef} className="absolute inset-0 rounded-lg" style={{ zIndex: 0, position: 'absolute' }} />
          <BarraDeEdicaoDoPoligono edicao={edicao} geometrias={geometrias} nomeDoPasto={getPastoName}
            areaCadastroHa={pastos.find(p => p.id === edicao.alvo?.pasto_id)?.area_produtiva_ha ?? null} />
          <DesfazerUltimaEdicao edicao={edicao} />
          {!edicao.modo && (
            <div className="absolute right-3 top-3 z-20 flex gap-1.5">
              <Button variant="outline" size="sm" className="h-6 bg-card px-2 text-[11px]" onClick={verFazendaInteira} data-testid="validacao-ver-fazenda">
                Ver fazenda inteira
              </Button>
              <Button variant="outline" size="sm" className="h-6 bg-card px-2 text-[11px]"
                onClick={() => void edicao.iniciar('desenhar', null)} data-testid="edicao-desenhar-novo">
                Desenhar polígono novo
              </Button>
            </div>
          )}
          {geometrias.length === 0 && !edicao.modo && (
            <div className="absolute inset-0 flex items-center justify-center bg-card z-10 rounded-lg">
              <p className="text-sm text-muted-foreground">Nenhum polígono para exibir</p>
            </div>
          )}
          {/* MAPA-AREA-TIPO-01: veio do Adicionar › Área — diz o que fazer (o próximo polígono escolhido abre "É área" com o tipo) */}
          {tipoPedido && !focusedId && (
            <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-border bg-card/95 px-3 py-1 text-[10.5px] shadow-sm"
              data-testid="validacao-tipo-pedido">
              Escolha o polígono para marcar como <b className="font-semibold">{rotuloDoTipo(tipoPedido)}</b>
              <button type="button" className="ml-2 text-[#2B6CB0]" onClick={() => onTipoPedidoUsado?.()}>Cancelar</button>
            </div>
          )}
          {/* Focused polygon info overlay */}
          {focusedId && !edicao.modo && (() => {
            const geo = geometrias.find(g => g.id === focusedId);
            if (!geo) return null;
            const pName = getPastoName(geo.pasto_id);
            return (
              <div className="absolute top-3 left-3 bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 z-10 w-[300px]" data-testid="validacao-painel-poligono">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground break-words">{geo.nome_original || 'Sem nome'}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {pName ? `Pasto → ${pName}` : rotuloDoTipo(geo.tipo)}
                    </p>
                    {/* MAPA-EDITAR-POLIGONO-01 — "Editar polígono" (Code 3): os gestos da edição; o "É pasto / É área" é do Code 6 */}
                    {!edicao.modo && (
                      <div className="mt-1 flex flex-wrap items-center gap-1" data-testid="editar-poligono">
                        <span className="text-[10px] font-semibold text-foreground">Editar polígono:</span>
                        {GESTOS.map(([m, rotulo]) => (
                          <Button key={m} variant="outline" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => void edicao.iniciar(m, geo.id)}>
                            {rotulo}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 flex-none" onClick={() => { setFocusedId(null); setClassificandoId(null); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                {/* os gestos do polígono, cada um no seu botão (MAPA-AREA-TIPO-01 aqui; piquetes e editar polígono entram ao lado) */}
                {classificandoId === geo.id || (tipoPedido && classificandoId === null) ? (
                  <ClassificarPoligono key={`${geo.id}-${tipoPedido ?? ''}`} geo={geo} pastos={pastos} geometrias={geometrias} tipoInicial={tipoPedido}
                    onGravou={() => { setClassificandoId(null); onTipoPedidoUsado?.(); onRefresh(); }}
                    onFechar={() => { setClassificandoId(null); onTipoPedidoUsado?.(); }} />
                ) : (
                  <>
                    <div className="mt-1.5 flex gap-1" data-testid="validacao-gestos">
                      <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={() => setClassificandoId(geo.id)}>
                        <Link2 className="h-3 w-3 mr-1" />Classificar
                      </Button>
                    </div>
                    {/* MAPA-PIQUETES-02 — "É piquete de…": o polígono fica EM ESPERA; o "Concluir" mora no rodapé da lista */}
                    <MarcarPiquete poligono={geo} pastos={pastos} espera={piquetes.espera} onMarcar={piquetes.marcar} onTirar={piquetes.tirar} />
                  </>
                )}
              </div>
            );
          })()}
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
