import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Pencil, MoreHorizontal, Power, PowerOff, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  escopoLabel,
  ordenarSafras,
  validarSafra,
  buildEmUsoSet,
  mapErroSalvarSafra,
  ESCOPO_AJUDA,
  type FinanceiroSafra,
  type EscopoNegocio,
} from '@/lib/financeiro/safrasHelpers';

// Colunas soberanas lidas de financeiro_safras (types.ts ainda não conhece a tabela;
// regen separado). Cast único e localizado no query builder — resultado convertido
// imediatamente para o tipo local FinanceiroSafra. Mesmo idioma de useFinanceiroV2.ts.
const SAFRA_COLS = 'id, cliente_id, nome, codigo, escopo_negocio, ordem_exibicao, descricao, observacoes, ativa';

export function FinV2SafrasTab() {
  const { clienteAtual } = useCliente();
  const [safras, setSafras] = useState<FinanceiroSafra[]>([]);
  const [emUso, setEmUso] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FinanceiroSafra | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);

  // Confirmações de ativar/inativar (sem Excluir neste PR).
  const [confirmDesativar, setConfirmDesativar] = useState<FinanceiroSafra | null>(null);
  const [confirmAtivar, setConfirmAtivar] = useState<FinanceiroSafra | null>(null);

  // Campos do formulário.
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [escopo, setEscopo] = useState<EscopoNegocio | ''>('');
  const [ordemRaw, setOrdemRaw] = useState('');
  const [descricao, setDescricao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [ativa, setAtiva] = useState(true);

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);
    setLoadError(false);
    // Cast localizado (financeiro_safras ausente de types.ts).
    const db = supabase as any;
    // Consulta 1: Safras do cliente (campos explícitos, sem '*').
    // Consulta 2: safra_id em uso (uma única query, apenas a coluna UUID, sem N+1).
    const [safrasRes, usoRes] = await Promise.all([
      db.from('financeiro_safras').select(SAFRA_COLS).eq('cliente_id', clienteAtual.id),
      db.from('financeiro_lancamentos_v2').select('safra_id')
        .eq('cliente_id', clienteAtual.id)
        .not('safra_id', 'is', null),
    ]);

    if (safrasRes.error || usoRes.error) {
      // Não inventar "Não" para todos: sinaliza erro e permite recarregar.
      setSafras([]);
      setEmUso(new Set());
      setLoadError(true);
      setLoading(false);
      return;
    }

    setSafras((safrasRes.data as FinanceiroSafra[]) || []);
    setEmUso(buildEmUsoSet(usoRes.data as Array<{ safra_id: string | null }>));
    setLoading(false);
  }, [clienteAtual?.id]);

  // Troca de cliente ativo: limpar todo estado stale ANTES da nova carga —
  // fechar modais do cliente anterior, limpar edição, Set de uso e lista;
  // impede salvamento com estado de outro tenant. A carga real vem do effect de load().
  useEffect(() => {
    setDialogOpen(false);
    setEditing(null);
    setConfirmDesativar(null);
    setConfirmAtivar(null);
    setSafras([]);
    setEmUso(new Set());
    setMostrarInativas(false);
  }, [clienteAtual?.id]);

  useEffect(() => { load(); }, [load]);

  const safrasFiltradas = useMemo(() => {
    const base = mostrarInativas ? safras : safras.filter(s => s.ativa);
    return ordenarSafras(base);
  }, [safras, mostrarInativas]);

  const totalInativas = useMemo(() => safras.filter(s => !s.ativa).length, [safras]);

  const openNew = () => {
    setEditing(null);
    setNome('');
    setCodigo('');
    setEscopo('');
    setOrdemRaw('');
    setDescricao('');
    setObservacoes('');
    setAtiva(true);
    setDialogOpen(true);
  };

  const openEdit = (s: FinanceiroSafra) => {
    setEditing(s);
    setNome(s.nome ?? '');
    setCodigo(s.codigo ?? '');
    // Escopo legado NULL inicia sem seleção; salvamento exige escolha.
    setEscopo(s.escopo_negocio ?? '');
    setOrdemRaw(String(s.ordem_exibicao)); // integer real (distingue 0 explícito)
    setDescricao(s.descricao ?? '');
    setObservacoes(s.observacoes ?? '');
    setAtiva(s.ativa);
    setDialogOpen(true);
  };

  const save = async () => {
    if (isSaving) return;
    if (!clienteAtual?.id) return;
    const v = validarSafra({ nome, codigo, escopo_negocio: escopo, ordemRaw, descricao, observacoes, ativa });
    if (!v.ok) { toast.error(v.erro); return; }

    setIsSaving(true);
    try {
      const db = supabase as any;
      if (editing) {
        // UPDATE restrito por id + cliente_id ativo; cliente_id nunca no payload.
        const { data, error } = await db.from('financeiro_safras')
          .update(v.payload)
          .eq('id', editing.id)
          .eq('cliente_id', clienteAtual.id)
          .select('id');
        if (error) { toast.error(mapErroSalvarSafra(error) ?? 'Erro ao salvar a Safra.'); return; }
        // Sem evidência de linha afetada → não mostrar sucesso falso; manter modal aberto.
        if (!data || data.length === 0) { toast.error('Não foi possível salvar: Safra não encontrada para este cliente.'); return; }
        toast.success('Safra atualizada');
      } else {
        // INSERT: cliente_id somente aqui, vindo de clienteAtual.id.
        const { data, error } = await db.from('financeiro_safras')
          .insert({ cliente_id: clienteAtual.id, ...v.payload })
          .select('id');
        if (error) { toast.error(mapErroSalvarSafra(error) ?? 'Erro ao salvar a Safra.'); return; }
        if (!data || data.length === 0) { toast.error('Não foi possível criar a Safra.'); return; }
        toast.success('Safra criada');
      }
      setDialogOpen(false);
      setEditing(null);
      load();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDesativar = async () => {
    if (!confirmDesativar || !clienteAtual?.id) return;
    const db = supabase as any;
    const { data, error } = await db.from('financeiro_safras')
      .update({ ativa: false })
      .eq('id', confirmDesativar.id)
      .eq('cliente_id', clienteAtual.id)
      .select('id');
    if (error || !data || data.length === 0) { toast.error('Erro ao inativar a Safra'); }
    else { toast.success('Safra inativada'); }
    setConfirmDesativar(null);
    load();
  };

  const handleAtivar = async () => {
    if (!confirmAtivar || !clienteAtual?.id) return;
    const db = supabase as any;
    const { data, error } = await db.from('financeiro_safras')
      .update({ ativa: true })
      .eq('id', confirmAtivar.id)
      .eq('cliente_id', clienteAtual.id)
      .select('id');
    if (error || !data || data.length === 0) { toast.error('Erro ao reativar a Safra'); }
    else { toast.success('Safra reativada'); }
    setConfirmAtivar(null);
    load();
  };

  const cellClass = 'text-[12px] font-medium leading-tight py-1 px-2';

  return (
    <div className="w-full p-4 pb-20 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Safras</h2>
          <p className="text-xs text-muted-foreground">Safras e exercícios por escopo de negócio.</p>
        </div>
        <div className="flex items-center gap-2">
          {totalInativas > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1"
              onClick={() => setMostrarInativas(v => !v)}
            >
              {mostrarInativas ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {mostrarInativas ? 'Ocultar inativas' : `Mostrar inativas (${totalInativas})`}
            </Button>
          )}
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Safra</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Código</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Nome</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Escopo</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Situação</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Em uso</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Ordem</TableHead>
                <TableHead className="w-10 py-1.5 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              )}
              {!loading && loadError && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-sm text-destructive mb-2">Erro ao carregar as Safras.</p>
                    <Button variant="outline" size="sm" onClick={load}>Tentar novamente</Button>
                  </TableCell>
                </TableRow>
              )}
              {!loading && !loadError && safrasFiltradas.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma Safra cadastrada</TableCell></TableRow>
              )}
              {!loading && !loadError && safrasFiltradas.map(s => (
                <TableRow key={s.id} className={`h-auto ${!s.ativa ? 'opacity-50' : ''}`}>
                  <TableCell className={`${cellClass} font-mono text-[11px]`}>{s.codigo || '—'}</TableCell>
                  <TableCell className={cellClass}><span className="font-semibold">{s.nome}</span></TableCell>
                  <TableCell className={cellClass}>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 leading-tight">{escopoLabel(s.escopo_negocio)}</Badge>
                  </TableCell>
                  <TableCell className={cellClass}>
                    <Badge variant={s.ativa ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0 leading-tight">
                      {s.ativa ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell className={`${cellClass} text-muted-foreground`}>{emUso.has(s.id) ? 'Sim' : 'Não'}</TableCell>
                  <TableCell className={`${cellClass} font-mono text-[11px]`}>{s.ordem_exibicao}</TableCell>
                  <TableCell className="py-1 px-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => openEdit(s)} className="gap-2 text-xs">
                          <Pencil className="h-3 w-3" /> Editar
                        </DropdownMenuItem>
                        {s.ativa ? (
                          <DropdownMenuItem onClick={() => setConfirmDesativar(s)} className="gap-2 text-xs text-amber-600">
                            <PowerOff className="h-3 w-3" /> Inativar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => setConfirmAtivar(s)} className="gap-2 text-xs text-emerald-600">
                            <Power className="h-3 w-3" /> Reativar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Dialog Criar/Editar ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex flex-col gap-0 p-0 w-[calc(100vw-2rem)] max-w-2xl max-h-[calc(100dvh-2rem)] overflow-hidden">
          <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-3">
            <DialogTitle>{editing ? 'Editar Safra' : 'Nova Safra'}</DialogTitle>
          </DialogHeader>
          {/* Corpo rolável: só esta área rola; cabeçalho e rodapé permanecem fixos. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-1 space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Safra 25/26 Soja" />
            </div>
            <div>
              <Label>Código *</Label>
              <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ex: 25/26-SOJ" className="font-mono" />
            </div>
            <div>
              <Label>Escopo do negócio *</Label>
              <Select value={escopo} onValueChange={(v) => setEscopo(v as EscopoNegocio)}>
                <SelectTrigger><SelectValue placeholder="Selecione o escopo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pecuaria">Pecuária</SelectItem>
                  <SelectItem value="agricultura">Agricultura</SelectItem>
                  <SelectItem value="administrativo">Administrativo</SelectItem>
                </SelectContent>
              </Select>
              {escopo && (
                <p className="text-[11px] text-muted-foreground mt-1">{ESCOPO_AJUDA[escopo]}</p>
              )}
            </div>
            <div>
              <Label>Ordem de exibição (opcional)</Label>
              <Input
                value={ordemRaw}
                onChange={e => setOrdemRaw(e.target.value)}
                inputMode="numeric"
                placeholder="0"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground mt-1">0 = ordem padrão · 1, 2, 3… = prioridade manual</p>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} className="resize-none min-h-0" />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3} className="resize-none min-h-0" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ativa} onCheckedChange={setAtiva} />
              <Label>Safra ativa</Label>
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={isSaving}>{isSaving ? 'Salvando...' : (editing ? 'Salvar' : 'Criar')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirmar Inativação ─── */}
      <AlertDialog open={!!confirmDesativar} onOpenChange={(open) => !open && setConfirmDesativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar Safra</AlertDialogTitle>
            <AlertDialogDescription>
              Esta Safra deixará de aparecer nas seleções que carregam apenas Safras ativas. Os vínculos existentes serão preservados. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDesativar}>Inativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Confirmar Reativação ─── */}
      <AlertDialog open={!!confirmAtivar} onOpenChange={(open) => !open && setConfirmAtivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar Safra</AlertDialogTitle>
            <AlertDialogDescription>
              Esta Safra voltará a ficar disponível nas seleções de Safras ativas. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleAtivar}>Reativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
