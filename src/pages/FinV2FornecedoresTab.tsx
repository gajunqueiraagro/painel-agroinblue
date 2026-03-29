import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface Fornecedor {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  fazenda_id: string;
  ativo: boolean;
}

export function FinV2FornecedoresTab() {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const [items, setItems] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fornecedor | null>(null);

  const [nome, setNome] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [fazendaId, setFazendaId] = useState('');
  const [ativo, setAtivo] = useState(true);

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

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setNome(''); setCpfCnpj('');
    setFazendaId(fazendas[0]?.id || '');
    setAtivo(true);
    setDialogOpen(true);
  };

  const openEdit = (f: Fornecedor) => {
    setEditing(f);
    setNome(f.nome);
    setCpfCnpj(f.cpf_cnpj || '');
    setFazendaId(f.fazenda_id);
    setAtivo(f.ativo);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!clienteAtual?.id || !nome.trim() || !fazendaId) {
      toast.error('Preencha nome e fazenda');
      return;
    }
    const payload = {
      cliente_id: clienteAtual.id,
      fazenda_id: fazendaId,
      nome: nome.trim(),
      cpf_cnpj: cpfCnpj.trim() || null,
      ativo,
    };

    if (editing) {
      const { error } = await supabase.from('financeiro_fornecedores').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar'); return; }
      toast.success('Fornecedor atualizado');
    } else {
      const { error } = await supabase.from('financeiro_fornecedores').insert(payload);
      if (error) { toast.error('Erro ao criar'); return; }
      toast.success('Fornecedor criado');
    }
    setDialogOpen(false);
    load();
  };

  const fazendaNome = (id: string) => fazendas.find(f => f.id === id)?.nome || '-';

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Fornecedores</h2>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF/CNPJ</TableHead>
                <TableHead>Fazenda</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>}
              {!loading && items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum fornecedor</TableCell></TableRow>}
              {items.map(f => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.nome}</TableCell>
                  <TableCell className="text-xs">{f.cpf_cnpj || '-'}</TableCell>
                  <TableCell className="text-xs">{fazendaNome(f.fazenda_id)}</TableCell>
                  <TableCell>
                    <Badge variant={f.ativo ? 'default' : 'secondary'} className="text-[10px]">
                      {f.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do fornecedor" />
            </div>
            <div>
              <Label>CPF/CNPJ</Label>
              <Input value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label>Fazenda *</Label>
              <Select value={fazendaId} onValueChange={setFazendaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {fazendas.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ativo} onCheckedChange={setAtivo} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
