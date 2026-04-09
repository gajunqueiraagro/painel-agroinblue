import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Pencil, ChevronDown } from 'lucide-react';
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
  conta_digito: string | null;
  fazenda_id: string;
  ativa: boolean;
  ordem_exibicao: number;
}

const TIPO_ORDER: Record<string, number> = { cc: 0, inv: 1, cartao: 2 };
const TIPO_LABEL: Record<string, string> = { cc: 'Conta Corrente', inv: 'Investimentos', cartao: 'Cartão de Crédito' };
const BADGE_LABEL: Record<string, string> = { cc: 'CC', inv: 'INV', cartao: 'CARTÃO' };
const BADGE_CLASS: Record<string, string> = {
  cc: 'bg-blue-100 text-blue-700 border-blue-200',
  inv: 'bg-purple-100 text-purple-700 border-purple-200',
  cartao: 'bg-orange-100 text-orange-700 border-orange-200',
};

function parseNum(code: string | null) {
  if (!code) return 0;
  const parts = code.split('-');
  return parseInt(parts[parts.length - 1] || '0', 10);
}

/** Build display label: "Nome (Ag-Conta)" when bank details exist */
export function contaDisplayLabel(c: { nome_exibicao?: string | null; nome_conta: string; agencia?: string | null; numero_conta?: string | null; conta_digito?: string | null }): string {
  const nome = c.nome_exibicao || c.nome_conta;
  const parts: string[] = [];
  if (c.agencia) parts.push(c.agencia);
  if (c.numero_conta) {
    parts.push(c.conta_digito ? `${c.numero_conta}-${c.conta_digito}` : c.numero_conta);
  }
  if (parts.length > 0) return `${nome} (${parts.join(' ')})`;
  return nome;
}

export function FinV2ContasTab() {
  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContaBancaria | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Form fields — principal
  const [nomeExibicao, setNomeExibicao] = useState('');
  const [tipoConta, setTipoConta] = useState('cc');
  const [banco, setBanco] = useState('');
  const [fazendaId, setFazendaId] = useState('');
  const [ativa, setAtiva] = useState(true);

  // Form fields — avançado
  const [codigoConta, setCodigoConta] = useState('');
  const [agencia, setAgencia] = useState('');
  const [numeroConta, setNumeroConta] = useState('');
  const [contaDigito, setContaDigito] = useState('');

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

  const grouped = useMemo(() => {
    const groups: { tipo: string; label: string; items: ContaBancaria[] }[] = [
      { tipo: 'cc', label: TIPO_LABEL.cc, items: [] },
      { tipo: 'inv', label: TIPO_LABEL.inv, items: [] },
      { tipo: 'cartao', label: TIPO_LABEL.cartao, items: [] },
    ];
    const sorted = [...contas].sort((a, b) => {
      const ga = TIPO_ORDER[a.tipo_conta || 'cc'] ?? 99;
      const gb = TIPO_ORDER[b.tipo_conta || 'cc'] ?? 99;
      if (ga !== gb) return ga - gb;
      return parseNum(a.codigo_conta) - parseNum(b.codigo_conta);
    });
    sorted.forEach(c => {
      const t = c.tipo_conta || 'cc';
      const g = groups.find(g => g.tipo === t);
      if (g) g.items.push(c);
      else groups[0].items.push(c);
    });
    return groups.filter(g => g.items.length > 0);
  }, [contas]);

  const openNew = () => {
    setEditing(null);
    setNomeExibicao('');
    setTipoConta('cc');
    setBanco('');
    setFazendaId(fazendas[0]?.id || '');
    setAtiva(true);
    setCodigoConta('');
    setAgencia('');
    setNumeroConta('');
    setContaDigito('');
    setAdvancedOpen(false);
    setDialogOpen(true);
  };

  const openEdit = (c: ContaBancaria) => {
    setEditing(c);
    setNomeExibicao(c.nome_exibicao || c.nome_conta || '');
    setTipoConta(c.tipo_conta || 'cc');
    setBanco(c.banco || '');
    setFazendaId(c.fazenda_id);
    setAtiva(c.ativa);
    setCodigoConta(c.codigo_conta || '');
    setAgencia(c.agencia || '');
    setNumeroConta(c.numero_conta || '');
    setContaDigito(c.conta_digito || '');
    setAdvancedOpen(!!(c.codigo_conta || c.agencia || c.numero_conta || c.conta_digito));
    setDialogOpen(true);
  };

  const save = async () => {
    if (!clienteAtual?.id || !nomeExibicao.trim() || !fazendaId) {
      toast.error('Preencha o nome da conta e a fazenda');
      return;
    }
    const displayName = nomeExibicao.trim();
    const payload = {
      cliente_id: clienteAtual.id,
      fazenda_id: fazendaId,
      nome_conta: displayName, // keep nome_conta synced for backward compat
      nome_exibicao: displayName,
      banco: banco.trim() || null,
      tipo_conta: tipoConta,
      codigo_conta: codigoConta.trim() || null,
      agencia: agencia.trim() || null,
      numero_conta: numeroConta.trim() || null,
      conta_digito: contaDigito.trim() || null,
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

  const cellClass = "text-[12px] font-medium leading-tight py-1 px-2";

  const formatContaBancaria = (c: ContaBancaria) => {
    const parts: string[] = [];
    if (c.agencia) parts.push(c.agencia);
    if (c.numero_conta) {
      parts.push(c.conta_digito ? `${c.numero_conta}-${c.conta_digito}` : c.numero_conta);
    }
    return parts.length > 0 ? parts.join(' ') : '-';
  };

  return (
    <div className="w-full p-4 pb-20 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Contas Bancárias</h2>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nova Conta</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Tipo</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Nome da Conta</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Banco</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Ag / Conta</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Fazenda</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide py-1.5 px-2">Status</TableHead>
                <TableHead className="w-8 py-1.5 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              )}
              {!loading && contas.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma conta cadastrada</TableCell></TableRow>
              )}
              {!loading && grouped.map((group) => (
                <>
                  <TableRow key={`group-${group.tipo}`} className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={7} className="text-[13px] font-semibold text-foreground/80 py-1.5 px-2 border-t">
                      {group.label}
                    </TableCell>
                  </TableRow>
                  {group.items.map(c => (
                    <TableRow key={c.id} className="h-auto">
                      <TableCell className={cellClass}>
                        <Badge variant="outline" className={`text-[9px] font-bold px-1.5 py-0 leading-tight border ${BADGE_CLASS[c.tipo_conta || 'cc']}`}>
                          {BADGE_LABEL[c.tipo_conta || 'cc']}
                        </Badge>
                      </TableCell>
                      <TableCell className={cellClass}>
                        <span className="font-semibold">{c.nome_exibicao || c.nome_conta}</span>
                        {c.codigo_conta && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground font-mono">({c.codigo_conta})</span>
                        )}
                      </TableCell>
                      <TableCell className={cellClass}>{c.banco || '-'}</TableCell>
                      <TableCell className={`${cellClass} font-mono text-[11px]`}>{formatContaBancaria(c)}</TableCell>
                      <TableCell className={cellClass}>{fazendaNome(c.fazenda_id)}</TableCell>
                      <TableCell className={cellClass}>
                        <Badge variant={c.ativa ? 'default' : 'secondary'} className="text-[9px] px-1.5 py-0 leading-tight">
                          {c.ativa ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1 px-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(c)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
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
            {/* ─── Bloco Principal ─── */}
            <div>
              <Label>Nome da Conta *</Label>
              <Input value={nomeExibicao} onChange={e => setNomeExibicao(e.target.value)} placeholder="Ex: Itaú Personalité ADM" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de Conta *</Label>
                <Select value={tipoConta} onValueChange={setTipoConta}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cc">Conta Corrente</SelectItem>
                    <SelectItem value="inv">Investimento</SelectItem>
                    <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Banco</Label>
                <Input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex: Itaú" />
              </div>
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

            {/* ─── Bloco Avançado ─── */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground text-xs">
                  Dados bancários avançados
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div>
                  <Label>Código curto</Label>
                  <Input value={codigoConta} onChange={e => setCodigoConta(e.target.value)} placeholder="Ex: cc-001 (uso técnico/importação)" className="font-mono text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Agência</Label>
                    <Input value={agencia} onChange={e => setAgencia(e.target.value)} placeholder="1234" />
                  </div>
                  <div>
                    <Label>Nº Conta</Label>
                    <Input value={numeroConta} onChange={e => setNumeroConta(e.target.value)} placeholder="56789" />
                  </div>
                  <div>
                    <Label>Dígito</Label>
                    <Input value={contaDigito} onChange={e => setContaDigito(e.target.value)} placeholder="0" maxLength={2} />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
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
