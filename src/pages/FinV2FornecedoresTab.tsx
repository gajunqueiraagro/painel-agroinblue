import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Search, Link2, AlertTriangle } from 'lucide-react';
import { FornecedorFormDialog } from '@/components/financeiro-v2/FornecedorFormDialog';
import { toast } from 'sonner';

interface Fornecedor {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string;
  ativo: boolean;
}

interface PendingItem {
  descricao: string;
  count: number;
  ids: string[];
  suggestions: Fornecedor[];
}

function normalize(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.7;
  const words = na.split(' ');
  const matches = words.filter(w => nb.includes(w)).length;
  return matches / Math.max(words.length, 1);
}

export function FinV2FornecedoresTab() {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const [items, setItems] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingPendingId, setCreatingPendingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fornecedor | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('ativos');
  const [activeTab, setActiveTab] = useState('cadastro');

  // Pending items
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('financeiro_fornecedores')
      .select('*')
      .eq('cliente_id', clienteAtual.id)
      .order('nome');
    setItems((data as Fornecedor[]) || []);
    setLoading(false);
  }, [clienteAtual?.id]);

  const loadPending = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoadingPending(true);
    // Get lancamentos without favorecido_id that have a descricao
    const { data } = await supabase
      .from('financeiro_lancamentos_v2')
      .select('id, descricao')
      .eq('cliente_id', clienteAtual.id)
      .is('favorecido_id', null)
      .not('descricao', 'is', null)
      .order('descricao');

    if (!data || data.length === 0) {
      setPendingItems([]);
      setLoadingPending(false);
      return;
    }

    // Group by descricao
    const groups: Record<string, { count: number; ids: string[] }> = {};
    for (const row of data) {
      const desc = (row.descricao || '').trim();
      if (!desc) continue;
      if (!groups[desc]) groups[desc] = { count: 0, ids: [] };
      groups[desc].count++;
      if (groups[desc].ids.length < 50) groups[desc].ids.push(row.id);
    }

    // Build pending items with suggestions
    const pending: PendingItem[] = Object.entries(groups)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([desc, g]) => {
        const suggestions = items
          .filter(f => f.ativo && similarity(desc, f.nome) > 0.3)
          .sort((a, b) => similarity(desc, b.nome) - similarity(desc, a.nome))
          .slice(0, 3);
        return { descricao: desc, count: g.count, ids: g.ids, suggestions };
      });

    setPendingItems(pending);
    setLoadingPending(false);
  }, [clienteAtual?.id, items]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeTab === 'pendentes') loadPending(); }, [activeTab, loadPending]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (statusFilter === 'ativos') list = list.filter(f => f.ativo);
    else if (statusFilter === 'inativos') list = list.filter(f => !f.ativo);
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(f => f.nome.toLowerCase().includes(q) || f.cpf_cnpj?.toLowerCase().includes(q));
  }, [items, searchText, statusFilter]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (f: Fornecedor) => {
    setEditing(f);
    setDialogOpen(true);
  };

  // Link pending lancamentos to an existing fornecedor
  const linkToFornecedor = async (pending: PendingItem, fornecedorId: string) => {
    const { error } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({ favorecido_id: fornecedorId })
      .in('id', pending.ids);
    if (error) {
      toast.error('Erro ao vincular');
      return;
    }
    toast.success(`${pending.count} lançamentos vinculados`);
    loadPending();
  };

  // Create new fornecedor from pending and link
  const createAndLink = async (pending: PendingItem) => {
    if (creatingPendingId) return;
    if (!clienteAtual?.id) return;
    const faz = fazendas.find(f => f.id !== '__global__');
    if (!faz) return;

    setCreatingPendingId(pending.descricao);
    try {
      const { data, error } = await supabase
        .from('financeiro_fornecedores')
        .insert({ cliente_id: clienteAtual.id, fazenda_id: faz.id, nome: pending.descricao })
        .select('id')
        .single();
      if (error || !data) {
        toast.error('Erro ao criar fornecedor');
        return;
      }
      await linkToFornecedor(pending, data.id);
      load();
    } finally {
      setCreatingPendingId(null);
    }
  };

  const fazendaNome = (id: string) => fazendas.find(f => f.id === id)?.nome || '-';
  const pendingCount = pendingItems.length;

  return (
    <div className="w-full p-4 pb-20 space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Fornecedores</h2>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="cadastro" className="text-xs h-7">Cadastro ({items.length})</TabsTrigger>
          <TabsTrigger value="pendentes" className="text-xs h-7 gap-1">
            <AlertTriangle className="h-3 w-3" />
            Pendentes {pendingCount > 0 && <Badge variant="destructive" className="text-[9px] px-1 py-0 ml-0.5">{pendingCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro" className="space-y-2 mt-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Buscar fornecedor..."
                className="h-8 text-xs pl-7"
              />
            </div>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                <SelectItem value="ativos" className="text-xs">Ativos</SelectItem>
                <SelectItem value="inativos" className="text-xs">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="h-7">
                    <TableHead className="text-[10px]">Nome</TableHead>
                    <TableHead className="text-[10px]">CPF/CNPJ</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-xs">Carregando...</TableCell></TableRow>}
                  {!loading && filteredItems.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6 text-xs">Nenhum fornecedor</TableCell></TableRow>}
                  {filteredItems.map(f => (
                    <TableRow key={f.id} className="h-7 text-[11px]">
                      <TableCell className="py-0.5 font-medium">{f.nome}</TableCell>
                      <TableCell className="py-0.5 text-muted-foreground">{f.cpf_cnpj || '-'}</TableCell>
                      <TableCell className="py-0.5">
                        <Badge variant={f.ativo ? 'default' : 'secondary'} className="text-[9px] px-1 py-0">
                          {f.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-0.5">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(f)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pendentes" className="space-y-2 mt-2">
          <p className="text-[10px] text-muted-foreground">
            Lançamentos sem fornecedor vinculado. Vincule a um existente ou crie novo.
          </p>
          {loadingPending && <div className="text-center text-muted-foreground py-6 text-xs animate-pulse">Carregando...</div>}
          {!loadingPending && pendingItems.length === 0 && (
            <div className="text-center text-muted-foreground py-8 text-xs">
              ✅ Todos os lançamentos estão vinculados!
            </div>
          )}
          {!loadingPending && pendingItems.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="h-7">
                      <TableHead className="text-[10px]">Descrição Original</TableHead>
                      <TableHead className="text-[10px] w-12">Qtd</TableHead>
                      <TableHead className="text-[10px]">Sugestão</TableHead>
                      <TableHead className="text-[10px] w-28">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingItems.slice(0, 100).map((p, i) => (
                      <TableRow key={i} className="text-[10px] h-8">
                        <TableCell className="py-0.5 font-medium max-w-[200px] truncate" title={p.descricao}>
                          {p.descricao}
                        </TableCell>
                        <TableCell className="py-0.5 text-muted-foreground">{p.count}</TableCell>
                        <TableCell className="py-0.5">
                          {p.suggestions.length > 0 ? (
                            <Select onValueChange={(fornId) => linkToFornecedor(p, fornId)}>
                              <SelectTrigger className="h-6 text-[10px]">
                                <SelectValue placeholder={p.suggestions[0]?.nome || 'Selecione'} />
                              </SelectTrigger>
                              <SelectContent>
                                {p.suggestions.map(s => (
                                  <SelectItem key={s.id} value={s.id} className="text-[10px] py-0.5">{s.nome}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground italic">Sem sugestão</span>
                          )}
                        </TableCell>
                        <TableCell className="py-0.5">
                          <div className="flex gap-0.5">
                            {p.suggestions.length > 0 && (
                              <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5" onClick={() => linkToFornecedor(p, p.suggestions[0].id)}>
                                <Link2 className="h-2.5 w-2.5 mr-0.5" />Vincular
                              </Button>
                            )}
                            <Button size="sm" variant="default" className="h-5 text-[9px] px-1.5" onClick={() => createAndLink(p)} disabled={creatingPendingId === p.descricao}>
                              <Plus className="h-2.5 w-2.5 mr-0.5" />{creatingPendingId === p.descricao ? '...' : 'Criar'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <FornecedorFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editing={editing}
        allFornecedores={items}
        fazendas={fazendas}
        clienteId={clienteAtual?.id || ''}
        onSaved={load}
        onSelectExisting={(f) => { toast.info(`Fornecedor "${f.nome}" selecionado.`); }}
      />
    </div>
  );
}
