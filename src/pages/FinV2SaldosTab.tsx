import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface SaldoBancario {
  id: string;
  ano_mes: string;
  conta_bancaria_id: string;
  fazenda_id: string;
  saldo_inicial: number;
  saldo_final: number;
  fechado: boolean;
  origem_saldo: string | null;
  observacao: string | null;
}

interface ContaRef {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ANOS = ['2023', '2024', '2025', '2026'];
const MESES = [
  { v: '01', l: 'Jan' }, { v: '02', l: 'Fev' }, { v: '03', l: 'Mar' },
  { v: '04', l: 'Abr' }, { v: '05', l: 'Mai' }, { v: '06', l: 'Jun' },
  { v: '07', l: 'Jul' }, { v: '08', l: 'Ago' }, { v: '09', l: 'Set' },
  { v: '10', l: 'Out' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dez' },
];

export function FinV2SaldosTab() {
  const { clienteAtual } = useCliente();
  const { fazendas, fazendaAtual } = useFazenda();
  const [saldos, setSaldos] = useState<SaldoBancario[]>([]);
  const [contas, setContas] = useState<ContaRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SaldoBancario | null>(null);

  const [filtroAno, setFiltroAno] = useState(String(new Date().getFullYear()));

  const [anoMes, setAnoMes] = useState('');
  const [contaId, setContaId] = useState('');
  const [fazendaId, setFazendaId] = useState('');
  const [saldoInicial, setSaldoInicial] = useState('0,00');
  const [saldoFinal, setSaldoFinal] = useState('0,00');
  const [origem, setOrigem] = useState('manual');

  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    setLoading(true);

    const [{ data: sData }, { data: cData }] = await Promise.all([
      supabase
        .from('financeiro_saldos_bancarios_v2')
        .select('*')
        .eq('cliente_id', clienteAtual.id)
        .gte('ano_mes', `${filtroAno}-01`)
        .lte('ano_mes', `${filtroAno}-12`)
        .order('ano_mes', { ascending: false }),
      supabase
        .from('financeiro_contas_bancarias')
        .select('id, nome_conta, nome_exibicao')
        .eq('cliente_id', clienteAtual.id)
        .eq('ativa', true),
    ]);
    setSaldos((sData as SaldoBancario[]) || []);
    setContas((cData as ContaRef[]) || []);
    setLoading(false);
  }, [clienteAtual?.id, filtroAno]);

  useEffect(() => { load(); }, [load]);

  const contaNome = (id: string) => contas.find(c => c.id === id)?.nome_conta || '-';

  const parseBRL = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const toBRL = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const openNew = () => {
    setEditing(null);
    const m = String(new Date().getMonth() + 1).padStart(2, '0');
    setAnoMes(`${filtroAno}-${m}`);
    setContaId(contas[0]?.id || '');
    setFazendaId(fazendaAtual?.id || fazendas[0]?.id || '');
    setSaldoInicial('0,00');
    setSaldoFinal('0,00');
    setOrigem('manual');
    setDialogOpen(true);
  };

  const openEdit = (s: SaldoBancario) => {
    setEditing(s);
    setAnoMes(s.ano_mes);
    setContaId(s.conta_bancaria_id);
    setFazendaId(s.fazenda_id);
    setSaldoInicial(toBRL(s.saldo_inicial));
    setSaldoFinal(toBRL(s.saldo_final));
    setOrigem(s.origem_saldo || 'manual');
    setDialogOpen(true);
  };

  const save = async () => {
    if (!clienteAtual?.id || !anoMes || !contaId || !fazendaId) {
      toast.error('Preencha todos os campos');
      return;
    }
    const payload = {
      cliente_id: clienteAtual.id,
      fazenda_id: fazendaId,
      conta_bancaria_id: contaId,
      ano_mes: anoMes,
      saldo_inicial: parseBRL(saldoInicial),
      saldo_final: parseBRL(saldoFinal),
      origem_saldo: origem,
    };

    if (editing) {
      const { error } = await supabase.from('financeiro_saldos_bancarios_v2').update(payload).eq('id', editing.id);
      if (error) { toast.error('Erro ao atualizar'); return; }
      toast.success('Saldo atualizado');
    } else {
      const { error } = await supabase.from('financeiro_saldos_bancarios_v2').insert(payload);
      if (error) { toast.error('Erro ao criar'); console.error(error); return; }
      toast.success('Saldo registrado');
    }
    setDialogOpen(false);
    load();
  };

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Saldos Bancários Mensais</h2>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
      </div>

      <div className="flex gap-2">
        <Select value={filtroAno} onValueChange={setFiltroAno}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ANOS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-right">Saldo Inicial</TableHead>
                <TableHead className="text-right">Saldo Final</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>}
              {!loading && saldos.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum saldo registrado</TableCell></TableRow>}
              {saldos.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-xs">{s.ano_mes}</TableCell>
                  <TableCell className="text-xs">{contaNome(s.conta_bancaria_id)}</TableCell>
                  <TableCell className="text-right text-xs">R$ {fmtBRL(s.saldo_inicial)}</TableCell>
                  <TableCell className="text-right text-xs font-medium">R$ {fmtBRL(s.saldo_final)}</TableCell>
                  <TableCell>
                    <Badge variant={s.fechado ? 'default' : 'outline'} className="text-[10px]">
                      {s.fechado ? 'Fechado' : 'Aberto'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
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
            <DialogTitle>{editing ? 'Editar Saldo' : 'Novo Saldo Mensal'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Ano-Mês *</Label>
              <Input value={anoMes} onChange={e => setAnoMes(e.target.value)} placeholder="2025-01" />
            </div>
            <div>
              <Label>Conta Bancária *</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {contas.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_conta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Saldo Inicial</Label>
                <Input value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} />
              </div>
              <div>
                <Label>Saldo Final</Label>
                <Input value={saldoFinal} onChange={e => setSaldoFinal(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={origem} onValueChange={setOrigem}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="extrato">Extrato</SelectItem>
                  <SelectItem value="calculado">Calculado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? 'Salvar' : 'Registrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
