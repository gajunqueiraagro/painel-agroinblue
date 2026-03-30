import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Eye, Merge, CheckCircle, Trash2, Ban } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface Fornecedor {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string;
  ativo: boolean;
}

interface Fazenda {
  id: string;
  nome: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  editing: Fornecedor | null;
  allFornecedores: Fornecedor[];
  fazendas: Fazenda[];
  clienteId: string;
  onSaved: () => void;
  onSelectExisting?: (fornecedor: Fornecedor) => void;
}

function normalize(s: string) {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSimilarity(input: string, candidate: string): number {
  const ni = normalize(input);
  const nc = normalize(candidate);
  if (!ni || !nc) return 0;
  if (ni === nc) return 1;
  if (nc.includes(ni) || ni.includes(nc)) return 0.8;

  const wordsA = ni.split(' ').filter(w => w.length > 1);
  const wordsB = nc.split(' ').filter(w => w.length > 1);
  if (wordsA.length === 0) return 0;

  let matches = 0;
  for (const wa of wordsA) {
    for (const wb of wordsB) {
      if (wb.includes(wa) || wa.includes(wb)) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.max(wordsA.length, 1);
}

export function FornecedorFormDialog({
  open, onClose, editing, allFornecedores, fazendas, clienteId, onSaved, onSelectExisting,
}: Props) {
  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [fazendaId, setFazendaId] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [lancamentoCount, setLancamentoCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setNome(editing.nome);
        setCpfCnpj(editing.cpf_cnpj || '');
        setFazendaId(editing.fazenda_id);
        setAtivo(editing.ativo);
      } else {
        setNome('');
        setCpfCnpj('');
        setFazendaId(fazendas[0]?.id || '');
        setAtivo(true);
      }
      setReviewId(null);
    }
  }, [open, editing, fazendas]);

  const suggestions = useMemo(() => {
    if (nome.trim().length < 3) return [];
    return allFornecedores
      .filter(f => !editing || f.id !== editing.id)
      .map(f => ({ ...f, score: wordSimilarity(nome, f.nome) }))
      .filter(f => f.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [nome, allFornecedores, editing]);

  const save = useCallback(async () => {
    if (!clienteId || !nome.trim() || !fazendaId) {
      toast.error('Preencha nome e fazenda');
      return;
    }
    setSaving(true);
    const payload = {
      cliente_id: clienteId,
      fazenda_id: fazendaId,
      nome: nome.trim(),
      cpf_cnpj: cpfCnpj.trim() || null,
      ativo,
    };

    if (editing) {
      const { error } = await supabase.from('financeiro_fornecedores').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar'); setSaving(false); return; }
      toast.success('Fornecedor atualizado');
    } else {
      const { error } = await supabase.from('financeiro_fornecedores').insert(payload);
      if (error) { toast.error('Erro ao criar'); setSaving(false); return; }
      toast.success('Fornecedor criado');
    }
    setSaving(false);
    onClose();
    onSaved();
  }, [clienteId, nome, cpfCnpj, fazendaId, ativo, editing, onClose, onSaved]);

  const handleMerge = useCallback(async (target: Fornecedor) => {
    if (!editing) return;
    // Move all lancamentos from current editing to target
    const { error: moveErr } = await supabase
      .from('financeiro_lancamentos_v2')
      .update({ favorecido_id: target.id })
      .eq('favorecido_id', editing.id);
    if (moveErr) { toast.error('Erro ao mesclar lançamentos'); return; }

    // Add current name as alias on the target
    const { data: targetData } = await supabase
      .from('financeiro_fornecedores')
      .select('aliases')
      .eq('id', target.id)
      .single();
    const currentAliases: string[] = (targetData as any)?.aliases || [];
    if (!currentAliases.includes(editing.nome)) {
      await supabase
        .from('financeiro_fornecedores')
        .update({ aliases: [...currentAliases, editing.nome] } as any)
        .eq('id', target.id);
    }

    // Deactivate the duplicate
    await supabase.from('financeiro_fornecedores').update({ ativo: false }).eq('id', editing.id);

    toast.success(`Mesclado com "${target.nome}". Lançamentos migrados.`);
    onClose();
    onSaved();
  }, [editing, onClose, onSaved]);

  const handleUseExisting = useCallback((target: Fornecedor) => {
    onSelectExisting?.(target);
    onClose();
  }, [onSelectExisting, onClose]);

  const reviewFornecedor = reviewId ? allFornecedores.find(f => f.id === reviewId) : null;
  const fazendaNome = (id: string) => fazendas.find(f => f.id === id)?.nome || '-';

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome *</Label>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Nome do fornecedor"
              className="h-9"
              autoFocus
            />
          </div>

          {/* Suggestions panel */}
          {suggestions.length > 0 && (
            <div className="border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700/40 rounded-md p-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-[11px] font-semibold">Já existem cadastros semelhantes. Revise antes de criar um novo.</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Sugestões de cadastro semelhante:</p>
              <div className="space-y-1">
                {suggestions.map(s => (
                  <div key={s.id} className="flex items-center gap-1.5 bg-background/80 rounded px-2 py-1 border border-border/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate" title={s.nome}>{s.nome}</p>
                      <p className="text-[9px] text-muted-foreground">{fazendaNome(s.fazenda_id)}</p>
                    </div>
                    <Badge variant={s.ativo ? 'default' : 'secondary'} className="text-[8px] px-1 py-0 shrink-0">
                      {s.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <div className="flex gap-0.5 shrink-0">
                      {!editing && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 text-[9px] px-1.5 gap-0.5"
                          onClick={() => handleUseExisting(s)}
                          title="Usar este cadastro existente"
                        >
                          <CheckCircle className="h-2.5 w-2.5" />Usar
                        </Button>
                      )}
                      {editing && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 text-[9px] px-1.5 gap-0.5"
                          onClick={() => handleMerge(s)}
                          title="Mesclar: mover lançamentos para este"
                        >
                          <Merge className="h-2.5 w-2.5" />Mesclar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[9px] px-1.5 gap-0.5"
                        onClick={() => setReviewId(reviewId === s.id ? null : s.id)}
                        title="Ver detalhes"
                      >
                        <Eye className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Review detail */}
              {reviewFornecedor && (
                <div className="mt-1 bg-muted/50 rounded p-2 text-[10px] space-y-0.5 border border-border/30">
                  <p><strong>Nome:</strong> {reviewFornecedor.nome}</p>
                  <p><strong>CPF/CNPJ:</strong> {reviewFornecedor.cpf_cnpj || '-'}</p>
                  <p><strong>Fazenda:</strong> {fazendaNome(reviewFornecedor.fazenda_id)}</p>
                  <p><strong>Status:</strong> {reviewFornecedor.ativo ? 'Ativo' : 'Inativo'}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">CPF/CNPJ</Label>
            <Input value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} className="h-9" placeholder="000.000.000-00" />
          </div>
          <div>
            <Label className="text-xs">Fazenda *</Label>
            <Select value={fazendaId} onValueChange={setFazendaId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {fazendas.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} />
            <Label className="text-xs">Ativo</Label>
          </div>
        </div>

        <DialogFooter className="gap-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={save} disabled={saving || !nome.trim()}>
            {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
