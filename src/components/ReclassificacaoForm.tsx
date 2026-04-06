import { useState, useMemo, useEffect } from 'react';
import { CATEGORIAS, Categoria, Lancamento, kgToArrobas } from '@/types/cattle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { useIntegerInput, useDecimalInput } from '@/hooks/useFormattedNumber';
import { RefreshCw, ArrowRight, Scale, Info } from 'lucide-react';

interface Props {
  onAdicionar: (l: Omit<Lancamento, 'id'>) => void;
  dataInicial?: string;
  lancamentos?: Lancamento[];
  ano?: number;
}

/**
 * Derive the best peso médio for a category from existing lancamentos.
 * Uses the most recent lancamento that has pesoMedioKg for this category.
 * Also computes a rough saldo count from lancamentos.
 */
function deriveCategoryInfo(
  categoria: Categoria,
  lancamentos: Lancamento[],
): { pesoMedio: number | null; saldo: number } {
  // Find most recent peso for this category
  let pesoMedio: number | null = null;
  const sorted = [...lancamentos]
    .filter(l => l.categoria === categoria && l.pesoMedioKg && l.pesoMedioKg > 0)
    .sort((a, b) => b.data.localeCompare(a.data));

  if (sorted.length > 0) {
    // Weighted average of last few entries for reliability
    const recent = sorted.slice(0, 5);
    let totalPeso = 0;
    let totalQtd = 0;
    for (const l of recent) {
      totalPeso += (l.pesoMedioKg || 0) * l.quantidade;
      totalQtd += l.quantidade;
    }
    pesoMedio = totalQtd > 0 ? totalPeso / totalQtd : null;
  }

  // Rough saldo (entradas - saidas for this category)
  let saldo = 0;
  for (const l of lancamentos) {
    const isEntrada = ['nascimento', 'compra', 'transferencia_entrada'].includes(l.tipo);
    const isSaida = ['abate', 'venda', 'transferencia_saida', 'consumo', 'morte'].includes(l.tipo);
    const isReclass = l.tipo === 'reclassificacao';

    if (l.categoria === categoria) {
      if (isEntrada) saldo += l.quantidade;
      else if (isSaida) saldo -= l.quantidade;
      else if (isReclass) saldo -= l.quantidade;
    }
    if (isReclass && l.categoriaDestino === categoria) {
      saldo += l.quantidade;
    }
  }

  return { pesoMedio, saldo };
}

export function ReclassificacaoForm({ onAdicionar, dataInicial, lancamentos = [], ano }: Props) {
  const [categoriaOrigem, setCategoriaOrigem] = useState<Categoria>('desmama_m');
  const [categoriaDestino, setCategoriaDestino] = useState<Categoria>('garrotes');
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(dataInicial || format(new Date(), 'yyyy-MM-dd'));
  const [pesoKg, setPesoKg] = useState('');
  const [isPrevisto, setIsPrevisto] = useState(false);

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const origemInfo = useMemo(() => deriveCategoryInfo(categoriaOrigem, lancamentos), [categoriaOrigem, lancamentos]);
  const destinoInfo = useMemo(() => deriveCategoryInfo(categoriaDestino, lancamentos), [categoriaDestino, lancamentos]);

  // Auto-suggest peso when origin changes and field is empty
  useEffect(() => {
    if (origemInfo.pesoMedio && !pesoKg) {
      setPesoKg(origemInfo.pesoMedio.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaOrigem]);

  const origemLabel = CATEGORIAS.find(c => c.value === categoriaOrigem)?.label || '';
  const destinoLabel = CATEGORIAS.find(c => c.value === categoriaDestino)?.label || '';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantidade || Number(quantidade) <= 0) return;
    if (categoriaOrigem === categoriaDestino) return;

    onAdicionar({
      data,
      tipo: 'reclassificacao',
      quantidade: Number(quantidade),
      categoria: categoriaOrigem,
      categoriaDestino,
      pesoMedioKg: pesoKg ? Number(pesoKg) : undefined,
      pesoMedioArrobas: pesoKg ? kgToArrobas(Number(pesoKg)) : undefined,
      statusOperacional: isPrevisto ? 'previsto' : 'conciliado',
    });

    setQuantidade('');
    setPesoKg('');
  };

  const fmtNum = (v: number | null, dec = 1) =>
    v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-lg border shadow-sm max-w-xl">
      {/* ─── Linha 1: Título + Toggle ─── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 rounded-t-lg">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-bold text-foreground">Evolução de Categoria</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold ${!isPrevisto ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            Realizado
          </span>
          <Switch
            checked={isPrevisto}
            onCheckedChange={setIsPrevisto}
            className="data-[state=checked]:bg-orange-500 h-5 w-9"
          />
          <span className={`text-[11px] font-semibold ${isPrevisto ? 'text-orange-600' : 'text-muted-foreground'}`}>
            Previsto
          </span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* ─── Linha 2: Origem → Destino ─── */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
          <div>
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">De (Origem)</Label>
            <Select value={categoriaOrigem} onValueChange={v => { setCategoriaOrigem(v as Categoria); setPesoKg(''); }}>
              <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-52">
                {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value} className="text-[12px]">{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground mb-2" />
          <div>
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Para (Destino)</Label>
            <Select value={categoriaDestino} onValueChange={v => setCategoriaDestino(v as Categoria)}>
              <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-52">
                {CATEGORIAS.filter(c => c.value !== categoriaOrigem).map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-[12px]">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ─── Linha 3: Data + Quantidade ─── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Data</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} className="mt-1 h-9 text-[12px]" />
          </div>
          <div>
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Qtd. Cabeças</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={qtdInput.displayValue}
              onChange={qtdInput.onChange}
              onBlur={qtdInput.onBlur}
              onFocus={qtdInput.onFocus}
              placeholder="0"
              className="mt-1 h-9 text-[12px] text-center font-bold"
            />
          </div>
        </div>

        {/* ─── Linha 4: Peso médio ─── */}
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Peso Médio (kg)</Label>
            {origemInfo.pesoMedio && (
              <span className="text-[10px] text-orange-600 flex items-center gap-1">
                <Scale className="h-3 w-3" />
                Sugerido: {fmtNum(origemInfo.pesoMedio)} kg
              </span>
            )}
          </div>
          <Input
            type="text"
            inputMode="decimal"
            value={pesoInput.displayValue}
            onChange={pesoInput.onChange}
            onBlur={pesoInput.onBlur}
            onFocus={pesoInput.onFocus}
            placeholder={origemInfo.pesoMedio ? fmtNum(origemInfo.pesoMedio) : '0,00'}
            className="mt-1 h-9 text-[12px]"
          />
        </div>

        {/* ─── Linha 5: Resumo operacional ─── */}
        <div className={`rounded-md border px-3 py-2 text-[10px] space-y-1 ${isPrevisto ? 'bg-orange-50/60 border-orange-200' : 'bg-emerald-50/60 border-emerald-200'}`}>
          <div className="flex items-center gap-1 mb-1">
            <Info className="h-3 w-3 text-muted-foreground" />
            <span className="font-semibold text-muted-foreground uppercase tracking-wider">Resumo da operação</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Origem:</span>
              <span className="font-semibold text-foreground">{origemLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Destino:</span>
              <span className="font-semibold text-foreground">{destinoLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Peso médio origem:</span>
              <span className="font-semibold text-foreground">{fmtNum(origemInfo.pesoMedio)} kg</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cenário:</span>
              <span className={`font-semibold ${isPrevisto ? 'text-orange-600' : 'text-emerald-600'}`}>
                {isPrevisto ? 'Previsto' : 'Realizado'}
              </span>
            </div>
          </div>
        </div>

        {/* ─── Botão ─── */}
        <Button
          type="submit"
          className={`w-full h-9 text-[12px] font-bold ${isPrevisto ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
          disabled={!quantidade || Number(quantidade) <= 0 || categoriaOrigem === categoriaDestino}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Registrar Reclassificação
        </Button>
      </div>
    </form>
  );
}
