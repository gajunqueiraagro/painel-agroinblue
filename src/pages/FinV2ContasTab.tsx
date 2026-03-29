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

interface ContaBancaria {
  id: string;
  nome_conta: string;
  banco: string | null;
  numero_conta: string | null;
  agencia: string | null;
  tipo_conta: string | null;
  codigo_conta: string | null;
  nome_exibicao: string | null;
  fazenda_id: string;
  ativa: boolean;
  ordem_exibicao: number;
}

export function FinV2ContasTab() {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContaBancaria | null>(null);

  const [nome, setNome] = useState('');
  const [banco, setBanco] = useState('');
  const [numero, setNumero] = useState('');
  const [fazendaId, setFazendaId] = useState('');
  const [ativa, setAtiva] = useState(true);
  const [tipoConta, setTipoConta] = useState('cc');
  const [codigoConta, setCodigoConta] = useState('');
  const [nomeExibicao, setNomeExibicao] = useState('');

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('financeiro_contas_bancarias')
      .select('*')
      .eq('cliente_id', clienteAtual.id)
      .order('ordem_exibicao');
    setContas((data as ContaBancaria[]) || []);
    setLoading(false);
  }, [clienteAtual?.id]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setNome(''); setBanco(''); setNumero('');
    setFazendaId(fazendas[0]?.id || '');
    setAtiva(true);
    setTipoConta('cc'); setCodigoConta(''); setNomeExibicao('');
    setDialogOpen(true);
  };

  const openEdit = (c: ContaBancaria) => {
    setEditing(c);
    setNome(c.nome_conta);
    setBanco(c.banco || '');
    setNumero(c.numero_conta || '');
    setFazendaId(c.fazenda_id);
    setAtiva(c.ativa);
    setTipoConta(c.tipo_conta || 'cc');
    setCodigoConta(c.codigo_conta || '');
    setNomeExibicao(c.nome_exibicao || '');
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
      nome_conta: nome.trim(),
      banco: banco.trim() || null,
      numero_conta: numero.trim() || null,
      ativa,
    };

    if (editing) {
      const { error } = await supabase.from('financeiro_contas_bancarias').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar'); return; }
      toast.success('Conta atualizada');
    } else {
      const { error } = await supabase.from('financeiro_contas_bancarias').insert(payload);
      if (error) { toast.error('Erro ao criar conta'); return; }
      toast.success('Conta criada');
    }
    setDialogOpen(false);
    load();
  };

  const fazendaNome = (id: string) => fazendas.find(f => f.id === id)?.nome || '-';

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Contas Bancárias</h2>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Conta</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Nº Conta</TableHead>
                <TableHead>Fazenda</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>}
              {!loading && contas.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma conta cadastrada</TableCell></TableRow>}
              {contas.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome_conta}</TableCell>
                  <TableCell>{c.banco || '-'}</TableCell>
                  <TableCell>{c.numero_conta || '-'}</TableCell>
                  <TableCell className="text-xs">{fazendaNome(c.fazenda_id)}</TableCell>
                  <TableCell>
                    <Badge variant={c.ativa ? 'default' : 'secondary'} className="text-[10px]">
                      {c.ativa ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
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
            <DialogTitle>{editing ? 'Editar Conta' : 'Nova Conta Bancária'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome da Conta *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Bradesco Operação" />
            </div>
            <div>
              <Label>Banco</Label>
              <Input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex: Bradesco" />
            </div>
            <div>
              <Label>Nº Conta</Label>
              <Input value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ex: 12345-6" />
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
              <Switch checked={ativa} onCheckedChange={setAtiva} />
              <Label>Conta ativa</Label>
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
