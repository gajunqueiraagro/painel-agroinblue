import { useState, useMemo, useEffect } from 'react';
import { CATEGORIAS, Categoria, Lancamento, SaldoInicial, kgToArrobas } from '@/types/cattle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { useIntegerInput, useDecimalInput } from '@/hooks/useFormattedNumber';
import { RefreshCw, ArrowRight, Scale, Info } from 'lucide-react';
import { isEntrada, isSaida, isReclassificacao } from '@/lib/calculos/zootecnicos';
import { isConciliado } from '@/lib/statusOperacional';

interface Props {
  onAdicionar: (l: Omit<Lancamento, 'id'>) => void;
  dataInicial?: string;
  lancamentos?: Lancamento[];
  saldosIniciais?: SaldoInicial[];
  ano?: number;
}

/** Compute average peso and saldo for a category from lancamentos + saldos */
function computeCategoryInfo(
  categoria: Categoria,
  lancamentos: Lancamento[],
  saldosIniciais: SaldoInicial[],
  ano: number,
  cenario: 'realizado' | 'previsto',
): { saldo: number; pesoMedio: number | null } {
  // Saldo from saldo inicial
  let saldo = saldosIniciais
    .filter(s => s.ano === ano && s.categoria === categoria)
    .reduce((sum, s) => sum + s.quantidade, 0);

  let pesoTotal = saldosIniciais
    .filter(s => s.ano === ano && s.categoria === categoria)
    .reduce((sum, s) => sum + s.quantidade * (s.pesoMedioKg || 0), 0);

  // Filter lancamentos by cenario
  const lancs = cenario === 'realizado'
    ? lancamentos.filter(l => isConciliado(l))
    : lancamentos.filter(l => l.statusOperacional === 'previsto');

  for (const l of lancs) {
    if (!l.data.startsWith(String(ano))) continue;
    const peso = l.pesoMedioKg || 0;

    if (l.categoria === categoria) {
      if (isEntrada(l.tipo)) {
        saldo += l.quantidade;
        pesoTotal += l.quantidade * peso;
      } else if (isSaida(l.tipo)) {
        saldo -= l.quantidade;
        pesoTotal -= l.quantidade * peso;
      } else if (isReclassificacao(l.tipo)) {
        saldo -= l.quantidade;
        pesoTotal -= l.quantidade * peso;
      }
    }
    if (isReclassificacao(l.tipo) && l.categoriaDestino === categoria) {
      saldo += l.quantidade;
      pesoTotal += l.quantidade * peso;
    }
  }

  const pesoMedio = saldo > 0 ? pesoTotal / saldo : null;
  return { saldo: Math.max(0, saldo), pesoMedio: pesoMedio && pesoMedio > 0 ? pesoMedio : null };
}

export function ReclassificacaoForm({ onAdicionar, dataInicial, lancamentos = [], saldosIniciais = [], ano }: Props) {
  const currentYear = ano || new Date().getFullYear();
  const [categoriaOrigem, setCategoriaOrigem] = useState<Categoria>('desmama_m');
  const [categoriaDestino, setCategoriaDestino] = useState<Categoria>('garrotes');
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(dataInicial || format(new Date(), 'yyyy-MM-dd'));
  const [pesoKg, setPesoKg] = useState('');
  const [isPrevisto, setIsPrevisto] = useState(false);

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  const cenario = isPrevisto ? 'previsto' : 'realizado';

  // Compute info for origin category
  const origemInfo = useMemo(
    () => computeCategoryInfo(categoriaOrigem, lancamentos, saldosIniciais, currentYear, cenario),
    [categoriaOrigem, lancamentos, saldosIniciais, currentYear, cenario],
  );

  // Compute info for destination category
  const destinoInfo = useMemo(
    () => computeCategoryInfo(categoriaDestino, lancamentos, saldosIniciais, currentYear, cenario),
    [categoriaDestino, lancamentos, saldosIniciais, currentYear, cenario],
  );

  // Auto-suggest peso when origin changes and field is empty
  useEffect(() => {
    if (origemInfo.pesoMedio && !pesoKg) {
      setPesoKg(origemInfo.pesoMedio.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaOrigem, cenario]);

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
        <div className={`rounded-md border px-3 py-2 text-[10px] space-y-1 ${isPrevisto ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200'}`}>
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
              <span className="text-muted-foreground">Saldo origem:</span>
              <span className={`font-semibold ${origemInfo.saldo > 0 ? 'text-foreground' : 'text-red-600'}`}>
                {origemInfo.saldo} cab
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo destino:</span>
              <span className="font-semibold text-foreground">{destinoInfo.saldo} cab</span>
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
