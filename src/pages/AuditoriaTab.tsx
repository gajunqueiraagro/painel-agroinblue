import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Search, Filter, ChevronDown, ChevronUp, Clock, User, FileText, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface AuditEntry {
  id: string;
  cliente_id: string;
  fazenda_id: string | null;
  usuario_id: string | null;
  modulo: string;
  acao: string;
  tabela_origem: string;
  registro_id: string | null;
  resumo: string | null;
  dados_anteriores: Record<string, any> | null;
  dados_novos: Record<string, any> | null;
  created_at: string;
}

interface Profile {
  user_id: string;
  nome: string;
}

const MODULOS = [
  { value: 'all', label: 'Todos os módulos' },
  { value: 'compra', label: 'Compra' },
  { value: 'abate', label: 'Abate' },
  { value: 'venda', label: 'Venda em Pé' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'consumo', label: 'Consumo' },
  { value: 'morte', label: 'Morte' },
  { value: 'nascimento', label: 'Nascimento' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'chuva', label: 'Chuva' },
];

const ACOES = [
  { value: 'all', label: 'Todas as ações' },
  { value: 'criou', label: 'Criou' },
  { value: 'editou', label: 'Editou' },
  { value: 'cancelou', label: 'Cancelou' },
  { value: 'excluiu', label: 'Excluiu' },
];

const ACAO_COLORS: Record<string, string> = {
  criou: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  editou: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  cancelou: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  excluiu: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const HIDDEN_FIELDS = new Set([
  'id', 'cliente_id', 'created_at', 'updated_at', 'created_by', 'updated_by',
  'cancelado_por', 'cancelado_em', 'hash_importacao', 'transferencia_par_id',
]);

function diffObjects(oldObj: Record<string, any> | null, newObj: Record<string, any> | null) {
  if (!oldObj || !newObj) return [];
  const diffs: { field: string; old: any; new: any }[] = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  allKeys.forEach(key => {
    if (HIDDEN_FIELDS.has(key)) return;
    const o = oldObj[key];
    const n = newObj[key];
    if (JSON.stringify(o) !== JSON.stringify(n)) {
      diffs.push({ field: key, old: o, new: n });
    }
  });
  return diffs;
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  return String(v);
}

export function AuditoriaTab() {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  // Filters
  const [filtroModulo, setFiltroModulo] = useState('all');
  const [filtroAcao, setFiltroAcao] = useState('all');
  const [filtroFazenda, setFiltroFazenda] = useState('all');
  const [filtroUsuario, setFiltroUsuario] = useState('all');
  const [filtroDataDe, setFiltroDataDe] = useState('');
  const [filtroDataAte, setFiltroDataAte] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const loadProfiles = useCallback(async () => {
    if (!clienteAtual) return;
    const { data } = await supabase
      .from('profiles')
      .select('user_id, nome');
    if (data) setProfiles(data as Profile[]);
  }, [clienteAtual]);

  const loadEntries = useCallback(async () => {
    if (!clienteAtual) return;
    setLoading(true);
    let query = supabase
      .from('audit_log')
      .select('*')
      .eq('cliente_id', clienteAtual.id)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filtroModulo !== 'all') query = query.eq('modulo', filtroModulo);
    if (filtroAcao !== 'all') query = query.eq('acao', filtroAcao);
    if (filtroFazenda !== 'all') query = query.eq('fazenda_id', filtroFazenda);
    if (filtroUsuario !== 'all') query = query.eq('usuario_id', filtroUsuario);
    if (filtroDataDe) query = query.gte('created_at', `${filtroDataDe}T00:00:00`);
    if (filtroDataAte) query = query.lte('created_at', `${filtroDataAte}T23:59:59`);

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao carregar auditoria:', error);
    } else {
      setEntries(data as AuditEntry[]);
    }
    setLoading(false);
  }, [clienteAtual, page, filtroModulo, filtroAcao, filtroFazenda, filtroUsuario, filtroDataDe, filtroDataAte]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  useEffect(() => { setPage(0); }, [filtroModulo, filtroAcao, filtroFazenda, filtroUsuario, filtroDataDe, filtroDataAte]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach(p => { m[p.user_id] = p.nome; });
    return m;
  }, [profiles]);

  const uniqueUsers = useMemo(() => {
    const userIds = new Set(entries.map(e => e.usuario_id).filter(Boolean));
    return Array.from(userIds).map(uid => ({
      id: uid!,
      nome: profileMap[uid!] || uid!.slice(0, 8),
    }));
  }, [entries, profileMap]);

  const getUserName = (uid: string | null) => {
    if (!uid) return 'Sistema';
    return profileMap[uid] || uid.slice(0, 8);
  };

  const getFazendaName = (fid: string | null) => {
    if (!fid) return '—';
    return fazendas.find(f => f.id === fid)?.nome || fid.slice(0, 8);
  };

  const activeFilters = [filtroModulo, filtroAcao, filtroFazenda, filtroUsuario, filtroDataDe, filtroDataAte].filter(f => f && f !== 'all').length;

  const diffs = useMemo(() => {
    if (!selectedEntry) return [];
    return diffObjects(selectedEntry.dados_anteriores, selectedEntry.dados_novos);
  }, [selectedEntry]);

  return (
    <div className="pb-24 w-full">
      {/* Header with filter toggle */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 shadow-sm px-3 pt-2 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Central de Auditoria</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1"
          >
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {activeFilters > 0 && (
              <Badge variant="default" className="ml-1 h-5 min-w-5 text-[10px] px-1">
                {activeFilters}
              </Badge>
            )}
            {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-3 space-y-2 pt-2 border-t">
            <div className="grid grid-cols-2 gap-2">
              <Select value={filtroModulo} onValueChange={setFiltroModulo}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Módulo" />
                </SelectTrigger>
                <SelectContent>
                  {MODULOS.map(m => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filtroAcao} onValueChange={setFiltroAcao}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Ação" />
                </SelectTrigger>
                <SelectContent>
                  {ACOES.map(a => (
                    <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select value={filtroFazenda} onValueChange={setFiltroFazenda}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Fazenda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todas</SelectItem>
                  {fazendas.map(f => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filtroUsuario} onValueChange={setFiltroUsuario}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Usuário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todos</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.user_id} value={p.user_id} className="text-xs">{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">De</label>
                <Input
                  type="date"
                  value={filtroDataDe}
                  onChange={e => setFiltroDataDe(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Até</label>
                <Input
                  type="date"
                  value={filtroDataAte}
                  onChange={e => setFiltroDataAte(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {activeFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs w-full"
                onClick={() => {
                  setFiltroModulo('all');
                  setFiltroAcao('all');
                  setFiltroFazenda('all');
                  setFiltroUsuario('all');
                  setFiltroDataDe('');
                  setFiltroDataAte('');
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Entries list */}
      <div className="px-3 pt-2 space-y-1.5">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Os eventos serão registrados automaticamente a partir de agora.
            </p>
          </div>
        ) : (
          <>
            {entries.map(entry => (
              <Card
                key={entry.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedEntry(entry)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${ACAO_COLORS[entry.acao] || 'bg-muted text-muted-foreground'}`}>
                          {entry.acao.toUpperCase()}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                          {entry.modulo}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium text-foreground truncate">
                        {entry.resumo || '—'}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {format(new Date(entry.created_at), 'dd/MM/yy HH:mm')}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <User className="h-3 w-3" />
                          {getUserName(entry.usuario_id)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Pagination */}
            <div className="flex items-center justify-center gap-2 py-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">Página {page + 1}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={entries.length < PAGE_SIZE}
                onClick={() => setPage(p => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle className="text-sm">Detalhes do Evento</SheetTitle>
          </SheetHeader>
          {selectedEntry && (
            <ScrollArea className="h-[calc(85vh-60px)] pr-3">
              <div className="space-y-4 pt-4">
                {/* Summary */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${ACAO_COLORS[selectedEntry.acao] || 'bg-muted text-muted-foreground'}`}>
                      {selectedEntry.acao.toUpperCase()}
                    </span>
                    <Badge variant="outline" className="text-xs">{selectedEntry.modulo}</Badge>
                  </div>
                  <p className="text-sm font-medium">{selectedEntry.resumo || '—'}</p>
                </div>

                <Separator />

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Data/Hora</span>
                    <p className="font-medium">{format(new Date(selectedEntry.created_at), 'dd/MM/yyyy HH:mm:ss')}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Usuário</span>
                    <p className="font-medium">{getUserName(selectedEntry.usuario_id)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fazenda</span>
                    <p className="font-medium">{getFazendaName(selectedEntry.fazenda_id)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tabela</span>
                    <p className="font-medium">{selectedEntry.tabela_origem}</p>
                  </div>
                </div>

                <Separator />

                {/* Diffs */}
                {selectedEntry.acao === 'editou' && diffs.length > 0 ? (
                  <div>
                    <h4 className="text-xs font-bold mb-2 text-muted-foreground uppercase tracking-wider">Alterações</h4>
                    <div className="space-y-2">
                      {diffs.map(d => (
                        <div key={d.field} className="rounded-md border p-2 text-xs">
                          <p className="font-semibold text-foreground mb-1">{d.field}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[10px] text-muted-foreground">Antes</span>
                              <p className="text-red-600 dark:text-red-400 font-medium">{formatValue(d.old)}</p>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground">Depois</span>
                              <p className="text-green-600 dark:text-green-400 font-medium">{formatValue(d.new)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selectedEntry.acao === 'criou' && selectedEntry.dados_novos ? (
                  <div>
                    <h4 className="text-xs font-bold mb-2 text-muted-foreground uppercase tracking-wider">Dados do Registro</h4>
                    <div className="space-y-1">
                      {Object.entries(selectedEntry.dados_novos)
                        .filter(([k]) => !HIDDEN_FIELDS.has(k))
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between text-xs py-0.5 border-b border-border/50">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="font-medium text-foreground">{formatValue(v)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : selectedEntry.acao === 'cancelou' && selectedEntry.dados_anteriores ? (
                  <div>
                    <h4 className="text-xs font-bold mb-2 text-muted-foreground uppercase tracking-wider">Dados Cancelados</h4>
                    <div className="space-y-1">
                      {Object.entries(selectedEntry.dados_anteriores)
                        .filter(([k]) => !HIDDEN_FIELDS.has(k))
                        .map(([k, v]) => (
                          <div key={k} className="flex justify-between text-xs py-0.5 border-b border-border/50">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="font-medium text-foreground">{formatValue(v)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Sem detalhes adicionais disponíveis para este evento.
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
