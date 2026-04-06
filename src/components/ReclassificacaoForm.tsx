import { useState, useMemo, useEffect } from 'react';
import { CATEGORIAS, Categoria, Lancamento, kgToArrobas } from '@/types/cattle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { useIntegerInput, useDecimalInput } from '@/hooks/useFormattedNumber';
import { RefreshCw, ArrowRight, Scale } from 'lucide-react';
import { ReclassificacaoResumoPanel } from './ReclassificacaoResumoPanel';

interface Props {
  onAdicionar: (l: Omit<Lancamento, 'id'>) => void;
  dataInicial?: string;
  lancamentos?: Lancamento[];
  ano?: number;
}

function deriveCategoryInfo(
  categoria: Categoria,
  lancamentos: Lancamento[],
): { pesoMedio: number | null } {
  const sorted = [...lancamentos]
    .filter(l => l.categoria === categoria && l.pesoMedioKg && l.pesoMedioKg > 0)
    .sort((a, b) => b.data.localeCompare(a.data));

  if (sorted.length === 0) return { pesoMedio: null };

  const recent = sorted.slice(0, 5);
  let totalPeso = 0;
  let totalQtd = 0;
  for (const l of recent) {
    totalPeso += (l.pesoMedioKg || 0) * l.quantidade;
    totalQtd += l.quantidade;
  }
  return { pesoMedio: totalQtd > 0 ? totalPeso / totalQtd : null };
}

export function ReclassificacaoForm({ onAdicionar, dataInicial, lancamentos = [], ano }: Props) {
  const [categoriaOrigem, setCategoriaOrigem] = useState<Categoria>('desmama_m');
  const [categoriaDestino, setCategoriaDestino] = useState<Categoria>('garrotes');
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(dataInicial || format(new Date(), 'yyyy-MM-dd'));
  const [pesoKg, setPesoKg] = useState('');
  const [isPrevisto, setIsPrevisto] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const origemInfo = useMemo(() => deriveCategoryInfo(categoriaOrigem, lancamentos), [categoriaOrigem, lancamentos]);

  useEffect(() => {
    if (origemInfo.pesoMedio && !pesoKg) {
      setPesoKg(origemInfo.pesoMedio.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaOrigem]);

  const origemLabel = CATEGORIAS.find(c => c.value === categoriaOrigem)?.label || '';
  const destinoLabel = CATEGORIAS.find(c => c.value === categoriaDestino)?.label || '';

  const fmtNum = (v: number | null, dec = 1) =>
    v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';

  const handleRegister = () => {
    if (!quantidade || Number(quantidade) <= 0) return;
    if (categoriaOrigem === categoriaDestino) return;
    setSubmitting(true);

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
    setSubmitting(false);
  };

  const canRegister = !!quantidade && Number(quantidade) > 0 && categoriaOrigem !== categoriaDestino;

  return {
    form: (
      <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
        {/* Header with toggle */}
        <div className="flex items-center justify-between pb-1 border-b border-border/60">
          <div className="flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-[12px] font-bold text-foreground">Evolução de Categoria</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold ${!isPrevisto ? 'text-emerald-600' : 'text-muted-foreground'}`}>
              Realizado
            </span>
            <Switch
              checked={isPrevisto}
              onCheckedChange={setIsPrevisto}
              className="data-[state=checked]:bg-orange-500 h-4 w-8"
            />
            <span className={`text-[10px] font-semibold ${isPrevisto ? 'text-orange-600' : 'text-muted-foreground'}`}>
              Previsto
            </span>
          </div>
        </div>

        {/* Origem → Destino */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">De (Origem)</Label>
            <Select value={categoriaOrigem} onValueChange={v => { setCategoriaOrigem(v as Categoria); setPesoKg(''); }}>
              <SelectTrigger className="mt-0.5 h-8 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-52">
                {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px]">{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mb-1.5" />
          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Para (Destino)</Label>
            <Select value={categoriaDestino} onValueChange={v => setCategoriaDestino(v as Categoria)}>
              <SelectTrigger className="mt-0.5 h-8 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-52">
                {CATEGORIAS.filter(c => c.value !== categoriaOrigem).map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-[11px]">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data + Quantidade */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Data</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} className="mt-0.5 h-8 text-[11px]" />
          </div>
          <div>
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Qtd. Cabeças</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={qtdInput.displayValue}
              onChange={qtdInput.onChange}
              onBlur={qtdInput.onBlur}
              onFocus={qtdInput.onFocus}
              placeholder="0"
              className="mt-0.5 h-8 text-[11px] text-center font-bold"
            />
          </div>
        </div>

        {/* Peso médio */}
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Peso Médio (kg)</Label>
            {origemInfo.pesoMedio && (
              <span className="text-[9px] text-orange-600 flex items-center gap-0.5">
                <Scale className="h-2.5 w-2.5" />
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
            className="mt-0.5 h-8 text-[11px]"
          />
        </div>
      </div>
    ),
    resumoPanel: (
      <ReclassificacaoResumoPanel
        quantidade={Number(quantidade) || 0}
        pesoKg={Number(pesoKg) || 0}
        origemLabel={origemLabel}
        destinoLabel={destinoLabel}
        pesoMedioOrigem={origemInfo.pesoMedio}
        isPrevisto={isPrevisto}
        onRequestRegister={handleRegister}
        submitting={submitting}
        canRegister={canRegister}
      />
    ),
  };
}
