import { useState, useMemo, useEffect } from 'react';
import { CATEGORIAS, Categoria, Lancamento, kgToArrobas } from '@/types/cattle';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { useIntegerInput, useDecimalInput, parseDecimalInput } from '@/hooks/useFormattedNumber';
import { RefreshCw, ArrowRight, Scale } from 'lucide-react';
import { STATUS_LABEL, META_VISUAL, type StatusOperacional } from '@/lib/statusOperacional';
import { usePermissions } from '@/hooks/usePermissions';
import { ReclassificacaoResumoPanel } from './ReclassificacaoResumoPanel';

interface Props {
  onAdicionar: (l: Omit<Lancamento, 'id'>) => Promise<string | undefined> | void;
  dataInicial?: string;
  lancamentos?: Lancamento[];
  ano?: number;
}

type StatusOpcao = 'realizado' | 'meta';

const STATUS_DESCRIPTIONS: Record<StatusOpcao, string> = {
  realizado: 'Operação concluída. Impacta rebanho e financeiro.',
  meta: META_VISUAL.description,
};

const STATUS_BUTTONS: { value: StatusOpcao; label: string; dot: string; activeBorder: string; activeBg: string }[] = [
  { value: 'realizado', label: STATUS_LABEL.realizado, dot: 'bg-green-600', activeBorder: 'border-green-400', activeBg: 'bg-green-50 dark:bg-green-950/30' },
  { value: 'meta', label: META_VISUAL.label, dot: META_VISUAL.dot, activeBorder: META_VISUAL.activeBorder, activeBg: META_VISUAL.activeBg },
];

// ── Form Fields Component ──

interface FormFieldsProps {
  state: ReturnType<typeof useReclassificacaoState>;
}

export function ReclassificacaoFormFields(props: FormFieldsProps) {
  const { state } = props;
  const {
    categoriaOrigem, setCategoriaOrigem,
    categoriaDestino, setCategoriaDestino,
    data, setData,
    qtdInput, pesoInput,
    statusOp, setStatusOp,
    origemInfo, setPesoKg, setPesoAutoFilled,
  } = state;

  const isMeta = statusOp === 'meta';
  const borderAccent = isMeta ? 'border-orange-400' : '';
  const { canEditMeta } = usePermissions();

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

      {/* Status selector – Realizado / META */}
      <div className="space-y-1">
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status da Operação</Label>
        <div className="grid grid-cols-2 gap-1">
          {STATUS_BUTTONS.map(s => {
            const selected = statusOp === s.value;
            const disabled = s.value === 'meta' && !canEditMeta;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => !disabled && setStatusOp(s.value)}
                disabled={disabled}
                className={`flex items-center justify-center gap-1 h-6 rounded-md border transition-all ${
                  disabled ? 'opacity-40 cursor-not-allowed border-border bg-muted/10' :
                  selected ? `${s.activeBg} ${s.activeBorder}` : 'border-border bg-muted/10 hover:bg-muted/30'
                }`}
                title={disabled ? 'Somente consultores podem criar registros META' : undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? s.dot : 'border border-muted-foreground/40 bg-transparent'}`} />
                <span className={`text-[10px] font-bold ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className={`rounded-md border px-2 py-1 text-[9px] leading-snug ${
          statusOp === 'realizado' ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300'
          : 'bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300'
        }`}>
          {STATUS_DESCRIPTIONS[statusOp]}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
        <div>
          <Label className="text-[10px] font-semibold">Origem</Label>
          <Select value={categoriaOrigem} onValueChange={v => setCategoriaOrigem(v as Categoria)}>
            <SelectTrigger className={`h-7 text-[11px] ${borderAccent}`}><SelectValue placeholder="Categoria..." /></SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1.5">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-center pt-4">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>

        <div>
          <Label className="text-[10px] font-semibold">Destino</Label>
          <Select value={categoriaDestino} onValueChange={v => setCategoriaDestino(v as Categoria)}>
            <SelectTrigger className={`h-7 text-[11px] ${borderAccent}`}><SelectValue placeholder="Categoria..." /></SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {CATEGORIAS.filter(c => c.value !== categoriaOrigem).map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1.5">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 items-end">
        <div>
          <Label className="text-[10px] font-semibold">Data</Label>
          <Input type="date" value={data} onChange={e => setData(e.target.value)} className={`h-7 text-[11px] ${borderAccent}`} />
        </div>
        <div>
          <Label className="text-[10px] font-semibold">Qtd. Cab.</Label>
          <Input type="text" inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus} placeholder="0" className={`h-7 text-[11px] text-right font-bold tabular-nums ${borderAccent}`} />
        </div>
        <div className="relative">
          <Label className="text-[10px] font-semibold">Peso (kg)</Label>
          <Input type="text" inputMode="decimal" value={pesoInput.displayValue} onChange={(e) => { pesoInput.onChange(e); setPesoAutoFilled(false); }} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus} placeholder="0,00" className={`h-7 text-[11px] text-right tabular-nums ${borderAccent}`} />
          {origemInfo && (
            <button
              type="button"
              onClick={() => { setPesoKg(String(origemInfo.pesoMedioKg)); setPesoAutoFilled(true); }}
              title={`Sugerir peso da categoria: ${fmtNum(origemInfo.pesoMedioKg)} kg`}
              className="absolute right-1 top-5 p-0.5 rounded-sm hover:bg-muted transition"
            >
              <Scale className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Hook ──

export function useReclassificacaoState({ onAdicionar, dataInicial, lancamentos, ano }: Props) {
  const [categoriaOrigem, setCategoriaOrigem] = useState<Categoria>('garrotes');
  const [categoriaDestino, setCategoriaDestino] = useState<Categoria>('bois');
  const [data, setData] = useState(dataInicial || format(new Date(), 'yyyy-MM-dd'));
  const [quantidade, setQuantidade] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [pesoAutoFilled, setPesoAutoFilled] = useState(false);
  const [statusOp, setStatusOp] = useState<StatusOpcao>('realizado');

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const origemInfo = useMemo(() => {
    if (!lancamentos || !ano) return null;
    const catLancs = lancamentos.filter(l => l.categoria === categoriaOrigem);
    if (!catLancs.length) return null;
    const totalQtd = catLancs.reduce((sum, l) => sum + l.quantidade, 0);
    const totalPeso = catLancs.reduce((sum, l) => sum + (l.pesoMedioKg || 0) * l.quantidade, 0);
    return {
      pesoMedioKg: totalQtd > 0 ? Number((totalPeso / totalQtd).toFixed(2)) : null,
    };
  }, [lancamentos, categoriaOrigem, ano]);

  useEffect(() => {
    if (origemInfo?.pesoMedioKg && !pesoKg && !pesoAutoFilled) {
      setPesoKg(String(origemInfo.pesoMedioKg));
      setPesoAutoFilled(true);
    }
  }, [origemInfo, categoriaOrigem]);

  const origemLabel = CATEGORIAS.find(c => c.value === categoriaOrigem)?.label || categoriaOrigem;
  const destinoLabel = CATEGORIAS.find(c => c.value === categoriaDestino)?.label || categoriaDestino;

  const handleSubmit = async () => {
    if (!Number(quantidade) || categoriaOrigem === categoriaDestino) return;

    const isMeta = statusOp === 'meta';
    const pesoMedioKg = parseDecimalInput(pesoKg);

    const result = await onAdicionar({
      data,
      tipo: 'reclassificacao',
      quantidade: Number(quantidade),
      categoria: categoriaOrigem,
      categoriaDestino,
      pesoMedioKg,
      pesoMedioArrobas: pesoMedioKg !== undefined ? kgToArrobas(pesoMedioKg) : undefined,
      statusOperacional: isMeta ? null : 'realizado',
    });

    if (result) {
      toast.success('Reclassificação registrada com sucesso.', {
        description: `${origemLabel} → ${destinoLabel} | ${Number(quantidade)} cab. | ${isMeta ? 'Meta' : 'Realizado'}`,
        style: isMeta ? { borderLeft: '4px solid #f97316' } : { borderLeft: '4px solid #16a34a' },
      });
      setQuantidade('');
      setPesoKg('');
      setPesoAutoFilled(false);
    } else {
      toast.error('Não foi possível registrar a reclassificação.', {
        description: 'Verifique os campos e tente novamente.',
      });
    }
  };

  return {
    categoriaOrigem, setCategoriaOrigem,
    categoriaDestino, setCategoriaDestino,
    data, setData,
    quantidade, setQuantidade,
    pesoKg, setPesoKg,
    qtdInput, pesoInput,
    statusOp, setStatusOp,
    origemInfo,
    origemLabel, destinoLabel,
    handleSubmit,
    setPesoAutoFilled,
  };
}
