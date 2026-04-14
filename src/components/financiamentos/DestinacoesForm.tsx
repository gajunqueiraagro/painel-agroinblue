import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export interface DestinacaoItem {
  id: string;
  descricao: string;
  tipo: 'conta_propria' | 'pagamento_fornecedor' | 'desconto_fonte';
  valor: number;
  fornecedor_id: string;
  conta_bancaria_id: string;
  plano_conta_id: string;
  gerar_lancamento: boolean;
  observacao: string;
}

interface Props {
  clienteId: string;
  valorContrato: number;
  destinacoes: DestinacaoItem[];
  onChange: (items: DestinacaoItem[]) => void;
}

const TIPO_LABELS: Record<DestinacaoItem['tipo'], string> = {
  conta_propria: '💰 Crédito em conta própria',
  pagamento_fornecedor: '🏢 Pagamento direto a fornecedor',
  desconto_fonte: '✂️ Desconto na fonte (IOF, taxas, despesas)',
};

const EMPTY_ITEM = (): DestinacaoItem => ({
  id: crypto.randomUUID(),
  descricao: '',
  tipo: 'conta_propria',
  valor: 0,
  fornecedor_id: '',
  conta_bancaria_id: '',
  plano_conta_id: '',
  gerar_lancamento: true,
  observacao: '',
});

export function DestinacoesForm({ clienteId, valorContrato, destinacoes, onChange }: Props) {
  /* ── Lookups ── */
  const { data: fornecedores = [] } = useQuery({
    queryKey: ['dest-fornecedores', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .order('nome');
      return data ?? [];
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ['dest-contas', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_contas_bancarias')
        .select('id, nome_conta, nome_exibicao, banco')
        .eq('cliente_id', clienteId)
        .eq('ativa', true)
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  const { data: planos = [] } = useQuery({
    queryKey: ['dest-planos', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_plano_contas')
        .select('id, subcentro, centro_custo, macro_custo, tipo_operacao')
        .eq('ativo', true)
        .in('tipo_operacao', ['1-Entradas', '2-Saídas'])
        .or(`cliente_id.eq.${clienteId},cliente_id.is.null`)
        .order('ordem_exibicao');
      return data ?? [];
    },
  });

  /* ── Helpers ── */
  const update = (idx: number, patch: Partial<DestinacaoItem>) => {
    onChange(destinacoes.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };
  const remove = (idx: number) => onChange(destinacoes.filter((_, i) => i !== idx));
  const add = () => onChange([...destinacoes, EMPTY_ITEM()]);

  const totalDistribuido = destinacoes.reduce((s, d) => s + (d.valor || 0), 0);
  const diferenca = valorContrato - totalDistribuido;

  const fmtMoney = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-3">
      {/* Cards */}
      {destinacoes.map((item, idx) => (
        <DestinacaoCard
          key={item.id}
          item={item}
          idx={idx}
          fornecedores={fornecedores}
          contas={contas}
          planos={planos}
          onUpdate={update}
          onRemove={remove}
        />
      ))}

      {/* Botão adicionar */}
      <Button variant="outline" size="sm" className="w-full gap-1" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> Adicionar destinação
      </Button>

      {/* Totalizador */}
      {destinacoes.length > 0 && (
        <div className="rounded-lg border p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Distribuído</span>
            <span className="font-semibold">{fmtMoney(totalDistribuido)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contrato</span>
            <span className="font-semibold">{fmtMoney(valorContrato)}</span>
          </div>
          <div className="border-t pt-1 flex justify-between items-center">
            <span className="font-semibold">Diferença</span>
            {diferenca === 0 ? (
              <span className="text-green-600 font-bold">✅ Valor totalmente distribuído</span>
            ) : diferenca > 0 ? (
              <span className="text-yellow-600 font-bold">⚠️ {fmtMoney(diferenca)} ainda não distribuído</span>
            ) : (
              <span className="text-red-600 font-bold">⚠️ Total distribuído excede o valor do contrato</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Card individual ── */
interface CardProps {
  item: DestinacaoItem;
  idx: number;
  fornecedores: { id: string; nome: string }[];
  contas: { id: string; nome_conta: string; nome_exibicao: string | null; banco: string | null }[];
  planos: { id: string; subcentro: string | null; centro_custo: string | null; macro_custo: string | null; tipo_operacao: string | null }[];
  onUpdate: (idx: number, patch: Partial<DestinacaoItem>) => void;
  onRemove: (idx: number) => void;
}

function DestinacaoCard({ item, idx, fornecedores, contas, planos, onUpdate, onRemove }: CardProps) {
  const [fornOpen, setFornOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 text-destructive"
        onClick={() => onRemove(idx)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <div className="grid grid-cols-2 gap-2 pr-8">
        <div>
          <Label className="text-[10px]">Descrição *</Label>
          <Input
            value={item.descricao}
            onChange={e => onUpdate(idx, { descricao: e.target.value })}
            placeholder="Ex: Construção Civil"
            className="h-7 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px]">Valor *</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={item.valor || ''}
            onChange={e => onUpdate(idx, { valor: Number(e.target.value) })}
            className="h-7 text-xs"
          />
        </div>
      </div>

      <div>
        <Label className="text-[10px]">Tipo *</Label>
        <Select value={item.tipo} onValueChange={v => onUpdate(idx, { tipo: v as DestinacaoItem['tipo'] })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(TIPO_LABELS) as DestinacaoItem['tipo'][]).map(k => (
              <SelectItem key={k} value={k}>{TIPO_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fornecedor – só para pagamento_fornecedor */}
      {item.tipo === 'pagamento_fornecedor' && (
        <div>
          <Label className="text-[10px]">Fornecedor</Label>
          <Popover open={fornOpen} onOpenChange={setFornOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between h-7 text-xs font-normal">
                {item.fornecedor_id
                  ? fornecedores.find(f => f.id === item.fornecedor_id)?.nome ?? 'Selecionar...'
                  : 'Selecionar fornecedor...'}
                <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder="Buscar fornecedor..." />
                <CommandEmpty>Nenhum encontrado.</CommandEmpty>
                <CommandList>
                  <CommandGroup>
                    {fornecedores.map(f => (
                      <CommandItem
                        key={f.id}
                        value={f.nome}
                        onSelect={() => { onUpdate(idx, { fornecedor_id: f.id }); setFornOpen(false); }}
                      >
                        {f.nome}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Conta bancária – só para conta_propria */}
      {item.tipo === 'conta_propria' && (
        <div>
          <Label className="text-[10px]">Conta bancária</Label>
          <Select value={item.conta_bancaria_id} onValueChange={v => onUpdate(idx, { conta_bancaria_id: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {contas.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome_exibicao || c.nome_conta}{c.banco ? ` (${c.banco})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Plano de contas – sempre visível */}
      <div>
        <Label className="text-[10px]">Plano de contas</Label>
        <Select value={item.plano_conta_id} onValueChange={v => onUpdate(idx, { plano_conta_id: v })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {planos.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.subcentro || p.centro_custo} ({p.macro_custo})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={`gen-${item.id}`}
          checked={item.gerar_lancamento}
          onCheckedChange={v => onUpdate(idx, { gerar_lancamento: !!v })}
        />
        <Label htmlFor={`gen-${item.id}`} className="text-[10px] cursor-pointer">
          Gerar lançamento financeiro automaticamente
        </Label>
      </div>

      <div>
        <Label className="text-[10px]">Observação</Label>
        <Input
          value={item.observacao}
          onChange={e => onUpdate(idx, { observacao: e.target.value })}
          placeholder="Opcional"
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}
