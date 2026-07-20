import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ModalOCCtx } from '../tipos';

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tipos de precificação APROVADOS (D7). O modal apenas representa o contrato: nenhuma
// conversão de unidade (peso→arroba) é feita aqui — isso permanece no domínio (RPC/
// backend) ou aguarda definição de produto.
const PRECIF_OPCOES: { value: string; label: string }[] = [
  { value: 'arroba_viva', label: 'Arroba viva' },
  { value: 'arroba_carcaca', label: 'Arroba carcaça' },
  { value: 'cabeca', label: 'Cabeça' },
  { value: 'total', label: 'Total' },
];

export function AbaNegociacao({ ctx }: { ctx: ModalOCCtx }) {
  const { draft, patch, valorBruto, totalDescontos, totalAcrescimos, totalLiquido } = ctx;

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-bold text-lg">Negociação</h3>
      <p className="text-sm text-muted-foreground mb-4">Informe as condições de negociação desta operação.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Tipo de precificação <span className="text-destructive">*</span></Label>
          <Select value={draft.tipo_precificacao} onValueChange={v => patch({ tipo_precificacao: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRECIF_OPCOES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Preço unitário (R$) <span className="text-destructive">*</span></Label>
          <Input type="number" inputMode="decimal" value={draft.preco_unitario} onChange={e => patch({ preco_unitario: e.target.value })} className="h-9" placeholder="0,00" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Condição de pagamento <span className="text-destructive">*</span></Label>
          <Select value={draft.condicao_pagamento || 'À vista'} onValueChange={v => patch({ condicao_pagamento: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="À vista">À vista</SelectItem>
              <SelectItem value="30 dias">30 dias</SelectItem>
              <SelectItem value="A prazo">A prazo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Data do pagamento <span className="text-destructive">*</span></Label>
          <Input type="date" value={draft.data_pagamento_prevista} onChange={e => patch({ data_pagamento_prevista: e.target.value })} className="h-9" />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Quantidade negociada <span className="text-destructive">*</span></Label>
          <Input type="number" inputMode="numeric" value={draft.qtd_negociada} onChange={e => patch({ qtd_negociada: e.target.value })} className="h-9" placeholder="0" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Categoria negociada <span className="text-destructive">*</span></Label>
          <Input value={draft.categoria_negociada} onChange={e => patch({ categoria_negociada: e.target.value })} className="h-9" placeholder="Ex.: Boi gordo" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Peso negociado (kg)</Label>
          <Input type="number" inputMode="decimal" value={draft.peso_negociado_kg} onChange={e => patch({ peso_negociado_kg: e.target.value })} className="h-9" placeholder="0,00" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Peso soberano</Label>
          <Select value={draft.peso_negociado_soberano} onValueChange={v => patch({ peso_negociado_soberano: v as 'medio' | 'total' })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="medio">Médio (por cabeça)</SelectItem>
              <SelectItem value="total">Total</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Valor estimado (R$)</Label>
          <Input type="number" inputMode="decimal" value={draft.valor_estimado} onChange={e => patch({ valor_estimado: e.target.value })} className="h-9" placeholder="0,00" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Valor acordado (R$)</Label>
          <Input type="number" inputMode="decimal" value={draft.valor_acordado} onChange={e => patch({ valor_acordado: e.target.value })} className="h-9" placeholder="0,00" />
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        O tipo e o preço registram o contrato de precificação. O valor da operação é composto pelas
        parcelas na aba Financeiro (fonte única); a conversão entre unidades, quando houver, é resolvida
        no servidor e não é calculada aqui.
      </p>

      <div className="mt-4 rounded-md border bg-muted/40 px-4 py-3">
        <div className="text-xs font-semibold mb-2">Composição do valor (das parcelas)</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-bold">{fmt(valorBruto)}</span><span className="text-xs text-muted-foreground">bruto</span>
          <span>−</span>
          <span className="font-bold">{fmt(totalDescontos)}</span><span className="text-xs text-muted-foreground">desc.</span>
          <span>+</span>
          <span className="font-bold">{fmt(totalAcrescimos)}</span><span className="text-xs text-muted-foreground">bônus</span>
          <span>=</span>
          <span className="font-bold text-primary">{fmt(totalLiquido)}</span><span className="text-xs text-muted-foreground">final</span>
        </div>
      </div>

      <div className="mt-4 space-y-1">
        <Label className="text-xs">Observações</Label>
        <textarea value={draft.observacoes} onChange={e => patch({ observacoes: e.target.value.slice(0, 300) })}
          placeholder="Observações sobre as condições de negociação..." className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm" />
        <div className="text-right text-[10px] text-muted-foreground">{draft.observacoes.length}/300</div>
      </div>
    </div>
  );
}
