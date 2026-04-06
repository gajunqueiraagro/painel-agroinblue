import { useState, useMemo, useEffect } from 'react';
import { CATEGORIAS, Categoria, Lancamento, kgToArrobas } from '@/types/cattle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { useIntegerInput, useDecimalInput } from '@/hooks/useFormattedNumber';
import { RefreshCw, ArrowRight, Scale } from 'lucide-react';
import { STATUS_LABEL, type StatusOperacional } from '@/lib/statusOperacional';
import { ReclassificacaoResumoPanel } from './ReclassificacaoResumoPanel';

interface Props {
  onAdicionar: (l: Omit<Lancamento, 'id'>) => void;
  dataInicial?: string;
  lancamentos?: Lancamento[];
  ano?: number;
}

const STATUS_DESCRIPTIONS: Record<StatusOperacional, string> = {
  previsto: 'Planejamento (meta). Gera lançamentos previstos que alimentam o fluxo projetado.',
  confirmado: 'Operação já definida, ainda não executada. Quando concluída, alterar para Realizado.',
  conciliado: 'Operação já realizada. Impacta rebanho e financeiro real.',
};

const STATUS_BUTTONS: { value: StatusOperacional; dot: string; activeBorder: string; activeBg: string }[] = [
  { value: 'conciliado', dot: 'bg-green-600', activeBorder: 'border-green-400', activeBg: 'bg-green-50 dark:bg-green-950/30' },
  { value: 'previsto', dot: 'bg-orange-500', activeBorder: 'border-orange-400', activeBg: 'bg-orange-50 dark:bg-orange-950/30' },
];

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

/** Form fields (center column) */
export function ReclassificacaoFormFields(props: Props & {
  state: ReturnType<typeof useReclassificacaoState>;
}) {
  const { state } = props;
  const {
    categoriaOrigem, setCategoriaOrigem,
    categoriaDestino, setCategoriaDestino,
    data, setData,
    qtdInput, pesoInput,
    statusOp, setStatusOp,
    origemInfo, setPesoKg,
  } = state;

  const isPrevisto = statusOp === 'previsto';
  const borderAccent = isPrevisto ? 'border-orange-400' : '';

  const fmtNum = (v: number | null, dec = 1) =>
    v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';

  return (
    <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-[12px] font-bold text-foreground">Evolução de Categoria</span>
        </div>
      </div>

      {/* Status selector – same pattern as Venda/Abate/Transferência */}
      <div className="space-y-1">
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status da Operação</Label>
        <div className="grid grid-cols-3 gap-1">
          {STATUS_BUTTONS.map(s => {
            const selected = statusOp === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatusOp(s.value)}
                className={`flex items-center justify-center gap-1 h-6 rounded-md border transition-all ${
                  selected ? `${s.activeBg} ${s.activeBorder}` : 'border-border bg-muted/10 hover:bg-muted/30'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? s.dot : 'border border-muted-foreground/40 bg-transparent'}`} />
                <span className={`text-[10px] font-bold ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>{STATUS_LABEL[s.value]}</span>
              </button>
            );
          })}
        </div>
        <div className={`rounded-md border px-2 py-1 text-[9px] leading-snug ${
          statusOp === 'conciliado' ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300'
          : statusOp === 'previsto' ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300'
          : 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300'
        }`}>
          {STATUS_DESCRIPTIONS[statusOp]}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
        <div>
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">De (Origem)</Label>
          <Select value={categoriaOrigem} onValueChange={v => { setCategoriaOrigem(v as Categoria); setPesoKg(''); }}>
            <SelectTrigger className={`mt-0.5 h-8 text-[11px] ${borderAccent}`}><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-52">
              {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px]">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mb-1.5" />
        <div>
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Para (Destino)</Label>
          <Select value={categoriaDestino} onValueChange={v => setCategoriaDestino(v as Categoria)}>
            <SelectTrigger className={`mt-0.5 h-8 text-[11px] ${borderAccent}`}><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-52">
              {CATEGORIAS.filter(c => c.value !== categoriaOrigem).map(c => (
                <SelectItem key={c.value} value={c.value} className="text-[11px]">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Data</Label>
          <Input type="date" value={data} onChange={e => setData(e.target.value)} className={`mt-0.5 h-8 text-[11px] ${borderAccent}`} />
        </div>
        <div>
          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Qtd. Cabeças</Label>
          <Input type="text" inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus} placeholder="0" className={`mt-0.5 h-8 text-[11px] text-center font-bold ${borderAccent}`} />
        </div>
      </div>

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
        <Input type="text" inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus} placeholder={origemInfo.pesoMedio ? fmtNum(origemInfo.pesoMedio) : '0,00'} className={`mt-0.5 h-8 text-[11px] ${borderAccent}`} />
      </div>
    </div>
  );
}

/** Shared state hook for the reclassificacao form */
export function useReclassificacaoState(props: Props) {
  const { onAdicionar, dataInicial, lancamentos = [], ano } = props;
  const [categoriaOrigem, setCategoriaOrigem] = useState<Categoria>('desmama_m');
  const [categoriaDestino, setCategoriaDestino] = useState<Categoria>('garrotes');
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(dataInicial || format(new Date(), 'yyyy-MM-dd'));
  const [pesoKg, setPesoKg] = useState('');
  const [statusOp, setStatusOp] = useState<StatusOperacional>('conciliado');
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
  const canRegister = !!quantidade && Number(quantidade) > 0 && categoriaOrigem !== categoriaDestino;

  const handleRegister = () => {
    if (!canRegister) return;
    setSubmitting(true);
    onAdicionar({
      data,
      tipo: 'reclassificacao',
      quantidade: Number(quantidade),
      categoria: categoriaOrigem,
      categoriaDestino,
      pesoMedioKg: pesoKg ? Number(pesoKg) : undefined,
      pesoMedioArrobas: pesoKg ? kgToArrobas(Number(pesoKg)) : undefined,
      statusOperacional: statusOp,
    });
    setQuantidade('');
    setPesoKg('');
    setSubmitting(false);
  };

  return {
    categoriaOrigem, setCategoriaOrigem,
    categoriaDestino, setCategoriaDestino,
    quantidade, setQuantidade,
    data, setData,
    pesoKg, setPesoKg,
    statusOp, setStatusOp,
    submitting,
    qtdInput, pesoInput,
    origemInfo, origemLabel, destinoLabel,
    canRegister, handleRegister,
  };
}
