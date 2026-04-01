import { useState } from 'react';
import { CATEGORIAS, Categoria, Lancamento, kgToArrobas } from '@/types/cattle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { useIntegerInput, useDecimalInput } from '@/hooks/useFormattedNumber';

interface Props {
  onAdicionar: (l: Omit<Lancamento, 'id'>) => void;
  dataInicial?: string; // yyyy-MM-dd
}

export function ReclassificacaoForm({ onAdicionar, dataInicial }: Props) {
  const [categoriaOrigem, setCategoriaOrigem] = useState<Categoria>('desmama_m');
  const [categoriaDestino, setCategoriaDestino] = useState<Categoria>('garrotes');
  const [quantidade, setQuantidade] = useState('');
  const [data, setData] = useState(dataInicial || format(new Date(), 'yyyy-MM-dd'));
  const [pesoKg, setPesoKg] = useState('');

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

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
    });

    setQuantidade('');
    setPesoKg('');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-lg p-4 shadow-sm border space-y-4">
      <div className="text-center mb-2">
        <span className="text-2xl">🔄</span>
        <p className="text-sm font-bold text-foreground">Evolução de Categoria</p>
        <p className="text-xs text-muted-foreground">Mover animais de uma categoria para outra</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="font-bold text-foreground">De (Origem)</Label>
          <Select value={categoriaOrigem} onValueChange={v => setCategoriaOrigem(v as Categoria)}>
            <SelectTrigger className="mt-1 touch-target text-base"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value} className="text-base py-1.5">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="font-bold text-foreground">Para (Destino)</Label>
          <Select value={categoriaDestino} onValueChange={v => setCategoriaDestino(v as Categoria)}>
            <SelectTrigger className="mt-1 touch-target text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.filter(c => c.value !== categoriaOrigem).map(c => (
                <SelectItem key={c.value} value={c.value} className="text-base">{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="font-bold text-foreground">Data</Label>
          <Input type="date" value={data} onChange={e => setData(e.target.value)} className="mt-1 touch-target text-base" />
        </div>
        <div>
          <Label className="font-bold text-foreground">Qtd. Cabeças</Label>
          <Input type="text" inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus} placeholder="0" min="1" className="mt-1 touch-target text-base text-center font-bold text-lg" />
        </div>
      </div>

      <div>
        <Label className="font-bold text-foreground">Peso Médio (kg) - opcional</Label>
        <Input type="text" inputMode="decimal" value={pesoInput.displayValue} onChange={pesoInput.onChange} onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus} placeholder="0,00" className="mt-1 touch-target text-base" />
      </div>

      <Button type="submit" className="w-full touch-target text-base font-bold" size="lg">
        🔄 Registrar Reclassificação
      </Button>
    </form>
  );
}
