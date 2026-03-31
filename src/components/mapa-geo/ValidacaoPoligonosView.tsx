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
  X, Save, ChevronDown,
} from 'lucide-react';
import type { PastoGeometria } from '@/hooks/usePastoGeometrias';
import type { Pasto } from '@/hooks/usePastos';

type FilterStatus = 'all' | 'vinculado' | 'sem_vinculo';

interface Props {
  geometrias: PastoGeometria[];
  pastos: Pasto[];
  geoLoading: boolean;
  onUpdate: (id: string, updates: { nome_original?: string; pasto_id?: string | null }) => Promise<boolean>;
  onDelete: (ids: string[]) => Promise<boolean>;
  onLink: (geoId: string, pastoId: string | null) => Promise<boolean>;
  onRefresh: () => void;
}

export function ValidacaoPoligonosView({ geometrias, pastos, geoLoading, onUpdate, onDelete, onLink, onRefresh }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkPastoId, setLinkPastoId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; label: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const boundsMap = useRef<Map<string, L.LatLngBounds>>(new Map());

  // Filter & search
  const filtered = useMemo(() => {
    let list = [...geometrias];
    if (filterStatus === 'vinculado') list = list.filter(g => g.pasto_id);
    if (filterStatus === 'sem_vinculo') list = list.filter(g => !g.pasto_id);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(g => (g.nome_original || '').toLowerCase().includes(q));
    }
    return list;
  }, [geometrias, filterStatus, searchTerm]);

  const stats = useMemo(() => ({
    total: geometrias.length,
    vinculados: geometrias.filter(g => g.pasto_id).length,
    semVinculo: geometrias.filter(g => !g.pasto_id).length,
  }), [geometrias]);

  // Map init
  useEffect(() => {
    const el = mapRef.current;
    if (!el || mapInstance.current) return;
    const map = L.map(el, { center: [-15.8, -47.9], zoom: 5, zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; layerRef.current = null; };
  }, []);

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
        try {
          const isFocused = focusedId === geo.id;
          const isChecked = selectedIds.has(geo.id);
          const layer = L.geoJSON(geo.geojson as any, {
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
          layer.on('click', () => setFocusedId(geo.id));
          layer.addTo(lg);
          allBounds.push(b);
        } catch {}
      });
      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b));
        map.fitBounds(combined, { padding: [30, 30], maxZoom: 17 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [geometrias, focusedId, selectedIds]);

  // Focus on selected polygon
  useEffect(() => {
    if (!focusedId) return;
    const map = mapInstance.current;
    const b = boundsMap.current.get(focusedId);
    if (map && b) {
      map.fitBounds(b, { padding: [60, 60], maxZoom: 17 });
    }
  }, [focusedId]);

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

  const startEdit = (geo: PastoGeometria) => {
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

  const startLink = (geo: PastoGeometria) => {
    setLinkingId(geo.id);
    setLinkPastoId(geo.pasto_id || '__none__');
  };
  const saveLink = async () => {
    if (!linkingId) return;
    setSaving(true);
    await onLink(linkingId, linkPastoId === '__none__' ? null : linkPastoId);
    setLinkingId(null);
    setSaving(false);
  };

  const confirmDelete = (ids: string[], label: string) => setDeleteConfirm({ ids, label });
  const executeDelete = async () => {
    if (!deleteConfirm) return;
    setSaving(true);
    await onDelete(deleteConfirm.ids);
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
        <Badge variant="outline" className="text-[10px] h-5 text-green-700 border-green-300">{stats.vinculados} vinculados</Badge>
        <Badge variant="outline" className="text-[10px] h-5 text-orange-700 border-orange-300">{stats.semVinculo} sem vínculo</Badge>
        {selectedIds.size > 0 && (
          <Badge variant="default" className="text-[10px] h-5">{selectedIds.size} selecionados</Badge>
        )}
      </div>

      <div className="flex-1 min-h-0 flex gap-3">
        {/* Left: list panel */}
        <Card className="flex flex-col w-full sm:w-96 flex-shrink-0 overflow-hidden">
          {/* Search + filter bar */}
          <div className="p-2 border-b border-border space-y-1.5">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar polígono..."
                  className="h-7 pl-7 text-xs"
                />
              </div>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
                <SelectTrigger className="h-7 w-32 text-xs">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="vinculado">Vinculados</SelectItem>
                  <SelectItem value="sem_vinculo">Sem vínculo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Batch actions */}
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={isAllSelected ? deselectAll : selectAll}>
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
                    <Trash2 className="h-3 w-3 mr-1" />Excluir ({selectedIds.size})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                    onClick={() => {
                      const semVinculo = geometrias.filter(g => !g.pasto_id).map(g => g.id);
                      if (semVinculo.length > 0) confirmDelete(semVinculo, `${semVinculo.length} polígono(s) sem vínculo`);
                    }}
                  >
                    <Unlink className="h-3 w-3 mr-1" />Excluir sem vínculo
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Nenhum polígono encontrado.</div>
            ) : (
              filtered.map(geo => {
                const isFocused = focusedId === geo.id;
                const pastoName = getPastoName(geo.pasto_id);
                const isEditing = editingId === geo.id;
                const isLinking = linkingId === geo.id;

                return (
                  <div
                    key={geo.id}
                    className={`border-b border-border px-2 py-1.5 transition-colors cursor-pointer ${
                      isFocused ? 'bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setFocusedId(geo.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedIds.has(geo.id)}
                        onCheckedChange={() => toggleSelect(geo.id)}
                        onClick={e => e.stopPropagation()}
                        className="h-3.5 w-3.5"
                      />
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Input
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="h-6 text-xs flex-1"
                              autoFocus
                              onClick={e => e.stopPropagation()}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                            />
                            <Button size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); saveEdit(); }} disabled={saving}>
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); setEditingId(null); }}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs font-medium text-foreground truncate">
                            {geo.nome_original || 'Sem nome'}
                          </p>
                        )}
                        {isLinking ? (
                          <div className="flex gap-1 mt-1" onClick={e => e.stopPropagation()}>
                            <Select value={linkPastoId} onValueChange={setLinkPastoId}>
                              <SelectTrigger className="h-6 text-[10px] flex-1">
                                <SelectValue placeholder="Selecionar pasto" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Sem vínculo —</SelectItem>
                                {pastos.filter(p => p.ativo).map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button size="sm" className="h-6 w-6 p-0" onClick={saveLink} disabled={saving}>
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setLinkingId(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 mt-0.5">
                            {pastoName ? (
                              <Badge variant="secondary" className="text-[9px] h-4 max-w-[140px] truncate">
                                <Link2 className="h-2.5 w-2.5 mr-0.5 flex-shrink-0" />
                                {pastoName}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] h-4 text-orange-600 border-orange-300">
                                Sem vínculo
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Actions */}
                      {!isEditing && !isLinking && (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <Button
                            variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            onClick={e => { e.stopPropagation(); startLink(geo); }}
                            title="Vincular"
                          >
                            <Link2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            onClick={e => { e.stopPropagation(); startEdit(geo); }}
                            title="Editar nome"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={e => { e.stopPropagation(); confirmDelete([geo.id], geo.nome_original || 'Polígono'); }}
                            title="Excluir"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Right: map preview */}
        <Card className="hidden sm:flex flex-1 min-h-0 relative overflow-hidden">
          <div ref={mapRef} className="absolute inset-0 rounded-lg" style={{ zIndex: 0 }} />
          {geometrias.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-card z-10 rounded-lg">
              <p className="text-sm text-muted-foreground">Nenhum polígono para exibir</p>
            </div>
          )}
          {/* Focused polygon info overlay */}
          {focusedId && (() => {
            const geo = geometrias.find(g => g.id === focusedId);
            if (!geo) return null;
            const pName = getPastoName(geo.pasto_id);
            return (
              <div className="absolute top-3 left-3 bg-card/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 z-10 max-w-xs">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{geo.nome_original || 'Sem nome'}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {pName ? `Vinculado → ${pName}` : 'Sem vínculo'}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setFocusedId(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })()}
        </Card>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir {deleteConfirm?.label}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} disabled={saving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {saving ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
