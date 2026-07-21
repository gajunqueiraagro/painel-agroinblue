import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DARK_GLASS_CONTENT } from '@/components/shared/ContaBancariaSelect';

// Aba Negociação — casca VISUAL. Lê os lotes da Compra a partir do formApi (read-only: a
// Compra é dona de Categoria/Quantidade/Peso) e acrescenta os campos comerciais por lote.
// Estado local é SOMENTE de exibição (não persiste, não altera payload) — mesma natureza do
// dropdown de Fazenda visual. Nenhuma fonte de dados nova, nenhum estado funcional duplicado.
interface Props {
  categoria: string;
  categoriasDisponiveis: { value: string; label: string }[];
  quantidadeNum: number;
  pesoKgNum: number; // peso médio (o estado legado pesoKg = pesoMedioKg)
}

const CRITERIOS = [
  { value: 'por_kg', label: 'Por kg', unidade: 'R$/kg' },
  { value: 'por_cab', label: 'Por cabeça', unidade: 'R$/cabeça' },
  { value: 'total', label: 'Valor total', unidade: 'Valor total' },
];

const GRID = 'grid grid-cols-[1.3fr_0.7fr_0.9fr_1fr_1.1fr_1fr_1fr] gap-2';

export function AbaNegociacaoLotes({ categoria, categoriasDisponiveis, quantidadeNum, pesoKgNum }: Props) {
  const [criterio, setCriterio] = useState('por_kg');
  const [valorInformado, setValorInformado] = useState('');

  const catLabel = categoriasDisponiveis.find(c => c.value === categoria)?.label || '—';
  const pesoTotal = quantidadeNum > 0 && pesoKgNum > 0 ? quantidadeNum * pesoKgNum : 0;
  const fmt = (n: number) => (n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—');
  const criterioUnidade = CRITERIOS.find(c => c.value === criterio)?.unidade || 'Valor';
  const temLote = quantidadeNum > 0 && !!categoria;

  return (
    <div className="rounded-md border bg-card p-2 shadow-sm space-y-1 min-w-0">
      <div>
        <div className="text-[12px] font-semibold text-foreground">Negociação dos Lotes</div>
        <div className="text-[11px] text-muted-foreground">Defina o critério e o valor negociado para cada lote da compra.</div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className={`${GRID} px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground`}>
            <span>Categoria</span>
            <span className="text-right">Qtde</span>
            <span className="text-right">Peso Méd.</span>
            <span className="text-right">Peso Tot.</span>
            <span>Critério</span>
            <span className="text-right">Valor</span>
            <span className="text-right">Total</span>
          </div>

          {temLote ? (
            <div className={`${GRID} items-center rounded-md border bg-muted/20 px-1 py-0.5`}>
              {/* Referência read-only — dono é a aba Compra */}
              <div className="text-[11px] truncate">{catLabel}</div>
              <div className="text-[11px] text-right tabular-nums">{quantidadeNum}</div>
              <div className="text-[11px] text-right tabular-nums">{fmt(pesoKgNum)} kg</div>
              <div className="text-[11px] text-right tabular-nums">{fmt(pesoTotal)} kg</div>
              {/* Campos comerciais (visual nesta rodada) */}
              <Select value={criterio} onValueChange={setCriterio}>
                <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent className={DARK_GLASS_CONTENT}>
                  {CRITERIOS.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={valorInformado} onChange={e => setValorInformado(e.target.value)} inputMode="decimal" placeholder={criterioUnidade} className="h-6 text-[11px] text-right tabular-nums" />
              <Input value="R$ —" readOnly tabIndex={-1} className="h-6 text-[11px] text-right tabular-nums bg-muted cursor-default" />
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/10 px-3 py-4 text-center text-[11px] text-muted-foreground">
              Preencha um lote na aba Compra para negociar.
            </div>
          )}
        </div>
      </div>

      {/* Totais da Negociação (somente visual nesta rodada) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
        <div className="rounded-md border bg-muted/20 px-2 py-1"><div className="text-[10px] text-muted-foreground">Lotes</div><div className="font-bold text-[12px]">{temLote ? 1 : '—'}</div></div>
        <div className="rounded-md border bg-muted/20 px-2 py-1"><div className="text-[10px] text-muted-foreground">Animais</div><div className="font-bold text-[12px]">{quantidadeNum > 0 ? quantidadeNum : '—'}</div></div>
        <div className="rounded-md border bg-muted/20 px-2 py-1"><div className="text-[10px] text-muted-foreground">Peso total</div><div className="font-bold text-[12px]">{pesoTotal > 0 ? `${fmt(pesoTotal)} kg` : '—'}</div></div>
        <div className="rounded-md border bg-muted/20 px-2 py-1"><div className="text-[10px] text-muted-foreground">Valor total negociado</div><div className="font-bold text-[12px] text-primary">R$ —</div></div>
      </div>
    </div>
  );
}
